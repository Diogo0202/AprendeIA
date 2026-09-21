import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from access_audit import AUDIT_ACTIONS, audit_action_for, build_access_audit_record
from main import app, require_role


class AccessAuditTests(unittest.TestCase):
    def test_every_protected_feature_has_an_explicit_audit_action(self):
        """Uma rota nova não pode ficar silenciosa por esquecimento."""

        protected_prefixes = ("/student", "/teacher", "/admin", "/question-bank", "/internal")
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


if __name__ == "__main__":
    unittest.main()
