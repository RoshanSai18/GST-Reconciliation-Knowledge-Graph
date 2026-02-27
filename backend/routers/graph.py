"""
routers/graph.py — Cytoscape-compatible subgraph & stats endpoints.

GET /graph/subgraph/{gstin}?depth=2   → GraphExport
GET /graph/stats                       → overall graph node/edge counts
"""

from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, HTTPException, Query

from database.neo4j_client import run_query
from models.schemas import GraphEdge, GraphExport, GraphNode, RiskLevel

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _edge_id(src: str, tgt: str, rel: str) -> str:
    return hashlib.md5(f"{src}|{rel}|{tgt}".encode()).hexdigest()[:12]


def _risk(val) -> RiskLevel | None:
    if val is None:
        return None
    try:
        return RiskLevel(str(val))
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# GET /graph/subgraph/{gstin}
# ---------------------------------------------------------------------------

# Depth-1: taxpayer + its invoices + related GSTR-1/3B/payments (1 hop)
_SUBGRAPH_D1 = """
MATCH (t:Taxpayer {gstin: $gstin})
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
OPTIONAL MATCH (i)-[:REPORTED_IN]->(g1:GSTR1)
OPTIONAL MATCH (i)-[:DECLARED_IN]->(g3b:GSTR3B)
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
RETURN t, collect(DISTINCT i) AS invoices,
       collect(DISTINCT g1)   AS gstr1s,
       collect(DISTINCT g3b)  AS gstr3bs,
       collect(DISTINCT p)    AS payments
"""

# Depth-2: also pull counterparty taxpayers connected to those invoices
_SUBGRAPH_D2 = """
MATCH (t:Taxpayer {gstin: $gstin})
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
OPTIONAL MATCH (i)-[:REPORTED_IN]->(g1:GSTR1)
OPTIONAL MATCH (i)-[:DECLARED_IN]->(g3b:GSTR3B)
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
OPTIONAL MATCH (buyer:Taxpayer {gstin: i.buyer_gstin})
RETURN t, collect(DISTINCT i) AS invoices,
       collect(DISTINCT g1)   AS gstr1s,
       collect(DISTINCT g3b)  AS gstr3bs,
       collect(DISTINCT p)    AS payments,
       collect(DISTINCT buyer) AS buyers
"""


@router.get(
    "/subgraph/{gstin}",
    summary="Taxpayer Subgraph",
    response_model=GraphExport,
)
def taxpayer_subgraph(
    gstin: str,
    depth: int = Query(1, ge=1, le=2, description="Traversal depth: 1 = invoices only, 2 = buyer nodes too"),
) -> GraphExport:
    """Export a Cytoscape-compatible subgraph centred on a GSTIN."""
    gstin = gstin.upper()
    query = _SUBGRAPH_D2 if depth >= 2 else _SUBGRAPH_D1

    try:
        rows = run_query(query, {"gstin": gstin})
    except Exception as exc:
        logger.error("Subgraph query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database query failed")

    if not rows:
        raise HTTPException(status_code=404, detail=f"GSTIN {gstin} not found")

    row = rows[0]
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    seen_nodes: set[str]   = set()
    seen_edges: set[str]   = set()

    def _add_node(nid: str, label: str, props: dict, risk=None) -> None:
        if nid and nid not in seen_nodes:
            seen_nodes.add(nid)
            nodes.append(GraphNode(id=nid, label=label,
                                   properties=props, risk_level=risk))

    def _add_edge(src: str, tgt: str, rel: str, props: dict | None = None) -> None:
        eid = _edge_id(src, tgt, rel)
        if src and tgt and eid not in seen_edges:
            seen_edges.add(eid)
            edges.append(GraphEdge(id=eid, source=src, target=tgt,
                                   label=rel, properties=props or {}))

    # ── Root taxpayer ─────────────────────────────────────────────────────
    tp = dict(row["t"])
    _add_node(gstin, "Taxpayer", tp, _risk(tp.get("risk_level")))

    # ── Invoices ──────────────────────────────────────────────────────────
    for inv_node in (row.get("invoices") or []):
        if not inv_node:
            continue
        inv = dict(inv_node)
        iid = inv.get("invoice_id")
        if not iid:
            continue
        _add_node(iid, "Invoice", inv, _risk(inv.get("risk_level")))
        _add_edge(iid, gstin, "ISSUED_BY")

        # GSTR-1 links
        for g1_node in (row.get("gstr1s") or []):
            if not g1_node:
                continue
            g1 = dict(g1_node)
            gid = g1.get("return_id")
            if gid:
                _add_node(gid, "GSTR1", g1)
                _add_edge(iid, gid, "REPORTED_IN")

        # GSTR-3B links
        for g3b_node in (row.get("gstr3bs") or []):
            if not g3b_node:
                continue
            g3 = dict(g3b_node)
            g3id = g3.get("return_id")
            if g3id:
                _add_node(g3id, "GSTR3B", g3)
                _add_edge(iid, g3id, "DECLARED_IN")

        # Payment links
        for pay_node in (row.get("payments") or []):
            if not pay_node:
                continue
            pay = dict(pay_node)
            pid = pay.get("payment_id")
            if pid:
                _add_node(pid, "TaxPayment", pay)
                _add_edge(iid, pid, "PAID_VIA")

    # ── Buyer taxpayer nodes (depth = 2) ──────────────────────────────────
    for buyer_node in (row.get("buyers") or []):
        if not buyer_node:
            continue
        b = dict(buyer_node)
        bid = b.get("gstin")
        if bid and bid != gstin:
            _add_node(bid, "Taxpayer", b, _risk(b.get("risk_level")))
            # add BUYER edges from invoices that link to this buyer
            for inv_node in (row.get("invoices") or []):
                if not inv_node:
                    continue
                inv = dict(inv_node)
                if inv.get("buyer_gstin") == bid and inv.get("invoice_id"):
                    _add_edge(inv["invoice_id"], bid, "BUYER")

    return GraphExport(nodes=nodes, edges=edges)


# ---------------------------------------------------------------------------
# GET /graph/stats
# ---------------------------------------------------------------------------

_STATS_QUERY = """
MATCH (n)
WITH labels(n)[0] AS label, count(n) AS cnt
RETURN label, cnt
ORDER BY cnt DESC
"""

_REL_STATS_QUERY = """
MATCH ()-[r]->()
WITH type(r) AS rel, count(r) AS cnt
RETURN rel, cnt
ORDER BY cnt DESC
"""


@router.get(
    "/stats",
    summary="Graph Statistics",
)
def graph_stats() -> dict:
    """Return node and relationship counts for the entire graph."""
    try:
        node_rows = run_query(_STATS_QUERY)
        rel_rows  = run_query(_REL_STATS_QUERY)
    except Exception as exc:
        logger.error("Stats query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database query failed")

    node_counts = {r["label"]: int(r["cnt"]) for r in (node_rows or []) if r.get("label")}
    rel_counts  = {r["rel"]:   int(r["cnt"]) for r in (rel_rows  or []) if r.get("rel")}

    return {
        "nodes": node_counts,
        "relationships": rel_counts,
        "total_nodes": sum(node_counts.values()),
        "total_relationships": sum(rel_counts.values()),
    }
