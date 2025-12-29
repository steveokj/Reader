import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_addition(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = _iso_now()
    payload_json = json.dumps(payload.get("payload") or {})
    cur = conn.execute(
        """
        INSERT INTO additions (selection_id, type, title, text_content, payload_json, created_at, updated_at)
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


def update_addition(conn, addition_id: int, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    fields = []
    params: List[Any] = []

    if "title" in payload:
        fields.append("title = ?")
        params.append(payload.get("title"))
    if "text_content" in payload:
        fields.append("text_content = ?")
        params.append(payload.get("text_content"))
    if "payload" in payload:
        fields.append("payload_json = ?")
        params.append(json.dumps(payload.get("payload") or {}))

    if not fields:
        return get_addition(conn, addition_id)

    now = _iso_now()
    fields.append("updated_at = ?")
    params.append(now)
    params.append(addition_id)

    conn.execute(f"UPDATE additions SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()

    return get_addition(conn, addition_id)


def get_addition(conn, addition_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT id, selection_id, type, title, text_content, payload_json, created_at, updated_at
        FROM additions
        WHERE id = ?
        """,
        (addition_id,),
    ).fetchone()
    if not row:
        return None
    try:
        payload = json.loads(row["payload_json"])
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": row["id"],
        "selection_id": row["selection_id"],
        "type": row["type"],
        "title": row["title"],
        "text_content": row["text_content"],
        "payload": payload,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_additions(conn, selection_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, selection_id, type, title, text_content, payload_json, created_at, updated_at
        FROM additions
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
