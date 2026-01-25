CREATE TABLE IF NOT EXISTS web_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS web_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  selection_text TEXT NOT NULL,
  selector_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES web_pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_additions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  selection_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  text_content TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (selection_id) REFERENCES web_selections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web_selections_page_id ON web_selections(page_id);
CREATE INDEX IF NOT EXISTS idx_web_additions_selection_id ON web_additions(selection_id);
CREATE INDEX IF NOT EXISTS idx_web_markers_target ON web_markers(target_type, target_id);
