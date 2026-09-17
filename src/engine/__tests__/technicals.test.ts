import { describe, expect, it } from 'vitest'
import type { Candle } from '../../types'
import { computeATR, computeEMA, computeRSI, computeTechnicalScore, computeVolumeZScore, computeVWAP } from '../technicals'

const candle = (open: number, high: number, low: number, close: number, volume: number, time = '09:15'): Candle => ({
  time,
  open,
  high,
  low,
  close,
  volume,
})

describe('computeEMA', () => {
  it('seeds from the first value', () => {
    expect(computeEMA([10, 10, 10], 9)[0]).toBe(10)
  })

  it('matches a hand-computed 3-period EMA', () => {
    // multiplier = 2/(3+1) = 0.5
    // ema0 = 10
    // ema1 = 20*0.5 + 10*0.5 = 15
    // ema2 = 30*0.5 + 15*0.5 = 22.5
    const ema = computeEMA([10, 20, 30], 3)
    expect(ema).toEqual([10, 15, 22.5])
  })

  it('returns an empty array for empty input', () => {
    expect(computeEMA([], 9)).toEqual([])
  })
})

describe('computeRSI', () => {
  it('is 100 when every change is a gain', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const rsi = computeRSI(closes, 14)
    expect(rsi[rsi.length - 1]).toBe(100)
  })

  it('is 0 when every change is a loss', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 200 - i)
    const rsi = computeRSI(closes, 14)
    expect(rsi[rsi.length - 1]).toBe(0)
  })

  it('is 50 for a perfectly flat price series', () => {
    const closes = Array.from({ length: 20 }, () => 100)
    const rsi = computeRSI(closes, 14)
    expect(rsi[rsi.length - 1]).toBe(50)
  })

  it('is near 50 for strictly alternating equal-magnitude up/down moves', () => {
    const closes = Array.from({ length: 21 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 1))
    const rsi = computeRSI(closes, 14)
    expect(rsi[rsi.length - 1]).toBeGreaterThan(40)
    expect(rsi[rsi.length - 1]).toBeLessThan(60)
  })

  it('returns an empty array when there is not enough data for the period', () => {
    expect(computeRSI([100, 101, 102], 14)).toEqual([])
  })
})

describe('computeVWAP', () => {
  it('matches a hand-computed VWAP for two candles', () => {
    // typical1 = (11+9+10)/3 = 10, pv1 = 10*100 = 1000, cumVol=100 -> vwap1 = 10
    // typical2 = (13+9+12)/3 = 34/3, pv2 = 34/3*200 ≈ 2266.67, cumPV=3266.67, cumVol=300 -> vwap2 ≈ 10.889
    const candles = [candle(10, 11, 9, 10, 100), candle(11, 13, 9, 12, 200)]
    const vwap = computeVWAP(candles)
    expect(vwap[0]).toBeCloseTo(10, 5)
    expect(vwap[1]).toBeCloseTo(10.8889, 3)
  })

  it('falls back to close price when cumulative volume is zero', () => {
    const candles = [candle(10, 10, 10, 10, 0)]
    expect(computeVWAP(candles)[0]).toBe(10)
  })
})

describe('computeVolumeZScore', () => {
  it('is 0 with fewer than 2 data points', () => {
    expect(computeVolumeZScore([100])).toBe(0)
    expect(computeVolumeZScore([])).toBe(0)
  })

  it('is 0 when the baseline has zero variance and the latest matches it', () => {
    expect(computeVolumeZScore([100, 100, 100, 100])).toBe(0)
  })

  it('is strongly positive when the latest volume is far above a flat baseline', () => {
    expect(computeVolumeZScore([100, 100, 100, 500])).toBeGreaterThan(2)
  })

  it('is strongly negative when the latest volume is far below a flat baseline', () => {
    expect(computeVolumeZScore([100, 100, 100, 10])).toBeLessThan(-2)
  })
})

describe('computeTechnicalScore', () => {
  it('returns null with fewer than 15 candles', () => {
    const candles = Array.from({ length: 10 }, (_, i) => candle(100, 101, 99, 100 + i, 10_000))
    expect(computeTechnicalScore(candles)).toBeNull()
  })

  it('scores a strongly bullish setup (rising price with real pullbacks, volume surge) well above a flat/directionless one', () => {
    // 20 candles trending up but with periodic small down-ticks, so RSI
    // lands in the constructive band rather than pegged at 100 (an
    // all-gains series scores 0 momentum under rsiTriangularScore, by
    // design — it's outside the "constructive, not overbought" band).
    const candles: Candle[] = []
    let price = 100
    for (let i = 0; i < 19; i++) {
      const next = price + (i % 4 === 3 ? -0.3 : 0.8)
      candles.push(candle(price, Math.max(price, next) + 0.2, Math.min(price, next) - 0.1, next, 10_000))
      price = next
    }
    candles.push(candle(price, price + 1.5, price - 0.1, price + 1.2, 60_000)) // volume surge on the last candle

    const flatCandles = Array.from({ length: 20 }, () => candle(100, 100.1, 99.9, 100, 10_000))

    const bullishScore = computeTechnicalScore(candles)
    const flatScore = computeTechnicalScore(flatCandles)
    expect(bullishScore).not.toBeNull()
    expect(flatScore).not.toBeNull()
    expect(bullishScore!.total).toBeGreaterThan(flatScore!.total)
    expect(bullishScore!.total).toBeGreaterThan(15)
    expect(bullishScore!.total).toBeLessThanOrEqual(60)
    expect(bullishScore!.volumeZScore).toBeGreaterThan(0)
  })

  it('scores a flat, directionless setup near the bottom of the scale', () => {
    const candles = Array.from({ length: 20 }, () => candle(100, 100.1, 99.9, 100, 10_000))
    const score = computeTechnicalScore(candles)
    expect(score).not.toBeNull()
    expect(score!.total).toBeLessThan(10)
  })

  it('never exceeds its own declared maxTotal', () => {
    const candles: Candle[] = []
    let price = 100
    for (let i = 0; i < 20; i++) {
      const next = price + 0.5
      candles.push(candle(price, next + 5, price - 0.1, next, 5_000 + i * 2_000))
      price = next
    }
    const score = computeTechnicalScore(candles)
    expect(score!.total).toBeLessThanOrEqual(score!.maxTotal)
  })
})

describe('computeATR', () => {
  it('returns null with fewer than period + 1 candles', () => {
    const candles = [candle(9, 10, 8, 9, 10_000), candle(9, 11, 9, 10, 10_000), candle(10, 12, 10, 11, 10_000)]
    expect(computeATR(candles, 14)).toBeNull()
  })

  it('matches a hand-computed 2-period ATR (seed only)', () => {
    // TR1 (candle1 vs prevClose 9): max(11-9, |11-9|, |9-9|) = 2
    // TR2 (candle2 vs prevClose 10): max(12-10, |12-10|, |10-10|) = 2
    // seed atr = avg(TR1, TR2) = 2
    const candles = [candle(9, 10, 8, 9, 10_000), candle(9, 11, 9, 10, 10_000), candle(10, 12, 10, 11.5, 10_000)]
    expect(computeATR(candles, 2)).toBe(2)
  })

  it('matches a hand-computed 2-period ATR with one smoothing step', () => {
    // TR1 = 2, TR2 = 2 (as above), seed atr = 2
    // TR3 (candle3 vs prevClose 11): max(14-11, |14-11|, |11-11|) = 3
    // atr = (2*(2-1) + 3) / 2 = 2.5
    const candles = [
      candle(9, 10, 8, 9, 10_000),
      candle(9, 11, 9, 10, 10_000),
      candle(10, 12, 10, 11, 10_000),
      candle(11, 14, 11, 13, 10_000),
    ]
    expect(computeATR(candles, 2)).toBe(2.5)
  })
})
