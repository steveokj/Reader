from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..db.conn import get_conn
from ..models.schemas import ArticleIngest, DocumentCreate, DocumentDetailResponse, DocumentsResponse
from ..services import documents as documents_service
from ..services import ingest as ingest_service

router = APIRouter(prefix="/books", tags=["books"])


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


@router.post("/ingest/epub", response_model=DocumentDetailResponse)
def ingest_epub(file: UploadFile = File(...), title: str | None = Form(None)):
    conn = get_conn()
    try:
        document, sections = ingest_service.ingest_epub(conn, file, title)
        return {"document": document, "sections": sections}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()


@router.post("/ingest/article", response_model=DocumentDetailResponse)
def ingest_article(payload: ArticleIngest):
    conn = get_conn()
    try:
        document, sections = ingest_service.ingest_article(conn, payload.model_dump())
        return {"document": document, "sections": sections}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()
