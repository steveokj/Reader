from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import MarkerCreate, MarkerResponse, MarkersResponse
from ..services import markers as markers_service

router = APIRouter(prefix="/markers", tags=["markers"])


@router.post("", response_model=MarkerResponse)
def create_marker(payload: MarkerCreate):
    conn = get_conn()
    try:
        marker = markers_service.create_marker(conn, payload.model_dump())
        return {"marker": marker}
    finally:
        conn.close()


@router.get("", response_model=MarkersResponse)
def list_markers(target_type: str, target_id: int):
    conn = get_conn()
    try:
        markers = markers_service.get_markers(conn, target_type, target_id)
        return {"markers": markers}
    finally:
        conn.close()


@router.delete("/{marker_id}")
def delete_marker(marker_id: int):
    conn = get_conn()
    try:
        deleted = markers_service.delete_marker(conn, marker_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Marker not found")
        return {"ok": True}
    finally:
        conn.close()
