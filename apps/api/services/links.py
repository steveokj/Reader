from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_link(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = _iso_now()
    relation_type = payload.get("relation_type") or "link"
    label = payload.get("label")
    cur = conn.execute(
        """
        INSERT INTO links (from_type, from_id, to_type, to_id, relation_type, label, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["from_type"],
            payload["from_id"],
            payload["to_type"],
            payload["to_id"],
            relation_type,
            label,
            now,
        ),
    )
    conn.commit()

    return {
        "id": cur.lastrowid,
        "from_type": payload["from_type"],
        "from_id": payload["from_id"],
        "to_type": payload["to_type"],
        "to_id": payload["to_id"],
        "relation_type": relation_type,
        "label": label,
        "created_at": now,
    }


def _row_to_link(row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "from_type": row["from_type"],
        "from_id": row["from_id"],
        "to_type": row["to_type"],
        "to_id": row["to_id"],
        "relation_type": row["relation_type"],
        "label": row["label"],
        "created_at": row["created_at"],
    }


def get_links(conn, node_type: str, node_id: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    out_rows = conn.execute(
        """
        SELECT id, from_type, from_id, to_type, to_id, relation_type, label, created_at
        FROM links
        WHERE from_type = ? AND from_id = ?
        ORDER BY id
        """,
        (node_type, node_id),
    ).fetchall()

    in_rows = conn.execute(
        """
        SELECT id, from_type, from_id, to_type, to_id, relation_type, label, created_at
        FROM links
        WHERE to_type = ? AND to_id = ?
        ORDER BY id
        """,
        (node_type, node_id),
    ).fetchall()

    links_out = [_row_to_link(row) for row in out_rows]
    links_in = [_row_to_link(row) for row in in_rows]
    return links_in, links_out


def delete_link(conn, link_id: int) -> bool:
    cur = conn.execute("DELETE FROM links WHERE id = ?", (link_id,))
    conn.commit()
    return cur.rowcount > 0
