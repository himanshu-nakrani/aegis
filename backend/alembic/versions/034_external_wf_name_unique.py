"""034 external workflow name unique: partial unique index so concurrent OTLP
ingests of the same service name converge on one workflow row — the
savepoint+reselect in resolve_external_workflow only fires when an
IntegrityError exists to raise, which requires this constraint. Partial so
user-authored workflows sharing a name stay legal.

Revision ID: 034_external_wf_name_unique
Revises: 033_missing_indexes
"""

import sqlalchemy as sa
from alembic import op

revision: str = "034_external_wf_name_unique"
down_revision: str = "033_missing_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_workflows_external_name",
        "workflows",
        ["user_id", "name"],
        unique=True,
        postgresql_where=sa.text("name LIKE '[external] %'"),
        sqlite_where=sa.text("name LIKE '[external] %'"),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("uq_workflows_external_name", table_name="workflows", if_exists=True)
