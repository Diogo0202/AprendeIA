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


if __name__ == "__main__":
    unittest.main()
