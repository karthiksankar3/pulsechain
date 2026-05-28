import csv
import io
import json
import random
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.forecast import Forecast
from app.models.inventory import InventorySnapshot
from app.models.sales import SalesRecord
from app.models.sku import SKU
from app.services.data_loader import load_pharma_sales_atc, load_supply_chain_inventory

router = APIRouter(prefix="/upload", tags=["upload"])

# In-memory staging store (keyed by file_id)
_staged: dict[str, dict] = {}

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_PATH = DATA_DIR / "current_dataset.json"

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
    original_filename: str = staged["filename"]
    mapping = payload.column_mapping

    required = {"date", "product_name", "quantity"}
    for col in required:
        if col not in mapping or mapping[col] not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing required column mapping: {col}")

    df = df.rename(columns={v: k for k, v in mapping.items() if v in df.columns})
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce")
    df = df.dropna(subset=["date", "quantity", "product_name"])

    # Step 1: Delete all existing data in dependency order
    db.query(Forecast).delete(synchronize_session=False)
    db.query(InventorySnapshot).delete(synchronize_session=False)
    db.query(SalesRecord).delete(synchronize_session=False)
    db.query(SKU).delete(synchronize_session=False)
    db.commit()

    # Step 2: Create new SKUs from uploaded data
    unique_products = df["product_name"].unique()
    skus_created = 0
    sku_map: dict[str, int] = {}

    for prod_name in unique_products:
        code = f"UPL-{str(prod_name)[:10].upper().replace(' ', '_')}"
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

    # Step 3: Insert new sales records
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

    # Step 4: Create inventory snapshots for each new SKU
    for prod_name, sku_id in sku_map.items():
        current_stock = random.randint(50, 500)
        snapshot = InventorySnapshot(
            sku_id=sku_id,
            warehouse_code="UPLOAD",
            snapshot_at=datetime.utcnow(),
            quantity_on_hand=float(current_stock),
            quantity_reserved=0.0,
            quantity_in_transit=0.0,
            days_of_supply=0.0,
            status="normal",
        )
        db.add(snapshot)

    db.commit()

    # Clean up staged data
    del _staged[payload.file_id]

    first_date = df["date"].min().date().isoformat()
    last_date = df["date"].max().date().isoformat()

    # Step 5: Save dataset info file
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dataset_info = {
        "source": "custom",
        "filename": original_filename,
        "sku_count": skus_created,
        "record_count": records_inserted,
        "date_range_start": first_date,
        "date_range_end": last_date,
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    with open(DATA_PATH, "w") as f:
        json.dump(dataset_info, f)

    # Step 6: Return result
    return {
        "message": f"Successfully imported {records_inserted} records for {skus_created} SKUs",
        "skus_created": skus_created,
        "records_inserted": records_inserted,
        "date_range": f"{first_date} to {last_date}",
    }


@router.get("/current-dataset")
def get_current_dataset() -> dict:
    try:
        with open(DATA_PATH, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            "source": "demo",
            "sku_count": 8,
            "record_count": 16848,
            "date_range_start": "2014-01-02",
            "date_range_end": "2019-10-08",
            "uploaded_at": None,
        }


@router.post("/reset-demo")
def reset_to_demo(db: Session = Depends(get_db)) -> dict:
    # Delete all data in dependency order
    db.query(Forecast).delete(synchronize_session=False)
    db.query(InventorySnapshot).delete(synchronize_session=False)
    db.query(SalesRecord).delete(synchronize_session=False)
    db.query(SKU).delete(synchronize_session=False)
    db.commit()

    # Re-seed pharma sales and inventory snapshots
    result = load_pharma_sales_atc(db)
    n_snapshots = load_supply_chain_inventory(db)

    # Remove custom dataset marker
    try:
        DATA_PATH.unlink()
    except FileNotFoundError:
        pass

    return {
        "message": "Reset to demo data complete",
        "skus_created": result["skus_created"],
        "records_inserted": result["records_inserted"],
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
