import { useRef, useState } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { uploadApi } from '@/lib/api'

interface ZoneConfig {
  key:      string
  label:    string
  ext:      string
  hint:     string
  order:    number
  apiCall:  (f: File) => Promise<unknown>
}

const ZONES: ZoneConfig[] = [
  {
    key: 'taxpayers', label: 'Taxpayers',
    ext: '.xlsx,.csv', hint: 'gstin, legal_name, state_code, registration_status, …',
    order: 1,
    apiCall: (f) => uploadApi.taxpayers(f),
  },
  {
    key: 'invoices', label: 'Invoices',
    ext: '.xlsx,.csv', hint: 'invoice_id, invoice_number, invoice_date, supplier_gstin, buyer_gstin, total_value, …',
    order: 2,
    apiCall: (f) => uploadApi.invoices(f),
  },
  {
    key: 'gstr1', label: 'GSTR-1 Returns',
    ext: '.xlsx,.csv', hint: 'return_id, gstin, tax_period, filing_date, invoice_count, …',
    order: 3,
    apiCall: (f) => uploadApi.gstr1(f),
  },
  {
    key: 'gstr2b', label: 'GSTR-2B Returns',
    ext: '.xlsx,.csv', hint: 'return_id, gstin, tax_period, auto_draft_date, itc_eligible, …',
    order: 3,
    apiCall: (f) => uploadApi.gstr2b(f),
  },
  {
    key: 'gstr3b', label: 'GSTR-3B Returns',
    ext: '.xlsx,.csv', hint: 'return_id, gstin, tax_period, filing_date, tax_paid, …',
    order: 3,
    apiCall: (f) => uploadApi.gstr3b(f),
  },
  {
    key: 'tax_payments', label: 'Tax Payments',
    ext: '.xlsx,.csv', hint: 'payment_id, gstin, amount_paid, payment_date, ledger_head, …',
    order: 4,
    apiCall: (f) => uploadApi.taxPayments(f),
  },
]

type ResultPayload = { loaded: number; skipped: number; errors?: number } | { detail: string }

interface ZoneState {
  file:    File | null
  loading: boolean
  result:  ResultPayload | null
  error:   string | null
}

const initialZoneState = (): ZoneState => ({ file: null, loading: false, result: null, error: null })

export default function UploadPage() {
  const [zones, setZones] = useState<Record<string, ZoneState>>(
    Object.fromEntries(ZONES.map(z => [z.key, initialZoneState()]))
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload order hint */}
      <div className="bg-accent/8 border border-accent/20 rounded-xl px-5 py-4 text-sm">
        <p className="text-accent font-semibold mb-1">Recommended Upload Order</p>
        <p className="text-muted text-xs mt-1">
          1. Taxpayers → 2. Invoices → 3. GSTR-1, GSTR-2B, GSTR-3B (any order) → 4. Tax Payments.
          After all uploads complete, go to <strong className="text-foreground">Invoices</strong> and click
          <strong className="text-foreground"> Run Reconciliation</strong>.
        </p>
      </div>

      {/* Zone grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ZONES.map(zone => (
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
  )
}

/* ---- DropZone component ---- */

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

  return (
    <div className={`bg-surface border rounded-xl p-5 space-y-3 transition-all ${
      dragging ? 'border-accent/60 bg-accent/5 shadow-glow' : 'border-border'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-accent/10">
          <FileSpreadsheet size={14} className="text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{zone.label}</p>
          <p className="text-xs text-muted">Step {zone.order}</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-accent bg-accent/5'
            : state.file
            ? 'border-success/40 bg-success/5'
            : 'border-border hover:border-border/80'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onDrop(zone.key, e.dataTransfer.files) }}
      >
        <Upload size={20} className={`mx-auto mb-2 ${state.file ? 'text-success' : 'text-muted'}`} />
        {state.file ? (
          <p className="text-xs font-medium text-success">{state.file.name}</p>
        ) : (
          <>
            <p className="text-xs font-medium text-foreground">Drop file here or click to browse</p>
            <p className="text-xs text-muted mt-1">Accepts .xlsx or .csv</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={zone.ext}
          className="hidden"
          onChange={e => onDrop(zone.key, e.target.files)}
        />
      </div>

      {/* Hint */}
      <p className="text-xs text-muted leading-relaxed">{zone.hint}</p>

      {/* Upload button */}
      <button
        onClick={() => onUpload(zone)}
        disabled={!state.file || state.loading}
        className="w-full bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-all shadow-glow"
      >
        {state.loading ? 'Uploading…' : 'Upload'}
      </button>

      {/* Result */}
      {result && !('detail' in result) && (
        <div className="flex items-start gap-2 bg-success/8 border border-success/25 rounded-lg px-3 py-2.5">
          <CheckCircle size={14} className="text-success mt-px shrink-0" />
          <div className="text-xs">
            <span className="text-success font-semibold">{result.loaded} loaded</span>
            {(result.skipped ?? 0) > 0 && <span className="text-muted ml-2">{result.skipped} skipped</span>}
            {(result.errors  ?? 0) > 0 && <span className="text-warning ml-2">{result.errors} errors</span>}
          </div>
        </div>
      )}
      {result && 'detail' in result && (
        <div className="flex items-start gap-2 bg-danger/8 border border-danger/25 rounded-lg px-3 py-2.5">
          <AlertCircle size={14} className="text-danger mt-px shrink-0" />
          <p className="text-xs text-danger">{result.detail}</p>
        </div>
      )}
      {state.error && (
        <div className="flex items-start gap-2 bg-danger/8 border border-danger/25 rounded-lg px-3 py-2.5">
          <AlertCircle size={14} className="text-danger mt-px shrink-0" />
          <p className="text-xs text-danger">{state.error}</p>
        </div>
      )}
    </div>
  )
}
