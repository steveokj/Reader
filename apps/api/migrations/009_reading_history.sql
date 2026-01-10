CREATE TABLE IF NOT EXISTS reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  section_id INTEGER NOT NULL REFERENCES document_sections(id),
  position_start INTEGER NOT NULL,
  page_number INTEGER NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reading_history_document_id ON reading_history (document_id);
CREATE INDEX IF NOT EXISTS reading_history_created_at ON reading_history (created_at);
