from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_thread(
    conn, title: Optional[str], system_prompt: Optional[str], cli_session_id: Optional[str]
) -> Dict[str, Any]:
    now = _iso_now()
    cur = conn.execute(
        """
        INSERT INTO explore_threads (title, system_prompt, cli_session_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (title, system_prompt, cli_session_id, now, now),
    )
    conn.commit()
    return {
        "id": cur.lastrowid,
        "title": title,
        "system_prompt": system_prompt,
        "cli_session_id": cli_session_id,
        "created_at": now,
        "updated_at": now,
    }


def update_thread_session(conn, thread_id: int, cli_session_id: str) -> None:
    now = _iso_now()
    conn.execute(
        "UPDATE explore_threads SET cli_session_id = ?, updated_at = ? WHERE id = ?",
        (cli_session_id, now, thread_id),
    )
    conn.commit()


def touch_thread(conn, thread_id: int) -> None:
    now = _iso_now()
    conn.execute("UPDATE explore_threads SET updated_at = ? WHERE id = ?", (now, thread_id))
    conn.commit()


def get_thread(conn, thread_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT id, title, system_prompt, cli_session_id, created_at, updated_at
        FROM explore_threads
        WHERE id = ?
        """,
        (thread_id,),
    ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "title": row["title"],
        "system_prompt": row["system_prompt"],
        "cli_session_id": row["cli_session_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_threads(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, title, system_prompt, cli_session_id, created_at, updated_at
        FROM explore_threads
        ORDER BY updated_at DESC
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "system_prompt": row["system_prompt"],
            "cli_session_id": row["cli_session_id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def add_message(conn, thread_id: int, role: str, content: str) -> Dict[str, Any]:
    now = _iso_now()
    cur = conn.execute(
        """
        INSERT INTO explore_messages (thread_id, role, content, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (thread_id, role, content, now),
    )
    conn.commit()
    return {
        "id": cur.lastrowid,
        "thread_id": thread_id,
        "role": role,
        "content": content,
        "created_at": now,
    }


def list_messages(conn, thread_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, thread_id, role, content, created_at
        FROM explore_messages
        WHERE thread_id = ?
        ORDER BY id
        """,
        (thread_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "thread_id": row["thread_id"],
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
