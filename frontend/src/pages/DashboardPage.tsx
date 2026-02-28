import { useEffect, useState } from 'react'
import {
  IndianRupee, AlertTriangle, ShieldAlert, TrendingUp,
  Activity, BarChart2, PieChart as PieIcon,
  Zap, RefreshCw, XCircle, CheckCircle2,
} from 'lucide-react'
import TrustGauge from '@/components/shared/TrustGauge'
import {
  AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import StatCard from '@/components/shared/StatCard'
import { graphApi, reconcileApi, vendorsApi } from '@/lib/api'
import { fmtCurrency } from '@/lib/utils'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface GraphStats {
  nodes:               Record<string, number>
  relationships:       Record<string, number>
  total_nodes:         number
  total_relationships: number
}
interface RecStats { total: number; valid: number; warning: number; high_risk: number; pending: number }

// â”€â”€ Trend mock data (6 months) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TREND_LABELS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan']
const MOCK_TREND = [
  { month: 'Aug', valid: 2620, warning: 820,  highRisk: 810  },
  { month: 'Sep', valid: 2720, warning: 845,  highRisk: 830  },
  { month: 'Oct', valid: 2950, warning: 860,  highRisk: 850  },
  { month: 'Nov', valid: 3100, warning: 870,  highRisk: 855  },
  { month: 'Dec', valid: 3280, warning: 860,  highRisk: 848  },
  { month: 'Jan', valid: 3390, warning: 878,  highRisk: 858  },
]

// â”€â”€ Tooltip style â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TT_STYLE = {
  background: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 12,
  color: '#18181B',
  boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
}

// â”€â”€ Chart card wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ChartCard({
  icon: Icon, title, sub, iconBg, children,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>
  title: string
  sub:   string
  iconBg: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted mt-0.5">{sub}</p>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={16} className="opacity-70" />
        </div>
      </div>
      {children}
    </div>
  )
}

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function DashboardPage() {
  const [gStats,  setGStats]  = useState<GraphStats | null>(null)
  const [rStats,  setRStats]  = useState<RecStats  | null>(null)
  const [vendors, setVendors] = useState<{ total: number; high: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

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

  // â”€â”€ KPI derivation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalInvoices   = rStats?.total     ?? gStats?.nodes?.Invoice ?? 11390
  const highRisk        = rStats?.high_risk ?? 11390
  const itcClaimed      = fmtCurrency(totalInvoices * 8500)
  const itcAtRisk       = fmtCurrency(highRisk * 4200)
  const vendorCount     = vendors?.total    ?? gStats?.nodes?.Taxpayer ?? 102
  const highRiskVendors = vendors?.high     ?? 0

  // â”€â”€ Bar chart data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const barData = [
    { name: 'Valid',     value: rStats?.valid     ?? 0    },
    { name: 'Warning',   value: rStats?.warning   ?? 0    },
    { name: 'High-Risk', value: rStats?.high_risk ?? 11390},
    { name: 'Pending',   value: rStats?.pending   ?? 0    },
  ]
  const BAR_COLORS: Record<string, string> = {
    Valid: '#059669', Warning: '#D97706', 'High-Risk': '#B91C1C', Pending: '#A1A1AA',
  }

  // â”€â”€ Pie (donut) chart data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rawPie = gStats
    ? Object.entries(gStats.nodes).map(([k, v]) => ({ name: k, value: v }))
    : [
        { name: 'Invoice',    value: 5180 },
        { name: 'TaxPayment', value: 4930 },
        { name: 'GSTR2B',     value: 620  },
        { name: 'GSTR3B',     value: 600  },
        { name: 'GSTR1',      value: 560  },
        { name: 'Taxpayer',   value: 100  },
      ]
  const PIE_COLORS = ['#4F46E5', '#059669', '#D97706', '#B91C1C', '#65A30D', '#0EA5E9']

  // â”€â”€ Trend data (augment with real if available) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const trendData = rStats
    ? MOCK_TREND.map((m, i) =>
        i === MOCK_TREND.length - 1
          ? { ...m, valid: rStats.valid, warning: rStats.warning, highRisk: rStats.high_risk }
          : m
      )
    : MOCK_TREND

  return (
    <div className="space-y-6 animate-fade-in">

      {/* â”€â”€ Row 1: KPI Stat Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="ITC Claimed"
          value={itcClaimed}
          subtitle={`${totalInvoices.toLocaleString()} invoices`}
          icon={TrendingUp}
          accent="green"
        />
        <StatCard
          title="ITC at Risk"
          value={itcAtRisk}
          subtitle={`${highRisk.toLocaleString()} high-risk invoices`}
          icon={IndianRupee}
          accent="red"
          glow
        />
        <StatCard
          title="Active Anomalies"
          value={`${highRisk.toLocaleString()} Detected`}
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

      {/* â”€â”€ Row 2: Charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* 1 â€” Invoice Volume Trend (area-line) */}
        <ChartCard
          icon={Activity}
          title="Invoice Volume Trend"
          sub="6-month reconciliation activity"
          iconBg="bg-accent-lt text-accent"
        >
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gValid"   x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#059669" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gWarning" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#D97706" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gHigh"    x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#B91C1C" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#B91C1C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: '#A1A1AA', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#A1A1AA', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT_STYLE} cursor={{ stroke: '#E4E4E7' }} />
              <Area type="monotone" dataKey="valid"    name="Valid"     stroke="#059669" strokeWidth={2} fill="url(#gValid)"   dot={false} />
              <Area type="monotone" dataKey="warning"  name="Warning"   stroke="#D97706" strokeWidth={2} fill="url(#gWarning)" dot={false} />
              <Area type="monotone" dataKey="highRisk" name="High-Risk" stroke="#B91C1C" strokeWidth={2} fill="url(#gHigh)"    dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex items-center gap-4 justify-center">
            {[['#059669','Valid'],['#D97706','Warning'],['#B91C1C','High-Risk']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="text-[11px] text-muted">{l}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* 2 â€” Invoice Status Bar Chart */}
        <ChartCard
          icon={BarChart2}
          title="Invoice Status"
          sub="Current period breakdown"
          iconBg="bg-accent-lt text-accent"
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} barSize={32} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fill: '#A1A1AA', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#A1A1AA', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT_STYLE} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="value" name="Count" radius={[5, 5, 0, 0]}>
                {barData.map((d) => (
                  <Cell key={d.name} fill={BAR_COLORS[d.name]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3 â€” Knowledge Graph Nodes Donut */}
        <ChartCard
          icon={PieIcon}
          title="Knowledge Graph Nodes"
          sub="Entity type distribution"
          iconBg="bg-accent-lt text-accent"
        >
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={rawPie}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                paddingAngle={3}
                strokeWidth={0}
              >
                {rawPie.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TT_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          {/* Custom legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center">
            {rawPie.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-[11px] text-muted">{d.name}</span>
              </div>
            ))}
          </div>
        </ChartCard>

      </div>

      {/* ── Row 3: Supply Chain Traversal + Risk Profile ──────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6" style={{ minHeight: '480px' }}>

        {/* LEFT — Graph Explorer */}
        <div className="bg-surface rounded-2xl overflow-hidden flex flex-col shadow-card">
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #F4F4F5' }}>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Real-Time Supply Chain Traversal</h2>
              <p className="text-xs text-muted mt-0.5">Click a node to inspect in the Risk Profile panel →</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <div className="flex-1 relative flex items-center justify-center"
            style={{
              background: '#FFFFFF',
              backgroundImage: 'radial-gradient(circle, #e5e5e5 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            <GraphSvg onSelect={setSelected} selected={selected} />
          </div>
        </div>

        {/* RIGHT — Risk Profile Sidebar */}
        <RiskSidebar selected={selected} loading={loading} />
      </div>

    </div>
  )
}

// ── Graph SVG (Excalidraw / hand-drawn style) ─────────────────────────────────
const NODES = [
  { id: 'your_co',  x: 300, y: 210, label: 'Your Company',   sub: 'GSTIN: 27AADCB1001A1Z1', color: '#4F46E5', bg: '#EEF2FF', r: 52 },
  { id: 'vendor_a', x: 100, y: 95,  label: 'Vendor A',       sub: 'GSTIN: 29AADCA1001B1Z2', color: '#059669', bg: '#ECFDF5', r: 42 },
  { id: 'vendor_b', x: 100, y: 330, label: 'Vendor B',       sub: 'GSTIN: 07AADCB3201C1Z3', color: '#059669', bg: '#ECFDF5', r: 42 },
  { id: 'vendor_c', x: 540, y: 210, label: 'Vendor C',       sub: '27AADCB2230M1Z2',        color: '#DC2626', bg: '#FEF2F2', r: 44 },
  { id: 'inv_992',  x: 730, y: 120, label: 'Invoice #992',   sub: '₹4,20,000',               color: '#DC2626', bg: '#FEF2F2', r: 38 },
  { id: 'eway',     x: 870, y: 260, label: 'e-Way Bill',     sub: 'NOT FOUND',               color: '#DC2626', bg: '#FEF2F2', r: 36 },
]
const EDGES = [
  { s: 'your_co',  t: 'vendor_a', alert: false, label: 'supplies' },
  { s: 'your_co',  t: 'vendor_b', alert: false, label: 'supplies' },
  { s: 'your_co',  t: 'vendor_c', alert: true,  label: 'flagged' },
  { s: 'vendor_c', t: 'inv_992',  alert: true,  label: 'issued' },
  { s: 'inv_992',  t: 'eway',     alert: true,  label: 'missing link' },
]

/* Attempt a slightly wobbly path to mimic hand-drawn lines */
function wobblyLine(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2 + (Math.sin(x1 + y2) * 6)
  const my = (y1 + y2) / 2 + (Math.cos(x2 + y1) * 6)
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
}

function GraphSvg({ onSelect, selected }: { onSelect: (s: string | null) => void; selected: string | null }) {
  return (
    <svg viewBox="0 0 980 430" className="w-full" style={{ maxHeight: 400, padding: '12px' }}>
      <style>{`
        .sketch-label { font-family: 'Inter', system-ui, sans-serif; }
      `}</style>
      <defs>
        <marker id="arr_n" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
          <path d="M1,1 L9,4 L1,7" fill="none" stroke="#A1A1AA" strokeWidth="1.5" strokeLinecap="round" />
        </marker>
        <marker id="arr_r" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
          <path d="M1,1 L9,4 L1,7" fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
        </marker>
        <filter id="sketchy">
          <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" />
        </filter>
      </defs>

      {/* Edges — hand-drawn style curves */}
      {EDGES.map((e, i) => {
        const s = NODES.find(n => n.id === e.s)!
        const t = NODES.find(n => n.id === e.t)!
        const mx = (s.x + t.x) / 2
        const my = (s.y + t.y) / 2
        return (
          <g key={i}>
            <path
              d={wobblyLine(s.x, s.y, t.x, t.y)}
              fill="none"
              stroke={e.alert ? '#DC2626' : '#A1A1AA'}
              strokeWidth={e.alert ? 2 : 1.5}
              strokeDasharray={e.alert ? '10 5' : undefined}
              strokeLinecap="round"
              markerEnd={e.alert ? 'url(#arr_r)' : 'url(#arr_n)'}
              opacity={0.7}
              filter="url(#sketchy)"
            />
            {/* Edge label */}
            <rect
              x={mx - 28} y={my - 10} width={56} height={18} rx={6}
              fill="white" opacity={0.85}
            />
            <text
              x={mx} y={my + 3}
              textAnchor="middle"
              className="sketch-label"
              fontSize={13}
              fill={e.alert ? '#DC2626' : '#71717A'}
              opacity={0.8}
            >{e.label}</text>
          </g>
        )
      })}

      {/* Nodes — rounded card style with soft shadows */}
      {NODES.map(node => {
        const isSel = selected === node.label
        return (
          <g key={node.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(isSel ? null : node.label)}>
            {/* Soft outer glow for danger nodes */}
            {node.color === '#DC2626' && (
              <circle cx={node.x} cy={node.y} r={node.r + 12} fill="none" stroke="#DC262620" strokeWidth={2}>
                <animate attributeName="r" from={node.r + 8} to={node.r + 22} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Drop shadow */}
            <circle cx={node.x + 2} cy={node.y + 3} r={node.r} fill="#00000008" />
            {/* Main circle — slightly rough */}
            <circle
              cx={node.x} cy={node.y} r={node.r}
              fill={node.bg}
              stroke={isSel ? '#18181B' : node.color}
              strokeWidth={isSel ? 2.5 : 1.5}
              filter="url(#sketchy)"
              style={{ transition: 'stroke-width 0.2s ease' }}
            />
            {/* Bold label */}
            <text
              x={node.x} y={node.y - 2}
              textAnchor="middle"
              className="sketch-label"
              fontSize={16}
              fontWeight={700}
              fill={node.color}
            >{node.label}</text>
            {/* Subtitle */}
            <text
              x={node.x} y={node.y + 16}
              textAnchor="middle"
              className="sketch-label"
              fontSize={11}
              fill="#71717A"
            >{node.sub}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Risk Profile Sidebar ──────────────────────────────────────────────────────
function RiskSidebar({ selected, loading }: { selected: string | null; loading: boolean }) {
  const [resolving, setResolving] = useState(false)
  const [resolved,  setResolved]  = useState(false)

  function handleResolve() {
    setResolving(true)
    setTimeout(() => { setResolving(false); setResolved(true) }, 1800)
  }

  const isVendorC = selected === 'Vendor C' || !selected

  return (
    <div className="bg-surface rounded-2xl flex flex-col overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #F4F4F5' }}>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted">Risk Profile</p>
        <h3 className="text-sm font-bold text-foreground mt-1">{isVendorC ? 'Vendor C' : selected}</h3>
        {isVendorC && <p className="text-xs text-muted font-mono mt-0.5">GSTIN: 27AADCB2230M1Z2</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Trust gauge */}
        <div className="flex justify-center py-2">
          <TrustGauge value={isVendorC ? 32 : 74} size={130} label="Compliance Score" />
        </div>

        {/* Audit finding */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={13} className="text-red-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-red-600">Audit Finding</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {isVendorC
              ? 'Critical Mismatch: Invoice #992 value exceeds ₹50,000 but multi-hop traversal reveals no connected e-Way Bill. High probability of synthetic invoicing.'
              : 'This vendor has a moderate compliance score. Minor payment delays detected in periods 2025-06 and 2025-07. Recommend monitoring.'}
          </p>
        </div>

        {/* Financial impact */}
        <div className="bg-bg rounded-xl p-3.5">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted mb-2.5">Financial Impact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-lg font-bold text-red-600">₹4,20,000</p>
              <p className="text-xs text-muted">ITC at Risk</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-500">14</p>
              <p className="text-xs text-muted">Open Anomalies</p>
            </div>
          </div>
        </div>

        {/* Flags */}
        <div className="space-y-2">
          <p className="text-xs text-muted font-medium">Detected Flags</p>
          {['CIRCULAR_TRADE', 'VALUE_MISMATCH', 'MISSING_PAYMENT'].map(f => (
            <div key={f} className="flex items-center gap-2.5 bg-bg rounded-lg border border-[#F4F4F5] px-3 py-2">
              <XCircle size={13} className="text-red-600 flex-shrink-0" />
              <span className="text-xs font-mono text-foreground/80">{f}</span>
            </div>
          ))}
          {resolved && (
            <div className="flex items-center gap-2.5 bg-emerald-50 rounded-lg border border-emerald-200 px-3 py-2">
              <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
              <span className="text-xs font-mono text-emerald-600">AUTO_RESOLVED</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-5 pt-3 space-y-2.5" style={{ borderTop: '1px solid #F4F4F5' }}>
        <button
          onClick={handleResolve}
          disabled={resolving || resolved}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all"
        >
          {resolving
            ? <><RefreshCw size={14} className="animate-spin" /> Triggering Agent…</>
            : resolved
            ? <><CheckCircle2 size={14} /> Resolution Sent</>
            : <><Zap size={14} /> Trigger Auto-Resolution Agent</>}
        </button>
        <button className="w-full flex items-center justify-center gap-2 border border-red-300 hover:bg-red-50 text-red-600 font-semibold py-2.5 rounded-lg text-sm transition-all">
          <XCircle size={14} />
          Halt Vendor Payment
        </button>
      </div>
    </div>
  )
}
