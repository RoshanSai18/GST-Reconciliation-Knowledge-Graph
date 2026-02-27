"""
feature_extractor.py — Build per-vendor ML feature vectors from Neo4j.

Feature vector (8 floats per taxpayer)
---------------------------------------
  0  invoice_count          Total invoices as seller
  1  high_risk_ratio        Fraction of invoices with status = High-Risk
  2  warning_ratio          Fraction of invoices with status = Warning
  3  amendment_rate         Fraction of invoices that have an AMENDS edge
  4  missing_payment_rate   Fraction of invoices with no PAID_VIA link
  5  avg_delay_days         Average (payment_date - invoice_date) in days, 0 if none
  6  late_filing_rate       Fraction of GSTR-1 filings submitted after the 11th
  7  value_mismatch_rate    Fraction of invoices flagged as VALUE_MISMATCH

Returns
-------
  list[dict]  — each dict has 'gstin' + the 8 feature keys above
"""

from __future__ import annotations

import logging

from database.neo4j_client import run_query

logger = logging.getLogger(__name__)

FEATURE_NAMES = [
    "invoice_count",
    "high_risk_ratio",
    "warning_ratio",
    "amendment_rate",
    "missing_payment_rate",
    "avg_delay_days",
    "late_filing_rate",
    "value_mismatch_rate",
]

# ---------------------------------------------------------------------------
# Cypher queries
# ---------------------------------------------------------------------------

# Invoice-level stats per seller
_INVOICE_STATS_QUERY = """
MATCH (t:Taxpayer)
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
WITH
    t.gstin AS gstin,
    count(i)                                                        AS invoice_count,
    count(CASE WHEN i.status = 'High-Risk'    THEN 1 END)          AS high_risk_count,
    count(CASE WHEN i.status = 'Warning'      THEN 1 END)          AS warning_count,
    count(CASE WHEN (i)-[:AMENDS]->()         THEN 1 END)          AS amendment_count,
    count(CASE WHEN i.anomaly_type = 'VALUE_MISMATCH' THEN 1 END)  AS mismatch_count
RETURN
    gstin,
    invoice_count,
    high_risk_count,
    warning_count,
    amendment_count,
    mismatch_count
"""

# Payment delay per seller
_PAYMENT_DELAY_QUERY = """
MATCH (i:Invoice)-[:ISSUED_BY]->(t:Taxpayer)
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
WITH
    t.gstin AS gstin,
    count(i)                                              AS total_inv,
    count(CASE WHEN p IS NULL THEN 1 END)                 AS no_payment_count,
    avg(CASE
        WHEN p IS NOT NULL AND i.invoice_date IS NOT NULL AND p.payment_date IS NOT NULL
        THEN duration.between(date(i.invoice_date), date(p.payment_date)).days
        ELSE null
    END)                                                  AS avg_delay
RETURN gstin, total_inv, no_payment_count, avg_delay
"""

# Late filing rate per seller (GSTR-1 filed after 11th of the following month)
_LATE_FILING_QUERY = """
MATCH (g:GSTR1)-[:FILED_BY]->(t:Taxpayer)
WHERE g.filing_date IS NOT NULL AND g.period IS NOT NULL
WITH
    t.gstin            AS gstin,
    count(g)           AS total_filings,
    count(CASE
        WHEN date(g.filing_date) >
             date(g.period + '-11') + duration('P1M')
        THEN 1
    END)               AS late_count
RETURN gstin, total_filings, late_count
"""


def extract_features() -> list[dict]:
    """
    Pull feature data from Neo4j for every Taxpayer and return a list of
    feature dicts ready for model training or scoring.
    """
    # ── Query 1: invoice stats ────────────────────────────────────────────
    try:
        inv_rows = run_query(_INVOICE_STATS_QUERY)
    except Exception as exc:
        logger.error("Invoice stats query failed: %s", exc)
        inv_rows = []

    # ── Query 2: payment delay ────────────────────────────────────────────
    try:
        pay_rows = run_query(_PAYMENT_DELAY_QUERY)
    except Exception as exc:
        logger.error("Payment delay query failed: %s", exc)
        pay_rows = []

    # ── Query 3: late filing ──────────────────────────────────────────────
    try:
        file_rows = run_query(_LATE_FILING_QUERY)
    except Exception as exc:
        logger.error("Late filing query failed: %s", exc)
        file_rows = []

    # ── Merge into per-GSTIN dicts ────────────────────────────────────────
    inv_lk  = {r["gstin"]: r for r in inv_rows  if r.get("gstin")}
    pay_lk  = {r["gstin"]: r for r in pay_rows  if r.get("gstin")}
    file_lk = {r["gstin"]: r for r in file_rows if r.get("gstin")}

    all_gstins = set(inv_lk) | set(pay_lk) | set(file_lk)
    features: list[dict] = []

    for gstin in all_gstins:
        inv  = inv_lk.get(gstin, {})
        pay  = pay_lk.get(gstin, {})
        fil  = file_lk.get(gstin, {})

        n_inv       = int(inv.get("invoice_count") or 0)
        n_high      = int(inv.get("high_risk_count") or 0)
        n_warn      = int(inv.get("warning_count") or 0)
        n_amend     = int(inv.get("amendment_count") or 0)
        n_mismatch  = int(inv.get("mismatch_count") or 0)
        n_no_pay    = int(pay.get("no_payment_count") or 0)
        avg_delay   = float(pay.get("avg_delay") or 0.0)
        n_filings   = int(fil.get("total_filings") or 0)
        n_late      = int(fil.get("late_count") or 0)

        safe = max(n_inv, 1)  # avoid zero-division

        features.append({
            "gstin":               gstin,
            "invoice_count":       n_inv,
            "high_risk_ratio":     round(n_high    / safe, 4),
            "warning_ratio":       round(n_warn    / safe, 4),
            "amendment_rate":      round(n_amend   / safe, 4),
            "missing_payment_rate":round(n_no_pay  / safe, 4),
            "avg_delay_days":      round(max(avg_delay, 0.0), 2),
            "late_filing_rate":    round(n_late / max(n_filings, 1), 4),
            "value_mismatch_rate": round(n_mismatch / safe, 4),
        })

    logger.info("Extracted features for %d taxpayers", len(features))
    return features


def to_matrix(feature_rows: list[dict]) -> tuple[list[str], list[list[float]]]:
    """
    Convert feature row dicts to (gstins, X) where X is a 2-D float list
    suitable for scikit-learn.
    """
    gstins = [r["gstin"] for r in feature_rows]
    X      = [[float(r[f]) for f in FEATURE_NAMES] for r in feature_rows]
    return gstins, X
