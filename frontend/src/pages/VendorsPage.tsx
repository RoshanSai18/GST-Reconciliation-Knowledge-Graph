import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Cpu, TrendingUp, ChevronDown } from 'lucide-react'
import RiskBadge from '@/components/shared/RiskBadge'
import TrustGauge from '@/components/shared/TrustGauge'
import { vendorsApi } from '@/lib/api'
import { fmtDate } from '@/lib/utils'

interface Vendor {
  gstin:               string
  state_code:          string | null
  registration_status: string | null
  compliance_score:    number | null
  risk_level:          string | null
  total_invoices:      number | null
  high_risk_count:     number | null
}

interface VendorProfile {
  taxpayer:         Record<string, unknown>
  compliance_score: number
  risk_level:       string
  score_breakdown:  Record<string, unknown>
  filing_history:   { tax_period: string; gstr1_filed: boolean; gstr3b_filed: boolean; payment_delay_days: number }[]
  invoices:         unknown[]
  pattern_flags:    string[]
}

export default function VendorsPage() {
  const [vendors,  setVendors]  = useState<Vendor[]>([])
  const [loading,  setLoading]  = useState(false)
  const [scoring,  setScoring]  = useState(false)
  const [training, setTraining] = useState(false)
  const [profile,  setProfile]  = useState<VendorProfile | null>(null)
  const [profLoad, setProfLoad] = useState(false)
  const [msg, setMsg]           = useState('')

  const load = useCallback(() => {
    setLoading(true)
    vendorsApi.list({ limit: 200 })
      .then(r => {
        const d = r.data as { items?: Vendor[] }
        setVendors(d.items ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleScore() {
    setScoring(true); setMsg('')
    try {
      const r = await vendorsApi.score()
      const d = r.data as { total_scored?: number; low?: number; medium?: number; high?: number }
      setMsg(`Scored ${d.total_scored ?? 0} vendors — Low: ${d.low??0}, Medium: ${d.medium??0}, High: ${d.high??0}`)
      load()
    } catch { setMsg('Scoring failed. Ensure reconciliation has been run first.') }
    finally { setScoring(false) }
  }

  async function handleTrain() {
    setTraining(true); setMsg('')
    try {
      const r = await vendorsApi.train()
      const d = r.data as { n_vendors?: number; rf_trained?: boolean }
      setMsg(`Model trained on ${d.n_vendors ?? 0} vendors. RandomForest: ${d.rf_trained ? 'Yes' : 'No'}`)
    } catch { setMsg('Training failed. Run reconciliation first to generate labels.') }
    finally { setTraining(false) }
  }

  function openProfile(gstin: string) {
    setProfLoad(true); setProfile(null)
    vendorsApi.profile(gstin)
      .then(r => setProfile(r.data as VendorProfile))
      .catch(() => {})
      .finally(() => setProfLoad(false))
  }

  function scoreBar(val: number | null) {
    const v = val ?? 50
    const color = v >= 75 ? '#10B981' : v >= 50 ? '#F59E0B' : '#EF4444'
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: color }} />
        </div>
        <span className="text-xs font-mono font-medium w-8 text-right" style={{ color }}>{v}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleTrain}
          disabled={training}
          className="flex items-center gap-2 bg-surface border border-border hover:border-accent/50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
        >
          <Cpu size={14} className={training ? 'animate-pulse text-accent' : 'text-muted'} />
          {training ? 'Training…' : 'Train ML Model'}
        </button>
        <button
          onClick={handleScore}
          disabled={scoring}
          className="flex items-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-glow"
        >
          <TrendingUp size={14} />
          {scoring ? 'Scoring…' : 'Score All Vendors'}
        </button>
        <button onClick={load} className="bg-surface border border-border rounded-lg p-2 text-muted hover:text-foreground transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        {msg && <span className="text-xs text-muted ml-2">{msg}</span>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        {/* Vendor table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="text-left px-4 py-3 font-medium">GSTIN</th>
                  <th className="text-left px-4 py-3 font-medium">State</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium w-40">Compliance</th>
                  <th className="text-left px-4 py-3 font-medium">Risk</th>
                  <th className="text-right px-4 py-3 font-medium">Invoices</th>
                  <th className="text-right px-4 py-3 font-medium">High-Risk</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="text-center py-12 text-muted">Loading…</td></tr>}
                {!loading && vendors.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-muted">
                    No vendors yet. Upload taxpayers.xlsx first.
                  </td></tr>
                )}
                {!loading && vendors.map(v => (
                  <tr
                    key={v.gstin}
                    className="border-b border-border/60 hover:bg-white/[0.03] cursor-pointer transition-colors"
                    onClick={() => openProfile(v.gstin)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-accent">{v.gstin}</td>
                    <td className="px-4 py-3 text-muted text-xs">{v.state_code ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">{v.registration_status ?? 'Active'}</td>
                    <td className="px-4 py-3">{scoreBar(v.compliance_score)}</td>
                    <td className="px-4 py-3">{v.risk_level ? <RiskBadge level={v.risk_level} /> : <RiskBadge level="Medium" />}</td>
                    <td className="px-4 py-3 text-right text-muted">{v.total_invoices ?? 0}</td>
                    <td className="px-4 py-3 text-right text-danger">{v.high_risk_count ?? 0}</td>
                    <td className="px-4 py-3"><ChevronDown size={12} className="text-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Profile panel */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
          {profLoad && <div className="flex-1 flex items-center justify-center text-muted">Loading…</div>}
          {!profLoad && !profile && (
            <div className="flex-1 flex items-center justify-center text-muted text-sm p-8 text-center">
              Click a vendor row to see its full risk profile
            </div>
          )}
          {!profLoad && profile && <VendorProfilePanel profile={profile} />}
        </div>
      </div>
    </div>
  )
}

function VendorProfilePanel({ profile }: { profile: VendorProfile }) {
  const tp = profile.taxpayer as Record<string, string | number>
  const sb = profile.score_breakdown as Record<string, number | boolean>

  const features: [string, string][] = [
    ['Filing Consistency',  (((sb.filing_consistency as number | undefined) ?? 0) * 100).toFixed(0) + '%'],
    ['Avg Delay Days',      String(sb.avg_payment_delay_days ?? 0)],
    ['Amendment Rate',      (((sb.amendment_rate as number | undefined) ?? 0) * 100).toFixed(1) + '%'],
    ['Value Mismatch Rate', (((sb.value_mismatch_rate as number | undefined) ?? 0) * 100).toFixed(1) + '%'],
  ]

  return (
    <div className="overflow-y-auto p-5 space-y-4 text-sm animate-slide-in">
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-1">Vendor Profile</p>
        <p className="font-bold text-foreground font-mono text-xs">{String(tp.gstin ?? '')}</p>
        <p className="text-xs text-muted mt-0.5">{String(tp.legal_name ?? tp.trade_name ?? '')}</p>
      </div>

      <div className="flex justify-center py-3">
        <TrustGauge value={Math.round(profile.compliance_score)} size={120} label="Compliance Score" />
      </div>

      {/* Score breakdown */}
      <div>
        <p className="text-xs font-medium text-muted mb-2">Score Breakdown</p>
        <div className="space-y-2">
          {features.map(([k, v]) => (
            <div key={k} className="flex justify-between bg-bg rounded-lg border border-border px-3 py-2">
              <span className="text-xs text-muted">{k}</span>
              <span className="text-xs font-mono font-medium text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pattern flags */}
      {profile.pattern_flags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-2">Pattern Flags</p>
          <div className="flex flex-wrap gap-2">
            {profile.pattern_flags.map(f => (
              <span key={f} className="text-xs bg-danger/10 border border-danger/25 text-danger px-2 py-1 rounded-md font-mono">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Filing history */}
      {profile.filing_history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-2">Filing History</p>
          <div className="space-y-1.5">
            {profile.filing_history.slice(0, 6).map(f => (
              <div key={f.tax_period} className="flex items-center gap-3 text-xs bg-bg rounded-lg border border-border px-3 py-2">
                <span className="text-muted font-mono w-16">{f.tax_period}</span>
                <span className={f.gstr1_filed ? 'text-success' : 'text-danger'}>G1: {f.gstr1_filed ? '✓' : '✗'}</span>
                <span className={f.gstr3b_filed ? 'text-success' : 'text-danger'}>G3B: {f.gstr3b_filed ? '✓' : '✗'}</span>
                <span className="text-muted ml-auto">{f.payment_delay_days}d</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
