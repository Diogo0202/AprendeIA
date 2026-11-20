import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(__file__))

from main import DiagnosticAnswerRequest, answer_student_diagnostic, require_role

ROOT = Path(__file__).resolve().parents[1]


class UniqueViolation(Exception):
    code = "23505"


class PendingTeacherTests(unittest.TestCase):
    def test_pending_teacher_cannot_use_student_routes(self):
        dependency = require_role("student")
        pending = {"id": "u", "role": "student", "registration_status": "pending_teacher"}
        with self.assertRaises(HTTPException) as raised:
            dependency(pending)
        self.assertEqual(raised.exception.status_code, 403)

    def test_active_student_keeps_access(self):
        dependency = require_role("student")
        active = {"id": "u", "role": "student", "registration_status": "active"}
        self.assertEqual(dependency(active), active)


class DiagnosticRaceTests(unittest.TestCase):
    def test_concurrent_duplicate_answer_returns_409_not_500(self):
        question_id = uuid.uuid4()
        chain = MagicMock()
        for method in ("select", "eq", "limit", "insert"):
            getattr(chain, method).return_value = chain
        chain.execute.side_effect = [
            MagicMock(data=[]),  # nenhuma resposta anterior
            MagicMock(data=[{"correct_index": 1}]),  # gabarito
            UniqueViolation("duplicate key"),  # a outra requisição gravou primeiro
        ]
        db = MagicMock()
        db.table.return_value = chain
        session = {"id": "s", "question_ids": [str(question_id)]}
        payload = DiagnosticAnswerRequest(selected_index=1, response_time_seconds=5)
        with patch("main.database", return_value=db), \
                patch("main.enforce_api_rate_limit"), \
                patch("main.open_diagnostic_session", return_value=session):
            with self.assertRaises(HTTPException) as raised:
                answer_student_diagnostic(question_id, payload, {"id": "u"})
        self.assertEqual(raised.exception.status_code, 409)


class DeploymentAndSchemaTests(unittest.TestCase):
    def test_xp_is_not_granted_after_a_wrong_attempt_revealed_the_answer(self):
        migration = (
            ROOT / "supabase" / "migrations" / "20261110170000_xp_only_for_unrevealed_correct_answers.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("create or replace function private.gamification_record()", migration)
        self.assertIn("not a.correct", migration)
        self.assertIn("a.question_id=new.question_id", migration)
        # Só o ramo de questões muda; aulas e dias ativos seguem concedendo XP.
        self.assertIn("'lesson',new.lesson_id::text,100", migration)
        self.assertIn("'day',new.activity_date::text,20", migration)

    def test_source_url_scheme_is_enforced_by_the_database(self):
        migration = (
            ROOT / "supabase" / "migrations" / "20261110160000_learning_contents_source_url_scheme.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("source_url ~ '^https?://'", migration)

    def test_dockerfile_matches_ci_python_and_has_no_txt_duplicate(self):
        self.assertFalse((ROOT / "backend" / "Dockerfile.txt").exists())
        dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8", errors="ignore")
        workflow = (ROOT / ".github" / "workflows" / "quality-and-deploy.yml").read_text(encoding="utf-8")
        self.assertIn("python:3.13", dockerfile)
        self.assertIn('python-version: "3.13"', workflow)


if __name__ == "__main__":
    unittest.main()
