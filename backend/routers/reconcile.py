"""
Reconciliation router — triggers GST reconciliation and returns summary stats.

Endpoints
---------
POST /reconcile/run          — run batch reconciliation (optional filters)
POST /reconcile/invoice/{id} — reconcile a single invoice on-demand
GET  /reconcile/stats        — read current status counts from the graph
     (no re-processing; just aggregates existing i.status values)
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from database.neo4j_client import run_query
from models.schemas import CurrentUser, InvoiceStatus, ReconciliationSummary
from routers.auth import require_jwt
from services.reconciliation import engine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Reconciliation"])

_AuthDep = Annotated[CurrentUser, Depends(require_jwt)]

# ---------------------------------------------------------------------------
# POST /reconcile/run
# ---------------------------------------------------------------------------


@router.post(
    "/run",
    response_model=ReconciliationSummary,
    summary="Run batch reconciliation",
    description=(
        "Reconciles all matching invoices in the graph. "
        "Optionally filter by `gstin` (supplier or buyer) and/or `tax_period` "
        "(format `MMYYYY`, e.g. `042024`). "
        "Use `limit` to cap the number of invoices processed."
    ),
)
def reconcile_run(
    current_user: _AuthDep,
    gstin:      Annotated[Optional[str], Query(description="Taxpayer GSTIN to filter by")] = None,
    tax_period: Annotated[Optional[str], Query(description="Tax period (MMYYYY)")] = None,
    limit:      Annotated[Optional[int], Query(ge=1, le=50_000, description="Max invoices to process")] = None,
) -> ReconciliationSummary:
    try:
        summary = engine.reconcile_all(
            gstin=gstin,
            tax_period=tax_period,
            limit=limit,
            user_id=current_user.user_id,
        )
    except Exception as exc:
        logger.exception("Reconciliation run failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Reconciliation failed: {exc}",
        ) from exc
    return summary


# ---------------------------------------------------------------------------
# POST /reconcile/invoice/{invoice_id}
# ---------------------------------------------------------------------------


@router.post(
    "/invoice/{invoice_id}",
    response_model=ReconciliationSummary,
    summary="Reconcile a single invoice",
    description="Runs all reconciliation checks for one invoice and writes results back to the graph.",
)
def reconcile_single(
    invoice_id: str,
    current_user: _AuthDep,
) -> ReconciliationSummary:
    from datetime import datetime, timezone

    try:
        result = engine.reconcile_invoice(invoice_id, user_id=current_user.user_id)
    except Exception as exc:
        logger.exception("Single-invoice reconciliation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Reconciliation failed: {exc}",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice '{invoice_id}' not found in the graph.",
        )

    return ReconciliationSummary(
        total=1,
        valid=1     if result.status == InvoiceStatus.VALID     else 0,
        warning=1   if result.status == InvoiceStatus.WARNING   else 0,
        high_risk=1 if result.status == InvoiceStatus.HIGH_RISK else 0,
        pending=1   if result.status == InvoiceStatus.PENDING   else 0,
        duration_ms=None,
        run_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# GET /reconcile/stats
# ---------------------------------------------------------------------------

_STATS_QUERY = """
MATCH (i:Invoice {user_id: $uid})
WHERE i.status IS NOT NULL
RETURN i.status AS status, count(i) AS cnt
UNION ALL
MATCH (i:Invoice {user_id: $uid})
WHERE i.status IS NULL
RETURN 'pending' AS status, count(i) AS cnt
"""

_TOTAL_QUERY = "MATCH (i:Invoice {user_id: $uid}) RETURN count(i) AS total"


@router.get(
    "/stats",
    response_model=ReconciliationSummary,
    summary="Current reconciliation status counts",
    description=(
        "Returns a summary of how many invoices have each status in the graph. "
        "Does NOT re-run reconciliation logic."
    ),
)
def reconcile_stats(current_user: _AuthDep) -> ReconciliationSummary:
    uid = current_user.user_id
    try:
        rows  = run_query(_STATS_QUERY, {"uid": uid})
        total = run_query(_TOTAL_QUERY, {"uid": uid})
    except Exception as exc:
        # Neo4j not running — return zero counts so the dashboard still loads
        logger.warning("Stats query failed (Neo4j unreachable?): %s", exc)
        return ReconciliationSummary(
            total=0,
            valid=0,
            warning=0,
            high_risk=0,
            pending=0,
            duration_ms=None,
            run_at=None,
        )

    counts: dict[str, int] = {
        InvoiceStatus.VALID.value:     0,
        InvoiceStatus.WARNING.value:   0,
        InvoiceStatus.HIGH_RISK.value: 0,
        InvoiceStatus.PENDING.value:   0,
    }
    for row in rows:
        s = str(row.get("status") or "").lower()
        # Normalise — graph stores e.g. "High-Risk" or "Valid"
        for key in counts:
            if s == key.lower():
                counts[key] += int(row.get("cnt") or 0)
                break

    total_count = int(total[0]["total"]) if total else 0

    return ReconciliationSummary(
        total=total_count,
        valid=counts[InvoiceStatus.VALID.value],
        warning=counts[InvoiceStatus.WARNING.value],
        high_risk=counts[InvoiceStatus.HIGH_RISK.value],
        pending=counts[InvoiceStatus.PENDING.value],
        duration_ms=None,
        run_at=None,
    )
