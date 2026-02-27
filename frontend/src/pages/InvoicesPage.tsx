import { useEffect, useState, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, X, ExternalLink, RefreshCw } from 'lucide-react'
import RiskBadge from '@/components/shared/RiskBadge'
import { invoicesApi, reconcileApi } from '@/lib/api'
import { fmtCurrency, fmtDate } from '@/lib/utils'

interface Invoice {
  invoice_id:      string
  invoice_number:  string
  invoice_date:    string
  supplier_gstin:  string
  buyer_gstin:     string
  total_value:     number
  status:          string
  risk_level:      string | null
  explanation:     string | null
}

interface InvoiceDetail extends Invoice {
  value_comparison?: { gstr1_taxable_value?: number; authoritative_value?: number; difference?: number; within_tolerance?: boolean }
  path_hops?:        { hop: string; present: boolean }[]
  payments?:         { payment_id: string; amount_paid: number; payment_date: string; payment_mode?: string }[]
  gstr1?:            { return_id: string; period: string; filing_date: string } | null
  amends?:           string | null
  amended_by?:       string | null
}

const STATUS_OPTIONS = ['', 'Valid', 'Warning', 'High-Risk', 'Pending']

export default function InvoicesPage() {
  const [items,   setItems]   = useState<Invoice[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [perPage] = useState(50)
  const [gstin,   setGstin]   = useState('')
  const [status,  setStatus]  = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<InvoiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, unknown> = { page, per_page: perPage }
    if (gstin)  params.gstin  = gstin.toUpperCase()
    if (status) params.status = status
    invoicesApi.list(params)
      .then(r => {
        const d = r.data as { items: Invoice[]; total: number }
        setItems(d.items ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, gstin, status])

  useEffect(() => { load() }, [load])

  function openDetail(id: string) {
    setDetailLoading(true)
    invoicesApi.detail(id)
      .then(r => setSelected(r.data as InvoiceDetail))
      .catch(() => setSelected(null))
      .finally(() => setDetailLoading(false))
  }

  async function runReconcile() {
    setReconciling(true)
    try { await reconcileApi.run({}); load() } finally { setReconciling(false) }
  }

  const pages = Math.ceil(total / perPage)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Filter by GSTIN…"
            value={gstin}
            onChange={e => { setGstin(e.target.value); setPage(1) }}
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/60"
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
        <button
          onClick={load}
          className="bg-surface border border-border rounded-lg p-2 text-muted hover:text-foreground transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={runReconcile}
          disabled={reconciling}
          className="ml-auto bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
        >
          {reconciling ? 'Running…' : '⚡ Run Reconciliation'}
        </button>
      </div>

      {/* Total */}
      <p className="text-xs text-muted">{total.toLocaleString()} invoices</p>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="text-left px-4 py-3 font-medium">Invoice ID</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Seller GSTIN</th>
                <th className="text-left px-4 py-3 font-medium">Buyer GSTIN</th>
                <th className="text-right px-4 py-3 font-medium">Total Value</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Risk</th>
                <th className="w-8 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="text-center py-12 text-muted text-sm">Loading…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-muted text-sm">
                  No invoices found. Upload data and run reconciliation first.
                </td></tr>
              )}
              {!loading && items.map(inv => (
                <tr
                  key={inv.invoice_id}
                  className="border-b border-border/60 hover:bg-white/[0.03] cursor-pointer transition-colors"
                  onClick={() => openDetail(inv.invoice_id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-accent">{inv.invoice_id}</td>
                  <td className="px-4 py-3 text-muted">{fmtDate(inv.invoice_date)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{inv.supplier_gstin}</td>
                  <td className="px-4 py-3 font-mono text-xs">{inv.buyer_gstin}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtCurrency(inv.total_value)}</td>
                  <td className="px-4 py-3"><RiskBadge level={inv.status} /></td>
                  <td className="px-4 py-3">{inv.risk_level ? <RiskBadge level={inv.risk_level} /> : '—'}</td>
                  <td className="px-4 py-3"><ExternalLink size={12} className="text-muted" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-border disabled:opacity-30 hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-border disabled:opacity-30 hover:bg-white/5 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-card">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
              <h3 className="font-semibold text-foreground">Invoice Detail</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            {detailLoading && <div className="p-10 text-center text-muted">Loading…</div>}

            {selected && !detailLoading && (
              <div className="px-6 py-5 space-y-5">
                {/* Core fields */}
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    ['Invoice ID',   selected.invoice_id],
                    ['Invoice No',   selected.invoice_number],
                    ['Date',         fmtDate(selected.invoice_date)],
                    ['Total Value',  fmtCurrency(selected.total_value, 2)],
                    ['Seller GSTIN', selected.supplier_gstin],
                    ['Buyer GSTIN',  selected.buyer_gstin],
                    ['Status',       <RiskBadge key="s" level={selected.status} />],
                    ['Risk Level',   selected.risk_level ? <RiskBadge key="r" level={selected.risk_level} /> : '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="bg-bg rounded-lg border border-border p-3">
                      <dt className="text-xs text-muted mb-1">{k}</dt>
                      <dd className="text-sm font-medium font-mono">{v}</dd>
                    </div>
                  ))}
                </dl>

                {/* Explanation */}
                {selected.explanation && (
                  <div className="bg-warning/8 border border-warning/25 rounded-lg px-4 py-3 text-sm text-foreground/80">
                    <p className="text-xs font-semibold text-warning mb-1">AI Explanation</p>
                    {selected.explanation}
                  </div>
                )}

                {/* Path hops */}
                {selected.path_hops && selected.path_hops.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted mb-2">Compliance Path</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.path_hops.map(h => (
                        <div key={h.hop} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
                          h.present ? 'border-success/30 bg-success/8 text-success' : 'border-danger/30 bg-danger/8 text-danger'
                        }`}>
                          {h.present ? '✓' : '✗'} {h.hop}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payments */}
                {selected.payments && selected.payments.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted mb-2">Linked Payments</p>
                    {selected.payments.map(p => (
                      <div key={p.payment_id} className="flex justify-between text-sm bg-bg rounded-lg border border-border px-4 py-2.5 mb-2">
                        <span className="font-mono text-xs text-muted">{p.payment_id}</span>
                        <span className="font-medium text-success">{fmtCurrency(p.amount_paid, 2)}</span>
                        <span className="text-muted text-xs">{fmtDate(p.payment_date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
