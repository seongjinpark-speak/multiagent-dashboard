import path from 'path'
import type { DashboardState, Agent, ActivityEvent } from '@/types'
import type { DashboardAdapter } from './types'
import { readClaudeStats } from '@/lib/claude-stats'
import { readSessionSnapshot } from '@/lib/session-reader'
import { AGENT_COLORS } from '@/lib/constants'

/**
 * Adapter for regular Claude Code sessions (no MAMH).
 * Reads session JSONL files for main + subagent activity.
 * Derives agent status from file modification times.
 */
export class ClaudeCodeAdapter implements DashboardAdapter {
  readonly name = 'claude-code'
  private readonly claudeHome: string
  private readonly projectDir: string

  constructor(projectDir: string, claudeHome: string) {
    this.projectDir = projectDir
    this.claudeHome = claudeHome
  }

  getWatchPaths(): readonly string[] {
    const encoded = this.projectDir.replace(/\//g, '-')
    return [
      path.join(this.claudeHome, 'stats-cache.json'),
      path.join(this.claudeHome, 'projects', encoded, '**', '*.jsonl'),
    ]
  }

  async readState(): Promise<DashboardState> {
    try {
      const [resources, sessionSnap] = await Promise.all([
        readClaudeStats(this.claudeHome),
        readSessionSnapshot(this.claudeHome, this.projectDir),
      ])

      const agents: Agent[] = []
      const activity: ActivityEvent[] = []

      // Lead agent from main session
      if (sessionSnap.mainSession) {
        const main = sessionSnap.mainSession
        agents.push({
          id: 'lead',
          role: 'Main Session',
          modelTier: 'opus',
          status: main.activity,
          color: 'blue',
          ticketsAssigned: 0,
          ticketsCompleted: 0,
          currentTicket: null,
          sessionId: main.sessionId,
        })

        activity.push({
          timestamp: main.lastModified.toISOString(),
          agentId: 'lead',
          sessionId: main.sessionId,
          type: main.activity === 'working' ? 'agent-spawned' : 'agent-idle',
          summary: `[lead] Main session ${main.activity === 'working' ? 'active' : main.activity}`,
        })
      }

      // Subagents from session subagents directory.
      // Without a registry (non-MAMH), only show recent subagents to avoid
      // filling the village with idle ghosts from old Task calls.
      const STALE_CUTOFF_MS = 60 * 60 * 1000 // 1 hour
      const recentSubagents = sessionSnap.subagents.filter(s =>
        s.activity !== 'idle' || (Date.now() - s.lastModified.getTime()) < STALE_CUTOFF_MS
      )

      for (let i = 0; i < recentSubagents.length; i++) {
        const sub = recentSubagents[i]
        const displayId = sub.agentName ?? sub.agentId
        agents.push({
          id: displayId,
          role: sub.role ?? 'Subagent',
          modelTier: sub.model?.includes('opus') ? 'opus' : 'sonnet',
          status: sub.activity,
          color: AGENT_COLORS[(i + 1) % AGENT_COLORS.length],
          ticketsAssigned: 0,
          ticketsCompleted: 0,
          currentTicket: null,
          sessionId: path.basename(sub.sessionFile, '.jsonl'),
        })

        let summary: string
        if (sub.activity === 'working') {
          const taskPart = sub.currentTask ? ` on ${sub.currentTask}` : ''
          const actionPart = sub.lastAction ? ` — ${sub.lastAction}` : ''
          summary = `[${displayId}] Working${taskPart}${actionPart}`
        } else if (sub.activity === 'completed') {
          const taskPart = sub.currentTask ? `: ${sub.currentTask}` : ''
          summary = `[${displayId}] Just finished${taskPart}`
        } else {
          summary = `[${displayId}] Idle`
        }

        activity.push({
          timestamp: sub.lastModified.toISOString(),
          agentId: displayId,
          sessionId: path.basename(sub.sessionFile, '.jsonl'),
          type: sub.activity === 'working' ? 'ticket-started' : sub.activity === 'completed' ? 'ticket-completed' : 'agent-idle',
          summary,
        })
      }

      // Sort activity newest first
      activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

      return {
        agents,
        tickets: [],
        activity,
        project: {
          name: path.basename(this.projectDir),
          phase: 'active',
          status: 'running',
          currentMilestone: null,
          activeAgents: agents.filter(a => a.status === 'working').map(a => a.id),
          ticketsSummary: {
            total: 0, completed: 0, inProgress: 0, pending: 0, blocked: 0, failed: 0,
          },
          startedAt: sessionSnap.mainSession?.lastModified.toISOString() ?? null,
          lastUpdatedAt: new Date().toISOString(),
        },
        resources,
        messages: [],
        error: null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read Claude Code state'
      return {
        agents: [],
        tickets: [],
        activity: [],
        project: {
          name: 'Claude Code',
          phase: '0',
          status: 'disconnected',
          currentMilestone: null,
          activeAgents: [],
          ticketsSummary: {
            total: 0, completed: 0, inProgress: 0, pending: 0, blocked: 0, failed: 0,
          },
          startedAt: null,
          lastUpdatedAt: null,
        },
        resources: {
          daily: { used: 0, limit: 5_000_000, resetIn: 'N/A' },
          weekly: { used: 0, limit: 20_000_000, resetIn: 'N/A' },
          contextWindow: { used: 0, total: 200_000, percentage: 0 },
          model: 'unknown',
          lastUpdated: null,
        },
        messages: [],
        error: message,
      }
    }
  }
}
