import os

# Set before any app module is imported — pydantic-settings reads env vars at Settings()
# instantiation time, which happens on first import of app.config.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-real")

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.main import app
from app.models import CanonicalValue

CANONICAL_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink "
    "alcoholic beverages during pregnancy because of the risk of birth defects. "
    "(2) Consumption of alcoholic beverages impairs your ability to drive a car or "
    "operate machinery, and may cause health problems."
)


def _make_agent() -> CurrentUser:
    return CurrentUser(
        user_id=None,
        email="agent@ttb.gov",
        name="Test Agent",
        role="agent",
        provider="demo",
        session_identity="agent@ttb.gov",
    )


def _make_admin() -> CurrentUser:
    return CurrentUser(
        user_id=None,
        email="admin@ttb.gov",
        name="Test Admin",
        role="admin",
        provider="demo",
        session_identity="admin@ttb.gov",
    )


@pytest.fixture
def mock_db() -> MagicMock:
    """SQLAlchemy session mock.

    Handles two query patterns used across verify and admin routes:
    - filter_by(...).first() — returns the canonical warning row
    - order_by(...).count() / .offset().limit().all() — returns (0, []) for list endpoints
    """
    db = MagicMock()

    warning_row = MagicMock(spec=CanonicalValue)
    warning_row.id = 1
    warning_row.key = "government_warning"
    warning_row.value = CANONICAL_WARNING
    warning_row.updated_at = None
    db.query.return_value.filter_by.return_value.first.return_value = warning_row

    # Chains for admin list endpoints (no filters applied in tests)
    order_chain = db.query.return_value.order_by.return_value
    order_chain.count.return_value = 0
    order_chain.offset.return_value.limit.return_value.all.return_value = []
    order_chain.all.return_value = []
    db.query.return_value.all.return_value = []

    return db


def _db_gen(mock):
    def _inner():
        yield mock
    return _inner


@pytest.fixture
def agent_client(mock_db):
    app.dependency_overrides[get_db] = _db_gen(mock_db)
    app.dependency_overrides[get_current_user] = _make_agent
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(mock_db):
    app.dependency_overrides[get_db] = _db_gen(mock_db)
    app.dependency_overrides[get_current_user] = _make_admin
    # raise_server_exceptions=False: if route logic fails after auth passes, return 500
    # rather than propagating the exception — keeps RBAC assertions clean.
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def anon_client(mock_db):
    app.dependency_overrides[get_db] = _db_gen(mock_db)
    # No auth override — real get_current_user runs; no session cookie → 401.
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
