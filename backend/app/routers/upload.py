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
from app.core.security import get_session_id
from app.models.forecast import Forecast
from app.models.inventory import InventorySnapshot
from app.models.sales import SalesRecord
from app.models.sku import SKU
from app.services.data_loader import load_pharma_sales_atc, load_supply_chain_inventory

router = APIRouter(prefix="/upload", tags=["upload"])

# In-memory staging store (keyed by file_id)
_staged: dict[str, dict] = {}

DATA_DIR = Path(__file__).parent.parent.parent / "data"
SESSION_DATA_PATH = DATA_DIR / "session_datasets.json"

TEMPLATE_COLUMNS = ["date", "product_name", "quantity", "revenue", "geography", "channel"]
TEMPLATE_EXAMPLES = [
    ["2024-01-01", "Amoxicillin 500mg", "1200", "3600.00", "North", "Retail"],
    ["2024-01-08", "Amoxicillin 500mg", "1350", "4050.00", "North", "Retail"],
    ["2024-01-01", "Ibuprofen 400mg", "980", "1960.00", "South", "Hospital"],
]

DEMO_DEFAULTS = {
    "source": "demo",
    "sku_count": 8,
    "record_count": 16848,
    "date_range_start": "2014-01-02",
    "date_range_end": "2019-10-08",
    "uploaded_at": None,
}


# ---- Session dataset helpers ----------------------------------------

def _load_session_data() -> dict:
    try:
        with open(SESSION_DATA_PATH, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _save_session_data(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SESSION_DATA_PATH, "w") as f:
        json.dump(data, f, indent=2)


class ColumnMapping(BaseModel):
    file_id: str
    column_mapping: dict[str, str]


class IngestRequest(BaseModel):
    file_id: str
    column_mapping: dict[str, str]
    organization_name: str = "Demo Org"


# ---- Endpoints -------------------------------------------------------

@router.post("/csv")
async def upload_csv(file: UploadFile = File(...)) -> dict:
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(status_code=400, detail="Only CSV and XLSX files are supported")

    contents = await file.read()
    if len(contents) / (1024 * 1024) > 50:
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
            min_d, max_d = parsed.min(), parsed.max()
            if pd.notna(min_d) and pd.notna(max_d):
                date_range = f"{min_d.date()} to {max_d.date()}"
        except Exception:
            pass

    return {
        "file_id": file_id,
        "filename": file.filename,
        "row_count": len(df),
        "detected_columns": list(df.columns),
        "date_range": date_range,
        "preview": df.head(5).fillna("").to_dict(orient="records"),
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
            bad = int(pd.to_numeric(df[their_col], errors="coerce").isna().sum())
            if bad > 0:
                errors.append(f"'{their_col}' has {bad} non-numeric values in quantity column")
        if our_col == "date":
            bad = int(pd.to_datetime(df[their_col], errors="coerce").isna().sum())
            if bad > 0:
                errors.append(f"'{their_col}' has {bad} unparseable date values")

    rename = {v: k for k, v in payload.column_mapping.items() if v in df.columns}
    preview = df.head(5).rename(columns=rename).fillna("").to_dict(orient="records")

    return {"valid": len(errors) == 0, "errors": errors, "preview": preview}


@router.post("/ingest")
def ingest_data(
    payload: IngestRequest,
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> dict:
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

    # Delete this session's existing data only (never touch session_id="demo")
    db.query(Forecast).filter(Forecast.session_id == session_id).delete(synchronize_session=False)
    db.query(InventorySnapshot).filter(InventorySnapshot.session_id == session_id).delete(synchronize_session=False)
    db.query(SalesRecord).filter(SalesRecord.session_id == session_id).delete(synchronize_session=False)
    db.query(SKU).filter(SKU.session_id == session_id).delete(synchronize_session=False)
    db.commit()

    # Create new SKUs tagged with this session_id
    # Include session suffix in code to avoid global unique constraint collisions
    sess_tag = session_id[-8:] if len(session_id) > 8 else session_id
    unique_products = df["product_name"].unique()
    skus_created = 0
    sku_map: dict[str, int] = {}

    for prod_name in unique_products:
        base_code = f"S{sess_tag}-{str(prod_name)[:8].upper().replace(' ', '_')}"
        code = base_code
        i = 1
        while db.query(SKU).filter(SKU.code == code).first():
            code = f"S{sess_tag}-{i}-{str(prod_name)[:6].upper().replace(' ', '_')}"
            i += 1
        sku = SKU(
            code=code,
            name=str(prod_name),
            category=payload.organization_name,
            therapeutic_area="Uploaded",
            session_id=session_id,
        )
        db.add(sku)
        db.flush()
        sku_map[str(prod_name)] = sku.id
        skus_created += 1

    # Insert sales records tagged with session_id
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
            session_id=session_id,
        )
        db.add(sr)
        records_inserted += 1

    # Create inventory snapshots for each new SKU
    for prod_name, sku_id in sku_map.items():
        snapshot = InventorySnapshot(
            sku_id=sku_id,
            warehouse_code="UPLOAD",
            snapshot_at=datetime.utcnow(),
            quantity_on_hand=float(random.randint(50, 500)),
            quantity_reserved=0.0,
            quantity_in_transit=0.0,
            days_of_supply=0.0,
            status="normal",
            session_id=session_id,
        )
        db.add(snapshot)

    db.commit()

    del _staged[payload.file_id]

    first_date = df["date"].min().date().isoformat()
    last_date = df["date"].max().date().isoformat()

    # Save per-session dataset info
    session_data = _load_session_data()
    session_data[session_id] = {
        "source": "custom",
        "filename": original_filename,
        "sku_count": skus_created,
        "record_count": records_inserted,
        "date_range_start": first_date,
        "date_range_end": last_date,
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    _save_session_data(session_data)

    return {
        "message": f"Successfully imported {records_inserted} records for {skus_created} SKUs",
        "skus_created": skus_created,
        "records_inserted": records_inserted,
        "date_range": f"{first_date} to {last_date}",
    }


@router.get("/current-dataset")
def get_current_dataset(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> dict:
    # Check if session has uploaded SKUs
    has_custom = db.query(SKU.id).filter(SKU.session_id == session_id).limit(1).count() > 0
    if not has_custom:
        return {**DEMO_DEFAULTS, "session_id": session_id}

    session_data = _load_session_data()
    if session_id in session_data:
        return {**session_data[session_id], "session_id": session_id}

    # Session has SKUs but no metadata file entry — synthesize it
    sku_count = db.query(SKU).filter(SKU.session_id == session_id).count()
    record_count = db.query(SalesRecord).filter(SalesRecord.session_id == session_id).count()
    return {
        "source": "custom",
        "sku_count": sku_count,
        "record_count": record_count,
        "date_range_start": None,
        "date_range_end": None,
        "uploaded_at": None,
        "session_id": session_id,
    }


@router.post("/reset-demo")
def reset_to_demo(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> dict:
    # Only delete this session's uploaded data — never demo data
    db.query(Forecast).filter(Forecast.session_id == session_id).delete(synchronize_session=False)
    db.query(InventorySnapshot).filter(InventorySnapshot.session_id == session_id).delete(synchronize_session=False)
    db.query(SalesRecord).filter(SalesRecord.session_id == session_id).delete(synchronize_session=False)
    db.query(SKU).filter(SKU.session_id == session_id).delete(synchronize_session=False)
    db.commit()

    # Remove session entry from datasets file
    session_data = _load_session_data()
    session_data.pop(session_id, None)
    _save_session_data(session_data)

    return {
        "message": "Reset complete — showing demo data",
        "session_id": session_id,
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
