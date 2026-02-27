"""
File parsers for GST data ingestion.

Supports .xlsx, .xls, .csv, and .json files.
Each parser returns (valid_rows, error_rows) where:
  - valid_rows  : list of validated Pydantic ingest row objects
  - error_rows  : list of dicts with 'row_index' and 'errors' keys

Usage
-----
    from services.ingestion.parsers import parse_file
    from models.schemas import InvoiceIngestionRow

    valid, errors = parse_file(file_bytes, filename, InvoiceIngestionRow, validate_invoice_row)
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any, Type, TypeVar

import pandas as pd
from pydantic import BaseModel, ValidationError

from models.schemas import (
    GSTR1IngestionRow,
    GSTR2BIngestionRow,
    GSTR3BIngestionRow,
    InvoiceIngestionRow,
    TaxPaymentIngestionRow,
    TaxpayerIngestionRow,
)
from services.validators import (
    split_valid_invalid,
    validate_gstr1_row,
    validate_gstr2b_row,
    validate_gstr3b_row,
    validate_invoice_row,
    validate_tax_payment_row,
    validate_taxpayer_row,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# ---------------------------------------------------------------------------
# Column name normalisation
# ---------------------------------------------------------------------------

def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Strip whitespace and lowercase all column names so minor header
    variations in uploaded files don't cause key errors.
    """
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df


def _nan_to_none(row: dict[str, Any]) -> dict[str, Any]:
    """Replace pandas NaN / NaT with None so Pydantic accepts optional fields."""
    import math
    cleaned: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, float) and math.isnan(v):
            cleaned[k] = None
        elif pd.isna(v) if not isinstance(v, (list, dict)) else False:  # type: ignore[arg-type]
            cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned


# ---------------------------------------------------------------------------
# Low-level file reader → list[dict]
# ---------------------------------------------------------------------------

def _read_bytes(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    """
    Read a CSV, Excel, or JSON file from raw bytes into a list of row dicts.

    Parameters
    ----------
    file_bytes : bytes
        Raw file content from the HTTP upload.
    filename : str
        Original filename; used to detect format by extension.

    Returns
    -------
    list[dict]
        One dict per data row (empty rows dropped).

    Raises
    ------
    ValueError
        If the file extension is unsupported or the file cannot be parsed.
    """
    name = filename.strip().lower()

    try:
        if name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_bytes), dtype=str)
        elif name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes), dtype=str)
        elif name.endswith(".json"):
            data = json.loads(file_bytes.decode("utf-8"))
            if isinstance(data, list):
                df = pd.DataFrame(data)
            elif isinstance(data, dict):
                # Support {data: [...]} envelope
                df = pd.DataFrame(data.get("data", [data]))
            else:
                raise ValueError("JSON must be an array or an object with a 'data' key")
        else:
            raise ValueError(
                f"Unsupported file format: '{filename}'. "
                "Accepted: .xlsx, .xls, .csv, .json"
            )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to parse '{filename}': {exc}") from exc

    df = _normalise_columns(df)
    df = df.dropna(how="all")           # drop completely empty rows
    rows = [_nan_to_none(r) for r in df.to_dict(orient="records")]
    logger.info("Parsed '%s': %d rows", filename, len(rows))
    return rows


# ---------------------------------------------------------------------------
# Generic parse + validate pipeline
# ---------------------------------------------------------------------------

def _parse_and_validate(
    rows: list[dict[str, Any]],
    pydantic_model: Type[T],
    field_validator_fn,
) -> tuple[list[T], list[dict[str, Any]]]:
    """
    Run field-level validation (validators.py) then Pydantic model construction.

    Returns
    -------
    (valid_models, error_rows)
      valid_models : list of successfully constructed Pydantic model instances
      error_rows   : list of {row_index, row_data, errors} dicts
    """
    valid_models: list[T] = []
    error_rows: list[dict[str, Any]] = []

    for idx, row in enumerate(rows):
        # Step 1: field-level validation (India-specific rules)
        field_errors = field_validator_fn(row)
        if field_errors:
            error_rows.append({
                "row_index": idx,
                "row_data":  row,
                "errors":    field_errors,
            })
            continue

        # Step 2: Pydantic model construction (type coercion + model validators)
        try:
            model = pydantic_model.model_validate(row)
            valid_models.append(model)
        except ValidationError as exc:
            error_rows.append({
                "row_index": idx,
                "row_data":  row,
                "errors":    [str(e) for e in exc.errors()],
            })

    return valid_models, error_rows


# ---------------------------------------------------------------------------
# Public parse functions (one per file type)
# ---------------------------------------------------------------------------

def parse_taxpayers(
    file_bytes: bytes,
    filename: str,
) -> tuple[list[TaxpayerIngestionRow], list[dict]]:
    """Parse taxpayers file → (valid TaxpayerIngestionRow list, error list)."""
    rows = _read_bytes(file_bytes, filename)
    return _parse_and_validate(rows, TaxpayerIngestionRow, validate_taxpayer_row)


def parse_invoices(
    file_bytes: bytes,
    filename: str,
) -> tuple[list[InvoiceIngestionRow], list[dict]]:
    """Parse invoices file → (valid InvoiceIngestionRow list, error list)."""
    rows = _read_bytes(file_bytes, filename)
    return _parse_and_validate(rows, InvoiceIngestionRow, validate_invoice_row)


def parse_gstr1(
    file_bytes: bytes,
    filename: str,
) -> tuple[list[GSTR1IngestionRow], list[dict]]:
    """Parse GSTR-1 file → (valid GSTR1IngestionRow list, error list)."""
    rows = _read_bytes(file_bytes, filename)
    return _parse_and_validate(rows, GSTR1IngestionRow, validate_gstr1_row)


def parse_gstr2b(
    file_bytes: bytes,
    filename: str,
) -> tuple[list[GSTR2BIngestionRow], list[dict]]:
    """Parse GSTR-2B file → (valid GSTR2BIngestionRow list, error list)."""
    rows = _read_bytes(file_bytes, filename)
    return _parse_and_validate(rows, GSTR2BIngestionRow, validate_gstr2b_row)


def parse_gstr3b(
    file_bytes: bytes,
    filename: str,
) -> tuple[list[GSTR3BIngestionRow], list[dict]]:
    """Parse GSTR-3B file → (valid GSTR3BIngestionRow list, error list)."""
    rows = _read_bytes(file_bytes, filename)
    return _parse_and_validate(rows, GSTR3BIngestionRow, validate_gstr3b_row)


def parse_tax_payments(
    file_bytes: bytes,
    filename: str,
) -> tuple[list[TaxPaymentIngestionRow], list[dict]]:
    """Parse tax_payments file → (valid TaxPaymentIngestionRow list, error list)."""
    rows = _read_bytes(file_bytes, filename)
    return _parse_and_validate(rows, TaxPaymentIngestionRow, validate_tax_payment_row)


# ---------------------------------------------------------------------------
# Generic dispatcher (used by upload router)
# ---------------------------------------------------------------------------

_PARSER_MAP = {
    "taxpayers":    parse_taxpayers,
    "invoices":     parse_invoices,
    "gstr1":        parse_gstr1,
    "gstr2b":       parse_gstr2b,
    "gstr3b":       parse_gstr3b,
    "tax_payments": parse_tax_payments,
}


def parse_file(
    file_bytes: bytes,
    filename: str,
    file_type: str,
) -> tuple[list[BaseModel], list[dict]]:
    """
    Dispatch to the correct parser by file_type key.

    Parameters
    ----------
    file_bytes : bytes
    filename   : str    — original filename (for format detection)
    file_type  : str    — one of: taxpayers, invoices, gstr1, gstr2b, gstr3b, tax_payments

    Returns
    -------
    (valid_rows, error_rows)
    """
    fn = _PARSER_MAP.get(file_type)
    if fn is None:
        raise ValueError(
            f"Unknown file_type '{file_type}'. "
            f"Expected one of: {list(_PARSER_MAP.keys())}"
        )
    return fn(file_bytes, filename)
