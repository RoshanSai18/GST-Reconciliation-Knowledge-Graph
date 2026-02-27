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

    Required fields: gstin, state_code
    Optional fields: pan, registration_status, filing_frequency

    Returns
    -------
    list[str]
        Empty list means the row is valid.
        Each string describes one validation failure.
    """
    errors: list[str] = []

    # gstin
    gstin = row.get("gstin")
    if not gstin:
        errors.append("gstin: required field is missing or empty")
    elif not validate_gstin(gstin):
        errors.append(
            f"gstin: '{gstin}' is not a valid Indian GSTIN "
            "(check format and state code)"
        )

    # state_code — must match GSTIN prefix if both present
    state_code = str(row.get("state_code", "")).strip().zfill(2)
    if state_code and state_code not in _VALID_STATE_CODES:
        errors.append(
            f"state_code: '{state_code}' is not a recognised Indian state/UT code"
        )
    if gstin and validate_gstin(gstin) and state_code:
        expected = extract_state_code(str(gstin).strip())
        if expected and expected != state_code:
            errors.append(
                f"state_code: '{state_code}' does not match GSTIN state prefix "
                f"'{expected}'"
            )

    # country_code — if supplied must be IN
    country = str(row.get("country_code", "IN")).strip().upper()
    if country and country != "IN":
        errors.append(
            f"country_code: only 'IN' (India) is supported, got '{country}'"
        )

    return errors


# ---------------------------------------------------------------------------
# Invoice row validator
# ---------------------------------------------------------------------------

def validate_invoice_row(row: dict[str, Any]) -> list[str]:
    """
    Validate an Invoice ingestion row.

    Required: invoice_id, invoice_number, invoice_date,
              supplier_gstin, buyer_gstin,
              cgst, sgst, igst, total_value
    At least one of: gstr1_taxable_value, pr_taxable_value

    Returns
    -------
    list[str]
        Empty list means the row is valid.
    """
    errors: list[str] = []

    # invoice_id
    if not row.get("invoice_id"):
        errors.append("invoice_id: required field is missing or empty")

    # invoice_number
    if not row.get("invoice_number"):
        errors.append("invoice_number: required field is missing or empty")

    # invoice_date
    if not row.get("invoice_date"):
        errors.append("invoice_date: required field is missing or empty")
    elif not _is_valid_date(row["invoice_date"]):
        errors.append(
            f"invoice_date: '{row['invoice_date']}' is not a recognised date format "
            "(expected DD-MM-YYYY or YYYY-MM-DD)"
        )

    # supplier_gstin
    supplier = row.get("supplier_gstin")
    if not supplier:
        errors.append("supplier_gstin: required field is missing or empty")
    elif not validate_gstin(supplier):
        errors.append(
            f"supplier_gstin: '{supplier}' is not a valid Indian GSTIN"
        )

    # buyer_gstin
    buyer = row.get("buyer_gstin")
    if not buyer:
        errors.append("buyer_gstin: required field is missing or empty")
    elif not validate_gstin(buyer):
        errors.append(
            f"buyer_gstin: '{buyer}' is not a valid Indian GSTIN"
        )

    # supplier and buyer must differ
    if supplier and buyer and validate_gstin(supplier) and validate_gstin(buyer):
        if str(supplier).strip().upper() == str(buyer).strip().upper():
            errors.append(
                "supplier_gstin and buyer_gstin must not be the same entity"
            )

    # taxable value — at least one source required
    gstr1_val = row.get("gstr1_taxable_value")
    pr_val = row.get("pr_taxable_value")
    has_gstr1 = gstr1_val is not None and str(gstr1_val).strip() != ""
    has_pr = pr_val is not None and str(pr_val).strip() != ""

    if not has_gstr1 and not has_pr:
        errors.append(
            "taxable_value: at least one of gstr1_taxable_value or "
            "pr_taxable_value must be provided"
        )
    if has_gstr1 and not _is_positive_number(gstr1_val):
        errors.append(
            f"gstr1_taxable_value: '{gstr1_val}' must be a non-negative number"
        )
    if has_pr and not _is_positive_number(pr_val):
        errors.append(
            f"pr_taxable_value: '{pr_val}' must be a non-negative number"
        )

    # Tax component fields
    for field in ("cgst", "sgst", "igst", "total_value"):
        val = row.get(field)
        if val is None or str(val).strip() == "":
            errors.append(f"{field}: required field is missing or empty")
        elif not _is_positive_number(val):
            errors.append(f"{field}: '{val}' must be a non-negative number")

    # source_type
    valid_source_types = {"GSTR1", "PR", "OCR_VERIFIED"}
    source = str(row.get("source_type", "")).strip().upper()
    if source and source not in valid_source_types:
        errors.append(
            f"source_type: '{source}' is not valid. "
            f"Expected one of {valid_source_types}"
        )

    # confidence_score — optional, 0.0–1.0
    conf = row.get("confidence_score")
    if conf is not None and str(conf).strip() != "":
        try:
            conf_f = float(conf)
            if not (0.0 <= conf_f <= 1.0):
                errors.append(
                    f"confidence_score: '{conf}' must be between 0.0 and 1.0"
                )
        except (TypeError, ValueError):
            errors.append(
                f"confidence_score: '{conf}' must be a decimal number"
            )

    return errors


# ---------------------------------------------------------------------------
# GSTR-1 row validator
# ---------------------------------------------------------------------------

def validate_gstr1_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a GSTR-1 ingestion row.

    Required: return_id, gstin, tax_period, filing_date
    """
    errors: list[str] = []

    if not row.get("return_id"):
        errors.append("return_id: required field is missing or empty")

    gstin = row.get("gstin")
    if not gstin:
        errors.append("gstin: required field is missing or empty")
    elif not validate_gstin(gstin):
        errors.append(f"gstin: '{gstin}' is not a valid Indian GSTIN")

    period = row.get("tax_period")
    if not period:
        errors.append("tax_period: required field is missing or empty")
    elif not _is_valid_tax_period(str(period)):
        errors.append(
            f"tax_period: '{period}' is not valid — expected MMYYYY (e.g. 082024)"
        )

    if not row.get("filing_date"):
        errors.append("filing_date: required field is missing or empty")
    elif not _is_valid_date(row["filing_date"]):
        errors.append(
            f"filing_date: '{row['filing_date']}' is not a recognised date format"
        )

    # status — optional
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

    period = row.get("tax_period")
    if not period:
        errors.append("tax_period: required field is missing or empty")
    elif not _is_valid_tax_period(str(period)):
        errors.append(
            f"tax_period: '{period}' is not valid — expected MMYYYY (e.g. 082024)"
        )

    if not row.get("generation_date"):
        errors.append("generation_date: required field is missing or empty")
    elif not _is_valid_date(row["generation_date"]):
        errors.append(
            f"generation_date: '{row['generation_date']}' is not a recognised date format"
        )

    return errors


# ---------------------------------------------------------------------------
# GSTR-3B row validator
# ---------------------------------------------------------------------------

def validate_gstr3b_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a GSTR-3B ingestion row.

    Required: return_id, gstin, tax_period, filing_date, tax_payable, tax_paid
    """
    errors: list[str] = []

    if not row.get("return_id"):
        errors.append("return_id: required field is missing or empty")

    gstin = row.get("gstin")
    if not gstin:
        errors.append("gstin: required field is missing or empty")
    elif not validate_gstin(gstin):
        errors.append(f"gstin: '{gstin}' is not a valid Indian GSTIN")

    period = row.get("tax_period")
    if not period:
        errors.append("tax_period: required field is missing or empty")
    elif not _is_valid_tax_period(str(period)):
        errors.append(
            f"tax_period: '{period}' is not valid — expected MMYYYY (e.g. 082024)"
        )

    if not row.get("filing_date"):
        errors.append("filing_date: required field is missing or empty")
    elif not _is_valid_date(row["filing_date"]):
        errors.append(
            f"filing_date: '{row['filing_date']}' is not a recognised date format"
        )

    for field in ("tax_payable", "tax_paid"):
        val = row.get(field)
        if val is None or str(val).strip() == "":
            errors.append(f"{field}: required field is missing or empty")
        elif not _is_positive_number(val):
            errors.append(f"{field}: '{val}' must be a non-negative number")

    return errors


# ---------------------------------------------------------------------------
# TaxPayment row validator
# ---------------------------------------------------------------------------

def validate_tax_payment_row(row: dict[str, Any]) -> list[str]:
    """
    Validate a TaxPayment ingestion row.

    Required: payment_id, amount_paid, payment_date, payment_mode
    """
    errors: list[str] = []

    if not row.get("payment_id"):
        errors.append("payment_id: required field is missing or empty")

    amount = row.get("amount_paid")
    if amount is None or str(amount).strip() == "":
        errors.append("amount_paid: required field is missing or empty")
    elif not _is_positive_number(amount):
        errors.append(f"amount_paid: '{amount}' must be a non-negative number")

    if not row.get("payment_date"):
        errors.append("payment_date: required field is missing or empty")
    elif not _is_valid_date(row["payment_date"]):
        errors.append(
            f"payment_date: '{row['payment_date']}' is not a recognised date format"
        )

    valid_modes = {"NEFT", "RTGS", "IMPS", "CHALLAN", "ITC", "CASH", "OTHER"}
    mode = str(row.get("payment_mode", "")).strip().upper()
    if not mode:
        errors.append("payment_mode: required field is missing or empty")
    elif mode not in valid_modes:
        errors.append(
            f"payment_mode: '{mode}' is not valid. Expected one of {valid_modes}"
        )

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
