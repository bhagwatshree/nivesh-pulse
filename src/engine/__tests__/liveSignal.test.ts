import { describe, expect, it } from 'vitest'
import type { Candle } from '../../types'
import type { ScreenerPick } from '../../hooks/useScreener'
import { buildLiveDecisionProfile, buildLiveSignal, LIVE_SIGNAL_ATR_STOP_MULT, LIVE_SIGNAL_ATR_TARGET_MULT } from '../liveSignal'
import { computeATR, computeTechnicalScore, TECHNICAL_BUY_THRESHOLD } from '../technicals'

const candle = (open: number, high: number, low: number, close: number, volume: number, time = '09:15'): Candle => ({
  time,
  open,
  high,
  low,
  close,
  volume,
})

// Same shape as technicals.test.ts's "strongly bullish setup" — real
// candles that produce a real, non-trivial computeTechnicalScore, so this
// file cross-checks buildLiveSignal against the actual engine output
// rather than a hand-picked expected score.
function bullishCandles(): Candle[] {
  const candles: Candle[] = []
  let price = 100
  for (let i = 0; i < 19; i++) {
    const next = price + (i % 4 === 3 ? -0.3 : 0.8)
    candles.push(candle(price, Math.max(price, next) + 0.2, Math.min(price, next) - 0.1, next, 10_000))
    price = next
  }
  candles.push(candle(price, price + 1.5, price - 0.1, price + 1.2, 60_000))
  return candles
}

const fallbackPick: ScreenerPick = {
  symbol: 'TESTCO',
  name: 'Test Co Ltd.',
  lastClose: 250,
  technicalScore: 40,
  technicalScoreMax: 60,
  rsi: 58,
  volumeZScore: 1.2,
  lean: 'BUY',
}

describe('buildLiveSignal', () => {
  it('derives entry/target/stop from real candles, never a fixed fixture gap', () => {
    const candles = bullishCandles()
    const technical = computeTechnicalScore(candles)!
    const atr = computeATR(candles, 14)!

    const signal = buildLiveSignal({ symbol: 'TESTCO', name: 'Test Co Ltd.', candles, fallback: undefined })

    expect(signal).not.toBeNull()
    expect(signal!.entryLow).toBe(technical.lastClose)
    expect(signal!.entryHigh).toBe(technical.lastClose)
    expect(signal!.stopLoss).toBeCloseTo(technical.lastClose - LIVE_SIGNAL_ATR_STOP_MULT * atr, 2)
    expect(signal!.target).toBeCloseTo(technical.lastClose + LIVE_SIGNAL_ATR_TARGET_MULT * atr, 2)
    expect(signal!.score).toBeCloseTo(technical.total, 1)
    // Action only ever tracks the real score against the real threshold.
    expect(signal!.action).toBe(technical.total >= TECHNICAL_BUY_THRESHOLD ? 'BUY' : 'WATCH')
  })

  it('falls back to the screener\'s published numbers, capped at WATCH, when there are too few live candles', () => {
    const tooFewCandles = [candle(100, 101, 99, 100, 10_000), candle(100, 101, 99, 101, 10_000)]

    const signal = buildLiveSignal({ symbol: 'TESTCO', name: 'Test Co Ltd.', candles: tooFewCandles, fallback: fallbackPick })

    expect(signal).not.toBeNull()
    // Never BUY off the fallback path — no live ATR to size a real stop.
    expect(signal!.action).toBe('WATCH')
    expect(signal!.score).toBe(fallbackPick.technicalScore)
    expect(signal!.price).toBe(fallbackPick.lastClose)
  })

  it('falls back the same way when there are no candles at all (no connected broker session)', () => {
    const signal = buildLiveSignal({ symbol: 'TESTCO', name: 'Test Co Ltd.', candles: null, fallback: fallbackPick })
    expect(signal).not.toBeNull()
    expect(signal!.action).toBe('WATCH')
  })

  it('returns null when neither live candles, a screener fallback, nor a last-known price exist', () => {
    const signal = buildLiveSignal({ symbol: 'TESTCO', name: 'Test Co Ltd.', candles: null, fallback: undefined })
    expect(signal).toBeNull()
  })

  it('falls back to a real last-known price (never fabricated) when a held/pending symbol has no other data', () => {
    const signal = buildLiveSignal({
      symbol: 'TESTCO',
      name: 'Test Co Ltd.',
      candles: null,
      fallback: undefined,
      lastKnownPrice: 312.5,
    })
    expect(signal).not.toBeNull()
    expect(signal!.price).toBe(312.5)
    expect(signal!.action).toBe('WATCH')
    expect(signal!.score).toBe(0)
  })
})

describe('buildLiveDecisionProfile', () => {
  it('builds real components and checks from live technicals, and marks the other four categories unavailable', () => {
    const technical = computeTechnicalScore(bullishCandles())!
    const profile = buildLiveDecisionProfile(technical)

    const trend = profile.components.find((c) => c.label === 'Trend & VWAP')
    expect(trend?.score).toBeCloseTo(technical.trendVwap, 1)

    const unavailable = profile.components.filter((c) => c.detail.startsWith('Not available'))
    expect(unavailable).toHaveLength(4)
    expect(unavailable.every((c) => c.score === 0)).toBe(true)

    expect(profile.checks).toHaveLength(4)
    expect(profile.peerMetrics).toHaveLength(0)
  })

  it('is honestly empty (a single unavailable check) with no live technicals', () => {
    const profile = buildLiveDecisionProfile(null)
    expect(profile.checks).toHaveLength(1)
    expect(profile.checks[0].passed).toBe(false)
    expect(profile.components.every((c) => c.score === 0)).toBe(true)
  })

  it('attaches real corporate actions/news as informational newsEvents, never as a scored component', () => {
    const profile = buildLiveDecisionProfile(
      null,
      [{ name: 'Dividend', expiryDate: '2026-09-20', amount: 5, ratio: null }],
      [{ heading: 'Company wins large order', summary: 'Summary', articleLink: 'https://example.com/a', publishedAtMs: 1 }],
    )
    expect(profile.newsEvents?.corporateActions).toHaveLength(1)
    expect(profile.newsEvents?.news).toHaveLength(1)
    // Still not folded into the scored "News & events" component.
    const newsComponent = profile.components.find((c) => c.label === 'News & events')
    expect(newsComponent?.score).toBe(0)
  })

  it('leaves newsEvents undefined when neither corporate actions nor news exist', () => {
    const profile = buildLiveDecisionProfile(null, [], [])
    expect(profile.newsEvents).toBeUndefined()
  })
})
