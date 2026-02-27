import { Bell, Search, User } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/invoices':  'Invoice Ledger',
  '/vendors':   'Vendor Risk Registry',
  '/graph':     'Supply Chain Graph Explorer',
  '/patterns':  'Anomaly Pattern Detection',
  '/upload':    'Data Ingestion',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'GraphGST'

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-surface flex-shrink-0">
      {/* Page title */}
      <h1 className="text-base font-semibold text-foreground">{title}</h1>

      {/* Search + actions */}
      <div className="flex items-center gap-4">
        {/* Search bar */}
        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Search GSTIN, Invoice, or e-Way Bill..."
            className="w-72 bg-bg border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-colors"
          />
        </div>

        {/* Notification bell */}
        <button className="relative p-2 rounded-lg text-muted hover:text-foreground hover:bg-black/5 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full ring-2 ring-surface" />
        </button>

        {/* Avatar */}
        <button className="w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent hover:bg-accent/20 transition-colors">
          <User size={15} />
        </button>
      </div>
    </header>
  )
}
