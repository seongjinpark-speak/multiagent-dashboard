export type AgentStatus = 'working' | 'idle' | 'completed'

export type AgentColor = 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'cyan'

export type ModelTier = 'opus' | 'sonnet' | 'haiku'

export interface Agent {
  readonly id: string
  readonly role: string
  readonly modelTier: ModelTier
  readonly status: AgentStatus
  readonly color: AgentColor
  readonly ticketsAssigned: number
  readonly ticketsCompleted: number
  readonly currentTicket: string | null
  readonly sessionId: string | null
}

export type TicketStatus = 'pending' | 'in-progress' | 'completed' | 'blocked' | 'failed'

export type TicketPriority = 'critical' | 'high' | 'medium' | 'low'

export interface Ticket {
  readonly id: string
  readonly title: string
  readonly agentId: string | null
  readonly milestone: string
  readonly status: TicketStatus
  readonly priority: TicketPriority
  readonly dependencies: readonly string[]
}

export type ActivityEventType =
  | 'ticket-started'
  | 'ticket-completed'
  | 'ticket-failed'
  | 'agent-spawned'
  | 'agent-idle'
  | 'milestone-started'
  | 'milestone-completed'
  | 'message-sent'
  | 'review-submitted'
  | 'system'

export interface ActivityEvent {
  readonly timestamp: string
  readonly agentId: string | null
  readonly sessionId: string | null
  readonly type: ActivityEventType
  readonly summary: string
}

export interface TicketsSummary {
  readonly total: number
  readonly completed: number
  readonly inProgress: number
  readonly pending: number
  readonly blocked: number
  readonly failed: number
}

export interface ProjectState {
  readonly name: string
  readonly phase: string
  readonly status: string
  readonly currentMilestone: string | null
  readonly activeAgents: readonly string[]
  readonly ticketsSummary: TicketsSummary
  readonly startedAt: string | null
  readonly lastUpdatedAt: string | null
}

export interface UsagePeriod {
  readonly used: number
  readonly limit: number
  readonly resetIn: string
}

export interface ContextWindow {
  readonly used: number
  readonly total: number
  readonly percentage: number
}

export interface ResourceUsage {
  readonly daily: UsagePeriod
  readonly weekly: UsagePeriod
  readonly contextWindow: ContextWindow
  readonly model: string
  readonly lastUpdated: string | null
}

export interface Message {
  readonly timestamp: string
  readonly from: string
  readonly to: string
  readonly ticketId: string | null
  readonly content: string
  readonly urgency: 'normal' | 'high'
}

export interface DashboardState {
  readonly agents: readonly Agent[]
  readonly tickets: readonly Ticket[]
  readonly activity: readonly ActivityEvent[]
  readonly project: ProjectState
  readonly resources: ResourceUsage
  readonly messages: readonly Message[]
  readonly error: string | null
}
