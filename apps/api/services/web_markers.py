import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_web_marker(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = _iso_now()
    value_json = json.dumps(payload.get("value")) if payload.get("value") is not None else None
    cur = conn.execute(
        """
        INSERT INTO web_markers (target_type, target_id, kind, value_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            payload["target_type"],
            payload["target_id"],
            payload["kind"],
            value_json,
            now,
        ),
    )
    conn.commit()

    return {
        "id": cur.lastrowid,
        "target_type": payload["target_type"],
        "target_id": payload["target_id"],
        "kind": payload["kind"],
        "value": payload.get("value"),
        "created_at": now,
    }


def get_web_markers(conn, target_type: str, target_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, target_type, target_id, kind, value_json, created_at
        FROM web_markers
        WHERE target_type = ? AND target_id = ?
        ORDER BY id
        """,
        (target_type, target_id),
    ).fetchall()

    markers: List[Dict[str, Any]] = []
    for row in rows:
        value: Optional[Dict[str, Any]] = None
        if row["value_json"]:
            try:
                value = json.loads(row["value_json"])
            except json.JSONDecodeError:
                value = None
        markers.append(
            {
                "id": row["id"],
                "target_type": row["target_type"],
                "target_id": row["target_id"],
                "kind": row["kind"],
                "value": value,
                "created_at": row["created_at"],
            }
        )
    return markers


def delete_web_marker(conn, marker_id: int) -> bool:
    cur = conn.execute("DELETE FROM web_markers WHERE id = ?", (marker_id,))
    conn.commit()
    return cur.rowcount > 0
