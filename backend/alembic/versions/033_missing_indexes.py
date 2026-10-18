"""O3 missing indexes: spans/llm created_at, dataset_items, experiments, alert_rules, datasets.

Revision ID: 033_missing_indexes
Revises: 032_schedule_unique_entry
"""

from alembic import op

revision: str = "033_missing_indexes"
down_revision: str = "032_schedule_unique_entry"
branch_labels = None
depends_on = None


INDEXES = [
    ("ix_llm_calls_created_at", "llm_calls", ["created_at"]),
    ("ix_run_spans_created_at", "run_spans", ["created_at"]),
    ("ix_dataset_items_dataset_id", "dataset_items", ["dataset_id"]),
    ("ix_experiments_workflow_id", "experiments", ["workflow_id"]),
    ("ix_experiments_dataset_id", "experiments", ["dataset_id"]),
    ("ix_alert_rules_enabled", "alert_rules", ["enabled"]),
    ("ix_datasets_workflow_id", "datasets", ["workflow_id"]),
]


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns, if_not_exists=True)


def downgrade() -> None:
    for name, table, _columns in reversed(INDEXES):
        op.drop_index(name, table_name=table, if_exists=True)
