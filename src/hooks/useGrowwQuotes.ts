import { useEffect, useState } from 'react'
import { growwConfig } from '../config/groww'
import { growwInstruments } from '../data/growwInstruments'
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
 * Polls Groww's single-instrument quote endpoint for each known fixture
 * symbol. Unlike Upstox's batch quote call, Groww's /live-data/quote takes
 * one instrument per request, so this fires them in parallel each cycle —
 * six requests well under the documented 10 req/s live-data rate limit.
 */
export function useGrowwQuotes(accessToken: string | null): LiveQuotesResult {
  const [bySymbol, setBySymbol] = useState<Record<string, QuoteSnapshot>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!accessToken || !growwConfig) {
      setBySymbol({})
      return
    }

    let cancelled = false
    const proxyUrl = growwConfig.proxyUrl
    const entries = Object.entries(growwInstruments)

    const load = async () => {
      setLoading(true)
      try {
        const results = await Promise.allSettled(
          entries.map(async ([symbol, info]) => {
            const raw = await fetchGrowwQuote(proxyUrl, accessToken, info.growwTradingSymbol)
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
  }, [accessToken])

  return { bySymbol, loading, error, lastUpdated }
}
