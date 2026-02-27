import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitMerge, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { login }        = useAuth()
  const navigate         = useNavigate()
  const [user, setUser]  = useState('')
  const [pass, setPass]  = useState('')
  const [show, setShow]  = useState(false)
  const [err, setErr]    = useState('')
  const [busy, setBusy]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await login(user, pass)
      navigate('/dashboard', { replace: true })
    } catch {
      setErr('Invalid credentials — check username / password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      {/* Subtle radial */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(79,70,229,0.06),transparent_60%)]" />

      <div className="relative w-full max-w-[400px] animate-fade-in-up">
        {/* Card — borderless, deep shadow */}
        <div className="bg-surface rounded-2xl p-8 shadow-card-lg">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-glow">
              <GitMerge size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Graph<span className="text-accent">GST</span>
              </h1>
              <p className="text-[11px] text-muted">AI Reconciliation Engine</p>
            </div>
          </div>

          <h2 className="text-[17px] font-bold text-foreground mb-1">Welcome back</h2>
          <p className="text-[13px] text-muted mb-6">Sign in to access the reconciliation dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-cap block mb-1.5">Username</label>
              <input
                type="text"
                value={user}
                onChange={e => setUser(e.target.value)}
                required
                autoFocus
                placeholder="admin"
                className="w-full bg-bg rounded-xl px-4 py-2.5 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
                style={{ border: '1px solid #E4E4E7' }}
              />
            </div>

            <div>
              <label className="label-cap block mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-bg rounded-xl px-4 py-2.5 pr-10 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
                  style={{ border: '1px solid #E4E4E7' }}
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {err && (
              <div className="flex items-center gap-2 text-danger text-[12px] bg-danger-lt rounded-xl px-3 py-2.5">
                <AlertCircle size={14} className="flex-shrink-0" />
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !user || !pass}
              className="w-full bg-accent hover:bg-accent-h disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-[13px] transition-all shadow-glow hover:shadow-none mt-2"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Security note */}
          <div className="flex items-center gap-2 mt-6 pt-5" style={{ borderTop: '1px solid #F4F4F5' }}>
            <Shield size={12} className="text-subtle flex-shrink-0" />
            <p className="text-[11px] text-subtle">
              Default: <span className="font-mono text-muted">admin</span> /
              <span className="font-mono text-muted"> admin@gst123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
