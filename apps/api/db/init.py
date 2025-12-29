import os
from datetime import datetime, timezone

from .conn import get_conn
from ..services.documents import ensure_sample_document


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    conn = get_conn()
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        conn.commit()

        migrations_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "migrations"))
        if os.path.isdir(migrations_dir):
            applied = {
                row["filename"]
                for row in conn.execute("SELECT filename FROM schema_migrations").fetchall()
            }
            for filename in sorted(os.listdir(migrations_dir)):
                if not filename.endswith(".sql"):
                    continue
                if filename in applied:
                    continue
                path = os.path.join(migrations_dir, filename)
                with open(path, "r", encoding="utf-8") as handle:
                    sql = handle.read()
                conn.executescript(sql)
                conn.execute(
                    "INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)",
                    (filename, _iso_now()),
                )
                conn.commit()

        ensure_sample_document(conn)
    finally:
        conn.close()
