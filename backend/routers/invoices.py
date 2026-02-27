"""
routers/invoices.py — Invoice list and detail endpoints.

GET /invoices/           → paginated list  (PaginatedInvoices)
GET /invoices/{id}       → full detail     (InvoiceDetail)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, status

from database.neo4j_client import run_query
from models.schemas import (
    GSTR1Response,
    GSTR2BResponse,
    GSTR3BResponse,
    InvoiceDetail,
    InvoiceListItem,
    InvoiceResponse,
    InvoiceStatus,
    PaginatedInvoices,
    PathHop,
    RiskLevel,
    TaxPaymentResponse,
    ValueComparison,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _str(v) -> str:
    return str(v) if v is not None else ""


def _float(v, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# GET /invoices/
# ---------------------------------------------------------------------------

_LIST_QUERY = """
MATCH (i:Invoice)
OPTIONAL MATCH (i)-[:ISSUED_BY]->(t:Taxpayer)
WITH i, t.gstin AS seller
ORDER BY i.invoice_date DESC, i.invoice_id ASC
SKIP $skip
LIMIT $limit
RETURN
    i.invoice_id   AS invoice_id,
    i.invoice_no   AS invoice_no,
    i.invoice_date AS invoice_date,
    i.seller_gstin AS seller_gstin,
    i.buyer_gstin  AS buyer_gstin,
    i.total_value  AS total_value,
    i.status       AS status,
    i.risk_level   AS risk_level,
    i.explanation  AS explanation
"""

_COUNT_QUERY = "MATCH (i:Invoice) RETURN count(i) AS total"

_FILTER_QUERY = """
MATCH (i:Invoice)
WHERE ($gstin IS NULL OR i.seller_gstin = $gstin OR i.buyer_gstin = $gstin)
  AND ($status IS NULL OR i.status = $status)
WITH i
ORDER BY i.invoice_date DESC, i.invoice_id ASC
SKIP $skip
LIMIT $limit
RETURN
    i.invoice_id   AS invoice_id,
    i.invoice_no   AS invoice_no,
    i.invoice_date AS invoice_date,
    i.seller_gstin AS seller_gstin,
    i.buyer_gstin  AS buyer_gstin,
    i.total_value  AS total_value,
    i.status       AS status,
    i.risk_level   AS risk_level,
    i.explanation  AS explanation
"""

_FILTER_COUNT_QUERY = """
MATCH (i:Invoice)
WHERE ($gstin IS NULL OR i.seller_gstin = $gstin OR i.buyer_gstin = $gstin)
  AND ($status IS NULL OR i.status = $status)
RETURN count(i) AS total
"""


def _to_list_item(r: dict) -> InvoiceListItem:
    raw_status = r.get("status")
    raw_rl     = r.get("risk_level")
    try:
        inv_status = InvoiceStatus(raw_status) if raw_status else InvoiceStatus.PENDING
    except ValueError:
        inv_status = InvoiceStatus.PENDING
    try:
        risk_lvl = RiskLevel(raw_rl) if raw_rl else None
    except ValueError:
        risk_lvl = None

    return InvoiceListItem(
        invoice_id     = _str(r.get("invoice_id")),
        invoice_number = _str(r.get("invoice_no") or r.get("invoice_number")),
        invoice_date   = _str(r.get("invoice_date")),
        supplier_gstin = _str(r.get("seller_gstin") or r.get("supplier_gstin")),
        buyer_gstin    = _str(r.get("buyer_gstin")),
        total_value    = _float(r.get("total_value")),
        status         = inv_status,
        risk_level     = risk_lvl,
        explanation    = r.get("explanation"),
    )


@router.get(
    "/",
    summary="List Invoices",
    response_model=PaginatedInvoices,
)
def list_invoices(
    page:   int       = Query(1,    ge=1),
    per_page: int     = Query(50,   ge=1, le=500),
    gstin:  str | None = Query(None, description="Filter by seller or buyer GSTIN"),
    status: str | None = Query(None, description="Filter by status (Valid/Warning/High-Risk/Pending)"),
) -> PaginatedInvoices:
    """Return paginated invoices, optionally filtered by GSTIN or status."""
    skip = (page - 1) * per_page

    try:
        if gstin or status:
            rows  = run_query(_FILTER_QUERY,
                              {"skip": skip, "limit": per_page,
                               "gstin": gstin, "status": status})
            total = (run_query(_FILTER_COUNT_QUERY,
                               {"gstin": gstin, "status": status}) or [{}])[0].get("total", 0)
        else:
            rows  = run_query(_LIST_QUERY, {"skip": skip, "limit": per_page})
            total = (run_query(_COUNT_QUERY) or [{}])[0].get("total", 0)
    except Exception as exc:
        logger.error("Invoice list query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database query failed")

    return PaginatedInvoices(
        total    = int(total),
        page     = page,
        per_page = per_page,
        items    = [_to_list_item(r) for r in rows],
    )


# ---------------------------------------------------------------------------
# GET /invoices/{invoice_id}
# ---------------------------------------------------------------------------

_DETAIL_QUERY = """
MATCH (i:Invoice {invoice_id: $invoice_id})
OPTIONAL MATCH (i)-[:ISSUED_BY]->(t:Taxpayer)
OPTIONAL MATCH (i)-[:REPORTED_IN]->(g1:GSTR1)
OPTIONAL MATCH (i)-[:VISIBLE_IN]->(g2b:GSTR2B)
OPTIONAL MATCH (i)-[:DECLARED_IN]->(g3b:GSTR3B)
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
OPTIONAL MATCH (i)-[:AMENDS]->(prev:Invoice)
OPTIONAL MATCH (next:Invoice)-[:AMENDS]->(i)
RETURN
    i                      AS inv,
    g1                     AS gstr1,
    g2b                    AS gstr2b,
    g3b                    AS gstr3b,
    collect(DISTINCT p)    AS payments,
    prev.invoice_id        AS amends,
    next.invoice_id        AS amended_by
LIMIT 1
"""


def _build_invoice_response(inv: dict) -> InvoiceResponse:
    raw_status = inv.get("status")
    try:
        inv_status = InvoiceStatus(raw_status) if raw_status else InvoiceStatus.PENDING
    except ValueError:
        inv_status = InvoiceStatus.PENDING
    raw_rl = inv.get("risk_level")
    try:
        risk_lvl = RiskLevel(raw_rl) if raw_rl else None
    except ValueError:
        risk_lvl = None

    return InvoiceResponse(
        invoice_id      = _str(inv.get("invoice_id")),
        invoice_number  = _str(inv.get("invoice_no") or inv.get("invoice_number")),
        invoice_date    = _str(inv.get("invoice_date")),
        supplier_gstin  = _str(inv.get("seller_gstin") or inv.get("supplier_gstin")),
        buyer_gstin     = _str(inv.get("buyer_gstin")),
        taxable_value   = _float(inv.get("taxable_value")),
        total_value     = _float(inv.get("total_value")),
        status          = inv_status,
        risk_level      = risk_lvl,
        explanation     = inv.get("explanation"),
    )


def _build_gstr1(g1) -> GSTR1Response | None:
    if not g1:
        return None
    d = dict(g1)
    return GSTR1Response(
        return_id   = _str(d.get("return_id")),
        gstin       = _str(d.get("gstin")),
        tax_period  = _str(d.get("period") or d.get("tax_period")),
        filing_date = _str(d.get("filing_date")),
    )


def _build_gstr2b(g2b) -> GSTR2BResponse | None:
    if not g2b:
        return None
    d = dict(g2b)
    return GSTR2BResponse(
        return_id       = _str(d.get("return_id")),
        gstin           = _str(d.get("gstin")),
        tax_period      = _str(d.get("period") or d.get("tax_period")),
        generation_date = _str(d.get("generated_date") or d.get("generation_date")),
    )


def _build_gstr3b(g3b) -> GSTR3BResponse | None:
    if not g3b:
        return None
    d = dict(g3b)
    return GSTR3BResponse(
        return_id   = _str(d.get("return_id")),
        gstin       = _str(d.get("gstin")),
        tax_period  = _str(d.get("period") or d.get("tax_period")),
        filing_date = _str(d.get("filing_date")),
        tax_payable = _float(d.get("output_tax") or d.get("tax_payable")),
        tax_paid    = _float(d.get("tax_paid")),
    )


def _build_payment(p) -> TaxPaymentResponse | None:
    if not p:
        return None
    d = dict(p)
    return TaxPaymentResponse(
        payment_id   = _str(d.get("payment_id")),
        amount_paid  = _float(d.get("amount") or d.get("amount_paid")),
        payment_date = _str(d.get("payment_date")),
        payment_mode = d.get("mode") or d.get("payment_mode"),
    )


@router.get(
    "/{invoice_id}",
    summary="Invoice Detail",
    response_model=InvoiceDetail,
)
def invoice_detail(invoice_id: str) -> InvoiceDetail:
    """Return full detail for a single invoice including path hops and related data."""
    try:
        rows = run_query(_DETAIL_QUERY, {"invoice_id": invoice_id})
    except Exception as exc:
        logger.error("Invoice detail query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database query failed")

    if not rows:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")

    row = rows[0]
    inv = dict(row["inv"])
    g1  = row.get("gstr1")
    g2b = row.get("gstr2b")
    g3b = row.get("gstr3b")
    payments_raw = row.get("payments") or []

    # ── Value comparison ──────────────────────────────────────────────────
    gstr1_val = _float(dict(g1).get("total_outward_tax")) if g1 else None
    tax_val   = _float(inv.get("taxable_value")) if inv.get("taxable_value") else None
    diff      = (tax_val - gstr1_val) if (tax_val is not None and gstr1_val) else None

    vc = ValueComparison(
        gstr1_taxable_value  = gstr1_val,
        authoritative_value  = tax_val,
        difference           = round(diff, 2) if diff is not None else None,
        difference_pct       = round(diff / gstr1_val * 100, 2)
                               if (diff is not None and gstr1_val) else None,
        within_tolerance     = (abs(diff / gstr1_val) <= 0.02)
                               if (diff is not None and gstr1_val) else None,
    )

    # ── Path hops ─────────────────────────────────────────────────────────
    path_hops = [
        PathHop(hop="Taxpayer → Invoice",  present=True),
        PathHop(hop="Invoice → GSTR-1",    present=g1   is not None),
        PathHop(hop="Invoice → GSTR-2B",   present=g2b  is not None),
        PathHop(hop="Invoice → GSTR-3B",   present=g3b  is not None),
        PathHop(hop="Invoice → Payment",   present=bool(payments_raw)),
    ]

    payments = [r for r in (_build_payment(p) for p in payments_raw) if r]

    return InvoiceDetail(
        invoice          = _build_invoice_response(inv),
        value_comparison = vc,
        path_hops        = path_hops,
        payments         = payments,
        gstr1            = _build_gstr1(g1),
        gstr2b           = _build_gstr2b(g2b),
        gstr3b           = _build_gstr3b(g3b),
        amends           = row.get("amends"),
        amended_by       = row.get("amended_by"),
    )
