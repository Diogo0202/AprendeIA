"""Painel administrativo sem Supabase real: agregação, isolamento e exclusão."""

import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
from admin_panel import MIN_GROUP_SIZE, build_performance, register_admin_panel_routes, summarize_group

NOW = datetime(2026, 11, 5, 12, tzinfo=timezone.utc)  # quinta-feira


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.fields = db, table, [], "*"

    def select(self, fields):
        self.fields = fields
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.filters.append((column, set(values)))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        rows = [row for row in self.db.rows.get(self.table, []) if all(
            row.get(key) in value if isinstance(value, set) else row.get(key) == value for key, value in self.filters
        )]
        fields = self.fields.split(",")
        return SimpleNamespace(data=[{k: v for k, v in row.items() if self.fields == "*" or k in fields} for row in rows])


class Database:
    def __init__(self, rows):
        self.rows, self.rpc_calls, self.rpc_error = rows, [], None

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, payload):
        self.rpc_calls.append((name, payload))

        def execute():
            if self.rpc_error:
                raise self.rpc_error
            return SimpleNamespace(data={"deleted_role": "teacher"})
        return SimpleNamespace(execute=execute)


def attempt(student, subject, correct, when="2026-11-04T10:00:00Z"):
    return {"student_id": student, "subject_id": subject, "correct": correct, "answered_at": when}


class AggregationTests(unittest.TestCase):
    def test_small_groups_reveal_only_their_size(self):
        result = summarize_group({"a", "b"}, [attempt("a", "m", True)], 3, 1, NOW)
        self.assertEqual(MIN_GROUP_SIZE, 3)
        self.assertTrue(result["small_sample"])
        self.assertEqual(result["students"], 2)
        for key in ("attempts", "accuracy", "completed_lessons", "active_alerts"):
            self.assertIsNone(result[key])
        self.assertEqual(result["trend"], [])

    def test_accuracy_and_four_week_trend(self):
        students = {"a", "b", "c"}
        rows = [
            attempt("a", "m", True), attempt("b", "m", False),
            attempt("c", "m", True, "2026-10-27T10:00:00Z"), attempt("c", "m", True, "2026-09-01T10:00:00Z"),
        ]
        result = summarize_group(students, rows, 5, 2, NOW)
        self.assertEqual(result["accuracy"], 75.0)
        self.assertEqual(result["attempts"], 4)
        self.assertEqual([week["week_start"] for week in result["trend"]], ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"])
        self.assertEqual(result["trend"][2], {"week_start": "2026-10-26", "attempts": 1, "accuracy": 100.0})
        self.assertEqual(result["trend"][-1], {"week_start": "2026-11-02", "attempts": 2, "accuracy": 50.0})
        self.assertEqual(result["trend"][0]["accuracy"], None)

    def test_class_counts_only_its_subject_and_teacher_counts_distinct_students(self):
        classes = [
            {"id": "c1", "teacher_id": "t1", "subject_id": "math", "name": "A", "school_year": "8º"},
            {"id": "c2", "teacher_id": "t1", "subject_id": "math", "name": "B", "school_year": "8º"},
        ]
        members = [{"class_id": "c1", "student_id": s} for s in ("a", "b", "c")] + [
            {"class_id": "c2", "student_id": s} for s in ("c", "d", "e")
        ]
        result = build_performance(
            classes=classes, members=members,
            teachers={"t1": {"full_name": "Prof", "subject_id": "math"}, "t2": {"full_name": "Sem turma", "subject_id": None}},
            subjects={"math": "Matemática"},
            attempts=[attempt("a", "math", True), attempt("a", "port", False), attempt("d", "math", False)],
            completions=[{"student_id": "a", "subject_id": "math"}],
            alerts=[{"student_id": "d", "subject_id": "math"}],
            now=NOW,
        )
        first = next(row for row in result["classes"] if row["id"] == "c1")
        self.assertEqual((first["attempts"], first["accuracy"], first["completed_lessons"]), (1, 100.0, 1))
        teacher = next(row for row in result["teachers"] if row["id"] == "t1")
        self.assertEqual((teacher["students"], teacher["classes"], teacher["attempts"], teacher["active_alerts"]), (5, 2, 2, 1))
        empty = next(row for row in result["teachers"] if row["id"] == "t2")
        self.assertEqual((empty["classes"], empty["students"], empty["small_sample"]), (0, 0, True))


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.admin = {"id": str(uuid4()), "role": "admin"}
        self.teacher, self.other_admin = str(uuid4()), str(uuid4())
        self.students = [str(uuid4()) for _ in range(3)]
        self.db = Database({
            "profiles": [
                {"id": self.teacher, "full_name": "Prof Ana", "email": "ana@example.test", "role": "teacher",
                 "registration_status": "active", "created_at": "2026-11-01T00:00:00Z"},
                {"id": self.other_admin, "full_name": "Outra", "email": "adm@example.test", "role": "admin"},
                {"id": self.students[0], "full_name": "Aluno Um", "email": "a1@example.test", "role": "student"},
            ],
            "teacher_subjects": [{"teacher_id": self.teacher, "subject_id": "math"}],
            "subjects": [{"id": "math", "name": "Matemática"}],
            "classes": [{"id": "c1", "teacher_id": self.teacher, "subject_id": "math", "name": "8A",
                         "school_year": "8º ano", "created_at": "2026-11-02T00:00:00Z"}],
            "class_students": [{"class_id": "c1", "student_id": s} for s in self.students],
            "questions": [{"id": "q1", "subject_id": "math"}],
            "question_attempts": [{"student_id": s, "question_id": "q1", "correct": i != 0,
                                   "answered_at": "2026-11-04T10:00:00Z"} for i, s in enumerate(self.students)],
            "modules": [], "lessons": [], "lesson_progress": [], "difficulty_alerts": [],
        })
        self.limit = Mock()

        def admin_only():
            if self.admin["role"] != "admin":
                raise HTTPException(403, "Somente administração.")
            return self.admin

        app = FastAPI()
        register_admin_panel_routes(
            app, database=lambda: self.db, admin_dependency=admin_only,
            enforce_limit=self.limit, identity_hash=lambda email: "f" * 64,
        )
        self.client = TestClient(app)

    def test_lists_teachers_and_classes_with_counts(self):
        teachers = self.client.get("/admin/teachers").json()
        self.assertEqual(teachers, [{
            "id": self.teacher, "full_name": "Prof Ana", "email": "ana@example.test", "registration_status": "active",
            "subject": "Matemática", "classes": 1, "students": 3, "created_at": "2026-11-01T00:00:00Z",
        }])
        classes = self.client.get("/admin/classes").json()
        self.assertEqual((classes[0]["name"], classes[0]["teacher_name"], classes[0]["students"]), ("8A", "Prof Ana", 3))

    def test_performance_is_aggregate_only(self):
        response = self.client.get("/admin/performance")
        self.assertEqual(response.status_code, 200)
        body = response.text
        self.assertNotIn("Aluno Um", body)
        for student in self.students:
            self.assertNotIn(student, body)
        self.assertEqual(response.json()["classes"][0]["accuracy"], 66.7)
        self.limit.assert_called_with(self.db, self.admin["id"], "admin_performance_read")

    def test_non_admin_is_denied(self):
        self.admin["role"] = "teacher"
        for path in ("/admin/teachers", "/admin/classes", "/admin/performance"):
            self.assertEqual(self.client.get(path).status_code, 403)

    def delete(self, user_id, **payload):
        body = {"confirmation": "EXCLUIR", "reason": "Conta de teste encerrada", **payload}
        return self.client.post(f"/admin/users/{user_id}/delete", json=body)

    def test_delete_requires_typed_confirmation_and_reason(self):
        self.assertEqual(self.delete(self.teacher, confirmation="excluir").status_code, 422)
        self.assertEqual(self.delete(self.teacher, reason="   ").status_code, 422)
        self.assertEqual(self.client.post(f"/admin/users/{self.teacher}/delete", json={"confirmation": "EXCLUIR"}).status_code, 422)
        self.assertEqual(self.db.rpc_calls, [])

    def test_admin_cannot_delete_self_or_other_admins(self):
        self.assertEqual(self.delete(self.admin["id"]).status_code, 403)
        self.assertEqual(self.delete(self.other_admin).status_code, 403)
        self.assertEqual(self.db.rpc_calls, [])

    def test_delete_calls_rpc_with_identity_hash(self):
        response = self.delete(self.teacher)
        self.assertEqual(response.json(), {"deleted": True, "deleted_role": "teacher"})
        name, payload = self.db.rpc_calls[0]
        self.assertEqual(name, "admin_delete_account")
        self.assertEqual(payload["p_admin_id"], self.admin["id"])
        self.assertEqual(payload["p_target_id"], self.teacher)
        self.assertEqual(payload["p_identity_hash"], "f" * 64)
        self.limit.assert_called_with(self.db, self.admin["id"], "admin_user_delete")

    def test_database_refusals_become_safe_messages(self):
        self.db.rpc_error = type("RPCError", (Exception,), {"code": "PT412"})()
        response = self.delete(self.teacher)
        self.assertEqual(response.status_code, 409)
        self.assertIn("arquivos", response.json()["detail"])

    def test_unknown_account_is_404(self):
        self.assertEqual(self.delete(str(uuid4())).status_code, 404)


class AuditTests(unittest.TestCase):
    def test_deletion_audit_keeps_role_and_reason_only(self):
        from access_audit import AUDIT_ACTIONS, build_access_audit_record

        self.assertEqual(AUDIT_ACTIONS[("POST", "/admin/users/{user_id}/delete")], "DELETE_USER")
        record = build_access_audit_record(
            actor_id="admin", actor_role="admin", subject_hash=None, action="DELETE_USER", method="POST",
            route="/admin/users/{user_id}/delete", status_code=200, request_id="r", network_hash=None,
            metadata={"deleted_role": "teacher", "reason": "Saiu da escola", "email": "x@example.test"},
        )
        self.assertEqual(record["metadata"], {"deleted_role": "teacher", "reason": "Saiu da escola"})
        self.assertIsNone(record["resource_id"])

    def test_audit_log_route_filters_by_user(self):
        from main import app

        route = next(r for r in app.routes if getattr(r, "path", None) == "/admin/audit-logs")
        self.assertIn("user_id", {param.name for param in route.dependant.query_params})

    def test_migration_blocks_admin_targets_and_requires_confirmation(self):
        from pathlib import Path

        sql = (Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "20261105120000_admin_panel.sql").read_text(encoding="utf-8")
        self.assertIn("if target_role = 'admin' then", sql)
        self.assertIn("p_target_id = p_admin_id", sql)
        self.assertIn("p_confirmation is distinct from 'EXCLUIR'", sql)
        self.assertIn("'DELETE_USER'", sql)
        self.assertIn("revoke all on function public.admin_delete_account", sql)


if __name__ == "__main__":
    unittest.main()
