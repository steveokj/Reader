from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import LinkCreate, LinkResponse, LinksResponse
from ..services import links as links_service

router = APIRouter(prefix="/links", tags=["links"])


@router.post("", response_model=LinkResponse)
def create_link(payload: LinkCreate):
    conn = get_conn()
    try:
        link = links_service.create_link(conn, payload.model_dump())
        return {"link": link}
    finally:
        conn.close()


@router.get("", response_model=LinksResponse)
def list_links(node_type: str, node_id: int):
    conn = get_conn()
    try:
        links_in, links_out = links_service.get_links(conn, node_type, node_id)
        return {"links_in": links_in, "links_out": links_out}
    finally:
        conn.close()


@router.delete("/{link_id}")
def delete_link(link_id: int):
    conn = get_conn()
    try:
        deleted = links_service.delete_link(conn, link_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Link not found")
        return {"ok": True}
    finally:
        conn.close()
