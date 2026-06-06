"""PostgreSQL access via a small psycopg2 connection pool.

Endpoints are synchronous (`def`), so FastAPI runs them in a threadpool — a sync driver is the
simplest correct choice here. All SQL uses parameterised queries (never f-strings) per the security
checklist in CLAUDE.md.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Iterator

import psycopg2
import psycopg2.extras
import structlog
from psycopg2.pool import SimpleConnectionPool

from .config import settings

log = structlog.get_logger()
_pool: SimpleConnectionPool | None = None


def init_pool(retries: int = 30, delay: float = 2.0) -> None:
    """Initialise the connection pool, retrying while Postgres comes up."""
    global _pool
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            _pool = SimpleConnectionPool(1, 10, dsn=settings.database_url)
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("SELECT 1")
            log.info("db.pool.ready", attempt=attempt)
            return
        except psycopg2.Error as err:
            last_err = err
            log.warning("db.pool.waiting", attempt=attempt, error=str(err))
            time.sleep(delay)
    raise RuntimeError(f"could not connect to Postgres: {last_err}")


@contextmanager
def get_conn() -> Iterator[Any]:
    """Borrow a connection from the pool and return it afterwards."""
    if _pool is None:
        raise RuntimeError("connection pool not initialised")
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def query(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Run a SELECT and return rows as dicts."""
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def execute(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    """Run an INSERT/UPDATE/DELETE; return the RETURNING row if any."""
    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        if cur.description is not None:
            row = cur.fetchone()
            return dict(row) if row else None
        return None
