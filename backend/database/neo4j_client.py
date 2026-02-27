"""
Neo4j driver singleton and query utilities.
Configured for Neo4j Aura using the recommended driver pattern.

Usage
-----
    from database.neo4j_client import run_query, run_write_query

    records = run_query("MATCH (n:Invoice) RETURN n LIMIT 10")
    run_write_query("MERGE (t:Taxpayer {gstin: $gstin})", {"gstin": "..."})
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Generator

from neo4j import GraphDatabase, Session
from neo4j.exceptions import AuthError, ServiceUnavailable

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Driver singleton
# ---------------------------------------------------------------------------
_driver = None


def get_driver():
    """Return the shared Neo4j driver, initialising it on first call."""
    global _driver
    if _driver is None:
        # Use URI + AUTH pattern recommended by Neo4j Aura
        URI  = config.NEO4J_URI
        AUTH = (config.NEO4J_USER, config.NEO4J_PASSWORD)
        _driver = GraphDatabase.driver(URI, auth=AUTH)
        logger.info("Neo4j driver created → %s", URI)
    return _driver


def close_driver() -> None:
    """Close the driver and release all connections (call on app shutdown)."""
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None
        logger.info("Neo4j driver closed.")


# ---------------------------------------------------------------------------
# Session helper
# ---------------------------------------------------------------------------
@contextmanager
def get_session() -> Generator[Session, None, None]:
    """
    Context manager that yields an open Neo4j session against the configured
    database and closes it when the block exits (even on error).

    Example
    -------
        with get_session() as session:
            session.run("MERGE (t:Taxpayer {gstin: $gstin})", gstin="...")
    """
    driver = get_driver()
    session: Session = driver.session(database=config.NEO4J_DATABASE)
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Convenience query wrapper
# ---------------------------------------------------------------------------
def run_query(
    cypher: str,
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Execute a read Cypher statement using the Aura-recommended
    driver.execute_query() API and return all rows as plain dicts.
    """
    params = params or {}
    try:
        records, _, _ = get_driver().execute_query(
            cypher,
            parameters_=params,
            database_=config.NEO4J_DATABASE,
            routing_="r",
        )
        return [record.data() for record in records]
    except (ServiceUnavailable, AuthError) as exc:
        logger.error("Neo4j unavailable: %s", exc)
        raise


def run_write_query(
    cypher: str,
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Execute a write Cypher statement using the Aura-recommended
    driver.execute_query() API with write routing.
    """
    params = params or {}
    try:
        records, _, _ = get_driver().execute_query(
            cypher,
            parameters_=params,
            database_=config.NEO4J_DATABASE,
            routing_="w",
        )
        return [record.data() for record in records]
    except (ServiceUnavailable, AuthError) as exc:
        logger.error("Neo4j unavailable during write: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def verify_connectivity() -> bool:
    """
    Ping the Neo4j Aura instance. Returns True if reachable, False otherwise.
    Called during app startup so failures surface early.
    """
    try:
        URI  = config.NEO4J_URI
        AUTH = (config.NEO4J_USER, config.NEO4J_PASSWORD)
        with GraphDatabase.driver(URI, auth=AUTH) as driver:
            driver.verify_connectivity()
        logger.info("Neo4j connectivity verified → %s", URI)
        return True
    except AuthError as exc:
        logger.error("Neo4j auth failed (check NEO4J_USER / NEO4J_PASSWORD): %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("Neo4j connectivity check failed: %s", exc)
        return False
