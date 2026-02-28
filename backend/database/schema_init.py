"""
Neo4j schema initialisation — constraints and indexes.

Called once at application startup (via main.py lifespan).
Uses CREATE CONSTRAINT IF NOT EXISTS so it is safe to run repeatedly.

Graph schema (for reference)
─────────────────────────────
NODES
  Taxpayer    : gstin (PK), pan, state_code, country_code, registration_status,
                filing_frequency, risk_score
  Invoice     : invoice_id (PK), invoice_number, invoice_date,
                gstr1_taxable_value, pr_taxable_value, taxable_value,
                cgst, sgst, igst, total_value, source_type, confidence_score,
                status, risk_level, explanation
  GSTR1       : return_id (PK), gstin, tax_period, filing_date, status
  GSTR2B      : return_id (PK), gstin, tax_period, generation_date
  GSTR3B      : return_id (PK), gstin, tax_period, filing_date,
                tax_payable, tax_paid
  TaxPayment  : payment_id (PK), amount_paid, payment_date, payment_mode
  EInvoice    : irn (PK), ack_date, signed_hash
  EWayBill    : ewaybill_no (PK), generation_date, distance, vehicle_no

RELATIONSHIPS
  (Invoice)    -[:ISSUED_BY]->    (Taxpayer)     # supplier
  (Invoice)    -[:RECEIVED_BY]->  (Taxpayer)     # buyer
  (Invoice)    -[:REPORTED_IN]->  (GSTR1)
  (Invoice)    -[:REFLECTED_IN]-> (GSTR2B)
  (Invoice)    -[:PAID_VIA]->     (TaxPayment)
  (TaxPayment) -[:SETTLED_IN]->   (GSTR3B)
  (GSTR1)      -[:FILED_BY]->     (Taxpayer)     # added for multi-hop traversal
  (GSTR2B)     -[:FILED_BY]->     (Taxpayer)
  (GSTR3B)     -[:FILED_BY]->     (Taxpayer)
  (Invoice)    -[:VERIFIED_BY]->  (EInvoice)     # optional
  (Invoice)    -[:MOVED_UNDER]->  (EWayBill)     # optional
  (Invoice)    -[:AMENDS]->       (Invoice)      # amendment versioning
"""

from __future__ import annotations

import logging

from database.neo4j_client import get_session

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Old single-property constraints to DROP (replaced by composite ones below).
# Safe to run even if they no longer exist.
# ---------------------------------------------------------------------------
_DROP_OLD_CONSTRAINTS: list[str] = [
    "unique_taxpayer_gstin",
    "unique_invoice_id",
    "unique_gstr1_return_id",
    "unique_gstr2b_return_id",
    "unique_gstr3b_return_id",
    "unique_taxpayment_id",
    "unique_einvoice_irn",
    "unique_ewaybill_no",
]

# ---------------------------------------------------------------------------
# Composite uniqueness constraints  (prop + user_id = PK per user)
# ---------------------------------------------------------------------------
_COMPOSITE_CONSTRAINTS: list[tuple[str, str, str, str]] = [
    # (constraint_name, node_label, prop1, prop2)
    ("uq_taxpayer_gstin_uid",   "Taxpayer",   "gstin",      "user_id"),
    ("uq_invoice_id_uid",       "Invoice",    "invoice_id", "user_id"),
    ("uq_gstr1_rid_uid",        "GSTR1",      "return_id",  "user_id"),
    ("uq_gstr2b_rid_uid",       "GSTR2B",     "return_id",  "user_id"),
    ("uq_gstr3b_rid_uid",       "GSTR3B",     "return_id",  "user_id"),
    ("uq_taxpayment_pid_uid",   "TaxPayment", "payment_id", "user_id"),
]

# ---------------------------------------------------------------------------
# Single-property indexes (for frequently filtered non-PK properties)
# ---------------------------------------------------------------------------
_INDEXES: list[tuple[str, str, str]] = [
    ("idx_invoice_status",       "Invoice",    "status"),
    ("idx_invoice_risk_level",   "Invoice",    "risk_level"),
    ("idx_invoice_date",         "Invoice",    "invoice_date"),
    ("idx_invoice_number",       "Invoice",    "invoice_number"),
    ("idx_taxpayer_risk_score",  "Taxpayer",   "risk_score"),
    ("idx_taxpayer_state",       "Taxpayer",   "state_code"),
    ("idx_taxpayer_user_id",     "Taxpayer",   "user_id"),
    ("idx_invoice_user_id",      "Invoice",    "user_id"),
    ("idx_gstr1_user_id",        "GSTR1",      "user_id"),
    ("idx_gstr2b_user_id",       "GSTR2B",     "user_id"),
    ("idx_gstr3b_user_id",       "GSTR3B",     "user_id"),
    ("idx_taxpayment_user_id",   "TaxPayment", "user_id"),
    ("idx_gstr1_period",         "GSTR1",      "tax_period"),
    ("idx_gstr2b_period",        "GSTR2B",     "tax_period"),
    ("idx_gstr3b_period",        "GSTR3B",     "tax_period"),
    ("idx_gstr3b_filing_date",   "GSTR3B",     "filing_date"),
    ("idx_taxpayment_date",      "TaxPayment", "payment_date"),
]


def _drop_old_constraints(session) -> None:
    for name in _DROP_OLD_CONSTRAINTS:
        try:
            session.run(f"DROP CONSTRAINT {name} IF EXISTS")
            logger.debug("Dropped old constraint (if existed): %s", name)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not drop constraint %s: %s", name, exc)


def _apply_composite_constraints(session) -> None:
    for name, label, p1, p2 in _COMPOSITE_CONSTRAINTS:
        cypher = (
            f"CREATE CONSTRAINT {name} IF NOT EXISTS "
            f"FOR (n:{label}) REQUIRE (n.{p1}, n.{p2}) IS UNIQUE"
        )
        session.run(cypher)
        logger.debug("Composite constraint ensured: %s", name)


def _apply_indexes(session) -> None:
    for name, label, prop in _INDEXES:
        cypher = (
            f"CREATE INDEX {name} IF NOT EXISTS "
            f"FOR (n:{label}) ON (n.{prop})"
        )
        session.run(cypher)
        logger.debug("Index ensured: %s", name)


def init_schema() -> None:
    """
    Apply all constraints and indexes to the Neo4j database.
    Safe to call multiple times — all statements use IF NOT EXISTS / IF EXISTS.

    Migration note: drops old single-property uniqueness constraints and
    replaces them with composite (prop, user_id) constraints so that different
    Clerk users can each have their own isolated copy of the same GSTIN/invoice.
    """
    logger.info("Initialising Neo4j schema (constraints + indexes)…")
    try:
        with get_session() as session:
            _drop_old_constraints(session)
            _apply_composite_constraints(session)
            _apply_indexes(session)
        logger.info(
            "Schema initialised: %d composite constraints, %d indexes.",
            len(_COMPOSITE_CONSTRAINTS),
            len(_INDEXES),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Schema initialisation failed: %s", exc)
        raise
