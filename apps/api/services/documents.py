from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

SAMPLE_TITLE = "Sample Document"
SAMPLE_TEXT = """The rain arrived in the late afternoon, thin at first, then steady. From the window, the street looked like a soft sketch, its lines blurred by water and light.

Inside, the room felt smaller but calmer. A kettle hissed, a book lay open on a table, and the world outside slowed to a gentle rhythm.

When the storm passed, the city seemed freshly rinsed. Leaves shone, sidewalks darkened, and the air held the quiet scent of wet stone.

In the early morning, the market opened with quiet routines. Vendors lifted shutters, weighed oranges, and called out prices that echoed between the stalls.

At the station, a train rolled in with a long metallic sigh. People gathered their bags, stepped forward, and moved into the crowd with practiced ease.

By dusk, the library lamps warmed each table. Pages turned softly, pens scratched notes, and the last light settled into the corners of the room."""
SYNTHETIC_PAGE_CHARS = 1500


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_document(conn, payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    now = _iso_now()
    cur = conn.execute(
        """
        INSERT INTO documents (title, source_type, source_ref, cover_url, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            payload["title"],
            payload["source_type"],
            payload.get("source_ref"),
            payload.get("cover_url"),
            now,
        ),
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
        "cover_url": payload.get("cover_url"),
        "created_at": now,
    }
    return document, sections


def create_document_pages(
    conn, document_id: int, pages: List[Dict[str, Any]]
) -> None:
    if not pages:
        return
    now = _iso_now()
    for page in pages:
        conn.execute(
            """
            INSERT INTO document_pages (
              document_id, section_id, page_index, page_label, page_number, position_start, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                page["section_id"],
                page["page_index"],
                page["page_label"],
                page.get("page_number"),
                page["position_start"],
                now,
            ),
        )
    conn.commit()


def get_documents(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, title, source_type, source_ref, cover_url, created_at
        FROM documents
        ORDER BY created_at DESC, id DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def get_document(conn, document_id: int) -> Optional[Tuple[Dict[str, Any], List[Dict[str, Any]]]]:
    doc = conn.execute(
        "SELECT id, title, source_type, source_ref, cover_url, created_at FROM documents WHERE id = ?",
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


def get_document_pages(conn, document_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT section_id, page_index, page_label, page_number, position_start
        FROM document_pages
        WHERE document_id = ?
        ORDER BY page_index
        """,
        (document_id,),
    ).fetchall()
    existing = [dict(row) for row in rows]
    if existing:
        return existing

    sections = conn.execute(
        """
        SELECT id, content_text
        FROM document_sections
        WHERE document_id = ?
        ORDER BY id
        """,
        (document_id,),
    ).fetchall()
    if not sections:
        return []

    pages: List[Dict[str, Any]] = []
    page_index = 1
    for section in sections:
        text = section["content_text"] or ""
        length = len(text)
        offsets = list(range(0, length, SYNTHETIC_PAGE_CHARS))
        if not offsets:
            offsets = [0]
        for offset in offsets:
            pages.append(
                {
                    "section_id": section["id"],
                    "page_index": page_index,
                    "page_label": f"Page {page_index}",
                    "page_number": page_index,
                    "position_start": offset,
                }
            )
            page_index += 1

    if pages:
        create_document_pages(conn, document_id, pages)
    return pages


def get_reading_progress(conn, document_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT document_id, section_id, position_start, position_end, updated_at
        FROM reading_progress
        WHERE document_id = ?
        """,
        (document_id,),
    ).fetchone()
    return dict(row) if row else None


def upsert_reading_progress(
    conn, document_id: int, section_id: int, position_start: int, position_end: int
) -> Dict[str, Any]:
    now = _iso_now()
    conn.execute(
        """
        INSERT INTO reading_progress (document_id, section_id, position_start, position_end, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          section_id = excluded.section_id,
          position_start = excluded.position_start,
          position_end = excluded.position_end,
          updated_at = excluded.updated_at
        """,
        (document_id, section_id, position_start, position_end, now),
    )
    conn.commit()
    return {
        "document_id": document_id,
        "section_id": section_id,
        "position_start": position_start,
        "position_end": position_end,
        "updated_at": now,
    }


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
