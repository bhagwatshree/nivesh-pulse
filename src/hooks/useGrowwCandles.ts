import { useEffect, useState } from 'react'
import { growwConfig } from '../config/groww'
import { formatIstDateTime } from '../data/groww/istTime'
import { growwInstruments } from '../data/growwInstruments'
import { fetchGrowwCandles } from '../data/groww/client'
import { mapGrowwCandleResponse } from '../data/groww/mappers'
import type { Candle } from '../types'

const WINDOW_HOURS = 7 // comfortably covers a full NSE cash session (9:15–15:30 IST)

export interface LiveCandlesResult {
  candles: Candle[] | null
  loading: boolean
  error: string | null
}

/** Fetches Groww 5-minute candles for one symbol over a rolling recent window while a token is set. */
export function useGrowwCandles(accessToken: string | null, symbol: string): LiveCandlesResult {
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const instrument = growwInstruments[symbol]
    if (!accessToken || !growwConfig || !instrument) {
      setCandles(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    const end = new Date()
    const start = new Date(end.getTime() - WINDOW_HOURS * 60 * 60 * 1000)

    fetchGrowwCandles(
      growwConfig.proxyUrl,
      accessToken,
      instrument.growwSymbol,
      formatIstDateTime(start),
      formatIstDateTime(end),
      '5minute',
    )
      .then((raw) => {
        if (cancelled) return
        setCandles(mapGrowwCandleResponse(raw))
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Groww candles.')
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
