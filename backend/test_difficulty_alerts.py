"""Testes das regras que decidem quando avisar o professor."""

import unittest

from backend.difficulty_alerts import (
    build_immediate_email,
    build_weekly_email,
    is_high_difficulty,
    is_valid_cron_secret,
)


class DifficultyRuleTests(unittest.TestCase):
    def test_marks_a_topic_as_high_difficulty_after_three_low_accuracy_attempts(self):
        self.assertTrue(is_high_difficulty(59.9, 3))

    def test_does_not_alert_before_the_student_has_three_attempts(self):
        self.assertFalse(is_high_difficulty(20, 2))

    def test_does_not_alert_at_sixty_percent_or_above(self):
        self.assertFalse(is_high_difficulty(60, 5))

    def test_immediate_email_explains_the_subject_topic_and_result(self):
        subject, body = build_immediate_email(
            teacher_name="Carla",
            student_name="João",
            subject_name="Matemática",
            topic="Frações",
            accuracy_percent=40,
            attempts=5,
        )

        self.assertIn("Matemática", subject)
        self.assertIn("João", body)
        self.assertIn("Frações", body)
        self.assertIn("40%", body)

    def test_weekly_email_groups_alerts_without_exposing_other_subjects(self):
        subject, body = build_weekly_email(
            teacher_name="Carla",
            subject_name="Matemática",
            alerts=[
                {"student_name": "João", "topic": "Frações", "accuracy_percent": 40, "attempts": 5},
                {"student_name": "Lia", "topic": "Equações", "accuracy_percent": 50, "attempts": 4},
            ],
        )

        self.assertIn("Matemática", subject)
        self.assertIn("João", body)
        self.assertIn("Lia", body)
        self.assertNotIn("Português", body)

    def test_cron_secret_requires_an_exact_non_empty_match(self):
        self.assertTrue(is_valid_cron_secret("secret-123", "secret-123"))
        self.assertFalse(is_valid_cron_secret("secret-123", "secret-124"))
        self.assertFalse(is_valid_cron_secret(None, "secret-123"))
        self.assertFalse(is_valid_cron_secret("secret-123", ""))


if __name__ == "__main__":
    unittest.main()
