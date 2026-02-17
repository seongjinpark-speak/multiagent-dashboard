'use client'

import { useState } from 'react'
import type { Ticket, Agent } from '@/types'

interface TicketTrackerProps {
  readonly tickets: readonly Ticket[]
  readonly agents: readonly Agent[]
  readonly currentMilestone: string | null
}

type ViewState =
  | { readonly mode: 'milestones' }
  | { readonly mode: 'tickets' }
  | { readonly mode: 'milestone-detail'; readonly milestoneName: string }
  | { readonly mode: 'ticket-detail'; readonly ticketId: string }

const STATUS_COLORS: Record<string, string> = {
  'completed': 'bg-green-500/20 text-green-400 border-green-500/30',
  'in-progress': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'pending': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  'blocked': 'bg-red-500/20 text-red-400 border-red-500/30',
  'failed': 'bg-red-500/20 text-red-300 border-red-500/30',
}

const PRIORITY_ICONS: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
}

function StatusBadge({ status }: { readonly status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS['pending']
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  )
}

interface MilestoneGroup {
  readonly name: string
  readonly tickets: readonly Ticket[]
  readonly completedCount: number
}

function buildMilestones(tickets: readonly Ticket[]): readonly MilestoneGroup[] {
  const map = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const key = t.milestone || 'Unassigned'
    const existing = map.get(key) ?? []
    map.set(key, [...existing, t])
  }

  return Array.from(map.entries()).map(([name, mTickets]) => ({
    name,
    tickets: mTickets,
    completedCount: mTickets.filter(t => t.status === 'completed').length,
  }))
}

// ─── Sub-views ───

function MilestoneCard({
  milestone,
  isCurrent,
  onClick,
}: {
  readonly milestone: MilestoneGroup
  readonly isCurrent: boolean
  readonly onClick: () => void
}) {
  const total = milestone.tickets.length
  const pct = total > 0 ? Math.round((milestone.completedCount / total) * 100) : 0
  const allDone = milestone.completedCount === total

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors hover:border-gray-600 ${
        isCurrent ? 'border-blue-500/40 bg-blue-950/20' : 'border-gray-800/50 bg-gray-900/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs">{allDone ? '✅' : isCurrent ? '🔵' : '⏳'}</span>
          <span className="text-xs font-semibold text-gray-200">{milestone.name}</span>
          {isCurrent && (
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">current</span>
          )}
        </div>
        <span className="text-[10px] text-gray-500">{milestone.completedCount}/{total} ({pct}%)</span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {milestone.tickets.map(t => (
          <span
            key={t.id}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              t.status === 'completed' ? 'bg-green-500/20 text-green-400' :
              t.status === 'in-progress' ? 'bg-blue-500/20 text-blue-400' :
              t.status === 'blocked' ? 'bg-red-500/20 text-red-400' :
              'bg-gray-700/30 text-gray-500'
            }`}
            title={t.title}
          >
            {t.id}
          </span>
        ))}
      </div>
    </button>
  )
}

function TicketRow({
  ticket,
  agentName,
  onClick,
}: {
  readonly ticket: Ticket
  readonly agentName: string
  readonly onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-gray-800/50 bg-gray-900/30 px-3 py-2 text-left text-xs transition-colors hover:border-gray-600"
    >
      <span className="text-[10px]">{PRIORITY_ICONS[ticket.priority] ?? '⚪'}</span>
      <span className="font-mono text-gray-500">{ticket.id}</span>
      <span className="flex-1 truncate text-gray-300">{ticket.title}</span>
      <span className="truncate text-gray-500" style={{ maxWidth: '100px' }}>{agentName}</span>
      <StatusBadge status={ticket.status} />
    </button>
  )
}

function MilestoneDetailView({
  milestone,
  agentNameMap,
  onTicketClick,
}: {
  readonly milestone: MilestoneGroup
  readonly agentNameMap: Map<string, string>
  readonly onTicketClick: (id: string) => void
}) {
  const total = milestone.tickets.length
  const pct = total > 0 ? Math.round((milestone.completedCount / total) * 100) : 0
  const allDone = milestone.completedCount === total

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-gray-700/50 bg-gray-900/60 p-3">
        <div className="flex items-center gap-2">
          <span>{allDone ? '✅' : '🔵'}</span>
          <span className="text-sm font-semibold text-gray-200">{milestone.name}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
          <span>{milestone.completedCount}/{total} tickets completed</span>
          <span>({pct}%)</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {milestone.tickets.map(t => (
          <TicketRow
            key={t.id}
            ticket={t}
            agentName={agentNameMap.get(t.agentId ?? '') ?? 'unassigned'}
            onClick={() => onTicketClick(t.id)}
          />
        ))}
      </div>
    </div>
  )
}

function TicketDetailView({
  ticket,
  agentName,
}: {
  readonly ticket: Ticket
  readonly agentName: string
}) {
  return (
    <div className="rounded-lg border border-gray-700/50 bg-gray-900/60 p-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px]">{PRIORITY_ICONS[ticket.priority] ?? '⚪'}</span>
        <span className="font-mono text-sm text-gray-400">{ticket.id}</span>
        <StatusBadge status={ticket.status} />
      </div>

      <h3 className="mt-2 text-sm font-semibold text-gray-200">{ticket.title}</h3>

      <div className="mt-3 flex flex-col gap-2 text-xs">
        <div className="flex justify-between border-b border-gray-800/50 pb-1">
          <span className="text-gray-500">Milestone</span>
          <span className="text-gray-300">{ticket.milestone}</span>
        </div>
        <div className="flex justify-between border-b border-gray-800/50 pb-1">
          <span className="text-gray-500">Agent</span>
          <span className="text-gray-300">{agentName}</span>
        </div>
        <div className="flex justify-between border-b border-gray-800/50 pb-1">
          <span className="text-gray-500">Priority</span>
          <span className="text-gray-300">{PRIORITY_ICONS[ticket.priority]} {ticket.priority}</span>
        </div>
        <div className="flex justify-between border-b border-gray-800/50 pb-1">
          <span className="text-gray-500">Status</span>
          <StatusBadge status={ticket.status} />
        </div>
        {ticket.dependencies.length > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Dependencies</span>
            <div className="flex flex-wrap gap-1">
              {ticket.dependencies.map(d => (
                <span key={d} className="rounded bg-gray-700/30 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───

export function TicketTracker({ tickets, agents, currentMilestone }: TicketTrackerProps) {
  const [view, setView] = useState<ViewState>({ mode: 'milestones' })

  const agentNameMap = new Map(agents.map(a => [a.id, a.role]))
  const milestones = buildMilestones(tickets)

  const isDetail = view.mode === 'milestone-detail' || view.mode === 'ticket-detail'

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-gray-900/50">
      {/* Sticky header */}
      <div className="shrink-0 flex items-center justify-between border-b border-gray-800 bg-gradient-to-r from-blue-900/30 to-cyan-900/30 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          {isDetail ? (
            <button
              onClick={() => setView({ mode: 'milestones' })}
              className="flex items-center gap-1 rounded-md border border-gray-700/50 bg-gray-800/80 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
            >
              🏠 Home
            </button>
          ) : (
            <span className="text-base">🎫</span>
          )}
          Ticket Tracker
          <span className="text-xs text-gray-500">({tickets.length})</span>
        </h2>
        {!isDetail && (
          <div className="flex gap-1 rounded-lg border border-gray-700/50 bg-gray-900/80 p-0.5">
            <button
              onClick={() => setView({ mode: 'milestones' })}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                view.mode === 'milestones' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Milestones
            </button>
            <button
              onClick={() => setView({ mode: 'tickets' })}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                view.mode === 'tickets' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              All Tickets
            </button>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {view.mode === 'milestones' && (
          <div className="flex flex-col gap-2">
            {milestones.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-600">No milestones</p>
            ) : (
              milestones.map(m => (
                <MilestoneCard
                  key={m.name}
                  milestone={m}
                  isCurrent={currentMilestone !== null && m.name.includes(currentMilestone)}
                  onClick={() => setView({ mode: 'milestone-detail', milestoneName: m.name })}
                />
              ))
            )}
          </div>
        )}

        {view.mode === 'tickets' && (
          <div className="flex flex-col gap-1">
            {tickets.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-600">No tickets</p>
            ) : (
              tickets.map(t => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  agentName={agentNameMap.get(t.agentId ?? '') ?? 'unassigned'}
                  onClick={() => setView({ mode: 'ticket-detail', ticketId: t.id })}
                />
              ))
            )}
          </div>
        )}

        {view.mode === 'milestone-detail' && (() => {
          const ms = milestones.find(m => m.name === view.milestoneName)
          if (!ms) return <p className="py-8 text-center text-xs text-gray-600">Milestone not found</p>
          return (
            <MilestoneDetailView
              milestone={ms}
              agentNameMap={agentNameMap}
              onTicketClick={(id) => setView({ mode: 'ticket-detail', ticketId: id })}
            />
          )
        })()}

        {view.mode === 'ticket-detail' && (() => {
          const t = tickets.find(tk => tk.id === view.ticketId)
          if (!t) return <p className="py-8 text-center text-xs text-gray-600">Ticket not found</p>
          return (
            <TicketDetailView
              ticket={t}
              agentName={agentNameMap.get(t.agentId ?? '') ?? 'unassigned'}
            />
          )
        })()}
      </div>
    </div>
  )
}
