CREATE TABLE IF NOT EXISTS map_saved_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  center_lng REAL NOT NULL,
  center_lat REAL NOT NULL,
  zoom REAL NOT NULL,
  bearing REAL NOT NULL,
  pitch REAL NOT NULL,
  bounds_west REAL,
  bounds_south REAL,
  bounds_east REAL,
  bounds_north REAL,
  labels_mode TEXT NOT NULL,
  cities_visible INTEGER NOT NULL,
  states_visible INTEGER NOT NULL,
  focus_seas_only INTEGER NOT NULL,
  selected_iso2 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
