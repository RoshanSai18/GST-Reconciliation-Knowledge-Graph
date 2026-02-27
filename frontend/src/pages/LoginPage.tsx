import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitMerge, Eye, EyeOff, AlertCircle } from 'lucide-react'
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
      {/* Background grid */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(100,116,139,0.08),transparent_70%)]" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-card">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-glow">
              <GitMerge size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Graph<span className="text-accent">GST</span>
              </h1>
              <p className="text-xs text-muted">AI Reconciliation Engine</p>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-1">Welcome back</h2>
          <p className="text-sm text-muted mb-6">Sign in to access the dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Username</label>
              <input
                type="text"
                value={user}
                onChange={e => setUser(e.target.value)}
                required
                autoFocus
                placeholder="admin"
                className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {err && (
              <div className="flex items-center gap-2 text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2.5">
                <AlertCircle size={14} className="flex-shrink-0" />
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !user || !pass}
              className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-glow hover:shadow-none"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Default: <span className="text-foreground font-mono">admin</span> / <span className="text-foreground font-mono">admin@gst123</span>
          </p>
        </div>
      </div>
    </div>
  )
}
