"""
value_checker.py — compares taxable values reported across GSTR-1 and Purchase Register.

Pure Python: no database calls.

Trust hierarchy (from validators.determine_authoritative_value):
  EInvoice IRN > GSTR-1 > Purchase Register (PR)

This module checks whether the two raw source values (gstr1 and pr) agree within
the configured tolerance percentage.  It also verifies that GST components
(CGST + SGST or IGST) are internally consistent with the declared taxable_value.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ValueCheckResult:
    gstr1_val:          float | None
    pr_val:             float | None
    # Absolute difference (gstr1 − pr), None when either is missing
    difference:         float | None
    # |difference| / gstr1_val × 100, None when either is missing
    deviation_pct:      float | None
    within_tolerance:   bool | None   # None = cannot assess (one value missing)
    is_missing_gstr1:   bool
    is_missing_pr:      bool
    # Tax component consistency: (cgst+sgst+igst) ~ taxable_value × blended_rate
    # We skip this check if any component is None.
    tax_math_ok:        bool | None = None
    message:            str = ""


def _to_float(v: object) -> float | None:
    """Convert Neo4j property (int/float/str/None) to float or None."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def check_values(ctx: dict, tolerance_pct: float) -> ValueCheckResult:
    """
    Parameters
    ----------
    ctx : dict
        Context dict from the engine's Cypher query.
        Expected keys: gstr1_val, pr_val, taxable_value, cgst, sgst, igst.
    tolerance_pct : float
        Maximum allowed % deviation (from config.VALUE_TOLERANCE_PERCENT).

    Returns
    -------
    ValueCheckResult
    """
    gstr1_val = _to_float(ctx.get("gstr1_val"))
    pr_val    = _to_float(ctx.get("pr_val"))

    missing_gstr1 = gstr1_val is None
    missing_pr    = pr_val is None

    # ── Value comparison ──────────────────────────────────────────────────
    if missing_gstr1 or missing_pr:
        difference    = None
        deviation_pct = None
        within_tol    = None
        if missing_gstr1 and missing_pr:
            msg = "Both GSTR-1 and PR taxable values are absent."
        elif missing_gstr1:
            msg = "GSTR-1 taxable value is missing; cannot cross-check with PR."
        else:
            msg = "Purchase Register (PR) taxable value is missing; cannot cross-check with GSTR-1."
    else:
        difference    = gstr1_val - pr_val
        # Use gstr1 as base for pct (authoritative side)
        base          = gstr1_val if gstr1_val != 0 else pr_val
        deviation_pct = (abs(difference) / abs(base) * 100) if base else 0.0
        within_tol    = deviation_pct <= tolerance_pct
        if within_tol:
            msg = f"Values match within {tolerance_pct}% tolerance (deviation: {deviation_pct:.2f}%)."
        else:
            msg = (
                f"Value mismatch: GSTR-1={gstr1_val:.2f}, PR={pr_val:.2f} "
                f"({deviation_pct:.2f}% deviation, threshold={tolerance_pct}%)."
            )

    # ── Tax component sanity check ────────────────────────────────────────
    cgst          = _to_float(ctx.get("cgst"))
    sgst          = _to_float(ctx.get("sgst"))
    igst          = _to_float(ctx.get("igst"))
    taxable_value = _to_float(ctx.get("taxable_value"))

    tax_math_ok: bool | None = None
    if cgst is not None and sgst is not None and igst is not None and taxable_value:
        total_tax      = cgst + sgst + igst
        total_with_tax = taxable_value + total_tax
        total_val      = _to_float(ctx.get("total_value"))
        if total_val is not None:
            # Allow 1 rupee rounding tolerance
            tax_math_ok = abs(total_with_tax - total_val) <= 1.0

    return ValueCheckResult(
        gstr1_val=gstr1_val,
        pr_val=pr_val,
        difference=difference,
        deviation_pct=round(deviation_pct, 4) if deviation_pct is not None else None,
        within_tolerance=within_tol,
        is_missing_gstr1=missing_gstr1,
        is_missing_pr=missing_pr,
        tax_math_ok=tax_math_ok,
        message=msg,
    )
