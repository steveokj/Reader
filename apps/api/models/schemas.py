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


class PositionSelector(BaseModel):
    start: int
    end: int


class QuoteSelector(BaseModel):
    exact: str
    prefix: str
    suffix: str


class Selector(BaseModel):
    position: PositionSelector
    quote: QuoteSelector


class SelectionCreate(BaseModel):
    document_id: int
    section_id: int
    selector: Selector


class Selection(BaseModel):
    id: int
    document_id: int
    section_id: int
    selector: Selector
    created_at: str


class SelectionResponse(BaseModel):
    selection: Selection


class SelectionsResponse(BaseModel):
    selections: List[Selection]
