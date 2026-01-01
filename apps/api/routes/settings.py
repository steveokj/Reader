from fastapi import APIRouter

from ..db.conn import get_conn
from ..models.schemas import ReaderSettingsResponse, ReaderSettingsUpdate
from ..services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=ReaderSettingsResponse)
def get_reader_settings():
    conn = get_conn()
    try:
        settings = settings_service.get_settings(conn)
        return {"settings": settings}
    finally:
        conn.close()


@router.patch("", response_model=ReaderSettingsResponse)
def update_reader_settings(payload: ReaderSettingsUpdate):
    conn = get_conn()
    try:
        settings = settings_service.update_settings(conn, payload.model_dump(exclude_none=True))
        return {"settings": settings}
    finally:
        conn.close()
