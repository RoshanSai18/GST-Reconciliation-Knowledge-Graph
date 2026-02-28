"""
routers/graph.py — Cytoscape-compatible subgraph & stats endpoints.

GET /graph/subgraph/{gstin}?depth=2   → GraphExport
GET /graph/stats                       → overall graph node/edge counts
"""

from __future__ import annotations

import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from database.neo4j_client import run_query
from models.schemas import CurrentUser, GraphEdge, GraphExport, GraphNode, RiskLevel
from routers.auth import require_jwt

logger = logging.getLogger(__name__)
router = APIRouter()

_AuthDep = Annotated[CurrentUser, Depends(require_jwt)]


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

# Depth-1: per-row pattern — each (invoice, gstr1, gstr2b, payment, gstr3b) combination
# is its own row so Python can correctly associate each linked node with its invoice.
_SUBGRAPH_D1 = """
MATCH (t:Taxpayer {gstin: $gstin, user_id: $uid})
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
OPTIONAL MATCH (i)-[:REPORTED_IN]->(g1:GSTR1)
OPTIONAL MATCH (i)-[:REFLECTED_IN]->(g2b:GSTR2B)
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
OPTIONAL MATCH (p)-[:SETTLED_IN]->(g3b:GSTR3B)
RETURN t, i, g1, g2b, p, g3b
"""

# Depth-2: also pull counterparty (buyer) Taxpayer nodes
_SUBGRAPH_D2 = """
MATCH (t:Taxpayer {gstin: $gstin, user_id: $uid})
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
OPTIONAL MATCH (i)-[:REPORTED_IN]->(g1:GSTR1)
OPTIONAL MATCH (i)-[:REFLECTED_IN]->(g2b:GSTR2B)
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
OPTIONAL MATCH (p)-[:SETTLED_IN]->(g3b:GSTR3B)
OPTIONAL MATCH (buyer:Taxpayer {gstin: i.buyer_gstin, user_id: $uid})
RETURN t, i, g1, g2b, p, g3b, buyer
"""


@router.get(
    "/subgraph/{gstin}",
    summary="Taxpayer Subgraph",
    response_model=GraphExport,
)
def taxpayer_subgraph(
    gstin: str,
    current_user: _AuthDep,
    depth: int = Query(1, ge=1, le=2, description="Traversal depth: 1 = invoices only, 2 = buyer nodes too"),
) -> GraphExport:
    """Export a Cytoscape-compatible subgraph centred on a GSTIN."""
    gstin = gstin.upper()
    query = _SUBGRAPH_D2 if depth >= 2 else _SUBGRAPH_D1

    try:
        rows = run_query(query, {"gstin": gstin, "uid": current_user.user_id})
    except Exception as exc:
        logger.error("Subgraph query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database query failed")

    if not rows:
        raise HTTPException(status_code=404, detail=f"GSTIN {gstin} not found")

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

    # ── Root taxpayer (from first row) ────────────────────────────────────
    tp = dict(rows[0]["t"])
    _add_node(gstin, "Taxpayer", tp, _risk(tp.get("risk_level")))

    # ── Iterate over per-row results ──────────────────────────────────────
    for row in rows:
        inv_node = row.get("i")
        if not inv_node:
            continue
        inv = dict(inv_node)
        iid = inv.get("invoice_id")
        if not iid:
            continue
        _add_node(iid, "Invoice", inv, _risk(inv.get("risk_level")))
        _add_edge(iid, gstin, "ISSUED_BY")

        # GSTR1
        if row.get("g1"):
            g1 = dict(row["g1"])
            gid = g1.get("return_id")
            if gid:
                _add_node(gid, "GSTR1", g1)
                _add_edge(iid, gid, "REPORTED_IN")

        # GSTR2B
        if row.get("g2b"):
            g2b = dict(row["g2b"])
            g2bid = g2b.get("return_id")
            if g2bid:
                _add_node(g2bid, "GSTR2B", g2b)
                _add_edge(iid, g2bid, "REFLECTED_IN")

        # TaxPayment → GSTR3B
        if row.get("p"):
            pay = dict(row["p"])
            pid = pay.get("payment_id")
            if pid:
                _add_node(pid, "TaxPayment", pay)
                _add_edge(iid, pid, "PAID_VIA")
                if row.get("g3b"):
                    g3b = dict(row["g3b"])
                    g3bid = g3b.get("return_id")
                    if g3bid:
                        _add_node(g3bid, "GSTR3B", g3b)
                        _add_edge(pid, g3bid, "SETTLED_IN")

        # Buyer Taxpayer (depth=2 only)
        if row.get("buyer"):
            b = dict(row["buyer"])
            bid = b.get("gstin")
            if bid and bid != gstin:
                _add_node(bid, "Taxpayer", b, _risk(b.get("risk_level")))
                _add_edge(iid, bid, "RECEIVED_BY")

    return GraphExport(nodes=nodes, edges=edges)


# ---------------------------------------------------------------------------
# GET /graph/overview
# ---------------------------------------------------------------------------

# Overview: per-row like subgraph so all node types appear.
# Each taxpayer is limited to 3 invoices to keep the graph readable.
_OVERVIEW_QUERY = """
MATCH (t:Taxpayer {user_id: $uid})
WITH t ORDER BY t.gstin LIMIT $limit
OPTIONAL MATCH (i:Invoice)-[:ISSUED_BY]->(t)
WITH t, collect(i)[0..3] AS invList
UNWIND (CASE WHEN size(invList) > 0 THEN invList ELSE [null] END) AS i
OPTIONAL MATCH (i)-[:REPORTED_IN]->(g1:GSTR1)
OPTIONAL MATCH (i)-[:REFLECTED_IN]->(g2b:GSTR2B)
OPTIONAL MATCH (i)-[:PAID_VIA]->(p:TaxPayment)
OPTIONAL MATCH (p)-[:SETTLED_IN]->(g3b:GSTR3B)
RETURN t, i, g1, g2b, p, g3b
"""


@router.get(
    "/overview",
    summary="Full Graph Overview",
    response_model=GraphExport,
)
def graph_overview(
    current_user: _AuthDep,
    limit: int = Query(30, ge=5, le=100, description="Max taxpayer nodes to include"),
) -> GraphExport:
    """Return a sampled overview of the full knowledge graph (up to `limit` taxpayers + their data)."""
    try:
        rows = run_query(_OVERVIEW_QUERY, {"limit": limit, "uid": current_user.user_id})
    except Exception as exc:
        logger.error("Overview query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database query failed")

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    seen_nodes: set[str] = set()
    seen_edges: set[str] = set()

    def _add_node(nid: str, label: str, props: dict, risk=None) -> None:
        if nid and nid not in seen_nodes:
            seen_nodes.add(nid)
            nodes.append(GraphNode(id=nid, label=label, properties=props, risk_level=risk))

    def _add_edge(src: str, tgt: str, rel: str) -> None:
        eid = _edge_id(src, tgt, rel)
        if src and tgt and eid not in seen_edges:
            seen_edges.add(eid)
            edges.append(GraphEdge(id=eid, source=src, target=tgt, label=rel, properties={}))

    for row in (rows or []):
        # Taxpayer node
        tp = dict(row["t"])
        gstin_ov = tp.get("gstin")
        if not gstin_ov:
            continue
        _add_node(gstin_ov, "Taxpayer", tp, _risk(tp.get("risk_level")))

        inv_node = row.get("i")
        if not inv_node:
            continue
        inv = dict(inv_node)
        iid = inv.get("invoice_id")
        if not iid:
            continue
        _add_node(iid, "Invoice", inv, _risk(inv.get("risk_level")))
        _add_edge(iid, gstin_ov, "ISSUED_BY")

        # Buyer cross-link (if buyer taxpayer already in graph)
        buyer_gstin = inv.get("buyer_gstin")
        if buyer_gstin and buyer_gstin in seen_nodes:
            _add_edge(iid, buyer_gstin, "RECEIVED_BY")

        # GSTR1
        if row.get("g1"):
            g1 = dict(row["g1"])
            gid = g1.get("return_id")
            if gid:
                _add_node(gid, "GSTR1", g1)
                _add_edge(iid, gid, "REPORTED_IN")

        # GSTR2B
        if row.get("g2b"):
            g2b = dict(row["g2b"])
            g2bid = g2b.get("return_id")
            if g2bid:
                _add_node(g2bid, "GSTR2B", g2b)
                _add_edge(iid, g2bid, "REFLECTED_IN")

        # TaxPayment → GSTR3B
        if row.get("p"):
            pay = dict(row["p"])
            pid = pay.get("payment_id")
            if pid:
                _add_node(pid, "TaxPayment", pay)
                _add_edge(iid, pid, "PAID_VIA")
                if row.get("g3b"):
                    g3b = dict(row["g3b"])
                    g3bid = g3b.get("return_id")
                    if g3bid:
                        _add_node(g3bid, "GSTR3B", g3b)
                        _add_edge(pid, g3bid, "SETTLED_IN")

    return GraphExport(nodes=nodes, edges=edges)


# ---------------------------------------------------------------------------
# GET /graph/stats
# ---------------------------------------------------------------------------

_STATS_QUERY = """
MATCH (n {user_id: $uid})
WITH labels(n)[0] AS label, count(n) AS cnt
RETURN label, cnt
ORDER BY cnt DESC
"""

_REL_STATS_QUERY = """
MATCH (n {user_id: $uid})-[r]->()
WITH type(r) AS rel, count(r) AS cnt
RETURN rel, cnt
ORDER BY cnt DESC
"""


@router.get(
    "/stats",
    summary="Graph Statistics",
)
def graph_stats(current_user: _AuthDep) -> dict:
    """Return node and relationship counts for the current user's graph."""
    try:
        node_rows = run_query(_STATS_QUERY, {"uid": current_user.user_id})
        rel_rows  = run_query(_REL_STATS_QUERY, {"uid": current_user.user_id})
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
