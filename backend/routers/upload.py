"""
Upload router — accepts multipart/form-data file uploads for all 6 GST data types.

Auth note:
  A lightweight bearer-token guard is wired here using config.SECRET_KEY.
  Phase 10 replaces this dependency with a full JWT flow (routers/auth.py).

Endpoints
---------
POST /upload/taxpayers
POST /upload/invoices
POST /upload/gstr1
POST /upload/gstr2b
POST /upload/gstr3b
POST /upload/tax-payments

Every endpoint:
  1. Reads the raw bytes of the uploaded file.
  2. Parses + validates rows via services/ingestion/parsers.py.
  3. Bulk-upserts valid rows into Neo4j via services/ingestion/graph_builder.py.
  4. Returns UploadResult with counts and per-row error details.
"""

from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

import config
from models.schemas import UploadResult
from routers.auth import require_jwt
from services.ingestion import graph_builder, parsers

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Upload"])

_AuthDep = Annotated[object, Depends(require_jwt)]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB hard cap


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    """Read file bytes and guard against oversized uploads."""
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds 50 MB limit ({len(raw):,} bytes received).",
        )
    return raw, file.filename or "upload"


def _build_result(
    filename: str,
    valid_count: int,
    errors: list[dict],
    start_ns: int,
) -> UploadResult:
    duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000, 1)
    return UploadResult(
        file_name=filename,
        loaded=valid_count,
        skipped=len(errors),
        errors=errors,
        duration_ms=duration_ms,
    )


# ---------------------------------------------------------------------------
# POST /upload/taxpayers
# ---------------------------------------------------------------------------


@router.post(
    "/taxpayers",
    response_model=UploadResult,
    summary="Upload taxpayer master data (CSV / Excel / JSON)",
)
async def upload_taxpayers(
    _token: _AuthDep,
    file: Annotated[UploadFile, File(description="Taxpayer file (.csv, .xlsx, .json)")],
) -> UploadResult:
    t0 = time.perf_counter_ns()
    raw, fname = await _read_upload(file)

    valid_rows, error_rows = parsers.parse_file(raw, fname, "taxpayers")

    try:
        loaded = graph_builder.upsert_taxpayers_batch(valid_rows)  # type: ignore[arg-type]
    except Exception as exc:
        logger.exception("Neo4j write failed for taxpayers: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write failed: {exc}",
        ) from exc

    return _build_result(fname, loaded, error_rows, t0)


# ---------------------------------------------------------------------------
# POST /upload/invoices
# ---------------------------------------------------------------------------


@router.post(
    "/invoices",
    response_model=UploadResult,
    summary="Upload invoice data (CSV / Excel / JSON)",
)
async def upload_invoices(
    _token: _AuthDep,
    file: Annotated[UploadFile, File(description="Invoice file (.csv, .xlsx, .json)")],
) -> UploadResult:
    t0 = time.perf_counter_ns()
    raw, fname = await _read_upload(file)

    valid_rows, error_rows = parsers.parse_file(raw, fname, "invoices")

    try:
        loaded = graph_builder.upsert_invoices_batch(valid_rows)  # type: ignore[arg-type]
    except Exception as exc:
        logger.exception("Neo4j write failed for invoices: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write failed: {exc}",
        ) from exc

    return _build_result(fname, loaded, error_rows, t0)


# ---------------------------------------------------------------------------
# POST /upload/gstr1
# ---------------------------------------------------------------------------


@router.post(
    "/gstr1",
    response_model=UploadResult,
    summary="Upload GSTR-1 return data (CSV / Excel / JSON)",
)
async def upload_gstr1(
    _token: _AuthDep,
    file: Annotated[UploadFile, File(description="GSTR-1 file (.csv, .xlsx, .json)")],
) -> UploadResult:
    t0 = time.perf_counter_ns()
    raw, fname = await _read_upload(file)

    valid_rows, error_rows = parsers.parse_file(raw, fname, "gstr1")

    try:
        loaded = graph_builder.upsert_gstr1_batch(valid_rows)  # type: ignore[arg-type]
    except Exception as exc:
        logger.exception("Neo4j write failed for GSTR1: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write failed: {exc}",
        ) from exc

    return _build_result(fname, loaded, error_rows, t0)


# ---------------------------------------------------------------------------
# POST /upload/gstr2b
# ---------------------------------------------------------------------------


@router.post(
    "/gstr2b",
    response_model=UploadResult,
    summary="Upload GSTR-2B auto-drafted ITC data (CSV / Excel / JSON)",
)
async def upload_gstr2b(
    _token: _AuthDep,
    file: Annotated[UploadFile, File(description="GSTR-2B file (.csv, .xlsx, .json)")],
) -> UploadResult:
    t0 = time.perf_counter_ns()
    raw, fname = await _read_upload(file)

    valid_rows, error_rows = parsers.parse_file(raw, fname, "gstr2b")

    try:
        loaded = graph_builder.upsert_gstr2b_batch(valid_rows)  # type: ignore[arg-type]
    except Exception as exc:
        logger.exception("Neo4j write failed for GSTR2B: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write failed: {exc}",
        ) from exc

    return _build_result(fname, loaded, error_rows, t0)


# ---------------------------------------------------------------------------
# POST /upload/gstr3b
# ---------------------------------------------------------------------------


@router.post(
    "/gstr3b",
    response_model=UploadResult,
    summary="Upload GSTR-3B summary return data (CSV / Excel / JSON)",
)
async def upload_gstr3b(
    _token: _AuthDep,
    file: Annotated[UploadFile, File(description="GSTR-3B file (.csv, .xlsx, .json)")],
) -> UploadResult:
    t0 = time.perf_counter_ns()
    raw, fname = await _read_upload(file)

    valid_rows, error_rows = parsers.parse_file(raw, fname, "gstr3b")

    try:
        loaded = graph_builder.upsert_gstr3b_batch(valid_rows)  # type: ignore[arg-type]
    except Exception as exc:
        logger.exception("Neo4j write failed for GSTR3B: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write failed: {exc}",
        ) from exc

    return _build_result(fname, loaded, error_rows, t0)


# ---------------------------------------------------------------------------
# POST /upload/tax-payments
# ---------------------------------------------------------------------------


@router.post(
    "/tax-payments",
    response_model=UploadResult,
    summary="Upload TaxPayment data (CSV / Excel / JSON)",
)
async def upload_tax_payments(
    _token: _AuthDep,
    file: Annotated[UploadFile, File(description="TaxPayment file (.csv, .xlsx, .json)")],
) -> UploadResult:
    t0 = time.perf_counter_ns()
    raw, fname = await _read_upload(file)

    valid_rows, error_rows = parsers.parse_file(raw, fname, "tax_payments")

    try:
        loaded = graph_builder.upsert_tax_payments_batch(valid_rows)  # type: ignore[arg-type]
    except Exception as exc:
        logger.exception("Neo4j write failed for TaxPayments: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write failed: {exc}",
        ) from exc

    return _build_result(fname, loaded, error_rows, t0)
