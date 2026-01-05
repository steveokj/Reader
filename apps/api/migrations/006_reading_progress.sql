CREATE TABLE IF NOT EXISTS reading_progress (
  document_id INTEGER PRIMARY KEY REFERENCES documents(id),
  section_id INTEGER NOT NULL REFERENCES document_sections(id),
  position_start INTEGER NOT NULL,
  position_end INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reading_progress_section_id ON reading_progress (section_id);
