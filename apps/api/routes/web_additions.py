from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import WebAdditionCreate, WebAdditionResponse, WebAdditionsResponse, WebAdditionUpdate
from ..services import web_additions as web_additions_service

router = APIRouter(prefix="/web/additions", tags=["web-additions"])


@router.post("", response_model=WebAdditionResponse)
def create_web_addition(payload: WebAdditionCreate):
    conn = get_conn()
    try:
        addition = web_additions_service.create_web_addition(conn, payload.model_dump())
        return {"addition": addition}
    finally:
        conn.close()


@router.patch("/{addition_id}", response_model=WebAdditionResponse)
def update_web_addition(addition_id: int, payload: WebAdditionUpdate):
    conn = get_conn()
    try:
        addition = web_additions_service.update_web_addition(
            conn, addition_id, payload.model_dump(exclude_unset=True)
        )
        if addition is None:
            raise HTTPException(status_code=404, detail="Addition not found")
        return {"addition": addition}
    finally:
        conn.close()


@router.get("", response_model=WebAdditionsResponse)
def list_web_additions(selection_id: int):
    conn = get_conn()
    try:
        additions = web_additions_service.get_web_additions(conn, selection_id)
        return {"additions": additions}
    finally:
        conn.close()
