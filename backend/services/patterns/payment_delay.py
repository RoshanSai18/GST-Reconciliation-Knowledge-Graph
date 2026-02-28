"""
payment_delay.py — Detect taxpayers with chronic payment delays.

Logic
-----
For each supplier Taxpayer, look at all invoices where a TaxPayment exists
(via PAID_VIA) and compute:
  delay_days = payment_date − invoice_date

A vendor is flagged when:
  avg_delay_days > config.PAYMENT_GRACE_DAYS   → MEDIUM risk
  avg_delay_days > config.CHRONIC_DELAY_DAYS   → HIGH risk
  (or max_delay_days > chronic threshold)

Returns list[PaymentDelayResult] sorted by avg_delay_days descending.
"""

from __future__ import annotations

import logging

import config
from database.neo4j_client import run_query
from models.schemas import PaymentDelayResult, RiskLevel

logger = logging.getLogger(__name__)

_DELAY_QUERY = """
MATCH (i:Invoice)-[:ISSUED_BY]->(t:Taxpayer {user_id: $uid})
MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
WHERE i.invoice_date IS NOT NULL AND p.payment_date IS NOT NULL
WITH
    t.gstin AS gstin,
    duration.between(
        date(i.invoice_date),
        date(p.payment_date)
    ).days AS delay_days
WHERE delay_days > 0
RETURN
    gstin,
    avg(delay_days)   AS avg_delay,
    max(delay_days)   AS max_delay,
    count(*)          AS invoice_count
ORDER BY avg_delay DESC
"""


def detect_payment_delays(min_invoices: int = 1, user_id: str = "") -> list[PaymentDelayResult]:
    """
    Detect vendors with above-grace-period payment delays.

    Parameters
    ----------
    min_invoices : int
        Minimum number of delayed invoices required to flag a vendor.
    user_id : str
        Clerk user ID — only queries this user's data.
    """
    try:
        rows = run_query(_DELAY_QUERY, {"uid": user_id or ""})
    except Exception as exc:
        logger.error("Payment delay query failed: %s", exc)
        return []

    grace    = config.PAYMENT_GRACE_DAYS
    chronic  = config.CHRONIC_DELAY_DAYS
    results: list[PaymentDelayResult] = []

    for row in rows:
        avg_delay  = float(row.get("avg_delay") or 0)
        max_delay  = float(row.get("max_delay") or 0)
        count      = int(row.get("invoice_count") or 0)

        if avg_delay <= grace and max_delay <= grace:
            continue
        if count < min_invoices:
            continue

        if avg_delay > chronic or max_delay > chronic:
            risk = RiskLevel.HIGH
        else:
            risk = RiskLevel.MEDIUM

        results.append(PaymentDelayResult(
            gstin=row["gstin"],
            avg_delay_days=round(avg_delay, 1),
            max_delay_days=round(max_delay, 1),
            affected_invoice_count=count,
            risk_level=risk,
        ))

    logger.info("Payment delay detection: %d vendors flagged", len(results))
    return results
