import { useEffect, useState } from 'react'
import { upstoxConfig } from '../config/upstox'
import { nifty50Keys } from '../data/nifty50Keys'
import { fetchQuotes } from '../data/upstox/client'
import { mapQuoteResponse, type QuoteSnapshot } from '../data/upstox/mappers'

const REFRESH_MS = 20_000

export interface LiveQuotes {
  bySymbol: Record<string, QuoteSnapshot>
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/**
 * Polls Upstox's batch full-market-quote endpoint for whichever symbols
 * are currently tracked (the full Nifty 50 universe, not just the old
 * 6-symbol demo watchlist) while a session is active. This is what
 * mergeSignals.ts uses to overlay a real day-over-day change % onto each
 * signal — the previous close it needs lives here, not in the screener's
 * own (candle-derived) numbers.
 */
export function useLiveQuotes(accessToken: string | null, symbols: string[]): LiveQuotes {
  const [bySymbol, setBySymbol] = useState<Record<string, QuoteSnapshot>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!accessToken || !upstoxConfig || symbols.length === 0) {
      setBySymbol({})
      return
    }

    let cancelled = false
    const proxyUrl = upstoxConfig.proxyUrl
    const bySymbolInstrumentKey = symbols
      .map((symbol): [string, string] | null => {
        const instrumentKey = nifty50Keys[symbol]?.upstoxInstrumentKey
        return instrumentKey ? [symbol, instrumentKey] : null
      })
      .filter((entry): entry is [string, string] => entry !== null)
    const keys = bySymbolInstrumentKey.map(([, instrumentKey]) => instrumentKey)

    const load = async () => {
      if (keys.length === 0) return
      setLoading(true)
      try {
        const raw = await fetchQuotes(proxyUrl, accessToken, keys)
        const quotes = mapQuoteResponse(raw)
        if (cancelled) return

        const next: Record<string, QuoteSnapshot> = {}
        for (const [symbol] of bySymbolInstrumentKey) {
          // Confirmed against a real response: Upstox's v2 quote endpoint
          // keys/labels each entry by trading symbol (e.g. "NSE_EQ:WIPRO"),
          // not by the ISIN-based instrument key sent in the request — so
          // matching must go through `quote.symbol`, not the request key.
          const match = quotes.find((quote) => quote.symbol === symbol)
          if (match) next[symbol] = match
        }
        setBySymbol(next)
        setError(null)
        setLastUpdated(new Date())
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load live quotes.')
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
