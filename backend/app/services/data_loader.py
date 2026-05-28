from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from app.models.inventory import InventorySnapshot
from app.models.sales import SalesRecord
from app.models.sku import SKU

DATA_DIR = Path(__file__).parent.parent.parent / "data"

ATC_META: dict[str, dict[str, str]] = {
    "M01AB": {"name": "Diclofenac (Anti-inflammatory)", "therapy_area": "Musculoskeletal"},
    "M01AE": {"name": "Ibuprofen (Anti-inflammatory)", "therapy_area": "Musculoskeletal"},
    "N02BA": {"name": "Aspirin (Analgesic)", "therapy_area": "Pain Management"},
    "N02BE": {"name": "Paracetamol (Analgesic)", "therapy_area": "Pain Management"},
    "N05B":  {"name": "Diazepam (Anxiolytic)", "therapy_area": "CNS"},
    "N05C":  {"name": "Hypnotics & Sedatives", "therapy_area": "CNS"},
    "R03":   {"name": "Respiratory Drugs (Airway)", "therapy_area": "Respiratory"},
    "R06":   {"name": "Antihistamines", "therapy_area": "Respiratory"},
}


def load_pharma_sales_atc(db: Session) -> dict:
    csv_path = DATA_DIR / "salesdaily.csv"
    df = pd.read_csv(csv_path)

    df["datum"] = pd.to_datetime(df["datum"], infer_datetime_format=True, errors="coerce")
    df = df.dropna(subset=["datum"])

    atc_cols = [c for c in ATC_META if c in df.columns]
    df = df[["datum"] + atc_cols]

    melted = df.melt(id_vars="datum", var_name="atc_code", value_name="quantity")
    melted = melted.dropna(subset=["quantity"])
    melted["quantity"] = pd.to_numeric(melted["quantity"], errors="coerce").fillna(0.0)
    melted = melted[melted["quantity"] >= 0]

    # Upsert SKU records
    skus_created = 0
    sku_map: dict[str, int] = {}
    for code in atc_cols:
        meta = ATC_META[code]
        existing = db.query(SKU).filter(SKU.code == code).first()
        if existing is None:
            sku = SKU(
                code=code,
                name=meta["name"],
                therapeutic_area=meta["therapy_area"],
                category="ATC",
                unit_of_measure="units",
            )
            db.add(sku)
            db.flush()
            sku_map[code] = sku.id
            skus_created += 1
        else:
            sku_map[code] = existing.id

    # Bulk insert sales records in batches
    batch: list[SalesRecord] = []
    for row in melted.itertuples(index=False):
        code: str = row.atc_code  # type: ignore[assignment]
        if code not in sku_map:
            continue
        batch.append(
            SalesRecord(
                sku_id=sku_map[code],
                sale_date=row.datum.date(),
                quantity=float(row.quantity),
            )
        )
        if len(batch) >= 2000:
            db.bulk_save_objects(batch)
            batch = []

    if batch:
        db.bulk_save_objects(batch)

    db.commit()

    date_min = melted["datum"].min()
    date_max = melted["datum"].max()
    return {
        "skus_created": skus_created,
        "records_inserted": len(melted),
        "date_range": {
            "start": date_min.strftime("%Y-%m-%d"),
            "end": date_max.strftime("%Y-%m-%d"),
        },
    }


def load_supply_chain_inventory(db: Session) -> int:
    csv_path = DATA_DIR / "Pharmaceutical supply chain set.csv"
    if not csv_path.exists():
        return 0

    sc_df = pd.read_csv(csv_path)

    # Map unique regions to warehouse codes and generate synthetic snapshots
    skus = db.query(SKU).all()
    if not skus:
        return 0

    regions = sc_df["Region"].dropna().unique().tolist()[:len(skus)]
    now = datetime.now(timezone.utc)

    snapshots: list[InventorySnapshot] = []
    for idx, sku in enumerate(skus):
        # Pull average daily sales for this SKU to derive stock levels
        records = (
            db.query(SalesRecord)
            .filter(SalesRecord.sku_id == sku.id)
            .order_by(SalesRecord.sale_date.desc())
            .limit(30)
            .all()
        )
        avg_daily = (
            sum(r.quantity for r in records) / max(len(records), 1)
        )

        warehouse = regions[idx % len(regions)] if regions else "CENTRAL"
        qoh = round(avg_daily * 30, 2)
        qres = round(avg_daily * 7, 2)
        qit = round(avg_daily * 14, 2)
        dos = round(qoh / max(avg_daily, 0.1), 1)

        snapshots.append(
            InventorySnapshot(
                sku_id=sku.id,
                warehouse_code=warehouse,
                snapshot_at=now,
                quantity_on_hand=qoh,
                quantity_reserved=qres,
                quantity_in_transit=qit,
                days_of_supply=dos,
                status="normal" if dos >= 14 else ("low" if dos >= 7 else "critical"),
            )
        )

    db.bulk_save_objects(snapshots)
    db.commit()
    return len(snapshots)


def seed_demo_data(db: Session) -> None:
    sales_count = db.query(SalesRecord).count()
    if sales_count == 0:
        print("🌱 Seeding pharma sales data...")
        result = load_pharma_sales_atc(db)
        print(
            f"  ✅ SKUs created: {result['skus_created']} | "
            f"Records inserted: {result['records_inserted']} | "
            f"Range: {result['date_range']['start']} → {result['date_range']['end']}"
        )
    else:
        print(f"📊 Sales records already present ({sales_count:,} rows) — skipping seed.")

    inv_count = db.query(InventorySnapshot).count()
    if inv_count == 0:
        print("🏭 Seeding inventory snapshots...")
        n = load_supply_chain_inventory(db)
        print(f"  ✅ Inventory snapshots created: {n}")
    else:
        print(f"📦 Inventory snapshots already present ({inv_count}) — skipping seed.")


# Legacy helpers kept for compatibility
def load_sales_csv(filepath: str | Path, db: Session) -> int:
    return 0


def load_inventory_csv(filepath: str | Path, db: Session) -> int:
    return 0


def validate_sales_dataframe(df: pd.DataFrame) -> tuple[bool, list[str]]:
    required = {"datum"}
    missing = required - set(df.columns)
    if missing:
        return False, [f"Missing columns: {missing}"]
    return True, []


def normalize_date_column(df: pd.DataFrame, col: str) -> pd.DataFrame:
    df = df.copy()
    df[col] = pd.to_datetime(df[col], infer_datetime_format=True, errors="coerce")
    return df.dropna(subset=[col])
