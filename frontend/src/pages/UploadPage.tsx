import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, ChevronRight, Network } from 'lucide-react'
import { uploadApi } from '@/lib/api'

interface ZoneConfig {
  key:      string
  label:    string
  ext:      string
  hint:     string
  order:    number
  apiCall:  (f: File) => Promise<unknown>
}

// Grouped into steps for the stepper
const STEPS: { step: number; title: string; description: string; zones: ZoneConfig[] }[] = [
  {
    step: 1,
    title: 'Taxpayers',
    description: 'Register all GSTIN entities before any returns.',
    zones: [{
      key: 'taxpayers', label: 'Taxpayers',
      ext: '.xlsx,.csv', hint: 'gstin, legal_name, state_code, registration_status, …',
      order: 1,
      apiCall: (f) => uploadApi.taxpayers(f),
    }],
  },
  {
    step: 2,
    title: 'Invoices',
    description: 'Upload B2B invoice data.',
    zones: [{
      key: 'invoices', label: 'Invoices',
      ext: '.xlsx,.csv', hint: 'invoice_id, invoice_number, invoice_date, supplier_gstin, buyer_gstin, total_value, …',
      order: 2,
      apiCall: (f) => uploadApi.invoices(f),
    }],
  },
  {
    step: 3,
    title: 'GST Returns',
    description: 'Upload GSTR-1, GSTR-2B, and GSTR-3B in any order.',
    zones: [
      {
        key: 'gstr1', label: 'GSTR-1',
        ext: '.xlsx,.csv', hint: 'return_id, gstin, tax_period, filing_date, invoice_count, …',
        order: 3, apiCall: (f) => uploadApi.gstr1(f),
      },
      {
        key: 'gstr2b', label: 'GSTR-2B',
        ext: '.xlsx,.csv', hint: 'return_id, gstin, tax_period, auto_draft_date, itc_eligible, …',
        order: 3, apiCall: (f) => uploadApi.gstr2b(f),
      },
      {
        key: 'gstr3b', label: 'GSTR-3B',
        ext: '.xlsx,.csv', hint: 'return_id, gstin, tax_period, filing_date, tax_paid, …',
        order: 3, apiCall: (f) => uploadApi.gstr3b(f),
      },
    ],
  },
  {
    step: 4,
    title: 'Tax Payments',
    description: 'Upload challan / ledger payment records.',
    zones: [{
      key: 'tax_payments', label: 'Tax Payments',
      ext: '.xlsx,.csv', hint: 'payment_id, gstin, amount_paid, payment_date, ledger_head, …',
      order: 4, apiCall: (f) => uploadApi.taxPayments(f),
    }],
  },
]

type ResultPayload = { loaded: number; skipped: number; errors?: number } | { detail: string }
interface ZoneState { file: File | null; loading: boolean; result: ResultPayload | null; error: string | null }
const initialZoneState = (): ZoneState => ({ file: null, loading: false, result: null, error: null })

export default function UploadPage() {
  const navigate = useNavigate()
  const allKeys = STEPS.flatMap(s => s.zones.map(z => z.key))
  const [zones, setZones] = useState<Record<string, ZoneState>>(
    Object.fromEntries(allKeys.map(k => [k, initialZoneState()]))
  )

  function updateZone(key: string, patch: Partial<ZoneState>) {
    setZones(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function handleDrop(key: string, files: FileList | null) {
    if (!files || !files[0]) return
    updateZone(key, { file: files[0], result: null, error: null })
  }

  async function handleUpload(zone: ZoneConfig) {
    const z = zones[zone.key]
    if (!z.file) return
    updateZone(zone.key, { loading: true, result: null, error: null })
    try {
      const r = await zone.apiCall(z.file)
      updateZone(zone.key, { loading: false, result: (r as { data: ResultPayload }).data })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail ?? 'Upload failed'
      updateZone(zone.key, { loading: false, error: msg })
    }
  }

  // determine if step has any uploaded zone
  function stepDone(step: { zones: ZoneConfig[] }) {
    return step.zones.every(z => {
      const r = zones[z.key].result
      return r !== null && !('detail' in r)
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in-up">
      {/* Header hint */}
      <div className="bg-accent-lt rounded-2xl px-5 py-4">
        <p className="text-[13px] font-semibold text-accent">Recommended Upload Order</p>
        <p className="text-xs text-muted mt-1">
          Follow steps 1 → 4 below. After all uploads complete, go to{' '}
          <strong className="text-foreground">Invoices</strong> and click{' '}
          <strong className="text-foreground">Run Reconciliation</strong>.
        </p>
      </div>

      {/* All-done CTA */}
      {STEPS.every(s => stepDone(s)) && (
        <div className="bg-gradient-to-r from-accent to-indigo-500 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 shadow-glow animate-fade-in-up">
          <div>
            <p className="text-[13px] font-bold text-white">🎉 All data uploaded!</p>
            <p className="text-xs text-white/80 mt-0.5">Head to the Knowledge Graph to explore relationships and run reconciliation.</p>
          </div>
          <button
            onClick={() => navigate('/graph')}
            className="flex items-center gap-1.5 bg-white text-accent text-[12px] font-bold px-4 py-2 rounded-xl whitespace-nowrap hover:bg-white/90 transition-colors"
          >
            <Network size={13} /> View Graph
          </button>
        </div>
      )}

      {/* Vertical stepper */}
      <div className="space-y-3">
        {STEPS.map((step, si) => {
          const done = stepDone(step)
          return (
            <div key={step.step} className="flex gap-4">
              {/* Step indicator + connector */}
              <div className="flex flex-col items-center gap-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors duration-300 ${
                  done
                    ? 'bg-success text-white shadow-success'
                    : 'bg-surface text-accent shadow-card'
                }`} style={!done ? { border: '2px solid #4F46E5' } : {}}>
                  {done ? '✓' : step.step}
                </div>
                {si < STEPS.length - 1 && (
                  <div className={`w-px flex-1 min-h-[16px] mt-1 transition-colors duration-300 ${done ? 'bg-success/30' : 'bg-border'}`} />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[14px] font-bold text-foreground">{step.title}</p>
                  {done && <span className="text-[10px] font-semibold text-success bg-[#ECFDF5] px-2 py-0.5 rounded-full tracking-wide">DONE</span>}
                </div>
                <p className="text-xs text-muted mb-3">{step.description}</p>

                <div className={`grid gap-3 ${step.zones.length > 1 ? 'md:grid-cols-3' : 'grid-cols-1'}`}>
                  {step.zones.map(zone => (
                    <DropZone
                      key={zone.key}
                      zone={zone}
                      state={zones[zone.key]}
                      onDrop={handleDrop}
                      onUpload={handleUpload}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── DropZone ────────────────────────────────────────────────────────────── */
function DropZone({
  zone, state, onDrop, onUpload
}: {
  zone:     ZoneConfig
  state:    ZoneState
  onDrop:   (key: string, files: FileList | null) => void
  onUpload: (zone: ZoneConfig) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const result = state.result as { loaded?: number; skipped?: number; errors?: number; detail?: string } | null
  const isSuccess = result && !('detail' in result)

  return (
    <div className={`bg-surface rounded-2xl p-4 space-y-3 shadow-card transition-all duration-300 ${
      dragging ? 'shadow-glow ring-2 ring-accent/30' : ''
    } ${isSuccess ? 'ring-1 ring-success/30' : ''}`}>
      {/* Label */}
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${isSuccess ? 'bg-[#ECFDF5]' : 'bg-accent-lt'}`}>
          <FileSpreadsheet size={13} className={isSuccess ? 'text-success' : 'text-accent'} />
        </div>
        <p className="text-[13px] font-semibold text-foreground">{zone.label}</p>
      </div>

      {/* Drop target */}
      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
          dragging
            ? 'border-accent bg-accent-lt'
            : isSuccess
            ? 'border-success/40 bg-[#F0FDF4]'
            : state.file
            ? 'border-accent/40 bg-accent-lt/50'
            : 'border-border hover:border-accent/40 hover:bg-accent-lt/30'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onDrop(zone.key, e.dataTransfer.files) }}
      >
        <Upload size={18} className={`mx-auto mb-1.5 transition-colors ${isSuccess ? 'text-success' : state.file ? 'text-accent' : 'text-subtle'}`} />
        {state.file ? (
          <p className={`text-[11px] font-semibold truncate max-w-full px-1 ${isSuccess ? 'text-success' : 'text-accent'}`}>
            {state.file.name}
          </p>
        ) : (
          <>
            <p className="text-[11px] font-medium text-foreground">Drop or click to browse</p>
            <p className="text-[10px] text-subtle mt-0.5">.xlsx or .csv</p>
          </>
        )}
        <input ref={inputRef} type="file" accept={zone.ext} className="hidden"
          onChange={e => onDrop(zone.key, e.target.files)} />
      </div>

      {/* Column hint */}
      <p className="text-[10px] text-subtle leading-relaxed">{zone.hint}</p>

      {/* Upload button */}
      {!isSuccess && (
        <button
          onClick={() => onUpload(zone)}
          disabled={!state.file || state.loading}
          className="w-full flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-h disabled:opacity-40 text-white text-[12px] font-semibold py-2 rounded-xl transition-all shadow-glow"
        >
          {state.loading
            ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full" /> Uploading…</>
            : <><ChevronRight size={13} /> Upload</>}
        </button>
      )}

      {/* Success result */}
      {isSuccess && (
        <div className="flex items-center gap-2 bg-[#ECFDF5] rounded-xl px-3 py-2">
          <CheckCircle size={13} className="text-success flex-shrink-0" />
          <span className="text-[11px] text-success font-semibold">{result?.loaded} loaded</span>
          {(result?.skipped ?? 0) > 0 && <span className="text-[11px] text-muted ml-1">{result?.skipped} skipped</span>}
        </div>
      )}

      {/* Error */}
      {(state.error || (result && 'detail' in result)) && (
        <div className="flex items-start gap-2 bg-danger-lt rounded-xl px-3 py-2">
          <AlertCircle size={13} className="text-danger mt-px flex-shrink-0" />
          <p className="text-[11px] text-danger">{state.error ?? (result as { detail: string } | null)?.detail}</p>
        </div>
      )}
    </div>
  )
}
