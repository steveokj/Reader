import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_selection(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = _iso_now()
    selector_json = json.dumps(payload["selector"])
    cur = conn.execute(
        """
        INSERT INTO selections (document_id, section_id, selector_json, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (payload["document_id"], payload["section_id"], selector_json, now),
    )
    conn.commit()

    return {
        "id": cur.lastrowid,
        "document_id": payload["document_id"],
        "section_id": payload["section_id"],
        "selector": payload["selector"],
        "created_at": now,
    }


def get_selections(
    conn, document_id: Optional[int] = None, section_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    query = "SELECT id, document_id, section_id, selector_json, created_at FROM selections"
    filters: List[str] = []
    params: List[Any] = []

    if document_id is not None:
        filters.append("document_id = ?")
        params.append(document_id)
    if section_id is not None:
        filters.append("section_id = ?")
        params.append(section_id)

    if filters:
        query += " WHERE " + " AND ".join(filters)

    query += " ORDER BY id"

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
                "document_id": row["document_id"],
                "section_id": row["section_id"],
                "selector": selector,
                "created_at": row["created_at"],
            }
        )
    return selections


def delete_selection(conn, selection_id: int) -> bool:
    conn.execute("DELETE FROM additions WHERE selection_id = ?", (selection_id,))
    cur = conn.execute("DELETE FROM selections WHERE id = ?", (selection_id,))
    conn.commit()
    return cur.rowcount > 0
