export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000
    return `${millions.toFixed(1)}M`
  }
  if (count >= 1_000) {
    const thousands = Math.round(count / 1_000)
    return `${thousands}k`
  }
  return String(count)
}

export function formatResetTimer(resetDate: Date): string {
  const now = new Date()
  const diffMs = resetDate.getTime() - now.getTime()

  if (diffMs <= 0) return 'now'

  const totalMinutes = Math.floor(diffMs / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  return `${hours}h ${minutes}m`
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  const time = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  if (isToday) return time

  const monthDay = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${monthDay} ${time}`
}

export function truncateSessionId(sessionId: string, maxLength = 20): string {
  if (sessionId.length <= maxLength) return sessionId
  return `${sessionId.slice(0, maxLength)}...`
}

export function getDailyResetDate(): Date {
  const now = new Date()
  const pst = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  )
  const tomorrow = new Date(pst)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const diffMs = tomorrow.getTime() - pst.getTime()
  return new Date(now.getTime() + diffMs)
}

export function getWeeklyResetDate(): Date {
  const now = new Date()
  const pst = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  )
  const daysUntilMonday = (8 - pst.getDay()) % 7 || 7
  const nextMonday = new Date(pst)
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)
  nextMonday.setHours(0, 0, 0, 0)

  const diffMs = nextMonday.getTime() - pst.getTime()
  return new Date(now.getTime() + diffMs)
}
