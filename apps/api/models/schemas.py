from typing import List, Optional

from pydantic import BaseModel


class DocumentSectionCreate(BaseModel):
    section_key: str
    title: Optional[str] = None
    content_text: str


class DocumentCreate(BaseModel):
    title: str
    source_type: str
    source_ref: Optional[str] = None
    sections: List[DocumentSectionCreate]


class Document(BaseModel):
    id: int
    title: str
    source_type: str
    source_ref: Optional[str] = None
    created_at: str


class DocumentSection(BaseModel):
    id: int
    document_id: int
    section_key: str
    title: Optional[str] = None
    content_text: str
    created_at: str


class DocumentsResponse(BaseModel):
    documents: List[Document]


class DocumentDetailResponse(BaseModel):
    document: Document
    sections: List[DocumentSection]
