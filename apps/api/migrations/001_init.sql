PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  section_key TEXT NOT NULL,
  title TEXT NULL,
  content_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, section_key)
);

CREATE TABLE IF NOT EXISTS selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  section_id INTEGER NOT NULL REFERENCES document_sections(id),
  selector_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS additions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  selection_id INTEGER NOT NULL REFERENCES selections(id),
  type TEXT NOT NULL,
  title TEXT NULL,
  text_content TEXT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_type TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  to_type TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL,
  label TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS selections_document_id ON selections (document_id);
CREATE INDEX IF NOT EXISTS selections_section_id ON selections (section_id);

CREATE INDEX IF NOT EXISTS additions_selection_id ON additions (selection_id);
CREATE INDEX IF NOT EXISTS additions_type ON additions (type);

CREATE INDEX IF NOT EXISTS markers_target ON markers (target_type, target_id);
CREATE INDEX IF NOT EXISTS markers_kind ON markers (kind);

CREATE INDEX IF NOT EXISTS links_from ON links (from_type, from_id);
CREATE INDEX IF NOT EXISTS links_to ON links (to_type, to_id);
