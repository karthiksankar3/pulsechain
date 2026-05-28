import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.sop import SOPService

router = APIRouter(prefix="/sop", tags=["sop"])
_svc = SOPService()


@router.get("/consensus")
def get_consensus_forecast(db: Session = Depends(get_db)) -> list[dict]:
    return _svc.get_consensus_forecast(db)


@router.get("/versions")
def get_forecast_versions(db: Session = Depends(get_db)) -> list[dict]:
    return _svc.get_forecast_versions(db)


@router.get("/accuracy")
def get_accuracy_scorecard(db: Session = Depends(get_db)) -> dict:
    return _svc.get_accuracy_scorecard(db)


@router.get("/calendar")
def get_sop_calendar() -> list[dict]:
    return _svc.get_sop_calendar()


@router.get("/export")
def export_sap_format(db: Session = Depends(get_db)) -> StreamingResponse:
    rows = _svc.export_sap_format(db)

    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pulsechain_sap_export.csv"},
    )
