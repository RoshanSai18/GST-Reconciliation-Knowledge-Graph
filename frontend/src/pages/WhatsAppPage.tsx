import { useState } from 'react'
import {
  Send,
  FileBarChart,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import { whatsappApi } from '@/lib/api'

/* ------------------------------------------------------------------ */
/* Mock GST analysis payload (used for "Send Report")                 */
/* ------------------------------------------------------------------ */
const MOCK_ANALYSIS = {
  overallScore: 72,
  audit: [
    { category: 'ITC Mismatch',      score: 45, status: 'Critical' },
    { category: 'Filing Compliance',  score: 62, status: 'Warning' },
    { category: 'Vendor Verification', score: 88, status: 'OK' },
    { category: 'Payment Delays',    score: 35, status: 'Critical' },
    { category: 'Invoice Matching',  score: 79, status: 'OK' },
  ],
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export default function WhatsAppPage() {
  const [phone, setPhone]       = useState('')
  const [message, setMessage]   = useState('')
  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState<{ ok: boolean; text: string } | null>(null)

  /* ---- helpers --------------------------------------------------- */
  const flash = (ok: boolean, text: string) => {
    setResult({ ok, text })
    setTimeout(() => setResult(null), 5000)
  }

  const handleSendMessage = async () => {
    if (!phone.trim() || !message.trim()) {
      flash(false, 'Phone number and message are required')
      return
    }
    setSending(true)
    try {
      await whatsappApi.send(phone.trim(), message.trim())
      flash(true, 'Message sent successfully!')
      setMessage('')
    } catch (err: any) {
      flash(false, err?.response?.data?.detail ?? 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleSendReport = async () => {
    if (!phone.trim()) {
      flash(false, 'Phone number is required')
      return
    }
    setSending(true)
    try {
      await whatsappApi.sendReport(phone.trim(), MOCK_ANALYSIS)
      flash(true, 'GST audit report sent!')
    } catch (err: any) {
      flash(false, err?.response?.data?.detail ?? 'Failed to send report')
    } finally {
      setSending(false)
    }
  }

  /* ---- render ---------------------------------------------------- */
  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div
        className="rounded-2xl p-6 flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)' }}
      >
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
          <MessageSquare size={26} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">WhatsApp Notifications</h2>
          <p className="text-white/80 text-sm">
            Send GST reconciliation alerts &amp; reports directly to WhatsApp
          </p>
        </div>
      </div>

      {/* Status toast */}
      {result && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
            result.ok
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {result.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---- Left: Send Message ----- */}
        <div className="rounded-2xl bg-surface p-6 shadow-card space-y-5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-base">
            <Send size={18} className="text-accent" />
            Send WhatsApp Message
          </div>

          {/* Phone */}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              Recipient Phone
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-[#E4E4E7] px-3 py-2.5 bg-bg focus-within:ring-2 focus-within:ring-accent/30">
              <Phone size={16} className="text-muted flex-shrink-0" />
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="bg-transparent outline-none text-sm text-foreground w-full placeholder:text-muted"
              />
            </div>
          </label>

          {/* Message */}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              Message
            </span>
            <textarea
              rows={4}
              placeholder="Type your message…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full rounded-xl border border-[#E4E4E7] px-3 py-2.5 bg-bg text-sm text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/30 resize-none"
            />
          </label>

          <button
            onClick={handleSendMessage}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-white font-medium py-2.5 text-sm hover:opacity-90 transition disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send Message
          </button>
        </div>

        {/* ---- Right: Send Report ----- */}
        <div className="rounded-2xl bg-surface p-6 shadow-card space-y-5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-base">
            <FileBarChart size={18} className="text-accent" />
            Send GST Audit Report
          </div>

          <p className="text-sm text-muted">
            Sends a pre-formatted GST reconciliation summary to the specified
            WhatsApp number, including overall compliance score and top risk
            areas.
          </p>

          {/* Preview card */}
          <div className="rounded-xl border border-[#E4E4E7] bg-bg p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Overall Score</span>
              <span className="font-bold text-amber-600">72 / 100</span>
            </div>
            <div className="space-y-1.5">
              {MOCK_ANALYSIS.audit.map(a => (
                <div key={a.category} className="flex items-center justify-between">
                  <span className="text-muted flex items-center gap-1.5">
                    {a.status === 'Critical' ? (
                      <XCircle size={13} className="text-red-500" />
                    ) : a.status === 'Warning' ? (
                      <AlertTriangle size={13} className="text-amber-500" />
                    ) : (
                      <ShieldCheck size={13} className="text-emerald-500" />
                    )}
                    {a.category}
                  </span>
                  <span className="font-medium text-foreground">{a.score}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSendReport}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white font-medium py-2.5 text-sm hover:opacity-90 transition disabled:opacity-50"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileBarChart size={16} />
            )}
            Send Audit Report via WhatsApp
          </button>
        </div>
      </div>

      {/* Sandbox hint */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Twilio Sandbox:</strong> The recipient must first send{' '}
          <code className="bg-amber-100 px-1 rounded text-xs">join &lt;sandbox-code&gt;</code>{' '}
          to <strong>+1 415 523 8886</strong> on WhatsApp before they can receive messages.
        </span>
      </div>
    </div>
  )
}
