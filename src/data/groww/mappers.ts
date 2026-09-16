import type { Candle } from '../../types'
import type { QuoteSnapshot } from '../upstox/mappers'

export class GrowwResponseShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GrowwResponseShapeError'
  }
}

interface RawGrowwQuoteResponse {
  status?: string
  last_price?: number
  ohlc?: { open?: number; high?: number; low?: number; close?: number }
  volume?: number
}

/**
 * Maps Groww's single-instrument quote response
 * (GET /v1/live-data/quote, contract verified against
 * https://groww.in/trade-api/docs/curl/live-data fetched 2026-09-16) into
 * the same QuoteSnapshot shape the Upstox mapper produces, so both
 * providers can feed the same mergeLiveQuotes overlay.
 */
export function mapGrowwQuoteResponse(response: unknown, symbol: string): QuoteSnapshot {
  const parsed = response as RawGrowwQuoteResponse
  if (typeof parsed?.last_price !== 'number') {
    throw new GrowwResponseShapeError(`Unexpected Groww quote response shape (status: ${String(parsed?.status)})`)
  }
  return {
    key: symbol,
    symbol,
    lastPrice: parsed.last_price,
    open: parsed.ohlc?.open,
    high: parsed.ohlc?.high,
    low: parsed.ohlc?.low,
    // Groww's ohlc.close reflects the previous session's close while the
    // market is open, same convention mergeLiveQuotes assumes for Upstox —
    // it's what "day change" is computed against, not today's own close.
    close: parsed.ohlc?.close,
    volume: parsed.volume,
  }
}

interface RawGrowwCandleResponse {
  status?: string
  payload?: { candles?: unknown[] }
}

function parseGrowwTimestamp(raw: unknown): number {
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000
  if (typeof raw === 'string') {
    // Groww's docs give the type as "string" without a worked example, so
    // handle both a numeric-epoch string and an ISO-ish date string rather
    // than assuming one.
    if (/^\d+$/.test(raw)) {
      const n = Number(raw)
      return n > 1e12 ? n : n * 1000
    }
    const parsed = new Date(raw).getTime()
    if (!Number.isNaN(parsed)) return parsed
  }
  throw new GrowwResponseShapeError(`Unparseable Groww candle timestamp: ${String(raw)}`)
}

/**
 * Maps Groww's historical-candles response
 * (GET /v1/historical/candles, contract verified against
 * https://groww.in/trade-api/docs/curl/backtesting fetched 2026-09-16) into
 * this app's Candle shape. Sorts by parsed timestamp rather than trusting
 * response order, same reasoning as the Upstox mapper.
 */
export function mapGrowwCandleResponse(response: unknown): Candle[] {
  const parsed = response as RawGrowwCandleResponse
  const candles = parsed?.payload?.candles
  if (!Array.isArray(candles)) {
    throw new GrowwResponseShapeError(`Unexpected Groww candle response shape (status: ${String(parsed?.status)})`)
  }

  return candles
    .map((raw) => {
      const [timestamp, open, high, low, close, volume] = raw as [unknown, number, number, number, number, number]
      const sortKey = parseGrowwTimestamp(timestamp)
      return {
        sortKey,
        candle: {
          time: new Date(sortKey).toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          open,
          high,
          low,
          close,
          volume,
        } satisfies Candle,
      }
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => entry.candle)
}
