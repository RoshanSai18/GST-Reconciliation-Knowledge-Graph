import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title:      string
  value:      string | number
  subtitle?:  string
  icon:       LucideIcon
  accent?:    'blue' | 'green' | 'amber' | 'red'
  glow?:      boolean
}

const ACCENT_MAP = {
  blue:  { icon: 'bg-accent/10 text-accent',         value: 'text-accent',   bar: 'bg-accent'   },
  green: { icon: 'bg-emerald/15 text-emerald',        value: 'text-emerald',  bar: 'bg-emerald'  },
  amber: { icon: 'bg-amber/15 text-amber',            value: 'text-amber',    bar: 'bg-amber'    },
  red:   { icon: 'bg-danger/10 text-danger',          value: 'text-danger',   bar: 'bg-danger'   },
}

export default function StatCard({ title, value, subtitle, icon: Icon, accent = 'blue', glow }: StatCardProps) {
  const a = ACCENT_MAP[accent]
  return (
    <div className={cn(
      'bg-surface rounded-xl border border-border shadow-card flex flex-col p-5 gap-4 hover:shadow-card-md transition-shadow',
      glow && 'border-danger/40 shadow-danger'
    )}>
      {/* Top row: title + icon badge */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-muted tracking-wide uppercase leading-tight">{title}</p>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', a.icon)}>
          <Icon size={17} />
        </div>
      </div>

      {/* Value */}
      <div>
        <p className={cn('text-2xl font-bold tracking-tight leading-none', a.value)}>{value}</p>
        {subtitle && <p className="text-xs text-muted mt-1.5">{subtitle}</p>}
      </div>

      {/* Bottom accent line + optional alert badge */}
      <div className="flex items-center justify-between">
        <div className={cn('h-[3px] w-10 rounded-full', a.bar)} />
        {glow && (
          <span className="text-[11px] text-danger font-semibold bg-danger/10 border border-danger/20 rounded-full px-2 py-0.5">
            Alert
          </span>
        )}
      </div>
    </div>
  )
}
