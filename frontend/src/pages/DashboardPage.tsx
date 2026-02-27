import { useEffect, useState, useRef } from 'react'
import {
  IndianRupee, AlertTriangle, ShieldAlert, TrendingUp,
  RefreshCw, Zap, XCircle, CheckCircle2
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import StatCard from '@/components/shared/StatCard'
import TrustGauge from '@/components/shared/TrustGauge'
import { graphApi, reconcileApi, vendorsApi } from '@/lib/api'
import { fmtCurrency } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────
interface GraphStats {
  nodes:               Record<string, number>
  relationships:       Record<string, number>
  total_nodes:         number
  total_relationships: number
}
interface RecStats { total: number; valid: number; warning: number; high_risk: number; pending: number }

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [gStats,  setGStats]  = useState<GraphStats | null>(null)
  const [rStats,  setRStats]  = useState<RecStats  | null>(null)
  const [vendors, setVendors] = useState<{ total: number; high: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>('Vendor C')

  useEffect(() => {
    Promise.allSettled([
      graphApi.stats(),
      reconcileApi.stats(),
      vendorsApi.list({ limit: 200 }),
    ]).then(([g, r, v]) => {
      if (g.status === 'fulfilled') setGStats(g.value.data as unknown as GraphStats)
      if (r.status === 'fulfilled') setRStats(r.value.data as RecStats)
      if (v.status === 'fulfilled') {
        const items = (v.value.data as { items?: { risk_level: string }[] }).items ?? []
        setVendors({ total: items.length, high: items.filter(i => i.risk_level === 'High').length })
      }
      setLoading(false)
    })
  }, [])

  // Derived KPI values (fall back to mock when API not wired yet)
  const totalInvoices  = rStats?.total        ?? gStats?.nodes?.Invoice ?? 5180
  const highRisk       = rStats?.high_risk    ?? 930
  const itcAtRisk      = highRisk * 4200
  const vendorCount    = vendors?.total       ?? gStats?.nodes?.Taxpayer ?? 100
  const highRiskVendors= vendors?.high        ?? 3

  // Bar chart data
  const barData = rStats
    ? [
        { name: 'Valid',     value: rStats.valid,    fill: '#34d399' },
        { name: 'Warning',   value: rStats.warning,  fill: '#fb923c' },
        { name: 'High-Risk', value: rStats.high_risk,fill: '#ef4444' },
        { name: 'Pending',   value: rStats.pending,  fill: '#a3a3a3' },
      ]
    : [
        { name: 'Valid',     value: 3248, fill: '#34d399' },
        { name: 'Warning',   value: 850,  fill: '#fb923c' },
        { name: 'High-Risk', value: 930,  fill: '#ef4444' },
        { name: 'Pending',   value: 152,  fill: '#a3a3a3' },
      ]

  // Pie chart data from graph node counts
  const pieData = gStats
    ? Object.entries(gStats.nodes).map(([k, v]) => ({ name: k, value: v }))
    : [
        { name: 'Invoice',     value: 5180 },
        { name: 'TaxPayment',  value: 4930 },
        { name: 'GSTR1',       value: 600  },
        { name: 'GSTR3B',      value: 600  },
        { name: 'Taxpayer',    value: 100  },
      ]
  const PIE_COLORS = ['#64748b','#34d399','#fb923c','#ef4444','#a3e635','#fbbf24']

  return (
    <div className="space-y-6 animate-fade-in">

      {/* KPI Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="ITC Claimed"
          value={fmtCurrency(totalInvoices * 8500)}
          subtitle={`${totalInvoices.toLocaleString()} invoices`}
          icon={TrendingUp}
          accent="green"
        />
        <StatCard
          title="ITC at Risk"
          value={fmtCurrency(itcAtRisk)}
          subtitle={`${highRisk} high-risk invoices`}
          icon={IndianRupee}
          accent="red"
          glow
        />
        <StatCard
          title="Active Anomalies"
          value={`${highRisk} Detected`}
          subtitle="Across all periods"
          icon={AlertTriangle}
          accent="amber"
        />
        <StatCard
          title="High-Risk Vendors"
          value={`${highRiskVendors} Flagged`}
          subtitle={`Of ${vendorCount} registered`}
          icon={ShieldAlert}
          accent="red"
        />
      </div>

      {/* Main split pane */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6" style={{ minHeight: '480px' }}>

        {/* LEFT — Graph Explorer */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Real-Time Supply Chain Traversal</h2>
              <p className="text-xs text-muted mt-0.5">Click a node to inspect in the Risk Profile panel →</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-emerald bg-emerald/10 border border-emerald/20 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
              Live
            </span>
          </div>
          <div className="flex-1 graph-canvas relative p-8 flex items-center justify-center">
            <GraphSvg onSelect={setSelected} selected={selected} />
          </div>

          {/* Bottom bar charts row */}
          <div className="border-t border-border px-5 py-4 grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-muted mb-2">Invoice Status Distribution</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={barData} barSize={18}>
                  <XAxis dataKey="name" tick={{ fill: '#525252', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: '1px solid #d4d4d4', borderRadius: 8, fontSize: 12, color: '#0a0a0a' }}
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  />
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs font-medium text-muted mb-2">Graph Node Distribution</p>
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: '1px solid #d4d4d4', borderRadius: 8, fontSize: 12, color: '#0a0a0a' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT — Risk Profile Sidebar */}
        <RiskSidebar selected={selected} loading={loading} />
      </div>
    </div>
  )
}

// ── Graph SVG mock (per mega-prompt spec) ─────────────────────────────────────
const NODES = [
  { id: 'your_co',  x: 320, y: 200, label: 'Your Company',   sub: 'GSTIN: 27AADCB1001A1Z1', color: '#64748b', r: 38 },
  { id: 'vendor_a', x: 120, y: 100, label: 'Vendor A',        sub: 'GSTIN: 29AADCA1001B1Z2', color: '#34d399', r: 30 },
  { id: 'vendor_b', x: 120, y: 300, label: 'Vendor B',        sub: 'GSTIN: 07AADCB3201C1Z3', color: '#34d399', r: 30 },
  { id: 'vendor_c', x: 530, y: 200, label: 'Vendor C',        sub: '27AADCB2230M1Z2',        color: '#ef4444', r: 30 },
  { id: 'inv_992',  x: 680, y: 120, label: 'Invoice #992',    sub: '₹4,20,000',               color: '#ef4444', r: 24 },
  { id: 'eway',     x: 800, y: 220, label: 'e-Way Bill',      sub: 'NOT FOUND',               color: '#ef4444', r: 22 },
]
const EDGES = [
  { s: 'your_co', t: 'vendor_a', alert: false },
  { s: 'your_co', t: 'vendor_b', alert: false },
  { s: 'your_co', t: 'vendor_c', alert: true  },
  { s: 'vendor_c', t: 'inv_992', alert: true  },
  { s: 'inv_992',  t: 'eway',    alert: true  },
]

function GraphSvg({ onSelect, selected }: { onSelect: (s: string | null) => void; selected: string | null }) {
  return (
    <svg viewBox="0 0 950 380" className="w-full max-w-2xl" style={{ maxHeight: 300 }}>
      <defs>
        <marker id="arr_n"  markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#a3a3a3" />
        </marker>
        <marker id="arr_r"  markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#ef4444" />
        </marker>
        <filter id="glow_r">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Edges */}
      {EDGES.map((e, i) => {
        const s = NODES.find(n => n.id === e.s)!
        const t = NODES.find(n => n.id === e.t)!
        return (
          <line
            key={i}
            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={e.alert ? '#ef4444' : '#c0c0c0'}
            strokeWidth={e.alert ? 2.5 : 1.5}
            strokeDasharray={e.alert ? '8 4' : undefined}
            markerEnd={e.alert ? 'url(#arr_r)' : 'url(#arr_n)'}
            style={e.alert ? { animation: 'dash 1s linear infinite' } : undefined}
            opacity={e.alert ? 1 : 0.6}
          />
        )
      })}

      {/* Nodes */}
      {NODES.map(node => {
        const isSel   = selected === node.label
        const isAlert = node.color === '#EF4444'
        return (
          <g
            key={node.id}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(isSel ? null : node.label)}
          >
            {isAlert && (
              <circle cx={node.x} cy={node.y} r={node.r + 10} fill="none" stroke="#EF444444" strokeWidth={2}>
                <animate attributeName="r"   from={node.r + 6} to={node.r + 18} dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={node.x} cy={node.y} r={node.r}
              fill={node.color + '22'}
              stroke={isSel ? '#0a0a0a' : node.color}
              strokeWidth={isSel ? 3 : 2}
              filter={isAlert ? 'url(#glow_r)' : undefined}
            />
            <text x={node.x} y={node.y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={node.color}>
              {node.label}
            </text>
            <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize={8} fill="#525252">
              {node.sub}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Risk Profile Sidebar ──────────────────────────────────────────────────────
function RiskSidebar({ selected }: { selected: string | null; loading: boolean }) {
  const [resolving, setResolving] = useState(false)
  const [resolved,  setResolved]  = useState(false)

  function handleResolve() {
    setResolving(true)
    setTimeout(() => { setResolving(false); setResolved(true) }, 1800)
  }

  const isVendorC = selected === 'Vendor C' || !selected

  return (
    <div className="bg-surface border border-border rounded-xl flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-xs text-muted font-medium uppercase tracking-widest">Risk Profile</p>
        <h3 className="text-sm font-bold text-foreground mt-1">
          {isVendorC ? 'Vendor C' : selected}
        </h3>
        {isVendorC && (
          <p className="text-xs text-muted font-mono mt-0.5">GSTIN: 27AADCB2230M1Z2</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Trust gauge */}
        <div className="flex justify-center py-2">
          <TrustGauge value={isVendorC ? 32 : 74} size={130} label="Compliance Score" />
        </div>

        {/* AI Audit trail */}
        <div className="bg-danger/8 border border-danger/25 rounded-lg p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={13} className="text-danger flex-shrink-0" />
            <span className="text-xs font-semibold text-danger">AI Audit Finding</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {isVendorC
              ? 'Critical Mismatch: Invoice #992 value exceeds ₹50,000 but multi-hop traversal reveals no connected e-Way Bill. High probability of synthetic invoicing.'
              : 'This vendor has a moderate compliance score. Minor payment delays detected in periods 2025-06 and 2025-07. Recommend monitoring.'}
          </p>
        </div>

        {/* Financial impact */}
        <div className="bg-bg rounded-lg border border-border p-3.5">
          <p className="text-xs text-muted mb-2.5 font-medium">Financial Impact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-lg font-bold text-danger">₹4,20,000</p>
              <p className="text-xs text-muted">ITC at Risk</p>
            </div>
            <div>
              <p className="text-lg font-bold text-warning">14</p>
              <p className="text-xs text-muted">Open Anomalies</p>
            </div>
          </div>
        </div>

        {/* Anomaly flags */}
        <div className="space-y-2">
          <p className="text-xs text-muted font-medium">Detected Flags</p>
          {['CIRCULAR_TRADE', 'VALUE_MISMATCH', 'MISSING_PAYMENT'].map(f => (
            <div key={f} className="flex items-center gap-2.5 bg-bg rounded-lg border border-border px-3 py-2">
              <XCircle size={13} className="text-danger flex-shrink-0" />
              <span className="text-xs font-mono text-foreground/80">{f}</span>
            </div>
          ))}
          {resolved && (
            <div className="flex items-center gap-2.5 bg-success/10 rounded-lg border border-success/30 px-3 py-2">
              <CheckCircle2 size={13} className="text-success flex-shrink-0" />
              <span className="text-xs font-mono text-success">AUTO_RESOLVED</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-5 pt-3 border-t border-border space-y-2.5">
        <button
          onClick={handleResolve}
          disabled={resolving || resolved}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-glow"
        >
          {resolving
            ? <><RefreshCw size={14} className="animate-spin" /> Triggering Agent…</>
            : resolved
            ? <><CheckCircle2 size={14} /> Resolution Sent</>
            : <><Zap size={14} /> Trigger Auto-Resolution Agent</>}
        </button>
        <button className="w-full flex items-center justify-center gap-2 border border-danger/40 hover:bg-danger/10 text-danger font-semibold py-2.5 rounded-lg text-sm transition-all">
          <XCircle size={14} />
          Halt Vendor Payment
        </button>
      </div>
    </div>
  )
}
