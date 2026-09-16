import { describe, expect, it } from 'vitest'
import { GrowwResponseShapeError, mapGrowwCandleResponse, mapGrowwQuoteResponse } from '../mappers'

describe('mapGrowwQuoteResponse', () => {
  it('maps a documented-shape quote response', () => {
    const response = {
      status: 'SUCCESS',
      last_price: 1418.6,
      ohlc: { open: 1400, high: 1425, low: 1395, close: 1400 },
      volume: 4_500_000,
    }
    const quote = mapGrowwQuoteResponse(response, 'RELIANCE')
    expect(quote).toEqual({
      key: 'RELIANCE',
      symbol: 'RELIANCE',
      lastPrice: 1418.6,
      open: 1400,
      high: 1425,
      low: 1395,
      close: 1400,
      volume: 4_500_000,
    })
  })

  it('throws GrowwResponseShapeError when last_price is missing', () => {
    expect(() => mapGrowwQuoteResponse({ status: 'FAILURE' }, 'RELIANCE')).toThrow(GrowwResponseShapeError)
  })
})

describe('mapGrowwCandleResponse', () => {
  it('maps a documented-shape response with numeric epoch-seconds timestamps, sorted ascending', () => {
    const nowSeconds = Math.floor(Date.parse('2026-09-16T10:15:00+05:30') / 1000)
    const earlierSeconds = Math.floor(Date.parse('2026-09-16T10:10:00+05:30') / 1000)
    const response = {
      status: 'SUCCESS',
      payload: {
        candles: [
          [String(nowSeconds), 101, 102, 100.5, 101.8, 12000, null],
          [String(earlierSeconds), 100, 101.5, 99.8, 101, 15000, null],
        ],
      },
    }
    const candles = mapGrowwCandleResponse(response)
    expect(candles).toHaveLength(2)
    expect(candles[0].time).toBe('10:10')
    expect(candles[1].time).toBe('10:15')
    expect(candles[0]).toMatchObject({ open: 100, close: 101, volume: 15000 })
  })

  it('handles ISO-string timestamps too', () => {
    const response = {
      status: 'SUCCESS',
      payload: { candles: [['2026-09-16T10:15:00+05:30', 101, 102, 100.5, 101.8, 12000, null]] },
    }
    expect(() => mapGrowwCandleResponse(response)).not.toThrow()
    expect(mapGrowwCandleResponse(response)[0].time).toBe('10:15')
  })

  it('throws GrowwResponseShapeError when payload.candles is missing', () => {
    expect(() => mapGrowwCandleResponse({ status: 'FAILURE' })).toThrow(GrowwResponseShapeError)
  })

  it('throws GrowwResponseShapeError on an unparseable timestamp', () => {
    const response = { status: 'SUCCESS', payload: { candles: [['not-a-timestamp', 1, 2, 0.5, 1.5, 100, null]] } }
    expect(() => mapGrowwCandleResponse(response)).toThrow(GrowwResponseShapeError)
  })
})
