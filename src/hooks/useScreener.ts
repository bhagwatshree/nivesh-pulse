import { useEffect, useState } from 'react'
import { growwConfig } from '../config/groww'
import { upstoxConfig } from '../config/upstox'
import type { CorporateAction, NewsArticle } from '../types'

const REFRESH_MS = 60_000

export interface ScreenerPick {
  symbol: string
  name: string
  lastClose: number
  technicalScore: number
  technicalScoreMax: number
  rsi: number
  volumeZScore: number
  lean: 'BUY' | 'WATCH' | 'AVOID'
  // Full technical breakdown + a real ATR — see resolveTechnical/resolveAtr
  // in src/engine/liveSignal.ts. Optional because a payload published
  // before this field existed won't have it; those callers fall back
  // gracefully rather than assuming it's present.
  trendVwap?: number
  momentum?: number
  volume?: number
  emaFast?: number
  emaSlow?: number
  vwap?: number
  atr?: number | null
  /** Real day-over-day change % (previous close vs last price) — null if the scan's quote batch failed or missed this symbol. */
  changePercent?: number | null
}

export interface ScreenerResult {
  generatedAt: string | null
  provider?: 'upstox' | 'groww'
  universeSize?: number
  scannedCount?: number
  picks: ScreenerPick[]
  /** Real Upstox Corporate Actions API data per symbol — absent on a Groww-only day. */
  corporateActionsBySymbol?: Record<string, CorporateAction[]>
  /** Real Upstox News API data per symbol — absent on a Groww-only day. */
  newsBySymbol?: Record<string, NewsArticle[]>
}

export interface UseScreenerResult {
  result: ScreenerResult | null
  loading: boolean
  error: string | null
}

/**
 * Polls the Nifty 50 screener's latest published results
 * (server/upstox-proxy /screener/latest, written by
 * scripts/run-screener-scan.ts on a schedule via GitHub Actions — see
 * .github/workflows/screener-scan.yml). Public, read-only, no token
 * needed — this is precomputed server-side, not fetched per-viewer.
 */
export function useScreener(): UseScreenerResult {
  const [result, setResult] = useState<ScreenerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const proxyUrl = upstoxConfig?.proxyUrl ?? growwConfig?.proxyUrl
    if (!proxyUrl) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${proxyUrl}/screener/latest`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as ScreenerResult
        if (!cancelled) {
          setResult(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the screener.')
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
  }, [])

  return { result, loading, error }
}
