CREATE TABLE IF NOT EXISTS explore_thread_documents (
  document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES explore_threads(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS explore_thread_documents_thread_id
  ON explore_thread_documents(thread_id);
