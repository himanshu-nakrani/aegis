"""Unique (workflow_id, version_number) on workflow_versions.

Concurrent ``POST /api/workflows/{id}/versions`` calls read the same latest
version_number and insert duplicates; ``_latest_version`` (ORDER BY
version_number DESC) then picks arbitrarily, making deploy pins
nondeterministic. The unique constraint turns the race into an
IntegrityError the endpoint retries (mirrors the prompts version pattern).

Existing duplicates are RENUMBERED, never deleted: every version row (and
the runs/deployments/pins referencing it by id) survives; only the
colliding version_number values move to fresh slots above the current max.
Runs created against either duplicate keep their pinned version id, so no
history or FK is disturbed.

On Postgres this is a plain ADD CONSTRAINT after the renumber. On SQLite,
ADD CONSTRAINT is unsupported, so the table is rebuilt via batch mode
(Alembic handles the copy).

Revision ID: 029_version_number_unique
Revises: 028_checkpoint_context_patch
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "029_version_number_unique"
down_revision: Union[str, Sequence[str], None] = "028_checkpoint_context_patch"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "uq_workflow_versions_workflow_version"


def _renumber_duplicates() -> None:
    """Shift colliding version_numbers to fresh slots, preserving every row.

    For each (workflow_id, version_number) group with >1 row, keep the
    oldest row (min rowid/id) on the original number and move each extra row
    to max+1, max+2, ... computed per workflow. Referenced by id everywhere
    (runs, deployments, schedules), so renumbering the label is safe.
    """
    conn = op.get_bind()
    dialect = conn.dialect.name
    id_col = "rowid" if dialect == "sqlite" else "ctid"

    dup_groups = conn.execute(
        sa.text(
            "SELECT workflow_id, version_number, COUNT(*) AS n "
            "FROM workflow_versions "
            "GROUP BY workflow_id, version_number HAVING COUNT(*) > 1"
        )
    ).all()
    for workflow_id, version_number, _n in dup_groups:
        rows = conn.execute(
            sa.text(
                f"SELECT id, {id_col} AS ordering, version_number "
                "FROM workflow_versions "
                "WHERE workflow_id = :wid AND version_number = :num "
                f"ORDER BY {id_col}"
            ),
            {"wid": workflow_id, "num": version_number},
        ).all()
        current_max = conn.execute(
            sa.text(
                "SELECT COALESCE(MAX(version_number), 0) FROM workflow_versions "
                "WHERE workflow_id = :wid"
            ),
            {"wid": workflow_id},
        ).scalar()
        # Keep the oldest row on the original number; shift the rest up.
        for offset, row in enumerate(rows[1:], start=1):
            conn.execute(
                sa.text(
                    "UPDATE workflow_versions SET version_number = :num "
                    "WHERE id = :rid"
                ),
                {"num": current_max + offset, "rid": row[0]},
            )


def upgrade() -> None:
    _renumber_duplicates()
    with op.batch_alter_table("workflow_versions") as batch_op:
        batch_op.create_unique_constraint(_CONSTRAINT, ["workflow_id", "version_number"])


def downgrade() -> None:
    with op.batch_alter_table("workflow_versions") as batch_op:
        batch_op.drop_constraint(_CONSTRAINT, type_="unique")
