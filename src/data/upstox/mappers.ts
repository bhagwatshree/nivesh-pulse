import type { Candle } from '../../types'

export class UpstoxResponseShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstoxResponseShapeError'
  }
}

interface RawCandleResponse {
  status?: string
  data?: {
    candles?: unknown[]
  }
}

/**
 * Maps Upstox's Intraday Candle Data V3 response into this app's Candle
 * shape. Contract verified against
 * https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/
 * (fetched 2026-09-16): each candle is
 * [timestamp, open, high, low, close, volume, open_interest].
 *
 * Deliberately sorts by parsed timestamp rather than trusting response
 * order — Upstox candles are commonly newest-first, but that ordering
 * isn't part of the documented contract, and relying on undocumented
 * ordering is exactly the kind of thing that breaks silently later.
 */
export function mapCandleResponse(response: unknown): Candle[] {
  const parsed = response as RawCandleResponse
  const candles = parsed?.data?.candles
  if (!Array.isArray(candles)) {
    throw new UpstoxResponseShapeError(`Unexpected candle response shape from Upstox (status: ${String(parsed?.status)})`)
  }

  return candles
    .map((raw) => {
      const [timestamp, open, high, low, close, volume] = raw as [string, number, number, number, number, number, number?]
      const parsedTime = new Date(timestamp)
      if (Number.isNaN(parsedTime.getTime())) {
        throw new UpstoxResponseShapeError(`Unparseable candle timestamp from Upstox: ${String(timestamp)}`)
      }
      return {
        sortKey: parsedTime.getTime(),
        candle: {
          time: parsedTime.toLocaleTimeString('en-IN', {
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

export interface QuoteSnapshot {
  /** The key Upstox used for this entry in the response's data object. */
  key: string
  symbol?: string
  lastPrice: number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
  timestampMs?: number
}

interface RawQuoteResponse {
  status?: string
  data?: Record<string, Record<string, unknown>>
}

/**
 * Maps Upstox's full market quote response into a flat list. Contract
 * verified against
 * https://upstox.com/developer/api-documentation/get-full-market-quote/
 * (fetched 2026-09-16): `data` is a dict of per-instrument quote objects
 * with last_price, ohlc{open,high,low,close}, volume, timestamp, symbol.
 * The exact key Upstox uses for each entry isn't pinned down by that
 * documentation excerpt, so this reads it generically off Object.entries
 * rather than assuming a specific key format.
 */
export function mapQuoteResponse(response: unknown): QuoteSnapshot[] {
  const parsed = response as RawQuoteResponse
  const data = parsed?.data
  if (!data || typeof data !== 'object') {
    throw new UpstoxResponseShapeError(`Unexpected quote response shape from Upstox (status: ${String(parsed?.status)})`)
  }

  return Object.entries(data).map(([key, entry]) => {
    const ohlc = (entry.ohlc ?? {}) as Record<string, number>
    const lastPrice = entry.last_price
    if (typeof lastPrice !== 'number') {
      throw new UpstoxResponseShapeError(`Quote entry "${key}" is missing a numeric last_price`)
    }
    return {
      key,
      symbol: (entry.symbol ?? entry.trading_symbol) as string | undefined,
      lastPrice,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
      volume: entry.volume as number | undefined,
      timestampMs: entry.timestamp as number | undefined,
    }
  })
}
