import { useEffect, useState } from 'react'
import { upstoxConfig } from '../config/upstox'
import { instrumentKeys } from '../data/instrumentKeys'
import { fetchQuotes } from '../data/upstox/client'
import { mapQuoteResponse, type QuoteSnapshot } from '../data/upstox/mappers'

const REFRESH_MS = 20_000

export interface LiveQuotes {
  bySymbol: Record<string, QuoteSnapshot>
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/** Polls Upstox full-market-quote for the known fixture symbols while a session is active. */
export function useLiveQuotes(accessToken: string | null): LiveQuotes {
  const [bySymbol, setBySymbol] = useState<Record<string, QuoteSnapshot>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!accessToken || !upstoxConfig) {
      setBySymbol({})
      return
    }

    let cancelled = false
    const proxyUrl = upstoxConfig.proxyUrl
    const bySymbolInstrumentKey = Object.entries(instrumentKeys)
    const keys = bySymbolInstrumentKey.map(([, info]) => info.instrumentKey)

    const load = async () => {
      setLoading(true)
      try {
        const raw = await fetchQuotes(proxyUrl, accessToken, keys)
        const quotes = mapQuoteResponse(raw)
        if (cancelled) return

        const next: Record<string, QuoteSnapshot> = {}
        for (const [symbol, info] of bySymbolInstrumentKey) {
          // Upstox's response-object key format for `data` isn't pinned down
          // by the documentation this was built against, so match
          // defensively against either the instrument key or the trading
          // symbol appearing anywhere in the entry, rather than assuming one
          // exact key shape.
          const match = quotes.find(
            (quote) =>
              quote.key === info.instrumentKey ||
              quote.key.includes(info.instrumentKey) ||
              quote.symbol === info.upstoxTradingSymbol,
          )
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
  }, [accessToken])

  return { bySymbol, loading, error, lastUpdated }
}
