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
  blue:  {
    wrap:  'bg-surface',
    icon:  'bg-accent-lt text-accent',
    value: 'text-foreground',
    dot:   'bg-accent',
  },
  green: {
    wrap:  'bg-surface',
    icon:  'bg-emerald/10 text-emerald',
    value: 'text-foreground',
    dot:   'bg-emerald',
  },
  amber: {
    wrap:  'bg-surface',
    icon:  'bg-amber/10 text-amber',
    value: 'text-foreground',
    dot:   'bg-amber',
  },
  red:   {
    wrap:  'bg-surface',
    icon:  'bg-danger-lt text-danger',
    value: 'text-foreground',
    dot:   'bg-danger',
  },
}

export default function StatCard({ title, value, subtitle, icon: Icon, accent = 'blue', glow }: StatCardProps) {
  const a = ACCENT_MAP[accent]
  return (
    <div className={cn(
      a.wrap,
      'rounded-2xl flex flex-col p-5 gap-3',
      'transition-all duration-300 ease-in-out',
      glow
        ? 'shadow-danger hover:shadow-lg ring-1 ring-danger/25'
        : 'shadow-card hover:shadow-card-lg hover:-translate-y-0.5',
    )}>
      {/* Top row: label + icon */}
      <div className="flex items-center justify-between gap-3">
        <p className="label-cap">{title}</p>
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
          a.icon,
        )}>
          <Icon size={17} strokeWidth={2} />
        </div>
      </div>

      {/* Metric value — heavy weight, tight kerning */}
      <p className={cn('metric-num', a.value)}>{value}</p>

      {/* Footer: dot + subtitle + optional alert pill */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', a.dot)} />
          {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
        </div>
        {glow && (
          <span className="text-[10px] font-semibold text-danger bg-danger-lt rounded-full px-2 py-0.5 tracking-wide uppercase">
            Alert
          </span>
        )}
      </div>
    </div>
  )
}
