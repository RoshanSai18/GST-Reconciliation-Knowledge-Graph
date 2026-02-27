import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

/** Single shimmer block */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton', className)} />
}

/** Pre-built table skeleton — n rows × cols columns (renders <tr> elements only, place inside <tbody>) */
export function TableSkeleton({ rows = 8, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border/50">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cn('h-3', c === 0 ? 'w-28' : c === cols - 1 ? 'w-12' : 'w-20')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Metric card loading placeholder */
export function StatCardSkeleton() {
  return (
    <div className="bg-surface rounded-2xl shadow-card flex flex-col p-5 gap-4">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-2.5 w-16" />
    </div>
  )
}
