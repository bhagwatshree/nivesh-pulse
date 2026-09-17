import type { Candle } from '../types'

// Real technical indicators computed from actual candles, feeding the
// spec section 4 categories that can be derived from price/volume alone:
// Trend & session VWAP (25 pts), Momentum (20 pts), Volume & liquidity
// (15 pts) — 60 of the spec's 100 points. Market & sector (15), News &
// events (10), Industry-relative fundamentals (10), and Risk quality (5)
// are NOT computed here — this module has no access to those data
// sources. A score from this file is therefore a genuine but partial
// evidence score, out of 60, not the full spec total. Never silently
// rescale it to look like a score out of 100.

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function rescale(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
  if (fromHigh === fromLow) return toLow
  const t = (value - fromLow) / (fromHigh - fromLow)
  return toLow + t * (toHigh - toLow)
}

/** Standard EMA over a value series. Returns a series the same length as the input; ema[0] seeds from values[0]. */
export function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const multiplier = 2 / (period + 1)
  const ema: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * multiplier + ema[i - 1] * (1 - multiplier))
  }
  return ema
}

/**
 * Wilder's RSI. Returns a series shorter than the input (rsi[0]
 * corresponds to closes[period]) — there is no RSI value until `period`
 * changes have accumulated. Empty array if there isn't enough data.
 * Flat prices (no gains or losses in the seed window) resolve to RSI 50,
 * not NaN.
 */
export function computeRSI(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return []

  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    gains.push(Math.max(0, change))
    losses.push(Math.max(0, -change))
  }

  let avgGain = gains.slice(0, period).reduce((sum, g) => sum + g, 0) / period
  let avgLoss = losses.slice(0, period).reduce((sum, l) => sum + l, 0) / period

  const toRsi = (gain: number, loss: number) => {
    if (loss === 0 && gain === 0) return 50
    const rs = loss === 0 ? Infinity : gain / loss
    return 100 - 100 / (1 + rs)
  }

  const rsi: number[] = [toRsi(avgGain, avgLoss)]
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    rsi.push(toRsi(avgGain, avgLoss))
  }
  return rsi
}

/** Session VWAP (cumulative typical-price × volume ÷ cumulative volume) across the given candles. */
export function computeVWAP(candles: Candle[]): number[] {
  let cumulativeVolume = 0
  let cumulativePriceVolume = 0
  return candles.map((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3
    cumulativeVolume += candle.volume
    cumulativePriceVolume += typical * candle.volume
    return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : candle.close
  })
}

/**
 * How many standard deviations the latest volume is above/below the
 * volumes before it. 0 if there's fewer than 2 data points, or if the
 * baseline has zero variance and the latest volume matches it exactly.
 * A zero-variance baseline that the latest volume does NOT match (every
 * prior candle had identical volume, then this one didn't) is a real
 * signal, not "no signal" — returns a large finite sentinel (±10) rather
 * than silently 0, so a flat-baseline surge still scores.
 */
export function computeVolumeZScore(volumes: number[]): number {
  if (volumes.length < 2) return 0
  const current = volumes[volumes.length - 1]
  const baseline = volumes.slice(0, -1)
  const mean = baseline.reduce((sum, v) => sum + v, 0) / baseline.length
  const variance = baseline.reduce((sum, v) => sum + (v - mean) ** 2, 0) / baseline.length
  const stddev = Math.sqrt(variance)
  if (stddev === 0) return current === mean ? 0 : current > mean ? 10 : -10
  return (current - mean) / stddev
}

/** Peaks at 1.0 at RSI 65 (constructive momentum), tapers to 0 at RSI 50 and RSI 80 (neither weak nor overbought). */
function rsiTriangularScore(rsi: number): number {
  if (rsi <= 50 || rsi >= 80) return 0
  return rsi <= 65 ? (rsi - 50) / 15 : (80 - rsi) / 15
}

/**
 * Wilder's Average True Range: the average, over `period` candles, of the
 * true range (the widest of high-low, |high-prevClose|, |low-prevClose|).
 * A real, standard volatility measure — used to size stops/targets off
 * actual recent price movement instead of an arbitrary fixed rupee gap.
 * Returns null with fewer than `period + 1` candles (no seed available).
 */
export function computeATR(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null

  const trueRanges: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i]
    const prevClose = candles[i - 1].close
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))
  }

  let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
  }
  return atr
}

// Mirrors the screener's technical-only lean cutoffs (see
// scripts/run-screener-scan.ts) so the app's live Signals panel and the
// scheduled 50-stock scan can never quietly drift out of sync. Deliberately
// against the 60-point technical-only score, NOT the DATA_AND_DECISION_SPEC.md
// section 4 gated 70/100 threshold — see src/engine/liveSignal.ts for why.
export const TECHNICAL_BUY_THRESHOLD = 36
export const TECHNICAL_WATCH_THRESHOLD = 20

export interface TechnicalScore {
  /** Sum of the three components below — out of 60, not 100. See module header. */
  total: number
  maxTotal: 60
  trendVwap: number
  momentum: number
  volume: number
  rsi: number
  emaFast: number
  emaSlow: number
  vwap: number
  volumeZScore: number
  lastClose: number
}

/** Needs at least 15 candles (14 changes) for a real RSI reading; returns null otherwise rather than a misleadingly confident score. */
export function computeTechnicalScore(candles: Candle[]): TechnicalScore | null {
  if (candles.length < 15) return null

  const closes = candles.map((candle) => candle.close)
  const volumes = candles.map((candle) => candle.volume)

  const emaFastSeries = computeEMA(closes, 9)
  const emaSlowSeries = computeEMA(closes, 21)
  const vwapSeries = computeVWAP(candles)
  const rsiSeries = computeRSI(closes, 14)

  const lastClose = closes[closes.length - 1]
  const emaFast = emaFastSeries[emaFastSeries.length - 1]
  const emaSlow = emaSlowSeries[emaSlowSeries.length - 1]
  const vwap = vwapSeries[vwapSeries.length - 1]
  const rsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : 50
  const volumeZScore = computeVolumeZScore(volumes)

  // Trend & VWAP (25): half from EMA9-vs-EMA21 separation, half from
  // price-vs-VWAP separation, each rescaled from a modest %-separation
  // range into points and clamped — a large separation doesn't earn
  // unbounded extra credit.
  const emaSeparationPct = emaSlow !== 0 ? ((emaFast - emaSlow) / emaSlow) * 100 : 0
  const trendPoints = clamp(rescale(emaSeparationPct, 0, 1, 0, 12.5), 0, 12.5)
  const vwapSeparationPct = vwap !== 0 ? ((lastClose - vwap) / vwap) * 100 : 0
  const vwapPoints = clamp(rescale(vwapSeparationPct, 0, 0.5, 0, 12.5), 0, 12.5)
  const trendVwap = trendPoints + vwapPoints

  // Momentum (20): constructive-but-not-overbought RSI band.
  const momentum = rsiTriangularScore(rsi) * 20

  // Volume & liquidity (15): participation above its own recent baseline,
  // capped at 2 standard deviations.
  const volume = clamp(rescale(volumeZScore, 0, 2, 0, 15), 0, 15)

  return {
    total: trendVwap + momentum + volume,
    maxTotal: 60,
    trendVwap,
    momentum,
    volume,
    rsi,
    emaFast,
    emaSlow,
    vwap,
    volumeZScore,
    lastClose,
  }
}
