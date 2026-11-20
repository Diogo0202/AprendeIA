"""RF07 local: relógio, dependências e ausência de execução destrutiva."""

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))
from account_lifecycle import account_status, check_access, register_lifecycle_routes


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.user = {"id": str(uuid4()), "role": "student", "age_band": "adult",
                     "auth_created_at": self.now.isoformat()}

    def test_exact_boundary_for_students_and_teachers(self):
        for role in ("student", "teacher"):
            self.user["role"] = role
            self.assertTrue(account_status(self.user, now=self.now + timedelta(hours=168, microseconds=-1))["allowed"])
            self.assertEqual(account_status(self.user, now=self.now + timedelta(hours=168))["reason"], "account_expired")

    def test_admin_exempt_even_without_clock(self):
        self.assertTrue(account_status({"role": "admin"})["allowed"])

    def test_no_profile_created_at_or_expires_at_fallback(self):
        for bad in (None, "bad", "2026-01-01", "2026-01-01T10:00:00", 42):
            self.user.update(auth_created_at=bad, created_at=self.now.isoformat(), account_expires_at="2099-01-01")
            with self.assertRaises(HTTPException) as error:
                check_access(self.user)
            self.assertEqual(error.exception.status_code, 503)

    def test_future_clock_fails_closed(self):
        self.user["auth_created_at"] = (self.now + timedelta(hours=1)).isoformat()
        self.assertEqual(account_status(self.user)["reason"], "lifecycle_unavailable")

    def test_unknown_and_minor_require_admission_current_version(self):
        for age in ("unknown", "minor", None):
            self.user["age_band"] = age
            self.assertFalse(account_status(self.user)["allowed"])
        self.user.update(age_band="minor", admission_status="approved", admission_version="0")
        self.assertFalse(account_status(self.user)["allowed"])
        self.user["admission_version"] = "1"
        self.assertIs(check_access(self.user), self.user)

    def test_approval_never_extends_clock(self):
        self.user.update(auth_created_at=(self.now-timedelta(hours=169)).isoformat(),
                         age_band="minor", admission_status="approved", admission_version="1",
                         account_expires_at="2099-01-01T00:00:00+00:00")
        self.assertEqual(account_status(self.user)["reason"], "account_expired")


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.user = {"id": str(uuid4()), "role": "student", "age_band": "minor",
                     "auth_created_at": (datetime.now(timezone.utc)-timedelta(hours=169)).isoformat(),
                     "responsible_contact": "private@example.test"}
        self.authenticated = True
        self.admin = False
        self.enabled = False
        self.secret = "local-test-secret"
        self.db = Mock()
        self.db.rpc.return_value.execute.return_value = SimpleNamespace(data={"ok": True})
        self.limit = Mock()

        def user():
            if not self.authenticated:
                raise HTTPException(401, "Sessão ausente")
            return self.user

        def admin():
            if not self.admin:
                raise HTTPException(403, "Admin exigido")
            return {"id": str(uuid4()), "role": "admin"}

        app = FastAPI()
        register_lifecycle_routes(app, database=lambda: self.db, user_dependency=user,
                                  admin_dependency=admin, enforce_limit=self.limit,
                                  retention_secret=lambda: self.secret,
                                  retention_enabled=lambda: self.enabled)
        self.client = TestClient(app)

    def test_status_expired_pending_and_self_metadata_only(self):
        response = self.client.get("/account/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reason"], "account_expired")
        self.assertNotIn("private@example.test", response.text)
        self.db.rpc.assert_not_called()

    def test_unauthenticated_status_and_admission(self):
        self.authenticated = False
        self.assertEqual(self.client.get("/account/status").status_code, 401)
        self.assertEqual(self.client.post("/account/admission", json=self.payload()).status_code, 401)
        self.db.rpc.assert_not_called()

    def payload(self):
        return {"responsible_name": "Responsável", "responsible_contact": "contato@example.test",
                "institutional_reference": "Instituição 42", "version": "1"}

    def test_admission_owner_from_session_and_validation(self):
        self.assertEqual(self.client.post("/account/admission", json=self.payload()).status_code, 201)
        name, params = self.db.rpc.call_args.args
        self.assertEqual(name, "request_account_admission")
        self.assertEqual(params["p_actor"], self.user["id"])
        for extra in ({"user_id": str(uuid4())}, {"dob": "2010-01-01"}, {"version": "0"}, {"responsible_name": "  "}):
            self.assertEqual(self.client.post("/account/admission", json={**self.payload(), **extra}).status_code, 422)

    def test_age_declaration_rejects_dob_and_identity(self):
        self.assertEqual(self.client.put("/account/age-band", json={"age_band": "adult"}).status_code, 200)
        self.assertEqual(self.client.put("/account/age-band", json={"age_band": "adult", "dob": "2000-01-01"}).status_code, 422)

    def test_admin_endpoints_protected_and_review_versioned(self):
        path = "/admin/account-admissions/"+str(uuid4())+"/review"
        data = {"decision": "approved", "version": "1", "note": "Conferido"}
        self.assertEqual(self.client.get("/admin/account-admissions").status_code, 403)
        self.assertEqual(self.client.post(path, json=data).status_code, 403)
        self.admin = True
        self.assertEqual(self.client.get("/admin/account-admissions").status_code, 200)
        self.assertEqual(self.client.post(path, json=data).status_code, 200)
        self.assertEqual(self.db.rpc.call_args.args[1]["p_version"], "1")

    def test_provider_failure_closed_without_details(self):
        self.db.rpc.return_value.execute.side_effect = RuntimeError("provider secret")
        response = self.client.put("/account/age-band", json={"age_band": "adult"})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("provider secret", response.text)

    def test_retention_requires_secret_and_never_deletes_even_when_enabled(self):
        for action in ("preview", "execute"):
            path = "/internal/account-retention/"+action
            self.assertEqual(self.client.post(path).status_code, 403)
            self.secret = None
            self.assertEqual(self.client.post(path).status_code, 503)
            self.secret = "local-test-secret"
        headers = {"x-account-retention-secret": self.secret}
        self.assertEqual(self.client.post("/internal/account-retention/preview", headers=headers).status_code, 200)
        self.db.reset_mock()
        for enabled in (False, True):
            self.enabled = enabled
            self.assertEqual(self.client.post("/internal/account-retention/execute", headers=headers).status_code, 503)
        self.db.rpc.assert_not_called()
        self.db.auth.admin.delete_user.assert_not_called()
        self.db.storage.from_.assert_not_called()


if __name__ == "__main__":
    unittest.main()
