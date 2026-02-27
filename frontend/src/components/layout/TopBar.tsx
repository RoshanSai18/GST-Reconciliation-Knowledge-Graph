import { Bell, Search, LogOut } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/profile':   { title: 'Profile',                      sub: 'Your account details and session info' },
  '/dashboard': { title: 'Dashboard',                    sub: 'Overview of reconciliation health' },
  '/invoices':  { title: 'Invoice Ledger',               sub: 'Browse and reconcile invoices' },
  '/vendors':   { title: 'Vendor Risk Registry',         sub: 'Compliance scoring and profiling' },
  '/graph':     { title: 'Supply Chain Graph Explorer',  sub: 'Visualise entity relationships' },
  '/patterns':  { title: 'Anomaly Pattern Detection',    sub: 'Circular trades, delays & amendments' },
  '/upload':    { title: 'Data Ingestion',               sub: 'Upload taxpayer and return data' },
}

export default function TopBar() {
  const { pathname } = useLocation()
  const meta = PAGE_META[pathname] ?? { title: 'GraphGST', sub: '' }
  const { logout, username } = useAuth()

  // Derive initials for the avatar
  const initials = username
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header
      className="h-16 flex items-center justify-between px-6 bg-surface flex-shrink-0"
      style={{ borderBottom: '1px solid #E4E4E7' }}
    >
      {/* Page title + breadcrumb */}
      <div>
        <h1 className="text-[15px] font-bold text-foreground leading-tight">{meta.title}</h1>
        {meta.sub && <p className="text-[11px] text-muted mt-0.5">{meta.sub}</p>}
      </div>

      {/* Search + actions */}
      <div className="flex items-center gap-3">
        {/* Search bar */}
        <div className="relative hidden md:block">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Search GSTIN, invoice, e-way bill…"
            className="w-64 bg-bg rounded-xl pl-9 pr-4 py-2 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
            style={{ border: '1px solid #E4E4E7' }}
          />
        </div>

        {/* Bell */}
        <button className="relative p-2 rounded-xl text-muted hover:text-foreground hover:bg-bg transition-colors duration-200">
          <Bell size={17} />
          <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-danger rounded-full ring-2 ring-surface" />
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full bg-accent-lt border border-accent/20 flex items-center justify-center"
            title={username}
          >
            <span className="text-[12px] font-bold text-accent">{initials}</span>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 rounded-xl text-subtle hover:text-danger hover:bg-danger/10 transition-colors duration-200"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
