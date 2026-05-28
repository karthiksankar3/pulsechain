import csv
import io
import uuid
from datetime import datetime
from typing import Any

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from fastapi import Depends
from app.core.database import get_db
from app.models.sales import SalesRecord
from app.models.sku import SKU

router = APIRouter(prefix="/upload", tags=["upload"])

# In-memory staging store (keyed by file_id)
_staged: dict[str, dict] = {}

TEMPLATE_COLUMNS = ["date", "product_name", "quantity", "revenue", "geography", "channel"]
TEMPLATE_EXAMPLES = [
    ["2024-01-01", "Amoxicillin 500mg", "1200", "3600.00", "North", "Retail"],
    ["2024-01-08", "Amoxicillin 500mg", "1350", "4050.00", "North", "Retail"],
    ["2024-01-01", "Ibuprofen 400mg", "980", "1960.00", "South", "Hospital"],
]


class ColumnMapping(BaseModel):
    file_id: str
    column_mapping: dict[str, str]


class IngestRequest(BaseModel):
    file_id: str
    column_mapping: dict[str, str]
    organization_name: str = "Demo Org"


@router.post("/csv")
async def upload_csv(file: UploadFile = File(...)) -> dict:
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(status_code=400, detail="Only CSV and XLSX files are supported")

    contents = await file.read()
    file_size_mb = len(contents) / (1024 * 1024)
    if file_size_mb > 50:
        raise HTTPException(status_code=400, detail="File exceeds 50 MB limit")

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    file_id = str(uuid.uuid4())
    _staged[file_id] = {"df": df, "filename": file.filename}

    # Detect date range
    date_col = None
    for col in df.columns:
        if any(kw in col.lower() for kw in ("date", "period", "week", "month", "time")):
            date_col = col
            break

    date_range = None
    if date_col:
        try:
            parsed = pd.to_datetime(df[date_col], errors="coerce")
            min_d = parsed.min()
            max_d = parsed.max()
            if pd.notna(min_d) and pd.notna(max_d):
                date_range = f"{min_d.date()} to {max_d.date()}"
        except Exception:
            pass

    preview = df.head(5).fillna("").to_dict(orient="records")

    return {
        "file_id": file_id,
        "filename": file.filename,
        "row_count": len(df),
        "detected_columns": list(df.columns),
        "date_range": date_range,
        "preview": preview,
    }


@router.post("/map-columns")
def map_columns(payload: ColumnMapping) -> dict:
    staged = _staged.get(payload.file_id)
    if staged is None:
        raise HTTPException(status_code=404, detail="File not found — upload first")

    df: pd.DataFrame = staged["df"]
    required = {"date", "product_name", "quantity"}
    errors: list[str] = []

    for our_col in required:
        their_col = payload.column_mapping.get(our_col)
        if not their_col:
            errors.append(f"Missing required mapping for '{our_col}'")
            continue
        if their_col not in df.columns:
            errors.append(f"Column '{their_col}' not found in uploaded file")
            continue

        if our_col == "quantity":
            qty = pd.to_numeric(df[their_col], errors="coerce")
            bad = int(qty.isna().sum())
            if bad > 0:
                errors.append(f"'{their_col}' has {bad} non-numeric values in quantity column")

        if our_col == "date":
            dates = pd.to_datetime(df[their_col], errors="coerce")
            bad = int(dates.isna().sum())
            if bad > 0:
                errors.append(f"'{their_col}' has {bad} unparseable date values")

    # Build preview with mapped column names
    rename = {v: k for k, v in payload.column_mapping.items() if v in df.columns}
    preview_df = df.head(5).rename(columns=rename).fillna("")
    preview = preview_df.to_dict(orient="records")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "preview": preview,
    }


@router.post("/ingest")
def ingest_data(payload: IngestRequest, db: Session = Depends(get_db)) -> dict:
    staged = _staged.get(payload.file_id)
    if staged is None:
        raise HTTPException(status_code=404, detail="File not found — upload first")

    df: pd.DataFrame = staged["df"].copy()
    mapping = payload.column_mapping

    required = {"date", "product_name", "quantity"}
    for col in required:
        if col not in mapping or mapping[col] not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing required column mapping: {col}")

    df = df.rename(columns={v: k for k, v in mapping.items() if v in df.columns})
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce")
    df = df.dropna(subset=["date", "quantity", "product_name"])

    unique_products = df["product_name"].unique()
    skus_created = 0
    sku_map: dict[str, int] = {}

    # Create SKUs for new products
    for prod_name in unique_products:
        existing = db.query(SKU).filter(SKU.name == str(prod_name)).first()
        if existing:
            sku_map[str(prod_name)] = existing.id
        else:
            code = f"UPL-{str(prod_name)[:10].upper().replace(' ', '_')}"
            # Ensure unique code
            i = 1
            while db.query(SKU).filter(SKU.code == code).first():
                code = f"UPL-{i}-{str(prod_name)[:8].upper().replace(' ', '_')}"
                i += 1
            sku = SKU(
                code=code,
                name=str(prod_name),
                category=payload.organization_name,
                therapeutic_area="Uploaded",
            )
            db.add(sku)
            db.flush()
            sku_map[str(prod_name)] = sku.id
            skus_created += 1

    # Insert sales records
    records_inserted = 0
    for _, row in df.iterrows():
        prod = str(row["product_name"])
        sku_id = sku_map.get(prod)
        if sku_id is None:
            continue
        sr = SalesRecord(
            sku_id=sku_id,
            sale_date=row["date"].date(),
            quantity=float(row["quantity"]),
            revenue=float(row["revenue"]) if "revenue" in row and pd.notna(row.get("revenue")) else None,
            region=str(row["geography"]) if "geography" in row and pd.notna(row.get("geography")) else None,
            channel=str(row["channel"]) if "channel" in row and pd.notna(row.get("channel")) else None,
        )
        db.add(sr)
        records_inserted += 1

    db.commit()

    # Clean up staged data
    del _staged[payload.file_id]

    # Date range of inserted data
    min_d = df["date"].min().date().isoformat()
    max_d = df["date"].max().date().isoformat()

    return {
        "skus_created": skus_created,
        "records_inserted": records_inserted,
        "date_range": f"{min_d} to {max_d}",
        "organization": payload.organization_name,
    }


@router.get("/template")
def download_template() -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(TEMPLATE_COLUMNS)
    writer.writerows(TEMPLATE_EXAMPLES)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pulsechain_template.csv"},
    )
