"""SQLite 连接与迁移执行。表结构定义独立在 database/migrations/ 中。"""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from .config import PROJECT_ROOT, settings

MIGRATION_DIR = PROJECT_ROOT / "database" / "migrations"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.data_dir / "sqlite" / "longy.db", timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db() -> None:
    conn = get_db()
    try:
        conn.executescript(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);"
        )
        applied = {r["version"] for r in conn.execute("SELECT version FROM schema_migrations")}
        for path in sorted(MIGRATION_DIR.glob("*.sql")):
            version = path.stem.split("__", 1)[0]
            if version in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            with conn:
                conn.executescript(sql)
                conn.execute(
                    "INSERT INTO schema_migrations(version, name, applied_at) VALUES(?,?,?)",
                    (version, path.stem, utc_now()),
                )
    finally:
        conn.close()

