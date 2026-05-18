"""add pending status to audit_logs

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("status", sa.String(20), nullable=False, server_default="complete"),
    )
    op.add_column(
        "audit_logs",
        sa.Column("pending_reason", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("audit_logs", "pending_reason")
    op.drop_column("audit_logs", "status")
