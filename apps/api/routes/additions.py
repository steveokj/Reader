from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import AdditionCreate, AdditionResponse, AdditionsResponse, AdditionUpdate
from ..services import additions as additions_service

router = APIRouter(prefix="/additions", tags=["additions"])


@router.post("", response_model=AdditionResponse)
def create_addition(payload: AdditionCreate):
    conn = get_conn()
    try:
        addition = additions_service.create_addition(conn, payload.model_dump())
        return {"addition": addition}
    finally:
        conn.close()


@router.patch("/{addition_id}", response_model=AdditionResponse)
def update_addition(addition_id: int, payload: AdditionUpdate):
    conn = get_conn()
    try:
        addition = additions_service.update_addition(
            conn, addition_id, payload.model_dump(exclude_unset=True)
        )
        if addition is None:
            raise HTTPException(status_code=404, detail="Addition not found")
        return {"addition": addition}
    finally:
        conn.close()


@router.get("", response_model=AdditionsResponse)
def list_additions(selection_id: int):
    conn = get_conn()
    try:
        additions = additions_service.get_additions(conn, selection_id)
        return {"additions": additions}
    finally:
        conn.close()
