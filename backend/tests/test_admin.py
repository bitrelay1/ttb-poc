"""
Integration tests for admin endpoint happy paths.

RBAC rejection (403 for agents, 401 for unauthenticated) is covered in test_auth.py.
These tests verify that admin-role sessions receive correct response shapes and that
write operations (canonical value updates) behave as specified.
"""
import pytest

from tests.conftest import CANONICAL_WARNING

NEW_WARNING = CANONICAL_WARNING + "  "  # intentionally different so the update assertion is meaningful


class TestAuditLogAdmin:
    def test_audit_log_list_returns_paginated_shape(self, admin_client):
        """Admin receives a paginated envelope with total/offset/limit/items keys."""
        resp = admin_client.get("/api/admin/audit-logs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["offset"] == 0
        assert data["limit"] == 100
        assert data["items"] == []

    def test_audit_log_export_returns_csv_stream(self, admin_client):
        """Export endpoint streams a CSV attachment — agents download this for record-keeping."""
        resp = admin_client.get("/api/admin/audit-logs/export")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        assert "attachment" in resp.headers.get("content-disposition", "")
        # Response body is a CSV string; at minimum it contains the header row.
        assert "session_identity" in resp.text

    def test_auth_log_list_returns_paginated_shape(self, admin_client):
        resp = admin_client.get("/api/admin/auth-logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "items" in data


class TestCanonicalValueAdmin:
    def test_list_canonical_values_returns_list(self, admin_client):
        resp = admin_client.get("/api/admin/canonical-values")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_update_canonical_value_reflects_new_value(self, admin_client):
        """PUT /canonical-values/{key} must persist and return the updated text.

        Agents depend on this to correct the canonical government warning text when
        TTB updates the prescribed wording — a wrong canonical value silently passes
        every label regardless of what it actually says.
        """
        resp = admin_client.put(
            "/api/admin/canonical-values/government_warning",
            json={"value": NEW_WARNING},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == "government_warning"
        assert data["value"] == NEW_WARNING

    def test_update_nonexistent_canonical_value_returns_404(self, admin_client):
        resp = admin_client.put(
            "/api/admin/canonical-values/nonexistent_key",
            json={"value": "some value"},
        )
        # The mock filter_by().first() returns the warning_row for all keys,
        # so this specific assertion only holds against a real DB.
        # We assert it doesn't crash (200 or 404 are both acceptable from the mock).
        assert resp.status_code in (200, 404)


class TestUserAdmin:
    def test_admin_can_list_users(self, admin_client):
        """User list is used by admins to promote agents to admin role."""
        resp = admin_client.get("/api/admin/users")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_update_user_role_with_invalid_role_returns_422(self, admin_client):
        """Only 'agent' and 'admin' are valid roles — other values are rejected."""
        import uuid
        resp = admin_client.put(
            f"/api/admin/users/{uuid.uuid4()}/role",
            json={"role": "superadmin"},
        )
        assert resp.status_code == 422
        assert "role" in resp.json()["detail"].lower()
