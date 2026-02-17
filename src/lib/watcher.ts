import { EventEmitter } from 'events'
import { watch, type FSWatcher } from 'chokidar'
import type { DashboardAdapter } from '@/lib/adapters/types'
import type { DashboardState } from '@/types'
import { WATCHER_DEBOUNCE_MS, PERIODIC_REEVAL_MS } from '@/lib/constants'

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private adapter: DashboardAdapter
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private reevalTimer: ReturnType<typeof setInterval> | null = null
  private started = false
  private lastState: DashboardState | null = null

  constructor(adapter: DashboardAdapter) {
    super()
    // SSE clients reconnect frequently (30s auto-refresh), each adding a listener.
    // Allow enough headroom for concurrent connections + reconnect overlap.
    this.setMaxListeners(50)
    this.adapter = adapter
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    const paths = this.adapter.getWatchPaths()

    this.watcher = watch(paths as string[], {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 20,
      },
    })

    this.watcher.on('all', () => {
      this.scheduleUpdate()
    })

    this.watcher.on('error', (error) => {
      this.emit('error', error)
    })

    // Periodic re-evaluation for time-based status transitions (e.g., Done → Idle).
    // Agent status depends on elapsed time since last file modification, so we
    // need to re-read state periodically even when no files change.
    this.reevalTimer = setInterval(() => {
      this.reevaluate()
    }, PERIODIC_REEVAL_MS)
  }

  async getInitialState(): Promise<DashboardState> {
    const state = await this.adapter.readState()
    this.lastState = state
    return state
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const state = await this.adapter.readState()
        this.lastState = state
        this.emit('update', state)
      } catch (error) {
        this.emit('error', error)
      }
    }, WATCHER_DEBOUNCE_MS)
  }

  /**
   * Re-read state and emit update only if agent statuses actually changed.
   * This avoids flooding the SSE stream with identical data.
   */
  private async reevaluate(): Promise<void> {
    try {
      const state = await this.adapter.readState()
      if (this.hasStatusChanged(state)) {
        this.lastState = state
        this.emit('update', state)
      }
    } catch {
      // Ignore periodic re-eval errors to avoid spamming
    }
  }

  private hasStatusChanged(newState: DashboardState): boolean {
    if (!this.lastState) return true

    const oldAgents = this.lastState.agents
    const newAgents = newState.agents

    if (oldAgents.length !== newAgents.length) return true

    for (const newAgent of newAgents) {
      const oldAgent = oldAgents.find(a => a.id === newAgent.id)
      if (!oldAgent || oldAgent.status !== newAgent.status) return true
    }

    return false
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    if (this.reevalTimer) {
      clearInterval(this.reevalTimer)
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
    this.started = false
  }
}

// Singleton instance
let watcherInstance: FileWatcher | null = null

export function getFileWatcher(adapter: DashboardAdapter): FileWatcher {
  if (!watcherInstance) {
    watcherInstance = new FileWatcher(adapter)
  }
  return watcherInstance
}
