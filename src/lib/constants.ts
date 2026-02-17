import type { AgentColor } from '@/types'

export const AGENT_COLORS: readonly AgentColor[] = [
  'blue', 'red', 'green', 'yellow', 'purple', 'cyan',
] as const

export const AGENT_COLOR_HEX: Record<AgentColor, { body: string; accent: string }> = {
  blue:   { body: '#3b82f6', accent: '#1d4ed8' },
  red:    { body: '#ef4444', accent: '#b91c1c' },
  green:  { body: '#22c55e', accent: '#15803d' },
  yellow: { body: '#eab308', accent: '#a16207' },
  purple: { body: '#a855f7', accent: '#7e22ce' },
  cyan:   { body: '#06b6d4', accent: '#0e7490' },
}

export const TOKEN_LIMITS = {
  daily: 5_000_000,
  weekly: 20_000_000,
} as const

export const CONTEXT_WINDOW_MAX = 200_000

export const USAGE_THRESHOLDS = {
  warning: 0.8,
  danger: 0.95,
} as const

export const WATCHER_DEBOUNCE_MS = 100

export const SSE_HEARTBEAT_MS = 15_000

export const MAX_ACTIVITY_EVENTS = 500

export const STALE_DATA_THRESHOLD_MS = 60_000

/** How often the watcher re-evaluates state even without file changes (for time-based status transitions). */
export const PERIODIC_REEVAL_MS = 15_000
