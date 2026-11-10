"""Loaders por cargo e por etapa extraídos das rotas longas, com banco simulado."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import main


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, {}

    def select(self, *_args):
        return self

    order = limit = select

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, values):
        self.filters[column] = list(values)
        return self

    def insert(self, row):
        self.inserted = row
        return self

    def execute(self):
        self.db.calls.append((self.table, dict(self.filters)))
        if hasattr(self, "inserted"):
            return type("Result", (), {"data": [{"id": "session", **self.inserted}]})()
        rows = self.db.rows.get(self.table, [])
        for column, value in self.filters.items():
            rows = [row for row in rows if (row.get(column) in value if isinstance(value, list) else row.get(column) == value)]
        return type("Result", (), {"data": rows})()


class FakeDb:
    def __init__(self, **rows):
        self.rows, self.calls = rows, []

    def table(self, name):
        return FakeQuery(self, name)


def profile(key, role, status="active"):
    return {"id": key, "full_name": key.title(), "role": role, "registration_status": status}


PROFILES = [
    profile("ana", "student"), profile("bia", "student"), profile("caio", "student", "pending"),
    profile("prof", "teacher"), profile("colega", "teacher"), profile("inativo", "teacher", "blocked"),
    profile("admin", "admin"),
]


class ContactLoaderTests(unittest.TestCase):
    def test_student_sees_only_active_teachers_of_enrolled_subjects(self):
        db = FakeDb(
            profiles=PROFILES,
            enrollments=[{"student_id": "ana", "subject_id": "mat", "subjects": {"name": "Matemática"}}],
            teacher_subjects=[
                {"teacher_id": "prof", "subject_id": "mat"},
                {"teacher_id": "inativo", "subject_id": "mat"},
                {"teacher_id": "colega", "subject_id": "port"},
            ],
        )
        contacts = main.student_contacts(db, {"id": "ana"})
        self.assertEqual(list(contacts), ["prof"])
        self.assertEqual(contacts["prof"]["context"], "Matemática")

    def test_student_without_enrollment_never_queries_profiles(self):
        db = FakeDb(profiles=PROFILES, enrollments=[], teacher_subjects=[])
        self.assertEqual(main.student_contacts(db, {"id": "ana"}), {})
        self.assertEqual([table for table, _ in db.calls], ["enrollments"])

    def test_admin_sees_only_active_teachers(self):
        contacts = main.admin_contacts(FakeDb(profiles=PROFILES))
        self.assertEqual(sorted(contacts), ["colega", "prof"])
        self.assertEqual({item["context"] for item in contacts.values()}, {"Professor"})

    def test_teacher_sees_own_students_colleagues_and_admins_but_not_self(self):
        db = FakeDb(
            profiles=PROFILES,
            enrollments=[
                {"student_id": "ana", "subject_id": "mat"},
                {"student_id": "caio", "subject_id": "mat"},
                {"student_id": "bia", "subject_id": "port"},
            ],
        )
        with patch.object(main, "teacher_assignment", return_value={"subject_id": "mat", "subject": "Matemática"}):
            contacts = main.teacher_contacts(db, {"id": "prof"})
        self.assertEqual(
            {key: item["context"] for key, item in contacts.items()},
            {"ana": "Matemática", "colega": "Professor", "admin": "Administração"},
        )

    def test_route_dispatches_by_role_and_sorts_by_name(self):
        with patch.object(main, "database", return_value=FakeDb(profiles=PROFILES)):
            result = main.communication_contacts({"id": "admin", "role": "admin"})
        self.assertEqual([item["id"] for item in result], ["colega", "prof"])


class CatalogBuilderTests(unittest.TestCase):
    def test_groups_lessons_progress_and_difficulties_without_database(self):
        catalog = main.build_subject_catalog(
            [{"id": "mat", "name": "Matemática", "description": "", "category": None}],
            [{"id": "m1", "subject_id": "mat", "title": "Frações", "position": 1}],
            [{"id": "l1", "module_id": "m1", "title": "A"}, {"id": "l2", "module_id": "m1", "title": "B"}],
            [{"lesson_id": "l1", "completed": True, "time_seconds": 90, "last_accessed_at": "2026-11-01"}],
            [
                {"subject_id": "mat", "topic": "Frações", "level": "basic", "accuracy": 80, "attempts": 5},
                {"subject_id": "mat", "topic": "Razão", "level": "basic", "accuracy": 40, "attempts": 3},
            ],
        )
        self.assertEqual(len(catalog), 1)
        subject = catalog[0]
        self.assertEqual((subject["completed_lessons"], subject["total_lessons"], subject["remaining_lessons"]), (1, 2, 1))
        module = subject["modules"][0]
        self.assertEqual((module["completed_lessons"], module["total_lessons"]), (1, 2))
        self.assertEqual([lesson["time_seconds"] for lesson in module["lessons"]], [90, 0])
        self.assertEqual([topic["topic"] for topic in subject["topics"]], ["Razão", "Frações"])

    def test_student_without_enrollment_gets_empty_catalog(self):
        db = FakeDb(enrollments=[])
        self.assertEqual(main.student_subject_catalog(db, "ana"), [])
        self.assertEqual(len(db.calls), 1)


class DiagnosticLoaderTests(unittest.TestCase):
    def test_new_session_takes_two_questions_per_subject_up_to_eight(self):
        questions = [
            {"id": f"{subject}-{index}", "subject_id": subject, "status": "published"}
            for subject in ("a", "b", "c", "d", "e")
            for index in range(3)
        ]
        session, selected = main.create_diagnostic_session(FakeDb(questions=questions), "ana")
        self.assertEqual(len(selected), 8)
        self.assertEqual([row["id"] for row in selected[:4]], ["a-0", "a-1", "b-0", "b-1"])
        self.assertEqual(session["question_ids"], [row["id"] for row in selected])
        self.assertEqual(session["student_id"], "ana")

    def test_new_session_without_published_questions_is_conflict(self):
        with self.assertRaises(main.HTTPException) as raised:
            main.create_diagnostic_session(FakeDb(questions=[]), "ana")
        self.assertEqual(raised.exception.status_code, 409)

    def test_open_session_reloads_only_its_questions(self):
        db = FakeDb(questions=[{"id": "q1"}, {"id": "q2"}])
        self.assertEqual(main.diagnostic_session_questions(db, {"question_ids": ["q2"]}), [{"id": "q2"}])
        self.assertEqual(main.diagnostic_session_questions(db, {"question_ids": None}), [])
        self.assertEqual(len(db.calls), 1)


if __name__ == "__main__":
    unittest.main()
