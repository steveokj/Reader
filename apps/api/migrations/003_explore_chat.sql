CREATE TABLE IF NOT EXISTS explore_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NULL,
  system_prompt TEXT NULL,
  cli_session_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS explore_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES explore_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS explore_messages_thread_id
  ON explore_messages(thread_id);
