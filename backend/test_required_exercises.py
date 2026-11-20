import os
import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(__file__))

from main import MandatoryExercisesUpdate, lesson_requirements_complete


class RequiredExercisesTests(unittest.TestCase):
    def test_only_every_persisted_check_releases_the_lesson(self):
        exercises = [{"checked": True}, {"checked": False}]
        self.assertFalse(lesson_requirements_complete(exercises))
        self.assertTrue(lesson_requirements_complete([{"checked": True}, {"checked": True}]))

    def test_mandatory_exercise_cannot_be_linked_twice(self):
        question = "00000000-0000-0000-0000-000000000001"
        with self.assertRaises(ValidationError):
            MandatoryExercisesUpdate(question_ids=[question, question])

    def test_migration_keeps_mapping_and_confirmation_behind_the_backend(self):
        migration = (
            Path(__file__).resolve().parents[1]
            / "supabase"
            / "migrations"
            / "20260921120000_lesson_required_exercises.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("lesson_required_exercises enable row level security", migration)
        self.assertIn("lesson_exercise_completions enable row level security", migration)
        self.assertIn("revoke all on public.lesson_required_exercises, public.lesson_exercise_completions", migration)
        self.assertIn("foreign key (lesson_id, question_id)", migration)


    def test_replacement_is_one_transactional_rpc_restricted_to_service_role(self):
        migration = (
            Path(__file__).resolve().parents[1]
            / "supabase"
            / "migrations"
            / "20261110120000_replace_lesson_required_exercises.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("replace_lesson_required_exercises(", migration)
        self.assertIn("set search_path = public, pg_temp", migration)
        self.assertIn("to service_role", migration)
        self.assertIn("from public, anon, authenticated", migration)
        source = (Path(__file__).parent / "main.py").read_text(encoding="utf-8")
        self.assertIn('"replace_lesson_required_exercises"', source)
        self.assertNotIn('table("lesson_required_exercises").delete()', source)


class AuditHardeningTests(unittest.TestCase):
    def test_audit_network_hash_is_computed_and_domain_separated(self):
        from auth_security import rate_limit_hash

        secret = "s" * 32
        audit = rate_limit_hash("audit_network", "203.0.113.5", secret)
        self.assertEqual(len(audit), 64)
        self.assertNotEqual(audit, rate_limit_hash("network", "203.0.113.5", secret))

    def test_non_uuid_resource_id_is_dropped_not_fatal(self):
        from access_audit import build_access_audit_record

        common = dict(actor_id=None, actor_role="student", subject_hash=None, action="x",
                      method="POST", route="/r", status_code=200, request_id="r", network_hash=None)
        self.assertIsNone(build_access_audit_record(resource_id="questao-abc", **common)["resource_id"])
        valid = "00000000-0000-0000-0000-000000000001"
        self.assertEqual(build_access_audit_record(resource_id=valid, **common)["resource_id"], valid)


if __name__ == "__main__":
    unittest.main()
