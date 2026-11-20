import os
import json
import sys
import unittest
from unittest.mock import Mock, patch
from urllib.error import URLError
from urllib.parse import parse_qs

sys.path.insert(0, os.path.dirname(__file__))

from captcha import CaptchaError, CaptchaUnavailable, captcha_configured, captcha_required, verify_turnstile

CONFIG = {
    "TURNSTILE_SECRET_KEY": "test-secret",
    "TURNSTILE_SITE_KEY": "test-site-key",
    "TURNSTILE_ALLOWED_HOSTNAMES": "aprendeia.example, www.aprendeia.example",
    "TURNSTILE_VERIFICATION_MODE": "backend",
}


class CaptchaTests(unittest.TestCase):
    def test_local_environment_does_not_require_captcha(self):
        with patch.dict(os.environ, {}, clear=True):
            verify_turnstile(None)

    def test_configured_environment_requires_token(self):
        with patch.dict(os.environ, CONFIG, clear=True):
            with self.assertRaises(CaptchaError):
                verify_turnstile(None)

    def test_production_without_secret_fails_closed(self):
        for environment in (
            {"RAILWAY_ENVIRONMENT_NAME": "production"},
            {"RAILWAY_ENVIRONMENT": "Production"},
            {"TURNSTILE_REQUIRED": "true"},
        ):
            with self.subTest(environment=environment), patch.dict(os.environ, environment, clear=True):
                self.assertTrue(captcha_required())
                with self.assertRaises(CaptchaUnavailable):
                    verify_turnstile("qualquer-token")

    def test_other_railway_environments_keep_local_behavior(self):
        with patch.dict(os.environ, {"RAILWAY_ENVIRONMENT_NAME": "staging", "TURNSTILE_REQUIRED": "false"}, clear=True):
            self.assertFalse(captcha_required())
            verify_turnstile(None)

    def test_all_production_markers_override_explicit_false(self):
        for key in ("APP_ENV", "ENVIRONMENT", "NODE_ENV", "ENV", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT"):
            with self.subTest(key=key), patch.dict(os.environ, {key: " Production ", "TURNSTILE_REQUIRED": "false"}, clear=True):
                self.assertTrue(captcha_required())
                with self.assertRaises(CaptchaUnavailable):
                    verify_turnstile(None)

    def test_every_configuration_field_is_required_before_network(self):
        for missing in CONFIG:
            env = {**CONFIG, "APP_ENV": "production", missing: " "}
            with self.subTest(missing=missing), patch.dict(os.environ, env, clear=True), patch("captcha.urlopen") as send:
                self.assertFalse(captcha_configured())
                with self.assertRaises(CaptchaUnavailable):
                    verify_turnstile("token")
                send.assert_not_called()

    def test_partial_local_configuration_cannot_disable_security(self):
        with patch.dict(os.environ, {"TURNSTILE_SITE_KEY": "public-key"}, clear=True):
            with self.assertRaises(CaptchaUnavailable):
                verify_turnstile(None)

    def test_invalid_hostname_configuration_fails_closed(self):
        for host in ("", "   ", "*.example.com", "https://example.com", "example.com:443", "example.com/path", "example.com,", "example.com,,www.example.com", "-example.com"):
            with self.subTest(host=host), patch.dict(os.environ, {**CONFIG, "TURNSTILE_ALLOWED_HOSTNAMES": host}, clear=True):
                self.assertFalse(captcha_configured())
                with self.assertRaises(CaptchaUnavailable):
                    verify_turnstile("token")

    def provider(self, result):
        response = Mock()
        response.read.return_value = json.dumps(result).encode()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response

    def test_success_is_bound_to_server_action_and_exact_hostname(self):
        for action in ("login", "signup", "recovery"):
            with self.subTest(action=action), patch.dict(os.environ, CONFIG, clear=True), patch(
                "captcha.urlopen", return_value=self.provider({"success": True, "hostname": "WWW.AprendeIA.example.", "action": action})
            ) as send:
                verify_turnstile(" token ", "203.0.113.2", expected_action=action)
                self.assertEqual(send.call_count, 1)
                request = send.call_args.args[0]
                self.assertEqual(request.full_url, "https://challenges.cloudflare.com/turnstile/v0/siteverify")
                self.assertEqual(parse_qs(request.data.decode()), {
                    "secret": ["test-secret"], "response": ["token"], "remoteip": ["203.0.113.2"],
                })
                self.assertEqual(send.call_args.kwargs["timeout"], 5)

    def test_wrong_or_missing_hostname_and_action_are_rejected(self):
        for change in ({"hostname": "aprendeia.example.evil.test"}, {"hostname": "evil.test"},
                       {"hostname": None}, {"hostname": ""}, {"action": "signup"}, {"action": None}):
            result = {"success": True, "hostname": "aprendeia.example", "action": "login", **change}
            with self.subTest(change=change), patch.dict(os.environ, CONFIG, clear=True), patch("captcha.urlopen", return_value=self.provider(result)):
                with self.assertRaises(CaptchaError):
                    verify_turnstile("token")

    def test_missing_and_oversized_tokens_never_reach_provider(self):
        for token in (None, "", "  ", "x" * 2049, 42):
            with self.subTest(token_type=type(token).__name__), patch.dict(os.environ, CONFIG, clear=True), patch("captcha.urlopen") as send:
                with self.assertRaises(CaptchaError):
                    verify_turnstile(token)
                send.assert_not_called()

    def test_invalid_action_is_configuration_error(self):
        with patch.dict(os.environ, CONFIG, clear=True), patch("captcha.urlopen") as send:
            with self.assertRaises(CaptchaUnavailable):
                verify_turnstile("token", expected_action="arbitrary")
            send.assert_not_called()

    def test_provider_failure_is_unavailable_and_does_not_retry_consumed_token(self):
        for error in (URLError("offline"), TimeoutError(), OSError("socket closed")):
            with self.subTest(error=type(error).__name__), patch.dict(os.environ, CONFIG, clear=True), patch("captcha.urlopen", side_effect=error) as send:
                with self.assertRaises(CaptchaUnavailable):
                    verify_turnstile("private-token")
                self.assertEqual(send.call_count, 1)

    def test_invalid_provider_response_is_safe(self):
        for result in (None, [], "success", {}, {"success": "true"}, {"success": 1}):
            with self.subTest(result=result), patch.dict(os.environ, CONFIG, clear=True), patch("captcha.urlopen", return_value=self.provider(result)):
                with self.assertRaises(CaptchaUnavailable):
                    verify_turnstile("private-token")

    def test_malformed_json_and_encoding_fail_closed(self):
        for body in (b"not json", b"\xff"):
            response = self.provider({})
            response.read.return_value = body
            with self.subTest(body=body), patch.dict(os.environ, CONFIG, clear=True), patch("captcha.urlopen", return_value=response):
                with self.assertRaises(CaptchaUnavailable):
                    verify_turnstile("private-token")

    def test_provider_configuration_errors_are_unavailable(self):
        for code in ("invalid-input-secret", "missing-input-secret", "internal-error"):
            with self.subTest(code=code), patch.dict(os.environ, CONFIG, clear=True), patch(
                "captcha.urlopen", return_value=self.provider({"success": False, "error-codes": [code]})
            ):
                with self.assertRaises(CaptchaUnavailable) as caught:
                    verify_turnstile("private-token")
                self.assertNotIn("private-token", str(caught.exception))
                self.assertNotIn("test-secret", str(caught.exception))

    def test_expired_or_replayed_token_is_rejected_without_retry(self):
        with patch.dict(os.environ, CONFIG, clear=True), patch(
            "captcha.urlopen", return_value=self.provider({"success": False, "error-codes": ["timeout-or-duplicate"]})
        ) as send:
            with self.assertRaises(CaptchaError) as caught:
                verify_turnstile("token")
            self.assertNotIsInstance(caught.exception, CaptchaUnavailable)
            self.assertEqual(send.call_count, 1)


class CaptchaRouteTests(unittest.TestCase):
    def test_production_startup_refuses_incomplete_configuration(self):
        from fastapi.testclient import TestClient
        from main import app

        with patch.dict(os.environ, {"APP_ENV": "production"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "segurança não configurada"):
                with TestClient(app):
                    pass

    def test_production_startup_accepts_complete_configuration(self):
        from fastapi.testclient import TestClient
        from main import app

        with patch.dict(os.environ, {**CONFIG, "APP_ENV": "production"}, clear=True):
            with TestClient(app) as client:
                self.assertEqual(client.get("/health/live").status_code, 200)

    def test_supabase_mode_never_consumes_token_locally_and_uses_public_client(self):
        from main import LoginRequest, authenticate_with_password

        env = {**CONFIG, "TURNSTILE_VERIFICATION_MODE": "supabase", "APP_ENV": "production",
               "SUPABASE_URL": "https://auth.example.test", "SUPABASE_PUBLISHABLE_KEY": "public-test-key"}
        with patch.dict(os.environ, env, clear=True), patch("captcha.urlopen") as siteverify, \
                patch("main.create_client") as create, patch("main.database") as privileged:
            verify_turnstile(" token ", expected_action="login")
            authenticate_with_password(LoginRequest(email="aluno@example.test", password="Senha123", captcha_token=" token "))
            siteverify.assert_not_called()
            privileged.assert_not_called()
            self.assertEqual(create.call_args.args, (env["SUPABASE_URL"], "public-test-key"))
            create.return_value.auth.sign_in_with_password.assert_called_once_with({
                "email": "aluno@example.test", "password": "Senha123", "options": {"captcha_token": "token"},
            })

    def test_backend_mode_does_not_forward_consumed_token(self):
        from main import LoginRequest, authenticate_with_password

        with patch.dict(os.environ, CONFIG, clear=True), patch("main.database") as db:
            authenticate_with_password(LoginRequest(email="aluno@example.test", password="Senha123", captcha_token="consumed-token"))
            db.return_value.auth.sign_in_with_password.assert_called_once_with({
                "email": "aluno@example.test", "password": "Senha123",
            })

    def test_supabase_mode_requires_public_key_and_token_without_siteverify(self):
        for overrides in ({"SUPABASE_PUBLISHABLE_KEY": ""}, {"SUPABASE_PUBLISHABLE_KEY": "public-test-key"}):
            env = {**CONFIG, "TURNSTILE_VERIFICATION_MODE": "supabase", **overrides}
            with self.subTest(overrides=overrides), patch.dict(os.environ, env, clear=True), patch("captcha.urlopen") as send:
                with self.assertRaises(CaptchaError):
                    verify_turnstile(None)
                send.assert_not_called()

    def test_supabase_mode_requires_hostname_but_does_not_claim_local_auth_validation(self):
        env = {**CONFIG, "TURNSTILE_VERIFICATION_MODE": "supabase", "APP_ENV": "production",
               "SUPABASE_PUBLISHABLE_KEY": "public-test-key"}
        with patch.dict(os.environ, {**env, "TURNSTILE_ALLOWED_HOSTNAMES": ""}, clear=True):
            self.assertFalse(captcha_configured())
            with self.assertRaises(CaptchaUnavailable):
                verify_turnstile("token", expected_action="recovery")
        with patch.dict(os.environ, env, clear=True), patch("captcha.urlopen") as siteverify:
            verify_turnstile(" token ", expected_action="recovery")
            siteverify.assert_not_called()

    def test_production_login_without_secret_is_503_and_skips_authentication(self):
        from fastapi.testclient import TestClient
        from main import app

        db = Mock()
        with patch.dict(os.environ, {"RAILWAY_ENVIRONMENT_NAME": "production", "RATE_LIMIT_PEPPER": "p" * 64}, clear=True), \
                patch("main.database", return_value=db), patch("main.persist_access_audit"):
            response = TestClient(app).post("/auth/login", json={"email": "aluno@escola.com", "password": "Senha1"})
        self.assertEqual(response.status_code, 503)
        db.auth.sign_in_with_password.assert_not_called()

    def test_readiness_reports_missing_secret_in_production(self):
        from fastapi.testclient import TestClient
        from main import app

        with patch.dict(os.environ, {"RAILWAY_ENVIRONMENT_NAME": "production"}, clear=True), \
                patch("main.supabase_configured", return_value=True), patch("main.database"):
            response = TestClient(app).get("/health/ready")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("TURNSTILE", response.text)


if __name__ == "__main__":
    unittest.main()
