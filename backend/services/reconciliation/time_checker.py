"""
time_checker.py — checks filing and payment timeliness for a reconciled invoice.

Pure Python: no database calls.

Due-date rules (India GST):
  GSTR-1 (quarterly filer):  13th of month following quarter end
  GSTR-1 (monthly filer):    11th of month following tax period
  GSTR-3B:                   20th of month following tax period (not checked here —
                              we check TaxPayment.payment_date vs invoice_date)

tax_period format expected from the generator: "MMYYYY"   e.g. "042024" = April 2024
invoice_date / filing_date / payment_date:  "YYYY-MM-DD" string or None
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

logger = logging.getLogger(__name__)

# GSTR-1 is due on the 11th of the following month for monthly filers
_GSTR1_DUE_DAY = 11


@dataclass
class TimeCheckResult:
    # GSTR-1 filing timeliness
    g1_tax_period:        str  | None
    g1_filing_date:       str  | None
    g1_due_date:          str  | None   # computed deadline
    g1_filed_on_time:     bool | None   # None = cannot assess
    g1_days_late:         int  | None   # positive = late, 0 = on time
    # Payment timeliness relative to invoice_date
    invoice_date:         str  | None
    payment_date:         str  | None
    has_payment:          bool
    days_to_payment:      int  | None   # invoice_date → payment_date
    is_payment_delayed:   bool          # > grace_days
    is_chronic_delay:     bool          # > chronic_delay_days


def _parse_date(s: object) -> date | None:
    """Parse "YYYY-MM-DD" string (or None) to a date object."""
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        logger.debug("Could not parse date: %r", s)
        return None


def _gstr1_due_date(tax_period: str) -> date | None:
    """
    Compute the GSTR-1 due date from a tax_period string like "042024".
    Returns 11th of the *following* month.
    """
    if not tax_period or len(tax_period) < 6:
        return None
    try:
        month = int(tax_period[:2])
        year  = int(tax_period[2:])
        # Following month
        if month == 12:
            next_month, next_year = 1, year + 1
        else:
            next_month, next_year = month + 1, year
        return date(next_year, next_month, _GSTR1_DUE_DAY)
    except (ValueError, TypeError):
        logger.debug("Could not compute due date for tax_period: %r", tax_period)
        return None


def check_timing(
    ctx: dict,
    grace_days: int,
    chronic_delay_days: int,
) -> TimeCheckResult:
    """
    Parameters
    ----------
    ctx : dict
        Context dict from the engine.
        Expected keys: g1_tax_period, g1_filing_date, invoice_date,
                       payment_date, has_payment.
    grace_days : int
        Payment is *delayed* if days_to_payment > grace_days.
    chronic_delay_days : int
        Payment is *chronically delayed* if days_to_payment > chronic_delay_days.

    Returns
    -------
    TimeCheckResult
    """
    g1_tax_period  = ctx.get("g1_tax_period")
    g1_filing_str  = ctx.get("g1_filing_date")
    invoice_str    = ctx.get("invoice_date")
    payment_str    = ctx.get("payment_date")
    has_payment    = bool(ctx.get("has_payment"))

    # ── GSTR-1 filing timeliness ─────────────────────────────────────────
    due_date       = _gstr1_due_date(g1_tax_period) if g1_tax_period else None
    filing_date    = _parse_date(g1_filing_str)
    g1_filed_time: bool | None = None
    g1_days_late:  int  | None = None

    if due_date and filing_date:
        delta         = (filing_date - due_date).days
        g1_days_late  = max(delta, 0)
        g1_filed_time = (delta <= 0)

    # ── Payment timeliness ───────────────────────────────────────────────
    invoice_date  = _parse_date(invoice_str)
    payment_date  = _parse_date(payment_str)
    days_to_pay:  int | None = None
    is_delayed    = False
    is_chronic    = False

    if has_payment and invoice_date and payment_date:
        days_to_pay = (payment_date - invoice_date).days
        is_delayed  = days_to_pay > grace_days
        is_chronic  = days_to_pay > chronic_delay_days
    elif not has_payment:
        # No payment record at all — treat as maximum delay
        if invoice_date:
            from datetime import date as _date
            days_to_pay = (_date.today() - invoice_date).days
            is_delayed  = days_to_pay > grace_days
            is_chronic  = days_to_pay > chronic_delay_days

    return TimeCheckResult(
        g1_tax_period=str(g1_tax_period) if g1_tax_period else None,
        g1_filing_date=g1_filing_str,
        g1_due_date=str(due_date) if due_date else None,
        g1_filed_on_time=g1_filed_time,
        g1_days_late=g1_days_late,
        invoice_date=invoice_str,
        payment_date=payment_str,
        has_payment=has_payment,
        days_to_payment=days_to_pay,
        is_payment_delayed=is_delayed,
        is_chronic_delay=is_chronic,
    )
