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

    def test_immediate_email_contains_only_notice_and_panel_link(self):
        subject, body = build_immediate_email(
            panel_url="https://aprendeia.example/",
            teacher_name="Carla",
            student_name="João",
            subject_name="Matemática",
            topic="Frações",
            accuracy_percent=40,
            attempts=5,
        )

        for private in ("Matemática", "Carla", "João", "Frações", "40%", "5 tentativas"):
            self.assertNotIn(private, subject + body)
        self.assertIn("https://aprendeia.example/", body)

    def test_weekly_email_never_renders_student_data(self):
        subject, body = build_weekly_email(
            panel_url="https://aprendeia.example/",
            teacher_name="Carla",
            subject_name="Matemática",
            alerts=[
                {"student_name": "João", "topic": "Frações", "accuracy_percent": 40, "attempts": 5},
                {"student_name": "Lia", "topic": "Equações", "accuracy_percent": 50, "attempts": 4},
            ],
        )

        for private in ("Matemática", "Carla", "João", "Lia", "Frações", "Equações", "40%", "50%"):
            self.assertNotIn(private, subject + body)
        self.assertIn("https://aprendeia.example/", body)

    def test_panel_link_rejects_tokens_credentials_and_header_injection(self):
        for url in ("http://example.test", "https://user:pass@example.test", "https://example.test?token=secret", "https://example.test/#secret", "https://example.test/\nInjected"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                build_weekly_email(panel_url=url)

    def test_cron_secret_requires_an_exact_non_empty_match(self):
        self.assertTrue(is_valid_cron_secret("secret-123", "secret-123"))
        self.assertFalse(is_valid_cron_secret("secret-123", "secret-124"))
        self.assertFalse(is_valid_cron_secret(None, "secret-123"))
        self.assertFalse(is_valid_cron_secret("secret-123", ""))


if __name__ == "__main__":
    unittest.main()
