import { cn } from '@/lib/utils'

type RiskLevel = 'High' | 'Medium' | 'Low' | 'High-Risk' | 'Warning' | 'Valid' | 'Pending' | string

const STYLES: Record<string, string> = {
  High:       'bg-danger/15 text-danger border-danger/30',
  'High-Risk':'bg-danger/15 text-danger border-danger/30',
  Medium:     'bg-warning/15 text-warning border-warning/30',
  Warning:    'bg-warning/15 text-warning border-warning/30',
  Low:        'bg-success/15 text-success border-success/30',
  Valid:      'bg-success/15 text-success border-success/30',
  Pending:    'bg-muted/15 text-muted border-muted/30',
}

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const style = STYLES[level] ?? 'bg-muted/15 text-muted border-muted/30'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', style)}>
      {level}
    </span>
  )
}
