"""
Patterns router — exposes pattern detection results.

Endpoints
---------
GET  /patterns/                  — run all detectors, return PatternSummary
GET  /patterns/circular-trades   — circular trading loops only
GET  /patterns/payment-delays    — chronic payment delay vendors only
GET  /patterns/amendment-chains  — excessive amendment activity only
GET  /patterns/risk-networks     — high-risk trading network vendors only
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from models.schemas import (
    AmendmentChainResult,
    CircularTradeResult,
    PatternSummary,
    PaymentDelayResult,
    RiskNetworkResult,
)
from services.patterns import (
    amendment_chain,
    circular_trade,
    payment_delay,
    risk_network,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Pattern Detection"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe(fn, label: str):
    """Run a detector, returning [] and logging on failure."""
    try:
        return fn()
    except Exception as exc:
        logger.error("Pattern detector '%s' failed: %s", label, exc)
        return []


# ---------------------------------------------------------------------------
# GET /patterns/
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=PatternSummary,
    summary="Run all pattern detectors",
    description=(
        "Executes all four graph pattern detectors in sequence and returns a "
        "combined PatternSummary.  Detectors that fail gracefully return empty "
        "lists so partial results are always available."
    ),
)
def get_all_patterns() -> PatternSummary:
    ct  = _safe(circular_trade.detect_circular_trades,   "circular_trade")
    pd_ = _safe(payment_delay.detect_payment_delays,     "payment_delay")
    ac  = _safe(amendment_chain.detect_amendment_chains, "amendment_chain")
    rn  = _safe(risk_network.detect_risk_networks,       "risk_network")

    return PatternSummary(
        circular_trades=ct,
        payment_delays=pd_,
        amendment_chains=ac,
        risk_networks=rn,
    )


# ---------------------------------------------------------------------------
# GET /patterns/circular-trades
# ---------------------------------------------------------------------------


@router.get(
    "/circular-trades",
    response_model=list[CircularTradeResult],
    summary="Detect circular trading loops",
    description=(
        "Returns all detected circular trading loops (length-2 and length-3). "
        "Each result includes the ordered GSTIN loop and the invoice IDs involved."
    ),
)
def get_circular_trades() -> list[CircularTradeResult]:
    try:
        return circular_trade.detect_circular_trades()
    except Exception as exc:
        logger.exception("Circular trade detection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Detection failed: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# GET /patterns/payment-delays
# ---------------------------------------------------------------------------


@router.get(
    "/payment-delays",
    response_model=list[PaymentDelayResult],
    summary="Detect chronic payment delay vendors",
    description=(
        "Returns vendors whose average payment delay exceeds the configured "
        "grace period. Results are ordered by average delay descending."
    ),
)
def get_payment_delays(
    min_invoices: Annotated[
        int, Query(ge=1, description="Minimum delayed invoices to flag a vendor")
    ] = 1,
) -> list[PaymentDelayResult]:
    try:
        return payment_delay.detect_payment_delays(min_invoices=min_invoices)
    except Exception as exc:
        logger.exception("Payment delay detection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Detection failed: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# GET /patterns/amendment-chains
# ---------------------------------------------------------------------------


@router.get(
    "/amendment-chains",
    response_model=list[AmendmentChainResult],
    summary="Detect excessive invoice amendment activity",
    description=(
        "Returns vendors with amendment chain counts at or above the "
        "configured threshold (AMENDMENT_FLAG_COUNT config setting)."
    ),
)
def get_amendment_chains() -> list[AmendmentChainResult]:
    try:
        return amendment_chain.detect_amendment_chains()
    except Exception as exc:
        logger.exception("Amendment chain detection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Detection failed: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# GET /patterns/risk-networks
# ---------------------------------------------------------------------------


@router.get(
    "/risk-networks",
    response_model=list[RiskNetworkResult],
    summary="Detect high-risk trading network vendors",
    description=(
        "Returns vendors whose proportion of high-risk trading partners "
        "exceeds the configured RISKY_PARTNER_THRESHOLD. "
        "Requires the ML scorer (Phase 8) to have populated risk_level on "
        "Taxpayer nodes first; returns an empty list otherwise."
    ),
)
def get_risk_networks() -> list[RiskNetworkResult]:
    try:
        return risk_network.detect_risk_networks()
    except Exception as exc:
        logger.exception("Risk network detection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Detection failed: {exc}",
        ) from exc
