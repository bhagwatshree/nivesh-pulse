import { useEffect, useState } from 'react'
import { growwConfig } from '../config/groww'
import { formatIstDateTime } from '../data/groww/istTime'
import { nifty50Keys } from '../data/nifty50Keys'
import { fetchGrowwCandles } from '../data/groww/client'
import { mapGrowwCandleResponse } from '../data/groww/mappers'
import type { Candle } from '../types'

const REFRESH_MS = 60_000
const WINDOW_HOURS = 7 // comfortably covers a full NSE cash session (9:15–15:30 IST)

export interface LiveCandlesForSymbols {
  bySymbol: Record<string, Candle[]>
  loading: boolean
}

/**
 * Groww counterpart to useLiveCandlesForSymbols — fetches every symbol in
 * `symbols` in parallel, on the same 60s cadence as the screener poll, so
 * more than one name can genuinely clear the real BUY gates.
 */
export function useGrowwCandlesForSymbols(accessToken: string | null, symbols: string[]): LiveCandlesForSymbols {
  const [bySymbol, setBySymbol] = useState<Record<string, Candle[]>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accessToken || !growwConfig || symbols.length === 0) {
      setBySymbol({})
      return
    }

    const proxyUrl = growwConfig.proxyUrl
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const end = new Date()
      const start = new Date(end.getTime() - WINDOW_HOURS * 60 * 60 * 1000)
      const entries = await Promise.all(
        symbols.map(async (symbol): Promise<[string, Candle[] | null]> => {
          const growwSymbol = nifty50Keys[symbol]?.growwSymbol
          if (!growwSymbol) return [symbol, null]
          try {
            const raw = await fetchGrowwCandles(
              proxyUrl,
              accessToken,
              growwSymbol,
              formatIstDateTime(start),
              formatIstDateTime(end),
              '5minute',
            )
            return [symbol, mapGrowwCandleResponse(raw)]
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
