import { useEffect, useState } from 'react'
import { upstoxConfig } from '../config/upstox'
import { instrumentKeys } from '../data/instrumentKeys'
import { fetchIntradayCandles } from '../data/upstox/client'
import { mapCandleResponse } from '../data/upstox/mappers'
import type { Candle } from '../types'

export interface LiveCandles {
  candles: Candle[] | null
  loading: boolean
  error: string | null
}

/** Fetches live 5-minute intraday candles for one symbol while a session is active. */
export function useLiveCandles(accessToken: string | null, symbol: string): LiveCandles {
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const instrument = instrumentKeys[symbol]
    if (!accessToken || !upstoxConfig || !instrument) {
      setCandles(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    fetchIntradayCandles(upstoxConfig.proxyUrl, accessToken, instrument.instrumentKey, 'minutes', '5')
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
