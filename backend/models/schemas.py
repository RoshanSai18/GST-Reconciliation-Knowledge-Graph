"""
Pydantic v2 models for the GST Reconciliation Knowledge Graph API.

Structure
---------
1.  Shared enums & base types
2.  Ingest row models        — map directly to Excel/CSV column names from generator
3.  Node response models     — what the API returns for each graph node type
4.  API request/response     — upload results, reconciliation summary, etc.
5.  Pattern detection        — pattern result shapes
6.  Graph export             — Cytoscape-compatible node/edge shapes
7.  Auth                     — login request, token, current user
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


# =============================================================================
# 1. Shared enums
# =============================================================================

class RiskLevel(str, Enum):
    LOW    = "Low"
    MEDIUM = "Medium"
    HIGH   = "High"


class InvoiceStatus(str, Enum):
    VALID     = "Valid"
    WARNING   = "Warning"
    HIGH_RISK = "High-Risk"
    PENDING   = "Pending"       # not yet reconciled


class SourceType(str, Enum):
    GSTR1        = "GSTR1"
    PR           = "PR"           # Purchase Register
    OCR_VERIFIED = "OCR_VERIFIED"


class FilingStatus(str, Enum):
    FILED   = "FILED"
    PENDING = "PENDING"
    LATE    = "LATE"
    NIL     = "NIL"


class PaymentMode(str, Enum):
    NEFT    = "NEFT"
    RTGS    = "RTGS"
    IMPS    = "IMPS"
    CHALLAN = "CHALLAN"
    ITC     = "ITC"
    CASH    = "CASH"
    OTHER   = "OTHER"


class AnomalyType(str, Enum):
    """Ground-truth labels injected by the synthetic data generator."""
    NONE            = "NONE"
    MISSING_PAYMENT = "MISSING_PAYMENT"
    VALUE_MISMATCH  = "VALUE_MISMATCH"
    CIRCULAR_TRADE  = "CIRCULAR_TRADE"
    LATE_FILING     = "LATE_FILING"
    AMENDMENT       = "AMENDMENT"


class PatternType(str, Enum):
    CIRCULAR_TRADE  = "circular_trade"
    PAYMENT_DELAY   = "payment_delay"
    AMENDMENT_CHAIN = "amendment_chain"
    RISK_NETWORK    = "risk_network"


# =============================================================================
# 2. Ingest row models (match Excel column names from generator.py)
# =============================================================================

def _yyyy_mm_to_mmyyyy(value: Any) -> str:
    """Convert '2025-04' (YYYY-MM) → '042025' (MMYYYY). Pass-through for other formats."""
    if isinstance(value, str) and len(value) == 7 and value[4] == "-":
        try:
            year, month = value.split("-")
            return f"{month.zfill(2)}{year}"
        except ValueError:
            pass
    return str(value) if value is not None else ""


class TaxpayerIngestionRow(BaseModel):
    """One row from taxpayers.xlsx (generator schema)."""
    gstin:               str
    # Generator column names
    legal_name:          str | None = None
    trade_name:          str | None = None
    state:               str | None = None
    registration_date:   str | None = None
    taxpayer_type:       str | None = None
    risk_score:          float | None = None
    # Legacy / optional
    pan:                 str | None = None
    state_code:          str | None = None
    country_code:        str = "IN"
    registration_status: str | None = None
    filing_frequency:    str | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            # Derive state_code from GSTIN prefix if not supplied
            if not d.get("state_code") and d.get("gstin"):
                d["state_code"] = str(d["gstin"])[:2]
            # Map generator "status" → registration_status
            if not d.get("registration_status") and d.get("status"):
                d["registration_status"] = d["status"]
            return d
        return data

    @field_validator("gstin")
    @classmethod
    def gstin_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("gstin must not be empty")
        return v.strip()


class InvoiceIngestionRow(BaseModel):
    """One row from invoices.xlsx (generator schema)."""
    invoice_id:    str
    invoice_date:  str
    buyer_gstin:   str
    total_value:   float
    # Generator column names
    invoice_no:            str | None = None
    seller_gstin:          str | None = None
    taxable_value:         float | None = None
    gst_rate:              float | None = None
    gst_amount:            float | None = None
    irn:                   str | None = None
    # Normalized / legacy names (populated by mode="before")
    invoice_number:        str | None = None
    supplier_gstin:        str | None = None
    gstr1_taxable_value:   float | None = None
    pr_taxable_value:      float | None = None
    cgst:                  float = 0.0
    sgst:                  float = 0.0
    igst:                  float = 0.0
    source_type:           SourceType = SourceType.GSTR1
    confidence_score:      float | None = Field(default=None, ge=0.0, le=1.0)
    gstr1_return_id:       str | None = None
    gstr2b_return_id:      str | None = None
    amends_invoice_id:     str | None = None
    anomaly_type:          AnomalyType | None = AnomalyType.NONE

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            # invoice_no → invoice_number
            if not d.get("invoice_number") and d.get("invoice_no"):
                d["invoice_number"] = d["invoice_no"]
            # seller_gstin → supplier_gstin
            if not d.get("supplier_gstin") and d.get("seller_gstin"):
                d["supplier_gstin"] = d["seller_gstin"]
            # taxable_value → gstr1_taxable_value
            if not d.get("gstr1_taxable_value") and d.get("taxable_value"):
                d["gstr1_taxable_value"] = d["taxable_value"]
            # gst_amount → igst (no CGST/SGST split in generator)
            if d.get("gst_amount") and float(d.get("igst") or 0) == 0.0:
                d["igst"] = d["gst_amount"]
            return d
        return data


class GSTR1IngestionRow(BaseModel):
    """One row from gstr1.xlsx (generator schema)."""
    return_id:          str
    gstin:              str
    period:             str          # YYYY-MM (generator) or MMYYYY (legacy)
    filing_date:        str
    status:             FilingStatus = FilingStatus.FILED
    total_outward_tax:  float = 0.0

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            # Accept legacy "tax_period" field name
            if not d.get("period") and d.get("tax_period"):
                d["period"] = d["tax_period"]
            return d
        return data


class GSTR2BIngestionRow(BaseModel):
    """One row from gstr2b.xlsx (generator schema)."""
    return_id:             str
    gstin:                 str
    period:                str      # YYYY-MM
    generated_date:        str
    total_itc_available:   float = 0.0

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            if not d.get("period") and d.get("tax_period"):
                d["period"] = d["tax_period"]
            # generation_date → generated_date
            if not d.get("generated_date") and d.get("generation_date"):
                d["generated_date"] = d["generation_date"]
            return d
        return data


class GSTR3BIngestionRow(BaseModel):
    """One row from gstr3b.xlsx (generator schema)."""
    return_id:    str
    gstin:        str
    period:       str          # YYYY-MM
    filing_date:  str
    output_tax:   float = 0.0
    itc_claimed:  float = 0.0
    tax_paid:     float = 0.0

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            if not d.get("period") and d.get("tax_period"):
                d["period"] = d["tax_period"]
            # tax_payable → output_tax
            if not d.get("output_tax") and d.get("tax_payable"):
                d["output_tax"] = d["tax_payable"]
            return d
        return data


class TaxPaymentIngestionRow(BaseModel):
    """One row from tax_payments.xlsx (generator schema)."""
    payment_id:    str
    payment_date:  str
    # Generator field names
    amount:        float = Field(default=0.0, ge=0.0)
    mode:          str | None = None
    gstin:         str | None = None
    period:        str | None = None
    # Normalized names (populated by mode="before")
    amount_paid:      float | None = None
    payment_mode:     PaymentMode | None = None
    # Relationship FKs
    invoice_id:       str | None = None
    gstr3b_return_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            # amount → amount_paid
            if not d.get("amount_paid") and d.get("amount"):
                d["amount_paid"] = d["amount"]
            # mode → payment_mode (normalize strings to PaymentMode enum values)
            if not d.get("payment_mode") and d.get("mode"):
                raw = str(d["mode"]).strip().upper()
                _mode_map = {
                    "NETBANKING": "OTHER",
                    "NEFT":       "NEFT",
                    "RTGS":       "RTGS",
                    "IMPS":       "IMPS",
                    "CHALLAN":    "CHALLAN",
                    "ITC":        "ITC",
                    "CASH":       "CASH",
                }
                d["payment_mode"] = _mode_map.get(raw, "OTHER")
            # amount_paid fallback
            if not d.get("amount_paid"):
                d["amount_paid"] = d.get("amount", 0.0)
            return d
        return data


# =============================================================================
# 3. Node response models (what the API returns)
# =============================================================================

class TaxpayerResponse(BaseModel):
    """Taxpayer node as returned by the API."""
    gstin:               str
    pan:                 str | None = None
    state_code:          str
    country_code:        str = "IN"
    registration_status: str | None = None
    filing_frequency:    str | None = None
    risk_score:          float | None = None      # derived, written back after ML scoring
    risk_level:          RiskLevel | None = None  # derived


class InvoiceResponse(BaseModel):
    """Invoice node as returned by the API."""
    invoice_id:           str
    invoice_number:       str
    invoice_date:         str
    supplier_gstin:       str
    buyer_gstin:          str
    gstr1_taxable_value:  float | None = None
    pr_taxable_value:     float | None = None
    taxable_value:        float | None = None     # authoritative value (trust hierarchy)
    cgst:                 float = 0.0
    sgst:                 float = 0.0
    igst:                 float = 0.0
    total_value:          float
    source_type:          SourceType | None = None
    confidence_score:     float | None = None
    # Derived fields (written back after reconciliation)
    status:               InvoiceStatus = InvoiceStatus.PENDING
    risk_level:           RiskLevel | None = None
    explanation:          str | None = None


class GSTR1Response(BaseModel):
    return_id:   str
    gstin:       str
    tax_period:  str
    filing_date: str
    status:      FilingStatus | None = None


class GSTR2BResponse(BaseModel):
    return_id:       str
    gstin:           str
    tax_period:      str
    generation_date: str


class GSTR3BResponse(BaseModel):
    return_id:   str
    gstin:       str
    tax_period:  str
    filing_date: str
    tax_payable: float = 0.0
    tax_paid:    float = 0.0


class TaxPaymentResponse(BaseModel):
    payment_id:   str
    amount_paid:  float
    payment_date: str
    payment_mode: PaymentMode | None = None


# =============================================================================
# 4. API request / response shapes
# =============================================================================

# ── Upload ───────────────────────────────────────────────────────────────────

class UploadResult(BaseModel):
    """Returned by every POST /upload/* endpoint."""
    file_name:    str
    loaded:       int = Field(description="Rows successfully written to Neo4j")
    skipped:      int = Field(description="Rows skipped due to validation errors")
    errors:       list[dict[str, Any]] = Field(
        default_factory=list,
        description="List of {row_index, errors} dicts for failed rows"
    )
    duration_ms:  float | None = None


# ── Reconciliation ───────────────────────────────────────────────────────────

class ReconciliationSummary(BaseModel):
    """Returned by POST /reconcile."""
    total:       int
    valid:       int
    warning:     int
    high_risk:   int
    pending:     int
    duration_ms: float | None = None
    run_at:      datetime | None = None


# ── Invoice detail (extended) ────────────────────────────────────────────────

class ValueComparison(BaseModel):
    """Side-by-side value comparison across sources."""
    gstr1_taxable_value:  float | None = None
    pr_taxable_value:     float | None = None
    authoritative_value:  float | None = None
    difference:           float | None = None
    difference_pct:       float | None = None
    within_tolerance:     bool | None = None


class PathHop(BaseModel):
    """One hop in the compliance path validation result."""
    hop:      str          # e.g.  "Invoice → GSTR-1"
    present:  bool
    detail:   str | None = None


class InvoiceDetail(BaseModel):
    """Full invoice detail returned by GET /invoices/{invoice_id}."""
    # Flattened invoice fields from InvoiceResponse
    invoice_id:           str
    invoice_number:       str
    invoice_date:         str
    supplier_gstin:       str
    buyer_gstin:          str
    gstr1_taxable_value:  float | None = None
    pr_taxable_value:     float | None = None
    taxable_value:        float | None = None
    cgst:                 float = 0.0
    sgst:                 float = 0.0
    igst:                 float = 0.0
    total_value:          float
    source_type:          SourceType | None = None
    confidence_score:     float | None = None
    status:               InvoiceStatus = InvoiceStatus.PENDING
    risk_level:           RiskLevel | None = None
    explanation:          str | None = None
    # Detail-specific fields
    value_comparison: ValueComparison | None = None
    path_hops:        list[PathHop] = Field(default_factory=list)
    payments:         list[TaxPaymentResponse] = Field(default_factory=list)
    gstr1:            GSTR1Response | None = None
    gstr2b:           GSTR2BResponse | None = None
    gstr3b:           GSTR3BResponse | None = None
    amends:           str | None = Field(
        default=None,
        description="invoice_id of the invoice this one amends, if any"
    )
    amended_by:       str | None = Field(
        default=None,
        description="invoice_id of the invoice that amends this one, if any"
    )


class InvoiceListItem(BaseModel):
    """Compact invoice row for paginated list endpoints."""
    invoice_id:      str
    invoice_number:  str
    invoice_date:    str
    supplier_gstin:  str
    buyer_gstin:     str
    total_value:     float
    status:          InvoiceStatus = InvoiceStatus.PENDING
    risk_level:      RiskLevel | None = None
    explanation:     str | None = None


class PaginatedInvoices(BaseModel):
    total:    int
    page:     int
    per_page: int
    items:    list[InvoiceListItem]


# ── Vendor profile ───────────────────────────────────────────────────────────

class FilingRecord(BaseModel):
    tax_period:  str
    gstr1_filed: bool = False
    gstr3b_filed: bool = False
    payment_delay_days: float | None = None


class ScoreBreakdown(BaseModel):
    """Granular breakdown used to explain the compliance score."""
    filing_consistency:    float | None = Field(default=None, ge=0.0, le=1.0)
    avg_payment_delay_days: float | None = None
    amendment_rate:        float | None = Field(default=None, ge=0.0, le=1.0)
    value_mismatch_rate:   float | None = Field(default=None, ge=0.0, le=1.0)
    risky_partner_ratio:   float | None = Field(default=None, ge=0.0, le=1.0)
    circular_flag:         bool = False


class VendorListItem(BaseModel):
    """Compact vendor row for GET /vendors."""
    gstin:            str
    state_code:       str | None = None
    registration_status: str | None = None
    compliance_score: float | None = Field(default=None, ge=0.0, le=100.0)
    risk_level:       RiskLevel | None = None
    total_invoices:   int | None = None
    high_risk_count:  int | None = None


class VendorProfile(BaseModel):
    """Full vendor profile for GET /vendors/{gstin}."""
    taxpayer:         TaxpayerResponse
    compliance_score: float | None = Field(default=None, ge=0.0, le=100.0)
    score_breakdown:  ScoreBreakdown | None = None
    filing_history:   list[FilingRecord] = Field(default_factory=list)
    invoices:         list[InvoiceListItem] = Field(default_factory=list)
    pattern_flags:    list[str] = Field(default_factory=list)


# =============================================================================
# 5. Pattern detection
# =============================================================================

class CircularTradeResult(BaseModel):
    """One detected circular trading loop."""
    cycle_id:    str = Field(description="Hash of the GSTIN cycle for deduplication")
    gstins:      list[str] = Field(description="Ordered list of GSTINs forming the loop")
    invoice_ids: list[str] = Field(default_factory=list)
    period:      str | None = None
    risk_level:  RiskLevel = RiskLevel.HIGH


class PaymentDelayResult(BaseModel):
    """Vendor with chronic payment delays."""
    gstin:                  str
    avg_delay_days:         float
    max_delay_days:         float
    affected_invoice_count: int
    risk_level:             RiskLevel


class AmendmentChainResult(BaseModel):
    """Vendor with excessive amendment chains."""
    gstin:               str
    amendment_chains:    int    = Field(description="Number of distinct AMENDS chains")
    max_chain_depth:     int    = Field(description="Deepest single chain length")
    risk_level:          RiskLevel


class RiskNetworkResult(BaseModel):
    """Vendor whose trading network is dominated by high-risk partners."""
    gstin:               str
    total_partners:      int
    risky_partners:      int
    risky_partner_ratio: float = Field(ge=0.0, le=1.0)
    risk_level:          RiskLevel


class PatternSummary(BaseModel):
    """Combined payload for GET /patterns."""
    circular_trades:   list[CircularTradeResult]  = Field(default_factory=list)
    payment_delays:    list[PaymentDelayResult]   = Field(default_factory=list)
    amendment_chains:  list[AmendmentChainResult] = Field(default_factory=list)
    risk_networks:     list[RiskNetworkResult]    = Field(default_factory=list)
    total_patterns:    int = 0

    @model_validator(mode="after")
    def compute_total(self) -> "PatternSummary":
        self.total_patterns = (
            len(self.circular_trades)
            + len(self.payment_delays)
            + len(self.amendment_chains)
            + len(self.risk_networks)
        )
        return self


# =============================================================================
# 6. Graph export (Cytoscape-compatible)
# =============================================================================

class GraphNode(BaseModel):
    """A node in the exported graph."""
    id:         str              # unique node identifier (gstin / invoice_id / return_id)
    label:      str              # node label: Taxpayer / Invoice / GSTR1 / etc.
    properties: dict[str, Any] = Field(default_factory=dict)
    risk_level: RiskLevel | None = None


class GraphEdge(BaseModel):
    """A directed edge in the exported graph."""
    id:         str              # unique edge identifier
    source:     str              # source node id
    target:     str              # target node id
    label:      str              # relationship type: ISSUED_BY / REPORTED_IN / etc.
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphExport(BaseModel):
    """
    Cytoscape-compatible graph payload for GET /graph/export and
    GET /graph/subgraph/{gstin}.
    """
    nodes:       list[GraphNode]
    edges:       list[GraphEdge]
    node_count:  int = 0
    edge_count:  int = 0

    @model_validator(mode="after")
    def compute_counts(self) -> "GraphExport":
        self.node_count = len(self.nodes)
        self.edge_count = len(self.edges)
        return self


# =============================================================================
# 7. Auth
# =============================================================================

class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    expires_in:   int = Field(description="Token lifetime in seconds")


class CurrentUser(BaseModel):
    username: str
    user_id:  str = ""      # Clerk sub (e.g. user_2abc…)
    role:     str = "admin"
