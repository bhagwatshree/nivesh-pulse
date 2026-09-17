import { useEffect, useState } from 'react'
import { growwConfig } from '../config/groww'
import { nifty50Keys } from '../data/nifty50Keys'
import { fetchGrowwQuote } from '../data/groww/client'
import { mapGrowwQuoteResponse } from '../data/groww/mappers'
import type { QuoteSnapshot } from '../data/upstox/mappers'

const REFRESH_MS = 20_000

export interface LiveQuotesResult {
  bySymbol: Record<string, QuoteSnapshot>
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/**
 * Polls Groww's single-instrument quote endpoint for whichever symbols
 * are currently tracked (the full Nifty 50 universe, not just the old
 * 6-symbol demo watchlist). Unlike Upstox's batch quote call, Groww's
 * /live-data/quote takes one instrument per request, so this fires them
 * in parallel each cycle — comfortably under the documented 10 req/s
 * live-data rate limit for the shortlist sizes this app tracks (~10-15).
 */
export function useGrowwQuotes(accessToken: string | null, symbols: string[]): LiveQuotesResult {
  const [bySymbol, setBySymbol] = useState<Record<string, QuoteSnapshot>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!accessToken || !growwConfig || symbols.length === 0) {
      setBySymbol({})
      return
    }

    let cancelled = false
    const proxyUrl = growwConfig.proxyUrl
    const entries = symbols
      .map((symbol): [string, string] | null => {
        const growwTradingSymbol = nifty50Keys[symbol]?.growwTradingSymbol
        return growwTradingSymbol ? [symbol, growwTradingSymbol] : null
      })
      .filter((entry): entry is [string, string] => entry !== null)

    const load = async () => {
      if (entries.length === 0) return
      setLoading(true)
      try {
        const results = await Promise.allSettled(
          entries.map(async ([symbol, growwTradingSymbol]) => {
            const raw = await fetchGrowwQuote(proxyUrl, accessToken, growwTradingSymbol)
            return [symbol, mapGrowwQuoteResponse(raw, symbol)] as const
          }),
        )
        if (cancelled) return

        const next: Record<string, QuoteSnapshot> = {}
        let anySucceeded = false
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const [symbol, quote] = result.value
            next[symbol] = quote
            anySucceeded = true
          }
        }
        setBySymbol(next)
        setError(anySucceeded ? null : 'Failed to load any Groww quotes — check the token is still valid.')
        if (anySucceeded) setLastUpdated(new Date())
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Groww quotes.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [accessToken, symbols])

  return { bySymbol, loading, error, lastUpdated }
}
