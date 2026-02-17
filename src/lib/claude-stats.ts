import fs from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import type { ResourceUsage } from '@/types'
import { TOKEN_LIMITS, CONTEXT_WINDOW_MAX } from '@/lib/constants'
import { formatResetTimer, getDailyResetDate, getWeeklyResetDate } from '@/lib/format'

const DailyActivitySchema = z.object({
  date: z.string(),
  messageCount: z.number(),
  sessionCount: z.number().optional(),
  toolCallCount: z.number().optional(),
})

// Real format: array of { date, tokensByModel: { "claude-opus-4-6": 59662 } }
const DailyModelTokensEntrySchema = z.object({
  date: z.string(),
  tokensByModel: z.record(z.string(), z.number()),
})

const StatsCacheSchema = z.object({
  version: z.number(),
  lastComputedDate: z.string().optional(),
  dailyActivity: z.array(DailyActivitySchema).optional(),
  dailyModelTokens: z.array(DailyModelTokensEntrySchema).optional(),
})

type DailyModelTokensEntry = z.infer<typeof DailyModelTokensEntrySchema>

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

function getRecentDates(days: number): Set<string> {
  const dates = new Set<string>()
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.add(d.toISOString().split('T')[0])
  }
  return dates
}

function sumTokensForDates(
  entries: readonly DailyModelTokensEntry[],
  dates: Set<string>,
): number {
  let total = 0
  for (const entry of entries) {
    if (!dates.has(entry.date)) continue
    for (const count of Object.values(entry.tokensByModel)) {
      total += count
    }
  }
  return total
}

function detectModel(entries: readonly DailyModelTokensEntry[]): string {
  const today = getTodayDateString()
  const todayEntry = entries.find(e => e.date === today)
  if (!todayEntry) {
    // Fall back to most recent entry
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
    if (sorted.length === 0) return 'unknown'
    const latest = sorted[0]
    return findDominantModel(latest.tokensByModel)
  }
  return findDominantModel(todayEntry.tokensByModel)
}

function findDominantModel(tokensByModel: Record<string, number>): string {
  let maxModel = 'unknown'
  let maxTokens = 0
  for (const [model, tokens] of Object.entries(tokensByModel)) {
    if (tokens > maxTokens) {
      maxTokens = tokens
      maxModel = model
    }
  }
  return maxModel
}

function estimateContextFromActivity(
  dailyActivity: Array<{ date: string; messageCount: number }>,
): number {
  const today = getTodayDateString()
  const todayActivity = dailyActivity.find(a => a.date === today)
  if (!todayActivity) return 0

  // Rough estimate: ~500 tokens per message on average
  const estimated = todayActivity.messageCount * 500
  return Math.min(estimated, CONTEXT_WINDOW_MAX)
}

export async function readClaudeStats(claudeHome: string): Promise<ResourceUsage> {
  const statsPath = path.join(claudeHome, 'stats-cache.json')

  try {
    const raw = await fs.readFile(statsPath, 'utf-8')
    const parsed = StatsCacheSchema.parse(JSON.parse(raw))

    const tokenEntries = parsed.dailyModelTokens ?? []
    const dailyActivity = parsed.dailyActivity ?? []

    const today = getTodayDateString()
    const todayDates = new Set([today])
    const weekDates = getRecentDates(7)

    let dailyUsed = sumTokensForDates(tokenEntries, todayDates)

    // If no data for today, use the most recent date's data
    // (stats-cache.json is computed by Claude Code and may lag behind)
    const lastComputedDate = parsed.lastComputedDate
    if (dailyUsed === 0 && lastComputedDate && lastComputedDate !== today) {
      dailyUsed = sumTokensForDates(tokenEntries, new Set([lastComputedDate]))
    }

    const weeklyUsed = sumTokensForDates(tokenEntries, weekDates)

    const model = detectModel(tokenEntries)
    const contextUsed = estimateContextFromActivity(dailyActivity)

    const dailyReset = getDailyResetDate()
    const weeklyReset = getWeeklyResetDate()

    return {
      daily: {
        used: dailyUsed,
        limit: TOKEN_LIMITS.daily,
        resetIn: formatResetTimer(dailyReset),
      },
      weekly: {
        used: weeklyUsed,
        limit: TOKEN_LIMITS.weekly,
        resetIn: formatResetTimer(weeklyReset),
      },
      contextWindow: {
        used: contextUsed,
        total: CONTEXT_WINDOW_MAX,
        percentage: Math.round((contextUsed / CONTEXT_WINDOW_MAX) * 100),
      },
      model,
      lastUpdated: new Date().toISOString(),
    }
  } catch {
    return {
      daily: { used: 0, limit: TOKEN_LIMITS.daily, resetIn: 'N/A' },
      weekly: { used: 0, limit: TOKEN_LIMITS.weekly, resetIn: 'N/A' },
      contextWindow: { used: 0, total: CONTEXT_WINDOW_MAX, percentage: 0 },
      model: 'unknown',
      lastUpdated: null,
    }
  }
}
