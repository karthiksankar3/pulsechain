from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session


def load_sales_csv(filepath: str | Path, db: Session) -> int:
    """Parse a sales CSV file and bulk-insert records into the database.

    Returns the number of rows inserted.
    """
    ...


def load_inventory_csv(filepath: str | Path, db: Session) -> int:
    """Parse an inventory snapshot CSV and bulk-insert records.

    Returns the number of rows inserted.
    """
    ...


def validate_sales_dataframe(df: pd.DataFrame) -> tuple[bool, list[str]]:
    """Validate a sales DataFrame against the expected schema.

    Returns (is_valid, list_of_errors).
    """
    ...


def normalize_date_column(df: pd.DataFrame, col: str) -> pd.DataFrame:
    """Coerce a date column to ISO format and drop rows with unparseable dates."""
    ...
