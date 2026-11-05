import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, os.path.dirname(__file__))

from access_audit import AUDIT_ACTIONS, audit_action_for, build_access_audit_record
from main import PrivacyPolicyAccept, QuestionRequest, app, authenticated_profile, generate_question, require_role


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
            ("PUT", "/student/profile-personalization"): "UPDATE_PROFILE",
            ("POST", "/internal/weekly-difficulty-summary"): "SEND_WEEKLY_SUMMARY",
        }
        for route, action in expected.items():
            with self.subTest(route=route):
                self.assertEqual(audit_action_for(*route), action)
        self.assertEqual(audit_action_for("POST", "/auth/login", 401), "LOGIN_FAILED")
        self.assertEqual(audit_action_for("POST", "/auth/login", 200), "LOGIN_SUCCESS")

    def test_generated_question_keeps_created_resource_id_for_audit(self):
        question_id = "00000000-0000-0000-0000-000000000003"
        request = Request({
            "type": "http", "method": "POST", "path": "/question-bank/generate",
            "headers": [], "query_string": b"", "server": ("test", 80),
            "client": ("127.0.0.1", 1234), "scheme": "http",
        })
        db = MagicMock()
        tables = {name: MagicMock() for name in ("subjects", "teacher_subjects", "questions")}
        db.table.side_effect = tables.__getitem__
        tables["subjects"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"id": "00000000-0000-0000-0000-000000000004"}
        ]
        tables["teacher_subjects"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"subject_id": "00000000-0000-0000-0000-000000000004"}
        ]
        tables["questions"].insert.return_value.execute.return_value.data = [{
            "id": question_id, "topic": "Frações", "difficulty": "basic",
            "question": "Quanto é 1/2?", "options": ["0", "1/2", "1", "2"],
            "correct_index": 1, "explanation": "Metade.",
        }]
        generated = {
            "id": "00000000-0000-0000-0000-000000000005", "subject": "Matemática",
            "topic": "Frações", "difficulty": "basic", "question": "Quanto é 1/2?",
            "options": ["0", "1/2", "1", "2"], "correct_index": 1,
            "explanation": "Metade.",
        }
        with patch("main.supabase_configured", return_value=True), patch("main.database", return_value=db), patch(
            "main.enforce_api_rate_limit"
        ), patch("main.generate_with_ai", return_value=generated):
            result = generate_question(
                request, QuestionRequest(subject="Matemática", topic="Frações"),
                {"id": "00000000-0000-0000-0000-000000000001", "role": "teacher"},
            )

        self.assertEqual(result["id"], question_id)
        self.assertEqual(request.state.audit_resource_id, question_id)

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

    def test_weekly_summary_audit_metadata_keeps_only_aggregate_fields(self):
        record = build_access_audit_record(
            actor_id=None,
            actor_role="service",
            subject_hash=None,
            action="SEND_WEEKLY_SUMMARY",
            method="POST",
            route="/internal/weekly-difficulty-summary",
            status_code=200,
            request_id="00000000-0000-0000-0000-000000000002",
            network_hash=None,
            metadata={
                "week_start": "2026-09-28",
                "teachers_notified": 4,
                "failed_deliveries": 1,
                "student_names": ["must-not-be-kept"],
            },
        )

        self.assertEqual(record["role"], "service")
        self.assertEqual(
            record["metadata"],
            {"week_start": "2026-09-28", "teachers_notified": 4, "failed_deliveries": 1},
        )

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

    def test_followup_migration_allows_profile_and_weekly_summary_events(self):
        migration = (
            Path(__file__).resolve().parents[1]
            / "supabase"
            / "migrations"
            / "20261006120000_profile_and_weekly_summary_audit.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("'UPDATE_PROFILE'", migration)
        self.assertIn("'SEND_WEEKLY_SUMMARY'", migration)
        self.assertIn("access_audit_logs_action_check", migration)
        self.assertIn("policy_version_value <> '1.1'", migration)
        self.assertIn("target_policy_version <> '1.1'", migration)
        self.assertIn("privacy_policy_version", migration)

    def test_policy_v1_2_migration_requires_new_version(self):
        migration = (
            Path(__file__).resolve().parents[1]
            / "supabase"
            / "migrations"
            / "20261102130000_privacy_policy_v1_2.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("policy_version_value <> '1.2'", migration)
        self.assertIn("target_policy_version <> '1.2'", migration)
        self.assertNotIn("'1.1'", migration)
        self.assertIn("grant execute on function public.record_privacy_policy_acceptance(uuid, text)", migration)

    def test_policy_document_and_code_share_version(self):
        root = Path(__file__).resolve().parents[1]
        policy = (root / "docs" / "POLITICA_DE_PRIVACIDADE.md").read_text(encoding="utf-8")
        dialog = (root / "frontend" / "src" / "components" / "PrivacyPolicyAccess.tsx").read_text(encoding="utf-8")
        self.assertIn("**Versão:** 1.6", policy)
        self.assertIn("PRIVACY_POLICY_VERSION = '1.6'", dialog)

    def test_policy_v1_5_covers_admin_panel_and_ranking_visibility(self):
        root = Path(__file__).resolve().parents[1]
        migration = (root / "supabase" / "migrations" / "20261107110000_privacy_policy_v1_5.sql").read_text(encoding="utf-8")
        self.assertIn("policy_version_value <> '1.5'", migration)
        self.assertIn("target_policy_version <> '1.5'", migration)
        self.assertIn("p.privacy_policy_version='1.5'", migration)
        self.assertNotIn("'1.4'", migration)
        policy = (root / "docs" / "POLITICA_DE_PRIVACIDADE.md").read_text(encoding="utf-8").lower()
        dialog = (root / "frontend" / "src" / "components" / "PrivacyPolicyAccess.tsx").read_text(encoding="utf-8").lower()
        for content in (policy, dialog):
            with self.subTest(content="policy" if content is policy else "dialog"):
                self.assertIn("menos de 3 alunos", content)
                self.assertIn("mensagens diretas com professores", content)
                self.assertIn("por iniciativa", content)
                self.assertIn("preservadas sem", content)

    def test_privacy_policy_explains_requests_for_data_rights_and_minors(self):
        root = Path(__file__).resolve().parents[1]
        policy = (root / "docs" / "POLITICA_DE_PRIVACIDADE.md").read_text(encoding="utf-8").lower()
        dialog = (root / "frontend" / "src" / "components" / "PrivacyPolicyAccess.tsx").read_text(encoding="utf-8").lower()
        for content in (policy, dialog):
            with self.subTest(content="policy" if content is policy else "dialog"):
                self.assertIn("anonimiza", content)
                self.assertIn("exclus", content)
                self.assertIn("canal", content)
                self.assertIn("crianças", content)
                self.assertIn("melhor", content)
                self.assertIn("interesse", content)
                self.assertIn("openai", content)
                self.assertIn("10 mensagens", content)
                self.assertIn("e-mail", content)

    def test_privacy_accept_endpoint_and_version_validation(self):
        endpoint = next(route for route in app.routes if route.path == "/privacy/accept")
        self.assertIn("POST", endpoint.methods)
        accepted = PrivacyPolicyAccept(policy_version="1.6", terms_version="1.0")
        self.assertEqual((accepted.policy_version, accepted.terms_version), ("1.6", "1.0"))
        for old_version in ("1.0", "1.1", "1.2", "1.3", "1.4", "1.5"):
            with self.subTest(version=old_version), self.assertRaises(Exception):
                PrivacyPolicyAccept(policy_version=old_version, terms_version="1.0")
        # Os termos são obrigatórios e só a versão vigente é aceita.
        for terms in (None, "0.9", "1.1"):
            with self.subTest(terms=terms), self.assertRaises(Exception):
                PrivacyPolicyAccept(policy_version="1.6", terms_version=terms)
        with self.assertRaises(Exception):
            PrivacyPolicyAccept(policy_version="1.5")

    def test_backend_blocks_accounts_without_terms_of_use(self):
        db = Mock()
        db.auth.get_user.return_value.user = SimpleNamespace(id="00000000-0000-0000-0000-000000000001")
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "email": "student@example.test",
                "role": "student",
                "privacy_policy_version": "1.5",
                "terms_of_use_version": None,
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
        self.assertIn("Termos de Uso", error.exception.detail)

    def test_terms_of_use_migration_requires_both_acceptances(self):
        sql = (Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "20261108110000_terms_of_use_v1_0.sql").read_text(encoding="utf-8")
        self.assertIn("terms_version_value = '1.0'", sql)
        self.assertIn("policy_version_value = '1.5'", sql)
        self.assertIn("drop function if exists public.record_privacy_policy_acceptance(uuid, text);", sql)
        self.assertIn("grant execute on function public.record_privacy_policy_acceptance(uuid, text, text)\n  to service_role;", sql)
        self.assertIn("set terms_of_use_accepted_at = null", sql)

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
