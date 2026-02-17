'use client'

import type { Agent } from '@/types'

interface AgentFilterProps {
  readonly agents: readonly Agent[]
  readonly selectedAgent: string
  readonly onSelect: (agentId: string) => void
}

export function AgentFilter({ agents, selectedAgent, onSelect }: AgentFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Filter:</span>
      <select
        value={selectedAgent}
        onChange={e => onSelect(e.target.value)}
        className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
      >
        <option value="all">All</option>
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>
            {agent.id}
          </option>
        ))}
      </select>
    </div>
  )
}
