"""add auth_logs table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_identity", sa.String(255), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("event", sa.String(30), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("failure_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_auth_logs_event", "auth_logs", ["event"])
    op.create_index("ix_auth_logs_created_at", "auth_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("auth_logs")
