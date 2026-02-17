'use client'

import type { DashboardState } from '@/types'
import { TaskSummary } from './task-summary'
import { UsageBar } from './usage-bar'
import { ContextGauge } from './context-gauge'
import { ConnectionBadge } from '@/components/connection-badge'

interface MonitorPanelProps {
  readonly state: DashboardState
  readonly isConnected: boolean
}

export function MonitorPanel({ state, isConnected }: MonitorPanelProps) {
  const { agents, project, resources } = state

  const workingCount = agents.filter(a => a.status === 'working').length
  const idleCount = agents.filter(a => a.status === 'idle').length
  const completedCount = agents.filter(a => a.status === 'completed').length

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-gray-900/50">
      {/* Sticky header */}
      <div className="shrink-0 flex items-center justify-between border-b border-gray-800 bg-gradient-to-r from-emerald-900/30 to-blue-900/30 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <span className="text-lg">🎮</span>
          Agent Monitor
        </h2>
        <ConnectionBadge isConnected={isConnected} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          <TaskSummary
            working={workingCount}
            idle={idleCount}
            completed={completedCount}
          />

          {/* Ticket progress bar */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Tickets:</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{
                  width: project.ticketsSummary.total > 0
                    ? `${(project.ticketsSummary.completed / project.ticketsSummary.total) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <span>{project.ticketsSummary.completed}/{project.ticketsSummary.total}</span>
          </div>

          <div className="text-xs text-gray-500">
            Last updated: {resources.lastUpdated
              ? new Date(resources.lastUpdated).toLocaleTimeString()
              : 'N/A'}
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                  <span className="text-base">🧠</span>
                  Claude Max Usage
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Model: {resources.model} • Reset: PST midnight
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <UsageBar
                label="Daily"
                icon="📅"
                used={resources.daily.used}
                limit={resources.daily.limit}
                resetIn={resources.daily.resetIn}
              />
              <UsageBar
                label="Weekly"
                icon="📊"
                used={resources.weekly.used}
                limit={resources.weekly.limit}
                resetIn={resources.weekly.resetIn}
              />
            </div>
          </div>

          <ContextGauge contextWindow={resources.contextWindow} />
        </div>
      </div>
    </div>
  )
}
