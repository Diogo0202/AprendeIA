import os
import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

sys.path.insert(0, os.path.dirname(__file__))

from auth_security import client_network, normalize_login_email, rate_limit_hash
from main import app


class FakeRpcResult:
    """Imita só a parte do cliente Supabase usada pelo limite de login."""

    def __init__(self, database, name, params):
        self.database = database
        self.name = name
        self.params = params

    def execute(self):
        with self.database.lock:
            return self._execute_locked()

    def _execute_locked(self):
        key_kind = self.params.get("p_key_kind", "identity")
        key = (key_kind, self.params["p_key_hash"])
        attempts = self.database.attempts.get(key, 0)

        if self.name == "login_rate_limit_status":
            allowed = attempts < self.database.limits.get(key, 4)
            return SimpleNamespace(
                data=[
                    {
                        "allowed": allowed,
                        "failed_attempts": attempts,
                        "retry_after_seconds": 900 if not allowed else 0,
                    }
                ]
            )

        if self.name == "reserve_login_attempt":
            maximum = self.params["p_max_attempts"]
            if attempts >= self.database.limits.get(key, maximum):
                return SimpleNamespace(
                    data=[
                        {
                            "allowed": False,
                            "failed_attempts": attempts,
                            "retry_after_seconds": 900,
                        }
                    ]
                )
            attempts += 1
            self.database.attempts[key] = attempts
            self.database.limits[key] = maximum
            return SimpleNamespace(
                data=[
                    {
                        "allowed": True,
                        "failed_attempts": attempts,
                        "retry_after_seconds": 900 if attempts >= maximum else 0,
                    }
                ]
            )

        if self.name == "record_login_failure":
            maximum = self.params["p_max_attempts"]
            attempts = min(attempts + 1, maximum)
            self.database.attempts[key] = attempts
            self.database.limits[key] = maximum
            return SimpleNamespace(
                data=[
                    {
                        "allowed": attempts < maximum,
                        "failed_attempts": attempts,
                        "retry_after_seconds": 900 if attempts >= maximum else 0,
                    }
                ]
            )

        if self.name == "clear_login_failures":
            self.database.attempts.pop(key, None)
            self.database.cleared.append(key)
            return SimpleNamespace(data=None)

        raise AssertionError(f"RPC inesperada no teste: {self.name}")


class FakeRateLimitDatabase:
    """Mantém os contadores em memória para testar a regra sem tocar no banco real."""

    def __init__(self):
        self.attempts = {}
        self.limits = {}
        self.cleared = []
        self.seen_hashes = []
        self.lock = threading.Lock()

    def rpc(self, name, params):
        self.seen_hashes.append(params.get("p_key_hash"))
        return FakeRpcResult(self, name, params)


class LoginRateLimitTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.database = FakeRateLimitDatabase()
        self.environment = {"RATE_LIMIT_PEPPER": "p" * 64}

    def test_fourth_invalid_login_blocks_the_identity(self):
        """As três primeiras falhas são negadas e a quarta inicia o bloqueio."""

        calls = 0

        def invalid_credentials(_credentials):
            nonlocal calls
            calls += 1
            raise AuthApiError("Invalid login credentials", 400, None)

        with patch.dict(os.environ, self.environment, clear=True):
            with patch("main.database", return_value=self.database):
                with patch("main.authenticate_with_password", side_effect=invalid_credentials):
                    responses = [
                        self.client.post(
                            "/auth/login",
                            json={"email": "aluno@escola.com", "password": "errada"},
                        )
                        for _ in range(5)
                    ]

        self.assertEqual([response.status_code for response in responses], [401, 401, 401, 429, 429])
        self.assertEqual(calls, 4)
        self.assertEqual(responses[3].headers["Retry-After"], "900")

    def test_parallel_requests_never_reach_authentication_more_than_four_times(self):
        """Uma rajada simultânea não pode passar pelo contador ainda vazio."""

        calls = 0
        calls_lock = threading.Lock()

        def invalid_credentials(_credentials):
            nonlocal calls
            with calls_lock:
                calls += 1
            time.sleep(0.02)
            raise AuthApiError("Invalid login credentials", 400, None)

        def attempt(_number):
            with TestClient(app) as client:
                return client.post(
                    "/auth/login",
                    json={"email": "paralelo@escola.com", "password": "errada"},
                ).status_code

        with patch.dict(os.environ, self.environment, clear=True):
            with patch("main.database", return_value=self.database):
                with patch("main.authenticate_with_password", side_effect=invalid_credentials):
                    with ThreadPoolExecutor(max_workers=10) as pool:
                        statuses = list(pool.map(attempt, range(10)))

        self.assertEqual(calls, 4)
        self.assertEqual(statuses.count(401), 3)
        self.assertEqual(statuses.count(429), 7)

    def test_login_identity_is_normalized_and_never_stored_as_plain_text(self):
        """Variações do e-mail apontam para o mesmo hash, sem guardar o endereço."""

        secret = "s" * 64
        first = rate_limit_hash("identity", normalize_login_email(" Aluno@Escola.COM "), secret)
        second = rate_limit_hash("identity", normalize_login_email("aluno@escola.com"), secret)

        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)
        self.assertNotIn("aluno", first)
        self.assertRegex(first, r"^[0-9a-f]{64}$")

    def test_proxy_header_is_ignored_when_the_connection_is_not_trusted(self):
        """Um cliente comum não pode trocar de contador enviando um IP falso."""

        request = Request(
            {
                "type": "http",
                "client": ("203.0.113.10", 1234),
                "headers": [(b"x-real-ip", b"198.51.100.20")],
            }
        )

        self.assertEqual(client_network(request, "100.0.0.0/8"), "203.0.113.10")

    def test_trusted_proxy_can_forward_the_real_client_ip(self):
        """No deploy, só a rede interna declarada pode informar o IP original."""

        request = Request(
            {
                "type": "http",
                "client": ("100.64.0.8", 1234),
                "headers": [(b"x-real-ip", b"203.0.113.20")],
            }
        )

        self.assertEqual(client_network(request, "100.0.0.0/8"), "203.0.113.20")

    def test_invalid_proxy_network_fails_closed(self):
        """Uma rede escrita de forma errada não deve liberar uma configuração insegura."""

        request = Request({"type": "http", "client": ("100.64.0.8", 1234), "headers": []})

        with self.assertRaises(HTTPException) as error:
            client_network(request, "rede-invalida")

        self.assertEqual(error.exception.status_code, 503)

    def test_missing_server_secret_fails_closed(self):
        """Sem um segredo forte, o sistema não pode liberar login sem proteção."""

        with patch.dict(os.environ, {}, clear=True):
            with patch("main.database", return_value=self.database):
                response = self.client.post(
                    "/auth/login",
                    json={"email": "aluno@escola.com", "password": "senha"},
                )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.database.seen_hashes, [])

    def test_successful_login_clears_the_identity_counter(self):
        """Um acesso correto começa uma contagem nova para aquela conta."""

        auth_response = SimpleNamespace(
            session=SimpleNamespace(
                access_token="access-token",
                refresh_token="refresh-token",
                expires_in=3600,
                token_type="bearer",
            )
        )
        identity_hash = rate_limit_hash("identity", "aluno@escola.com", self.environment["RATE_LIMIT_PEPPER"])
        self.database.attempts[("identity", identity_hash)] = 2
        self.database.limits[("identity", identity_hash)] = 4

        with patch.dict(os.environ, self.environment, clear=True):
            with patch("main.database", return_value=self.database):
                with patch("main.authenticate_with_password", return_value=auth_response):
                    response = self.client.post(
                        "/auth/login",
                        json={"email": "aluno@escola.com", "password": "correta"},
                    )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["access_token"], "access-token")
        self.assertNotIn(("identity", identity_hash), self.database.attempts)
        self.assertIn(("identity", identity_hash), self.database.cleared)
        self.assertEqual(response.headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
