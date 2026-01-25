import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _touch_page(conn, url: str, title: Optional[str]) -> Dict[str, Any]:
    now = _iso_now()
    row = conn.execute(
        "SELECT id, url, title, created_at, updated_at FROM slicer_pages WHERE url = ?",
        (url,),
    ).fetchone()
    if row:
        next_title = title if title else row["title"]
        conn.execute(
            "UPDATE slicer_pages SET title = ?, updated_at = ? WHERE id = ?",
            (next_title, now, row["id"]),
        )
        conn.commit()
        return {
            "id": row["id"],
            "url": row["url"],
            "title": next_title,
            "created_at": row["created_at"],
            "updated_at": now,
        }

    cur = conn.execute(
        "INSERT INTO slicer_pages (url, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (url, title, now, now),
    )
    conn.commit()
    return {
        "id": cur.lastrowid,
        "url": url,
        "title": title,
        "created_at": now,
        "updated_at": now,
    }


def create_slice(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    page = _touch_page(conn, payload["url"], payload.get("page_title"))
    now = _iso_now()
    recipe_json = json.dumps(payload.get("recipe") or {})
    cur = conn.execute(
        """
        INSERT INTO slicer_slices (page_id, title, recipe_json, html, text, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            page["id"],
            payload.get("slice_title"),
            recipe_json,
            payload["html"],
            payload["text"],
            now,
        ),
    )
    conn.commit()

    return {
        "id": cur.lastrowid,
        "page_id": page["id"],
        "url": page["url"],
        "page_title": page["title"],
        "slice_title": payload.get("slice_title"),
        "recipe": payload.get("recipe") or {},
        "html": payload["html"],
        "text": payload["text"],
        "created_at": now,
    }


def get_slices(conn, url: Optional[str] = None) -> List[Dict[str, Any]]:
    query = (
        "SELECT ss.id, ss.page_id, ss.title, ss.recipe_json, ss.html, ss.text, ss.created_at, "
        "sp.url, sp.title AS page_title "
        "FROM slicer_slices ss "
        "JOIN slicer_pages sp ON sp.id = ss.page_id"
    )
    params: List[Any] = []
    if url is not None:
        query += " WHERE sp.url = ?"
        params.append(url)
    query += " ORDER BY ss.id DESC"

    rows = conn.execute(query, params).fetchall()
    slices: List[Dict[str, Any]] = []
    for row in rows:
        try:
            recipe = json.loads(row["recipe_json"])
        except json.JSONDecodeError:
            recipe = {}
        slices.append(
            {
                "id": row["id"],
                "page_id": row["page_id"],
                "url": row["url"],
                "page_title": row["page_title"],
                "slice_title": row["title"],
                "recipe": recipe,
                "html": row["html"],
                "text": row["text"],
                "created_at": row["created_at"],
            }
        )
    return slices


def get_slice(conn, slice_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT ss.id, ss.page_id, ss.title, ss.recipe_json, ss.html, ss.text, ss.created_at,
               sp.url, sp.title AS page_title
        FROM slicer_slices ss
        JOIN slicer_pages sp ON sp.id = ss.page_id
        WHERE ss.id = ?
        """,
        (slice_id,),
    ).fetchone()
    if not row:
        return None
    try:
        recipe = json.loads(row["recipe_json"])
    except json.JSONDecodeError:
        recipe = {}
    return {
        "id": row["id"],
        "page_id": row["page_id"],
        "url": row["url"],
        "page_title": row["page_title"],
        "slice_title": row["title"],
        "recipe": recipe,
        "html": row["html"],
        "text": row["text"],
        "created_at": row["created_at"],
    }


def delete_slice(conn, slice_id: int) -> bool:
    cur = conn.execute("DELETE FROM slicer_slices WHERE id = ?", (slice_id,))
    conn.commit()
    return cur.rowcount > 0
