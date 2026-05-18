"""add retention_days canonical value

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 2555 days ≈ 7 years — common NARA retention baseline for administrative records
_DEFAULT_DAYS = "2555"


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO canonical_values (key, value) VALUES (:key, :value) "
            "ON CONFLICT (key) DO NOTHING"
        ).bindparams(key="retention_days", value=_DEFAULT_DAYS)
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM canonical_values WHERE key = 'retention_days'")
    )
