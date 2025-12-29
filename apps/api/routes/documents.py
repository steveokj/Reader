from fastapi import APIRouter, HTTPException

from ..db.conn import get_conn
from ..models.schemas import DocumentCreate, DocumentDetailResponse, DocumentsResponse
from ..services import documents as documents_service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentDetailResponse)
def create_document(payload: DocumentCreate):
    conn = get_conn()
    try:
        document, sections = documents_service.create_document(conn, payload.model_dump())
        return {"document": document, "sections": sections}
    finally:
        conn.close()


@router.get("", response_model=DocumentsResponse)
def list_documents():
    conn = get_conn()
    try:
        documents = documents_service.get_documents(conn)
        return {"documents": documents}
    finally:
        conn.close()


@router.get("/{document_id}", response_model=DocumentDetailResponse)
def get_document(document_id: int):
    conn = get_conn()
    try:
        result = documents_service.get_document(conn, document_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Document not found")
        document, sections = result
        return {"document": document, "sections": sections}
    finally:
        conn.close()
