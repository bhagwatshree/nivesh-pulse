import { useEffect, useState } from 'react'
import { upstoxConfig } from '../config/upstox'
import { nifty50Keys } from '../data/nifty50Keys'
import { fetchIntradayCandles } from '../data/upstox/client'
import { mapCandleResponse } from '../data/upstox/mappers'
import type { Candle } from '../types'

const REFRESH_MS = 60_000

export interface LiveCandlesForSymbols {
  bySymbol: Record<string, Candle[]>
  loading: boolean
}

/**
 * Fetches live 5-minute candles for every symbol in `symbols` (not just
 * whichever one is selected) while a session is active — Upstox has no
 * batch candle endpoint, so this is one request per symbol, run in
 * parallel, on the same 60s cadence as the screener poll. Lets more than
 * one name on the Signals list genuinely clear the real BUY gates instead
 * of capping everyone but the selected symbol at WATCH.
 */
export function useLiveCandlesForSymbols(accessToken: string | null, symbols: string[]): LiveCandlesForSymbols {
  const [bySymbol, setBySymbol] = useState<Record<string, Candle[]>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accessToken || !upstoxConfig || symbols.length === 0) {
      setBySymbol({})
      return
    }

    const proxyUrl = upstoxConfig.proxyUrl
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const entries = await Promise.all(
        symbols.map(async (symbol): Promise<[string, Candle[] | null]> => {
          const instrumentKey = nifty50Keys[symbol]?.upstoxInstrumentKey
          if (!instrumentKey) return [symbol, null]
          try {
            const raw = await fetchIntradayCandles(proxyUrl, accessToken, instrumentKey, 'minutes', '5')
            return [symbol, mapCandleResponse(raw)]
          } catch {
            return [symbol, null]
          }
        }),
      )
      if (cancelled) return
      const next: Record<string, Candle[]> = {}
      for (const [symbol, candles] of entries) {
        if (candles) next[symbol] = candles
      }
      setBySymbol(next)
      setLoading(false)
    }

    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [accessToken, symbols])

  return { bySymbol, loading }
}
