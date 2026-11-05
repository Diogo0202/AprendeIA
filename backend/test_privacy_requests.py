"""Exercita HTTP e isolamento sem chamar Auth, SMTP ou bancos externos."""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(__file__))
from privacy_requests import PrivacyRequestCreate, PrivacyRequestResolve, register_privacy_routes, personal_export


class Query:
    """Preserva filtros e projeção para que o teste detecte vazamento entre contas."""

    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters, self.fields, self.slice, self.payload = [], "*", None, None

    def select(self, fields):
        self.fields = fields
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        self.db.owner_filters.append((self.table, column, value))
        return self

    def in_(self, column, values):
        self.filters.append((column, set(values)))
        return self

    def gt(self, column, value):
        self.filters.append((column, ("gt", value)))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, value):
        self.slice = (0, value)
        return self

    def range(self, start, end):
        self.slice = (start, end + 1)
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.db.failure:
            raise self.db.failure
        if self.payload is not None:
            row = {
                "id": str(uuid4()), "status": "pending", "response": "", "resolved_at": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=6)).isoformat(), **self.payload,
            }
            self.db.rows.setdefault(self.table, []).append(row)
            return SimpleNamespace(data=[row])
        rows = [row for row in self.db.rows.get(self.table, []) if all(
            row.get(key, "") > value[1] if isinstance(value, tuple) else
            row.get(key) in value if isinstance(value, set) else row.get(key) == value for key, value in self.filters
        )]
        if self.slice:
            rows = rows[self.slice[0]:self.slice[1]]
        fields = self.fields.split(",")
        return SimpleNamespace(data=[{key: value for key, value in row.items() if self.fields == "*" or key in fields} for row in rows])


class Database:
    def __init__(self):
        self.rows, self.owner_filters, self.rpc_calls = {}, [], []
        self.failure = None
        self.rpc_result = {"status": "completed"}

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, payload):
        self.rpc_calls.append((name, payload))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=self.rpc_result))


class PrivacyRequestTests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.user = {"id": str(uuid4()), "role": "student", "privacy_policy_version": None}
        self.other = str(uuid4())
        self.limit = Mock()

        def admin():
            if self.user["role"] != "admin":
                raise HTTPException(403, "Somente administração.")
            return self.user

        app = FastAPI()
        register_privacy_routes(
            app,
            database=lambda: self.db, user_dependency=lambda: self.user, admin_dependency=admin,
            enforce_limit=self.limit, identity_hash=lambda _email: "a" * 64,
        )
        self.client = TestClient(app)

    def add_request(self, *, owner=None, kind="access", status="pending"):
        row = {
            "id": str(uuid4()), "user_id": owner or self.user["id"], "kind": kind, "status": status,
            "details": "Meu pedido", "corrections": {}, "response": "", "resolved_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=6)).isoformat(),
        }
        self.db.rows.setdefault("privacy_requests", []).append(row)
        return row

    def test_request_owner_always_comes_from_session(self):
        denied = self.client.post("/privacy/requests", json={"kind": "access", "user_id": self.other})
        self.assertEqual(denied.status_code, 422)
        accepted = self.client.post("/privacy/requests", json={"kind": "access"})
        self.assertEqual(accepted.status_code, 201)
        self.assertEqual(accepted.json()["user_id"], self.user["id"])
        self.limit.assert_called_with(self.db, self.user["id"], "privacy_request_write")

    def test_rights_are_available_even_without_current_policy_acceptance(self):
        self.assertEqual(self.client.get("/privacy/requests").status_code, 200)
        from main import app, current_user_pending_privacy
        route = next(route for route in app.routes if route.path == "/privacy/requests" and "GET" in route.methods)
        self.assertIs(route.dependant.dependencies[0].call, current_user_pending_privacy)

    def test_listing_never_returns_other_users_request(self):
        own = self.add_request()
        self.add_request(owner=self.other)
        result = self.client.get("/privacy/requests")
        self.assertEqual([row["id"] for row in result.json()], [own["id"]])

    def test_main_routes_require_an_authenticated_session(self):
        from main import app
        from unittest.mock import patch
        with patch("main.supabase_configured", return_value=True), patch("main.persist_access_audit"):
            self.assertEqual(TestClient(app).get("/privacy/requests").status_code, 401)

    def test_export_cannot_cross_user_boundary_or_bypass_review(self):
        other = self.add_request(owner=self.other, status="completed")
        own = self.add_request()
        self.assertEqual(self.client.get(f'/privacy/requests/{other["id"]}/export').status_code, 404)
        self.assertEqual(self.client.get(f'/privacy/requests/{own["id"]}/export').status_code, 409)

    def test_export_filters_each_table_and_omits_auth_secrets(self):
        row = self.add_request(status="completed")
        self.db.rows["profiles"] = [{"id": self.user["id"], "full_name": "Ana", "password": "never-export"}]
        self.db.rows["question_attempts"] = [
            {"id": "own", "student_id": self.user["id"], "correct": True},
            {"id": "other", "student_id": self.other, "correct": False},
        ]
        result = self.client.get(f'/privacy/requests/{row["id"]}/export')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.headers["cache-control"], "no-store")
        self.assertIn("attachment", result.headers["content-disposition"])
        self.assertNotIn("never-export", result.text)
        self.assertEqual(result.json()["data"]["question_attempts"], [{"id": "own", "correct": True}])
        for table, column, owner in self.db.owner_filters:
            if table != "privacy_requests" or column != "id":
                self.assertEqual(owner, self.user["id"])

    def test_export_includes_new_personal_records_without_peers(self):
        for table, owner, record in (
            ('gamification_events', 'student_id', {'event_kind': 'lesson', 'event_key': 'lesson1', 'xp': 100}),
            ('student_achievements', 'student_id', {'achievement_id': 'first_lesson'}),
            ('leaderboard_preferences', 'student_id', {'alias': 'Cometa', 'school_opt_in': False}),
            ('account_admissions', 'user_id', {'id': 'own-request', 'decision': 'pending'}),
        ):
            self.db.rows[table] = [{owner: self.user['id'], **record}, {owner: self.other, 'private_peer_data': 'not-exported'}]
        result = personal_export(self.db, self.user['id'])
        for table in ('gamification_events', 'student_achievements', 'leaderboard_preferences', 'account_admissions'):
            self.assertEqual(len(result['data'][table]), 1)
        self.assertNotIn('not-exported', str(result))

    def test_cancel_passes_only_session_identity_to_atomic_rpc(self):
        row = self.add_request()
        result = self.client.post(f'/privacy/requests/{row["id"]}/cancel')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.db.rpc_calls, [("cancel_privacy_request", {"p_actor_id": self.user["id"], "p_request_id": row["id"]})])

    def test_export_includes_only_own_ai_context(self):
        self.db.rows["conversations"] = [
            {"id": "own-ai", "kind": "ai", "created_by": self.user["id"]},
            {"id": "other-ai", "kind": "ai", "created_by": self.other},
            {"id": "direct", "kind": "direct", "created_by": self.user["id"]},
        ]
        self.db.rows["messages"] = [
            {"id": "own-reply", "conversation_id": "own-ai", "sender_kind": "assistant", "body": "Explicação"},
            {"id": "private-reply", "conversation_id": "other-ai", "sender_kind": "assistant", "body": "Outro contexto"},
            {"id": "received", "conversation_id": "direct", "sender_kind": "user", "sender_id": self.other, "body": "Outra pessoa"},
        ]
        exported = personal_export(self.db, self.user["id"])
        self.assertEqual([row["id"] for row in exported["data"]["ai_messages"]], ["own-reply"])

    def test_teacher_and_student_cannot_use_administrative_routes(self):
        for role in ("teacher", "student"):
            self.user["role"] = role
            self.assertEqual(self.client.get("/admin/privacy-requests").status_code, 403)
            self.assertEqual(self.client.post(f"/admin/privacy-requests/{uuid4()}/resolve", json={
                "decision": "complete", "response": "Concluído",
            }).status_code, 403)

    def test_admin_cannot_review_their_own_request(self):
        self.user["role"] = "admin"
        row = self.add_request()
        result = self.client.post(f'/admin/privacy-requests/{row["id"]}/resolve', json={"decision": "complete", "response": "Ok"})
        self.assertEqual(result.status_code, 403)
        self.assertFalse(self.db.rpc_calls)

    def test_destructive_actions_require_exact_confirmation(self):
        self.user["role"] = "admin"
        for kind, expected in (("deletion", "EXCLUIR"), ("anonymization", "ANONIMIZAR")):
            row = self.add_request(owner=self.other, kind=kind)
            denied = self.client.post(f'/admin/privacy-requests/{row["id"]}/resolve', json={
                "decision": "complete", "response": "Concluído", "confirmation": expected.lower(),
            })
            self.assertEqual(denied.status_code, 400)
        self.assertFalse(self.db.rpc_calls)

    def test_confirmed_action_uses_admin_from_session_and_hashes_identity(self):
        self.user["role"] = "admin"
        row = self.add_request(owner=self.other, kind="deletion")
        self.db.rows["profiles"] = [{"id": self.other, "email": "private@example.test"}]
        result = self.client.post(f'/admin/privacy-requests/{row["id"]}/resolve', json={
            "decision": "complete", "response": "Concluído", "confirmation": "EXCLUIR",
        })
        self.assertEqual(result.status_code, 200)
        payload = self.db.rpc_calls[0][1]
        self.assertEqual(payload["p_admin_id"], self.user["id"])
        self.assertEqual(payload["p_identity_hash"], "a" * 64)
        self.assertNotIn("private@example.test", str(payload))

    def test_rejection_does_not_compute_identity_or_require_destructive_confirmation(self):
        self.user["role"] = "admin"
        row = self.add_request(owner=self.other, kind="deletion")
        result = self.client.post(f'/admin/privacy-requests/{row["id"]}/resolve', json={"decision": "reject", "response": "Atendimento assistido"})
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(self.db.rpc_calls[0][1]["p_identity_hash"])

    def test_invalid_corrections_and_unknown_roles_are_rejected(self):
        invalid = (
            {"kind": "correction"}, {"kind": "correction", "corrections": {"role": "admin"}},
            {"kind": "access", "corrections": {"grade": "8º ano"}},
            {"kind": "correction", "corrections": {"full_name": "  "}}, {"kind": "unknown"},
        )
        for payload in invalid:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                PrivacyRequestCreate(**payload)
        self.assertEqual(PrivacyRequestCreate(kind="correction", corrections={"full_name": " Ana "}).corrections.full_name, "Ana")
        with self.assertRaises(ValidationError):
            PrivacyRequestResolve(decision="complete", response="  ")

    def test_extended_kinds_create_list_isolate_and_validate_corrections(self):
        for kind in ("confirmation", "sharing", "opposition", "revocation", "portability", "automated_review"):
            with self.subTest(kind=kind):
                result = self.client.post("/privacy/requests", json={"kind": kind, "details": "Pedido assistido"})
                self.assertEqual(result.status_code, 201)
                self.assertEqual(result.json()["kind"], kind)
                self.assertEqual(result.json()["user_id"], self.user["id"])
                self.assertEqual(self.client.post("/privacy/requests", json={
                    "kind": kind, "corrections": {"grade": "8"},
                }).status_code, 422)
                foreign = self.add_request(owner=self.other, kind=kind, status="completed")
                own = self.add_request(kind=kind, status="completed")
                self.assertEqual(self.client.get(f'/privacy/requests/{foreign["id"]}/export').status_code, 404)
                self.assertEqual(self.client.get(f'/privacy/requests/{own["id"]}/export').status_code, 409)
        listed = self.client.get("/privacy/requests").json()
        self.assertTrue(all(row["user_id"] == self.user["id"] for row in listed))

    def test_extended_resolution_confirmation_and_rejection_without_identity_lookup(self):
        self.user["role"] = "admin"
        for kind in ("confirmation", "sharing", "opposition", "revocation", "portability", "automated_review"):
            with self.subTest(kind=kind):
                row = self.add_request(owner=self.other, kind=kind)
                path = f'/admin/privacy-requests/{row["id"]}/resolve'
                body = {"decision": "complete", "response": "Medida adotada, referência AT-42."}
                if kind in ("opposition", "revocation"):
                    for confirmation in ("", "medida confirmada"):
                        self.assertEqual(self.client.post(path, json={**body, "confirmation": confirmation}).status_code, 400)
                    body["confirmation"] = "MEDIDA CONFIRMADA"
                self.assertEqual(self.client.post(path, json=body).status_code, 200)
                self.assertIsNone(self.db.rpc_calls[-1][1]["p_identity_hash"])
                self.assertEqual(self.db.rpc_calls[-1][1]["p_response"], body["response"])
                self.assertEqual(self.client.post(path, json={"decision": "reject", "response": "Motivo documentado"}).status_code, 200)
        self.assertFalse(any(table == "profiles" for table, _, _ in self.db.owner_filters))

    def test_expired_requests_are_hidden_and_unresolvable(self):
        row = self.add_request(kind="portability", status="completed")
        row["expires_at"] = "2000-01-01T00:00:00+00:00"
        self.assertEqual(self.client.get("/privacy/requests").json(), [])
        self.assertEqual(self.client.get(f'/privacy/requests/{row["id"]}/export').status_code, 404)
        self.user["role"] = "admin"
        self.assertEqual(self.client.post(f'/admin/privacy-requests/{row["id"]}/resolve', json={
            "decision": "complete", "response": "Medida documentada",
        }).status_code, 404)
        self.assertFalse(self.db.rpc_calls)

    def test_provider_errors_do_not_leak_connection_details(self):
        self.db.failure = RuntimeError("secret-database-connection")
        response = self.client.get("/privacy/requests")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("secret-database-connection", response.text)

    def test_pagination_fetches_rows_after_first_page(self):
        self.db.rows["question_attempts"] = [{"id": str(i), "student_id": self.user["id"]} for i in range(501)]
        exported = personal_export(self.db, self.user["id"])
        self.assertEqual(len(exported["data"]["question_attempts"]), 501)


if __name__ == "__main__":
    unittest.main()
