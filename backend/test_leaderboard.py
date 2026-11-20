"""Contrato HTTP do ranking, sem rede ou alterações em main."""

import copy
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
from leaderboard import LEADERBOARD_RATE_LIMITS, persistent_summary, read_summary, register_leaderboard_routes


class RPCError(Exception):
    def __init__(self, code):
        super().__init__("private SQL detail: email=private@example.org service_role secret")
        self.code = code


class Database:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []
        self.error = None

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self.error:
            raise self.error
        return SimpleNamespace(data=copy.deepcopy(self.payload))


class LeaderboardTests(unittest.TestCase):
    def setUp(self):
        self.student_id, self.teacher_id, self.class_id, self.other_id = [str(uuid4()) for _ in range(4)]
        self.entry = {"alias": "Estrela", "avatar_key": "star", "weekly_xp": 120,
                      "level": 2, "rank": 1, "is_me": False}
        self.payload = {
            "entries": [dict(self.entry)], "my_position": {**self.entry, "alias": "Lua", "is_me": True},
            "total": 2, "page": 1, "page_size": 20,
            "week_start": "2026-11-02T03:00:00+00:00", "week_end": "2026-11-09T03:00:00+00:00",
            "classes": [{"id": self.class_id, "name": "Turma A"}], "school_opt_in": False, "alias": "Lua",
        }
        self.db = Database(self.payload)
        self.limit = Mock()

        def authenticated(authorization: str | None = Header(None)):
            if authorization not in {"Bearer student", "Bearer teacher", "Bearer admin"}:
                raise HTTPException(401, "Autenticação necessária.")
            role = authorization.split()[1]
            return {"id": self.student_id if role == "student" else self.teacher_id, "role": role}

        # Exercise real FastAPI dependency wiring, including missing credentials.
        from fastapi import Depends

        def student(user=Depends(authenticated)):
            if user["role"] != "student":
                raise HTTPException(403, "Somente estudantes.")
            return user

        def teacher(user=Depends(authenticated)):
            if user["role"] != "teacher":
                raise HTTPException(403, "Somente professores.")
            return user

        app = FastAPI()
        register_leaderboard_routes(app, database=lambda: self.db, student_dependency=student,
                                    teacher_dependency=teacher, enforce_limit=self.limit)
        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer student"}
        self.teacher_headers = {"Authorization": "Bearer teacher"}

    def get(self, **params):
        return self.client.get("/student/leaderboard", params=params, headers=self.headers)

    def put(self, payload=None):
        return self.client.put("/student/leaderboard-preferences", headers=self.headers,
                               json=payload if payload is not None else {"alias": "Lua", "school_opt_in": True})

    def test_student_class_defaults_and_exact_rpc(self):
        response = self.get()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), self.payload)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(self.db.calls, [("weekly_leaderboard", {
            "p_actor": self.student_id, "p_scope": "class", "p_class_id": None, "p_page": 1, "p_page_size": 20,
        })])
        self.limit.assert_called_once_with(self.db, self.student_id, "leaderboard_read")

    def test_class_bootstrap_returns_authorized_dropdown_without_entries(self):
        self.db.payload.update(entries=[], my_position=None, total=0)
        response = self.get(scope="class")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["classes"], [{"id": self.class_id, "name": "Turma A"}])
        self.assertEqual(response.json()["entries"], [])
        self.assertIsNone(self.db.calls[-1][1]["p_class_id"])
        self.assertEqual(self.db.calls[-1][1]["p_scope"], "class")

    def test_school_scope_without_class_id(self):
        response = self.get(scope="school")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.calls[-1][1]["p_scope"], "school")
        self.assertIsNone(self.db.calls[-1][1]["p_class_id"])

    def test_class_and_pagination_forwarded(self):
        self.db.payload.update(page=2, page_size=50)
        response = self.get(scope="class", class_id=self.class_id, page=2, page_size=50)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.db.calls[-1][1], {
            "p_actor": self.student_id, "p_scope": "class", "p_class_id": self.class_id, "p_page": 2, "p_page_size": 50,
        })

    def test_teacher_scope_and_actor_always_server_owned(self):
        response = self.client.get(f"/teacher/classes/{self.class_id}/leaderboard", headers=self.teacher_headers,
                                   params={"scope": "school", "p_actor": self.other_id, "actor": self.other_id,
                                           "class_id": str(uuid4())})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.db.calls[-1][1], {
            "p_actor": self.teacher_id, "p_scope": "class", "p_class_id": self.class_id, "p_page": 1, "p_page_size": 20,
        })
        self.limit.assert_called_once_with(self.db, self.teacher_id, "leaderboard_read")

    def test_student_cannot_forge_actor_in_query_or_headers(self):
        response = self.client.get("/student/leaderboard", headers={**self.headers, "X-User-Id": self.other_id},
                                   params={"actor": self.other_id, "p_actor": self.other_id, "user_id": self.other_id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.calls[-1][1]["p_actor"], self.student_id)

    def test_no_auth_or_wrong_role_never_calls_database_or_limiter(self):
        paths = [("GET", "/student/leaderboard"), ("PUT", "/student/leaderboard-preferences"),
                 ("GET", f"/teacher/classes/{self.class_id}/leaderboard")]
        for method, path in paths:
            for token in (None, "invalid", "admin", "teacher" if path.startswith("/student") else "student"):
                with self.subTest(method=method, path=path, token=token):
                    headers = {"Authorization": f"Bearer {token}"} if token else {}
                    response = self.client.request(method, path, headers=headers,
                                                   json={"alias": "Lua", "school_opt_in": True} if method == "PUT" else None)
                    self.assertEqual(response.status_code, 401 if token in (None, "invalid") else 403)
        self.assertEqual(self.db.calls, [])
        self.limit.assert_not_called()

    def test_invalid_query_stops_before_rpc(self):
        for params in ({"scope": "global"}, {"scope": "school", "class_id": self.class_id},
                       {"scope": "class", "class_id": "bad"}, {"page": 0}, {"page": -1},
                       {"page": "1.5"}, {"page": 1000001}, {"page_size": 0}, {"page_size": 51},
                       {"page_size": "bad"}):
            with self.subTest(params=params):
                self.assertEqual(self.get(**params).status_code, 422)
        self.assertEqual(self.db.calls, [])
        self.limit.assert_not_called()

    def test_teacher_bounds_and_uuid(self):
        for path, params in (("bad", {}), (self.class_id, {"page": 0}), (self.class_id, {"page_size": 51})):
            response = self.client.get(f"/teacher/classes/{path}/leaderboard", headers=self.teacher_headers, params=params)
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.calls, [])

    def test_page_size_lower_bound_and_empty_page(self):
        self.db.payload.update(entries=[], my_position=None, page_size=1, page=1000000)
        self.assertEqual(self.get(page_size=1, page=1000000).status_code, 200)

    def test_uuids_and_private_fields_stripped_at_every_level(self):
        self.db.payload.update(student_id=self.other_id, email="private@example.org")
        self.db.payload["entries"][0].update(id=self.other_id, student_id=self.other_id, email="private@example.org")
        self.db.payload["my_position"].update(student_id=self.student_id)
        self.db.payload["classes"][0].update(teacher_id=self.teacher_id, students=[self.other_id])
        response = self.get()
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(set(result["entries"][0]), set(self.entry))
        self.assertEqual(set(result["my_position"]), set(self.entry))
        self.assertEqual(set(result["classes"][0]), {"id", "name"})
        self.assertNotIn(self.other_id, response.text)
        self.assertNotIn(self.student_id, response.text)
        self.assertNotIn(self.teacher_id, response.text)
        self.assertNotIn("private@example.org", response.text)

    def test_malformed_envelopes_fail_closed(self):
        for value in (None, [], {}, [self.payload, self.payload], {**self.payload, "total": "2"},
                      {**self.payload, "school_opt_in": 1}, {**self.payload, "page": 2},
                      {**self.payload, "entries": [self.entry] * 21},
                      {**self.payload, "my_position": self.entry}):
            with self.subTest(value=value):
                self.db.payload = value
                self.assertEqual(self.get().status_code, 503)

    def test_malformed_rows_fail_closed(self):
        for change in ({"is_me": "false"}, {"weekly_xp": -1}, {"rank": 0}, {"level": True}, {"alias": {"id": self.other_id}}):
            self.db.payload = {**self.payload, "entries": [{**self.entry, **change}]}
            self.assertEqual(self.get().status_code, 503)

    def test_single_object_postgrest_wrapper(self):
        self.db.payload = [self.payload]
        self.assertEqual(self.get().status_code, 200)

    def test_preferences_exact_actor_and_normalized_alias(self):
        self.db.payload = {"alias": "Águia_2", "school_opt_in": True, "student_id": self.other_id}
        response = self.put({"alias": "  A\u0301guia_2  ", "school_opt_in": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"alias": "Águia_2", "school_opt_in": True})
        self.assertEqual(self.db.calls[-1], ("update_leaderboard_preferences", {
            "p_actor": self.student_id, "p_alias": "Águia_2", "p_school_opt_in": True,
        }))
        self.limit.assert_called_once_with(self.db, self.student_id, "leaderboard_preferences")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_alias_boundaries_and_opt_out(self):
        for alias in ("Lua", "a" * 24):
            self.db.payload = {"alias": alias, "school_opt_in": False}
            self.assertEqual(self.put(self.db.payload).status_code, 200)

    def test_alias_rejects_contacts_controls_and_invalid_lengths(self):
        for alias in ("ab", "a" * 25, "   ", "Lua@example.org", "https://site", "site.com", "@contato",
                      "Lua 11999999999", "Lua 11 99999-9999", "11999999999", "Lua\n", "Lua\t", "Lua\x00",
                      "Lua\x7f", "Lua\u202e", "Lua\u200b", "Lua\u0085", 123, None):
            with self.subTest(alias=alias):
                self.assertEqual(self.put({"alias": alias, "school_opt_in": True}).status_code, 422)
        self.assertEqual(self.db.calls, [])
        self.limit.assert_not_called()

    def test_preferences_strict_boolean_required_fields_and_extra_forbidden(self):
        for value in ("true", "false", 0, 1, None, [], {}):
            self.assertEqual(self.put({"alias": "Lua", "school_opt_in": value}).status_code, 422)
        for value in ({}, {"alias": "Lua"}, {"school_opt_in": True}):
            self.assertEqual(self.put(value).status_code, 422)
        for key in ("id", "actor", "p_actor", "student_id", "role", "weekly_xp"):
            self.assertEqual(self.put({"alias": "Lua", "school_opt_in": True, key: self.other_id}).status_code, 422)
        self.assertEqual(self.db.calls, [])

    def test_preference_invalid_rpc_response_is_safe(self):
        for payload in (None, {}, {"alias": "Lua", "school_opt_in": "false"}):
            self.db.payload = payload
            response = self.put()
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("private", response.text)

    def test_rate_limits_stop_before_rpc_and_preserve_retry_after(self):
        self.limit.side_effect = HTTPException(429, "Aguarde.", headers={"Retry-After": "900"})
        for response in (self.get(), self.put(), self.client.get(
                f"/teacher/classes/{self.class_id}/leaderboard", headers=self.teacher_headers)):
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["retry-after"], "900")
        self.assertEqual(self.db.calls, [])
        self.assertEqual(LEADERBOARD_RATE_LIMITS, {
            "leaderboard_read": (60, 900), "leaderboard_preferences": (10, 900),
        })

    def test_limiter_unavailable_stops_before_rpc(self):
        self.limit.side_effect = HTTPException(503, "Proteção indisponível.")
        self.assertEqual(self.get().status_code, 503)
        self.assertEqual(self.db.calls, [])

    def test_sql_error_codes_and_unknown_failures_are_safe_for_all_routes(self):
        for code, expected in (("PT400", 400), ("PT401", 401), ("PT403", 403), ("PT404", 404),
                               ("PT409", 409), ("PT422", 422), ("PT429", 429), ("XX000", 503)):
            self.db.error = RPCError(code)
            for response in (self.get(), self.put(), self.client.get(
                    f"/teacher/classes/{self.class_id}/leaderboard", headers=self.teacher_headers)):
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("private", response.text)
                self.assertNotIn("service_role", response.text)
        self.db.error = RuntimeError("service_role secret")
        self.assertEqual(self.get().status_code, 503)

    def test_summary_preserves_entire_trusted_payload(self):
        self.db.payload = {"points": 100, "achievements": [{"id": "new_server_badge", "bonus_xp": 42}],
                           "future_field": {"version": 2}, "weekly_xp": 50, "school_opt_in": False}
        for adapter in (read_summary, persistent_summary):
            self.assertEqual(adapter(self.db, self.student_id), self.db.payload)
            self.assertEqual(self.db.calls[-1], ("gamification_summary", {"p_actor": self.student_id}))
        self.db.payload = [self.db.payload]
        self.assertEqual(read_summary(self.db, self.student_id), self.db.payload[0])

    def test_summary_malformed_or_unavailable_fails_closed(self):
        for payload in (None, [], "bad", [{}, {}]):
            self.db.payload = payload
            with self.assertRaises(HTTPException) as caught:
                persistent_summary(self.db, self.student_id)
            self.assertEqual(caught.exception.status_code, 503)
        self.db.error = RPCError("PT403")
        with self.assertRaises(HTTPException) as caught:
            read_summary(self.db, self.student_id)
        self.assertEqual(caught.exception.status_code, 403)
        self.assertNotIn("private", str(caught.exception.detail))


if __name__ == "__main__":
    unittest.main()
