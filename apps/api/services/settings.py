from datetime import datetime, timezone
from typing import Any, Dict

SETTINGS_FIELDS = [
    "font_size",
    "line_height",
    "font_family",
    "text_width",
    "theme",
    "theme_light_ink",
    "theme_light_paper",
    "theme_sepia_ink",
    "theme_sepia_paper",
    "theme_dark_ink",
    "theme_dark_paper",
    "paragraph_spacing",
    "selection_snapping",
    "gesture_center_tap",
    "gesture_triple_click",
    "gesture_two_point_long_press",
    "gesture_swipe_sequences",
    "gesture_edge_swipes",
    "ui_show_side_panel",
    "ui_action_menu_placement",
    "ui_highlight_style",
    "default_map_view_id",
    "default_map_view_id_mobile",
    "default_map_view_id_desktop",
]

BOOLEAN_FIELDS = {
    "gesture_center_tap",
    "gesture_triple_click",
    "gesture_two_point_long_press",
    "gesture_swipe_sequences",
    "gesture_edge_swipes",
    "ui_show_side_panel",
}

DEFAULT_SETTINGS: Dict[str, Any] = {
    "font_size": 18,
    "line_height": 1.7,
    "font_family": "iowan",
    "text_width": "medium",
    "theme": "light",
    "theme_light_ink": "#1f1c16",
    "theme_light_paper": "#f6f1e9",
    "theme_sepia_ink": "#3b2f24",
    "theme_sepia_paper": "#f3e6d6",
    "theme_dark_ink": "#e2e1de",
    "theme_dark_paper": "#424547",
    "paragraph_spacing": 1.0,
    "selection_snapping": "exact",
    "gesture_center_tap": True,
    "gesture_triple_click": True,
    "gesture_two_point_long_press": True,
    "gesture_swipe_sequences": False,
    "gesture_edge_swipes": False,
    "ui_show_side_panel": True,
    "ui_action_menu_placement": "above",
    "ui_highlight_style": "soft",
    "default_map_view_id": None,
    "default_map_view_id_mobile": None,
    "default_map_view_id_desktop": None,
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_settings(row) -> Dict[str, Any]:
    settings = {field: row[field] for field in SETTINGS_FIELDS}
    for field in BOOLEAN_FIELDS:
        settings[field] = bool(settings[field])
    return settings


def _normalize_value(field: str, value: Any) -> Any:
    if field in BOOLEAN_FIELDS:
        return 1 if bool(value) else 0
    return value


def get_settings(conn) -> Dict[str, Any]:
    columns = ", ".join(SETTINGS_FIELDS)
    row = conn.execute(
        f"SELECT {columns} FROM reader_settings WHERE id = 1"
    ).fetchone()
    if not row:
        now = _iso_now()
        placeholders = ", ".join(["?"] * len(SETTINGS_FIELDS))
        values = [_normalize_value(field, DEFAULT_SETTINGS[field]) for field in SETTINGS_FIELDS]
        conn.execute(
            f"""
            INSERT INTO reader_settings (id, {columns}, created_at, updated_at)
            VALUES (1, {placeholders}, ?, ?)
            """,
            (*values, now, now),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {columns} FROM reader_settings WHERE id = 1"
        ).fetchone()

    return _row_to_settings(row)


def update_settings(conn, updates: Dict[str, Any]) -> Dict[str, Any]:
    filtered_updates = {key: value for key, value in updates.items() if key in SETTINGS_FIELDS}
    if not filtered_updates:
        return get_settings(conn)

    current = get_settings(conn)
    next_settings = {**current, **filtered_updates}
    now = _iso_now()
    assignments = ", ".join([f"{field} = ?" for field in SETTINGS_FIELDS])
    values = [_normalize_value(field, next_settings[field]) for field in SETTINGS_FIELDS]
    conn.execute(
        f"UPDATE reader_settings SET {assignments}, updated_at = ? WHERE id = 1",
        (*values, now),
    )
    conn.commit()
    return next_settings
