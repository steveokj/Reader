from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class DocumentSectionCreate(BaseModel):
    section_key: str
    title: Optional[str] = None
    content_text: str
    content_html: Optional[str] = None


class DocumentCreate(BaseModel):
    title: str
    source_type: str
    source_ref: Optional[str] = None
    cover_url: Optional[str] = None
    sections: List[DocumentSectionCreate]


class Document(BaseModel):
    id: int
    title: str
    source_type: str
    source_ref: Optional[str] = None
    cover_url: Optional[str] = None
    created_at: str


class DocumentSection(BaseModel):
    id: int
    document_id: int
    section_key: str
    title: Optional[str] = None
    content_text: str
    content_html: Optional[str] = None
    created_at: str


class DocumentsResponse(BaseModel):
    documents: List[Document]


class DocumentDetailResponse(BaseModel):
    document: Document
    sections: List[DocumentSection]


class PageEntry(BaseModel):
    section_id: int
    page_index: int
    page_label: str
    page_number: Optional[int] = None
    position_start: int


class DocumentPagesResponse(BaseModel):
    pages: List[PageEntry]


class ReadingProgress(BaseModel):
    document_id: int
    section_id: int
    position_start: int
    position_end: int
    updated_at: str


class ReadingProgressUpdate(BaseModel):
    section_id: int
    position_start: int
    position_end: int


class ReadingProgressResponse(BaseModel):
    progress: Optional[ReadingProgress] = None


class ReadingHistoryCreate(BaseModel):
    section_id: int
    position_start: int
    page_number: Optional[int] = None


class ReadingHistoryEntry(BaseModel):
    id: int
    document_id: int
    section_id: int
    position_start: int
    page_number: Optional[int] = None
    created_at: str


class ReadingHistoryResponse(BaseModel):
    entry: ReadingHistoryEntry


class ReadingHistoryListResponse(BaseModel):
    entries: List[ReadingHistoryEntry]


class MapViewCreate(BaseModel):
    name: str
    center_lng: float
    center_lat: float
    zoom: float
    bearing: float
    pitch: float
    map_scale: Optional[float] = None
    bounds_west: Optional[float] = None
    bounds_south: Optional[float] = None
    bounds_east: Optional[float] = None
    bounds_north: Optional[float] = None
    labels_mode: str
    cities_visible: bool
    states_visible: bool
    focus_seas_only: bool
    selected_iso2: List[str]


class MapView(MapViewCreate):
    id: int
    created_at: str


class MapViewResponse(BaseModel):
    view: MapView


class MapViewsResponse(BaseModel):
    views: List[MapView]


class MapViewUpdate(BaseModel):
    name: str


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


class AdditionCreate(BaseModel):
    selection_id: int
    type: str
    title: Optional[str] = None
    text_content: Optional[str] = None
    payload: Dict[str, Any]


class AdditionUpdate(BaseModel):
    title: Optional[str] = None
    text_content: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class Addition(BaseModel):
    id: int
    selection_id: int
    type: str
    title: Optional[str] = None
    text_content: Optional[str] = None
    payload: Dict[str, Any]
    created_at: str
    updated_at: str


class AdditionResponse(BaseModel):
    addition: Addition


class AdditionsResponse(BaseModel):
    additions: List[Addition]


class MarkerCreate(BaseModel):
    target_type: str
    target_id: int
    kind: str
    value: Optional[Dict[str, Any]] = None


class Marker(BaseModel):
    id: int
    target_type: str
    target_id: int
    kind: str
    value: Optional[Dict[str, Any]] = None
    created_at: str


class MarkerResponse(BaseModel):
    marker: Marker


class MarkersResponse(BaseModel):
    markers: List[Marker]


class ArticleIngest(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    text: Optional[str] = None


class ReaderSettings(BaseModel):
    font_size: float
    line_height: float
    font_family: str
    text_width: str
    theme: str
    theme_light_ink: str
    theme_light_paper: str
    theme_sepia_ink: str
    theme_sepia_paper: str
    theme_dark_ink: str
    theme_dark_paper: str
    paragraph_spacing: float
    selection_snapping: str
    gesture_center_tap: bool
    gesture_triple_click: bool
    gesture_two_point_long_press: bool
    gesture_swipe_sequences: bool
    gesture_edge_swipes: bool
    ui_show_side_panel: bool
    ui_action_menu_placement: str
    ui_highlight_style: str
    default_map_view_id: Optional[int] = None
    default_map_view_id_mobile: Optional[int] = None
    default_map_view_id_desktop: Optional[int] = None


class ReaderSettingsUpdate(BaseModel):
    font_size: Optional[float] = None
    line_height: Optional[float] = None
    font_family: Optional[str] = None
    text_width: Optional[str] = None
    theme: Optional[str] = None
    theme_light_ink: Optional[str] = None
    theme_light_paper: Optional[str] = None
    theme_sepia_ink: Optional[str] = None
    theme_sepia_paper: Optional[str] = None
    theme_dark_ink: Optional[str] = None
    theme_dark_paper: Optional[str] = None
    paragraph_spacing: Optional[float] = None
    selection_snapping: Optional[str] = None
    gesture_center_tap: Optional[bool] = None
    gesture_triple_click: Optional[bool] = None
    gesture_two_point_long_press: Optional[bool] = None
    gesture_swipe_sequences: Optional[bool] = None
    gesture_edge_swipes: Optional[bool] = None
    ui_show_side_panel: Optional[bool] = None
    ui_action_menu_placement: Optional[str] = None
    ui_highlight_style: Optional[str] = None
    default_map_view_id: Optional[int] = None
    default_map_view_id_mobile: Optional[int] = None
    default_map_view_id_desktop: Optional[int] = None


class ReaderSettingsResponse(BaseModel):
    settings: ReaderSettings


class ExploreRequest(BaseModel):
    selection_text: str
    context_text: Optional[str] = None
    instruction: Optional[str] = None
    mode: Optional[str] = "mock"
    timeout_seconds: Optional[int] = None


class ExploreResponse(BaseModel):
    mode: str
    response_text: str


class ExploreChatRequest(BaseModel):
    thread_id: Optional[int] = None
    message: str
    mode: Optional[str] = "codex-cli"
    action: Optional[str] = None
    system_prompt: Optional[str] = None
    title: Optional[str] = None
    book_title: Optional[str] = None
    document_id: Optional[int] = None
    timeout_seconds: Optional[int] = None


class ExploreThread(BaseModel):
    id: int
    title: Optional[str] = None
    system_prompt: Optional[str] = None
    cli_session_id: Optional[str] = None
    session_mode: str
    created_at: str
    updated_at: str


class ExploreThreadUpdate(BaseModel):
    title: Optional[str] = None
    system_prompt: Optional[str] = None
    session_mode: Optional[str] = None


class ExploreChatMessage(BaseModel):
    id: int
    thread_id: int
    role: str
    content: str
    created_at: str


class ExploreChatResponse(BaseModel):
    thread: ExploreThread
    messages: List[ExploreChatMessage]
    mode: str
    session_mode: Optional[str] = None


class ExploreThreadsResponse(BaseModel):
    threads: List[ExploreThread]
