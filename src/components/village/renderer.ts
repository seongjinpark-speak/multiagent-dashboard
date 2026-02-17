/**
 * Zone-based village renderer.
 * All three zones (Working / Idle / Completed) always visible.
 * Characters smoothly walk between zones when status changes.
 */
import type { Agent, AgentColor } from '@/types'

// ─── Color palette ───
const PAL: Record<string, { body: string; dark: string; light: string; hat: string }> = {
  blue:   { body: '#3b82f6', dark: '#1e40af', light: '#93bbfd', hat: '#2563eb' },
  red:    { body: '#ef4444', dark: '#991b1b', light: '#fca5a5', hat: '#dc2626' },
  green:  { body: '#22c55e', dark: '#166534', light: '#86efac', hat: '#16a34a' },
  yellow: { body: '#f59e0b', dark: '#92400e', light: '#fcd34d', hat: '#d97706' },
  purple: { body: '#a855f7', dark: '#6b21a8', light: '#d8b4fe', hat: '#9333ea' },
  cyan:   { body: '#06b6d4', dark: '#155e75', light: '#67e8f9', hat: '#0891b2' },
}

type Pal = typeof PAL.blue

const ACTIVITIES = ['chop', 'hammer', 'dig', 'push'] as const
const ZONE_ORDER = ['working', 'idle', 'completed'] as const
type ZoneName = typeof ZONE_ORDER[number]

const ZONE_CFG: Record<ZoneName, { icon: string; label: string; glow: string }> = {
  working:   { icon: '⚡', label: 'Working', glow: '#fbbf24' },
  idle:      { icon: '💤', label: 'Idle',    glow: '#93bbfd' },
  completed: { icon: '✨', label: 'Done',    glow: '#4ade80' },
}

const WALK_DURATION = 90 // frames to walk between zones (~1.5s at 60fps)

function getPal(color: AgentColor): Pal {
  return PAL[color] ?? PAL.blue
}

function isLead(agent: Agent): boolean {
  return agent.id === 'lead' || agent.id === 'main' || agent.id === 'orchestrator'
}

// ─── Position tracking for walking transitions ───

interface AgentPosition {
  readonly currentX: number
  readonly currentY: number
  readonly targetX: number
  readonly targetY: number
  readonly progress: number // 0 = at current, 1 = at target
  readonly zone: ZoneName
}

const agentPositions = new Map<string, AgentPosition>()

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

// ─── Zone backgrounds ───

function drawWorkZone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: number, empty: boolean) {
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#8b7a45')
  g.addColorStop(0.15, '#9c8a52')
  g.addColorStop(0.5, '#8a7640')
  g.addColorStop(1, '#7a6a38')
  ctx.fillStyle = g
  ctx.globalAlpha = empty ? 0.4 : 1
  ctx.beginPath()
  ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 12)
  ctx.fill()
  ctx.globalAlpha = 1

  if (empty) return

  ctx.globalAlpha = 0.15
  for (let i = 0; i < 60; i++) {
    const dx = x + 10 + ((i * 7919) % Math.max(w - 20, 1))
    const dy = y + 10 + ((i * 3571) % Math.max(h - 20, 1))
    ctx.fillStyle = i % 2 === 0 ? '#6b5a2e' : '#a89460'
    ctx.beginPath()
    ctx.arc(dx, dy, 1 + (i % 3), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  for (let i = 0; i < 3; i++) {
    const lx = x + 20 + ((i * 137) % Math.max(w - 60, 1))
    const ly = y + h - 28 + (i % 2) * 8
    ctx.fillStyle = '#6b4c3b'
    ctx.beginPath()
    ctx.ellipse(lx, ly, 12, 4, 0.2 * i, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#8b6c5b'
    ctx.beginPath()
    ctx.ellipse(lx - 1, ly - 1, 10, 3, 0.2 * i, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawIdleZone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, empty: boolean) {
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#2a4a5a')
  g.addColorStop(0.3, '#1e3d4e')
  g.addColorStop(0.7, '#2a4a5a')
  g.addColorStop(1, '#1e3d4e')
  ctx.fillStyle = g
  ctx.globalAlpha = empty ? 0.4 : 1
  ctx.beginPath()
  ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 12)
  ctx.fill()
  ctx.globalAlpha = 1

  if (empty) return

  const mg = ctx.createRadialGradient(x + w / 2, y + h * 0.3, 0, x + w / 2, y + h * 0.3, w * 0.5)
  mg.addColorStop(0, 'rgba(147,197,253,0.08)')
  mg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = mg
  ctx.fillRect(x, y, w, h)

  ctx.globalAlpha = 0.3
  for (let i = 0; i < 8; i++) {
    const sx = x + 15 + ((i * 4919) % Math.max(w - 30, 1))
    const sy = y + 15 + ((i * 2851) % Math.max(h - 50, 1))
    ctx.fillStyle = '#93c5fd'
    ctx.beginPath()
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const flowerColors = [['#f472b6', '#ec4899'], ['#fbbf24', '#f59e0b'], ['#a78bfa', '#8b5cf6'], ['#fb923c', '#f97316']]
  for (let i = 0; i < 12; i++) {
    const fx = x + 12 + ((i * 3137) % Math.max(w - 24, 1))
    const fy = y + h - 25 + ((i * 41) % 15)
    const [lt, dk] = flowerColors[i % flowerColors.length]
    ctx.fillStyle = '#3d8530'
    ctx.fillRect(fx - 0.5, fy + 2, 1.2, 5)
    ctx.fillStyle = lt
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(fx + Math.cos(ang) * 2.2, fy + Math.sin(ang) * 2.2, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = dk
    ctx.beginPath()
    ctx.arc(fx, fy, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawDoneZone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, empty: boolean) {
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#3daa4e')
  g.addColorStop(0.4, '#4abf5e')
  g.addColorStop(1, '#35964a')
  ctx.fillStyle = g
  ctx.globalAlpha = empty ? 0.4 : 1
  ctx.beginPath()
  ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 12)
  ctx.fill()
  ctx.globalAlpha = 1

  if (empty) return

  const confColors = ['#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#c084fc']
  for (let i = 0; i < 25; i++) {
    const cx = x + 10 + ((i * 6271) % Math.max(w - 20, 1))
    const cy = y + 10 + ((i * 4597) % Math.max(h - 20, 1))
    ctx.fillStyle = confColors[i % confColors.length]
    ctx.globalAlpha = 0.2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(i * 0.7)
    ctx.fillRect(-2, -1, 4, 2)
    ctx.restore()
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = '#8b6914'
  ctx.fillRect(x + w / 2 - 1.5, y + h - 40, 3, 20)
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(x + w / 2 + 1.5, y + h - 40)
  ctx.lineTo(x + w / 2 + 14, y + h - 34)
  ctx.lineTo(x + w / 2 + 1.5, y + h - 28)
  ctx.fill()
}

function drawZoneLabel(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string, label: string, _glowColor: string, count: number) {
  ctx.textAlign = 'center'
  ctx.font = 'bold 12px system-ui, sans-serif'
  // White text with shadow for readability on any zone background
  if (count > 0) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 4
    ctx.fillStyle = '#ffffff'
  } else {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
  }
  ctx.fillText(`${icon}  ${label.toUpperCase()}  (${count})`, x, y)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.textAlign = 'left'
}

function drawZoneBorder(ctx: CanvasRenderingContext2D, x: number, y1: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 8])
  ctx.beginPath()
  ctx.moveTo(x, y1 + 12)
  ctx.lineTo(x, y1 + h - 12)
  ctx.stroke()
  ctx.setLineDash([])
}

// ─── Character Drawing ───

function drawCharBody(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(x, y + 28, 14, 5, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawHead(ctx: CanvasRenderingContext2D, x: number, by: number, eyesClosed: boolean, smiling: boolean) {
  ctx.fillStyle = '#fad5a5'
  ctx.beginPath()
  ctx.arc(x, by - 12, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.beginPath()
  ctx.arc(x - 2, by - 14, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#1a1a2e'
  if (eyesClosed) {
    ctx.fillRect(x - 5, by - 12.5, 4, 1.5)
    ctx.fillRect(x + 1, by - 12.5, 4, 1.5)
  } else {
    ctx.beginPath()
    ctx.arc(x - 3.5, by - 13, 1.8, 0, Math.PI * 2)
    ctx.arc(x + 3.5, by - 13, 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x - 2.8, by - 13.8, 0.7, 0, Math.PI * 2)
    ctx.arc(x + 4.2, by - 13.8, 0.7, 0, Math.PI * 2)
    ctx.fill()
  }

  if (smiling) {
    ctx.fillStyle = '#c4956a'
    ctx.beginPath()
    ctx.arc(x, by - 8, 3, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.fill()
  } else if (eyesClosed) {
    ctx.fillStyle = '#c4956a'
    ctx.fillRect(x - 1.5, by - 8.5, 3, 1.2)
  } else {
    ctx.fillStyle = '#c4956a'
    ctx.beginPath()
    ctx.ellipse(x, by - 8, 2.2, 1.2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawHat(ctx: CanvasRenderingContext2D, x: number, by: number, p: Pal) {
  ctx.fillStyle = p.hat
  ctx.beginPath()
  ctx.arc(x, by - 19, 8, Math.PI, 2 * Math.PI)
  ctx.fill()
  ctx.fillRect(x - 11, by - 19, 22, 3)
  ctx.fillStyle = p.light
  ctx.globalAlpha = 0.25
  ctx.beginPath()
  ctx.arc(x - 2, by - 22, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

function drawTorso(ctx: CanvasRenderingContext2D, x: number, by: number, p: Pal) {
  ctx.fillStyle = p.body
  ctx.beginPath()
  ctx.roundRect(x - 10, by - 4, 20, 22, 5)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.roundRect(x - 8, by - 2, 9, 18, 4)
  ctx.fill()
  ctx.fillStyle = p.dark
  ctx.fillRect(x - 10, by + 12, 20, 3)
}

function drawLegs(ctx: CanvasRenderingContext2D, x: number, by: number, p: Pal, walkPhase: number) {
  const lOff = Math.sin(walkPhase) * 3
  const rOff = Math.sin(walkPhase + Math.PI) * 3
  ctx.fillStyle = p.dark
  ctx.beginPath()
  ctx.roundRect(x - 7, by + 17 + lOff, 6, 11, 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x + 1, by + 17 + rOff, 6, 11, 2)
  ctx.fill()
  ctx.fillStyle = '#3d2b1f'
  ctx.beginPath()
  ctx.roundRect(x - 8, by + 25 + lOff, 8, 4, [0, 0, 2, 2])
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x, by + 25 + rOff, 8, 4, [0, 0, 2, 2])
  ctx.fill()
}

function drawArm(ctx: CanvasRenderingContext2D, x: number, by: number, side: 'left' | 'right', angle: number) {
  ctx.save()
  ctx.fillStyle = '#fad5a5'
  const ax = side === 'left' ? x - 10 : x + 10
  ctx.translate(ax, by + 2)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.roundRect(-3, 0, 6, 14, 3)
  ctx.fill()
  ctx.restore()
}

function drawCrown(ctx: CanvasRenderingContext2D, x: number, by: number) {
  ctx.fillStyle = '#fbbf24'
  const cy = by - 28
  ctx.beginPath()
  ctx.moveTo(x - 7, cy + 6)
  ctx.lineTo(x - 7, cy + 2)
  ctx.lineTo(x - 4, cy + 4)
  ctx.lineTo(x, cy)
  ctx.lineTo(x + 4, cy + 4)
  ctx.lineTo(x + 7, cy + 2)
  ctx.lineTo(x + 7, cy + 6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f59e0b'
  for (const [gx, gy] of [[x - 4, cy + 2.5], [x, cy + 0.5], [x + 4, cy + 2.5]]) {
    ctx.beginPath()
    ctx.arc(gx, gy, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawNameLabel(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, lead: boolean) {
  ctx.font = '10px system-ui, sans-serif'
  const tw = ctx.measureText(name).width
  const pw = tw + 14
  const bx = x - pw / 2
  ctx.fillStyle = lead ? 'rgba(37,99,235,0.4)' : 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.roundRect(bx, y, pw, 16, 8)
  ctx.fill()
  if (lead) {
    ctx.strokeStyle = 'rgba(96,165,250,0.35)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }
  ctx.fillStyle = '#e2e8f0'
  ctx.textAlign = 'center'
  ctx.fillText(name, x, y + 11.5)
  ctx.textAlign = 'left'
}

// ─── Walking character (transition between zones) ───

function drawWalkingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal, frame: number, lead: boolean) {
  const by = y
  drawCharBody(ctx, x, y)
  drawLegs(ctx, x, by, p, frame * 0.15)
  drawTorso(ctx, x, by, p)
  drawArm(ctx, x, by, 'left', -0.3 + Math.sin(frame * 0.15) * 0.4)
  drawArm(ctx, x, by, 'right', 0.3 - Math.sin(frame * 0.15) * 0.4)
  drawHead(ctx, x, by, false, false)
  drawHat(ctx, x, by, p)
  if (lead) drawCrown(ctx, x, by)
}

// ─── Activity Animations ───

function drawChoppingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal, frame: number, lead: boolean) {
  const swing = Math.sin(frame * 0.12) * 0.8
  const by = y
  drawCharBody(ctx, x, y)
  drawLegs(ctx, x, by, p, 0)
  drawTorso(ctx, x, by, p)
  drawArm(ctx, x, by, 'left', -0.3)

  ctx.save()
  ctx.translate(x + 10, by + 2)
  ctx.rotate(0.3 + swing)
  ctx.fillStyle = '#fad5a5'
  ctx.beginPath()
  ctx.roundRect(-3, 0, 6, 14, 3)
  ctx.fill()
  ctx.fillStyle = '#6b4c3b'
  ctx.fillRect(1, 12, 2.5, 14)
  ctx.fillStyle = '#9ca3af'
  ctx.beginPath()
  ctx.moveTo(3.5, 12)
  ctx.lineTo(10, 10)
  ctx.lineTo(10, 16)
  ctx.lineTo(3.5, 18)
  ctx.fill()
  ctx.restore()

  drawHead(ctx, x, by, false, false)
  drawHat(ctx, x, by, p)
  if (lead) drawCrown(ctx, x, by)

  ctx.fillStyle = '#6b4c3b'
  ctx.fillRect(x + 22, y + 18, 14, 10)
  ctx.fillStyle = '#8b6c5b'
  ctx.beginPath()
  ctx.ellipse(x + 29, y + 18, 8, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  if (swing < -0.3) {
    ctx.fillStyle = '#a88c7b'
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 3; i++) {
      const cx = x + 26 + Math.cos(frame * 0.3 + i * 2) * 8
      const cy = y + 12 - Math.abs(Math.sin(frame * 0.2 + i)) * 10
      ctx.fillRect(cx, cy, 3, 2)
    }
    ctx.globalAlpha = 1
  }
}

function drawHammeringAgent(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal, frame: number, lead: boolean) {
  const hit = Math.sin(frame * 0.15)
  const by = y
  drawCharBody(ctx, x, y)
  drawLegs(ctx, x, by, p, 0)
  drawTorso(ctx, x, by, p)
  drawArm(ctx, x, by, 'left', -0.4)

  ctx.save()
  ctx.translate(x + 10, by)
  ctx.rotate(0.5 + hit * 0.7)
  ctx.fillStyle = '#fad5a5'
  ctx.beginPath()
  ctx.roundRect(-3, 0, 6, 14, 3)
  ctx.fill()
  ctx.fillStyle = '#6b4c3b'
  ctx.fillRect(0, 11, 2.5, 12)
  ctx.fillStyle = '#6b7280'
  ctx.fillRect(-3, 20, 9, 6)
  ctx.fillStyle = '#9ca3af'
  ctx.fillRect(-3, 20, 9, 2.5)
  ctx.restore()

  drawHead(ctx, x, by, false, false)
  drawHat(ctx, x, by, p)
  if (lead) drawCrown(ctx, x, by)

  ctx.fillStyle = '#4a4a5a'
  ctx.fillRect(x - 26, y + 14, 18, 7)
  ctx.fillRect(x - 23, y + 10, 12, 5)

  if (hit > 0.5) {
    ctx.fillStyle = '#fbbf24'
    ctx.globalAlpha = 0.8
    for (let i = 0; i < 4; i++) {
      const sx = x - 17 + Math.cos(frame * 0.4 + i * 1.5) * (6 + i * 2)
      const sy = y + 8 - Math.abs(Math.sin(frame * 0.3 + i)) * (8 + i * 2)
      ctx.beginPath()
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

function drawDiggingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal, frame: number, lead: boolean) {
  const dig = Math.sin(frame * 0.1)
  const lean = dig * 0.15
  const by = y + dig * 2
  drawCharBody(ctx, x, y)
  drawLegs(ctx, x, by, p, frame * 0.1)

  ctx.save()
  ctx.translate(x, by)
  ctx.rotate(lean)
  ctx.translate(-x, -by)
  drawTorso(ctx, x, by, p)
  drawArm(ctx, x, by, 'left', -0.5 + dig * 0.3)
  drawArm(ctx, x, by, 'right', 0.5 - dig * 0.3)
  drawHead(ctx, x, by, false, false)
  drawHat(ctx, x, by, p)
  if (lead) drawCrown(ctx, x, by)

  ctx.fillStyle = '#6b4c3b'
  ctx.save()
  ctx.translate(x + 14, by + 4)
  ctx.rotate(0.6 - dig * 0.3)
  ctx.fillRect(-1.5, 0, 3, 22)
  ctx.fillStyle = '#6b7280'
  ctx.beginPath()
  ctx.moveTo(-5, 22)
  ctx.lineTo(5, 22)
  ctx.lineTo(2, 30)
  ctx.lineTo(-2, 30)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.restore()

  ctx.fillStyle = '#7a6a38'
  ctx.beginPath()
  ctx.ellipse(x - 20, y + 24, 10, 6, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawPushingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal, frame: number, lead: boolean) {
  const push = Math.sin(frame * 0.08) * 2
  const by = y
  drawCharBody(ctx, x, y)
  drawLegs(ctx, x, by, p, frame * 0.12)

  ctx.save()
  ctx.translate(x, by)
  ctx.rotate(0.12)
  ctx.translate(-x, -by)
  drawTorso(ctx, x, by, p)
  drawArm(ctx, x, by, 'left', 0.3)
  drawArm(ctx, x, by, 'right', 0.7)
  drawHead(ctx, x, by, false, false)
  drawHat(ctx, x, by, p)
  if (lead) drawCrown(ctx, x, by)
  ctx.restore()

  const bx = x + 24 + push
  ctx.fillStyle = '#6b7280'
  ctx.beginPath()
  ctx.arc(bx, y + 16, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#9ca3af'
  ctx.beginPath()
  ctx.arc(bx - 2, y + 13, 8, 0, Math.PI * 2)
  ctx.fill()
}

function drawIdleAgent(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal, frame: number, lead: boolean) {
  const breathe = Math.sin(frame * 0.04) * 1.5
  const by = y + breathe
  drawCharBody(ctx, x, y)
  drawLegs(ctx, x, by, p, 0)
  drawTorso(ctx, x, by, p)
  drawArm(ctx, x, by, 'left', -0.2)
  drawArm(ctx, x, by, 'right', 0.2)
  drawHead(ctx, x, by, true, false)
  drawHat(ctx, x, by, p)
  if (lead) drawCrown(ctx, x, by)

  const drift = Math.sin(frame * 0.05) * 5
  const zzz = [
    { dx: 16, dy: -28, sz: 12, a: 0.7 },
    { dx: 24, dy: -36, sz: 10, a: 0.45 },
    { dx: 30, dy: -42, sz: 8, a: 0.25 },
  ]
  for (const z of zzz) {
    ctx.fillStyle = `rgba(147,197,253,${z.a})`
    ctx.font = `bold ${z.sz}px system-ui`
    ctx.fillText('z', x + z.dx, by + z.dy - drift)
  }
}

function drawCompletedAgent(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal, frame: number, lead: boolean) {
  const bob = Math.sin(frame * 0.06)
  const by = y + bob
  drawCharBody(ctx, x, y)
  drawLegs(ctx, x, by, p, 0)
  drawTorso(ctx, x, by, p)
  drawArm(ctx, x, by, 'left', -1.2 + Math.sin(frame * 0.08) * 0.2)
  drawArm(ctx, x, by, 'right', 1.2 - Math.sin(frame * 0.08 + 1) * 0.2)
  drawHead(ctx, x, by, false, true)
  drawHat(ctx, x, by, p)
  if (lead) drawCrown(ctx, x, by)

  for (let i = 0; i < 5; i++) {
    const angle = frame * 0.035 + (i / 5) * Math.PI * 2
    const dist = 24 + Math.sin(frame * 0.06 + i) * 4
    const sx = x + Math.cos(angle) * dist
    const sy = by - 5 + Math.sin(angle) * dist * 0.5
    const sz = 2.5 + Math.sin(frame * 0.08 + i * 2)
    ctx.globalAlpha = 0.6 + Math.sin(frame * 0.1 + i) * 0.3
    ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#4ade80'
    ctx.beginPath()
    ctx.moveTo(sx, sy - sz)
    ctx.lineTo(sx + sz * 0.35, sy - sz * 0.35)
    ctx.lineTo(sx + sz, sy)
    ctx.lineTo(sx + sz * 0.35, sy + sz * 0.35)
    ctx.lineTo(sx, sy + sz)
    ctx.lineTo(sx - sz * 0.35, sy + sz * 0.35)
    ctx.lineTo(sx - sz, sy)
    ctx.lineTo(sx - sz * 0.35, sy - sz * 0.35)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ─── Grass base ───

function drawGrass(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#4fb85a')
  g.addColorStop(0.5, '#3da34e')
  g.addColorStop(1, '#358c42')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 0.08
  for (let i = 0; i < 200; i++) {
    const rx = ((i * 7919 + 42) % 10000) / 10000 * w
    const ry = ((i * 104729 + 42) % 10000) / 10000 * h
    ctx.fillStyle = i % 2 === 0 ? '#2d7a38' : '#5cc86a'
    ctx.beginPath()
    ctx.arc(rx, ry, 1 + (i % 3), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ─── Zone slot computation ───

function computeSlotPosition(
  zoneIndex: number,
  slotIndex: number,
  slotCount: number,
  zoneW: number,
  h: number,
  pad: number,
): { x: number; y: number } {
  const cols = slotCount <= 2 ? 1 : slotCount <= 4 ? 2 : 3
  const rows = Math.ceil(slotCount / cols)
  const cellW = (zoneW - pad * 2) / (cols + 0.3)
  const cellH = Math.min(130, (h - 60) / Math.max(rows, 1))
  const startY = 40
  const zx = zoneIndex * zoneW

  const col = slotIndex % cols
  const row = Math.floor(slotIndex / cols)
  return {
    x: zx + pad + (col + 0.65) * cellW,
    y: startY + (row + 0.5) * cellH,
  }
}

// ─── Main render function ───

export function renderScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  agents: readonly Agent[],
  frame: number,
) {
  drawGrass(ctx, w, h)

  // Group agents by status
  const groups: Record<ZoneName, Agent[]> = { working: [], idle: [], completed: [] }
  for (const a of agents) {
    if (a.status in groups) {
      groups[a.status as ZoneName].push(a)
    }
  }

  // Always render all 3 zones
  const zoneW = w / 3
  const pad = 8

  for (let zi = 0; zi < ZONE_ORDER.length; zi++) {
    const zone = ZONE_ORDER[zi]
    const zx = zi * zoneW
    const isEmpty = groups[zone].length === 0

    if (zone === 'working') drawWorkZone(ctx, zx + pad, pad, zoneW - pad * 2, h - pad * 2, frame, isEmpty)
    else if (zone === 'idle') drawIdleZone(ctx, zx + pad, pad, zoneW - pad * 2, h - pad * 2, isEmpty)
    else drawDoneZone(ctx, zx + pad, pad, zoneW - pad * 2, h - pad * 2, isEmpty)

    const cfg = ZONE_CFG[zone]
    drawZoneLabel(ctx, zx + zoneW / 2, 24, cfg.icon, cfg.label, cfg.glow, groups[zone].length)

    if (zi > 0) drawZoneBorder(ctx, zx, pad, h - pad * 2)
  }

  // Compute target positions for all agents and update position tracking
  for (let zi = 0; zi < ZONE_ORDER.length; zi++) {
    const zone = ZONE_ORDER[zi]
    const za = groups[zone]

    for (let ai = 0; ai < za.length; ai++) {
      const agent = za[ai]
      const target = computeSlotPosition(zi, ai, za.length, zoneW, h, pad)
      const prev = agentPositions.get(agent.id)

      if (!prev) {
        // First time seeing this agent — place directly at target
        agentPositions.set(agent.id, {
          currentX: target.x,
          currentY: target.y,
          targetX: target.x,
          targetY: target.y,
          progress: 1,
          zone,
        })
      } else if (
        Math.abs(prev.targetX - target.x) > 2 ||
        Math.abs(prev.targetY - target.y) > 2
      ) {
        // Target changed — start walking transition
        const renderX = prev.progress >= 1
          ? prev.targetX
          : lerp(prev.currentX, prev.targetX, easeInOut(prev.progress))
        const renderY = prev.progress >= 1
          ? prev.targetY
          : lerp(prev.currentY, prev.targetY, easeInOut(prev.progress))

        agentPositions.set(agent.id, {
          currentX: renderX,
          currentY: renderY,
          targetX: target.x,
          targetY: target.y,
          progress: 0,
          zone,
        })
      } else if (prev.progress < 1) {
        // Still walking — advance progress
        agentPositions.set(agent.id, {
          ...prev,
          progress: Math.min(1, prev.progress + 1 / WALK_DURATION),
          zone,
        })
      }
    }
  }

  // Clean up agents that no longer exist
  for (const id of agentPositions.keys()) {
    if (!agents.some(a => a.id === id)) {
      agentPositions.delete(id)
    }
  }

  // Render all agents at their interpolated positions
  for (const agent of agents) {
    const pos = agentPositions.get(agent.id)
    if (!pos) continue

    const t = easeInOut(pos.progress)
    const rx = lerp(pos.currentX, pos.targetX, t)
    const ry = lerp(pos.currentY, pos.targetY, t)
    const p = getPal(agent.color)
    const lead = isLead(agent)
    const walking = pos.progress < 1

    if (walking) {
      // Walking animation during zone transition
      drawWalkingAgent(ctx, rx, ry, p, frame, lead)
    } else if (agent.status === 'working') {
      const activityIndex = agents.indexOf(agent) % ACTIVITIES.length
      const activity = ACTIVITIES[activityIndex]
      if (activity === 'chop') drawChoppingAgent(ctx, rx, ry, p, frame, lead)
      else if (activity === 'hammer') drawHammeringAgent(ctx, rx, ry, p, frame, lead)
      else if (activity === 'dig') drawDiggingAgent(ctx, rx, ry, p, frame, lead)
      else drawPushingAgent(ctx, rx, ry, p, frame, lead)
    } else if (agent.status === 'idle') {
      drawIdleAgent(ctx, rx, ry, p, frame, lead)
    } else {
      drawCompletedAgent(ctx, rx, ry, p, frame, lead)
    }

    const nameLabel = agent.id.length > 18 ? agent.id.slice(0, 16) + '...' : agent.id
    drawNameLabel(ctx, rx, ry + 38, nameLabel, lead)
  }
}
