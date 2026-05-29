from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.routers import auth, forecasting, inventory, scenarios, social, sop, upload

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create tables if they don't exist (dev convenience — use Alembic in prod)
    Base.metadata.create_all(bind=engine)

    from app.services.data_loader import seed_demo_data

    db = SessionLocal()
    try:
        print("🚀 PulseChain startup — seeding demo data...")
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
