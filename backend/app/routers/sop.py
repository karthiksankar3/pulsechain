import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_session_id
from app.services.sop import SOPService

router = APIRouter(prefix="/sop", tags=["sop"])
_svc = SOPService()


@router.get("/consensus")
def get_consensus_forecast(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> list[dict]:
    return _svc.get_consensus_forecast(db, session_id)


@router.get("/versions")
def get_forecast_versions(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> list[dict]:
    return _svc.get_forecast_versions(db, session_id)


@router.get("/accuracy")
def get_accuracy_scorecard(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> dict:
    return _svc.get_accuracy_scorecard(db, session_id)


@router.get("/calendar")
def get_sop_calendar() -> list[dict]:
    return _svc.get_sop_calendar()


@router.get("/export")
def export_sap_format(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> StreamingResponse:
    rows = _svc.export_sap_format(db, session_id)

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
