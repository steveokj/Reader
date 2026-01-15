from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import MapViewCreate, MapViewResponse, MapViewsResponse
from ..services import map_views as map_views_service

router = APIRouter(prefix="/map-views", tags=["map-views"])


@router.get("", response_model=MapViewsResponse)
def list_map_views():
    conn = get_conn()
    try:
        views = map_views_service.list_map_views(conn)
        return {"views": views}
    finally:
        conn.close()


@router.post("", response_model=MapViewResponse)
def create_map_view(payload: MapViewCreate):
    conn = get_conn()
    try:
        view = map_views_service.create_map_view(conn, payload.model_dump())
        return {"view": view}
    finally:
        conn.close()


@router.delete("/{view_id}")
def delete_map_view(view_id: int):
    conn = get_conn()
    try:
        deleted = map_views_service.delete_map_view(conn, view_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Map view not found")
        return {"ok": True}
    finally:
        conn.close()
