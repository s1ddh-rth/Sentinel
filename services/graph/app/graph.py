"""Neo4j access for the graph service.

A thin wrapper over the official Neo4j Python driver. Queries are parameterised (never f-strings).
The driver is created lazily and reused; ``ping`` backs the health check.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog
from neo4j import GraphDatabase

from .config import settings

if TYPE_CHECKING:
    from neo4j import Driver

log = structlog.get_logger()
_driver: Driver | None = None


def driver() -> Driver:
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(
            settings.neo4j_url, auth=(settings.neo4j_user, settings.neo4j_password)
        )
        log.info("graph.driver.created", url=settings.neo4j_url)
    return _driver


def close() -> None:
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None


def query(cypher: str, **params: Any) -> list[dict[str, Any]]:
    """Run a read query and return rows as plain dicts."""
    with driver().session() as session:
        result = session.run(cypher, **params)
        return [dict(record) for record in result]


def ping() -> bool:
    """Return True if Neo4j answers a trivial query."""
    try:
        rows = query("RETURN 1 AS ok")
        return bool(rows and rows[0].get("ok") == 1)
    except Exception as err:  # noqa: BLE001 - health check must never raise
        log.warning("graph.ping.failed", error=str(err))
        return False
