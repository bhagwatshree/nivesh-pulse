import type { ScreenerPick } from '../hooks/useScreener'
import type {
  Candle,
  DecisionCheck,
  DecisionContribution,
  DecisionProfile,
  SignalAction,
  SignalFactor,
  StockSignal,
} from '../types'
import { DEFAULT_POLICY, type RiskPolicy } from './policy'
import { computeATR, computeTechnicalScore, TECHNICAL_BUY_THRESHOLD, type TechnicalScore } from './technicals'

// This module replaces src/data/market.ts's hardcoded fixture signals with
// numbers derived from real candles (via computeTechnicalScore/computeATR)
// or, failing that, the real (but coarser) numbers already published by
// the scheduled 50-stock scan (scripts/run-screener-scan.ts). Nothing here
// is invented: entry is always the live price, stop/target come from a
// real volatility measure (ATR), and any evidence category this app has
// no live feed for (market/sector, news, fundamentals, risk quality) is
// marked "not available" rather than filled with a plausible-looking
// number. See docs/IMPLEMENTATION_PLAN.md Phase 6 for the longer-term
// "data seam" this is a pragmatic step toward.

// Documented policy multiples for turning a real ATR into a stop/target —
// a disclosed choice, same style as DEFAULT_POLICY's risk constants below.
// Not derived from DATA_AND_DECISION_SPEC.md; there is no spec-mandated
// stop-sizing rule to follow here.
export const LIVE_SIGNAL_ATR_STOP_MULT = 1.5
export const LIVE_SIGNAL_ATR_TARGET_MULT = 2

// DATA_AND_DECISION_SPEC.md section 4's BUY threshold is 100-point and
// combines four sources this app has no live feed for beyond technicals
// (Market & sector, News & events, Peer fundamentals, Risk quality). Empty here.
// Rather than fabricate those categories, this policy's BUY bar is
// rescaled to computeTechnicalScore's real 60-point technical-only score,
// mirroring the screener's own cutoff so the two views can't drift apart.
// DEFAULT_POLICY (buyThreshold 70) is untouched everywhere else.
export const LIVE_POLICY: RiskPolicy = { ...DEFAULT_POLICY, buyThreshold: TECHNICAL_BUY_THRESHOLD }

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function rsiTone(rsi: number): SignalFactor['tone'] {
  if (rsi >= 80 || rsi <= 30) return 'negative'
  if (rsi >= 55) return 'positive'
  return 'neutral'
}

function riskRewardLabel(entry: number, target: number, stopLoss: number): string {
  const risk = entry - stopLoss
  const reward = target - entry
  if (risk <= 0) return '—'
  return `1 : ${(reward / risk).toFixed(1)}`
}

function buildFactors(technical: TechnicalScore): SignalFactor[] {
  const vwapSeparationPct = technical.vwap !== 0 ? ((technical.lastClose - technical.vwap) / technical.vwap) * 100 : 0
  return [
    { label: 'RSI (14)', value: technical.rsi.toFixed(1), tone: rsiTone(technical.rsi) },
    {
      label: 'VWAP',
      value: `${vwapSeparationPct >= 0 ? '+' : ''}${vwapSeparationPct.toFixed(2)}%`,
      tone: vwapSeparationPct >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Volume',
      value: `${technical.volumeZScore.toFixed(2)}σ`,
      tone: technical.volumeZScore > 0.5 ? 'positive' : technical.volumeZScore < -0.5 ? 'negative' : 'neutral',
    },
  ]
}

function buildThesis(technical: TechnicalScore): string {
  const trendState = technical.emaFast > technical.emaSlow ? 'EMA9 is above EMA21' : 'EMA9 is below EMA21'
  const vwapState = technical.lastClose >= technical.vwap ? 'price is at/above session VWAP' : 'price is below session VWAP'
  return `${trendState} and ${vwapState}. RSI(14) is ${technical.rsi.toFixed(1)}; volume is ${technical.volumeZScore.toFixed(2)} standard deviations from its recent baseline.`
}

export interface LiveSignalInput {
  symbol: string
  name: string
  sector?: string
  /** Live candles for this symbol, when a broker session is connected and this is the selected symbol. */
  candles: Candle[] | null
  /** The screener's last published (coarser, real) numbers for this symbol, used when `candles` isn't available. */
  fallback?: ScreenerPick
}

/**
 * Builds a real StockSignal from live candles when available, or the
 * screener's last published numbers otherwise. Returns null only when
 * neither source has anything for this symbol.
 */
export function buildLiveSignal({ symbol, name, sector, candles, fallback }: LiveSignalInput): StockSignal | null {
  const technical = candles ? computeTechnicalScore(candles) : null

  if (technical && candles) {
    const atr = computeATR(candles, 14)
    const price = technical.lastClose
    const hasStop = atr !== null && atr > 0
    const stopLoss = hasStop ? +(price - LIVE_SIGNAL_ATR_STOP_MULT * atr).toFixed(2) : price
    const target = hasStop ? +(price + LIVE_SIGNAL_ATR_TARGET_MULT * atr).toFixed(2) : price
    // No real ATR yet (too few candles this session) — nothing to size a stop
    // against, so this can only ever be a WATCH, never a BUY.
    const action: SignalAction = hasStop && technical.total >= TECHNICAL_BUY_THRESHOLD ? 'BUY' : 'WATCH'
    const weight = action === 'BUY' ? Math.round((technical.total / technical.maxTotal) * (DEFAULT_POLICY.maxPositionPct * 100)) : 0

    return {
      symbol,
      company: name,
      sector: sector ?? 'NSE-listed',
      exchange: 'NSE',
      price,
      changePercent: 0,
      action,
      score: round1(technical.total),
      entryLow: price,
      entryHigh: price,
      target,
      stopLoss,
      weight,
      horizon: 'Intraday · 5-min bars',
      riskReward: hasStop ? riskRewardLabel(price, target, stopLoss) : '—',
      updatedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      thesis: buildThesis(technical),
      caution: hasStop
        ? `Invalidated on a 5-minute close below ₹${stopLoss.toFixed(2)}.`
        : 'Not enough candles yet this session to size a real stop.',
      catalyst: 'Technical scan only — no live news or fundamentals feed.',
      factors: buildFactors(technical),
      candles,
    }
  }

  if (fallback) {
    const price = fallback.lastClose
    return {
      symbol,
      company: name,
      sector: sector ?? 'NSE-listed',
      exchange: 'NSE',
      price,
      changePercent: 0,
      // Always WATCH: without this symbol's own live candles there's no
      // real ATR to size a stop against, so it can't be gated to BUY here —
      // select it to fetch live candles and get a real decision.
      action: 'WATCH',
      score: fallback.technicalScore,
      entryLow: price,
      entryHigh: price,
      target: price,
      stopLoss: price,
      weight: 0,
      horizon: 'Intraday · 5-min bars',
      riskReward: '—',
      updatedAt: 'Last screener scan',
      thesis: `Screener technical score ${fallback.technicalScore}/${fallback.technicalScoreMax}: RSI ${fallback.rsi}, volume z-score ${fallback.volumeZScore}.`,
      caution: 'Select this symbol with a broker session connected for a live chart and a real stop before acting.',
      catalyst: 'Technical scan only — no live news or fundamentals feed.',
      factors: [
        { label: 'RSI (14)', value: fallback.rsi.toFixed(1), tone: rsiTone(fallback.rsi) },
        {
          label: 'Volume z-score',
          value: `${fallback.volumeZScore.toFixed(2)}σ`,
          tone: fallback.volumeZScore > 0.5 ? 'positive' : fallback.volumeZScore < -0.5 ? 'negative' : 'neutral',
        },
      ],
      candles: [],
    }
  }

  return null
}

function unavailableComponent(
  label: string,
  maxScore: number,
  source: DecisionContribution['source'] = 'market',
): DecisionContribution {
  return { label, score: 0, maxScore, detail: 'Not available — no live feed for this category yet.', source }
}

const NO_LIVE_FEED_CHECK: DecisionCheck = {
  label: 'Live feed',
  passed: false,
  detail: 'No live candles for this symbol yet — connect a broker session to see the full gate breakdown.',
}

const UNAVAILABLE_PEER_GROUP = 'Not available — no live fundamentals/peer feed yet.'

/**
 * Builds a real DecisionProfile from live technicals when available.
 * Market & sector / News & events / Peer fundamentals / Risk quality stay
 * explicitly "not available" (score 0, disclosed) rather than faked —
 * mirroring DATA_AND_DECISION_SPEC.md's UNAVAILABLE coverage state.
 */
export function buildLiveDecisionProfile(technical: TechnicalScore | null): DecisionProfile {
  if (technical) {
    const components: DecisionContribution[] = [
      {
        label: 'Trend & VWAP',
        score: round1(technical.trendVwap),
        maxScore: 25,
        detail: 'EMA9-vs-EMA21 and price-vs-VWAP separation, computed from live candles.',
        source: 'market',
      },
      {
        label: 'Momentum',
        score: round1(technical.momentum),
        maxScore: 20,
        detail: `RSI(14) is ${technical.rsi.toFixed(1)}.`,
        source: 'market',
      },
      {
        label: 'Volume & liquidity',
        score: round1(technical.volume),
        maxScore: 15,
        detail: `Volume is ${technical.volumeZScore.toFixed(2)} standard deviations above its recent baseline.`,
        source: 'market',
      },
      unavailableComponent('Market & sector', 15),
      unavailableComponent('News & events', 10, 'news'),
      unavailableComponent('Peer fundamentals', 10, 'fundamentals'),
      unavailableComponent('Risk quality', 5, 'risk'),
    ]

    const checks: DecisionCheck[] = [
      {
        label: 'Trend confirmed',
        passed: technical.emaFast > technical.emaSlow,
        detail: technical.emaFast > technical.emaSlow ? 'EMA9 is above EMA21.' : 'EMA9 has not crossed above EMA21.',
      },
      {
        label: 'VWAP reclaimed',
        passed: technical.lastClose >= technical.vwap,
        detail:
          technical.lastClose >= technical.vwap ? 'Price is at or above session VWAP.' : 'Price remains below session VWAP.',
      },
      {
        label: 'RSI not overbought',
        passed: technical.rsi < 80,
        detail: `RSI(14) is ${technical.rsi.toFixed(1)}.`,
      },
      {
        label: 'Volume confirmation',
        passed: technical.volumeZScore > 0,
        detail: `Volume z-score is ${technical.volumeZScore.toFixed(2)}.`,
      },
    ]

    return { components, checks, peerGroup: UNAVAILABLE_PEER_GROUP, peerMetrics: [] }
  }

  return {
    components: [
      unavailableComponent('Trend & VWAP', 25),
      unavailableComponent('Momentum', 20),
      unavailableComponent('Volume & liquidity', 15),
      unavailableComponent('Market & sector', 15),
      unavailableComponent('News & events', 10, 'news'),
      unavailableComponent('Peer fundamentals', 10, 'fundamentals'),
      unavailableComponent('Risk quality', 5, 'risk'),
    ],
    checks: [NO_LIVE_FEED_CHECK],
    peerGroup: UNAVAILABLE_PEER_GROUP,
    peerMetrics: [],
  }
}
