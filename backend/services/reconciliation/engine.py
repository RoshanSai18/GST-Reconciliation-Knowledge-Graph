"""
engine.py — Reconciliation engine orchestrator.

Ties together path_validator, value_checker, time_checker and explainer,
fetches invoice context from Neo4j, and writes results back.

Public API
----------
reconcile_invoice(invoice_id)           → ExplainResult
reconcile_all(gstin, tax_period, limit) → ReconciliationSummary
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import config
from database.neo4j_client import run_query, run_write_query
from models.schemas import InvoiceStatus, ReconciliationSummary
from services.reconciliation.explainer import ExplainResult, explain
from services.reconciliation.path_validator import check_paths
from services.reconciliation.time_checker import check_timing
from services.reconciliation.value_checker import check_values

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal: fetch one invoice's full context from Neo4j
# ---------------------------------------------------------------------------

_CONTEXT_QUERY = """
MATCH (i:Invoice {invoice_id: $id, user_id: $uid})
OPTIONAL MATCH (i)-[:ISSUED_BY]->(s:Taxpayer)
OPTIONAL MATCH (i)-[:RECEIVED_BY]->(b:Taxpayer)
OPTIONAL MATCH (i)-[:REPORTED_IN]->(g1:GSTR1)
OPTIONAL MATCH (i)-[:REFLECTED_IN]->(g2b:GSTR2B)
// Take earliest payment by date (in case of multiple) for timeliness check
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
WITH i, s, b, g1, g2b,
     CASE WHEN p IS NOT NULL
          THEN p
          ELSE null END AS p_first,
     (p IS NOT NULL) AS has_payment_flag
ORDER BY p.payment_date ASC
WITH i, s, b, g1, g2b, collect(p_first)[0] AS p, has_payment_flag
RETURN
    i.gstr1_taxable_value AS gstr1_val,
    i.pr_taxable_value    AS pr_val,
    i.taxable_value       AS taxable_value,
    i.cgst                AS cgst,
    i.sgst                AS sgst,
    i.igst                AS igst,
    i.total_value         AS total_value,
    i.invoice_date        AS invoice_date,
    s IS NOT NULL         AS has_supplier,
    b IS NOT NULL         AS has_buyer,
    g1 IS NOT NULL        AS has_gstr1,
    g2b IS NOT NULL       AS has_gstr2b,
    has_payment_flag      AS has_payment,
    g1.filing_date        AS g1_filing_date,
    g1.tax_period         AS g1_tax_period,
    g1.status             AS g1_status,
    p.payment_date        AS payment_date,
    p.amount_paid         AS payment_amount
LIMIT 1
"""


def _fetch_context(invoice_id: str, user_id: str = "") -> dict | None:
    rows = run_query(_CONTEXT_QUERY, {"id": invoice_id, "uid": user_id})
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# Internal: write reconciliation result back onto Invoice node
# ---------------------------------------------------------------------------

_WRITE_QUERY = """
MATCH (i:Invoice {invoice_id: $invoice_id, user_id: $uid})
SET i.status      = $status,
    i.risk_level  = $risk_level,
    i.explanation = $explanation,
    i.reconciled_at = $reconciled_at
"""


def _write_result(invoice_id: str, result: ExplainResult, user_id: str = "") -> None:
    run_write_query(_WRITE_QUERY, {
        "invoice_id":    invoice_id,
        "uid":           user_id,
        "status":        result.status.value,
        "risk_level":    result.risk_level.value,
        "explanation":   result.explanation,
        "reconciled_at": datetime.now(timezone.utc).isoformat(),
    })


# ---------------------------------------------------------------------------
# Internal: list invoice IDs to process
# ---------------------------------------------------------------------------

def _list_invoice_ids(
    gstin:       str | None = None,
    tax_period:  str | None = None,
    limit:       int | None = None,
    user_id:     str        = "",
) -> list[str]:
    """
    Fetch invoice IDs matching optional filters.

    gstin       → match invoices where supplier OR buyer is this GSTIN
    tax_period  → match invoices linked to a GSTR-1 with this tax_period
    limit       → cap total results (useful for testing)
    user_id     → only return invoices belonging to this user
    """
    if tax_period:
        cypher = """
        MATCH (i:Invoice {user_id: $uid})-[:REPORTED_IN]->(g1:GSTR1 {tax_period: $period})
        WHERE $gstin IS NULL
           OR i.supplier_gstin = $gstin
           OR i.buyer_gstin    = $gstin
        RETURN DISTINCT i.invoice_id AS invoice_id
        """
        params: dict = {"period": tax_period, "gstin": gstin, "uid": user_id}
    else:
        cypher = """
        MATCH (i:Invoice {user_id: $uid})
        WHERE $gstin IS NULL
           OR i.supplier_gstin = $gstin
           OR i.buyer_gstin    = $gstin
        RETURN i.invoice_id AS invoice_id
        """
        params = {"gstin": gstin, "uid": user_id}

    rows = run_query(cypher, params)
    ids  = [r["invoice_id"] for r in rows if r.get("invoice_id")]
    if limit:
        ids = ids[:limit]
    return ids


# ---------------------------------------------------------------------------
# Public: reconcile one invoice
# ---------------------------------------------------------------------------

def reconcile_invoice(invoice_id: str, user_id: str = "") -> ExplainResult | None:
    """
    Run full reconciliation pipeline for a single invoice.

    Returns the ExplainResult (and writes it back to the graph), or None if
    the invoice_id was not found in Neo4j.
    """
    ctx = _fetch_context(invoice_id, user_id=user_id)
    if ctx is None:
        logger.warning("Invoice not found in graph: %s", invoice_id)
        return None

    path_res  = check_paths(ctx)
    value_res = check_values(ctx, config.VALUE_TOLERANCE_PERCENT)
    time_res  = check_timing(ctx, config.PAYMENT_GRACE_DAYS, config.CHRONIC_DELAY_DAYS)
    result    = explain(path_res, value_res, time_res)

    _write_result(invoice_id, result, user_id=user_id)
    logger.debug(
        "Reconciled %s → status=%s risk=%s",
        invoice_id, result.status.value, result.risk_level.value,
    )
    return result


# ---------------------------------------------------------------------------
# Public: batch reconciliation
# ---------------------------------------------------------------------------

def reconcile_all(
    gstin:      str | None = None,
    tax_period: str | None = None,
    limit:      int | None = None,
    user_id:    str        = "",
) -> ReconciliationSummary:
    """
    Reconcile all matching invoices and return a summary.

    Parameters
    ----------
    gstin       : restrict to invoices for this taxpayer (supplier or buyer)
    tax_period  : restrict to invoices in this GSTR-1 filing period ("MMYYYY")
    limit       : max number of invoices to process (None = no cap)
    user_id     : only reconcile this user's invoices

    Returns
    -------
    ReconciliationSummary with counts by status and wall-clock duration.
    """
    t0 = time.perf_counter()

    ids = _list_invoice_ids(gstin=gstin, tax_period=tax_period, limit=limit, user_id=user_id)
    logger.info(
        "Starting reconciliation: %d invoices | gstin=%s | period=%s",
        len(ids), gstin, tax_period,
    )

    counts: dict[str, int] = {
        InvoiceStatus.VALID.value:     0,
        InvoiceStatus.WARNING.value:   0,
        InvoiceStatus.HIGH_RISK.value: 0,
        InvoiceStatus.PENDING.value:   0,
    }

    for inv_id in ids:
        try:
            result = reconcile_invoice(inv_id, user_id=user_id)
            if result:
                counts[result.status.value] += 1
            else:
                counts[InvoiceStatus.PENDING.value] += 1
        except Exception as exc:
            logger.error("Reconciliation failed for invoice %s: %s", inv_id, exc)
            counts[InvoiceStatus.PENDING.value] += 1

    duration_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(
        "Reconciliation complete: %d processed in %.1f ms | %s",
        len(ids), duration_ms, counts,
    )

    return ReconciliationSummary(
        total=len(ids),
        valid=counts[InvoiceStatus.VALID.value],
        warning=counts[InvoiceStatus.WARNING.value],
        high_risk=counts[InvoiceStatus.HIGH_RISK.value],
        pending=counts[InvoiceStatus.PENDING.value],
        duration_ms=duration_ms,
        run_at=datetime.now(timezone.utc),
    )
