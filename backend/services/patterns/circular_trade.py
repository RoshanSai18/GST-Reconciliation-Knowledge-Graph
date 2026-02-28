"""
circular_trade.py — Detect circular trading loops in the invoice graph.

A circular trade is a closed chain of buy/sell relationships:
  Taxpayer A sells to B, B sells to C, C sells back to A
  (length-3 loop; we also check length-2 back-and-forth trades).

Graph traversal uses the existing:
  (Invoice)-[:ISSUED_BY]->(Taxpayer)    ← seller
  (Invoice)-[:RECEIVED_BY]->(Taxpayer)  ← buyer

Procedure
---------
1. Cypher query finds all 3-hop closed loops.
2. Each loop is canonicalised (sorted GSTIN tuple → hash) to deduplicate.
3. Returns list[CircularTradeResult].
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from database.neo4j_client import run_query
from models.schemas import CircularTradeResult, RiskLevel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cypher: 3-node circular loop  A→B→C→A
# We match via invoice edges so that the same GSTIN pair covered by multiple
# invoices still counts as a single logical hop.
# The WHERE clause enforces all three nodes are distinct and prevents counting
# the same loop in different rotations by requiring a < b and a < c.
# ---------------------------------------------------------------------------
_CIRCULAR_3_QUERY = """
MATCH
    (i1:Invoice)-[:ISSUED_BY]->(a:Taxpayer {user_id: $uid}),
    (i1)-[:RECEIVED_BY]->(b:Taxpayer {user_id: $uid}),
    (i2:Invoice)-[:ISSUED_BY]->(b),
    (i2)-[:RECEIVED_BY]->(c:Taxpayer {user_id: $uid}),
    (i3:Invoice)-[:ISSUED_BY]->(c),
    (i3)-[:RECEIVED_BY]->(a)
WHERE a <> b AND b <> c AND a <> c
  AND a.gstin < b.gstin AND a.gstin < c.gstin
RETURN
    a.gstin        AS g_a,
    b.gstin        AS g_b,
    c.gstin        AS g_c,
    i1.invoice_id  AS inv_ab,
    i2.invoice_id  AS inv_bc,
    i3.invoice_id  AS inv_ca,
    i1._period     AS period
LIMIT 500
"""

# ---------------------------------------------------------------------------
# Cypher: 2-node back-and-forth loop  A→B and B→A
# ---------------------------------------------------------------------------
_CIRCULAR_2_QUERY = """
MATCH
    (i1:Invoice)-[:ISSUED_BY]->(a:Taxpayer {user_id: $uid}),
    (i1)-[:RECEIVED_BY]->(b:Taxpayer {user_id: $uid}),
    (i2:Invoice)-[:ISSUED_BY]->(b),
    (i2)-[:RECEIVED_BY]->(a)
WHERE a <> b AND a.gstin < b.gstin
RETURN
    a.gstin        AS g_a,
    b.gstin        AS g_b,
    i1.invoice_id  AS inv_ab,
    i2.invoice_id  AS inv_ba,
    i1._period     AS period
LIMIT 500
"""


def _cycle_id(gstins: list[str]) -> str:
    key = "|".join(sorted(gstins))
    return hashlib.md5(key.encode()).hexdigest()[:12]


def detect_circular_trades(user_id: str = "") -> list[CircularTradeResult]:
    """
    Query the graph for circular trading patterns.
    Returns a deduplicated list of CircularTradeResult.
    """
    uid = user_id or ""
    results: dict[str, CircularTradeResult] = {}

    # ── 3-node loops ─────────────────────────────────────────────────────
    try:
        rows3 = run_query(_CIRCULAR_3_QUERY, {"uid": uid})
    except Exception as exc:
        logger.error("Circular-trade 3-node query failed: %s", exc)
        rows3 = []

    for row in rows3:
        gstins = [row["g_a"], row["g_b"], row["g_c"]]
        cid    = _cycle_id(gstins)
        if cid not in results:
            results[cid] = CircularTradeResult(
                cycle_id=cid,
                gstins=gstins,
                invoice_ids=[row["inv_ab"], row["inv_bc"], row["inv_ca"]],
                period=row.get("period"),
                risk_level=RiskLevel.HIGH,
            )
        else:
            # Add any new invoice IDs to the existing cycle record
            existing_ids = set(results[cid].invoice_ids)
            for iid in [row["inv_ab"], row["inv_bc"], row["inv_ca"]]:
                if iid and iid not in existing_ids:
                    results[cid].invoice_ids.append(iid)
                    existing_ids.add(iid)

    # ── 2-node back-and-forth loops ───────────────────────────────────────
    try:
        rows2 = run_query(_CIRCULAR_2_QUERY, {"uid": uid})
    except Exception as exc:
        logger.error("Circular-trade 2-node query failed: %s", exc)
        rows2 = []

    for row in rows2:
        gstins = [row["g_a"], row["g_b"]]
        cid    = _cycle_id(gstins)
        if cid not in results:
            results[cid] = CircularTradeResult(
                cycle_id=cid,
                gstins=gstins,
                invoice_ids=[row["inv_ab"], row["inv_ba"]],
                period=row.get("period"),
                risk_level=RiskLevel.HIGH,
            )

    logger.info("Circular trade detection: %d unique cycles found", len(results))
    return list(results.values())
