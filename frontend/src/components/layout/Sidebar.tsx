import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Users,
  Network,
  AlertTriangle,
  Upload,
  LogOut,
  GitMerge,
  ChevronRight,
  MessageSquare,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/invoices',  icon: FileText,        label: 'Invoices' },
  { to: '/vendors',   icon: Users,           label: 'Vendors' },
  { to: '/graph',     icon: Network,         label: 'Graph Explorer' },
  { to: '/patterns',  icon: AlertTriangle,   label: 'Patterns' },
  { to: '/chat',      icon: MessageSquare,   label: 'Chat Bot' },
  { to: '/upload',    icon: Upload,          label: 'Upload Data' },
]

export default function Sidebar() {
  const { logout } = useAuth()
  const navigate   = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col bg-surface" style={{ boxShadow: '1px 0 0 #E4E4E7' }}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5" style={{ borderBottom: '1px solid #E4E4E7' }}>
        <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center flex-shrink-0 shadow-glow">
          <GitMerge size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Graph<span className="text-accent">GST</span>
          </span>
          <p className="label-cap" style={{ fontSize: '0.55rem', marginTop: 1 }}>AI Reconciliation</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent-lt text-accent'
                  : 'text-muted hover:text-foreground hover:bg-bg'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight size={13} className="opacity-50" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-2.5 pb-4" style={{ borderTop: '1px solid #E4E4E7', paddingTop: '0.75rem' }}>
        <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-xl bg-bg">
          <div className="w-7 h-7 rounded-full bg-accent-lt border border-accent/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-accent">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-foreground truncate">Admin</p>
            <p className="text-[10px] text-muted truncate">GST Officer</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-muted hover:text-danger hover:bg-danger-lt transition-all duration-200"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
