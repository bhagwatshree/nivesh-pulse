import { describe, expect, it } from 'vitest'
import { isNseMarketOpen } from '../marketHours'

// 2026-09-16 is a Wednesday.
describe('isNseMarketOpen', () => {
  it('is open at the exact opening bell (09:15 IST = 03:45 UTC)', () => {
    expect(isNseMarketOpen(new Date('2026-09-16T03:45:00Z'))).toBe(true)
  })

  it('is open at the exact closing bell (15:30 IST = 10:00 UTC)', () => {
    expect(isNseMarketOpen(new Date('2026-09-16T10:00:00Z'))).toBe(true)
  })

  it('is closed one minute before the opening bell', () => {
    expect(isNseMarketOpen(new Date('2026-09-16T03:44:00Z'))).toBe(false)
  })

  it('is closed one minute after the closing bell', () => {
    expect(isNseMarketOpen(new Date('2026-09-16T10:01:00Z'))).toBe(false)
  })

  it('is open mid-session', () => {
    expect(isNseMarketOpen(new Date('2026-09-16T06:00:00Z'))).toBe(true)
  })

  it('is closed on a Saturday, even during session-equivalent hours', () => {
    // 2026-09-19 is a Saturday.
    expect(isNseMarketOpen(new Date('2026-09-19T06:00:00Z'))).toBe(false)
  })

  it('is closed on a Sunday', () => {
    // 2026-09-20 is a Sunday.
    expect(isNseMarketOpen(new Date('2026-09-20T06:00:00Z'))).toBe(false)
  })

  it('is closed well outside session hours on a weekday', () => {
    expect(isNseMarketOpen(new Date('2026-09-16T18:00:00Z'))).toBe(false) // 23:30 IST
  })
})
