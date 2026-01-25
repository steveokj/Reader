import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_web_addition(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = _iso_now()
    payload_json = json.dumps(payload.get("payload") or {})
    cur = conn.execute(
        """
        INSERT INTO web_additions (selection_id, type, title, text_content, payload_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["selection_id"],
            payload["type"],
            payload.get("title"),
            payload.get("text_content"),
            payload_json,
            now,
            now,
        ),
    )
    conn.commit()

    return {
        "id": cur.lastrowid,
        "selection_id": payload["selection_id"],
        "type": payload["type"],
        "title": payload.get("title"),
        "text_content": payload.get("text_content"),
        "payload": payload.get("payload") or {},
        "created_at": now,
        "updated_at": now,
    }


def update_web_addition(conn, addition_id: int, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    existing = conn.execute(
        "SELECT id, selection_id, type, title, text_content, payload_json, created_at, updated_at "
        "FROM web_additions WHERE id = ?",
        (addition_id,),
    ).fetchone()
    if not existing:
        return None

    now = _iso_now()
    next_title = payload.get("title", existing["title"])
    next_text = payload.get("text_content", existing["text_content"])
    if payload.get("payload") is None:
        payload_json = existing["payload_json"]
        payload_data = json.loads(payload_json) if payload_json else {}
    else:
        payload_json = json.dumps(payload["payload"])
        payload_data = payload["payload"]

    conn.execute(
        """
        UPDATE web_additions
        SET title = ?, text_content = ?, payload_json = ?, updated_at = ?
        WHERE id = ?
        """,
        (next_title, next_text, payload_json, now, addition_id),
    )
    conn.commit()

    return {
        "id": existing["id"],
        "selection_id": existing["selection_id"],
        "type": existing["type"],
        "title": next_title,
        "text_content": next_text,
        "payload": payload_data,
        "created_at": existing["created_at"],
        "updated_at": now,
    }


def get_web_additions(conn, selection_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, selection_id, type, title, text_content, payload_json, created_at, updated_at
        FROM web_additions
        WHERE selection_id = ?
        ORDER BY id
        """,
        (selection_id,),
    ).fetchall()

    additions: List[Dict[str, Any]] = []
    for row in rows:
        try:
            payload = json.loads(row["payload_json"])
        except json.JSONDecodeError:
            payload = {}
        additions.append(
            {
                "id": row["id"],
                "selection_id": row["selection_id"],
                "type": row["type"],
                "title": row["title"],
                "text_content": row["text_content"],
                "payload": payload,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        )
    return additions
