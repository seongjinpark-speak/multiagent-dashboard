'use client'

import { useRef, useEffect } from 'react'
import type { Agent } from '@/types'
import { renderScene } from './renderer'

interface VillageCanvasProps {
  readonly agents: readonly Agent[]
}

export function VillageCanvas({ agents }: VillageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId: number

    const animate = () => {
      const logicalWidth = canvas.clientWidth
      const logicalHeight = canvas.clientHeight

      if (logicalWidth === 0 || logicalHeight === 0) {
        rafId = requestAnimationFrame(animate)
        return
      }

      const dpr = window.devicePixelRatio || 1
      const physW = Math.round(logicalWidth * dpr)
      const physH = Math.round(logicalHeight * dpr)

      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW
        canvas.height = physH
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, logicalWidth, logicalHeight)
      renderScene(ctx, logicalWidth, logicalHeight, agents, frameRef.current)
      ctx.restore()

      frameRef.current += 1
      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [agents])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <span className="text-base">🏘️</span>
          Agent Village
          <span className="ml-1 text-xs text-gray-500">
            {agents.filter(a => a.id !== 'lead').length} agents
            {agents.some(a => a.id === 'lead') && ' + lead'}
          </span>
        </h2>
        <div className="flex items-center gap-3 rounded-lg border border-gray-700/50 bg-gray-900/80 px-3 py-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">⚡ Working</span>
          <span className="flex items-center gap-1">💤 Idle</span>
          <span className="flex items-center gap-1">✨ Done</span>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
