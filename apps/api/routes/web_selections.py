from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import WebSelectionCreate, WebSelectionResponse, WebSelectionsResponse
from ..services import web_selections as web_selections_service

router = APIRouter(prefix="/web/selections", tags=["web-selections"])


@router.post("", response_model=WebSelectionResponse)
def create_web_selection(payload: WebSelectionCreate):
    conn = get_conn()
    try:
        selection = web_selections_service.create_web_selection(conn, payload.model_dump())
        return {"selection": selection}
    finally:
        conn.close()


@router.get("", response_model=WebSelectionsResponse)
def list_web_selections(url: str | None = None, page_id: int | None = None):
    conn = get_conn()
    try:
        selections = web_selections_service.get_web_selections(conn, url, page_id)
        return {"selections": selections}
    finally:
        conn.close()


@router.delete("/{selection_id}")
def delete_web_selection(selection_id: int):
    conn = get_conn()
    try:
        deleted = web_selections_service.delete_web_selection(conn, selection_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Selection not found")
        return {"ok": True}
    finally:
        conn.close()
