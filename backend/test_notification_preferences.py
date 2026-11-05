"""Preferências de e-mail do professor sem chamar Supabase ou SMTP reais."""

import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
from notification_preferences import email_enabled, register_notification_routes


class Query:
    """Aplica filtros reais para o teste perceber escrita no perfil errado."""

    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters, self.fields, self.limit_value, self.values, self.mode = [], "*", None, None, "select"

    def select(self, fields):
        self.fields = fields
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.filters.append((column, set(values)))
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    def insert(self, values):
        self.values, self.mode = values, "insert"
        return self

    def upsert(self, values, **_kwargs):
        self.values, self.mode = values, "upsert"
        return self

    def update(self, values):
        self.values, self.mode = values, "update"
        return self

    def matches(self, row):
        return all(row.get(key) in value if isinstance(value, set) else row.get(key) == value for key, value in self.filters)

    def execute(self):
        rows = self.db.rows.setdefault(self.table, [])
        if self.mode in {"insert", "upsert"}:
            rows.append(dict(self.values))
            return SimpleNamespace(data=[self.values])
        matched = [row for row in rows if self.matches(row)]
        if self.mode == "update":
            for row in matched:
                row.update(self.values)
            return SimpleNamespace(data=matched)
        if self.limit_value is not None:
            matched = matched[: self.limit_value]
        fields = self.fields.split(",")
        return SimpleNamespace(data=[{key: value for key, value in row.items() if self.fields == "*" or key in fields} for row in matched])


class Database:
    def __init__(self, rows=None):
        self.rows = rows or {}

    def table(self, name):
        return Query(self, name)


class PreferenceRouteTests(unittest.TestCase):
    def setUp(self):
        self.teacher = {"id": str(uuid4()), "role": "teacher"}
        self.other = {"id": str(uuid4()), "full_name": "Outra", "email_difficulty_alerts": True, "email_weekly_summary": True}
        self.db = Database({"profiles": [{"id": self.teacher["id"], "full_name": "Prof"}, self.other]})
        self.limit = Mock()

        def teacher():
            if self.teacher["role"] != "teacher":
                raise HTTPException(403, "Somente professores.")
            return self.teacher

        app = FastAPI()
        register_notification_routes(app, database=lambda: self.db, teacher_dependency=teacher, enforce_limit=self.limit)
        self.client = TestClient(app)

    def test_profile_without_choice_keeps_both_emails(self):
        response = self.client.get("/teacher/notification-preferences")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["email_difficulty_alerts"])
        self.assertTrue(response.json()["email_weekly_summary"])

    def test_update_changes_only_the_session_profile(self):
        response = self.client.put(
            "/teacher/notification-preferences",
            json={"email_difficulty_alerts": True, "email_weekly_summary": False},
        )
        self.assertEqual(response.status_code, 200)
        own = self.db.rows["profiles"][0]
        self.assertFalse(own["email_weekly_summary"])
        self.assertIsNotNone(own["notification_preferences_updated_at"])
        self.assertTrue(self.other["email_weekly_summary"])
        self.limit.assert_called_with(self.db, self.teacher["id"], "notification_preferences")

    def test_payload_cannot_target_another_profile_or_omit_a_choice(self):
        extra = {"email_difficulty_alerts": False, "email_weekly_summary": False, "id": self.other["id"]}
        self.assertEqual(self.client.put("/teacher/notification-preferences", json=extra).status_code, 422)
        partial = {"email_weekly_summary": False}
        self.assertEqual(self.client.put("/teacher/notification-preferences", json=partial).status_code, 422)

    def test_students_cannot_use_the_route(self):
        self.teacher["role"] = "student"
        self.assertEqual(self.client.get("/teacher/notification-preferences").status_code, 403)

    def test_only_explicit_false_disables_email(self):
        self.assertTrue(email_enabled({}, "email_weekly_summary"))
        self.assertTrue(email_enabled({"email_weekly_summary": None}, "email_weekly_summary"))
        self.assertFalse(email_enabled({"email_weekly_summary": False}, "email_weekly_summary"))


class DeliveryRespectsPreferenceTests(unittest.TestCase):
    """A escolha é aplicada no SQL (claim_email_delivery); aqui conferimos a fronteira Python.

    Os cenários com preferência desligada rodam no PostgreSQL isolado em
    test_email_delivery.SQLTests.
    """

    def setUp(self):
        self.teacher_id, self.student_id, self.subject_id = str(uuid4()), str(uuid4()), str(uuid4())
        self.db = Database({
            "teacher_subjects": [{"teacher_id": self.teacher_id, "subject_id": self.subject_id}],
            "difficulty_alerts": [],
        })

    def raise_alert(self, **send_options):
        from main import synchronize_difficulty_alert

        with patch("main.send_smtp_email", **send_options) as send:
            synchronize_difficulty_alert(
                self.db, student_id=self.student_id, subject_id=self.subject_id,
                subject_name="Matemática", topic="Frações", accuracy_percent=40, attempts=3,
            )
        return send

    def test_immediate_email_goes_through_ledger_for_the_subject_teacher(self):
        send = self.raise_alert(return_value="skipped")
        send.assert_called_once_with(db=self.db, teacher_id=self.teacher_id, subject_id=self.subject_id)
        self.assertEqual(self.db.rows["difficulty_alerts"][0]["status"], "active")

    def test_delivery_failure_keeps_the_panel_alert(self):
        self.raise_alert(side_effect=RuntimeError("smtp"))
        self.assertEqual(self.db.rows["difficulty_alerts"][0]["status"], "active")

    def run_weekly(self, **runner_options):
        from main import app, require_weekly_summary_secret

        app.dependency_overrides[require_weekly_summary_secret] = lambda: None
        try:
            with patch("main.supabase_configured", return_value=True), patch("main.database", return_value=self.db), \
                    patch("main.persist_access_audit"), patch("email_delivery.run_weekly_summary", **runner_options):
                return TestClient(app).post("/internal/weekly-difficulty-summary")
        finally:
            app.dependency_overrides.pop(require_weekly_summary_secret, None)

    def test_weekly_summary_reports_teachers_who_disabled_it(self):
        result = {"status": "no_deliveries", "smtp_accepted": 0, "received": 0, "failed_deliveries": 0,
                  "unknown_deliveries": 0, "processing_deliveries": 0, "teachers_skipped": 1}
        response = self.run_weekly(return_value=result)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["teachers_skipped"], 1)

    def test_invalid_email_configuration_is_503_without_details(self):
        response = self.run_weekly(side_effect=ValueError("SMTP_PASSWORD ausente"))
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("SMTP_PASSWORD", response.text)


class MigrationTests(unittest.TestCase):
    def test_migration_defaults_to_current_behavior_and_allows_audit_event(self):
        path = os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations", "20261103120000_notification_preferences.sql")
        with open(path, encoding="utf-8") as file:
            sql = file.read()
        self.assertIn("email_difficulty_alerts boolean not null default true", sql)
        self.assertIn("email_weekly_summary boolean not null default true", sql)
        self.assertIn("'UPDATE_NOTIFICATION_PREFERENCES'", sql)
        self.assertIn("'PRIVACY_POLICY_ACCEPTED'", sql)


if __name__ == "__main__":
    unittest.main()
