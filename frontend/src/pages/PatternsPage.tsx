import { useState } from 'react'
import { AlertTriangle, Clock, GitBranch, Network, Play } from 'lucide-react'
import RiskBadge from '@/components/shared/RiskBadge'
import { patternsApi } from '@/lib/api'

type Tab = 'circular' | 'delays' | 'amendments' | 'networks'

interface CircularPattern  { cycle_id: string; involved_gstins: string[]; period: string; risk_level: string; total_value?: number }
interface DelayPattern     { gstin: string; avg_delay_days: number; max_delay_days: number; affected_invoice_count: number }
interface AmendPattern     { gstin: string; amendment_chains: number; max_chain_depth: number }
interface NetworkPattern   { gstin: string; total_partners: number; risky_partners: number; risky_partner_ratio: number }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'circular',   label: 'Circular Trades',  icon: <Network size={14} />    },
  { id: 'delays',     label: 'Payment Delays',   icon: <Clock size={14} />      },
  { id: 'amendments', label: 'Amendments',       icon: <GitBranch size={14} />  },
  { id: 'networks',   label: 'Risk Networks',    icon: <AlertTriangle size={14} /> },
]

export default function PatternsPage() {
  const [tab,    setTab]    = useState<Tab>('circular')
  const [loading, setLoading] = useState(false)
  const [data,   setData]   = useState<unknown[]>([])
  const [ran,    setRan]    = useState(false)

  async function runDetection() {
    setLoading(true); setRan(false); setData([])
    try {
      let r
      if (tab === 'circular')   r = await patternsApi.circular()
      else if (tab === 'delays')     r = await patternsApi.delays()
      else if (tab === 'amendments') r = await patternsApi.amendments()
      else                           r = await patternsApi.networks()
      const d = r.data as { patterns?: unknown[]; results?: unknown[] }
      setData(d.patterns ?? d.results ?? [])
    } catch { setData([]) }
    finally { setLoading(false); setRan(true) }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setData([]); setRan(false) }}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-all ${
              tab === t.id ? 'bg-accent text-white shadow-glow' : 'text-muted hover:text-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={runDetection}
        disabled={loading}
        className="flex items-center gap-2 bg-surface border border-border hover:border-accent/50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
      >
        <Play size={13} className={loading ? 'animate-spin text-accent' : 'text-accent'} />
        {loading ? 'Detecting…' : 'Run Detection'}
      </button>

      {/* Results */}
      {ran && data.length === 0 && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center text-muted">
          No patterns detected for this category. Run more data ingestion and reconciliation first.
        </div>
      )}

      {ran && data.length > 0 && tab === 'circular'   && <CircularTable   rows={data as CircularPattern[]} />}
      {ran && data.length > 0 && tab === 'delays'     && <DelaysTable     rows={data as DelayPattern[]} />}
      {ran && data.length > 0 && tab === 'amendments' && <AmendmentsTable rows={data as AmendPattern[]} />}
      {ran && data.length > 0 && tab === 'networks'   && <NetworksTable   rows={data as NetworkPattern[]} />}
    </div>
  )
}

/* ---- Sub-tables ---- */

function CircularTable({ rows }: { rows: CircularPattern[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="text-left px-4 py-3 font-medium">Cycle ID</th>
            <th className="text-left px-4 py-3 font-medium">GSTINs Involved</th>
            <th className="text-left px-4 py-3 font-medium">Period</th>
            <th className="text-left px-4 py-3 font-medium">Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.cycle_id} className="border-b border-border/60 hover:bg-white/[0.03]">
              <td className="px-4 py-3 font-mono text-xs text-danger">{r.cycle_id}</td>
              <td className="px-4 py-3 text-xs text-muted max-w-xs truncate">{r.involved_gstins.join(' → ')}</td>
              <td className="px-4 py-3 text-xs text-muted">{r.period}</td>
              <td className="px-4 py-3"><RiskBadge level={r.risk_level} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DelaysTable({ rows }: { rows: DelayPattern[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="text-left px-4 py-3 font-medium">GSTIN</th>
            <th className="text-right px-4 py-3 font-medium">Avg Delay</th>
            <th className="text-right px-4 py-3 font-medium">Max Delay</th>
            <th className="text-right px-4 py-3 font-medium">Affected Invoices</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.gstin} className="border-b border-border/60 hover:bg-white/[0.03]">
              <td className="px-4 py-3 font-mono text-xs text-accent">{r.gstin}</td>
              <td className="px-4 py-3 text-right"><span className={`font-medium ${r.avg_delay_days > 30 ? 'text-danger' : 'text-warning'}`}>{r.avg_delay_days.toFixed(1)}d</span></td>
              <td className="px-4 py-3 text-right text-muted">{r.max_delay_days}d</td>
              <td className="px-4 py-3 text-right text-muted">{r.affected_invoice_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AmendmentsTable({ rows }: { rows: AmendPattern[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="text-left px-4 py-3 font-medium">GSTIN</th>
            <th className="text-right px-4 py-3 font-medium">Amendment Chains</th>
            <th className="text-right px-4 py-3 font-medium">Max Chain Depth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.gstin} className="border-b border-border/60 hover:bg-white/[0.03]">
              <td className="px-4 py-3 font-mono text-xs text-accent">{r.gstin}</td>
              <td className="px-4 py-3 text-right font-medium text-warning">{r.amendment_chains}</td>
              <td className="px-4 py-3 text-right text-muted">{r.max_chain_depth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NetworksTable({ rows }: { rows: NetworkPattern[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="text-left px-4 py-3 font-medium">GSTIN</th>
            <th className="text-right px-4 py-3 font-medium">Total Partners</th>
            <th className="text-right px-4 py-3 font-medium">Risky Partners</th>
            <th className="text-right px-4 py-3 font-medium">Risky Ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const pct = Math.round(r.risky_partner_ratio * 100)
            return (
              <tr key={r.gstin} className="border-b border-border/60 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono text-xs text-accent">{r.gstin}</td>
                <td className="px-4 py-3 text-right text-muted">{r.total_partners}</td>
                <td className="px-4 py-3 text-right text-danger font-medium">{r.risky_partners}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-danger rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-danger">{pct}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
