import { describe, expect, it } from 'vitest'
import { signals } from '../../data/market'
import { DEFAULT_POLICY } from '../policy'
import { allocate } from '../size'

describe('allocate', () => {
  it('never returns more allocations than the position cap', () => {
    for (let capital = 1_000; capital <= 1_000_000; capital += 997) {
      const plan = allocate(signals, capital, DEFAULT_POLICY)
      expect(plan.allocations.length).toBeLessThanOrEqual(DEFAULT_POLICY.maxPositions)
    }
  })

  it('never lets total modeled risk exceed the daily risk budget, across a full capital sweep', () => {
    for (let capital = 1_000; capital <= 1_000_000; capital += 1_000) {
      const plan = allocate(signals, capital, DEFAULT_POLICY)
      expect(plan.totalModeledRisk).toBeLessThanOrEqual(plan.riskBudget + 1e-6)
    }
  })

  it('reports a POSITION_CAP breach with the dropped symbols when more than 3 BUY setups are eligible', () => {
    const lowestBuyScore = Math.min(
      ...signals.filter((s) => s.action === 'BUY').map((s) => s.score),
    )
    const extraBuy = {
      ...signals[0],
      symbol: 'EXTRA1',
      score: lowestBuyScore - 1, // rank below all existing BUYs
    }
    const withFourBuys = [...signals, extraBuy]
    const plan = allocate(withFourBuys, 50_000, DEFAULT_POLICY)

    expect(plan.allocations.length).toBeLessThanOrEqual(DEFAULT_POLICY.maxPositions)
    expect(plan.droppedForPositionCap).toContain('EXTRA1')
    expect(plan.breaches.some((b) => b.kind === 'POSITION_CAP')).toBe(true)
  })

  it('every allocated quantity is a positive whole number', () => {
    const plan = allocate(signals, 50_000, DEFAULT_POLICY)
    for (const item of plan.allocations) {
      expect(Number.isInteger(item.quantity)).toBe(true)
      expect(item.quantity).toBeGreaterThan(0)
    }
  })

  it('never invests more than the given capital', () => {
    for (let capital = 1_000; capital <= 1_000_000; capital += 3_331) {
      const plan = allocate(signals, capital, DEFAULT_POLICY)
      expect(plan.invested).toBeLessThanOrEqual(capital)
    }
  })

  it('never sizes a single position above the max-position cash cap', () => {
    for (let capital = 1_000; capital <= 1_000_000; capital += 4_999) {
      const plan = allocate(signals, capital, DEFAULT_POLICY)
      for (const item of plan.allocations) {
        expect(item.amount).toBeLessThanOrEqual(capital * DEFAULT_POLICY.maxPositionPct + 1e-6)
      }
    }
  })

  it('is deterministic: identical inputs produce identical output', () => {
    const first = allocate(signals, 20_000, DEFAULT_POLICY)
    const second = allocate(signals, 20_000, DEFAULT_POLICY)
    expect(second).toEqual(first)
  })

  it('the top-up loop always terminates under its computed ceiling', () => {
    // A regression guard for the old `safety < 100` magic-number loop guard:
    // if allocate() ever hangs or throws on a wide capital sweep, this fails.
    for (let capital = 1_000; capital <= 1_000_000; capital += 2_500) {
      expect(() => allocate(signals, capital, DEFAULT_POLICY)).not.toThrow()
    }
  })

  it('returns an empty plan for zero or negative capital', () => {
    expect(allocate(signals, 0, DEFAULT_POLICY).allocations).toEqual([])
    expect(allocate(signals, -500, DEFAULT_POLICY).allocations).toEqual([])
  })

  it('returns an empty plan when no signal is eligible', () => {
    const noBuys = signals.map((signal) => ({ ...signal, action: 'WATCH' as const, weight: 0 }))
    const plan = allocate(noBuys, 50_000, DEFAULT_POLICY)
    expect(plan.allocations).toEqual([])
    expect(plan.invested).toBe(0)
  })
})
