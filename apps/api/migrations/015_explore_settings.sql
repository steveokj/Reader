CREATE TABLE IF NOT EXISTS explore_settings (
  id INTEGER PRIMARY KEY,
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
