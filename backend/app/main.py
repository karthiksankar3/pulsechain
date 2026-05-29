import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sqlalchemy as _sa
from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.routers import auth, forecasting, inventory, scenarios, social, sop, upload

settings = get_settings()


def run_migrations() -> None:
    """Run pending Alembic migrations on startup. Safe to call every time."""
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    alembic_cfg = AlembicConfig(os.path.join(base_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))

    # If alembic_version table is absent the DB was bootstrapped via create_all
    # (no prior migrations). Stamp at the initial revision so only pending
    # migrations (e.g. adding session_id columns) are applied.
    check_engine = _sa.create_engine(settings.database_url)
    try:
        insp = _sa.inspect(check_engine)
        if not insp.has_table("alembic_version"):
            alembic_command.stamp(alembic_cfg, "adf3770e5b36")
    finally:
        check_engine.dispose()

    alembic_command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create tables if they don't exist (dev convenience — use Alembic in prod)
    Base.metadata.create_all(bind=engine)

    try:
        print("🚀 PulseChain startup — running migrations...")
        run_migrations()
        print("✅ Migrations complete.")
    except Exception as exc:
        print(f"⚠️  Migration warning (non-fatal): {exc}")

    from app.services.data_loader import seed_demo_data

    db = SessionLocal()
    try:
        print("🚀 Seeding demo data...")
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
app.include_router(forecasting.router)
app.include_router(inventory.router)
app.include_router(social.router)
app.include_router(scenarios.router)
app.include_router(sop.router)
app.include_router(upload.router)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "version": "1.0.0"}
