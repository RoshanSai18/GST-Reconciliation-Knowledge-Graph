#!/usr/bin/env python3
"""
Synthetic GST data generator — Knowledge Graph schema (Neo4j).

Produces 11 CSV files:

  Node data
  ---------
  taxpayers.csv                   Taxpayer nodes
  invoices.csv                    Invoice nodes
  gstr1.csv                       GSTR-1 return nodes
  gstr2b.csv                      GSTR-2B auto-draft nodes
  gstr3b.csv                      GSTR-3B summary return nodes
  tax_payments.csv                TaxPayment nodes

  Relationship data (for Neo4j LOAD CSV)
  ----------------------------------------
  taxpayer_invoice_relationship.csv   (seller_gstin, invoice_id, buyer_gstin)
  gstr1_invoice_link.csv              (return_id, invoice_id)
  gstr2b_invoice_link.csv             (return_id, invoice_id)
  gstr3b_itc_link.csv                 (return_id, invoice_id, itc_amount)
  gstr3b_payment_link.csv             (return_id, payment_id)

Usage
-----
  python generator.py                               # defaults (5000 invoices)
  python generator.py --invoices 5000 --seed 42
  python generator.py --taxpayers 100 --invoices 5000 --periods 6 --anomaly-rate 0.20

Anomaly types injected
----------------------
  MISSING_PAYMENT   Invoice has no TaxPayment (broken PAID_VIA path)
  VALUE_MISMATCH    GST amount inconsistent with declared taxable_value
  LATE_FILING       GSTR-1 filing_date pushed past the 11th of following month
  AMENDMENT         Invoice references a prior invoice (amendment chain)
  CIRCULAR_TRADE    Trading loop: A->B->C->A (injected via --cycles)
"""

from __future__ import annotations

import argparse
import random
import string
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

# ---------------------------------------------------------------------------
# Output directory (same folder as this script)
# ---------------------------------------------------------------------------
OUT_DIR = Path(__file__).parent

# ---------------------------------------------------------------------------
# Indian state code -> name mapping
# ---------------------------------------------------------------------------
STATE_MAP: dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "36": "Telangana",
    "37": "Andhra Pradesh",
}
STATE_CODES = list(STATE_MAP.keys())

# ---------------------------------------------------------------------------
# Reference data pools
# ---------------------------------------------------------------------------
GST_RATES = [5, 12, 18, 28]

PAYMENT_MODES = ["NetBanking", "NEFT", "RTGS", "IMPS", "Challan"]

TAXPAYER_TYPES    = ["Regular", "Regular", "Regular", "Composition", "SEZ Unit"]
TAXPAYER_STATUSES = ["Active", "Active", "Active", "Active", "Suspended"]

_WORDS = [
    "Alpha", "Apex", "Bharat", "Blue", "Bright", "Century", "Classic", "Cosmos",
    "Crown", "Crystal", "Delta", "Divine", "Dynamic", "Eagle", "Elite", "Empire",
    "Excel", "Falcon", "Fortune", "Galaxy", "Global", "Gold", "Green", "Horizon",
    "Imperial", "Indus", "Jade", "Lotus", "Lucky", "Metro", "Modern", "National",
    "Nova", "Omega", "Orient", "Pacific", "Pioneer", "Prime", "Pro", "Pure",
    "Radiant", "Rainbow", "Rapid", "Reliable", "Royal", "Ruby", "Safe", "Shree",
    "Silver", "Smart", "Solar", "Star", "Sterling", "Summit", "Sun", "Super",
    "Swift", "Synergy", "Tech", "Tiger", "Titan", "Total", "Trade", "Trans",
    "Trend", "True", "Ultra", "United", "Universal", "Valor", "Vedic", "Velocity",
    "Vision", "Vivid", "Vortex", "Wave", "Zenith", "Zeus",
]
_SUFFIXES = [
    "Pvt Ltd", "Ltd", "Enterprises", "Industries", "Traders",
    "Solutions", "Services", "Corporation", "Co", "Group",
]

BASE_DATE = date(2025, 9, 30)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _uid() -> str:
    return uuid.uuid4().hex[:8].upper()


def _random_alpha(n: int) -> str:
    return "".join(random.choices(string.ascii_uppercase, k=n))


def _random_digits(n: int) -> str:
    return "".join(random.choices(string.digits, k=n))


def _fmt_date(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _period_str(year: int, month: int) -> str:
    """Return YYYY-MM period string, e.g. '2025-03'."""
    return f"{year}-{month:02d}"


def _period_to_date(period: str) -> date:
    """Convert 'YYYY-MM' -> first day of that month."""
    year, month = int(period[:4]), int(period[5:7])
    return date(year, month, 1)


def _next_month_start(d: date, offset: int = 1) -> date:
    month = (d.month - 1 + offset) % 12 + 1
    year  = d.year + (d.month - 1 + offset) // 12
    return date(year, month, 1)


def _random_date_in_period(period: str) -> date:
    start = _period_to_date(period)
    end   = _next_month_start(start) - timedelta(days=1)
    return start + timedelta(days=random.randint(0, (end - start).days))


def _random_company_name() -> tuple[str, str]:
    """Return (legal_name, trade_name)."""
    w1     = random.choice(_WORDS)
    w2     = random.choice(_WORDS)
    suffix = random.choice(_SUFFIXES)
    legal  = f"{w1} {w2} {suffix}"
    trade  = f"{w1} {w2}" if random.random() < 0.6 else legal
    return legal, trade


def _generate_gstin(state_code: str, used: set[str]) -> str:
    """
    Structurally valid 15-char GSTIN:
      SS AAAAA DDDD A N Z C
    """
    for _ in range(10_000):
        gstin = (
            state_code
            + _random_alpha(5)
            + _random_digits(4)
            + _random_alpha(1)
            + str(random.randint(1, 9))
            + "Z"
            + random.choice(string.digits + string.ascii_uppercase)
        )
        if gstin not in used:
            used.add(gstin)
            return gstin
    raise RuntimeError(f"Cannot generate unique GSTIN for state {state_code}")


def _generate_irn() -> str:
    """Synthetic 64-hex IRN."""
    return uuid.uuid4().hex + uuid.uuid4().hex + uuid.uuid4().hex[:32]


# ---------------------------------------------------------------------------
# 1. Taxpayers
# ---------------------------------------------------------------------------

def generate_taxpayers(n: int) -> list[dict[str, Any]]:
    used_gstins: set[str] = set()
    reg_start   = date(2018, 1, 1)
    reg_range   = (date(2023, 12, 31) - reg_start).days
    rows: list[dict] = []
    for _ in range(n):
        sc    = random.choice(STATE_CODES)
        gstin = _generate_gstin(sc, used_gstins)
        legal, trade = _random_company_name()
        reg_date = reg_start + timedelta(days=random.randint(0, reg_range))
        rows.append({
            "gstin":             gstin,
            "legal_name":        legal,
            "trade_name":        trade,
            "state":             STATE_MAP[sc],
            "registration_date": _fmt_date(reg_date),
            "status":            random.choice(TAXPAYER_STATUSES),
            "taxpayer_type":     random.choice(TAXPAYER_TYPES),
            "risk_score":        round(random.uniform(0.0, 1.0), 2),
        })
    return rows


# ---------------------------------------------------------------------------
# 2. Periods
# ---------------------------------------------------------------------------

def generate_periods(n_months: int) -> list[str]:
    """n_months YYYY-MM periods going backwards from BASE_DATE (chronological order)."""
    periods = []
    d = BASE_DATE.replace(day=1)
    for _ in range(n_months):
        periods.append(_period_str(d.year, d.month))
        d = _next_month_start(d, offset=-1)
    return list(reversed(periods))


# ---------------------------------------------------------------------------
# 3. GSTR records (placeholder totals filled later)
# ---------------------------------------------------------------------------

def generate_gstr_records(
    taxpayers: list[dict],
    periods:   list[str],
) -> tuple[
    list[dict], list[dict], list[dict],
    dict[str, dict[str, str]],
    dict[str, dict[str, str]],
    dict[str, dict[str, str]],
]:
    gstr1_rows:  list[dict] = []
    gstr2b_rows: list[dict] = []
    gstr3b_rows: list[dict] = []
    g1_lk:  dict[str, dict[str, str]] = {}
    g2b_lk: dict[str, dict[str, str]] = {}
    g3b_lk: dict[str, dict[str, str]] = {}

    for tp in taxpayers:
        gstin = tp["gstin"]
        g1_lk[gstin]  = {}
        g2b_lk[gstin] = {}
        g3b_lk[gstin] = {}

        for period in periods:
            tag = period.replace("-", "")
            pstart = _period_to_date(period)
            nxt    = _next_month_start(pstart)

            # GSTR-1 (seller — due 11th of following month)
            g1_id = f"R1_{tag}_{gstin[:8]}"
            gstr1_rows.append({
                "return_id":         g1_id,
                "gstin":             gstin,
                "period":            period,
                "filing_date":       _fmt_date(nxt + timedelta(days=10)),
                "status":            "Filed",
                "total_outward_tax": 0.0,
            })
            g1_lk[gstin][period] = g1_id

            # GSTR-2B (buyer — auto-generated 14th)
            g2b_id = f"R2B_{tag}_{gstin[:8]}"
            gstr2b_rows.append({
                "return_id":           g2b_id,
                "gstin":               gstin,
                "period":              period,
                "generated_date":      _fmt_date(nxt + timedelta(days=13)),
                "total_itc_available": 0.0,
            })
            g2b_lk[gstin][period] = g2b_id

            # GSTR-3B (due 20th)
            g3b_id = f"R3B_{tag}_{gstin[:8]}"
            gstr3b_rows.append({
                "return_id":   g3b_id,
                "gstin":       gstin,
                "period":      period,
                "filing_date": _fmt_date(nxt + timedelta(days=19)),
                "output_tax":  0.0,
                "itc_claimed": 0.0,
                "tax_paid":    0.0,
            })
            g3b_lk[gstin][period] = g3b_id

    return gstr1_rows, gstr2b_rows, gstr3b_rows, g1_lk, g2b_lk, g3b_lk


# ---------------------------------------------------------------------------
# 4. Invoices
# ---------------------------------------------------------------------------

def _make_invoice(
    seller:       dict,
    buyer:        dict,
    period:       str,
    anomaly_type: str = "NONE",
    amends_id:    str | None = None,
) -> dict:
    inv_date    = _random_date_in_period(period)
    gst_rate    = random.choice(GST_RATES)
    taxable_val = round(random.uniform(1_000, 5_00_000), 2)

    if anomaly_type == "VALUE_MISMATCH":
        direction   = random.choice([-1, 1])
        deviation   = random.uniform(0.05, 0.20)
        taxable_val = round(taxable_val * (1 + direction * deviation), 2)

    gst_amount  = round(taxable_val * gst_rate / 100, 2)
    total_value = round(taxable_val + gst_amount, 2)

    inv_id = f"INV{_uid()}"
    inv_no = f"AMD-{inv_id[-6:]}" if amends_id else f"INV-{inv_id[-6:]}"

    return {
        "invoice_id":    inv_id,
        "invoice_no":    inv_no,
        "invoice_date":  _fmt_date(inv_date),
        "seller_gstin":  seller["gstin"],
        "buyer_gstin":   buyer["gstin"],
        "taxable_value": taxable_val,
        "gst_rate":      gst_rate,
        "gst_amount":    gst_amount,
        "total_value":   total_value,
        "irn":           _generate_irn(),
        # Internal annotations (stripped before CSV write)
        "_period":       period,
        "_anomaly":      anomaly_type,
        "_amends":       amends_id,
    }


def generate_invoices(
    taxpayers:    list[dict],
    periods:      list[str],
    g1_lk:        dict,
    g2b_lk:       dict,
    g3b_lk:       dict,
    n:            int,
    anomaly_rate: float,
) -> tuple[
    list[dict],   # invoice_rows
    list[dict],   # payment_rows
    list[dict],   # tp_invoice_rel
    list[dict],   # gstr1_invoice_link
    list[dict],   # gstr2b_invoice_link
    list[dict],   # gstr3b_itc_link
    list[dict],   # gstr3b_payment_link
]:
    if len(taxpayers) < 2:
        raise ValueError("Need at least 2 taxpayers.")

    n_anomalies  = int(n * anomaly_rate)
    share        = max(1, n_anomalies // 4)
    anomaly_pool = (
        ["MISSING_PAYMENT"] * share
        + ["VALUE_MISMATCH"] * share
        + ["LATE_FILING"]    * share
        + ["AMENDMENT"]      * share
    )
    random.shuffle(anomaly_pool)

    invoice_rows: list[dict] = []
    payment_rows: list[dict] = []
    tp_inv_rels:  list[dict] = []
    g1_links:     list[dict] = []
    g2b_links:    list[dict] = []
    g3b_itc:      list[dict] = []
    g3b_pay:      list[dict] = []

    for i in range(n):
        anomaly_type = anomaly_pool[i] if i < len(anomaly_pool) else "NONE"
        seller = random.choice(taxpayers)
        buyer  = random.choice([t for t in taxpayers if t["gstin"] != seller["gstin"]])
        period = random.choice(periods)

        amends_id: str | None = None
        if anomaly_type == "AMENDMENT" and invoice_rows:
            # Pick a recent invoice to amend
            amends_id = random.choice(invoice_rows[-min(50, len(invoice_rows)):])["invoice_id"]

        inv = _make_invoice(seller, buyer, period, anomaly_type, amends_id)
        inv_id = inv["invoice_id"]
        invoice_rows.append(inv)

        # Relationship: taxpayer <-> invoice
        tp_inv_rels.append({
            "seller_gstin": seller["gstin"],
            "invoice_id":   inv_id,
            "buyer_gstin":  buyer["gstin"],
        })

        # GSTR-1 link (seller)
        g1_id = g1_lk.get(seller["gstin"], {}).get(period)
        if g1_id:
            g1_links.append({"return_id": g1_id, "invoice_id": inv_id})

        # GSTR-2B link (buyer)
        g2b_id = g2b_lk.get(buyer["gstin"], {}).get(period)
        if g2b_id:
            g2b_links.append({"return_id": g2b_id, "invoice_id": inv_id})

        # GSTR-3B ITC link (buyer)
        g3b_buyer_id = g3b_lk.get(buyer["gstin"], {}).get(period)
        if g3b_buyer_id:
            g3b_itc.append({
                "return_id":  g3b_buyer_id,
                "invoice_id": inv_id,
                "itc_amount": inv["gst_amount"],
            })

        # TaxPayment (skip for MISSING_PAYMENT)
        if anomaly_type != "MISSING_PAYMENT":
            pstart = _period_to_date(period)
            nxt    = _next_month_start(pstart)
            if anomaly_type == "LATE_FILING":
                inv_date_obj = date.fromisoformat(inv["invoice_date"])
                pay_date = inv_date_obj + timedelta(days=random.randint(65, 120))
            else:
                pay_date = nxt + timedelta(days=random.randint(18, 22))

            pay_id       = f"PAY{_uid()}"
            g3b_sell_id  = g3b_lk.get(seller["gstin"], {}).get(period, "")
            payment_rows.append({
                "payment_id":   pay_id,
                "gstin":        seller["gstin"],
                "period":       period,
                "payment_date": _fmt_date(pay_date),
                "amount":       inv["gst_amount"],
                "mode":         random.choice(PAYMENT_MODES),
                "_g3b_ret_id":  g3b_sell_id,
            })
            if g3b_sell_id:
                g3b_pay.append({"return_id": g3b_sell_id, "payment_id": pay_id})

    return invoice_rows, payment_rows, tp_inv_rels, g1_links, g2b_links, g3b_itc, g3b_pay


# ---------------------------------------------------------------------------
# 5. Circular trade injection
# ---------------------------------------------------------------------------

def inject_circular_trades(
    taxpayers: list[dict],
    periods:   list[str],
    g1_lk:     dict,
    g2b_lk:    dict,
    g3b_lk:    dict,
    n_cycles:  int,
) -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict], list[dict], list[dict]]:
    inv_rows: list[dict] = []
    pay_rows: list[dict] = []
    tp_rels:  list[dict] = []
    g1_lnks:  list[dict] = []
    g2b_lnks: list[dict] = []
    g3b_itc:  list[dict] = []
    g3b_pay:  list[dict] = []

    if len(taxpayers) < 3:
        return inv_rows, pay_rows, tp_rels, g1_lnks, g2b_lnks, g3b_itc, g3b_pay

    for _ in range(n_cycles):
        cycle  = random.sample(taxpayers, 3)
        period = random.choice(periods)
        for j in range(3):
            seller = cycle[j]
            buyer  = cycle[(j + 1) % 3]
            inv    = _make_invoice(seller, buyer, period, "CIRCULAR_TRADE")
            inv_id = inv["invoice_id"]
            inv_rows.append(inv)

            tp_rels.append({
                "seller_gstin": seller["gstin"],
                "invoice_id":   inv_id,
                "buyer_gstin":  buyer["gstin"],
            })

            g1_id = g1_lk.get(seller["gstin"], {}).get(period)
            if g1_id:
                g1_lnks.append({"return_id": g1_id, "invoice_id": inv_id})

            g2b_id = g2b_lk.get(buyer["gstin"], {}).get(period)
            if g2b_id:
                g2b_lnks.append({"return_id": g2b_id, "invoice_id": inv_id})

            g3b_buyer_id = g3b_lk.get(buyer["gstin"], {}).get(period)
            if g3b_buyer_id:
                g3b_itc.append({
                    "return_id":  g3b_buyer_id,
                    "invoice_id": inv_id,
                    "itc_amount": inv["gst_amount"],
                })

            pay_id      = f"PAY{_uid()}"
            g3b_sell_id = g3b_lk.get(seller["gstin"], {}).get(period, "")
            nxt         = _next_month_start(_period_to_date(period))
            pay_rows.append({
                "payment_id":   pay_id,
                "gstin":        seller["gstin"],
                "period":       period,
                "payment_date": _fmt_date(nxt + timedelta(days=19)),
                "amount":       inv["gst_amount"],
                "mode":         random.choice(PAYMENT_MODES),
                "_g3b_ret_id":  g3b_sell_id,
            })
            if g3b_sell_id:
                g3b_pay.append({"return_id": g3b_sell_id, "payment_id": pay_id})

    return inv_rows, pay_rows, tp_rels, g1_lnks, g2b_lnks, g3b_itc, g3b_pay


# ---------------------------------------------------------------------------
# 6. Finalize GSTR totals + late-filing patches
# ---------------------------------------------------------------------------

def finalize_gstr_records(
    gstr1_rows:    list[dict],
    gstr2b_rows:   list[dict],
    gstr3b_rows:   list[dict],
    invoice_rows:  list[dict],
    payment_rows:  list[dict],
    g1_links:      list[dict],
    g2b_links:     list[dict],
    g3b_itc_links: list[dict],
) -> None:
    g1_idx  = {r["return_id"]: r for r in gstr1_rows}
    g2b_idx = {r["return_id"]: r for r in gstr2b_rows}
    g3b_idx = {r["return_id"]: r for r in gstr3b_rows}
    inv_lk  = {r["invoice_id"]: r for r in invoice_rows}

    # GSTR-1: total_outward_tax
    for lnk in g1_links:
        rid = lnk["return_id"]
        inv = inv_lk.get(lnk["invoice_id"])
        if inv and rid in g1_idx:
            g1_idx[rid]["total_outward_tax"] = round(
                g1_idx[rid]["total_outward_tax"] + inv["gst_amount"], 2
            )
            # LATE_FILING: push filing_date past 11th
            if inv.get("_anomaly") == "LATE_FILING":
                row    = g1_idx[rid]
                pstart = _period_to_date(row["period"])
                nxt    = _next_month_start(pstart)
                row["filing_date"] = _fmt_date(nxt + timedelta(days=random.randint(20, 45)))

    # GSTR-2B: total_itc_available
    for lnk in g2b_links:
        rid = lnk["return_id"]
        inv = inv_lk.get(lnk["invoice_id"])
        if inv and rid in g2b_idx:
            g2b_idx[rid]["total_itc_available"] = round(
                g2b_idx[rid]["total_itc_available"] + inv["gst_amount"], 2
            )

    # GSTR-3B: itc_claimed from ITC links
    for lnk in g3b_itc_links:
        rid = lnk["return_id"]
        if rid in g3b_idx:
            g3b_idx[rid]["itc_claimed"] = round(
                g3b_idx[rid]["itc_claimed"] + lnk["itc_amount"], 2
            )

    # GSTR-3B: output_tax from payments
    for pay in payment_rows:
        rid = pay.get("_g3b_ret_id", "")
        if rid and rid in g3b_idx:
            g3b_idx[rid]["output_tax"] = round(
                g3b_idx[rid]["output_tax"] + pay["amount"], 2
            )

    # GSTR-3B: tax_paid = max(output_tax - itc_claimed, 0)
    for row in gstr3b_rows:
        row["tax_paid"] = round(max(row["output_tax"] - row["itc_claimed"], 0.0), 2)


# ---------------------------------------------------------------------------
# 7. CSV helpers
# ---------------------------------------------------------------------------

_INTERNAL_COLS = {"_period", "_anomaly", "_amends", "_g3b_ret_id"}

_COLS: dict[str, list[str]] = {
    "taxpayers":    ["gstin", "legal_name", "trade_name", "state",
                     "registration_date", "status", "taxpayer_type", "risk_score"],
    "invoices":     ["invoice_id", "invoice_no", "invoice_date",
                     "seller_gstin", "buyer_gstin", "taxable_value",
                     "gst_rate", "gst_amount", "total_value", "irn"],
    "gstr1":        ["return_id", "gstin", "period",
                     "filing_date", "status", "total_outward_tax"],
    "gstr2b":       ["return_id", "gstin", "period",
                     "generated_date", "total_itc_available"],
    "gstr3b":       ["return_id", "gstin", "period",
                     "filing_date", "output_tax", "itc_claimed", "tax_paid"],
    "tax_payments": ["payment_id", "gstin", "period",
                     "payment_date", "amount", "mode"],
    "taxpayer_invoice_relationship": ["seller_gstin", "invoice_id", "buyer_gstin"],
    "gstr1_invoice_link":            ["return_id", "invoice_id"],
    "gstr2b_invoice_link":           ["return_id", "invoice_id"],
    "gstr3b_itc_link":               ["return_id", "invoice_id", "itc_amount"],
    "gstr3b_payment_link":           ["return_id", "payment_id"],
}


def save_excel(rows: list[dict], name: str) -> Path:
    cleaned = [{k: v for k, v in r.items() if k not in _INTERNAL_COLS} for r in rows]
    df      = pd.DataFrame(cleaned)
    cols    = _COLS.get(name, list(df.columns))
    for c in cols:
        if c not in df.columns:
            df[c] = None
    path = OUT_DIR / f"{name}.xlsx"
    df[cols].to_excel(path, index=False)
    return path


# ---------------------------------------------------------------------------
# 8. Summary
# ---------------------------------------------------------------------------

def print_summary(data: dict[str, list]) -> None:
    from collections import Counter
    print("\n" + "=" * 60)
    print("  Synthetic GST Dataset  --  Generation Summary")
    print("=" * 60)
    for name, rows in data.items():
        print(f"  {name:<42}: {len(rows):>6}")
    anomalies = Counter(r.get("_anomaly", "NONE") for r in data.get("invoices", []))
    print("-" * 60)
    print("  Anomaly breakdown (invoices):")
    for atype, cnt in sorted(anomalies.items()):
        tag = "  (normal)" if atype == "NONE" else "  <injected>"
        print(f"    {atype:<24}: {cnt:>5}{tag}")
    print("=" * 60)
    print(f"  Output : {OUT_DIR.resolve()}")
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic GST Knowledge Graph data (CSV).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--taxpayers",    type=int,   default=100,  help="Taxpayer nodes")
    parser.add_argument("--invoices",     type=int,   default=5000, help="Invoice nodes")
    parser.add_argument("--anomaly-rate", type=float, default=0.20, help="Fraction of anomalous invoices")
    parser.add_argument("--periods",      type=int,   default=6,    help="Monthly tax periods")
    parser.add_argument("--cycles",       type=int,   default=60,   help="Circular trade cycles")
    parser.add_argument("--seed",         type=int,   default=42,   help="Random seed")
    args = parser.parse_args()

    if not (0.0 <= args.anomaly_rate <= 1.0):
        parser.error("--anomaly-rate must be between 0.0 and 1.0")
    if args.taxpayers < 3:
        parser.error("--taxpayers must be >= 3")

    random.seed(args.seed)
    print(f"Generating : {args.taxpayers} taxpayers | {args.invoices} invoices | "
          f"{args.anomaly_rate:.0%} anomaly rate | {args.periods} periods | seed={args.seed}")

    taxpayers = generate_taxpayers(args.taxpayers)
    periods   = generate_periods(args.periods)
    print(f"Periods    : {', '.join(periods)}")

    gstr1_rows, gstr2b_rows, gstr3b_rows, g1_lk, g2b_lk, g3b_lk = generate_gstr_records(
        taxpayers, periods
    )

    (inv_rows, pay_rows,
     tp_rels, g1_lnks, g2b_lnks,
     g3b_itc_lnks, g3b_pay_lnks) = generate_invoices(
        taxpayers, periods, g1_lk, g2b_lk, g3b_lk,
        n=args.invoices,
        anomaly_rate=args.anomaly_rate,
    )

    (ct_inv, ct_pay, ct_tp,
     ct_g1, ct_g2b, ct_itc, ct_g3bp) = inject_circular_trades(
        taxpayers, periods, g1_lk, g2b_lk, g3b_lk, n_cycles=args.cycles
    )
    inv_rows.extend(ct_inv)
    pay_rows.extend(ct_pay)
    tp_rels.extend(ct_tp)
    g1_lnks.extend(ct_g1)
    g2b_lnks.extend(ct_g2b)
    g3b_itc_lnks.extend(ct_itc)
    g3b_pay_lnks.extend(ct_g3bp)

    finalize_gstr_records(
        gstr1_rows, gstr2b_rows, gstr3b_rows,
        inv_rows, pay_rows,
        g1_lnks, g2b_lnks, g3b_itc_lnks,
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    save_excel(taxpayers,    "taxpayers")
    save_excel(inv_rows,     "invoices")
    save_excel(gstr1_rows,   "gstr1")
    save_excel(gstr2b_rows,  "gstr2b")
    save_excel(gstr3b_rows,  "gstr3b")
    save_excel(pay_rows,     "tax_payments")
    save_excel(tp_rels,      "taxpayer_invoice_relationship")
    save_excel(g1_lnks,      "gstr1_invoice_link")
    save_excel(g2b_lnks,     "gstr2b_invoice_link")
    save_excel(g3b_itc_lnks, "gstr3b_itc_link")
    save_excel(g3b_pay_lnks, "gstr3b_payment_link")

    print_summary({
        "taxpayers":                     taxpayers,
        "invoices":                      inv_rows,
        "gstr1":                         gstr1_rows,
        "gstr2b":                        gstr2b_rows,
        "gstr3b":                        gstr3b_rows,
        "tax_payments":                  pay_rows,
        "taxpayer_invoice_relationship": tp_rels,
        "gstr1_invoice_link":            g1_lnks,
        "gstr2b_invoice_link":           g2b_lnks,
        "gstr3b_itc_link":               g3b_itc_lnks,
        "gstr3b_payment_link":           g3b_pay_lnks,
    })


if __name__ == "__main__":
    main()
