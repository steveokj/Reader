CREATE TABLE IF NOT EXISTS slicer_page_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  html_hash TEXT NOT NULL,
  html_path TEXT NOT NULL,
  viewport_width INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES slicer_pages (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slicer_page_snapshots_page_hash
  ON slicer_page_snapshots (page_id, html_hash);

ALTER TABLE slicer_slices ADD COLUMN snapshot_id INTEGER;
