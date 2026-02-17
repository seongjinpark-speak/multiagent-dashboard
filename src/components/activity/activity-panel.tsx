'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { ActivityEvent, Agent } from '@/types'
import { ActivityEventRow } from './activity-event'
import { AgentFilter } from './agent-filter'

interface ActivityPanelProps {
  readonly events: readonly ActivityEvent[]
  readonly agents: readonly Agent[]
}

export function ActivityPanel({ events, agents }: ActivityPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAutoScrollRef = useRef(true)

  const filteredEvents = selectedAgent === 'all'
    ? events
    : events.filter(e => e.agentId === selectedAgent)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    isAutoScrollRef.current = atBottom
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isAutoScrollRef.current) return

    el.scrollTop = el.scrollHeight
  }, [filteredEvents])

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-gray-900/50">
      {/* Sticky header */}
      <div className="shrink-0 border-b border-gray-800 bg-gradient-to-r from-amber-900/30 to-purple-900/30 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <span className="text-base">📋</span>
            Activity Log
            <span className="text-xs text-gray-500">({filteredEvents.length})</span>
          </h2>
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="shrink-0 border-b border-gray-800 px-4 py-2">
        <AgentFilter
          agents={agents}
          selectedAgent={selectedAgent}
          onSelect={setSelectedAgent}
        />
      </div>

      {/* Scrollable event list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2"
      >
        {filteredEvents.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-600">No activity yet</p>
        ) : (
          <div className="flex flex-col gap-1">
            {[...filteredEvents].reverse().map((event, i) => (
              <ActivityEventRow key={`${event.timestamp}-${i}`} event={event} agents={agents} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
