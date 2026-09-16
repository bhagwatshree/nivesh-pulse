// Runs the Nifty 50 technical screener: fetches intraday candles for all
// 50 constituents from whichever provider has a session token stored in
// the Worker's KV (see server/upstox-proxy/src/index.ts /internal/*
// routes), scores each with the real technical-indicator engine
// (src/engine/technicals.ts), and publishes the top 10 back to KV for the
// frontend to display via /screener/latest.
//
// Invoked on a schedule by .github/workflows/screener-scan.yml. Exits
// cleanly (not an error) when the market is closed or no session token is
// available today — both are expected, ordinary conditions, not failures.

import { computeTechnicalScore } from '../src/engine/technicals'
import { isNseMarketOpen } from '../src/lib/marketHours'
import { mapCandleResponse } from '../src/data/upstox/mappers'
import { mapGrowwCandleResponse } from '../src/data/groww/mappers'
import { formatIstDateTime } from '../src/data/groww/istTime'
import { nifty50Keys } from '../src/data/nifty50Keys'
import type { Candle } from '../src/types'

const PROXY_URL = process.env.PROXY_URL ?? 'https://nivesh-pulse-upstox-proxy.bhagwatshree.workers.dev'
const SCAN_SHARED_SECRET = process.env.SCAN_SHARED_SECRET

if (!SCAN_SHARED_SECRET) {
  console.error('SCAN_SHARED_SECRET is not set — refusing to run.')
  process.exit(1)
}

if (!process.env.FORCE_SCREENER_RUN && !isNseMarketOpen(new Date())) {
  console.log('Market is closed — skipping this run. (Set FORCE_SCREENER_RUN=1 to override for testing.)')
  process.exit(0)
}

interface TokenResponse {
  provider: 'upstox' | 'groww' | null
  accessToken: string | null
}

async function getToken(): Promise<TokenResponse> {
  const response = await fetch(`${PROXY_URL}/internal/token`, {
    headers: { Authorization: `Bearer ${SCAN_SHARED_SECRET}` },
  })
  if (!response.ok) throw new Error(`Failed to fetch token: HTTP ${response.status}`)
  return response.json() as Promise<TokenResponse>
}

async function fetchUpstoxCandles(instrumentKey: string, accessToken: string): Promise<Candle[]> {
  // Called directly against Upstox, not through the Worker proxy — this
  // script runs server-side (GitHub Actions), so the CORS restriction the
  // proxy exists to work around for browsers doesn't apply here.
  const url = `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/minutes/5`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Upstox candles HTTP ${response.status}`)
  return mapCandleResponse(await response.json())
}

async function fetchGrowwCandlesDirect(growwSymbol: string, accessToken: string): Promise<Candle[]> {
  const end = new Date()
  const start = new Date(end.getTime() - 7 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    exchange: 'NSE',
    segment: 'CASH',
    groww_symbol: growwSymbol,
    start_time: formatIstDateTime(start),
    end_time: formatIstDateTime(end),
    candle_interval: '5minute',
  })
  const response = await fetch(`https://api.groww.in/v1/historical/candles?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'X-API-VERSION': '1.0' },
  })
  if (!response.ok) throw new Error(`Groww candles HTTP ${response.status}`)
  return mapGrowwCandleResponse(await response.json())
}

interface ScreenerPick {
  symbol: string
  name: string
  lastClose: number
  technicalScore: number
  technicalScoreMax: number
  rsi: number
  volumeZScore: number
  lean: 'BUY' | 'WATCH' | 'AVOID'
}

// Thresholds against the 60-point partial (technical-only) score — NOT
// the spec's real 70/100 gated threshold, which needs the market/sector,
// news, fundamentals and risk-quality evidence this scan doesn't have.
// "lean" is deliberately not "BUY/WAIT/EXIT": those are the tested
// engine's gated verdicts (src/engine/decide.ts) for the six fixture
// symbols with real entry/stop/target levels and live gate data, none of
// which exist for an arbitrary universe-wide scan.
function leanFor(score: number): ScreenerPick['lean'] {
  if (score >= 36) return 'BUY'
  if (score >= 20) return 'WATCH'
  return 'AVOID'
}

async function main() {
  const { provider, accessToken } = await getToken()
  if (!provider || !accessToken) {
    console.log('No session token stored today — skipping this run. Connect via the app to enable scanning.')
    process.exit(0)
  }

  console.log(`Scanning Nifty 50 via ${provider}...`)
  const picks: ScreenerPick[] = []
  const entries = Object.entries(nifty50Keys)

  for (const [symbol, info] of entries) {
    try {
      const upstoxKey = info.upstoxInstrumentKey
      const growwSymbol = info.growwSymbol
      let candles: Candle[] | null = null
      if (provider === 'upstox' && upstoxKey) {
        candles = await fetchUpstoxCandles(upstoxKey, accessToken)
      } else if (provider === 'groww' && growwSymbol) {
        candles = await fetchGrowwCandlesDirect(growwSymbol, accessToken)
      }
      if (!candles) continue

      const score = computeTechnicalScore(candles)
      if (!score) continue

      picks.push({
        symbol,
        name: info.name,
        lastClose: score.lastClose,
        technicalScore: Math.round(score.total * 10) / 10,
        technicalScoreMax: score.maxTotal,
        rsi: Math.round(score.rsi * 10) / 10,
        volumeZScore: Math.round(score.volumeZScore * 100) / 100,
        lean: leanFor(score.total),
      })
    } catch (err) {
      console.warn(`Skipping ${symbol}: ${err instanceof Error ? err.message : err}`)
    }
  }

  picks.sort((a, b) => b.technicalScore - a.technicalScore)
  const top10 = picks.slice(0, 10)

  const payload = {
    generatedAt: new Date().toISOString(),
    provider,
    universeSize: entries.length,
    scannedCount: picks.length,
    picks: top10,
  }

  const publishResponse = await fetch(`${PROXY_URL}/internal/screener`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SCAN_SHARED_SECRET}` },
    body: JSON.stringify(payload),
  })
  if (!publishResponse.ok) throw new Error(`Failed to publish results: HTTP ${publishResponse.status}`)

  console.log(`Published top ${top10.length} of ${picks.length} scanned (of ${entries.length} total).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
