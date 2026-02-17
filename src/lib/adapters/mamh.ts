import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import type {
  Agent,
  AgentColor,
  AgentStatus,
  Ticket,
  TicketStatus,
  TicketPriority,
  ActivityEvent,
  DashboardState,
  TicketsSummary,
  ProjectState,
  Message,
} from '@/types'
import type { DashboardAdapter } from './types'
import { AGENT_COLORS } from '@/lib/constants'
import { readClaudeStats } from '@/lib/claude-stats'
import { readSessionSnapshot, type SessionSnapshot } from '@/lib/session-reader'

// --- Zod schemas for MAMH JSON files ---

const ArrayRegistryAgentSchema = z.object({
  id: z.string(),
  role: z.string(),
  modelTier: z.enum(['opus', 'sonnet', 'haiku']).optional(),
  status: z.string().optional(),
  ticketsCompleted: z.number().optional(),
  ticketsAssigned: z.number().optional(),
})

const ArrayRegistrySchema = z.object({
  agents: z.array(ArrayRegistryAgentSchema),
  totalAgents: z.number().optional(),
})

const ObjectRegistryAgentSchema = z.object({
  name: z.string().optional(),
  role: z.string(),
  model: z.enum(['opus', 'sonnet', 'haiku']).optional(),
  phase: z.array(z.string()).optional(),
  focus: z.string().optional(),
})

const ObjectRegistrySchema = z.object({
  agents: z.record(z.string(), ObjectRegistryAgentSchema),
  version: z.number().optional(),
})

const TicketsSummarySchema = z.object({
  total: z.number(),
  completed: z.number(),
  inProgress: z.number(),
  pending: z.number(),
  blocked: z.number().optional(),
  failed: z.number().optional(),
})

const FlatStateSchema = z.object({
  phase: z.number(),
  status: z.string(),
  currentMilestone: z.string().nullable(),
  activeAgents: z.array(z.string()).optional(),
  ticketsSummary: TicketsSummarySchema,
  lastUpdated: z.string().optional(),
})

const RichStateSchema = z.object({
  phase: z.string(),
  phaseHistory: z.array(z.object({
    phase: z.string(),
    completedAt: z.string(),
  })).optional(),
  currentMilestone: z.string().nullable(),
  milestones: z.array(z.string()).optional(),
  agentsSpawned: z.array(z.string()).optional(),
  startedAt: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
  ticketsSummary: TicketsSummarySchema.optional(),
})

const SessionSchema = z.object({
  projectName: z.string(),
  description: z.string().optional(),
  startedAt: z.string().optional(),
  currentPhase: z.number().optional(),
  currentMilestone: z.string().nullable().optional(),
})

// --- Helper functions ---

function assignColor(index: number): AgentColor {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

function parseTicketStatus(raw: string): TicketStatus {
  const normalized = raw.toLowerCase().trim()
  const mapping: Record<string, TicketStatus> = {
    'pending': 'pending',
    'in-progress': 'in-progress',
    'in_progress': 'in-progress',
    'inprogress': 'in-progress',
    'approved': 'in-progress',
    'active': 'in-progress',
    'completed': 'completed',
    'done': 'completed',
    'blocked': 'blocked',
    'failed': 'failed',
  }
  return mapping[normalized] ?? 'pending'
}

interface MamhStateResult {
  readonly phase: string
  readonly status: string
  readonly currentMilestone: string | null
  readonly activeAgents: string[]
  readonly ticketsSummary: TicketsSummary | null
  readonly milestoneCompletions: Record<string, string>
  readonly startedAt: string | null
  readonly lastUpdatedAt: string | null
}

function parseTicketPriority(raw: string): TicketPriority {
  const normalized = raw.toLowerCase().trim()
  const mapping: Record<string, TicketPriority> = {
    'critical': 'critical',
    'high': 'high',
    'medium': 'medium',
    'low': 'low',
  }
  return mapping[normalized] ?? 'medium'
}

function extractField(content: string, field: string): string | null {
  // Handle: **Field:** value, **Field**: value, **Field**:value
  const patterns = [
    new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i'),
    new RegExp(`\\*\\*${field}\\*\\*:\\s*(.+)`, 'i'),
    new RegExp(`\\*\\*${field}\\*\\*\\s*(.+)`, 'i'),
  ]
  for (const regex of patterns) {
    const match = content.match(regex)
    if (match) return match[1].trim()
  }
  return null
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)/m)
  return match ? match[1].trim() : 'Untitled'
}

function extractDependencies(content: string): readonly string[] {
  const raw = extractField(content, 'Dependencies')
  if (!raw || raw.toLowerCase() === 'none') return []
  return raw.split(',').map(d => d.trim()).filter(Boolean)
}

async function readJsonSafe<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return schema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// --- MAMH Adapter ---

export class MamhAdapter implements DashboardAdapter {
  readonly name = 'mamh'
  private readonly projectDir: string
  private readonly mamhDir: string
  private readonly claudeHome: string

  constructor(projectDir: string, claudeHome: string) {
    this.projectDir = projectDir
    this.mamhDir = path.join(projectDir, '.mamh')
    this.claudeHome = claudeHome
  }

  getWatchPaths(): readonly string[] {
    return [
      path.join(this.mamhDir, 'state', 'mamh-state.json'),
      path.join(this.mamhDir, 'agents', 'registry.json'),
      path.join(this.mamhDir, 'session.json'),
      path.join(this.mamhDir, 'tickets', '**', '*.md'),
      path.join(this.mamhDir, 'comms', '**'),
      path.join(this.mamhDir, 'reviews', '**'),
      path.join(this.claudeHome, 'stats-cache.json'),
    ]
  }

  async readState(): Promise<DashboardState> {
    const exists = await fileExists(this.mamhDir)
    if (!exists) {
      return createEmptyState('No .mamh directory found')
    }

    try {
      const [agents, rawTickets, session, mamhState, resources, activity, messages, sessionSnap] =
        await Promise.all([
          this.readAgents(),
          this.readTickets(),
          this.readSession(),
          this.readMamhState(),
          readClaudeStats(this.claudeHome),
          this.readActivity(),
          this.readMessages(),
          readSessionSnapshot(this.claudeHome, this.projectDir),
        ])

      // Override ticket statuses using milestone completion data
      const milestoneCompletions = mamhState?.milestoneCompletions ?? {}
      const tickets = applyMilestoneCompletions(rawTickets, milestoneCompletions)

      // Derive agent status from session activity (JSONL file times), with ticket fallback
      const agentsWithStatus = deriveAgentStatusesFromSession(agents, tickets, sessionSnap)

      // Add lead/orchestrator agent
      const leadAgent = buildLeadAgent(mamhState, agentsWithStatus, sessionSnap)
      const allAgents = [leadAgent, ...agentsWithStatus]

      // Add lead + subagent session-based activity events
      const sessionActivity = buildSessionActivityEvents(sessionSnap, agentsWithStatus)
      const allActivity = [...activity, ...sessionActivity]
      allActivity.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

      const project = buildProjectState(session, mamhState, allAgents)

      return {
        agents: allAgents,
        tickets,
        activity: allActivity.slice(-500),
        project,
        resources,
        messages,
        error: null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error reading MAMH state'
      return createEmptyState(message)
    }
  }

  private async readAgents(): Promise<Agent[]> {
    const registryPath = path.join(this.mamhDir, 'agents', 'registry.json')
    const raw = await readFileSafe(registryPath)
    if (!raw) return []

    const parsed = JSON.parse(raw)

    // Try array format first (pronunciation-coach style)
    const arrayResult = ArrayRegistrySchema.safeParse(parsed)
    if (arrayResult.success) {
      return arrayResult.data.agents.map((a, i) => ({
        id: a.id,
        role: a.role,
        modelTier: a.modelTier ?? 'sonnet',
        status: 'idle' as const,
        color: assignColor(i),
        ticketsAssigned: a.ticketsAssigned ?? 0,
        ticketsCompleted: a.ticketsCompleted ?? 0,
        currentTicket: null,
        sessionId: null,
      }))
    }

    // Try object format (phonetic-model style)
    const objectResult = ObjectRegistrySchema.safeParse(parsed)
    if (objectResult.success) {
      return Object.entries(objectResult.data.agents).map(([id, a], i) => ({
        id,
        role: a.role,
        modelTier: a.model ?? 'sonnet',
        status: 'idle' as const,
        color: assignColor(i),
        ticketsAssigned: 0,
        ticketsCompleted: 0,
        currentTicket: null,
        sessionId: null,
      }))
    }

    return []
  }

  private async readTickets(): Promise<Ticket[]> {
    const ticketsDir = path.join(this.mamhDir, 'tickets')
    const tickets: Ticket[] = []

    try {
      const milestonesDir = path.join(ticketsDir, 'milestones')
      const entries = await fs.readdir(milestonesDir).catch(() => [] as string[])

      for (const entry of entries) {
        const entryPath = path.join(milestonesDir, entry)
        const stat = await fs.stat(entryPath).catch(() => null)
        if (!stat) continue

        if (stat.isDirectory()) {
          // Directory milestone (M2/, M3/) — read .md ticket files inside
          const files = await fs.readdir(entryPath).catch(() => [] as string[])
          for (const file of files) {
            if (!file.endsWith('.md')) continue
            // Accept M2-T01.md, T001.md, etc.
            if (!file.match(/^(M\d+-)?T\d+/i)) continue
            const content = await readFileSafe(path.join(entryPath, file))
            if (!content) continue
            tickets.push(parseTicketMarkdown(content, entry))
          }
        } else if (entry.endsWith('.json')) {
          // JSON milestone (M1.json) — inline tickets as object
          const content = await readFileSafe(entryPath)
          if (!content) continue
          try {
            const milestoneData = JSON.parse(content)
            const milestoneName = milestoneData.name ?? entry.replace('.json', '')
            const milestoneStatus = milestoneData.status ?? 'pending'
            const ticketsObj = milestoneData.tickets ?? {}

            for (const [id, ticketData] of Object.entries(ticketsObj)) {
              const t = ticketData as Record<string, unknown>
              tickets.push({
                id,
                title: (t.title as string) ?? id,
                agentId: (t.agent as string) ?? null,
                milestone: milestoneName,
                status: parseTicketStatus((t.status as string) ?? milestoneStatus),
                priority: parseTicketPriority((t.priority as string) ?? 'medium'),
                dependencies: Array.isArray(t.dependencies) ? t.dependencies as string[] : [],
              })
            }
          } catch {
            // skip malformed JSON milestone
          }
        }
      }

      // Also read from archive
      const archiveDir = path.join(ticketsDir, 'archive')
      const archiveFiles = await fs.readdir(archiveDir).catch(() => [] as string[])
      for (const file of archiveFiles) {
        if (!file.endsWith('.md')) continue
        if (!file.match(/^(M\d+-)?T\d+/i)) continue
        const content = await readFileSafe(path.join(archiveDir, file))
        if (!content) continue
        tickets.push(parseTicketMarkdown(content, 'archive'))
      }
    } catch {
      // tickets directory doesn't exist or isn't readable
    }

    return tickets
  }

  private async readSession(): Promise<z.infer<typeof SessionSchema> | null> {
    return readJsonSafe(
      path.join(this.mamhDir, 'session.json'),
      SessionSchema,
    )
  }

  private async readMamhState(): Promise<MamhStateResult | null> {
    const statePath = path.join(this.mamhDir, 'state', 'mamh-state.json')
    const raw = await readFileSafe(statePath)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const milestoneCompletions: Record<string, string> = parsed.milestoneCompletions ?? {}

    // Try flat format first
    const flatResult = FlatStateSchema.safeParse(parsed)
    if (flatResult.success) {
      const d = flatResult.data
      return {
        phase: String(d.phase),
        status: d.status,
        currentMilestone: d.currentMilestone,
        activeAgents: d.activeAgents ?? [],
        ticketsSummary: {
          total: d.ticketsSummary.total,
          completed: d.ticketsSummary.completed,
          inProgress: d.ticketsSummary.inProgress,
          pending: d.ticketsSummary.pending,
          blocked: d.ticketsSummary.blocked ?? 0,
          failed: d.ticketsSummary.failed ?? 0,
        },
        milestoneCompletions,
        startedAt: null,
        lastUpdatedAt: d.lastUpdated ?? null,
      }
    }

    // Try rich format
    const richResult = RichStateSchema.safeParse(parsed)
    if (richResult.success) {
      const d = richResult.data
      const ts = d.ticketsSummary
      return {
        phase: d.phase,
        status: d.phase,
        currentMilestone: d.currentMilestone,
        activeAgents: d.agentsSpawned ?? [],
        ticketsSummary: ts ? {
          total: ts.total,
          completed: ts.completed,
          inProgress: ts.inProgress,
          pending: ts.pending,
          blocked: ts.blocked ?? 0,
          failed: ts.failed ?? 0,
        } : { total: 0, completed: 0, inProgress: 0, pending: 0, blocked: 0, failed: 0 },
        milestoneCompletions,
        startedAt: d.startedAt ?? null,
        lastUpdatedAt: d.lastUpdatedAt ?? null,
      }
    }

    return null
  }

  private async readActivity(): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = []

    // Read ticket output files from comms (M2-T01-output.md, etc.)
    // Use file modification time as the authoritative timestamp (not content fields).
    const commsDir = path.join(this.mamhDir, 'comms')
    const commsFiles = await fs.readdir(commsDir).catch(() => [] as string[])
    for (const file of commsFiles) {
      if (!file.match(/^M\d+-T\d+-output\.md$/)) continue
      const filePath = path.join(commsDir, file)
      const [content, stat] = await Promise.all([
        readFileSafe(filePath),
        fs.stat(filePath).catch(() => null),
      ])
      if (!content || !stat) continue

      const ticketId = file.replace('-output.md', '')
      const agentId = extractField(content, 'Engineer') ?? extractField(content, 'Agent')
      const isCompleted = /COMPLETED|COMPLETE/i.test(content)
      const titleMatch = content.match(/^#\s+(.+)/m)
      const title = titleMatch ? titleMatch[1].trim() : ticketId

      events.push({
        timestamp: stat.mtime.toISOString(),
        agentId,
        sessionId: null,
        type: isCompleted ? 'ticket-completed' : 'ticket-started',
        summary: `[${agentId ?? 'unknown'}] ${isCompleted ? 'Completed' : 'Started'} ${title}`,
      })
    }

    // Read decisions log (## D33: ... sections)
    // decisions.md has date-only format like (2026-02-11), so use file mtime for time precision
    const decisionsPath = path.join(commsDir, 'decisions.md')
    const [decisionsContent, decisionsStat] = await Promise.all([
      readFileSafe(decisionsPath),
      fs.stat(decisionsPath).catch(() => null),
    ])
    if (decisionsContent && decisionsStat) {
      const sections = decisionsContent.split(/(?=^## D\d+)/m).filter(s => s.startsWith('## D'))
      for (const section of sections) {
        const headerMatch = section.match(/^## (D\d+): (.+?)(?:\s*\((.+?)\))?$/m)
        if (!headerMatch) continue
        const [, decisionId, title, dateStr] = headerMatch
        const decisionLine = section.match(/\*\*Decision:\*\*\s*(.+)/)?.[1]

        // Use the date from the header if it has time info, otherwise use file mtime
        let timestamp: string
        if (dateStr && dateStr.includes('T')) {
          timestamp = new Date(dateStr).toISOString()
        } else {
          // Date-only (2026-02-11) loses time info — use file mtime instead
          timestamp = decisionsStat.mtime.toISOString()
        }

        events.push({
          timestamp,
          agentId: 'lead',
          sessionId: 'main',
          type: 'system',
          summary: `[lead] Decision ${decisionId}: ${decisionLine ?? title}`,
        })
      }
    }

    // Read milestone completions from state
    const statePath = path.join(this.mamhDir, 'state', 'mamh-state.json')
    const stateContent = await readFileSafe(statePath)
    if (stateContent) {
      try {
        const state = JSON.parse(stateContent)
        const completions = state.milestoneCompletions ?? {}
        for (const [milestone, completedAt] of Object.entries(completions)) {
          events.push({
            timestamp: completedAt as string,
            agentId: 'lead',
            sessionId: 'main',
            type: 'milestone-completed',
            summary: `[lead] Milestone ${milestone} completed`,
          })
        }
      } catch {
        // skip malformed state
      }
    }

    // Sort by timestamp, oldest first
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    return events.slice(-500)
  }

  private async readMessages(): Promise<Message[]> {
    const commsDir = path.join(this.mamhDir, 'comms')
    const messages: Message[] = []
    const files = await fs.readdir(commsDir).catch(() => [] as string[])
    if (files.length === 0) return []

    for (const file of files) {
      if (file === 'changelog.md' || file === 'decisions.md') continue
      if (!file.endsWith('.md') && !file.endsWith('.json')) continue

      const content = await readFileSafe(path.join(commsDir, file))
      if (!content) continue

      if (file.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content)
          if (Array.isArray(parsed)) {
            for (const msg of parsed) {
              messages.push({
                timestamp: msg.timestamp ?? new Date().toISOString(),
                from: msg.from ?? 'unknown',
                to: msg.to ?? 'unknown',
                ticketId: msg.ticketId ?? null,
                content: msg.content ?? msg.message ?? '',
                urgency: msg.urgency === 'high' ? 'high' : 'normal',
              })
            }
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    return messages
  }
}

// --- Pure helper functions ---

function parseTicketMarkdown(content: string, milestone: string): Ticket {
  const title = extractTitle(content)
  const idMatch = title.match(/^(T\d+)/)
  const id = idMatch ? idMatch[1] : title.slice(0, 10)

  return {
    id,
    title: title.replace(/^T\d+:\s*/, ''),
    agentId: extractField(content, 'Agent'),
    milestone: milestone.replace(/^\w+-/, '').replace(/-/g, ' ') || milestone,
    status: parseTicketStatus(extractField(content, 'Status') ?? 'pending'),
    priority: parseTicketPriority(extractField(content, 'Priority') ?? 'medium'),
    dependencies: extractDependencies(content),
  }
}

function applyMilestoneCompletions(
  tickets: Ticket[],
  milestoneCompletions: Record<string, string>,
): Ticket[] {
  const completedMilestones = new Set(Object.keys(milestoneCompletions))
  return tickets.map(ticket => {
    // If the ticket's milestone is completed, mark it completed
    for (const milestone of completedMilestones) {
      if (ticket.milestone.includes(milestone) || ticket.id.startsWith(milestone)) {
        return { ...ticket, status: 'completed' as const }
      }
    }
    return ticket
  })
}

/**
 * Derive agent status primarily from Claude session activity (JSONL file mod times).
 * Falls back to ticket-based derivation if no session data exists.
 *
 * Matching strategy: MAMH registry uses names like "mamh-eval-engineer" while
 * session JSONL files use hash-based agentIds like "a1d8cc3". The session reader
 * also extracts agentName from the "You are X, ..." prompt. We match on agentName first.
 */
function deriveAgentStatusesFromSession(
  agents: Agent[],
  tickets: Ticket[],
  sessionSnap: SessionSnapshot,
): Agent[] {
  // Build maps for both agentName (from prompt) and agentId (hash) → session.
  // Subagents are sorted newest-first, so keep only the first (newest) per name.
  const sessionByName = new Map<string, typeof sessionSnap.subagents[number]>()
  for (const s of sessionSnap.subagents) {
    if (s.agentName && !sessionByName.has(s.agentName)) {
      sessionByName.set(s.agentName, s)
    }
  }
  const sessionById = new Map(
    sessionSnap.subagents.map(s => [s.agentId, s])
  )

  return agents.map(agent => {
    const agentTickets = tickets.filter(t => t.agentId === agent.id)
    const inProgress = agentTickets.filter(t => t.status === 'in-progress')
    const completed = agentTickets.filter(t => t.status === 'completed')

    // Match session: try agentName first (mamh-eval-engineer), then agentId (hash)
    const matchedSession = sessionByName.get(agent.id) ?? sessionById.get(agent.id)

    let status: AgentStatus
    if (matchedSession) {
      status = matchedSession.activity
    } else {
      // Fallback: derive from tickets
      if (inProgress.length > 0) {
        status = 'working'
      } else if (agentTickets.length > 0 && completed.length === agentTickets.length) {
        status = 'completed'
      } else {
        status = 'idle'
      }
    }

    return {
      ...agent,
      status,
      ticketsAssigned: agentTickets.length,
      ticketsCompleted: completed.length,
      currentTicket: inProgress[0]?.id ?? null,
      sessionId: matchedSession
        ? path.basename(matchedSession.sessionFile, '.jsonl')
        : agent.sessionId,
    }
  })
}

/**
 * Build activity events from session snapshot data (lead + subagent sessions).
 * This gives visibility into the lead orchestrator's ongoing activity
 * and any subagent sessions not captured by comms output files.
 */
function buildSessionActivityEvents(
  sessionSnap: SessionSnapshot,
  agents: Agent[],
): ActivityEvent[] {
  const events: ActivityEvent[] = []

  // Lead agent activity from main session
  if (sessionSnap.mainSession) {
    const main = sessionSnap.mainSession
    const statusLabel = main.activity === 'working'
      ? 'actively orchestrating'
      : main.activity === 'completed'
        ? 'recently finished'
        : 'idle'
    events.push({
      timestamp: main.lastModified.toISOString(),
      agentId: 'lead',
      sessionId: main.sessionId,
      type: main.activity === 'working' ? 'agent-spawned' : 'agent-idle',
      summary: `[lead] Lead is ${statusLabel}`,
    })
  }

  // Subagent session activity (only for agents with recent session files)
  for (const sub of sessionSnap.subagents) {
    const agentName = sub.agentName ?? sub.agentId
    const matchedAgent = agents.find(a => a.id === agentName || a.id === sub.agentId)
    if (!matchedAgent) continue

    // Build a rich summary with task + current action
    let summary: string
    if (sub.activity === 'working') {
      const taskPart = sub.currentTask ? ` on ${sub.currentTask}` : ''
      const actionPart = sub.lastAction ? ` — ${sub.lastAction}` : ''
      summary = `[${agentName}] Working${taskPart}${actionPart}`
    } else if (sub.activity === 'completed') {
      const taskPart = sub.currentTask ? `: ${sub.currentTask}` : ''
      summary = `[${agentName}] Just finished${taskPart}`
    } else {
      summary = `[${agentName}] Idle`
    }

    events.push({
      timestamp: sub.lastModified.toISOString(),
      agentId: agentName,
      sessionId: path.basename(sub.sessionFile, '.jsonl'),
      type: sub.activity === 'working' ? 'ticket-started' : sub.activity === 'completed' ? 'ticket-completed' : 'agent-idle',
      summary,
    })
  }

  return events
}

function buildLeadAgent(
  mamhState: MamhStateResult | null,
  subagents: Agent[],
  sessionSnap: SessionSnapshot,
): Agent {
  // Primary: derive lead status from main session JSONL modification time
  const mainActivity = sessionSnap.mainSession?.activity
  let status: AgentStatus

  if (mainActivity) {
    status = mainActivity
  } else {
    // Fallback: derive from MAMH state + subagent statuses
    const isExecuting = mamhState?.phase === 'executing' ||
      mamhState?.status === 'executing'
    const hasActiveSubagents = subagents.some(a => a.status === 'working')
    const allDone = mamhState?.status === 'milestone-complete' ||
      mamhState?.status === 'completed'

    status = 'idle'
    if (isExecuting || hasActiveSubagents) status = 'working'
    if (allDone) status = 'completed'
  }

  return {
    id: 'lead',
    role: 'Orchestrator (main session)',
    modelTier: 'opus',
    status,
    color: 'blue',
    ticketsAssigned: 0,
    ticketsCompleted: 0,
    currentTicket: null,
    sessionId: sessionSnap.mainSession?.sessionId ?? 'main',
  }
}

function buildProjectState(
  session: z.infer<typeof SessionSchema> | null,
  mamhState: MamhStateResult | null,
  agents: Agent[],
): ProjectState {
  const activeIds = agents.filter(a => a.status === 'working').map(a => a.id)

  return {
    name: session?.projectName ?? 'Unknown Project',
    phase: mamhState?.phase ?? String(session?.currentPhase ?? 0),
    status: mamhState?.status ?? 'unknown',
    currentMilestone: mamhState?.currentMilestone ?? session?.currentMilestone ?? null,
    activeAgents: activeIds,
    ticketsSummary: mamhState?.ticketsSummary ?? {
      total: 0, completed: 0, inProgress: 0, pending: 0, blocked: 0, failed: 0,
    },
    startedAt: mamhState?.startedAt ?? session?.startedAt ?? null,
    lastUpdatedAt: mamhState?.lastUpdatedAt ?? null,
  }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

function createEmptyState(error: string | null): DashboardState {
  return {
    agents: [],
    tickets: [],
    activity: [],
    project: {
      name: 'No Project',
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
    error,
  }
}
