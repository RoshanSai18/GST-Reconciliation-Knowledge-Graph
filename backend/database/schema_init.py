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
# Uniqueness constraints
# ---------------------------------------------------------------------------
_CONSTRAINTS: list[tuple[str, str, str]] = [
    # (constraint_name, node_label, property)
    ("unique_taxpayer_gstin",    "Taxpayer",   "gstin"),
    ("unique_invoice_id",        "Invoice",    "invoice_id"),
    ("unique_gstr1_return_id",   "GSTR1",      "return_id"),
    ("unique_gstr2b_return_id",  "GSTR2B",     "return_id"),
    ("unique_gstr3b_return_id",  "GSTR3B",     "return_id"),
    ("unique_taxpayment_id",     "TaxPayment", "payment_id"),
    ("unique_einvoice_irn",      "EInvoice",   "irn"),
    ("unique_ewaybill_no",       "EWayBill",   "ewaybill_no"),
]

# ---------------------------------------------------------------------------
# Indexes (for frequently filtered properties that are not PKs)
# ---------------------------------------------------------------------------
_INDEXES: list[tuple[str, str, str]] = [
    # (index_name, node_label, property)
    ("idx_invoice_status",       "Invoice",   "status"),
    ("idx_invoice_risk_level",   "Invoice",   "risk_level"),
    ("idx_invoice_date",         "Invoice",   "invoice_date"),
    ("idx_invoice_number",       "Invoice",   "invoice_number"),
    ("idx_taxpayer_risk_score",  "Taxpayer",  "risk_score"),
    ("idx_taxpayer_state",       "Taxpayer",  "state_code"),
    ("idx_gstr1_period",         "GSTR1",     "tax_period"),
    ("idx_gstr2b_period",        "GSTR2B",    "tax_period"),
    ("idx_gstr3b_period",        "GSTR3B",    "tax_period"),
    ("idx_gstr3b_filing_date",   "GSTR3B",    "filing_date"),
    ("idx_taxpayment_date",      "TaxPayment","payment_date"),
]


def _apply_constraints(session) -> None:
    for name, label, prop in _CONSTRAINTS:
        cypher = (
            f"CREATE CONSTRAINT {name} IF NOT EXISTS "
            f"FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE"
        )
        session.run(cypher)
        logger.debug("Constraint ensured: %s", name)


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
    Safe to call multiple times — all statements use IF NOT EXISTS.
    """
    logger.info("Initialising Neo4j schema (constraints + indexes)…")
    try:
        with get_session() as session:
            _apply_constraints(session)
            _apply_indexes(session)
        logger.info(
            "Schema initialised: %d constraints, %d indexes.",
            len(_CONSTRAINTS),
            len(_INDEXES),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Schema initialisation failed: %s", exc)
        raise
