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
  source: 'upstox' | 'groww'
}

export interface LiveIndicesResult {
  /** Keyed by label (e.g. "NIFTY 50"), not an array — makes per-index failover straightforward to merge. */
  byLabel: Record<string, LiveIndexQuote>
  loading: boolean
  error: string | null
}

async function loadFromUpstox(accessToken: string): Promise<LiveIndexQuote[]> {
  if (!upstoxConfig) return []
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
      source: 'upstox' as const,
    }
  })
}

async function loadFromGroww(accessToken: string): Promise<LiveIndexQuote[]> {
  if (!growwConfig) return []
  const entries = Object.entries(indexKeys).filter(([, info]) => info.growwTradingSymbol)
  const results = await Promise.allSettled(
    entries.map(async ([label, info]): Promise<LiveIndexQuote> => {
      const raw = await fetchGrowwQuote(growwConfig!.proxyUrl, accessToken, info.growwTradingSymbol as string)
      const quote = mapGrowwQuoteResponse(raw, label)
      return {
        label,
        value: quote.lastPrice,
        changePercent:
          typeof quote.close === 'number' && quote.close > 0 ? ((quote.lastPrice - quote.close) / quote.close) * 100 : null,
        source: 'groww' as const,
      }
    }),
  )
  return results.filter((r): r is PromiseFulfilledResult<LiveIndexQuote> => r.status === 'fulfilled').map((r) => r.value)
}

/**
 * Live quotes for the market-indices tape (NIFTY 50 / BANK NIFTY / INDIA
 * VIX). Fetches from whichever of Upstox/Groww has a token, in parallel —
 * same automatic-failover shape as the equity quotes merge in App.tsx:
 * Upstox is preferred per index, Groww fills in any index Upstox's fetch
 * didn't return. No Worker changes were needed for this: /api/quotes and
 * /groww/quote were already generic passthroughs.
 */
export function useLiveIndices(upstoxToken: string | null, growwToken: string | null): LiveIndicesResult {
  const [upstoxIndices, setUpstoxIndices] = useState<LiveIndexQuote[]>([])
  const [growwIndices, setGrowwIndices] = useState<LiveIndexQuote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!upstoxToken) {
      setUpstoxIndices([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const result = await loadFromUpstox(upstoxToken)
        if (!cancelled) {
          setUpstoxIndices(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load live Upstox indices.')
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
  }, [upstoxToken])

  useEffect(() => {
    if (!growwToken) {
      setGrowwIndices([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const result = await loadFromGroww(growwToken)
        if (!cancelled) {
          setGrowwIndices(result)
          setError((current) => current ?? null)
        }
      } catch (err) {
        if (!cancelled) setError((current) => current ?? (err instanceof Error ? err.message : 'Failed to load live Groww indices.'))
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
  }, [growwToken])

  const byLabel: Record<string, LiveIndexQuote> = {}
  for (const quote of growwIndices) byLabel[quote.label] = quote // fallback, written first
  for (const quote of upstoxIndices) byLabel[quote.label] = quote // preferred, overwrites Groww per index

  return { byLabel, loading, error }
}
