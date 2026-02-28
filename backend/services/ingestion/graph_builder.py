"""
Graph builder — MERGE-based Cypher writers for all node types and relationships.

All operations use MERGE so re-uploading the same file is fully idempotent.
SET ... += updates only the supplied properties (no accidental property deletion).

Node labels match the schema exactly:
  Taxpayer, Invoice, GSTR1, GSTR2B, GSTR3B, TaxPayment

Relationships written here:
  (Invoice)-[:ISSUED_BY]->(Taxpayer)     — supplier
  (Invoice)-[:RECEIVED_BY]->(Taxpayer)   — buyer
  (Invoice)-[:REPORTED_IN]->(GSTR1)
  (Invoice)-[:REFLECTED_IN]->(GSTR2B)
  (Invoice)-[:PAID_VIA]->(TaxPayment)
  (TaxPayment)-[:SETTLED_IN]->(GSTR3B)
  (GSTR1)-[:FILED_BY]->(Taxpayer)
  (GSTR2B)-[:FILED_BY]->(Taxpayer)
  (GSTR3B)-[:FILED_BY]->(Taxpayer)
  (Invoice)-[:AMENDS]->(Invoice)

Derived fields (status, risk_level, explanation, risk_score) are written back
by the reconciliation engine and ML scorer — NOT set here.
"""

from __future__ import annotations

import logging
from typing import Any

from database.neo4j_client import run_write_query
from models.schemas import (
    GSTR1IngestionRow,
    GSTR2BIngestionRow,
    GSTR3BIngestionRow,
    InvoiceIngestionRow,
    TaxPaymentIngestionRow,
    TaxpayerIngestionRow,
)
from services.validators import determine_authoritative_value

logger = logging.getLogger(__name__)


# =============================================================================
# Taxpayer
# =============================================================================

def upsert_taxpayer(row: TaxpayerIngestionRow) -> None:
    """MERGE a Taxpayer node and set/update its properties."""
    cypher = """
    MERGE (t:Taxpayer {gstin: $gstin})
    SET t += {
        legal_name:          $legal_name,
        trade_name:          $trade_name,
        state:               $state,
        state_code:          $state_code,
        registration_date:   $registration_date,
        registration_status: $registration_status,
        taxpayer_type:       $taxpayer_type,
        risk_score:          $risk_score,
        pan:                 $pan,
        country_code:        $country_code,
        filing_frequency:    $filing_frequency
    }
    """
    run_write_query(cypher, {
        "gstin":               row.gstin,
        "legal_name":          row.legal_name,
        "trade_name":          row.trade_name,
        "state":               row.state,
        "state_code":          row.state_code,
        "registration_date":   row.registration_date,
        "registration_status": row.registration_status,
        "taxpayer_type":       row.taxpayer_type,
        "risk_score":          row.risk_score,
        "pan":                 row.pan,
        "country_code":        row.country_code,
        "filing_frequency":    row.filing_frequency,
    })


def upsert_taxpayers_batch(rows: list[TaxpayerIngestionRow], user_id: str = "") -> int:
    """Bulk upsert taxpayers using UNWIND for performance. Returns loaded count."""
    if not rows:
        return 0
    cypher = """
    UNWIND $batch AS r
    MERGE (t:Taxpayer {gstin: r.gstin, user_id: r.user_id})
    SET t += {
        legal_name:          r.legal_name,
        trade_name:          r.trade_name,
        state:               r.state,
        state_code:          r.state_code,
        registration_date:   r.registration_date,
        registration_status: r.registration_status,
        taxpayer_type:       r.taxpayer_type,
        risk_score:          r.risk_score,
        pan:                 r.pan,
        country_code:        r.country_code,
        filing_frequency:    r.filing_frequency
    }
    """
    batch = [
        {
            "gstin":               r.gstin,
            "legal_name":          r.legal_name,
            "trade_name":          r.trade_name,
            "state":               r.state,
            "state_code":          r.state_code,
            "registration_date":   r.registration_date,
            "registration_status": r.registration_status,
            "taxpayer_type":       r.taxpayer_type,
            "risk_score":          r.risk_score,
            "pan":                 r.pan,
            "country_code":        r.country_code,
            "user_id":             user_id,
            "filing_frequency":    r.filing_frequency,
        }
        for r in rows
    ]
    run_write_query(cypher, {"batch": batch})
    logger.info("Upserted %d Taxpayer nodes", len(rows))
    return len(rows)


# =============================================================================
# Invoice
# =============================================================================

def upsert_invoices_batch(rows: list[InvoiceIngestionRow], user_id: str = "") -> int:
    """
    Bulk upsert Invoice nodes.
    - Computes taxable_value using trust hierarchy (GSTR1 > PR).
    - Creates ISSUED_BY, RECEIVED_BY, REPORTED_IN, REFLECTED_IN, AMENDS
      relationships in the same transaction.
    """
    if not rows:
        return 0

    # ── Node upsert ───────────────────────────────────────────────────────
    node_cypher = """
    UNWIND $batch AS r
    MERGE (i:Invoice {invoice_id: r.invoice_id, user_id: r.user_id})
    SET i += {
        invoice_no:           r.invoice_no,
        invoice_number:       r.invoice_number,
        invoice_date:         r.invoice_date,
        seller_gstin:         r.seller_gstin,
        supplier_gstin:       r.supplier_gstin,
        buyer_gstin:          r.buyer_gstin,
        taxable_value:        r.taxable_value,
        gst_amount:           r.gst_amount,
        gst_rate:             r.gst_rate,
        gstr1_taxable_value:  r.gstr1_taxable_value,
        pr_taxable_value:     r.pr_taxable_value,
        cgst:                 r.cgst,
        sgst:                 r.sgst,
        igst:                 r.igst,
        total_value:          r.total_value,
        irn:                  r.irn,
        source_type:          r.source_type,
        confidence_score:     r.confidence_score,
        anomaly_type:         r.anomaly_type
    }
    """

    # ── Relationships: ISSUED_BY, RECEIVED_BY ────────────────────────────
    rel_tp_cypher = """
    UNWIND $batch AS r
    MATCH (i:Invoice  {invoice_id: r.invoice_id, user_id: r.user_id})
    MATCH (s:Taxpayer {gstin: r.seller_gstin, user_id: r.user_id})
    MATCH (b:Taxpayer {gstin: r.buyer_gstin,  user_id: r.user_id})
    MERGE (i)-[:ISSUED_BY]->(s)
    MERGE (i)-[:RECEIVED_BY]->(b)
    """

    # ── Relationship: REPORTED_IN (Invoice → GSTR1) ──────────────────────
    rel_g1_cypher = """
    UNWIND $batch AS r
    WITH r WHERE r.gstr1_return_id IS NOT NULL
    MATCH (i:Invoice {invoice_id:  r.invoice_id,        user_id: r.user_id})
    MATCH (g:GSTR1   {return_id:   r.gstr1_return_id,   user_id: r.user_id})
    MERGE (i)-[:REPORTED_IN]->(g)
    """

    # ── Relationship: REFLECTED_IN (Invoice → GSTR2B) ────────────────────
    rel_g2b_cypher = """
    UNWIND $batch AS r
    WITH r WHERE r.gstr2b_return_id IS NOT NULL
    MATCH (i:Invoice {invoice_id:   r.invoice_id,        user_id: r.user_id})
    MATCH (g:GSTR2B  {return_id:    r.gstr2b_return_id, user_id: r.user_id})
    MERGE (i)-[:REFLECTED_IN]->(g)
    """

    # ── Relationship: AMENDS (Invoice → Invoice) ─────────────────────────
    rel_amends_cypher = """
    UNWIND $batch AS r
    WITH r WHERE r.amends_invoice_id IS NOT NULL
    MATCH (new_inv:Invoice  {invoice_id: r.invoice_id,        user_id: r.user_id})
    MATCH (old_inv:Invoice  {invoice_id: r.amends_invoice_id, user_id: r.user_id})
    MERGE (new_inv)-[:AMENDS]->(old_inv)
    """

    batch = [
        {
            "invoice_id":           r.invoice_id,
            "user_id":              user_id,
            "invoice_no":           r.invoice_no,
            "invoice_number":       r.invoice_number or r.invoice_no,
            "invoice_date":         r.invoice_date,
            "seller_gstin":         r.seller_gstin or r.supplier_gstin,
            "supplier_gstin":       r.supplier_gstin or r.seller_gstin,
            "buyer_gstin":          r.buyer_gstin,
            "taxable_value":        r.taxable_value or r.gstr1_taxable_value,
            "gst_amount":           r.gst_amount,
            "gst_rate":             r.gst_rate,
            "gstr1_taxable_value":  r.gstr1_taxable_value,
            "pr_taxable_value":     r.pr_taxable_value,
            "cgst":                 r.cgst,
            "sgst":                 r.sgst,
            "igst":                 r.igst,
            "total_value":          r.total_value,
            "irn":                  r.irn,
            "source_type":          r.source_type.value if r.source_type else None,
            "confidence_score":     r.confidence_score,
            "anomaly_type":         r.anomaly_type.value if r.anomaly_type else None,
            "gstr1_return_id":      r.gstr1_return_id,
            "gstr2b_return_id":     r.gstr2b_return_id,
            "amends_invoice_id":    r.amends_invoice_id,
        }
        for r in rows
    ]

    run_write_query(node_cypher,      {"batch": batch})
    run_write_query(rel_tp_cypher,    {"batch": batch})
    run_write_query(rel_g1_cypher,    {"batch": batch})
    run_write_query(rel_g2b_cypher,   {"batch": batch})
    run_write_query(rel_amends_cypher,{"batch": batch})

    logger.info("Upserted %d Invoice nodes + relationships", len(rows))
    return len(rows)


# =============================================================================
# GSTR-1
# =============================================================================

def upsert_gstr1_batch(rows: list[GSTR1IngestionRow], user_id: str = "") -> int:
    """Bulk upsert GSTR1 nodes and FILED_BY → Taxpayer relationship."""
    if not rows:
        return 0

    node_cypher = """
    UNWIND $batch AS r
    MERGE (g:GSTR1 {return_id: r.return_id, user_id: r.user_id})
    SET g += {
        gstin:             r.gstin,
        period:            r.period,
        filing_date:       r.filing_date,
        status:            r.status,
        total_outward_tax: r.total_outward_tax
    }
    """

    rel_cypher = """
    UNWIND $batch AS r
    MATCH (g:GSTR1    {return_id: r.return_id, user_id: r.user_id})
    MATCH (t:Taxpayer {gstin:     r.gstin,     user_id: r.user_id})
    MERGE (g)-[:FILED_BY]->(t)
    """

    batch = [
        {
            "return_id":         r.return_id,
            "user_id":           user_id,
            "gstin":             r.gstin,
            "period":            r.period,
            "filing_date":       r.filing_date,
            "status":            r.status.value if r.status else None,
            "total_outward_tax": r.total_outward_tax,
        }
        for r in rows
    ]

    run_write_query(node_cypher, {"batch": batch})
    run_write_query(rel_cypher,  {"batch": batch})
    logger.info("Upserted %d GSTR1 nodes + FILED_BY relationships", len(rows))
    return len(rows)


# =============================================================================
# GSTR-2B
# =============================================================================

def upsert_gstr2b_batch(rows: list[GSTR2BIngestionRow], user_id: str = "") -> int:
    """Bulk upsert GSTR2B nodes and FILED_BY → Taxpayer relationship."""
    if not rows:
        return 0

    node_cypher = """
    UNWIND $batch AS r
    MERGE (g:GSTR2B {return_id: r.return_id, user_id: r.user_id})
    SET g += {
        gstin:               r.gstin,
        period:              r.period,
        generated_date:      r.generated_date,
        total_itc_available: r.total_itc_available
    }
    """

    rel_cypher = """
    UNWIND $batch AS r
    MATCH (g:GSTR2B   {return_id: r.return_id, user_id: r.user_id})
    MATCH (t:Taxpayer {gstin:     r.gstin,     user_id: r.user_id})
    MERGE (g)-[:FILED_BY]->(t)
    """

    batch = [
        {
            "return_id":           r.return_id,
            "user_id":             user_id,
            "gstin":               r.gstin,
            "period":              r.period,
            "generated_date":      r.generated_date,
            "total_itc_available": r.total_itc_available,
        }
        for r in rows
    ]

    run_write_query(node_cypher, {"batch": batch})
    run_write_query(rel_cypher,  {"batch": batch})
    logger.info("Upserted %d GSTR2B nodes + FILED_BY relationships", len(rows))
    return len(rows)


# =============================================================================
# GSTR-3B
# =============================================================================

def upsert_gstr3b_batch(rows: list[GSTR3BIngestionRow], user_id: str = "") -> int:
    """Bulk upsert GSTR3B nodes and FILED_BY → Taxpayer relationship."""
    if not rows:
        return 0

    node_cypher = """
    UNWIND $batch AS r
    MERGE (g:GSTR3B {return_id: r.return_id, user_id: r.user_id})
    SET g += {
        gstin:       r.gstin,
        period:      r.period,
        filing_date: r.filing_date,
        output_tax:  toFloat(r.output_tax),
        itc_claimed: toFloat(r.itc_claimed),
        tax_paid:    toFloat(r.tax_paid)
    }
    """

    rel_cypher = """
    UNWIND $batch AS r
    MATCH (g:GSTR3B   {return_id: r.return_id, user_id: r.user_id})
    MATCH (t:Taxpayer {gstin:     r.gstin,     user_id: r.user_id})
    MERGE (g)-[:FILED_BY]->(t)
    """

    batch = [
        {
            "return_id":   r.return_id,
            "user_id":     user_id,
            "gstin":       r.gstin,
            "period":      r.period,
            "filing_date": r.filing_date,
            "output_tax":  r.output_tax,
            "itc_claimed": r.itc_claimed,
            "tax_paid":    r.tax_paid,
        }
        for r in rows
    ]

    run_write_query(node_cypher, {"batch": batch})
    run_write_query(rel_cypher,  {"batch": batch})
    logger.info("Upserted %d GSTR3B nodes + FILED_BY relationships", len(rows))
    return len(rows)


# =============================================================================
# TaxPayment
# =============================================================================

def upsert_tax_payments_batch(rows: list[TaxPaymentIngestionRow], user_id: str = "") -> int:
    """
    Bulk upsert TaxPayment nodes and:
      (Invoice)-[:PAID_VIA]->(TaxPayment)
      (TaxPayment)-[:SETTLED_IN]->(GSTR3B)
    """
    if not rows:
        return 0

    node_cypher = """
    UNWIND $batch AS r
    MERGE (p:TaxPayment {payment_id: r.payment_id, user_id: r.user_id})
    SET p += {
        amount:       toFloat(r.amount),
        amount_paid:  toFloat(r.amount),
        payment_date: r.payment_date,
        mode:         r.mode,
        payment_mode: r.mode,
        gstin:        r.gstin,
        period:       r.period
    }
    """

    # PAID_VIA: Invoice → TaxPayment
    rel_inv_cypher = """
    UNWIND $batch AS r
    WITH r WHERE r.invoice_id IS NOT NULL
    MATCH (p:TaxPayment {payment_id: r.payment_id, user_id: r.user_id})
    MATCH (i:Invoice    {invoice_id: r.invoice_id, user_id: r.user_id})
    MERGE (i)-[:PAID_VIA]->(p)
    """

    # SETTLED_IN: TaxPayment → GSTR3B
    rel_g3b_cypher = """
    UNWIND $batch AS r
    WITH r WHERE r.gstr3b_return_id IS NOT NULL
    MATCH (p:TaxPayment {payment_id: r.payment_id, user_id: r.user_id})
    MATCH (g:GSTR3B     {return_id:  r.gstr3b_return_id, user_id: r.user_id})
    MERGE (p)-[:SETTLED_IN]->(g)
    """

    batch = [
        {
            "payment_id":       r.payment_id,
            "user_id":          user_id,
            "amount":           r.amount,
            "payment_date":     r.payment_date,
            "mode":             r.payment_mode.value if r.payment_mode else (r.mode or "OTHER"),
            "gstin":            r.gstin,
            "period":           r.period,
            "invoice_id":       r.invoice_id,
            "gstr3b_return_id": r.gstr3b_return_id,
        }
        for r in rows
    ]

    run_write_query(node_cypher,    {"batch": batch})
    run_write_query(rel_inv_cypher, {"batch": batch})
    run_write_query(rel_g3b_cypher, {"batch": batch})
    logger.info("Upserted %d TaxPayment nodes + relationships", len(rows))
    return len(rows)


# =============================================================================
# Convenience: write-back (used by reconciliation engine + ML scorer)
# =============================================================================

def write_invoice_reconciliation_result(
    invoice_id: str,
    status: str,
    risk_level: str,
    explanation: str,
    user_id: str = "",
) -> None:
    """Write reconciliation results back onto an existing Invoice node."""
    run_write_query(
        """
        MATCH (i:Invoice {invoice_id: $invoice_id, user_id: $user_id})
        SET i.status      = $status,
            i.risk_level  = $risk_level,
            i.explanation = $explanation
        """,
        {
            "invoice_id":  invoice_id,
            "user_id":     user_id,
            "status":      status,
            "risk_level":  risk_level,
            "explanation": explanation,
        },
    )


def write_taxpayer_scores(
    gstin: str,
    risk_score: float,
    risk_level: str,
    user_id: str = "",
) -> None:
    """Write ML-derived compliance score back onto a Taxpayer node."""
    run_write_query(
        """
        MATCH (t:Taxpayer {gstin: $gstin, user_id: $user_id})
        SET t.risk_score = $risk_score,
            t.risk_level = $risk_level
        """,
        {
            "gstin":      gstin,
            "user_id":    user_id,
            "risk_score": risk_score,
            "risk_level": risk_level,
        },
    )


def write_taxpayer_scores_batch(updates: list[dict[str, Any]], user_id: str = "") -> None:
    """
    Bulk write ML scores to Taxpayer nodes.

    Parameters
    ----------
    updates : list of {gstin, risk_score, risk_level}
    user_id : filter so only this user's Taxpayer nodes are updated
    """
    if not updates:
        return
    # Inject user_id into every update dict so the Cypher filter works
    enriched = [{**u, "user_id": user_id} for u in updates]
    run_write_query(
        """
        UNWIND $batch AS r
        MATCH (t:Taxpayer {gstin: r.gstin, user_id: r.user_id})
        SET t.risk_score = r.risk_score,
            t.risk_level = r.risk_level
        """,
        {"batch": enriched},
    )
