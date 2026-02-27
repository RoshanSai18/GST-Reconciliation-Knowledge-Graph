"""
explainer.py — derives InvoiceStatus, RiskLevel and a human-readable explanation
from the three check results.

Pure Python: no database calls.

Status decision matrix
──────────────────────
VALID      → all paths present, values within tolerance, no filing / payment delay
WARNING    → minor deviation (> tolerance but ≤ HIGH_RISK_VALUE_PCT),
             OR late filing (≤ LATE_THRESHOLD days),
             OR payment delayed (≤ chronic threshold),
             OR GSTR-2B missing (reflected ITC not auto-drafted yet)
HIGH_RISK  → large value mismatch (deviation > HIGH_RISK_VALUE_PCT),
             OR missing GSTR-1 (not filed),
             OR both supplier and payment absent,
             OR chronic payment delay
PENDING    → invoice has no GSTR-1 AND no PR value (no source data at all)

Risk level
──────────
HIGH   → HIGH_RISK status, OR missing critical paths (supplier / GSTR-1)
MEDIUM → WARNING status, OR payment delayed, OR GSTR-2B absent
LOW    → VALID status
"""

from __future__ import annotations

from dataclasses import dataclass

from models.schemas import InvoiceStatus, RiskLevel
from services.reconciliation.path_validator import PathCheckResult
from services.reconciliation.time_checker import TimeCheckResult
from services.reconciliation.value_checker import ValueCheckResult

# Deviation % above which status jumps directly to HIGH_RISK
# (vs. WARNING for deviations just above tolerance)
_HIGH_RISK_VALUE_PCT = 10.0
# Filing delay (days) above which it becomes a HIGH_RISK signal
_HIGH_RISK_FILING_DAYS = 30


@dataclass
class ExplainResult:
    status:      InvoiceStatus
    risk_level:  RiskLevel
    explanation: str


def explain(
    path_res:  PathCheckResult,
    value_res: ValueCheckResult,
    time_res:  TimeCheckResult,
) -> ExplainResult:
    """
    Combine results from all three checkers into a single verdict.

    Returns
    -------
    ExplainResult with status, risk_level, and a plain-English explanation.
    """
    parts: list[str] = []     # bullet points collected as evidence
    high_risk_flags: list[str] = []
    warning_flags:   list[str] = []

    # ── 1. Path checks ────────────────────────────────────────────────────
    if not path_res.has_supplier:
        high_risk_flags.append("Supplier Taxpayer node is not linked (ISSUED_BY missing).")
    if not path_res.has_buyer:
        warning_flags.append("Buyer Taxpayer node is not linked (RECEIVED_BY missing).")
    if not path_res.has_gstr1:
        high_risk_flags.append("Invoice not reported in any GSTR-1 filing (REPORTED_IN missing).")
    if not path_res.has_gstr2b:
        warning_flags.append("Invoice not reflected in buyer GSTR-2B (ITC auto-draft absent).")
    if not path_res.has_payment:
        warning_flags.append("No TaxPayment record linked to this invoice (PAID_VIA missing).")

    # ── 2. Value checks ───────────────────────────────────────────────────
    if value_res.is_missing_gstr1 and value_res.is_missing_pr:
        high_risk_flags.append("No taxable value from any source (GSTR-1 or PR).")
    elif value_res.within_tolerance is False:
        dev = value_res.deviation_pct or 0.0
        if dev > _HIGH_RISK_VALUE_PCT:
            high_risk_flags.append(
                f"Large value mismatch: {dev:.2f}% deviation "
                f"(GSTR-1={value_res.gstr1_val}, PR={value_res.pr_val})."
            )
        else:
            warning_flags.append(
                f"Minor value mismatch: {dev:.2f}% deviation "
                f"(GSTR-1={value_res.gstr1_val}, PR={value_res.pr_val})."
            )
    elif value_res.within_tolerance is True:
        parts.append(f"Values match (deviation {value_res.deviation_pct:.2f}%).")

    if value_res.tax_math_ok is False:
        warning_flags.append("Tax component amounts (CGST+SGST+IGST) do not reconcile with total value.")

    # ── 3. Time / timeliness checks ───────────────────────────────────────
    if time_res.g1_filed_on_time is False and time_res.g1_days_late is not None:
        days = time_res.g1_days_late
        if days > _HIGH_RISK_FILING_DAYS:
            high_risk_flags.append(
                f"GSTR-1 filed {days} days late (due {time_res.g1_due_date})."
            )
        else:
            warning_flags.append(
                f"GSTR-1 filed {days} days late (due {time_res.g1_due_date})."
            )

    if time_res.is_chronic_delay:
        high_risk_flags.append(
            f"Chronic payment delay: {time_res.days_to_payment} days "
            f"from invoice date to payment."
        )
    elif time_res.is_payment_delayed:
        warning_flags.append(
            f"Payment delayed: {time_res.days_to_payment} days from invoice date."
        )

    # ── Determine status ──────────────────────────────────────────────────
    no_source_data = value_res.is_missing_gstr1 and value_res.is_missing_pr

    if no_source_data and not path_res.has_gstr1:
        status = InvoiceStatus.PENDING
    elif high_risk_flags:
        status = InvoiceStatus.HIGH_RISK
    elif warning_flags:
        status = InvoiceStatus.WARNING
    else:
        status = InvoiceStatus.VALID

    # ── Determine risk level ──────────────────────────────────────────────
    if status == InvoiceStatus.HIGH_RISK or not path_res.has_supplier or not path_res.has_gstr1:
        risk_level = RiskLevel.HIGH
    elif status == InvoiceStatus.WARNING or not path_res.has_gstr2b or time_res.is_payment_delayed:
        risk_level = RiskLevel.MEDIUM
    else:
        risk_level = RiskLevel.LOW

    # ── Compose explanation ───────────────────────────────────────────────
    all_issues = high_risk_flags + warning_flags + parts
    if not all_issues:
        all_issues = ["All reconciliation checks passed."]

    explanation = " | ".join(all_issues)

    return ExplainResult(
        status=status,
        risk_level=risk_level,
        explanation=explanation,
    )
