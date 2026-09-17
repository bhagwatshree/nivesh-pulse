import { useEffect, useState } from 'react'
import { upstoxConfig } from '../config/upstox'
import { nifty50Keys } from '../data/nifty50Keys'
import { fetchIntradayCandles } from '../data/upstox/client'
import { mapCandleResponse } from '../data/upstox/mappers'
import type { Candle } from '../types'

export interface LiveCandles {
  candles: Candle[] | null
  loading: boolean
  error: string | null
}

/**
 * Fetches live 5-minute intraday candles for one symbol while a session is
 * active. Looks up the instrument key across the full Nifty 50 universe
 * (the same source scripts/run-screener-scan.ts scans), not just the old
 * 6-symbol demo watchlist — so any symbol the screener surfaces can be
 * selected here and get a real chart.
 */
export function useLiveCandles(accessToken: string | null, symbol: string): LiveCandles {
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const instrumentKey = nifty50Keys[symbol]?.upstoxInstrumentKey
    if (!accessToken || !upstoxConfig || !instrumentKey) {
      setCandles(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    fetchIntradayCandles(upstoxConfig.proxyUrl, accessToken, instrumentKey, 'minutes', '5')
      .then((raw) => {
        if (cancelled) return
        setCandles(mapCandleResponse(raw))
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load live candles.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, symbol])

  return { candles, loading, error }
}
