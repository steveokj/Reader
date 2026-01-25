from fastapi import APIRouter, HTTPException

from ..db.slicer_conn import get_slicer_conn
from ..models.schemas import SlicerSliceCreate, SlicerSliceResponse, SlicerSlicesResponse
from ..services import slicer as slicer_service

router = APIRouter(prefix="/slicer", tags=["slicer"])


@router.post("/slices", response_model=SlicerSliceResponse)
def create_slice(payload: SlicerSliceCreate):
    conn = get_slicer_conn()
    try:
        created = slicer_service.create_slice(conn, payload.model_dump())
        return {"slice": created}
    finally:
        conn.close()


@router.get("/slices", response_model=SlicerSlicesResponse)
def list_slices(url: str | None = None):
    conn = get_slicer_conn()
    try:
        slices = slicer_service.get_slices(conn, url)
        return {"slices": slices}
    finally:
        conn.close()


@router.get("/slices/{slice_id}", response_model=SlicerSliceResponse)
def get_slice(slice_id: int):
    conn = get_slicer_conn()
    try:
        slice_row = slicer_service.get_slice(conn, slice_id)
        if slice_row is None:
            raise HTTPException(status_code=404, detail="Slice not found")
        return {"slice": slice_row}
    finally:
        conn.close()


@router.delete("/slices/{slice_id}")
def delete_slice(slice_id: int):
    conn = get_slicer_conn()
    try:
        deleted = slicer_service.delete_slice(conn, slice_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Slice not found")
        return {"ok": True}
    finally:
        conn.close()
