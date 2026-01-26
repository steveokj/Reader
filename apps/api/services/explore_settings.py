from datetime import datetime, timezone
from typing import Any, Dict

DEFAULT_SYSTEM_PROMPT = (
    "You are a professional, in-depth reading companion for web pages.\n"
    "Respond with thoughtful, well-structured answers grounded in the provided context.\n"
    "Do not fabricate quotes, sources, or facts.\n"
    "If context is insufficient, say what is missing and ask a focused follow-up question.\n"
    "When asked for analysis, explain reasoning and link it to the passage.\n"
    "When asked for summary, provide a clear, multi-sentence summary that preserves nuance.\n"
    "Images: when asked for an image, return a direct public image URL ending in "
    ".jpg/.png/.webp/.gif/.svg and format as Markdown: ![alt text](url). "
    "Include short alt text. If multiple images are requested, return multiple Markdown image links, one per line. "
    "If you cannot find a direct image URL, say so and provide a normal web link."
)

DEFAULT_SETTINGS: Dict[str, Any] = {
    "system_prompt": DEFAULT_SYSTEM_PROMPT,
    "model": "gpt-5.2-codex",
    "reasoning_effort": "medium",
}

SETTINGS_FIELDS = ["system_prompt", "model", "reasoning_effort"]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_settings(conn) -> Dict[str, Any]:
    columns = ", ".join(SETTINGS_FIELDS)
    row = conn.execute(
        f"SELECT {columns} FROM explore_settings WHERE id = 1"
    ).fetchone()
    if not row:
        now = _iso_now()
        values = [DEFAULT_SETTINGS[field] for field in SETTINGS_FIELDS]
        placeholders = ", ".join(["?"] * len(SETTINGS_FIELDS))
        conn.execute(
            f"""
            INSERT INTO explore_settings (id, {columns}, created_at, updated_at)
            VALUES (1, {placeholders}, ?, ?)
            """,
            (*values, now, now),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {columns} FROM explore_settings WHERE id = 1"
        ).fetchone()
    return {field: row[field] for field in SETTINGS_FIELDS}


def update_settings(conn, updates: Dict[str, Any]) -> Dict[str, Any]:
    filtered = {key: value for key, value in updates.items() if key in SETTINGS_FIELDS}
    if not filtered:
        return get_settings(conn)
    current = get_settings(conn)
    next_settings = {**current, **filtered}
    assignments = ", ".join([f"{field} = ?" for field in SETTINGS_FIELDS])
    values = [next_settings[field] for field in SETTINGS_FIELDS]
    now = _iso_now()
    conn.execute(
        f"UPDATE explore_settings SET {assignments}, updated_at = ? WHERE id = 1",
        (*values, now),
    )
    conn.commit()
    return next_settings
