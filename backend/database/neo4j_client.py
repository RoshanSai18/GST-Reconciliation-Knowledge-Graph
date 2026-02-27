"""
Neo4j driver singleton and query utilities.

Usage
-----
    from database.neo4j_client import get_session, run_query

    # Context-manager style (preferred for complex multi-statement work)
    with get_session() as session:
        result = session.run("MATCH (n:Taxpayer) RETURN count(n) AS total")
        print(result.single()["total"])

    # Convenience wrapper (auto-opens/closes a session)
    records = run_query("MATCH (n:Invoice) RETURN n LIMIT 10")
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Generator

from neo4j import GraphDatabase, Session
from neo4j.exceptions import ServiceUnavailable

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
        _driver = GraphDatabase.driver(
            config.NEO4J_URI,
            auth=(config.NEO4J_USER, config.NEO4J_PASSWORD),
        )
        logger.info("Neo4j driver created → %s", config.NEO4J_URI)
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
    Execute a Cypher statement and return all result records as a list of
    plain Python dicts.

    Parameters
    ----------
    cypher : str
        Cypher query string.  Use ``$param`` placeholders for safety.
    params : dict, optional
        Parameter values for the query placeholders.

    Returns
    -------
    list[dict]
        Each element corresponds to one result row.

    Raises
    ------
    ServiceUnavailable
        Re-raised if Neo4j is not reachable so callers can handle it.
    """
    params = params or {}
    try:
        with get_session() as session:
            result = session.run(cypher, **params)
            return [record.data() for record in result]
    except ServiceUnavailable as exc:
        logger.error("Neo4j unavailable: %s", exc)
        raise


def run_write_query(
    cypher: str,
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Execute a write Cypher statement inside an explicit write transaction.
    Preferred for MERGE / CREATE / SET operations.

    Parameters
    ----------
    cypher : str
        Cypher write statement.
    params : dict, optional
        Parameter values.

    Returns
    -------
    list[dict]
        Result records (often empty for write-only statements).
    """
    params = params or {}
    try:
        with get_session() as session:
            result = session.execute_write(
                lambda tx: list(tx.run(cypher, **params))
            )
            return [record.data() for record in result]
    except ServiceUnavailable as exc:
        logger.error("Neo4j unavailable during write: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def verify_connectivity() -> bool:
    """
    Ping the Neo4j instance.  Returns True if reachable, False otherwise.
    Called during app startup so failures surface early.
    """
    try:
        get_driver().verify_connectivity()
        logger.info("Neo4j connectivity verified.")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Neo4j connectivity check failed: %s", exc)
        return False
