"""
risk_network.py — Detect taxpayers whose trading partners are predominantly
high-risk (guilt-by-association analysis).

Logic
-----
For each Taxpayer, count:
  - total_partners   : distinct GSTINs connected via any Invoice edge
  - risky_partners   : partners whose risk_level = 'High'

A vendor is flagged when:
  risky_partner_ratio >= config.RISKY_PARTNER_THRESHOLD

The risk_level on Taxpayer nodes is written by the ML scorer (Phase 8).
This detector reads whatever is already stored; an empty graph is fine —
it simply returns no results until scoring has run.

Risk assignment
---------------
  risky_ratio >= threshold × 2   → HIGH  (majority of network is risky)
  risky_ratio >= threshold        → MEDIUM
"""

from __future__ import annotations

import logging

import config
from database.neo4j_client import run_query
from models.schemas import RiskLevel, RiskNetworkResult

logger = logging.getLogger(__name__)

_NETWORK_QUERY = """
// For each taxpayer, collect all direct trading partners
MATCH (t:Taxpayer)
OPTIONAL MATCH (inv:Invoice)-[:ISSUED_BY|RECEIVED_BY]->(partner:Taxpayer)
WHERE (
    (inv)-[:ISSUED_BY]->(t)  OR
    (inv)-[:RECEIVED_BY]->(t)
)
AND partner <> t
WITH
    t.gstin    AS gstin,
    count(DISTINCT partner)                                     AS total_partners,
    count(DISTINCT CASE WHEN partner.risk_level = 'High'
                        THEN partner END)                       AS risky_partners
WHERE total_partners > 0
RETURN
    gstin,
    total_partners,
    risky_partners,
    toFloat(risky_partners) / toFloat(total_partners) AS risky_ratio
ORDER BY risky_ratio DESC
"""


def detect_risk_networks() -> list[RiskNetworkResult]:
    """
    Detect taxpayers embedded in predominantly high-risk trading networks.
    Returns [] if risk_level has not yet been populated on Taxpayer nodes.
    """
    threshold = config.RISKY_PARTNER_THRESHOLD

    try:
        rows = run_query(_NETWORK_QUERY)
    except Exception as exc:
        logger.error("Risk network query failed: %s", exc)
        return []

    results: list[RiskNetworkResult] = []

    for row in rows:
        ratio = float(row.get("risky_ratio") or 0.0)
        if ratio < threshold:
            continue

        total   = int(row.get("total_partners") or 0)
        risky   = int(row.get("risky_partners") or 0)
        risk    = RiskLevel.HIGH if ratio >= threshold * 2 else RiskLevel.MEDIUM

        results.append(RiskNetworkResult(
            gstin=row["gstin"],
            total_partners=total,
            risky_partners=risky,
            risky_partner_ratio=round(ratio, 4),
            risk_level=risk,
        ))

    logger.info("Risk network detection: %d vendors flagged", len(results))
    return results
