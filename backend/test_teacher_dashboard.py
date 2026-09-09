import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from main import app, require_role
from teacher_dashboard import build_difficulty_trend, build_report_csv, parse_content_import


class TeacherDashboardTests(unittest.TestCase):
    def test_teacher_dashboard_routes_exist(self):
        """A interface só deve apontar para funções que o backend realmente oferece."""

        paths = {route.path for route in app.routes}
        expected = {
            "/teacher/overview",
            "/teacher/classes",
            "/teacher/classes/{class_id}",
            "/teacher/classes/{class_id}/students/{student_id}/history",
            "/teacher/reports/export",
            "/teacher/contents",
            "/teacher/contents/import",
            "/teacher/recommendations",
        }
        self.assertTrue(expected.issubset(paths))

    def test_student_cannot_cross_teacher_boundary(self):
        """Mesmo conhecendo uma URL, estudante não atravessa a dependência docente."""

        with self.assertRaises(Exception) as error:
            require_role("teacher")({"role": "student"})
        self.assertEqual(error.exception.status_code, 403)

    def test_difficulty_trend_groups_attempts_by_week(self):
        attempts = [
            {"answered_at": "2026-09-01T10:00:00+00:00", "correct": False},
            {"answered_at": "2026-09-02T10:00:00+00:00", "correct": True},
            {"answered_at": "2026-09-08T10:00:00+00:00", "correct": True},
        ]

        trend = build_difficulty_trend(attempts)

        self.assertEqual(len(trend), 2)
        self.assertEqual(trend[0]["accuracy"], 50.0)
        self.assertEqual(trend[0]["difficulty_score"], 50.0)
        self.assertEqual(trend[1]["difficulty_score"], 0.0)

    def test_content_import_accepts_csv_and_rejects_unknown_type(self):
        rows = parse_content_import(
            "title,description,content_type,source_url\nFrações,Revisão guiada,lesson,https://escola.test/fracao",
            "csv",
        )
        self.assertEqual(rows[0]["title"], "Frações")
        with self.assertRaises(ValueError):
            parse_content_import("title,content_type\nArquivo,executable", "csv")

    def test_csv_export_neutralizes_spreadsheet_formulas(self):
        report = build_report_csv(
            "Matemática",
            "8º A",
            [{"full_name": "=IMPORTDATA(\"x\")", "grade": "8º", "accuracy": 50, "attempts": 4}],
        )

        self.assertIn("'=IMPORTDATA", report)


if __name__ == "__main__":
    unittest.main()
