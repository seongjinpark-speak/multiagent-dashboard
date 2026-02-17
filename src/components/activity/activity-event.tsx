'use client'

import type { ActivityEvent, Agent } from '@/types'
import { formatTimestamp } from '@/lib/format'

interface ActivityEventRowProps {
  readonly event: ActivityEvent
  readonly agents: readonly Agent[]
}

const TYPE_ICONS: Record<string, string> = {
  'ticket-started': '🔨',
  'ticket-completed': '✅',
  'ticket-failed': '❌',
  'agent-spawned': '🐣',
  'agent-idle': '💤',
  'milestone-started': '🏁',
  'milestone-completed': '🎯',
  'message-sent': '💬',
  'review-submitted': '📝',
  'system': '⚙️',
}

function shortRole(role: string): string {
  const lower = role.toLowerCase()
  if (lower.includes('orchestrat') || lower.includes('main session')) return 'main'
  if (lower.includes('data') && lower.includes('engineer')) return 'data-eng'
  if (lower.includes('eval') && lower.includes('engineer')) return 'eval-eng'
  if (lower.includes('test')) return 'tester'
  if (lower.includes('ml') && lower.includes('scien')) return 'ml-sci'
  if (lower.includes('speech')) return 'speech-sci'
  if (lower.includes('phonet')) return 'phonetician'
  if (lower.includes('architect')) return 'architect'
  if (lower.includes('engineer')) return 'engineer'
  if (lower.includes('scientist')) return 'scientist'
  // Fallback: first word
  return role.split(/[\s,()]+/)[0].toLowerCase().slice(0, 10)
}

function stripAgentPrefix(summary: string): string {
  // Remove leading [agentId] from summary since we render it separately
  return summary.replace(/^\[[\w-]+\]\s*/, '')
}

export function ActivityEventRow({ event, agents }: ActivityEventRowProps) {
  const agent = agents.find(a => a.id === event.agentId)
  const icon = TYPE_ICONS[event.type] ?? '💬'
  const roleLabel = agent ? shortRole(agent.role) : null
  const cleanSummary = stripAgentPrefix(event.summary)

  return (
    <div className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-gray-800/50">
      <span className="shrink-0 font-mono text-[10px] text-gray-500">
        {formatTimestamp(event.timestamp)}
      </span>
      <span className="text-xs">{icon}</span>
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        {roleLabel && (
          <span className="mr-0.5 font-mono text-blue-400">[{roleLabel}]</span>
        )}
        {event.agentId && (
          <span className="mr-1 font-mono text-gray-400">[{event.agentId}]</span>
        )}
        <span className="text-gray-300">{cleanSummary}</span>
      </div>
    </div>
  )
}
