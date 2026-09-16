import { describe, expect, it } from 'vitest'
import { computeSignalPnl } from '../signalOutcome'

describe('computeSignalPnl', () => {
  it('BUY: profits when price rises after the signal fired', () => {
    expect(computeSignalPnl('BUY', 100, 105, 10)).toBe(50)
  })

  it('BUY: loses when price falls after the signal fired', () => {
    expect(computeSignalPnl('BUY', 100, 95, 10)).toBe(-50)
  })

  it('EXIT: "profits" (protected loss) when price keeps falling after the exit fired', () => {
    expect(computeSignalPnl('EXIT', 100, 95, 10)).toBe(50)
  })

  it('EXIT: "loses" (exited too early) when price rises after the exit fired', () => {
    expect(computeSignalPnl('EXIT', 100, 105, 10)).toBe(-50)
  })

  it('is zero for zero or negative quantity, regardless of price movement', () => {
    expect(computeSignalPnl('BUY', 100, 200, 0)).toBe(0)
    expect(computeSignalPnl('BUY', 100, 200, -5)).toBe(0)
  })
})
