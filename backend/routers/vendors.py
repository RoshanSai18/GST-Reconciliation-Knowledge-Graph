"""
routers/vendors.py — Vendor scoring & profile endpoints.

Endpoints
---------
  POST /vendors/train         Train ML models (auth required)
  POST /vendors/score         Score all vendors and persist (auth required)
  POST /vendors/{gstin}/score Score a single vendor (auth required)
  GET  /vendors/              Paginated vendor list (public)
  GET  /vendors/{gstin}       Full vendor profile   (public)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import config
from database.neo4j_client import run_query
from models.schemas import (
    FilingRecord,
    InvoiceListItem,
    InvoiceStatus,
    RiskLevel,
    ScoreBreakdown,
    TaxpayerResponse,
    VendorListItem,
    VendorProfile,
)

logger  = logging.getLogger(__name__)
router  = APIRouter()
_bearer = HTTPBearer()


# ---------------------------------------------------------------------------
# Auth guard (temporary — replaced in Phase 10)
# ---------------------------------------------------------------------------

def _require_auth(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> None:
    if creds.credentials != config.JWT_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ---------------------------------------------------------------------------
# POST /vendors/train
# ---------------------------------------------------------------------------

@router.post(
    "/train",
    summary="Train ML Models",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(_require_auth)],
)
def train_models() -> dict:
    """Train IsolationForest + RandomForest on the current graph data."""
    from services.ml.trainer import train_all

    result = train_all()
    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result.get("message", "Training failed"),
        )
    return result


# ---------------------------------------------------------------------------
# POST /vendors/score
# ---------------------------------------------------------------------------

@router.post(
    "/score",
    summary="Score All Vendors",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(_require_auth)],
)
def score_all() -> dict:
    """Compute compliance scores for ALL vendors and persist to Neo4j."""
    from services.ml.scorer import score_all_vendors

    result = score_all_vendors()
    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result.get("message", "Scoring failed"),
        )
    return result


# ---------------------------------------------------------------------------
# POST /vendors/{gstin}/score
# ---------------------------------------------------------------------------

@router.post(
    "/{gstin}/score",
    summary="Score Single Vendor",
    dependencies=[Depends(_require_auth)],
)
def score_one(gstin: str) -> dict:
    """Compute and persist compliance score for a single GSTIN."""
    from services.ml.scorer import score_vendor

    try:
        result = score_vendor(gstin.upper())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return result


# ---------------------------------------------------------------------------
# GET /vendors/   — paginated list
# ---------------------------------------------------------------------------

_VENDOR_LIST_QUERY = """
MATCH (t:Taxpayer)
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
WITH t,
     count(i)                                              AS total_inv,
     count(CASE WHEN i.risk_level = 'High' THEN 1 END)    AS high_risk_cnt
WITH t, total_inv, high_risk_cnt
ORDER BY t.risk_score ASC, t.gstin ASC
SKIP $skip
LIMIT $limit
RETURN
    t.gstin                                   AS gstin,
    substring(t.gstin, 0, 2)                  AS state_code,
    coalesce(t.status, 'Active')              AS registration_status,
    coalesce(t.risk_score, 50.0)              AS compliance_score,
    coalesce(t.risk_level, 'Medium')          AS risk_level,
    total_inv,
    high_risk_cnt
"""

_VENDOR_COUNT_QUERY = "MATCH (t:Taxpayer) RETURN count(t) AS total"


@router.get(
    "/",
    summary="List Vendors",
    response_model=dict,
)
def list_vendors(
    page:  int = Query(1,   ge=1, description="Page number (1-based)"),
    limit: int = Query(20, ge=1, le=200, description="Results per page"),
) -> dict:
    """Return a paginated list of vendors with their compliance summary."""
    skip = (page - 1) * limit

    try:
        rows  = run_query(_VENDOR_LIST_QUERY, {"skip": skip, "limit": limit})
        total = (run_query(_VENDOR_COUNT_QUERY) or [{}])[0].get("total", 0)
    except Exception as exc:
        logger.error("Vendor list query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database query failed")

    items = [
        VendorListItem(
            gstin               = r["gstin"],
            state_code          = r.get("state_code") or "??",
            registration_status = r.get("registration_status") or "Active",
            compliance_score    = float(r.get("compliance_score") or 50.0),
            risk_level          = r.get("risk_level") or "Medium",
            total_invoices      = int(r.get("total_inv") or 0),
            high_risk_count     = int(r.get("high_risk_cnt") or 0),
        )
        for r in rows
    ]

    return {
        "page":       page,
        "limit":      limit,
        "total":      total,
        "pages":      (total + limit - 1) // max(limit, 1),
        "items":      [i.model_dump() for i in items],
    }


# ---------------------------------------------------------------------------
# GET /vendors/{gstin}  — full profile
# ---------------------------------------------------------------------------

_TAXPAYER_QUERY = """
MATCH (t:Taxpayer {gstin: $gstin})
RETURN t
"""

_FILING_QUERY = """
MATCH (g1:GSTR1)-[:FILED_BY]->(t:Taxpayer {gstin: $gstin})
OPTIONAL MATCH (g3:GSTR3B {period: g1.period})-[:FILED_BY]->(t)
OPTIONAL MATCH (p:TaxPayment {period: g1.period})-[:PAID_BY]->(t)
WITH g1.period AS period,
     g1.filing_date IS NOT NULL  AS gstr1_filed,
     g3.filing_date IS NOT NULL  AS gstr3b_filed,
     CASE
         WHEN p.payment_date IS NOT NULL AND g3.filing_date IS NOT NULL
         THEN duration.between(date(g3.filing_date), date(p.payment_date)).days
         ELSE 0
     END AS payment_delay_days
RETURN period, gstr1_filed, gstr3b_filed, payment_delay_days
ORDER BY period DESC
LIMIT 12
"""

_INVOICE_LIST_QUERY = """
MATCH (i:Invoice)-[:ISSUED_BY]->(t:Taxpayer {gstin: $gstin})
RETURN
    i.invoice_id   AS invoice_id,
    i.invoice_no   AS invoice_no,
    i.invoice_date AS invoice_date,
    i.buyer_gstin  AS buyer_gstin,
    i.gst_amount   AS gst_amount,
    i.total_value  AS total_value,
    i.status       AS status
ORDER BY i.invoice_date DESC
LIMIT 50
"""

_PATTERN_QUERY = """
OPTIONAL MATCH (t:Taxpayer {gstin: $gstin})
OPTIONAL MATCH (t)-[:SUSPICIOUS_CYCLE]->(c)
OPTIONAL MATCH (t)-[:CHRONIC_DELAY]->(d)
OPTIONAL MATCH (t)-[:AMENDMENT_CHAIN]->(a)
RETURN
    count(DISTINCT c) AS circular_count,
    count(DISTINCT d) AS delay_count,
    count(DISTINCT a) AS amendment_count
"""

_SCORE_BREAKDOWN_QUERY = """
MATCH (t:Taxpayer {gstin: $gstin})
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
WITH t,
     count(i)                                                      AS n,
     count(CASE WHEN i.status = 'High-Risk'         THEN 1 END)   AS hr,
     count(CASE WHEN i.status = 'Warning'           THEN 1 END)   AS wn,
     count(CASE WHEN (i)-[:AMENDS]->()              THEN 1 END)   AS am,
     count(CASE WHEN i.anomaly_type='VALUE_MISMATCH' THEN 1 END)  AS vm
OPTIONAL MATCH (i2:Invoice)-[:ISSUED_BY]->(t)
OPTIONAL MATCH (i2)-[:PAID_VIA]->(p)
WITH t, n, hr, wn, am, vm,
     avg(CASE
         WHEN p IS NOT NULL AND i2.invoice_date IS NOT NULL AND p.payment_date IS NOT NULL
         THEN duration.between(date(i2.invoice_date), date(p.payment_date)).days
         ELSE null
     END) AS avg_delay
RETURN
    coalesce(t.risk_score, 50.0)    AS compliance_score,
    coalesce(t.risk_level, 'Medium') AS risk_level,
    n, hr, wn, am, vm,
    coalesce(avg_delay, 0.0)        AS avg_delay
"""


@router.get(
    "/{gstin}",
    summary="Vendor Profile",
    response_model=VendorProfile,
)
def vendor_profile(gstin: str) -> VendorProfile:
    """Return the full compliance profile for a single GSTIN."""
    gstin = gstin.upper()

    # ── Taxpayer node ─────────────────────────────────────────────────────
    try:
        tp_rows = run_query(_TAXPAYER_QUERY, {"gstin": gstin})
    except Exception as exc:
        logger.error("Taxpayer query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")

    if not tp_rows:
        raise HTTPException(status_code=404, detail=f"GSTIN {gstin} not found")

    t = tp_rows[0]["t"]

    # ── Score breakdown ───────────────────────────────────────────────────
    try:
        sb_rows = run_query(_SCORE_BREAKDOWN_QUERY, {"gstin": gstin})
    except Exception:
        sb_rows = []

    sb_row = sb_rows[0] if sb_rows else {}
    n      = int(sb_row.get("n") or 1)
    safe   = max(n, 1)

    score_breakdown = ScoreBreakdown(
        filing_consistency  = round(1.0 - float((sb_row.get("hr") or 0) / safe), 4),
        avg_payment_delay_days = round(float(sb_row.get("avg_delay") or 0.0), 2),
        amendment_rate      = round(float((sb_row.get("am") or 0) / safe), 4),
        value_mismatch_rate = round(float((sb_row.get("vm") or 0) / safe), 4),
        risky_partner_ratio = 0.0,           # populated by pattern engine
        circular_flag       = False,         # populated by pattern engine
    )

    # ── Filing history ────────────────────────────────────────────────────
    try:
        filing_rows = run_query(_FILING_QUERY, {"gstin": gstin})
    except Exception:
        filing_rows = []

    filing_history = [
        FilingRecord(
            tax_period          = r["period"],
            gstr1_filed         = bool(r.get("gstr1_filed")),
            gstr3b_filed        = bool(r.get("gstr3b_filed")),
            payment_delay_days  = int(r.get("payment_delay_days") or 0),
        )
        for r in filing_rows
    ]

    # ── Recent invoices ───────────────────────────────────────────────────
    try:
        inv_rows = run_query(_INVOICE_LIST_QUERY, {"gstin": gstin})
    except Exception:
        inv_rows = []

    # ── Pattern flags ─────────────────────────────────────────────────────
    try:
        pat_rows = run_query(_PATTERN_QUERY, {"gstin": gstin})
    except Exception:
        pat_rows = []

    pat_flags: list[str] = []
    if pat_rows:
        pr = pat_rows[0]
        if (pr.get("circular_count") or 0)   > 0: pat_flags.append("CIRCULAR_TRADE")
        if (pr.get("delay_count") or 0)       > 0: pat_flags.append("CHRONIC_DELAY")
        if (pr.get("amendment_count") or 0)   > 0: pat_flags.append("AMENDMENT_CHAIN")

    # ── Build TaxpayerResponse ────────────────────────────────────────────
    tp = dict(t)
    taxpayer_obj = TaxpayerResponse(
        gstin               = tp.get("gstin", gstin),
        state_code          = tp.get("state_code") or gstin[:2],
        registration_status = tp.get("status") or tp.get("registration_status"),
        risk_score          = tp.get("risk_score"),
        risk_level          = tp.get("risk_level"),
    )

    # ── Build InvoiceListItem objects ─────────────────────────────────────
    invoice_items: list[InvoiceListItem] = []
    for r in inv_rows:
        row = dict(r) if not isinstance(r, dict) else r
        try:
            invoice_items.append(InvoiceListItem(
                invoice_id     = str(row.get("invoice_id") or ""),
                invoice_number = str(row.get("invoice_no") or row.get("invoice_number") or ""),
                invoice_date   = str(row.get("invoice_date") or ""),
                supplier_gstin = str(row.get("seller_gstin") or row.get("supplier_gstin") or gstin),
                buyer_gstin    = str(row.get("buyer_gstin") or ""),
                total_value    = float(row.get("total_value") or 0.0),
                status         = InvoiceStatus(row["status"]) if row.get("status") else InvoiceStatus.PENDING,
                risk_level     = RiskLevel(row["risk_level"]) if row.get("risk_level") else None,
                explanation    = row.get("explanation"),
            ))
        except Exception:
            continue  # skip malformed rows

    return VendorProfile(
        taxpayer            = taxpayer_obj,
        compliance_score    = float(sb_row.get("compliance_score") or 50.0),
        score_breakdown     = score_breakdown,
        filing_history      = filing_history,
        invoices            = invoice_items,
        pattern_flags       = pat_flags,
    )
