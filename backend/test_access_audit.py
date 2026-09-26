import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, os.path.dirname(__file__))

from access_audit import AUDIT_ACTIONS, audit_action_for, build_access_audit_record
from main import PrivacyPolicyAccept, app, authenticated_profile, require_role


class AccessAuditTests(unittest.TestCase):
    def test_every_protected_feature_has_an_explicit_audit_action(self):
        """Uma rota nova não pode ficar silenciosa por esquecimento."""

        protected_prefixes = ("/student", "/teacher", "/admin", "/question-bank", "/communications", "/internal", "/privacy")
        missing = []
        for route in app.routes:
            if route.path.startswith(protected_prefixes) or route.path in {"/auth/login", "/health"}:
                for method in route.methods or set():
                    if method not in {"HEAD", "OPTIONS"} and (method, route.path) not in AUDIT_ACTIONS:
                        missing.append(f"{method} {route.path}")

        self.assertEqual(missing, [])

    def test_record_contains_only_safe_technical_metadata(self):
        record = build_access_audit_record(
            actor_id="00000000-0000-0000-0000-000000000001",
            actor_role="student",
            subject_hash=None,
            action="student.subjects.view",
            method="get",
            route="/student/subjects",
            status_code=200,
            request_id="00000000-0000-0000-0000-000000000002",
            network_hash="a" * 64,
        )

        self.assertEqual(record["outcome"], "success")
        self.assertNotIn("authorization", record)
        self.assertNotIn("body", record)
        self.assertNotIn("query", record)
        self.assertNotIn("ip", record)

    def test_denied_access_is_distinct_from_application_error(self):
        denied = build_access_audit_record(
            actor_id=None,
            actor_role=None,
            subject_hash="b" * 64,
            action="auth.login",
            method="POST",
            route="/auth/login",
            status_code=401,
            request_id="00000000-0000-0000-0000-000000000002",
            network_hash="a" * 64,
        )
        self.assertEqual(denied["outcome"], "denied")

    def test_requested_business_events_have_stable_names(self):
        expected = {
            ("POST", "/auth/login"): "LOGIN_SUCCESS",
            ("POST", "/admin/users"): "CREATE_USER",
            ("POST", "/admin/teacher-requests/{user_id}/approve"): "APPROVE_TEACHER",
            ("POST", "/teacher/classes"): "CREATE_CLASS",
            ("POST", "/teacher/classes/{class_id}/students"): "ADD_STUDENT_TO_CLASS",
            ("POST", "/question-bank/generate"): "GENERATE_QUESTION",
            ("POST", "/question-bank/{question_id}/answer"): "ANSWER_QUESTION",
            ("GET", "/teacher/reports/export"): "EXPORT_REPORT",
        }
        for route, action in expected.items():
            with self.subTest(route=route):
                self.assertEqual(audit_action_for(*route), action)
        self.assertEqual(audit_action_for("POST", "/auth/login", 401), "LOGIN_FAILED")
        self.assertEqual(audit_action_for("POST", "/auth/login", 200), "LOGIN_SUCCESS")

    def test_new_audit_columns_and_metadata_are_safe(self):
        record = build_access_audit_record(
            actor_id="00000000-0000-0000-0000-000000000001",
            actor_role="teacher",
            subject_hash=None,
            action="CREATE_CLASS",
            method="POST",
            route="/teacher/classes",
            status_code=201,
            request_id="00000000-0000-0000-0000-000000000002",
            network_hash="a" * 64,
            resource_id="00000000-0000-0000-0000-000000000003",
            metadata={"class_id": "00000000-0000-0000-0000-000000000003", "password": "must-not-be-kept"},
        )
        self.assertEqual(record["user_id"], record["actor_id"])
        self.assertEqual(record["role"], "teacher")
        self.assertEqual(record["resource_id"], "00000000-0000-0000-0000-000000000003")
        self.assertEqual(record["metadata"], {"class_id": "00000000-0000-0000-0000-000000000003"})
        self.assertNotIn("password", record["metadata"])
        self.assertEqual(record["ip_hash"], "a" * 64)
        self.assertTrue(record["created_at"])

    def test_audit_listing_is_admin_only(self):
        self.assertEqual(audit_action_for("GET", "/admin/audit-logs"), "admin.audit_logs.list")
        with self.assertRaises(Exception) as error:
            require_role("admin")({"role": "teacher"})
        self.assertEqual(error.exception.status_code, 403)

    def test_migration_keeps_logs_immutable_and_backend_only(self):
        migration = (
            Path(__file__).resolve().parents[1]
            / "supabase"
            / "migrations"
            / "20260920120000_access_audit_logs.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("enable row level security", migration)
        self.assertIn("revoke all on table public.access_audit_logs", migration)
        self.assertIn("grant select, insert, delete", migration)
        self.assertNotIn("grant update", migration)

    def test_privacy_migration_adds_consent_and_requested_log_fields(self):
        migration = (
            Path(__file__).resolve().parents[1]
            / "supabase"
            / "migrations"
            / "20260926120000_privacy_consent_and_audit_schema.sql"
        ).read_text(encoding="utf-8")
        for column in ("user_id", "role", "resource", "resource_id", "ip_hash", "created_at", "metadata"):
            with self.subTest(column=column):
                self.assertIn(f"add column {column}", migration)
        self.assertIn("access_audit_logs_action_check", migration)
        self.assertIn("privacy_policy_acceptances", migration)
        self.assertIn("record_privacy_policy_acceptance", migration)
        self.assertIn("PRIVACY_POLICY_ACCEPTED", migration)
        self.assertIn("interval '6 days'", migration)
        self.assertIn("set expires_at = least(expires_at, created_at + interval '6 days')", migration)
        self.assertIn("aprendeia-purge-expired-access-logs", migration)
        self.assertIn("'0 * * * *'", migration)
        self.assertIn("privacy_policy_accepted", migration)
        self.assertIn("policy_version_value <> '1.0'", migration)
        self.assertIn("revoke update, delete on table public.privacy_policy_acceptances", migration)

    def test_privacy_accept_endpoint_and_version_validation(self):
        endpoint = next(route for route in app.routes if route.path == "/privacy/accept")
        self.assertIn("POST", endpoint.methods)
        self.assertEqual(PrivacyPolicyAccept(policy_version="1.0").policy_version, "1.0")
        with self.assertRaises(Exception):
            PrivacyPolicyAccept(policy_version="0.9")

    def test_backend_blocks_unaccepted_accounts_from_protected_routes(self):
        db = Mock()
        db.auth.get_user.return_value.user = SimpleNamespace(id="00000000-0000-0000-0000-000000000001")
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "email": "student@example.test",
                "role": "student",
                "privacy_policy_version": None,
            }
        ]
        request = Request({
            "type": "http", "method": "GET", "path": "/student/subjects",
            "headers": [], "query_string": b"", "server": ("test", 80),
            "client": ("127.0.0.1", 1234), "scheme": "http",
        })
        with patch("main.supabase_configured", return_value=True), patch("main.database", return_value=db):
            with self.assertRaises(HTTPException) as error:
                authenticated_profile(request, "Bearer valid-token")
        self.assertEqual(error.exception.status_code, 428)


if __name__ == "__main__":
    unittest.main()
