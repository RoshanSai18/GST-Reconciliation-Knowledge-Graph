"""
India-specific GST data validators.

Functions
---------
validate_gstin(gstin)
    Returns True/False.  Checks format AND valid state code.

validate_taxpayer_row(row)
    Returns list of field-level error strings.

validate_invoice_row(row)
    Returns list of field-level error strings.

validate_gstr1_row(row)
validate_gstr2b_row(row)
validate_gstr3b_row(row)
    Return list of field-level error strings.

validate_tax_payment_row(row)
    Returns list of field-level error strings.

determine_authoritative_value(gstr1_val, pr_val, einvoice_val)
    Returns the best-trust taxable value using:
        EInvoice (IRN-registered) > GSTR-1 > Purchase Register

All validator functions accept a plain dict (parsed from a DataFrame row).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

# ---------------------------------------------------------------------------
# Indian state/UT codes valid in a GSTIN (01–38 with some gaps)
# Source: GST Council official state code list
# ---------------------------------------------------------------------------
_VALID_STATE_CODES: frozenset[str] = frozenset({
    "01",  # Jammu & Kashmir
    "02",  # Himachal Pradesh
    "03",  # Punjab
    "04",  # Chandigarh
    "05",  # Uttarakhand
    "06",  # Haryana
    "07",  # Delhi
    "08",  # Rajasthan
    "09",  # Uttar Pradesh
    "10",  # Bihar
    "11",  # Sikkim
    "12",  # Arunachal Pradesh
    "13",  # Nagaland
    "14",  # Manipur
    "15",  # Mizoram
    "16",  # Tripura
    "17",  # Meghalaya
    "18",  # Assam
    "19",  # West Bengal
    "20",  # Jharkhand
    "21",  # Odisha
    "22",  # Chhattisgarh
    "23",  # Madhya Pradesh
    "24",  # Gujarat
    "25",  # Daman & Diu (merged with Dadra & Nagar Haveli from 2020)
    "26",  # Dadra & Nagar Haveli (and Daman & Diu)
    "27",  # Maharashtra
    "28",  # Andhra Pradesh (old code, some legacy GSTINs still use it)
    "29",  # Karnataka
    "30",  # Goa
    "31",  # Lakshadweep
    "32",  # Kerala
    "33",  # Tamil Nadu
    "34",  # Puducherry
    "35",  # Andaman & Nicobar Islands
    "36",  # Telangana
    "37",  # Andhra Pradesh (new code post-bifurcation)
    "38",  # Ladakh
    "97",  # Other Territory
    "99",  # Centre Jurisdiction
})

# GSTIN regex: 2-digit state code + 5 alpha + 4 digit + 1 alpha + 1 alphanum + Z + 1 alphanum
_GSTIN_REGEX = re.compile(
    r"^([0-9]{2})([A-Z]{5})([0-9]{4})([A-Z])([1-9A-Z])Z([0-9A-Z])$"
)

# Accepted date formats in ingested data
_DATE_FORMATS: list[str] = [
    "%d-%m-%Y",  # 15-08-2024
    "%Y-%m-%d",  # 2024-08-15
    "%d/%m/%Y",  # 15/08/2024
    "%m/%d/%Y",  # 08/15/2024
    "%Y/%m/%d",  # 2024/08/15
    "%d-%b-%Y",  # 15-Aug-2024
]

# Tax period format: MMYYYY  e.g. 082024
_TAX_PERIOD_REGEX = re.compile(r"^(0[1-9]|1[0-2])\d{4}$")


# ---------------------------------------------------------------------------
# GSTIN validation
# ---------------------------------------------------------------------------

def validate_gstin(gstin: Any) -> bool:
    """
    Validate Indian GSTIN format and state code.

    Parameters
    ----------
    gstin : str
        The GSTIN string to validate.

    Returns
    -------
    bool
        True if valid, False otherwise.

    Format
    ------
    Positions  1-2  : State code (01–38, 97, 99)
    Positions  3-7  : First 5 chars of PAN (uppercase alpha)
    Positions  8-11 : Digits 4-7 of PAN (numeric)
    Position  12    : 5th char of PAN (alpha)
    Position  13    : Entity number (1-9 or A-Z)
    Position  14    : Always 'Z'
    Position  15    : Check digit (0-9 or A-Z)
    """
    if not isinstance(gstin, str):
        return False
    gstin = gstin.strip()  # trim whitespace only — do NOT uppercase (strict format enforcement)
    match = _GSTIN_REGEX.match(gstin)
    if not match:
        return False
    state_code = match.group(1)
    return state_code in _VALID_STATE_CODES


def extract_state_code(gstin: str) -> str | None:
    """Return the 2-digit state code from a valid GSTIN, or None."""
    if not isinstance(gstin, str):
        return None
    match = _GSTIN_REGEX.match(gstin.strip())
    return match.group(1) if match else None


# ---------------------------------------------------------------------------
# Date parsing helper
# ---------------------------------------------------------------------------

def _parse_date(value: Any) -> datetime | None:
    """Try to parse a date string using multiple formats.  Returns None on failure."""
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        # pandas Timestamp or similar
        try:
            return datetime.fromisoformat(str(value)[:10])
        except (ValueError, TypeError):
            return None
    value = value.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _is_valid_date(value: Any) -> bool:
    return _parse_date(value) is not None


def _is_positive_number(value: Any) -> bool:
    """Return True if value is a non-negative finite number."""
    try:
        return float(value) >= 0
    except (TypeError, ValueError):
        return False


def _is_valid_tax_period(value: Any) -> bool:
    """Return True if value matches MMYYYY format, e.g. '082024'."""
    if not isinstance(value, str):
        try:
            value = str(int(value))  # handle numeric 82024 → '82024'
        except (TypeError, ValueError):
            return False
    # Pad single-digit month representations just in case
    value = value.strip().zfill(6)
    return bool(_TAX_PERIOD_REGEX.match(value))


# ---------------------------------------------------------------------------
# Taxpayer row validator
# ---------------------------------------------------------------------------

def validate_taxpayer_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a Taxpayer ingestion row.

    Required: gstin
    Optional: state_code (derived from gstin if absent)
    """
    errors: list[str] = []

    gstin = row.get("gstin")
    if not gstin:
        errors.append("gstin: required field is missing or empty")
    elif not validate_gstin(gstin):
        errors.append(
            f"gstin: '{gstin}' is not a valid Indian GSTIN "
            "(check format and state code)"
        )

    return errors


# ---------------------------------------------------------------------------
# Invoice row validator
# ---------------------------------------------------------------------------

def validate_invoice_row(row: dict[str, Any]) -> list[str]:
    """
    Validate an Invoice ingestion row.
    Accepts both generator column names and legacy names.

    Required: invoice_id, invoice_date, buyer_gstin, total_value
    Required (either name): invoice_no|invoice_number, seller_gstin|supplier_gstin
    Required (any one): taxable_value|gstr1_taxable_value|pr_taxable_value|gst_amount
    """
    errors: list[str] = []

    if not row.get("invoice_id"):
        errors.append("invoice_id: required field is missing or empty")

    # Accept invoice_no (generator) or invoice_number (legacy)
    if not row.get("invoice_no") and not row.get("invoice_number"):
        errors.append("invoice_no: required field is missing or empty")

    if not row.get("invoice_date"):
        errors.append("invoice_date: required field is missing or empty")
    elif not _is_valid_date(row["invoice_date"]):
        errors.append(
            f"invoice_date: '{row['invoice_date']}' is not a recognised date format"
        )

    # Accept seller_gstin (generator) or supplier_gstin (legacy)
    seller = row.get("seller_gstin") or row.get("supplier_gstin")
    if not seller:
        errors.append("seller_gstin: required field is missing or empty")
    elif not validate_gstin(seller):
        errors.append(f"seller_gstin: '{seller}' is not a valid Indian GSTIN")

    buyer = row.get("buyer_gstin")
    if not buyer:
        errors.append("buyer_gstin: required field is missing or empty")
    elif not validate_gstin(buyer):
        errors.append(f"buyer_gstin: '{buyer}' is not a valid Indian GSTIN")

    if seller and buyer and validate_gstin(seller) and validate_gstin(buyer):
        if str(seller).strip().upper() == str(buyer).strip().upper():
            errors.append("seller_gstin and buyer_gstin must not be the same entity")

    # Accept taxable_value (generator), gstr1_taxable_value, pr_taxable_value, or gst_amount
    tv = (row.get("taxable_value") or row.get("gstr1_taxable_value")
          or row.get("pr_taxable_value") or row.get("gst_amount"))
    if tv is None or str(tv).strip() == "":
        errors.append("taxable_value: at least one taxable/gst value must be provided")
    elif not _is_positive_number(tv):
        errors.append(f"taxable_value: '{tv}' must be a non-negative number")

    # total_value required
    total = row.get("total_value")
    if total is None or str(total).strip() == "":
        errors.append("total_value: required field is missing or empty")
    elif not _is_positive_number(total):
        errors.append(f"total_value: '{total}' must be a non-negative number")

    return errors


# ---------------------------------------------------------------------------
# GSTR-1 row validator
# ---------------------------------------------------------------------------

def validate_gstr1_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a GSTR-1 ingestion row.
    Accepts 'period' (YYYY-MM generator format) or 'tax_period' (MMYYYY legacy).

    Required: return_id, gstin, period|tax_period, filing_date
    """
    errors: list[str] = []

    if not row.get("return_id"):
        errors.append("return_id: required field is missing or empty")

    gstin = row.get("gstin")
    if not gstin:
        errors.append("gstin: required field is missing or empty")
    elif not validate_gstin(gstin):
        errors.append(f"gstin: '{gstin}' is not a valid Indian GSTIN")

    # Accept YYYY-MM (generator) or MMYYYY (legacy)
    period = row.get("period") or row.get("tax_period")
    if not period:
        errors.append("period: required field is missing or empty")

    if not row.get("filing_date"):
        errors.append("filing_date: required field is missing or empty")
    elif not _is_valid_date(row["filing_date"]):
        errors.append(
            f"filing_date: '{row['filing_date']}' is not a recognised date format"
        )

    valid_statuses = {"FILED", "PENDING", "LATE", "NIL"}
    status = str(row.get("status", "")).strip().upper()
    if status and status not in valid_statuses:
        errors.append(
            f"status: '{status}' is not valid. Expected one of {valid_statuses}"
        )

    return errors


# ---------------------------------------------------------------------------
# GSTR-2B row validator
# ---------------------------------------------------------------------------

def validate_gstr2b_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a GSTR-2B ingestion row.

    Required: return_id, gstin, tax_period, generation_date
    """
    errors: list[str] = []

    if not row.get("return_id"):
        errors.append("return_id: required field is missing or empty")

    gstin = row.get("gstin")
    if not gstin:
        errors.append("gstin: required field is missing or empty")
    elif not validate_gstin(gstin):
        errors.append(f"gstin: '{gstin}' is not a valid Indian GSTIN")

    # Accept YYYY-MM (generator) or MMYYYY (legacy)
    period = row.get("period") or row.get("tax_period")
    if not period:
        errors.append("period: required field is missing or empty")

    # Accept generated_date (generator) or generation_date (legacy)
    gen_date = row.get("generated_date") or row.get("generation_date")
    if not gen_date:
        errors.append("generated_date: required field is missing or empty")
    elif not _is_valid_date(gen_date):
        errors.append(
            f"generated_date: '{gen_date}' is not a recognised date format"
        )

    return errors


# ---------------------------------------------------------------------------
# GSTR-3B row validator
# ---------------------------------------------------------------------------

def validate_gstr3b_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a GSTR-3B ingestion row.
    Accepts 'period' (YYYY-MM) or 'tax_period' (MMYYYY).
    Accepts 'output_tax' (generator) or 'tax_payable' (legacy).

    Required: return_id, gstin, period|tax_period, filing_date, output_tax|tax_payable
    """
    errors: list[str] = []

    if not row.get("return_id"):
        errors.append("return_id: required field is missing or empty")

    gstin = row.get("gstin")
    if not gstin:
        errors.append("gstin: required field is missing or empty")
    elif not validate_gstin(gstin):
        errors.append(f"gstin: '{gstin}' is not a valid Indian GSTIN")

    period = row.get("period") or row.get("tax_period")
    if not period:
        errors.append("period: required field is missing or empty")

    if not row.get("filing_date"):
        errors.append("filing_date: required field is missing or empty")
    elif not _is_valid_date(row["filing_date"]):
        errors.append(
            f"filing_date: '{row['filing_date']}' is not a recognised date format"
        )

    # Accept output_tax (generator) or tax_payable (legacy)
    output = row.get("output_tax") or row.get("tax_payable")
    if output is None or str(output).strip() == "":
        errors.append("output_tax: required field is missing or empty")
    elif not _is_positive_number(output):
        errors.append(f"output_tax: '{output}' must be a non-negative number")

    return errors


# ---------------------------------------------------------------------------
# TaxPayment row validator
# ---------------------------------------------------------------------------

def validate_tax_payment_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a TaxPayment ingestion row.
    Accepts 'amount' (generator) or 'amount_paid' (legacy).
    Accepts 'mode' (generator) or 'payment_mode' (legacy).

    Required: payment_id, amount|amount_paid, payment_date
    """
    errors: list[str] = []

    if not row.get("payment_id"):
        errors.append("payment_id: required field is missing or empty")

    # Accept amount (generator) or amount_paid (legacy)
    amount = row.get("amount") or row.get("amount_paid")
    if amount is None or str(amount).strip() == "":
        errors.append("amount: required field is missing or empty")
    elif not _is_positive_number(amount):
        errors.append(f"amount: '{amount}' must be a non-negative number")

    if not row.get("payment_date"):
        errors.append("payment_date: required field is missing or empty")
    elif not _is_valid_date(row["payment_date"]):
        errors.append(
            f"payment_date: '{row['payment_date']}' is not a recognised date format"
        )

    # mode is optional — normalization happens in the Pydantic model

    return errors


# ---------------------------------------------------------------------------
# Trust-hierarchy: determine authoritative taxable value
# ---------------------------------------------------------------------------

def determine_authoritative_value(
    gstr1_val: Any = None,
    pr_val: Any = None,
    einvoice_val: Any = None,
) -> float | None:
    """
    Return the most authoritative taxable value for an invoice.

    Trust hierarchy (highest → lowest):
        1. EInvoice value  (IRN-registered, government-stamped)
        2. GSTR-1 value    (supplier-declared to GST portal)
        3. Purchase Register value (buyer's internal record)

    Returns None if no valid numeric value is found.
    """
    def _to_float(v: Any) -> float | None:
        if v is None or str(v).strip() in ("", "nan", "None"):
            return None
        try:
            result = float(v)
            return result if result >= 0 else None
        except (TypeError, ValueError):
            return None

    for candidate in (einvoice_val, gstr1_val, pr_val):
        val = _to_float(candidate)
        if val is not None:
            return val
    return None


# ---------------------------------------------------------------------------
# Convenience: validate a batch and categorise rows
# ---------------------------------------------------------------------------

def split_valid_invalid(
    rows: list[dict[str, Any]],
    validator_fn,
) -> tuple[list[dict], list[dict]]:
    """
    Split a list of rows into (valid_rows, invalid_rows).
    Each invalid row dict gets an extra 'validation_errors' key.

    Parameters
    ----------
    rows : list[dict]
        Raw ingestion rows.
    validator_fn : callable
        One of the validate_*_row functions above.

    Returns
    -------
    (valid_rows, invalid_rows)
    """
    valid: list[dict] = []
    invalid: list[dict] = []
    for row in rows:
        errors = validator_fn(row)
        if errors:
            invalid.append({**row, "validation_errors": errors})
        else:
            valid.append(row)
    return valid, invalid
