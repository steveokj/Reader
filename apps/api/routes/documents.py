from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..db.conn import get_conn
from ..models.schemas import (
    ArticleIngest,
    DocumentCreate,
    DocumentDetailResponse,
    DocumentPagesResponse,
    DocumentsResponse,
    ReadingProgressResponse,
    ReadingProgressUpdate,
)
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


@router.get("/{document_id}/pages", response_model=DocumentPagesResponse)
def get_document_pages(document_id: int):
    conn = get_conn()
    try:
        pages = documents_service.get_document_pages(conn, document_id)
        return {"pages": pages}
    finally:
        conn.close()


@router.get("/{document_id}/progress", response_model=ReadingProgressResponse)
def get_document_progress(document_id: int):
    conn = get_conn()
    try:
        progress = documents_service.get_reading_progress(conn, document_id)
        return {"progress": progress}
    finally:
        conn.close()


@router.put("/{document_id}/progress", response_model=ReadingProgressResponse)
def update_document_progress(document_id: int, payload: ReadingProgressUpdate):
    conn = get_conn()
    try:
        progress = documents_service.upsert_reading_progress(
            conn,
            document_id,
            payload.section_id,
            payload.position_start,
            payload.position_end,
        )
        return {"progress": progress}
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
