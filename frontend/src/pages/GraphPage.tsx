import { useState, useRef, useEffect } from 'react'
import { Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { graphApi } from '@/lib/api'

/* ---------- Types ---------- */
interface GraphNode {
  data: {
    id:    string
    label: string
    type:  string
    gstin?: string
    return_id?: string
    invoice_id?: string
    risk_level?: string
    compliance_score?: number
    [k: string]: unknown
  }
}
interface GraphEdge {
  data: { id: string; source: string; target: string; rel: string; risk_level?: string }
}
interface GraphExport {
  nodes:      GraphNode[]
  edges:      GraphEdge[]
  node_count: number
  edge_count: number
}

/* ---------- Color map ---------- */
const TYPE_COLORS: Record<string, string> = {
  Taxpayer:    '#3B82F6',
  Invoice:     '#F59E0B',
  GSTR1:       '#10B981',
  GSTR2B:      '#8B5CF6',
  GSTR3B:      '#A78BFA',
  TaxPayment:  '#06B6D4',
}
function nodeColor(n: GraphNode) {
  if (n.data.risk_level === 'High-Risk') return '#EF4444'
  return TYPE_COLORS[n.data.type] ?? '#94A3B8'
}

/* ---------- Simple force-like layout ---------- */
function layoutNodes(nodes: GraphNode[], edges: GraphEdge[], w: number, h: number) {
  const pos: Record<string, { x: number; y: number }> = {}
  nodes.forEach((n, i) => {
    const ang = (i / Math.max(nodes.length, 1)) * 2 * Math.PI
    const r = Math.min(w, h) * 0.35
    pos[n.data.id] = {
      x: w / 2 + r * Math.cos(ang),
      y: h / 2 + r * Math.sin(ang),
    }
  })
  // Simple repulsion iterations
  for (let iter = 0; iter < 40; iter++) {
    const nodes2 = [...nodes]
    for (let i = 0; i < nodes2.length; i++) {
      for (let j = i + 1; j < nodes2.length; j++) {
        const a = pos[nodes2[i].data.id], b = pos[nodes2[j].data.id]
        const dx = a.x - b.x, dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 2000 / (dist * dist)
        a.x += force * dx / dist; a.y += force * dy / dist
        b.x -= force * dx / dist; b.y -= force * dy / dist
      }
    }
    // Attraction along edges
    edges.forEach(e => {
      const a = pos[e.data.source], b = pos[e.data.target]
      if (!a || !b) return
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const mul = 0.015
      a.x += mul * dx; a.y += mul * dy
      b.x -= mul * dx; b.y -= mul * dy
    })
    // Clamp
    nodes.forEach(n => {
      const p = pos[n.data.id]
      p.x = Math.max(30, Math.min(w - 30, p.x))
      p.y = Math.max(30, Math.min(h - 30, p.y))
    })
  }
  return pos
}

export default function GraphPage() {
  const [gstin,   setGstin]   = useState('')
  const [depth,   setDepth]   = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [graph,   setGraph]   = useState<GraphExport | null>(null)
  const [hover,   setHover]   = useState<GraphNode | null>(null)
  const [zoom,    setZoom]    = useState(1)
  const svgRef = useRef<SVGSVGElement>(null)
  const W = 880, H = 560

  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({})

  useEffect(() => {
    if (!graph) return
    const p = layoutNodes(graph.nodes, graph.edges, W, H)
    setPos(p)
  }, [graph])

  async function handleVisualize() {
    if (!gstin) return
    setLoading(true)
    try {
      const r = await graphApi.subgraph(gstin.toUpperCase(), depth)
      setGraph(r.data as GraphExport)
    } catch {
      setGraph(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Enter GSTIN…"
            value={gstin}
            onChange={e => setGstin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVisualize()}
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {([1, 2] as const).map(d => (
            <button
              key={d}
              onClick={() => setDepth(d)}
              className={`px-3 py-2 transition-colors ${depth === d ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-foreground'}`}
            >
              Depth {d}
            </button>
          ))}
        </div>
        <button
          onClick={handleVisualize}
          disabled={!gstin || loading}
          className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-glow"
        >
          {loading ? 'Loading…' : '🔍 Visualize'}
        </button>
        {graph && (
          <span className="text-xs text-muted ml-auto">
            {graph.node_count} nodes · {graph.edge_count} edges
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(TYPE_COLORS).map(([t, c]) => (
          <div key={t} className="flex items-center gap-1.5 text-xs text-muted">
            <div className="w-3 h-3 rounded-full" style={{ background: c }} />
            {t}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <div className="w-3 h-3 rounded-full bg-danger" />
          High-Risk
        </div>
      </div>

      {/* Canvas */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden relative graph-canvas" style={{ height: H }}>
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
          {[
            { icon: <ZoomIn size={14} />, action: () => setZoom(z => Math.min(z + 0.2, 3)) },
            { icon: <ZoomOut size={14} />, action: () => setZoom(z => Math.max(z - 0.2, 0.3)) },
            { icon: <Maximize2 size={14} />, action: () => setZoom(1) },
          ].map((b, i) => (
            <button key={i} onClick={b.action} className="bg-bg border border-border rounded-md p-1.5 text-muted hover:text-foreground transition-colors">
              {b.icon}
            </button>
          ))}
        </div>

        {!graph && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            Enter a GSTIN and click Visualize to explore the knowledge graph
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            Building subgraph…
          </div>
        )}

        {graph && !loading && (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${W} ${H}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.2s' }}
          >
            {/* Edges */}
            {graph.edges.map(e => {
              const a = pos[e.data.source], b = pos[e.data.target]
              if (!a || !b) return null
              const isAlert = e.data.risk_level === 'High-Risk'
              return (
                <line
                  key={e.data.id}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={isAlert ? '#EF4444' : '#334155'}
                  strokeWidth={isAlert ? 1.5 : 1}
                  strokeDasharray={isAlert ? '5 3' : undefined}
                  opacity={0.7}
                  className={isAlert ? 'edge-alert' : ''}
                />
              )
            })}
            {/* Edge labels */}
            {graph.edges.map(e => {
              const a = pos[e.data.source], b = pos[e.data.target]
              if (!a || !b) return null
              return (
                <text
                  key={e.data.id + '_lbl'}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  fill="#94A3B8"
                  fontSize={9}
                  textAnchor="middle"
                >
                  {e.data.rel}
                </text>
              )
            })}

            {/* Nodes */}
            {graph.nodes.map(n => {
              const p = pos[n.data.id]
              if (!p) return null
              const color = nodeColor(n)
              const isAlert = n.data.risk_level === 'High-Risk'
              return (
                <g
                  key={n.data.id}
                  transform={`translate(${p.x},${p.y})`}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(null)}
                >
                  {isAlert && (
                    <>
                      <circle r={18} fill={color} opacity={0.15} className="animate-ping" style={{ animationDuration: '2s' }} />
                      <circle r={22} stroke={color} strokeWidth={1} fill="none" opacity={0.3} />
                    </>
                  )}
                  <circle r={14} fill={color} opacity={0.9} stroke="#1E293B" strokeWidth={2} />
                  <text fill="#ffffff" fontSize={9} textAnchor="middle" dominantBaseline="central" fontWeight="600">
                    {n.data.type[0]}
                  </text>
                  <text fill="#94A3B8" fontSize={9} textAnchor="middle" y={22}>
                    {(n.data.label ?? n.data.id).slice(0, 14)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}

        {/* Tooltip */}
        {hover && (
          <div className="absolute bottom-4 left-4 bg-bg border border-border rounded-xl p-4 text-xs max-w-xs shadow-card animate-fade-in pointer-events-none">
            <p className="font-semibold text-foreground mb-2">{hover.data.type}: {hover.data.label ?? hover.data.id}</p>
            {Object.entries(hover.data)
              .filter(([k]) => !['id', 'label', 'type'].includes(k) && hover.data[k] != null)
              .slice(0, 6)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 mb-0.5">
                  <span className="text-muted">{k}</span>
                  <span className="text-foreground font-mono">{String(v)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
