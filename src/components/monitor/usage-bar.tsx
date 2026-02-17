'use client'

import { formatTokenCount } from '@/lib/format'
import { USAGE_THRESHOLDS } from '@/lib/constants'

interface UsageBarProps {
  readonly label: string
  readonly icon: string
  readonly used: number
  readonly limit: number
  readonly resetIn: string
}

export function UsageBar({ label, icon, used, limit, resetIn }: UsageBarProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const warningPct = USAGE_THRESHOLDS.warning * 100
  const dangerPct = USAGE_THRESHOLDS.danger * 100

  const barColor =
    percentage >= dangerPct ? 'bg-red-500' :
    percentage >= warningPct ? 'bg-yellow-500' :
    'bg-green-500'

  const percentText =
    percentage >= dangerPct ? 'text-red-400' :
    percentage >= warningPct ? 'text-yellow-400' :
    'text-green-400'

  return (
    <div className="rounded-lg border border-gray-700/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
          {icon} {label}
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span>⏱</span> {resetIn}
        </span>
      </div>

      <div className="relative h-5 overflow-hidden rounded-full bg-gray-800">
        {/* Fill bar */}
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />

        {/* Warning threshold marker */}
        <div
          className="absolute top-0 h-full w-px bg-yellow-600/60"
          style={{ left: `${warningPct}%` }}
        />

        {/* Danger threshold marker */}
        <div
          className="absolute top-0 h-full w-px bg-red-600/60"
          style={{ left: `${dangerPct}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <span className="rounded bg-gray-800 px-2 py-0.5 text-xs font-mono text-green-400">
          {formatTokenCount(used)} / {formatTokenCount(limit)}
        </span>
        <span className={`rounded border border-gray-700 px-2 py-0.5 text-xs font-mono ${percentText}`}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  )
}
