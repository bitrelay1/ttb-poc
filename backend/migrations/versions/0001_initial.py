"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GOVERNMENT_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink "
    "alcoholic beverages during pregnancy because of the risk of birth defects. "
    "(2) Consumption of alcoholic beverages impairs your ability to drive a car or operate "
    "machinery, and may cause health problems."
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="agent"),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("session_identity", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("label_filename", sa.String(255), nullable=False),
        sa.Column("batch_id", UUID(as_uuid=True), nullable=True),
        sa.Column("application_data", JSON, nullable=False),
        sa.Column("field_results", JSON, nullable=False),
        sa.Column("overall_result", sa.String(10), nullable=False),
    )
    op.create_index("ix_audit_logs_batch_id", "audit_logs", ["batch_id"])

    op.create_table(
        "canonical_values",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_canonical_values_key", "canonical_values", ["key"], unique=True)

    # Seed canonical government warning text — editable by admin but always present
    op.execute(
        sa.text("INSERT INTO canonical_values (key, value) VALUES (:key, :value)").bindparams(
            key="government_warning", value=GOVERNMENT_WARNING
        )
    )


def downgrade() -> None:
    op.drop_table("canonical_values")
    op.drop_table("audit_logs")
    op.drop_table("users")
