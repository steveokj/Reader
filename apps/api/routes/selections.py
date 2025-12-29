from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import SelectionCreate, SelectionResponse, SelectionsResponse
from ..services import selections as selections_service

router = APIRouter(prefix="/selections", tags=["selections"])


@router.post("", response_model=SelectionResponse)
def create_selection(payload: SelectionCreate):
    conn = get_conn()
    try:
        selection = selections_service.create_selection(conn, payload.model_dump())
        return {"selection": selection}
    finally:
        conn.close()


@router.get("", response_model=SelectionsResponse)
def list_selections(document_id: int | None = None, section_id: int | None = None):
    conn = get_conn()
    try:
        selections = selections_service.get_selections(conn, document_id, section_id)
        return {"selections": selections}
    finally:
        conn.close()


@router.delete("/{selection_id}")
def delete_selection(selection_id: int):
    conn = get_conn()
    try:
        deleted = selections_service.delete_selection(conn, selection_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Selection not found")
        return {"ok": True}
    finally:
        conn.close()
