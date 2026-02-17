import { describe, it, expect } from 'vitest'
import {
  formatTokenCount,
  formatResetTimer,
  formatTimestamp,
  truncateSessionId,
} from '../format'

describe('formatTokenCount', () => {
  it('formats millions', () => {
    expect(formatTokenCount(5_000_000)).toBe('5.0M')
    expect(formatTokenCount(1_500_000)).toBe('1.5M')
    expect(formatTokenCount(20_000_000)).toBe('20.0M')
  })

  it('formats thousands', () => {
    expect(formatTokenCount(472_000)).toBe('472k')
    expect(formatTokenCount(43_000)).toBe('43k')
    expect(formatTokenCount(1_000)).toBe('1k')
  })

  it('formats small numbers', () => {
    expect(formatTokenCount(500)).toBe('500')
    expect(formatTokenCount(0)).toBe('0')
  })
})

describe('formatResetTimer', () => {
  it('formats hours and minutes', () => {
    const futureDate = new Date(Date.now() + 23 * 60 * 60_000 + 18 * 60_000)
    const result = formatResetTimer(futureDate)
    expect(result).toMatch(/23h 1[78]m/)
  })

  it('formats days and hours', () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60_000 + 23 * 60 * 60_000)
    const result = formatResetTimer(futureDate)
    expect(result).toMatch(/3d 2[23]h/)
  })

  it('returns "now" for past dates', () => {
    const pastDate = new Date(Date.now() - 1000)
    expect(formatResetTimer(pastDate)).toBe('now')
  })
})

describe('formatTimestamp', () => {
  it('formats ISO string to HH:MM:SS', () => {
    const result = formatTimestamp('2026-02-12T17:32:09.000Z')
    // Result depends on timezone, just verify format
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
  })
})

describe('truncateSessionId', () => {
  it('truncates long session IDs', () => {
    const id = 'a4172b2c-5814-48f0-b1a2-9e3f4d5c6a7b'
    expect(truncateSessionId(id, 20)).toBe('a4172b2c-5814-48f0-b...')
  })

  it('keeps short IDs intact', () => {
    expect(truncateSessionId('main', 20)).toBe('main')
  })
})
