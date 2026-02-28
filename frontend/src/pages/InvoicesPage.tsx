import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, X, ExternalLink, RefreshCw, Upload } from 'lucide-react'
import RiskBadge from '@/components/shared/RiskBadge'
import { TableSkeleton } from '@/components/shared/Skeleton'
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
  gstr1_taxable_value?: number
  pr_taxable_value?: number
  taxable_value?: number
  cgst?: number
  sgst?: number
  igst?: number
  source_type?: string
  confidence_score?: number
  value_comparison?: { gstr1_taxable_value?: number; pr_taxable_value?: number; authoritative_value?: number; difference?: number; difference_pct?: number; within_tolerance?: boolean }
  path_hops?:        { hop: string; present: boolean }[]
  payments?:         { payment_id: string; amount_paid: number; payment_date: string; payment_mode?: string }[]
  gstr1?:            { return_id: string; gstin: string; tax_period: string; filing_date: string } | null
  gstr2b?:           { return_id: string; gstin: string; tax_period: string; generation_date: string } | null
  gstr3b?:           { return_id: string; gstin: string; tax_period: string; filing_date: string; tax_payable?: number; tax_paid?: number } | null
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
    const searchTerm = gstin.trim().toUpperCase()
    if (searchTerm) {
      // Send as both gstin and invoice_number - backend will match either
      params.gstin = searchTerm
      params.invoice_number = searchTerm
      console.log(`[Invoices] Searching for: "${searchTerm}"`)
    }
    if (status) params.status = status
    invoicesApi.list(params)
      .then(r => {
        const d = r.data as { items: Invoice[]; total: number }
        console.log(`[Invoices] Found ${d.total ?? 0} total, displaying ${(d.items ?? []).length}`)
        setItems(d.items ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(err => {
        console.error(`[Invoices] API error:`, err)
        setItems([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, perPage, gstin, status])

  useEffect(() => { load() }, [load])

  function openDetail(id: string) {
    setDetailLoading(true)
    setSelected(null)
    invoicesApi.detail(id)
      .then(r => {
        // Backend wraps core invoice fields inside r.data.invoice
        const d = r.data as {
          invoice: Invoice
          value_comparison?: InvoiceDetail['value_comparison']
          path_hops?: InvoiceDetail['path_hops']
          payments?: InvoiceDetail['payments']
          gstr1?: InvoiceDetail['gstr1']
          amends?: string | null
          amended_by?: string | null
        }
        const flat: InvoiceDetail = {
          ...(d.invoice ?? (d as unknown as Invoice)),
          value_comparison: d.value_comparison,
          path_hops:        d.path_hops,
          payments:         d.payments,
          gstr1:            d.gstr1,
          amends:           d.amends,
          amended_by:       d.amended_by,
        }
        setSelected(flat)
      })
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
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Search GSTIN or Invoice Number…"
            value={gstin}
            onChange={e => { setGstin(e.target.value); setPage(1) }}
            className="w-full bg-surface rounded-xl pl-8 pr-3 py-2 text-[13px] placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
            style={{ border: '1px solid #E4E4E7' }}
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="bg-surface rounded-xl px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
          style={{ border: '1px solid #E4E4E7' }}
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
        <button
          onClick={load}
          className="bg-surface rounded-xl p-2 text-muted hover:text-foreground shadow-card transition-colors"
          style={{ border: '1px solid #E4E4E7' }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={runReconcile}
          disabled={reconciling}
          className="ml-auto bg-accent hover:bg-accent-h disabled:opacity-50 text-white text-[13px] font-bold px-5 py-2 rounded-xl transition-all shadow-glow"
        >
          {reconciling ? 'Running…' : '⚡ Run Reconciliation'}
        </button>
      </div>

      {/* Total */}
      <p className="text-xs text-muted">{total.toLocaleString()} invoices</p>

      {/* Table */}
      <div className="bg-surface rounded-2xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ borderBottom: '1px solid #F4F4F5' }}>
                <th className="text-left px-4 py-3 font-semibold label-cap">Invoice ID</th>
                <th className="text-left px-4 py-3 font-semibold label-cap">Date</th>
                <th className="text-left px-4 py-3 font-semibold label-cap">Seller GSTIN</th>
                <th className="text-left px-4 py-3 font-semibold label-cap">Buyer GSTIN</th>
                <th className="text-right px-4 py-3 font-semibold label-cap">Value</th>
                <th className="text-left px-4 py-3 font-semibold label-cap">Status</th>
                <th className="text-left px-4 py-3 font-semibold label-cap">Risk</th>
                <th className="w-8 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeleton rows={10} cols={8} />}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <Upload size={22} className="text-muted" />
                    <p className="text-[13px] font-semibold text-foreground">No invoices found</p>
                    <p className="text-[12px] text-muted">Upload your GST files and run reconciliation to populate this table</p>
                    <Link to="/upload" className="mt-1 text-[12px] font-semibold text-accent hover:underline">Go to Upload →</Link>
                  </div>
                </td></tr>
              )}
              {!loading && items.map(inv => (
                <tr
                  key={inv.invoice_id}
                  className="tr-hover"
                  style={{ borderBottom: '1px solid #F4F4F5' }}
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
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid #F4F4F5' }}>
            <span className="text-xs text-muted">Page {page} of {pages}</span>
            <div className="flex gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-bg transition-colors"
                style={{ border: '1px solid #E4E4E7' }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-bg transition-colors"
                style={{ border: '1px solid #E4E4E7' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => { setSelected(null); setDetailLoading(false) }}>
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-card-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 sticky top-0 bg-surface z-10" style={{ borderBottom: '1px solid #F4F4F5' }}>
              <h3 className="font-bold text-foreground">Invoice Detail</h3>
              <button onClick={() => { setSelected(null); setDetailLoading(false) }} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-bg transition-colors">
                <X size={16} />
              </button>
            </div>

            {detailLoading && (
              <div className="p-8 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="skeleton h-16 flex-1 rounded-xl" />
                    <div className="skeleton h-16 flex-1 rounded-xl" />
                  </div>
                ))}
              </div>
            )}

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
                    <div key={String(k)} className="bg-bg rounded-xl p-3">
                      <dt className="label-cap mb-1">{k}</dt>
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

                {/* Value Comparison */}
                {selected.value_comparison && (
                  <div className="bg-info/8 border border-info/25 rounded-lg px-4 py-3 text-sm">
                    <p className="text-xs font-semibold text-info mb-3">Value Comparison</p>
                    <dl className="space-y-2 text-sm">
                      {selected.value_comparison.gstr1_taxable_value != null && (
                        <div className="flex justify-between"><dt className="text-muted">GSTR-1 Value</dt><dd className="font-mono">{fmtCurrency(selected.value_comparison.gstr1_taxable_value, 2)}</dd></div>
                      )}
                      {selected.value_comparison.authoritative_value != null && (
                        <div className="flex justify-between"><dt className="text-muted">Authoritative Value</dt><dd className="font-mono">{fmtCurrency(selected.value_comparison.authoritative_value, 2)}</dd></div>
                      )}
                      {selected.value_comparison.difference != null && (
                        <div className="flex justify-between"><dt className="text-muted">Difference</dt><dd className={`font-mono ${selected.value_comparison.difference > 0 ? 'text-warning' : 'text-success'}`}>{fmtCurrency(selected.value_comparison.difference, 2)}</dd></div>
                      )}
                      {selected.value_comparison.difference_pct != null && (
                        <div className="flex justify-between"><dt className="text-muted">Diff %</dt><dd className="font-mono">{selected.value_comparison.difference_pct.toFixed(2)}%</dd></div>
                      )}
                      {selected.value_comparison.within_tolerance !== undefined && (
                        <div className="flex justify-between"><dt className="text-muted">Within Tolerance</dt><dd className="font-mono">{selected.value_comparison.within_tolerance ? '✓' : '✗'}</dd></div>
                      )}
                    </dl>
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

                {/* GSTR Returns */}
                <div className="space-y-3">
                  {selected.gstr1 && (
                    <div className="border border-border rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-accent mb-2">GSTR-1</p>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div><dt className="text-muted">Return ID</dt><dd className="font-mono">{selected.gstr1.return_id}</dd></div>
                        <div><dt className="text-muted">Period</dt><dd className="font-mono">{selected.gstr1.tax_period}</dd></div>
                        <div className="col-span-2"><dt className="text-muted">Filing Date</dt><dd className="font-mono">{fmtDate(selected.gstr1.filing_date)}</dd></div>
                      </dl>
                    </div>
                  )}
                  {selected.gstr2b && (
                    <div className="border border-border rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-accent mb-2">GSTR-2B</p>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div><dt className="text-muted">Return ID</dt><dd className="font-mono">{selected.gstr2b.return_id}</dd></div>
                        <div><dt className="text-muted">Period</dt><dd className="font-mono">{selected.gstr2b.tax_period}</dd></div>
                        <div className="col-span-2"><dt className="text-muted">Generated</dt><dd className="font-mono">{fmtDate(selected.gstr2b.generation_date)}</dd></div>
                      </dl>
                    </div>
                  )}
                  {selected.gstr3b && (
                    <div className="border border-border rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-accent mb-2">GSTR-3B</p>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div><dt className="text-muted">Return ID</dt><dd className="font-mono">{selected.gstr3b.return_id}</dd></div>
                        <div><dt className="text-muted">Period</dt><dd className="font-mono">{selected.gstr3b.tax_period}</dd></div>
                        <div><dt className="text-muted">Tax Payable</dt><dd className="font-mono">{fmtCurrency(selected.gstr3b.tax_payable ?? 0, 2)}</dd></div>
                        <div><dt className="text-muted">Tax Paid</dt><dd className="font-mono">{fmtCurrency(selected.gstr3b.tax_paid ?? 0, 2)}</dd></div>
                      </dl>
                    </div>
                  )}
                </div>

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
