import { describe, expect, it } from 'vitest'
import { formatIstDateTime } from '../istTime'

describe('formatIstDateTime', () => {
  it('formats a UTC instant as IST yyyy-MM-dd HH:mm:ss', () => {
    // 2026-09-16T04:45:30Z is 10:15:30 IST (UTC+5:30).
    expect(formatIstDateTime(new Date('2026-09-16T04:45:30Z'))).toBe('2026-09-16 10:15:30')
  })

  it('rolls the date forward across the UTC/IST day boundary', () => {
    // 2026-09-16T19:00:00Z is 2026-09-17T00:30:00 IST — the date changes.
    expect(formatIstDateTime(new Date('2026-09-16T19:00:00Z'))).toBe('2026-09-17 00:30:00')
  })
})
