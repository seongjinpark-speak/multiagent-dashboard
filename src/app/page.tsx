'use client'

import { useDashboardSSE } from '@/lib/sse'
import { VillageCanvas } from '@/components/village/village-canvas'
import { MonitorPanel } from '@/components/monitor/monitor-panel'
import { ActivityPanel } from '@/components/activity/activity-panel'
import { TicketTracker } from '@/components/tickets/ticket-tracker'
import { LoadingScreen } from '@/components/loading-screen'
import { ErrorBoundary } from '@/components/error-boundary'

export default function Home() {
  const { state, isConnected, error } = useDashboardSSE()

  if (!state) {
    return <LoadingScreen />
  }

  return (
    <ErrorBoundary>
      <main className="grid h-screen grid-cols-[3fr_2fr] grid-rows-2 overflow-hidden">
        {/* Top-left: Agent Village */}
        <section className="border-b border-r border-gray-800">
          <VillageCanvas agents={state.agents} />
        </section>

        {/* Top-right: Monitor Panel */}
        <section className="overflow-y-auto border-b border-gray-800 p-3">
          <MonitorPanel state={state} isConnected={isConnected} />
        </section>

        {/* Bottom-left: Ticket Tracker */}
        <section className="border-r border-gray-800">
          <TicketTracker
            tickets={state.tickets}
            agents={state.agents}
            currentMilestone={state.project.currentMilestone}
          />
        </section>

        {/* Bottom-right: Activity Log */}
        <section className="overflow-hidden">
          <ActivityPanel events={state.activity} agents={state.agents} />
        </section>

        {/* Error banner */}
        {(error || state.error) && (
          <div className="col-span-2 border-t border-red-800/50 bg-red-950/30 px-4 py-2 text-xs text-red-400">
            {error ?? state.error}
          </div>
        )}
      </main>
    </ErrorBoundary>
  )
}
