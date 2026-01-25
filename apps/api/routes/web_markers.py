from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import WebMarkerCreate, WebMarkerResponse, WebMarkersResponse
from ..services import web_markers as web_markers_service

router = APIRouter(prefix="/web/markers", tags=["web-markers"])


@router.post("", response_model=WebMarkerResponse)
def create_web_marker(payload: WebMarkerCreate):
    conn = get_conn()
    try:
        marker = web_markers_service.create_web_marker(conn, payload.model_dump())
        return {"marker": marker}
    finally:
        conn.close()


@router.get("", response_model=WebMarkersResponse)
def list_web_markers(target_type: str, target_id: int):
    conn = get_conn()
    try:
        markers = web_markers_service.get_web_markers(conn, target_type, target_id)
        return {"markers": markers}
    finally:
        conn.close()


@router.delete("/{marker_id}")
def delete_web_marker(marker_id: int):
    conn = get_conn()
    try:
        deleted = web_markers_service.delete_web_marker(conn, marker_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Marker not found")
        return {"ok": True}
    finally:
        conn.close()
