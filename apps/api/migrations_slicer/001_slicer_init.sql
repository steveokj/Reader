CREATE TABLE IF NOT EXISTS slicer_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slicer_slices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  title TEXT,
  recipe_json TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES slicer_pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_slicer_slices_page_id ON slicer_slices(page_id);
