from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.routers import anomaly, auth, forecasting, inventory, scenarios, social, sop, upload

settings = get_settings()


def ensure_session_columns() -> None:
    """Add session_id column to any table that's missing it. Safe on every startup."""
    tables_to_update = {
        'skus': 'session_id',
        'sales_records': 'session_id',
        'forecasts': 'session_id',
        'inventory_snapshots': 'session_id',
    }
    inspector = inspect(engine)
    with engine.connect() as conn:
        for table, column in tables_to_update.items():
            try:
                existing_columns = [c['name'] for c in inspector.get_columns(table)]
                if column not in existing_columns:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} VARCHAR DEFAULT 'demo'"))
                    conn.execute(text(f"UPDATE {table} SET {column} = 'demo' WHERE {column} IS NULL"))
                    print(f"✅ Added {column} to {table}")
                else:
                    print(f"✓ {column} already exists in {table}")
            except Exception as e:
                print(f"⚠️ Could not update {table}: {e}")
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)

    try:
        print("🚀 PulseChain startup — ensuring schema...")
        ensure_session_columns()
        print("✅ Schema check complete.")
    except Exception as exc:
        print(f"⚠️  Schema check warning (non-fatal): {exc}")

    from app.services.data_loader import seed_demo_data

    db = SessionLocal()
    try:
        print("🌱 Seeding demo data...")
        seed_demo_data(db)
        print("✅ Startup complete.")
    except Exception as exc:
        print(f"⚠️  Seed failed (non-fatal): {exc}")
    finally:
        db.close()

    yield


app = FastAPI(
    title="PulseChain API",
    description="Pharma demand planning platform backend",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(anomaly.router)
app.include_router(forecasting.router)
app.include_router(inventory.router)
app.include_router(social.router)
app.include_router(scenarios.router)
app.include_router(sop.router)
app.include_router(upload.router)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "version": "1.0.0"}
