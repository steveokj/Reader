import json
import os
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
PAGES_DIR = os.path.join(DATA_DIR, "slicer_pages")
SNAPSHOTS_DIR = os.path.join(DATA_DIR, "slicer_snapshots")


def _ensure_pages_dir() -> None:
    os.makedirs(PAGES_DIR, exist_ok=True)


def _ensure_snapshots_dir() -> None:
    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)


def _hash_html(html: str) -> str:
    return hashlib.sha256(html.encode("utf-8")).hexdigest()


def _write_page_html(html: str) -> Tuple[str, str]:
    _ensure_pages_dir()
    html_hash = _hash_html(html)
    filename = f"{html_hash}.html"
    path = os.path.join(PAGES_DIR, filename)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(html)
    rel_path = os.path.join("slicer_pages", filename)
    return rel_path, html_hash


def _write_snapshot_html(html: str) -> Tuple[str, str]:
    _ensure_snapshots_dir()
    html_hash = _hash_html(html)
    filename = f"{html_hash}.html"
    path = os.path.join(SNAPSHOTS_DIR, filename)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(html)
    rel_path = os.path.join("slicer_snapshots", filename)
    return rel_path, html_hash


def _read_page_html(path: str) -> Optional[str]:
    if not path:
        return None
    full_path = os.path.join(DATA_DIR, path)
    if not os.path.isfile(full_path):
        return None
    with open(full_path, "r", encoding="utf-8") as handle:
        return handle.read()


def _read_snapshot_html(path: str) -> Optional[str]:
    return _read_page_html(path)


def _touch_page(conn, url: str, title: Optional[str]) -> Dict[str, Any]:
    now = _iso_now()
    row = conn.execute(
        "SELECT id, url, title, created_at, updated_at, content_html_path, content_html_hash, "
        "content_html_updated_at FROM slicer_pages WHERE url = ?",
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
            "content_html_path": row["content_html_path"],
            "content_html_hash": row["content_html_hash"],
            "content_html_updated_at": row["content_html_updated_at"],
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
        "content_html_path": None,
        "content_html_hash": None,
        "content_html_updated_at": None,
    }


def update_page_html(
    conn, page_id: int, html: str, refresh: bool = False
) -> Dict[str, Any]:
    now = _iso_now()
    path, html_hash = _write_page_html(html)
    row = conn.execute(
        "SELECT content_html_path, content_html_hash FROM slicer_pages WHERE id = ?",
        (page_id,),
    ).fetchone()
    if row and not refresh and row["content_html_hash"] == html_hash:
        return {
            "page_id": page_id,
            "content_html_path": row["content_html_path"],
            "content_html_hash": row["content_html_hash"],
            "content_html_updated_at": now,
        }

    conn.execute(
        """
        UPDATE slicer_pages
        SET content_html_path = ?, content_html_hash = ?, content_html_updated_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (path, html_hash, now, now, page_id),
    )
    conn.commit()
    return {
        "page_id": page_id,
        "content_html_path": path,
        "content_html_hash": html_hash,
        "content_html_updated_at": now,
    }


def create_slice(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    page = _touch_page(conn, payload["url"], payload.get("page_title"))
    page_html = payload.get("page_html")
    page_html_refresh = payload.get("page_html_refresh", False)
    if page_html and (page.get("content_html_path") is None or page_html_refresh):
        update_page_html(conn, page["id"], page_html, refresh=page_html_refresh)
    snapshot_id = None
    if page_html:
        snapshot_id = ensure_snapshot(
            conn,
            page["id"],
            page["url"],
            page_html,
            payload.get("page_viewport_width"),
        )
    now = _iso_now()
    recipe_json = json.dumps(payload.get("recipe") or {})
    cur = conn.execute(
        """
        INSERT INTO slicer_slices (page_id, snapshot_id, title, recipe_json, html, text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            page["id"],
            snapshot_id,
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
        "snapshot_id": snapshot_id,
        "url": page["url"],
        "page_title": page["title"],
        "slice_title": payload.get("slice_title"),
        "recipe": payload.get("recipe") or {},
        "html": payload["html"],
        "text": payload["text"],
        "created_at": now,
    }


def get_page_html_by_id(conn, page_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, url, title, content_html_path, content_html_updated_at "
        "FROM slicer_pages WHERE id = ?",
        (page_id,),
    ).fetchone()
    if not row:
        return None
    html = _read_page_html(row["content_html_path"] or "")
    if html is None:
        return None
    return {
        "page_id": row["id"],
        "url": row["url"],
        "title": row["title"],
        "html": html,
        "content_html_updated_at": row["content_html_updated_at"],
    }


def refresh_page_html(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    page = _touch_page(conn, payload["url"], payload.get("title"))
    result = update_page_html(conn, page["id"], payload["html"], refresh=True)
    return {
        "page_id": page["id"],
        "url": page["url"],
        "title": page["title"],
        "html": payload["html"],
        "content_html_updated_at": result["content_html_updated_at"],
    }


def ensure_snapshot(
    conn, page_id: int, url: str, html: str, viewport_width: Optional[int] = None
) -> int:
    path, html_hash = _write_snapshot_html(html)
    row = conn.execute(
        "SELECT id FROM slicer_page_snapshots WHERE page_id = ? AND html_hash = ?",
        (page_id, html_hash),
    ).fetchone()
    if row:
        return row["id"]
    now = _iso_now()
    cur = conn.execute(
        """
        INSERT INTO slicer_page_snapshots (page_id, html_hash, html_path, viewport_width, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (page_id, html_hash, path, viewport_width, now),
    )
    conn.commit()
    return cur.lastrowid


def get_snapshot_by_id(conn, snapshot_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT sps.id, sps.page_id, sps.html_path, sps.viewport_width, sps.created_at, sp.url
        FROM slicer_page_snapshots sps
        JOIN slicer_pages sp ON sp.id = sps.page_id
        WHERE sps.id = ?
        """,
        (snapshot_id,),
    ).fetchone()
    if not row:
        return None
    html = _read_snapshot_html(row["html_path"] or "")
    if html is None:
        return None
    return {
        "snapshot_id": row["id"],
        "page_id": row["page_id"],
        "url": row["url"],
        "viewport_width": row["viewport_width"],
        "html": html,
        "created_at": row["created_at"],
    }


def get_slices(conn, url: Optional[str] = None) -> List[Dict[str, Any]]:
    query = (
        "SELECT ss.id, ss.page_id, ss.snapshot_id, ss.title, ss.recipe_json, ss.html, ss.text, "
        "ss.created_at, sp.url, sp.title AS page_title "
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
                "snapshot_id": row["snapshot_id"],
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
        SELECT ss.id, ss.page_id, ss.snapshot_id, ss.title, ss.recipe_json, ss.html, ss.text, ss.created_at,
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
        "snapshot_id": row["snapshot_id"],
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
