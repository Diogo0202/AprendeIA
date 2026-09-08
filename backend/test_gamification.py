"""Testes da jornada de pontos e conquistas do estudante."""

import unittest
from datetime import date

from backend.gamification import build_gamification_summary, calculate_current_streak


class GamificationSummaryTests(unittest.TestCase):
    def test_builds_points_level_and_achievements_from_real_study_totals(self):
        summary = build_gamification_summary(
            completed_lessons=2,
            correct_answers=12,
            attempts=15,
            active_days=4,
            current_streak=3,
        )

        self.assertEqual(summary["points"], 400)
        self.assertEqual(summary["level"], 2)
        self.assertEqual(summary["next_level_points"], 500)
        self.assertEqual(len(summary["achievements"]), 4)

    def test_does_not_award_accuracy_badge_without_enough_attempts(self):
        summary = build_gamification_summary(
            completed_lessons=0,
            correct_answers=4,
            attempts=4,
            active_days=1,
            current_streak=1,
        )

        achievement_ids = {achievement["id"] for achievement in summary["achievements"]}
        self.assertNotIn("excellent_accuracy", achievement_ids)

    def test_counts_consecutive_study_days_backwards_from_today(self):
        streak = calculate_current_streak(
            [date(2026, 9, 8), date(2026, 9, 7), date(2026, 9, 6), date(2026, 9, 4)],
            today=date(2026, 9, 8),
        )

        self.assertEqual(streak, 3)


if __name__ == "__main__":
    unittest.main()
