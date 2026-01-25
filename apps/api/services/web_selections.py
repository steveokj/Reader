import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _touch_page(conn, url: str, title: Optional[str]) -> Dict[str, Any]:
    now = _iso_now()
    row = conn.execute(
        "SELECT id, url, title, created_at, updated_at FROM web_pages WHERE url = ?",
        (url,),
    ).fetchone()
    if row:
        next_title = title if title else row["title"]
        conn.execute(
            "UPDATE web_pages SET title = ?, updated_at = ? WHERE id = ?",
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
        "INSERT INTO web_pages (url, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
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


def create_web_selection(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    page = _touch_page(conn, payload["url"], payload.get("title"))
    now = _iso_now()
    selector_json = json.dumps(payload["selector"])
    cur = conn.execute(
        """
        INSERT INTO web_selections (page_id, selection_text, selector_json, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (page["id"], payload["selection_text"], selector_json, now),
    )
    conn.commit()

    return {
        "id": cur.lastrowid,
        "page_id": page["id"],
        "url": page["url"],
        "title": page["title"],
        "selection_text": payload["selection_text"],
        "selector": payload["selector"],
        "created_at": now,
    }


def get_web_selections(
    conn, url: Optional[str] = None, page_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    query = (
        "SELECT ws.id, ws.page_id, ws.selection_text, ws.selector_json, ws.created_at, "
        "wp.url, wp.title "
        "FROM web_selections ws "
        "JOIN web_pages wp ON wp.id = ws.page_id"
    )
    filters: List[str] = []
    params: List[Any] = []

    if url is not None:
        filters.append("wp.url = ?")
        params.append(url)
    if page_id is not None:
        filters.append("ws.page_id = ?")
        params.append(page_id)

    if filters:
        query += " WHERE " + " AND ".join(filters)

    query += " ORDER BY ws.id"

    rows = conn.execute(query, params).fetchall()
    selections: List[Dict[str, Any]] = []
    for row in rows:
        try:
            selector = json.loads(row["selector_json"])
        except json.JSONDecodeError:
            selector = {}
        selections.append(
            {
                "id": row["id"],
                "page_id": row["page_id"],
                "url": row["url"],
                "title": row["title"],
                "selection_text": row["selection_text"],
                "selector": selector,
                "created_at": row["created_at"],
            }
        )
    return selections


def delete_web_selection(conn, selection_id: int) -> bool:
    conn.execute("DELETE FROM web_additions WHERE selection_id = ?", (selection_id,))
    conn.execute(
        "DELETE FROM web_markers WHERE target_type = 'selection' AND target_id = ?",
        (selection_id,),
    )
    cur = conn.execute("DELETE FROM web_selections WHERE id = ?", (selection_id,))
    conn.commit()
    return cur.rowcount > 0
