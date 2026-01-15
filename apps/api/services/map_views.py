import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_view(row: Dict[str, Any]) -> Dict[str, Any]:
    selected_iso2 = []
    raw = row.get("selected_iso2")
    if raw:
        try:
            selected_iso2 = json.loads(raw)
        except json.JSONDecodeError:
            selected_iso2 = []
    return {
        "id": row["id"],
        "name": row["name"],
        "center_lng": row["center_lng"],
        "center_lat": row["center_lat"],
        "zoom": row["zoom"],
        "bearing": row["bearing"],
        "pitch": row["pitch"],
        "bounds_west": row["bounds_west"],
        "bounds_south": row["bounds_south"],
        "bounds_east": row["bounds_east"],
        "bounds_north": row["bounds_north"],
        "labels_mode": row["labels_mode"],
        "cities_visible": bool(row["cities_visible"]),
        "states_visible": bool(row["states_visible"]),
        "focus_seas_only": bool(row["focus_seas_only"]),
        "selected_iso2": selected_iso2,
        "created_at": row["created_at"],
    }


def list_map_views(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          id,
          name,
          center_lng,
          center_lat,
          zoom,
          bearing,
          pitch,
          bounds_west,
          bounds_south,
          bounds_east,
          bounds_north,
          labels_mode,
          cities_visible,
          states_visible,
          focus_seas_only,
          selected_iso2,
          created_at
        FROM map_saved_views
        ORDER BY created_at DESC, id DESC
        """
    ).fetchall()
    return [_serialize_view(dict(row)) for row in rows]


def create_map_view(conn, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = _iso_now()
    cur = conn.execute(
        """
        INSERT INTO map_saved_views (
          name,
          center_lng,
          center_lat,
          zoom,
          bearing,
          pitch,
          bounds_west,
          bounds_south,
          bounds_east,
          bounds_north,
          labels_mode,
          cities_visible,
          states_visible,
          focus_seas_only,
          selected_iso2,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["name"],
            payload["center_lng"],
            payload["center_lat"],
            payload["zoom"],
            payload["bearing"],
            payload["pitch"],
            payload.get("bounds_west"),
            payload.get("bounds_south"),
            payload.get("bounds_east"),
            payload.get("bounds_north"),
            payload["labels_mode"],
            1 if payload.get("cities_visible") else 0,
            1 if payload.get("states_visible") else 0,
            1 if payload.get("focus_seas_only") else 0,
            json.dumps(payload.get("selected_iso2") or []),
            now,
        ),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT
          id,
          name,
          center_lng,
          center_lat,
          zoom,
          bearing,
          pitch,
          bounds_west,
          bounds_south,
          bounds_east,
          bounds_north,
          labels_mode,
          cities_visible,
          states_visible,
          focus_seas_only,
          selected_iso2,
          created_at
        FROM map_saved_views
        WHERE id = ?
        """,
        (cur.lastrowid,),
    ).fetchone()
    return _serialize_view(dict(row))


def delete_map_view(conn, view_id: int) -> bool:
    cur = conn.execute("DELETE FROM map_saved_views WHERE id = ?", (view_id,))
    conn.commit()
    return cur.rowcount > 0


def update_map_view(conn, view_id: int, name: str) -> Optional[Dict[str, Any]]:
    conn.execute(
        """
        UPDATE map_saved_views
        SET name = ?
        WHERE id = ?
        """,
        (name, view_id),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT
          id,
          name,
          center_lng,
          center_lat,
          zoom,
          bearing,
          pitch,
          bounds_west,
          bounds_south,
          bounds_east,
          bounds_north,
          labels_mode,
          cities_visible,
          states_visible,
          focus_seas_only,
          selected_iso2,
          created_at
        FROM map_saved_views
        WHERE id = ?
        """,
        (view_id,),
    ).fetchone()
    if not row:
        return None
    return _serialize_view(dict(row))
