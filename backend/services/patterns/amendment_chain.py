"""
amendment_chain.py — Detect taxpayers with excessive invoice amendment activity.

Graph pattern
-------------
  (new_invoice)-[:AMENDS]->(original_invoice)

A chain of depth N means: INV_3 AMENDS INV_2 AMENDS INV_1.

A vendor is flagged when they have >= config.AMENDMENT_FLAG_COUNT distinct
AMENDS chains or when any single chain depth >= 2.

Risk assignment
---------------
  chain_count >= flag_count            → HIGH
  max_chain_depth >= 2                 → HIGH
  chain_count >= 1 (but below thresh)  → MEDIUM
"""

from __future__ import annotations

import logging

import config
from database.neo4j_client import run_query
from models.schemas import AmendmentChainResult, RiskLevel

logger = logging.getLogger(__name__)

# Count distinct amendment roots per supplier (depth-1 chains)
_AMEND_COUNT_QUERY = """
MATCH (new_inv:Invoice)-[:AMENDS]->(orig:Invoice)
MATCH (new_inv)-[:ISSUED_BY]->(t:Taxpayer {user_id: $uid})
RETURN
    t.gstin                  AS gstin,
    count(DISTINCT orig)     AS chain_count,
    max(1)                   AS max_depth
ORDER BY chain_count DESC
"""

# Walk deeper chains (depth up to 5)
_AMEND_DEPTH_QUERY = """
MATCH path = (leaf:Invoice)-[:AMENDS*1..5]->(root:Invoice)
WHERE NOT (root)-[:AMENDS]->()
MATCH (leaf)-[:ISSUED_BY]->(t:Taxpayer {user_id: $uid})
WITH t.gstin AS gstin, length(path) AS depth, id(root) AS root_id
RETURN
    gstin,
    count(DISTINCT root_id) AS chain_count,
    max(depth)              AS max_depth
ORDER BY max_depth DESC, chain_count DESC
"""


def detect_amendment_chains(user_id: str = "") -> list[AmendmentChainResult]:
    """
    Detect vendors with excessive invoice amendment activity.
    Falls back to depth-1 count query if AMENDS relationships exist only at
    depth 1, or tries deeper query first.
    """
    flag_count = config.AMENDMENT_FLAG_COUNT
    uid = user_id or ""

    # Try deep traversal first
    try:
        rows = run_query(_AMEND_DEPTH_QUERY, {"uid": uid})
    except Exception as exc:
        logger.warning("Deep amendment query failed (%s), trying shallow", exc)
        rows = []

    if not rows:
        try:
            rows = run_query(_AMEND_COUNT_QUERY, {"uid": uid})
        except Exception as exc:
            logger.error("Amendment count query failed: %s", exc)
            return []

    results: list[AmendmentChainResult] = []
    seen: set[str] = set()

    for row in rows:
        gstin       = row.get("gstin")
        chain_count = int(row.get("chain_count") or 0)
        max_depth   = int(row.get("max_depth") or 1)

        if not gstin or gstin in seen:
            continue
        seen.add(gstin)

        if chain_count == 0:
            continue

        if chain_count >= flag_count or max_depth >= 2:
            risk = RiskLevel.HIGH
        else:
            risk = RiskLevel.MEDIUM

        results.append(AmendmentChainResult(
            gstin=gstin,
            amendment_chains=chain_count,
            max_chain_depth=max_depth,
            risk_level=risk,
        ))

    logger.info("Amendment chain detection: %d vendors flagged", len(results))
    return results
