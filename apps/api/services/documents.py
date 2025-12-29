from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

SAMPLE_TITLE = "Sample Document"
SAMPLE_TEXT = """The rain arrived in the late afternoon, thin at first, then steady. From the window, the street looked like a soft sketch, its lines blurred by water and light.

Inside, the room felt smaller but calmer. A kettle hissed, a book lay open on a table, and the world outside slowed to a gentle rhythm.

When the storm passed, the city seemed freshly rinsed. Leaves shone, sidewalks darkened, and the air held the quiet scent of wet stone.

In the early morning, the market opened with quiet routines. Vendors lifted shutters, weighed oranges, and called out prices that echoed between the stalls.

At the station, a train rolled in with a long metallic sigh. People gathered their bags, stepped forward, and moved into the crowd with practiced ease.

By dusk, the library lamps warmed each table. Pages turned softly, pens scratched notes, and the last light settled into the corners of the room."""


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_document(conn, payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    now = _iso_now()
    cur = conn.execute(
        "INSERT INTO documents (title, source_type, source_ref, created_at) VALUES (?, ?, ?, ?)",
        (payload["title"], payload["source_type"], payload.get("source_ref"), now),
    )
    document_id = cur.lastrowid

    sections: List[Dict[str, Any]] = []
    for section in payload.get("sections", []):
        section_now = _iso_now()
        cur = conn.execute(
            """
            INSERT INTO document_sections (document_id, section_key, title, content_text, content_html, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                section["section_key"],
                section.get("title"),
                section["content_text"],
                section.get("content_html"),
                section_now,
            ),
        )
        sections.append(
            {
                "id": cur.lastrowid,
                "document_id": document_id,
                "section_key": section["section_key"],
                "title": section.get("title"),
                "content_text": section["content_text"],
                "content_html": section.get("content_html"),
                "created_at": section_now,
            }
        )

    conn.commit()
    document = {
        "id": document_id,
        "title": payload["title"],
        "source_type": payload["source_type"],
        "source_ref": payload.get("source_ref"),
        "created_at": now,
    }
    return document, sections


def get_documents(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, title, source_type, source_ref, created_at FROM documents ORDER BY id"
    ).fetchall()
    return [dict(row) for row in rows]


def get_document(conn, document_id: int) -> Optional[Tuple[Dict[str, Any], List[Dict[str, Any]]]]:
    doc = conn.execute(
        "SELECT id, title, source_type, source_ref, created_at FROM documents WHERE id = ?",
        (document_id,),
    ).fetchone()
    if not doc:
        return None
    sections = conn.execute(
        """
        SELECT id, document_id, section_key, title, content_text, content_html, created_at
        FROM document_sections
        WHERE document_id = ?
        ORDER BY id
        """,
        (document_id,),
    ).fetchall()
    return dict(doc), [dict(row) for row in sections]


def ensure_sample_document(conn) -> None:
    existing = conn.execute("SELECT id FROM documents ORDER BY id LIMIT 1").fetchone()
    if existing:
        return

    payload = {
        "title": SAMPLE_TITLE,
        "source_type": "sample_text",
        "source_ref": None,
        "sections": [
            {
                "section_key": "0",
                "title": "Sample",
                "content_text": SAMPLE_TEXT,
            }
        ],
    }
    create_document(conn, payload)
