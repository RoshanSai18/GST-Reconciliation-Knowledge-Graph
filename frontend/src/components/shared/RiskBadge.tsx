import { cn } from '@/lib/utils'

type RiskLevel = 'High' | 'Medium' | 'Low' | 'High-Risk' | 'Warning' | 'Valid' | 'Pending' | string

// Muted, professional semantic colors — no screaming saturated hues
const STYLES: Record<string, string> = {
  High:       'bg-[#FEF2F2] text-[#B91C1C]',
  'High-Risk':'bg-[#FEF2F2] text-[#B91C1C]',
  Medium:     'bg-[#FFFBEB] text-[#B45309]',
  Warning:    'bg-[#FFFBEB] text-[#B45309]',
  Low:        'bg-[#ECFDF5] text-[#059669]',
  Valid:      'bg-[#ECFDF5] text-[#059669]',
  Pending:    'bg-[#F4F4F5] text-[#71717A]',
}

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const style = STYLES[level] ?? 'bg-[#F4F4F5] text-[#71717A]'
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide',
      style,
    )}>
      {level}
    </span>
  )
}
