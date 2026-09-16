import { describe, expect, it } from 'vitest'
import type { StockSignal } from '../../../types'
import { mergeLiveQuotes } from '../mergeSignals'

const baseSignal: StockSignal = {
  symbol: 'RELIANCE',
  company: 'Reliance Industries',
  sector: 'Energy',
  exchange: 'NSE',
  price: 1400,
  changePercent: 1.0,
  action: 'BUY',
  score: 82,
  entryLow: 1395,
  entryHigh: 1405,
  target: 1420,
  stopLoss: 1385,
  weight: 38,
  horizon: '10–25 min',
  riskReward: '1 : 1.7',
  updatedAt: '10:00:00',
  thesis: 'fixture thesis',
  caution: 'fixture caution',
  catalyst: 'fixture catalyst',
  factors: [],
  candles: [],
}

describe('mergeLiveQuotes', () => {
  it('leaves a signal untouched when no live quote is available for it', () => {
    const merged = mergeLiveQuotes([baseSignal], {})
    expect(merged[0]).toEqual(baseSignal)
  })

  it('overrides price and recomputes changePercent from the live quote', () => {
    const merged = mergeLiveQuotes([baseSignal], {
      RELIANCE: { key: 'x', lastPrice: 1428, close: 1400 },
    })
    expect(merged[0].price).toBe(1428)
    expect(merged[0].changePercent).toBeCloseTo(2.0, 5)
  })

  it('keeps every decision-engine field unchanged (score, entry/target/stop, thesis)', () => {
    const merged = mergeLiveQuotes([baseSignal], {
      RELIANCE: { key: 'x', lastPrice: 1428, close: 1400 },
    })
    expect(merged[0].score).toBe(baseSignal.score)
    expect(merged[0].entryLow).toBe(baseSignal.entryLow)
    expect(merged[0].entryHigh).toBe(baseSignal.entryHigh)
    expect(merged[0].target).toBe(baseSignal.target)
    expect(merged[0].stopLoss).toBe(baseSignal.stopLoss)
    expect(merged[0].thesis).toBe(baseSignal.thesis)
    expect(merged[0].action).toBe(baseSignal.action)
  })

  it('falls back to the fixture changePercent when the live quote has no close', () => {
    const merged = mergeLiveQuotes([baseSignal], { RELIANCE: { key: 'x', lastPrice: 1428 } })
    expect(merged[0].price).toBe(1428)
    expect(merged[0].changePercent).toBe(baseSignal.changePercent)
  })
})
