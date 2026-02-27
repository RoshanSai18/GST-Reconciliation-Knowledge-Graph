import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtCurrency(value: number, decimals = 0): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`
  if (value >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(1)}L`
  if (value >= 1_000)       return `₹${(value / 1_000).toFixed(1)}K`
  return `₹${value.toFixed(decimals)}`
}

export function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function truncate(str: string, max = 20): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

export const RISK_COLORS: Record<string, string> = {
  High:    '#EF4444',
  Medium:  '#F59E0B',
  Low:     '#10B981',
  Valid:   '#10B981',
  Warning: '#F59E0B',
  'High-Risk': '#EF4444',
  Pending: '#94A3B8',
}
