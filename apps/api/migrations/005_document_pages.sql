CREATE TABLE IF NOT EXISTS document_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  section_id INTEGER NOT NULL REFERENCES document_sections(id),
  page_index INTEGER NOT NULL,
  page_label TEXT NOT NULL,
  page_number INTEGER NULL,
  position_start INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, page_index)
);

CREATE INDEX IF NOT EXISTS document_pages_document_id ON document_pages (document_id);
CREATE INDEX IF NOT EXISTS document_pages_section_id ON document_pages (section_id);
