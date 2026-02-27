import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, ZoomIn, ZoomOut, Maximize2, RefreshCw, ArrowLeft } from 'lucide-react'
import { graphApi, type CyGraph, type CyNode, type CyEdge } from '@/lib/api'

/* ---------- Color map ---------- */
const TYPE_COLORS: Record<string, string> = {
  Taxpayer:   '#4F46E5',
  Invoice:    '#D97706',
  GSTR1:      '#059669',
  GSTR2B:     '#7C3AED',
  GSTR3B:     '#0891B2',
  TaxPayment: '#0284C7',
}
function nodeColor(n: CyNode) {
  if (n.data.risk_level === 'High-Risk') return '#EF4444'
  return TYPE_COLORS[n.data.type] ?? '#94A3B8'
}

/* ---------- Force layout ---------- */
function layoutNodes(nodes: CyNode[], edges: CyEdge[], w: number, h: number) {
  const pos: Record<string, { x: number; y: number }> = {}
  // Group by type for better initial placement
  const groups: Record<string, CyNode[]> = {}
  for (const n of nodes) {
    const t = n.data.type || 'other'
    ;(groups[t] ||= []).push(n)
  }
  const types = Object.keys(groups)
  let idx = 0
  for (const type of types) {
    const nodesInGroup = groups[type]
    const gAngle = (types.indexOf(type) / Math.max(types.length, 1)) * 2 * Math.PI
    const gx = w / 2 + Math.min(w, h) * 0.3 * Math.cos(gAngle)
    const gy = h / 2 + Math.min(w, h) * 0.3 * Math.sin(gAngle)
    nodesInGroup.forEach((n, i) => {
      const a = (i / Math.max(nodesInGroup.length, 1)) * 2 * Math.PI
      const r = Math.min(w, h) * 0.12
      pos[n.data.id] = { x: gx + r * Math.cos(a), y: gy + r * Math.sin(a) }
    })
    idx++
  }
  // Force iterations
  for (let iter = 0; iter < 60; iter++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos[nodes[i].data.id], b = pos[nodes[j].data.id]
        const dx = a.x - b.x, dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 2200 / (dist * dist)
        a.x += force * dx / dist; a.y += force * dy / dist
        b.x -= force * dx / dist; b.y -= force * dy / dist
      }
    }
    // Attraction along edges
    for (const e of edges) {
      const a = pos[e.data.source], b = pos[e.data.target]
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const mul = 0.012
      a.x += mul * dx; a.y += mul * dy
      b.x -= mul * dx; b.y -= mul * dy
    }
    // Clamp to canvas
    for (const n of nodes) {
      const p = pos[n.data.id]
      p.x = Math.max(30, Math.min(w - 30, p.x))
      p.y = Math.max(30, Math.min(h - 30, p.y))
    }
  }
  return pos
}

const W = 920, H = 580

export default function GraphPage() {
  const [gstin,    setGstin]   = useState('')
  const [depth,    setDepth]   = useState<1 | 2>(1)
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState<string | null>(null)
  const [graph,    setGraph]   = useState<CyGraph | null>(null)
  const [mode,     setMode]    = useState<'overview' | 'subgraph'>('overview')
  const [hover,    setHover]   = useState<CyNode | null>(null)
  const [hoverType, setHoverType] = useState<string | null>(null)
  const [zoom,     setZoom]    = useState(1)
  const [pan,      setPan]     = useState({ x: 0, y: 0 })
  const [dragging, setDragging]= useState(false)
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const svgRef    = useRef<SVGSVGElement>(null)
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({})

  // Re-layout when graph changes
  useEffect(() => {
    if (!graph) return
    setPos(layoutNodes(graph.nodes, graph.edges, W, H))
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [graph])

  // Auto-load overview on mount
  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const r = await graphApi.overview(40)
      setGraph(r.data)
      setMode('overview')
    } catch {
      setGraph(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview])

  // Auto-reload subgraph when depth changes
  useEffect(() => {
    if (mode === 'subgraph' && gstin.trim()) {
      setLoading(true)
      const g = gstin.toUpperCase()
      graphApi.subgraph(g, depth)
        .then(r => setGraph(r.data))
        .catch(() => setGraph(null))
        .finally(() => setLoading(false))
    }
  }, [depth, mode, gstin])

  async function handleVisualize(targetGstin?: string) {
    const g = (targetGstin ?? gstin).trim().toUpperCase()
    if (!g) {
      setError('Please enter a GSTIN to search')
      return
    }
    setGstin(g)
    setError(null)
    setLoading(true)
    console.log(`[Graph] Searching: GSTIN="${g}", Depth=${depth}`)
    try {
      const r = await graphApi.subgraph(g, depth)
      console.log(`[Graph] Response:`, r.data)
      if (r.data && r.data.node_count > 0) {
        console.log(`[Graph] Success: ${r.data.node_count} nodes, ${r.data.edge_count} edges`)
        setGraph(r.data)
        setMode('subgraph')
        setError(null)
      } else {
        console.log(`[Graph] No results for "${g}" at depth ${depth}`)
        setError(`No results found for "${g}" at depth ${depth}`)
        setGraph(null)
      }
    } catch (err: any) {
      console.error(`[Graph] API Error:`, err)
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load graph'
      setError(`Error: ${msg}`)
      setGraph(null)
    } finally {
      setLoading(false)
    }
  }

  function handleNodeClick(n: CyNode) {
    if (n.data.type === 'Taxpayer' && n.data.id) {
      handleVisualize(n.data.id as string)
    }
  }

  // Pan logic
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as SVGElement).closest('g[data-node]')) return
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    setDragging(true)
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragStart.current) return
    setPan({
      x: dragStart.current.px + e.clientX - dragStart.current.mx,
      y: dragStart.current.py + e.clientY - dragStart.current.my,
    })
  }
  function onMouseUp() { dragStart.current = null; setDragging(false) }

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Back to overview */}
        {mode === 'subgraph' && (
          <button
            onClick={loadOverview}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:text-accent-h transition-colors"
          >
            <ArrowLeft size={13} /> Overview
          </button>
        )}

        {/* GSTIN search */}
        <div className="relative min-w-60">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Search GSTIN…"
            value={gstin}
            onChange={e => {
              setGstin(e.target.value.toUpperCase())
              setError(null)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleVisualize()
              }
            }}
            className={`w-full bg-surface rounded-xl pl-8 pr-3 py-2 text-sm placeholder:text-subtle focus:outline-none focus:ring-2 transition-all ${
              error ? 'focus:ring-danger/25' : 'focus:ring-accent/25'
            }`}
            style={{ border: error ? '1px solid #ef4444' : '1px solid #E4E4E7' }}
          />
        </div>

        {/* Depth toggle */}
        <div className="flex rounded-xl overflow-hidden text-sm shadow-card">
          {([1, 2] as const).map(d => (
            <button
              key={d}
              onClick={() => setDepth(d)}
              className={`px-4 py-2 font-medium transition-colors ${depth === d ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-foreground'}`}
            >
              Depth {d}
            </button>
          ))}
        </div>

        <button
          onClick={() => handleVisualize()}
          disabled={!gstin.trim() || loading}
          className="bg-accent hover:bg-accent-h disabled:opacity-40 text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-all shadow-glow"
        >
          {loading ? 'Loading…' : '🔍 Visualize'}
        </button>

        <button
          onClick={loadOverview}
          disabled={loading}
          title="Reload overview"
          className="p-2 rounded-xl bg-surface shadow-card text-muted hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>

        {error && (
          <div className="ml-auto flex items-center gap-2 text-xs text-danger bg-danger/8 border border-danger/25 rounded-lg px-3 py-1.5">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
        {!error && graph && (
          <span className="text-xs text-muted ml-auto">
            {mode === 'overview'
              ? <span className="font-semibold text-accent">Overview</span>
              : <span className="font-semibold text-accent">{gstin}</span>
            }
            {' '}· {graph.node_count} nodes · {graph.edge_count} edges
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(TYPE_COLORS).map(([t, c]) => (
          <div
            key={t}
            onMouseEnter={() => setHoverType(t)}
            onMouseLeave={() => setHoverType(null)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
              hoverType === t ? 'bg-accent/15 text-accent font-medium' : 'text-muted hover:text-foreground'
            }`}
          >
            <div className="w-3 h-3 rounded-full" style={{ background: c }} />
            {t}
          </div>
        ))}
        <div
          onMouseEnter={() => setHoverType('High-Risk')}
          onMouseLeave={() => setHoverType(null)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
            hoverType === 'High-Risk' ? 'bg-danger/15 text-danger font-medium' : 'text-muted hover:text-foreground'
          }`}
        >
          <div className="w-3 h-3 rounded-full bg-danger" />
          High-Risk
        </div>
        {mode === 'overview' && (
          <span className="text-[10px] text-subtle ml-auto">Click a Taxpayer node to drill in</span>
        )}
      </div>

      {/* Canvas */}
      <div
        className="bg-surface rounded-2xl overflow-hidden relative graph-canvas shadow-card"
        style={{ height: H, cursor: dragging ? 'grabbing' : 'grab' }}
      >
        {/* Zoom + pan controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
          {[
            { icon: <ZoomIn  size={14} />, action: () => setZoom(z => Math.min(z + 0.2, 4)) },
            { icon: <ZoomOut size={14} />, action: () => setZoom(z => Math.max(z - 0.2, 0.2)) },
            { icon: <Maximize2 size={14} />, action: () => { setZoom(1); setPan({ x: 0, y: 0 }) } },
          ].map((b, i) => (
            <button key={i} onClick={b.action}
              className="bg-surface rounded-lg p-1.5 text-muted hover:text-foreground shadow-card transition-colors">
              {b.icon}
            </button>
          ))}
        </div>

        {/* Mode badge */}
        {graph && !loading && (
          <div className="absolute top-3 left-3 z-10">
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
              mode === 'overview'
                ? 'bg-accent-lt text-accent'
                : 'bg-[#FFF7ED] text-amber-600'
            }`}>
              {mode === 'overview' ? 'Full Overview' : `Subgraph: ${gstin}`}
            </span>
          </div>
        )}

        {/* Empty / loading states */}
        {!graph && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted text-sm">
            <div className="text-4xl">🕸️</div>
            <p>No data yet. Upload files first, then the graph will appear here.</p>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted text-sm">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full" />
            {mode === 'overview' ? 'Loading graph overview…' : 'Building subgraph…'}
          </div>
        )}

        {/* SVG graph */}
        {graph && !loading && (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${W} ${H}`}
            style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: 'center center', transition: dragging ? 'none' : 'transform 0.15s' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* Edges */}
            {graph.edges.map(e => {
              const a = pos[e.data.source], b = pos[e.data.target]
              if (!a || !b) return null
              const isAlert = e.data.risk_level === 'High-Risk'
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
              return (
                <g key={e.data.id}>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={isAlert ? '#B91C1C' : '#D4D4D8'}
                    strokeWidth={isAlert ? 1.5 : 1}
                    strokeDasharray={isAlert ? '5 3' : undefined}
                    opacity={0.6}
                  />
                  <text x={mx} y={my - 4} fill="#94A3B8" fontSize={8} textAnchor="middle">{e.data.rel}</text>
                </g>
              )
            })}

            {/* Nodes */}
            {graph.nodes.map(n => {
              const p = pos[n.data.id]
              if (!p) return null
              const color = nodeColor(n)
              const isAlert = n.data.risk_level === 'High-Risk'
              const isTaxpayer = n.data.type === 'Taxpayer'
              const isHovered = hover?.data.id === n.data.id
              const isTypeHighlighted = hoverType && (hoverType === n.data.type || (hoverType === 'High-Risk' && isAlert))
              return (
                <g
                  key={n.data.id}
                  data-node="1"
                  transform={`translate(${p.x},${p.y})`}
                  style={{
                    cursor: isTaxpayer ? 'pointer' : 'default',
                    opacity: hoverType && !isTypeHighlighted ? 0.2 : 1,
                    transition: 'opacity 0.2s'
                  }}
                  onClick={() => handleNodeClick(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(null)}
                >
                  {isAlert && (
                    <>
                      <circle r={18} fill={color} opacity={0.15} className="animate-ping" style={{ animationDuration: '2s' }} />
                      <circle r={22} stroke={color} strokeWidth={1} fill="none" opacity={0.3} />
                    </>
                  )}
                  {isTaxpayer && (
                    <circle r={17} fill={color} opacity={0.12} />
                  )}
                  <circle r={13} fill={color} opacity={0.92} stroke="#1E293B" strokeWidth={1.5} />
                  <text fill="#fff" fontSize={9} textAnchor="middle" dominantBaseline="central" fontWeight="700">
                    {n.data.type[0]}
                  </text>
                  <text fill="#94A3B8" fontSize={8} textAnchor="middle" y={22}>
                    {String(n.data.label ?? n.data.id).slice(0, 15)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}

        {/* Tooltip */}
        {hover && (
          <div className="absolute bottom-4 left-4 bg-surface rounded-2xl p-4 text-xs max-w-xs shadow-card-lg animate-fade-in pointer-events-none z-20">
            <p className="font-bold text-foreground mb-2">
              <span className="text-accent">{hover.data.type}</span>
              {' · '}{String(hover.data.label ?? hover.data.id)}
            </p>
            {hover.data.type === 'Taxpayer' && (
              <p className="text-[10px] text-accent mb-2">Click to explore subgraph →</p>
            )}
            {Object.entries(hover.data)
              .filter(([k]) => !['id', 'label', 'type'].includes(k) && hover.data[k] != null)
              .slice(0, 7)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 mb-1">
                  <span className="label-cap">{k.replace(/_/g, ' ')}</span>
                  <span className="text-foreground font-mono font-medium truncate max-w-32">{String(v)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

