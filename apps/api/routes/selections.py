from fastapi import APIRouter

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
