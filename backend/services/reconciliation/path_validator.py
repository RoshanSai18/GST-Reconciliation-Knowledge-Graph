"""
path_validator.py — checks which expected graph relationships exist for an invoice.

Pure Python: takes a context dict already fetched from Neo4j and returns a
PathCheckResult dataclass.  No database calls are made here.

Expected relationships per invoice:
  (Invoice)-[:ISSUED_BY]->(Taxpayer)      ← supplier
  (Invoice)-[:RECEIVED_BY]->(Taxpayer)    ← buyer
  (Invoice)-[:REPORTED_IN]->(GSTR1)       ← filed by supplier
  (Invoice)-[:REFLECTED_IN]->(GSTR2B)     ← visible in buyer auto-draft
  (Invoice)-[:PAID_VIA]->(TaxPayment)     ← at least one payment link
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PathCheckResult:
    has_supplier:           bool
    has_buyer:              bool
    has_gstr1:              bool
    has_gstr2b:             bool
    has_payment:            bool
    missing_relationships:  list[str] = field(default_factory=list)
    # True only when ALL five relationships are present
    is_complete:            bool = False
    # Number of present hops (max 5)
    coverage_score:         int = 0


def check_paths(ctx: dict) -> PathCheckResult:
    """
    Parameters
    ----------
    ctx : dict
        Row returned by the engine's invoice-context Cypher query.
        Must contain boolean keys:
          has_supplier, has_buyer, has_gstr1, has_gstr2b, has_payment

    Returns
    -------
    PathCheckResult
    """
    has_supplier: bool = bool(ctx.get("has_supplier"))
    has_buyer:    bool = bool(ctx.get("has_buyer"))
    has_gstr1:    bool = bool(ctx.get("has_gstr1"))
    has_gstr2b:   bool = bool(ctx.get("has_gstr2b"))
    has_payment:  bool = bool(ctx.get("has_payment"))

    missing: list[str] = []
    if not has_supplier:
        missing.append("ISSUED_BY")
    if not has_buyer:
        missing.append("RECEIVED_BY")
    if not has_gstr1:
        missing.append("REPORTED_IN (GSTR-1)")
    if not has_gstr2b:
        missing.append("REFLECTED_IN (GSTR-2B)")
    if not has_payment:
        missing.append("PAID_VIA (TaxPayment)")

    present = 5 - len(missing)

    return PathCheckResult(
        has_supplier=has_supplier,
        has_buyer=has_buyer,
        has_gstr1=has_gstr1,
        has_gstr2b=has_gstr2b,
        has_payment=has_payment,
        missing_relationships=missing,
        is_complete=(len(missing) == 0),
        coverage_score=present,
    )
