/** Circular progress gauge (SVG-based) */
interface GaugeProps {
  value:    number  // 0-100
  max?:     number
  size?:    number
  label?:   string
}

function scoreColor(v: number): string {
  if (v >= 75) return '#10B981'
  if (v >= 50) return '#F59E0B'
  return '#EF4444'
}

export default function TrustGauge({ value, max = 100, size = 120, label = 'Trust Score' }: GaugeProps) {
  const r         = (size - 16) / 2
  const circ      = 2 * Math.PI * r
  const pct       = Math.min(1, Math.max(0, value / max))
  const dashOff   = circ * (1 - pct)
  const color     = scoreColor(value)
  const cx        = size / 2
  const cy        = size / 2

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#d4d4d4" strokeWidth={8} />
          {/* Progress */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dashOff}
            style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
        </svg>
        {/* Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{value}</span>
          <span className="text-[10px] text-muted">/ {max}</span>
        </div>
      </div>
      <p className="text-xs text-muted font-medium">{label}</p>
    </div>
  )
}
