import { TaktAdapter } from '@/lib/adapters/takt'
import { ClaudeCodeAdapter } from '@/lib/adapters/claude-code'
import type { DashboardAdapter } from '@/lib/adapters/types'
import { getFileWatcher } from '@/lib/watcher'
import { MOCK_STATE } from '@/lib/mock-data'
import { SSE_HEARTBEAT_MS } from '@/lib/constants'
import type { DashboardState } from '@/types'
import fs from 'fs'
import path from 'path'

function getAdapter(): DashboardAdapter {
  const projectDir = process.env.TAKT_PROJECT_DIR ?? process.cwd()
  const claudeHome = process.env.CLAUDE_HOME ?? `${process.env.HOME}/.claude`

  // Auto-detect: use Takt adapter if .takt/ directory exists, otherwise Claude Code adapter
  const taktDir = path.join(projectDir, '.takt')
  if (fs.existsSync(taktDir)) {
    return new TaktAdapter(projectDir, claudeHome)
  }

  return new ClaudeCodeAdapter(projectDir, claudeHome)
}

function useMockData(): boolean {
  return process.env.USE_MOCK_DATA === 'true'
}

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const send = (data: DashboardState) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      const sendHeartbeat = () => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          closed = true
        }
      }

      if (useMockData()) {
        send(MOCK_STATE)
        const heartbeatInterval = setInterval(sendHeartbeat, SSE_HEARTBEAT_MS)
        stream.cancel = async () => {
          closed = true
          clearInterval(heartbeatInterval)
        }
        return
      }

      const adapter = getAdapter()
      const watcher = getFileWatcher(adapter)

      await watcher.start()
      const initialState = await watcher.getInitialState()
      send(initialState)

      const onUpdate = (state: DashboardState) => send(state)
      watcher.on('update', onUpdate)

      const heartbeatInterval = setInterval(sendHeartbeat, SSE_HEARTBEAT_MS)

      const cleanup = () => {
        closed = true
        clearInterval(heartbeatInterval)
        watcher.off('update', onUpdate)
      }

      stream.cancel = async () => cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
