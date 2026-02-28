import { useState, useCallback } from 'react'
import { AlertTriangle, Clock, GitBranch, Network, Play, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, CartesianGrid, ZAxis,
} from 'recharts'
import { patternsApi } from '../lib/api'

// ── API response shapes (must match backend schemas.py) ───────────────────────
interface CircularTrade  { cycle_id: string; gstins: string[]; invoice_ids: string[]; period: string | null; risk_level: string }
interface PaymentDelay   { gstin: string; avg_delay_days: number; max_delay_days: number; affected_invoice_count: number; risk_level: string }
interface AmendmentChain { gstin: string; amendment_chains: number; max_chain_depth: number; risk_level: string }
interface RiskNetwork    { gstin: string; total_partners: number; risky_partners: number; risky_partner_ratio: number; risk_level: string }

// ── Neutral palette ───────────────────────────────────────────────────────────
const N: Record<number, string> = {
  50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4',
  400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040',
  800: '#262626', 900: '#171717', 950: '#0a0a0a',
}
const TT: React.CSSProperties = {
  background: '#fff', border: 'none', borderRadius: 10,
  fontSize: 12, color: N[900], boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'circular' | 'delays' | 'amendments' | 'networks'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'circular',   label: 'Circular Trades', icon: <Network size={14} /> },
  { id: 'delays',     label: 'Payment Delays',  icon: <Clock size={14} /> },
  { id: 'amendments', label: 'Amendments',       icon: <GitBranch size={14} /> },
  { id: 'networks',   label: 'Risk Networks',    icon: <AlertTriangle size={14} /> },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCr(rupees: number) {
  const cr = rupees / 1e7
  if (cr >= 1) return `₹${cr.toFixed(1)} Cr`
  const lac = rupees / 1e5
  if (lac >= 1) return `₹${lac.toFixed(1)}L`
  return `₹${rupees.toFixed(0)}`
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────
function ChartPanel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl shadow-card p-5 flex flex-col gap-3">
      <div>
        <h4 className="text-[13px] font-bold text-foreground">{title}</h4>
        <p className="text-[11px] text-muted mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  )
}

function KpiRow({ kpis }: { kpis: { label: string; value: string; sub: string }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map(k => (
        <div key={k.label} className="bg-surface rounded-2xl shadow-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: N[400] }}>{k.label}</p>
          <p className="text-2xl font-extrabold mt-1" style={{ color: N[900] }}>{k.value}</p>
          <p className="text-[11px] mt-0.5" style={{ color: N[500] }}>{k.sub}</p>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-surface rounded-2xl shadow-card p-16 text-center flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-bg flex items-center justify-center">
        <Upload size={22} style={{ color: N[400] }} />
      </div>
      <div>
        <p className="text-[14px] font-semibold" style={{ color: N[700] }}>No patterns detected</p>
        <p className="text-[12px] mt-1" style={{ color: N[400] }}>Upload your GST files first, then run detection</p>
      </div>
      <Link
        to="/upload"
        className="mt-2 text-[12px] font-semibold px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent-h transition-all"
      >
        Go to Upload →
      </Link>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Circular Trades
// ═══════════════════════════════════════════════════════════════════════════════
function CircularCharts({ data }: { data: CircularTrade[] }) {
  if (!data.length) return <EmptyState />

  // Depth distribution from gstins.length
  const depthMap: Record<string, number> = {}
  data.forEach(d => {
    const key = `${d.gstins.length}-hop`
    depthMap[key] = (depthMap[key] ?? 0) + 1
  })
  const depthData = Object.entries(depthMap)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([depth, count]) => ({ depth, count }))

  // Risk classification donut
  const riskMap: Record<string, number> = {}
  data.forEach(d => { riskMap[d.risk_level] = (riskMap[d.risk_level] ?? 0) + 1 })
  const riskPie = Object.entries(riskMap).map(([name, value]) => ({ name, value }))
  const PIE_C = [N[200], N[500], N[700], N[950]]

  // Top cycles ranked by depth (descending) — shown as area chart
  const ranked = [...data]
    .sort((a, b) => b.gstins.length - a.gstins.length)
    .slice(0, 12)
    .map((d, i) => ({ name: `#${i + 1}`, depth: d.gstins.length, invoices: d.invoice_ids.length }))

  const avgDepth = (data.reduce((s, d) => s + d.gstins.length, 0) / data.length).toFixed(1)
  const violatorMap: Record<string, number> = {}
  data.forEach(d => d.gstins.forEach(g => { violatorMap[g] = (violatorMap[g] ?? 0) + 1 }))
  const topViolator = Object.entries(violatorMap).sort(([, a], [, b]) => b - a)[0]?.[0]?.slice(-6) ?? '—'

  const kpis = [
    { label: 'Cycles Detected', value: data.length.toString(),          sub: 'Across all data' },
    { label: 'Invoice IDs',     value: data.reduce((s, d) => s + d.invoice_ids.length, 0).toString(), sub: 'Total impacted' },
    { label: 'Avg Hop Depth',   value: avgDepth,                        sub: 'Per cycle' },
    { label: 'Top Violator',    value: topViolator,                     sub: 'Most appearances' },
  ]

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1 — Ranked cycles by depth */}
        <ChartPanel title="Circular Cycles by Depth (Top 12)" sub="Hop count per detected cycle — highest first">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ranked} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="cArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={N[700]} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={N[700]} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Area type="monotone" dataKey="depth" name="Hops" stroke={N[800]} strokeWidth={2} fill="url(#cArea)" dot={{ r: 3, fill: N[800] }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 2 — Depth distribution */}
        <ChartPanel title="Cycle Depth Distribution" sub="Number of cycles per hop-count">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={depthData} barSize={40} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="depth" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={N[600]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 3 — Invoices per cycle (ranked bar) */}
        <ChartPanel title="Invoice Exposure per Cycle" sub="Invoice IDs involved in top 12 cycles">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ranked} barSize={22} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="name" tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="invoices" name="Invoices" radius={[4, 4, 0, 0]} fill={N[800]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 4 — Risk level donut */}
        <ChartPanel title="Risk Level Breakdown" sub="Severity of detected cycles">
          <div className="flex items-center justify-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={riskPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {riskPie.map((_, i) => <Cell key={i} fill={PIE_C[i % PIE_C.length]} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {riskPie.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: PIE_C[i % PIE_C.length] }} />
                  <span className="text-xs" style={{ color: N[600] }}>{d.name}</span>
                  <span className="text-xs font-bold" style={{ color: N[900] }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartPanel>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Payment Delays
// ═══════════════════════════════════════════════════════════════════════════════
function DelayCharts({ data }: { data: PaymentDelay[] }) {
  if (!data.length) return <EmptyState />

  // Bucket distribution by avg_delay_days
  const BUCKETS = [
    { range: '0-7d',   min: 0,  max: 7   },
    { range: '8-15d',  min: 8,  max: 15  },
    { range: '16-30d', min: 16, max: 30  },
    { range: '31-60d', min: 31, max: 60  },
    { range: '61-90d', min: 61, max: 90  },
    { range: '90d+',   min: 91, max: 1e9 },
  ]
  const bucketCounts = BUCKETS.map(b => ({
    range: b.range,
    count: data.filter(d => d.avg_delay_days >= b.min && d.avg_delay_days < b.max).length,
  }))

  // Scatter: each vendor is one dot
  const scatterData = data.map(d => ({
    invoices: d.affected_invoice_count,
    avgDelay: +d.avg_delay_days.toFixed(1),
    amt:      +d.max_delay_days.toFixed(0),
  }))

  // Timeliness donut
  const PIE_C = [N[200], N[400], N[600], N[900]]
  const timelinessPie = [
    { name: 'On-time',  value: data.filter(d => d.avg_delay_days <= 7).length  },
    { name: 'Moderate', value: data.filter(d => d.avg_delay_days > 7  && d.avg_delay_days <= 30).length },
    { name: 'Late',     value: data.filter(d => d.avg_delay_days > 30 && d.avg_delay_days <= 60).length },
    { name: 'Critical', value: data.filter(d => d.avg_delay_days > 60).length  },
  ].filter(d => d.value > 0)

  // Top 12 vendors by avg delay for area chart
  const top12 = [...data]
    .sort((a, b) => b.avg_delay_days - a.avg_delay_days)
    .slice(0, 12)
    .map((d, i) => ({ name: `#${i + 1}`, avg: +d.avg_delay_days.toFixed(1), max: +d.max_delay_days.toFixed(0) }))

  const avgDelay   = (data.reduce((s, d) => s + d.avg_delay_days, 0) / data.length).toFixed(0)
  const maxDelay   = Math.max(...data.map(d => d.max_delay_days))
  const totalInv   = data.reduce((s, d) => s + d.affected_invoice_count, 0)

  const kpis = [
    { label: 'Delayed Vendors',   value: data.length.toString(), sub: 'Vendors flagged'      },
    { label: 'Avg Delay',         value: `${avgDelay} days`,     sub: 'Across all vendors'   },
    { label: 'Max Delay',         value: `${maxDelay.toFixed(0)} days`, sub: 'Worst case'    },
    { label: 'Affected Invoices', value: totalInv.toLocaleString(),     sub: 'Total impacted' },
  ]

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1 — Top vendors delay trend */}
        <ChartPanel title="Delay Trend (Days)" sub="Avg vs max delay — top 12 vendors by severity">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={top12} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="dAvg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={N[500]} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={N[500]} stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="dMax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={N[900]} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={N[900]} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Area type="monotone" dataKey="avg" name="Avg Delay" stroke={N[500]} strokeWidth={2} fill="url(#dAvg)" dot={false} />
              <Area type="monotone" dataKey="max" name="Max Delay" stroke={N[900]} strokeWidth={2} fill="url(#dMax)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 justify-center">
            {([[N[500], 'Avg Delay'], [N[900], 'Max Delay']] as [string, string][]).map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="text-[11px]" style={{ color: N[500] }}>{l}</span>
              </div>
            ))}
          </div>
        </ChartPanel>

        {/* 2 — Bucket distribution */}
        <ChartPanel title="Delay Distribution" sub="Vendor count by avg-delay range">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketCounts} barSize={32} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="range" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {bucketCounts.map((_, i) => <Cell key={i} fill={[N[200], N[300], N[500], N[700], N[900], N[950]][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 3 — Scatter: invoices vs avg delay */}
        <ChartPanel title="Vendor Delay Profile" sub="Avg delay vs affected invoices (size = max delay)">
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={N[200]} />
              <XAxis type="number" dataKey="invoices" name="Invoices" tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey="avgDelay" name="Avg Delay (d)" tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <ZAxis type="number" dataKey="amt" range={[40, 300]} />
              <Tooltip contentStyle={TT} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={scatterData} fill={N[700]} opacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 4 — Timeliness donut */}
        <ChartPanel title="Payment Timeliness" sub="Vendor payment status by avg delay">
          <div className="flex items-center justify-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={timelinessPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {timelinessPie.map((_, i) => <Cell key={i} fill={PIE_C[i]} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {timelinessPie.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: PIE_C[i] }} />
                  <span className="text-xs" style={{ color: N[600] }}>{d.name}</span>
                  <span className="text-xs font-bold" style={{ color: N[900] }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartPanel>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Amendment Chains
// ═══════════════════════════════════════════════════════════════════════════════
function AmendmentCharts({ data }: { data: AmendmentChain[] }) {
  if (!data.length) return <EmptyState />

  // Depth distribution from max_chain_depth
  const depthMap: Record<string, number> = {}
  data.forEach(d => {
    const key = `Depth ${d.max_chain_depth}`
    depthMap[key] = (depthMap[key] ?? 0) + 1
  })
  const depthData = Object.entries(depthMap)
    .sort(([a], [b]) => parseInt(a.split(' ')[1]) - parseInt(b.split(' ')[1]))
    .map(([depth, count]) => ({ depth, count }))

  // Top 12 chains by amendment_chains count
  const top12 = [...data]
    .sort((a, b) => b.amendment_chains - a.amendment_chains)
    .slice(0, 12)
    .map((d, i) => ({ name: `#${i + 1}`, chains: d.amendment_chains, depth: d.max_chain_depth }))

  // Depth category donut
  const PIE_C = [N[200], N[500], N[700], N[950]]
  const amendTypePie = [
    { name: 'Shallow (1)',  value: data.filter(d => d.max_chain_depth === 1).length },
    { name: 'Medium (2)',   value: data.filter(d => d.max_chain_depth === 2).length },
    { name: 'Deep (3)',     value: data.filter(d => d.max_chain_depth === 3).length },
    { name: 'Very Deep 4+', value: data.filter(d => d.max_chain_depth >= 4).length },
  ].filter(d => d.value > 0)

  const avgChains = (data.reduce((s, d) => s + d.amendment_chains, 0) / data.length).toFixed(1)
  const maxDepth  = Math.max(...data.map(d => d.max_chain_depth))
  const maxChains = Math.max(...data.map(d => d.amendment_chains))

  const kpis = [
    { label: 'Vendors Flagged',  value: data.length.toString(), sub: 'With amendment chains'  },
    { label: 'Avg Chains',       value: avgChains,              sub: 'Per vendor'              },
    { label: 'Max Chain Depth',  value: maxDepth.toString(),    sub: 'Deepest chain'           },
    { label: 'Max Amendments',   value: maxChains.toString(),   sub: 'Single vendor worst case'},
  ]

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1 — Top vendors by chain count */}
        <ChartPanel title="Amendment Chains (Top 12)" sub="Chain count per vendor — highest first">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={top12} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="aChain" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={N[600]} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={N[600]} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Area type="monotone" dataKey="chains" name="Chains" stroke={N[700]} strokeWidth={2} fill="url(#aChain)" dot={{ r: 3, fill: N[700] }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 2 — Depth distribution */}
        <ChartPanel title="Chain Depth Distribution" sub="Vendor count by max chain depth">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={depthData} barSize={36} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="depth" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {depthData.map((_, i) => <Cell key={i} fill={[N[300], N[400], N[600], N[700], N[900]][i % 5]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 3 — Chain depth vs chain count per vendor */}
        <ChartPanel title="Chain Count vs Depth (Top 12)" sub="Comparison of amendment chains and max depth">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={top12} barSize={14} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="name" tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="depth"  name="Max Depth"  radius={[4, 4, 0, 0]} fill={N[400]} />
              <Bar dataKey="chains" name="Chain Count" radius={[4, 4, 0, 0]} fill={N[900]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 justify-center">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: N[400] }} />
              <span className="text-[11px]" style={{ color: N[500] }}>Max Depth</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: N[900] }} />
              <span className="text-[11px]" style={{ color: N[500] }}>Chain Count</span>
            </div>
          </div>
        </ChartPanel>

        {/* 4 — Depth category donut */}
        <ChartPanel title="Amendment Depth Breakdown" sub="Vendor distribution by chain depth category">
          <div className="flex items-center justify-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={amendTypePie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {amendTypePie.map((_, i) => <Cell key={i} fill={PIE_C[i % PIE_C.length]} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {amendTypePie.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: PIE_C[i % PIE_C.length] }} />
                  <span className="text-xs" style={{ color: N[600] }}>{d.name}</span>
                  <span className="text-xs font-bold" style={{ color: N[900] }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartPanel>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — Risk Networks
// ═══════════════════════════════════════════════════════════════════════════════
function NetworkCharts({ data }: { data: RiskNetwork[] }) {
  if (!data.length) return <EmptyState />

  // Vendor risk classification donut
  const riskMap: Record<string, number> = {}
  data.forEach(d => { riskMap[d.risk_level ?? 'Unknown'] = (riskMap[d.risk_level ?? 'Unknown'] ?? 0) + 1 })
  const riskPie = Object.entries(riskMap).map(([name, value]) => ({ name, value }))
  const PIE_C   = [N[200], N[400], N[700], N[950]]

  // Partner count distribution
  const BUCKETS = [
    { range: '1-2',   min: 1,  max: 2   },
    { range: '3-5',   min: 3,  max: 5   },
    { range: '6-10',  min: 6,  max: 10  },
    { range: '11-20', min: 11, max: 20  },
    { range: '21-50', min: 21, max: 50  },
    { range: '50+',   min: 51, max: 1e9 },
  ]
  const partnerDist = BUCKETS.map(b => ({
    range: b.range,
    count: data.filter(d => d.total_partners >= b.min && d.total_partners <= b.max).length,
  }))

  // Top 12 by risky_partner_ratio
  const top12 = [...data]
    .sort((a, b) => b.risky_partner_ratio - a.risky_partner_ratio)
    .slice(0, 12)
    .map((d, i) => ({ name: `#${i + 1}`, ratio: +d.risky_partner_ratio.toFixed(3) }))

  // Radar — aggregate metrics
  const totalPartners = data.reduce((s, d) => s + d.total_partners, 0)
  const totalRisky    = data.reduce((s, d) => s + d.risky_partners, 0)
  const avgRatio      = totalPartners > 0 ? totalRisky / totalPartners : 0
  const radarData = [
    { metric: 'Connectivity',  value: Math.min(100, Math.round(totalPartners / Math.max(data.length, 1) * 5)) },
    { metric: 'Risky Ratio',   value: Math.round(avgRatio * 100) },
    { metric: 'Density',       value: Math.min(100, Math.round(data.length / 10 * 6)) },
    { metric: 'Flagged',       value: Math.min(100, Math.round(totalRisky / Math.max(data.length, 1) * 20)) },
    { metric: 'Critical',      value: Math.min(100, Math.round(data.filter(d => d.risk_level === 'Critical' || d.risk_level === 'High').length / data.length * 100)) },
    { metric: 'Coverage',      value: Math.min(100, Math.round(data.length / 5)) },
  ]

  const flagged   = data.filter(d => d.risk_level === 'High' || d.risk_level === 'Critical').length
  const riskyRatio = `${Math.round(avgRatio * 100)}%`
  const density    = `${Math.min(100, Math.round(data.length / 10 * 6))}%`

  const kpis = [
    { label: 'Total Vendors',   value: data.length.toString(), sub: 'In network'        },
    { label: 'Flagged',         value: flagged.toString(),     sub: 'High/Critical risk' },
    { label: 'Network Density', value: density,                sub: 'Connectivity score' },
    { label: 'Risky Ratio',     value: riskyRatio,             sub: 'Avg flagged partners'},
  ]

  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1 — Radar */}
        <ChartPanel title="Network Risk Radar" sub="Multi-dimensional risk assessment">
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={90}>
              <PolarGrid stroke={N[200]} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: N[600], fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: N[400], fontSize: 9 }} axisLine={false} />
              <Tooltip contentStyle={TT} />
              <Radar dataKey="value" stroke={N[800]} fill={N[700]} fillOpacity={0.2} strokeWidth={2} dot={{ r: 3, fill: N[800] }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 2 — Partner count distribution */}
        <ChartPanel title="Partner Count Distribution" sub="Vendors grouped by total partner count">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={partnerDist} barSize={36} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="range" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={N[500]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 3 — Risky ratio ranked line */}
        <ChartPanel title="Risky Partner Ratio (Top 12)" sub="Proportion of flagged partners per vendor">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={top12} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="name" tick={{ fill: N[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: N[400], fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
              <Tooltip contentStyle={TT} formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Risky Ratio']} />
              <Line type="monotone" dataKey="ratio" stroke={N[900]} strokeWidth={2.5} dot={{ r: 4, fill: N[900], stroke: '#fff', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 4 — Vendor risk classification donut */}
        <ChartPanel title="Vendor Risk Classification" sub="Current vendor risk level breakdown">
          <div className="flex items-center justify-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={riskPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {riskPie.map((_, i) => <Cell key={i} fill={PIE_C[i % PIE_C.length]} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {riskPie.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: PIE_C[i % PIE_C.length] }} />
                  <span className="text-xs" style={{ color: N[600] }}>{d.name}</span>
                  <span className="text-xs font-bold" style={{ color: N[900] }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartPanel>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function PatternsPage() {
  const [tab,     setTab]     = useState<Tab>('circular')
  const [loading, setLoading] = useState(false)
  const [ran,     setRan]     = useState(false)

  const [circularData,  setCircularData]  = useState<CircularTrade[]>([])
  const [delayData,     setDelayData]     = useState<PaymentDelay[]>([])
  const [amendData,     setAmendData]     = useState<AmendmentChain[]>([])
  const [networkData,   setNetworkData]   = useState<RiskNetwork[]>([])

  const runDetection = useCallback(async () => {
    setLoading(true)
    setRan(false)
    try {
      if (tab === 'circular')   { const r = await patternsApi.circular();   setCircularData((r.data as CircularTrade[]) ?? []) }
      if (tab === 'delays')     { const r = await patternsApi.delays();     setDelayData((r.data as PaymentDelay[]) ?? []) }
      if (tab === 'amendments') { const r = await patternsApi.amendments(); setAmendData((r.data as AmendmentChain[]) ?? []) }
      if (tab === 'networks')   { const r = await patternsApi.networks();   setNetworkData((r.data as RiskNetwork[]) ?? []) }
    } catch {
      // keep state as empty → EmptyState shown
    } finally {
      setLoading(false)
      setRan(true)
    }
  }, [tab])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-2xl p-1 w-fit shadow-card">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setRan(false) }}
            className={`flex items-center gap-2 text-[13px] px-4 py-2 rounded-xl transition-all duration-200 ${
              tab === t.id
                ? 'bg-accent text-white shadow-glow font-semibold'
                : 'text-muted hover:text-foreground hover:bg-bg'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Run Detection button */}
      <button
        onClick={runDetection}
        disabled={loading}
        className="flex items-center gap-2 bg-accent hover:bg-accent-h disabled:opacity-50 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-all shadow-glow"
      >
        <Play size={13} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Detecting…' : 'Run Detection'}
      </button>

      {/* Before running */}
      {!ran && !loading && (
        <div className="bg-surface rounded-2xl shadow-card p-16 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-bg flex items-center justify-center">
            {TABS.find(t => t.id === tab)?.icon}
          </div>
          <p className="text-muted text-[13px] font-medium">{TABS.find(t => t.id === tab)?.label}</p>
          <p className="text-[11px] mt-1" style={{ color: N[400] }}>Click &quot;Run Detection&quot; to analyze your uploaded data</p>
        </div>
      )}

      {/* Charts — shown after detection */}
      {ran && !loading && tab === 'circular'   && <CircularCharts   data={circularData}  />}
      {ran && !loading && tab === 'delays'     && <DelayCharts      data={delayData}     />}
      {ran && !loading && tab === 'amendments' && <AmendmentCharts  data={amendData}    />}
      {ran && !loading && tab === 'networks'   && <NetworkCharts    data={networkData}   />}
    </div>
  )
}
