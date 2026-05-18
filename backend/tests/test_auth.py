"""
Tests for authentication enforcement and role-based access control.

Every endpoint must reject unauthenticated requests with 401.
Admin-only endpoints must reject agent-role sessions with 403.
"""
import io
import json
import os

import pytest

DEMO_BYPASS_CODE = os.environ["DEMO_BYPASS_CODE"]

_APP_DATA = {
    "brand_name": "Test Brand",
    "class_type": "Vodka",
    "abv": "40% Alc./Vol.",
    "net_contents": "750 mL",
    "bottler_name": "Test Bottler",
    "bottler_city": "Washington",
    "bottler_state": "DC",
    "bottler_zip": "20001",
    "type_of_product": "Distilled Spirits",
}


class TestUnauthenticated:
    """No session cookie → 401 on all protected endpoints."""

    def test_verify_rejects_unauthenticated(self, anon_client):
        resp = anon_client.post(
            "/api/verify/",
            files={"image": ("label.jpg", io.BytesIO(b"\xff\xd8\xff"), "image/jpeg")},
            data={"application_data": json.dumps(_APP_DATA)},
        )
        assert resp.status_code == 401

    def test_finalize_rejects_unauthenticated(self, anon_client):
        resp = anon_client.post("/api/verify/finalize", json={})
        assert resp.status_code == 401

    def test_audit_log_rejects_unauthenticated(self, anon_client):
        resp = anon_client.get("/api/admin/audit-logs")
        assert resp.status_code == 401

    def test_canonical_values_rejects_unauthenticated(self, anon_client):
        resp = anon_client.get("/api/admin/canonical-values")
        assert resp.status_code == 401


class TestRBAC:
    """Agent-role sessions are rejected from admin endpoints with 403.
    Admin-role sessions pass the auth gate (response shape may vary due to mocked DB).
    """

    def test_agent_cannot_read_audit_logs(self, agent_client):
        resp = agent_client.get("/api/admin/audit-logs")
        assert resp.status_code == 403

    def test_agent_cannot_export_audit_logs(self, agent_client):
        resp = agent_client.get("/api/admin/audit-logs/export")
        assert resp.status_code == 403

    def test_agent_cannot_read_canonical_values(self, agent_client):
        resp = agent_client.get("/api/admin/canonical-values")
        assert resp.status_code == 403

    def test_agent_cannot_list_users(self, agent_client):
        resp = agent_client.get("/api/admin/users")
        assert resp.status_code == 403

    def test_admin_passes_audit_log_auth_gate(self, admin_client):
        resp = admin_client.get("/api/admin/audit-logs")
        # 403 = RBAC rejected; anything else (200 or 500 from mock DB) means auth passed.
        assert resp.status_code != 403

    def test_admin_passes_canonical_values_auth_gate(self, admin_client):
        resp = admin_client.get("/api/admin/canonical-values")
        assert resp.status_code != 403


# ── Demo bypass authentication ────────────────────────────────────────────────

class TestDemoAuth:
    """The demo bypass code is essential for federal environments where network policy
    blocks OAuth popups. Agents should always be able to enter the app via the code.

    The code is injected by backend/tests/conftest.py.
    """

    def test_valid_demo_code_returns_ok_and_sets_session(self, anon_client):
        resp = anon_client.post("/api/auth/demo", json={"code": DEMO_BYPASS_CODE})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_invalid_demo_code_returns_401(self, anon_client):
        resp = anon_client.post("/api/auth/demo", json={"code": "not-the-right-code"})
        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]

    def test_empty_code_returns_401(self, anon_client):
        resp = anon_client.post("/api/auth/demo", json={"code": ""})
        assert resp.status_code == 401


# ── CSRF middleware ────────────────────────────────────────────────────────────

class TestCSRF:
    """CSRF middleware blocks state-changing requests that have a session cookie
    but a missing or mismatched X-CSRF-Token header."""

    def test_missing_header_returns_403(self, anon_client):
        anon_client.cookies.set("ttb_session", "fake-session")
        anon_client.cookies.set("ttb_csrf", "valid-token")
        resp = anon_client.post("/api/verify/finalize", json={})
        assert resp.status_code == 403
        assert "CSRF" in resp.json()["detail"]

    def test_wrong_header_value_returns_403(self, anon_client):
        anon_client.cookies.set("ttb_session", "fake-session")
        anon_client.cookies.set("ttb_csrf", "valid-token")
        resp = anon_client.post(
            "/api/verify/finalize", json={},
            headers={"X-CSRF-Token": "wrong-token"},
        )
        assert resp.status_code == 403

    def test_matching_token_passes_middleware(self, anon_client):
        # CSRF passes but the session is invalid → auth returns 401, not 403
        anon_client.cookies.set("ttb_session", "fake-session")
        anon_client.cookies.set("ttb_csrf", "abc123")
        resp = anon_client.post(
            "/api/verify/finalize", json={},
            headers={"X-CSRF-Token": "abc123"},
        )
        assert resp.status_code == 401

    def test_no_session_cookie_skips_csrf_check(self, anon_client):
        # Without a session cookie, CSRF middleware defers to auth (returns 401)
        resp = anon_client.post("/api/verify/finalize", json={})
        assert resp.status_code == 401

    def test_demo_login_exempt_from_csrf(self, anon_client):
        # /api/auth/demo is a pre-auth endpoint, must work without CSRF token
        resp = anon_client.post("/api/auth/demo", json={"code": DEMO_BYPASS_CODE})
        assert resp.status_code == 200
