'use client'

import type { ContextWindow } from '@/types'
import { formatTokenCount } from '@/lib/format'
import { USAGE_THRESHOLDS } from '@/lib/constants'

interface ContextGaugeProps {
  readonly contextWindow: ContextWindow
}

export function ContextGauge({ contextWindow }: ContextGaugeProps) {
  const { used, total, percentage } = contextWindow
  const warningPct = USAGE_THRESHOLDS.warning * 100
  const dangerPct = USAGE_THRESHOLDS.danger * 100

  const barColor =
    percentage >= dangerPct ? 'bg-red-500' :
    percentage >= warningPct ? 'bg-yellow-500' :
    'bg-green-500'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">🧠 Context</span>
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-sm font-mono text-gray-300">
          {percentage}%
        </span>
        <span className="text-xs text-gray-500">
          ({formatTokenCount(used)}/{formatTokenCount(total)})
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Normal (&lt;{warningPct}%)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
          Warning ({warningPct}-{dangerPct}%)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          Danger (&ge;{dangerPct}%)
        </span>
      </div>
    </div>
  )
}
