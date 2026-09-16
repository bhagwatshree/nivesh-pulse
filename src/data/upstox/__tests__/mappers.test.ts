import { describe, expect, it } from 'vitest'
import { mapCandleResponse, mapQuoteResponse, UpstoxResponseShapeError } from '../mappers'

describe('mapCandleResponse', () => {
  it('maps a documented-shape response into ascending-time Candle[]', () => {
    // Deliberately newest-first, as Upstox commonly returns them, to prove
    // the mapper sorts rather than trusting response order.
    const response = {
      status: 'success',
      data: {
        candles: [
          ['2026-09-16T10:15:00+05:30', 101, 102, 100.5, 101.8, 12000, 0],
          ['2026-09-16T10:10:00+05:30', 100, 101.5, 99.8, 101, 15000, 0],
        ],
      },
    }
    const candles = mapCandleResponse(response)
    expect(candles).toHaveLength(2)
    expect(candles[0]).toMatchObject({ open: 100, high: 101.5, low: 99.8, close: 101, volume: 15000 })
    expect(candles[1]).toMatchObject({ open: 101, high: 102, low: 100.5, close: 101.8, volume: 12000 })
    // 10:10 IST candle must come before the 10:15 IST candle.
    expect(candles[0].time).toBe('10:10')
    expect(candles[1].time).toBe('10:15')
  })

  it('throws UpstoxResponseShapeError when data.candles is missing', () => {
    expect(() => mapCandleResponse({ status: 'error' })).toThrow(UpstoxResponseShapeError)
  })

  it('throws UpstoxResponseShapeError on an unparseable timestamp', () => {
    const response = { status: 'success', data: { candles: [['not-a-date', 1, 2, 0.5, 1.5, 100, 0]] } }
    expect(() => mapCandleResponse(response)).toThrow(UpstoxResponseShapeError)
  })

  it('returns an empty array for an empty candle list without throwing', () => {
    expect(mapCandleResponse({ status: 'success', data: { candles: [] } })).toEqual([])
  })
})

describe('mapQuoteResponse', () => {
  it('maps a documented-shape multi-instrument response into a flat list', () => {
    const response = {
      status: 'success',
      data: {
        'NSE_EQ:RELIANCE': {
          symbol: 'RELIANCE',
          last_price: 1418.6,
          ohlc: { open: 1400, high: 1420, low: 1395, close: 1410 },
          volume: 5_000_000,
          timestamp: 1_758_000_000_000,
        },
      },
    }
    const quotes = mapQuoteResponse(response)
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({
      key: 'NSE_EQ:RELIANCE',
      symbol: 'RELIANCE',
      lastPrice: 1418.6,
      open: 1400,
      high: 1420,
      low: 1395,
      close: 1410,
      volume: 5_000_000,
    })
  })

  it('throws UpstoxResponseShapeError when data is missing', () => {
    expect(() => mapQuoteResponse({ status: 'error' })).toThrow(UpstoxResponseShapeError)
  })

  it('throws UpstoxResponseShapeError when an entry has no numeric last_price', () => {
    const response = { status: 'success', data: { X: { symbol: 'X' } } }
    expect(() => mapQuoteResponse(response)).toThrow(UpstoxResponseShapeError)
  })
})
