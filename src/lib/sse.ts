'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { DashboardState } from '@/types'

const AUTO_REFRESH_MS = 30_000

interface SSEHookResult {
  readonly state: DashboardState | null
  readonly isConnected: boolean
  readonly error: string | null
}

export function useDashboardSSE(): SSEHookResult {
  const [state, setState] = useState<DashboardState | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const lastUpdateRef = useRef<number>(Date.now())
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource('/api/events')
    eventSourceRef.current = es

    es.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DashboardState
        setState(data)
        lastUpdateRef.current = Date.now()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse SSE data'
        setError(message)
      }
    }

    es.onerror = () => {
      setIsConnected(false)
      setError('Connection lost. Reconnecting...')
    }
  }, [])

  // Auto-refresh: if no activity for 30 seconds, force reconnect to get fresh state
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastUpdateRef.current
      if (elapsed >= AUTO_REFRESH_MS) {
        connect()
      }
    }, AUTO_REFRESH_MS)

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [connect])

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [connect])

  return { state, isConnected, error }
}
