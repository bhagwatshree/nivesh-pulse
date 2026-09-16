import { useEffect, useState } from 'react'
import { growwConfig } from '../config/groww'
import { upstoxConfig } from '../config/upstox'
import { indexKeys } from '../data/indexKeys'
import { fetchGrowwQuote } from '../data/groww/client'
import { mapGrowwQuoteResponse } from '../data/groww/mappers'
import { fetchQuotes } from '../data/upstox/client'
import { mapQuoteResponse } from '../data/upstox/mappers'

const REFRESH_MS = 20_000

export interface LiveIndexQuote {
  label: string
  value: number
  /** Percent change vs. the previous close, or null when the provider didn't return one. */
  changePercent: number | null
}

export interface LiveIndicesResult {
  indices: LiveIndexQuote[] | null
  loading: boolean
  error: string | null
}

/**
 * Live quotes for the market-indices tape (NIFTY 50 / BANK NIFTY / INDIA
 * VIX) — the same providers and the same underlying quote endpoints as the
 * six equity signals, just against index instrument keys instead. No
 * Worker changes were needed for this: /api/quotes and /groww/quote are
 * already generic passthroughs.
 */
export function useLiveIndices(provider: 'upstox' | 'groww' | null, accessToken: string | null): LiveIndicesResult {
  const [indices, setIndices] = useState<LiveIndexQuote[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!provider || !accessToken) {
      setIndices(null)
      return
    }

    let cancelled = false

    const loadFromUpstox = async () => {
      if (!upstoxConfig) return
      const entries = Object.entries(indexKeys).filter(([, info]) => info.upstoxInstrumentKey)
      const keys = entries.map(([, info]) => info.upstoxInstrumentKey as string)
      const raw = await fetchQuotes(upstoxConfig.proxyUrl, accessToken, keys)
      const quotes = mapQuoteResponse(raw)
      return entries.map(([label, info]) => {
        const match = quotes.find(
          (quote) => quote.key === info.upstoxInstrumentKey || quote.key.includes(info.upstoxInstrumentKey as string),
        )
        return {
          label,
          value: match?.lastPrice ?? 0,
          changePercent:
            match && typeof match.close === 'number' && match.close > 0
              ? ((match.lastPrice - match.close) / match.close) * 100
              : null,
        }
      })
    }

    const loadFromGroww = async () => {
      if (!growwConfig) return
      const entries = Object.entries(indexKeys).filter(([, info]) => info.growwTradingSymbol)
      const results = await Promise.allSettled(
        entries.map(async ([label, info]) => {
          const raw = await fetchGrowwQuote(growwConfig!.proxyUrl, accessToken, info.growwTradingSymbol as string)
          const quote = mapGrowwQuoteResponse(raw, label)
          return {
            label,
            value: quote.lastPrice,
            changePercent:
              typeof quote.close === 'number' && quote.close > 0 ? ((quote.lastPrice - quote.close) / quote.close) * 100 : null,
          }
        }),
      )
      return results.filter((r): r is PromiseFulfilledResult<LiveIndexQuote> => r.status === 'fulfilled').map((r) => r.value)
    }

    const load = async () => {
      setLoading(true)
      try {
        const result = provider === 'upstox' ? await loadFromUpstox() : await loadFromGroww()
        if (!cancelled && result) {
          setIndices(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load live indices.')
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
  }, [provider, accessToken])

  return { indices, loading, error }
}
