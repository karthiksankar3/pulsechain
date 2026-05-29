"""add session_id to all tables

Revision ID: f1c53d97ab7f
Revises: adf3770e5b36
Create Date: 2026-05-28 22:48:33.968647

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f1c53d97ab7f'
down_revision: Union[str, None] = 'adf3770e5b36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS so this migration is safe to re-run on DBs that
    # were partially migrated or bootstrapped via create_all.
    op.execute("ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS session_id VARCHAR(50) NOT NULL DEFAULT 'demo'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_forecasts_session_id ON forecasts (session_id)")
    op.execute("ALTER TABLE inventory_snapshots ADD COLUMN IF NOT EXISTS session_id VARCHAR(50) NOT NULL DEFAULT 'demo'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_inventory_snapshots_session_id ON inventory_snapshots (session_id)")
    op.execute("ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS session_id VARCHAR(50) NOT NULL DEFAULT 'demo'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sales_records_session_id ON sales_records (session_id)")
    op.execute("ALTER TABLE skus ADD COLUMN IF NOT EXISTS session_id VARCHAR(50) NOT NULL DEFAULT 'demo'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_skus_session_id ON skus (session_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_skus_session_id")
    op.execute("ALTER TABLE skus DROP COLUMN IF EXISTS session_id")
    op.execute("DROP INDEX IF EXISTS ix_sales_records_session_id")
    op.execute("ALTER TABLE sales_records DROP COLUMN IF EXISTS session_id")
    op.execute("DROP INDEX IF EXISTS ix_inventory_snapshots_session_id")
    op.execute("ALTER TABLE inventory_snapshots DROP COLUMN IF EXISTS session_id")
    op.execute("DROP INDEX IF EXISTS ix_forecasts_session_id")
    op.execute("ALTER TABLE forecasts DROP COLUMN IF EXISTS session_id")
