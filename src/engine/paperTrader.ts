// Mock ("paper") intraday trader. Pure logic only — no I/O — so it can be
// tested and replayed. scripts/run-screener-scan.ts feeds it candles every
// scan tick; scripts/send-daily-report.ts summarizes and archives the day.
//
// Honesty rules baked in:
//  - Signals use COMPLETED 5-minute bars only; fills happen at the NEXT
//    bar's open (no filling at a price you could not have seen).
//  - If a bar touches both stop and target, the stop is assumed first.
//  - Every trade carries the full round-trip cost breakdown (costs.ts).
//  - A trade is only opened if its target clears costs AND the configured
//    net-profit bar. If the market can't plausibly reach that target
//    (target farther than MAX_TARGET_ATR_MULT x ATR), no trade is taken.

import type { Candle, NewsArticle } from '../types'
import { PAPER_COST_RATES, roundTripCosts, type CostBreakdown, type CostRates } from './costs'
import { computeATR, computeTechnicalScore, TECHNICAL_BUY_THRESHOLD } from './technicals'

export interface PaperPolicy {
  /** Required net profit (after ALL costs) as a fraction of the position's buy value. */
  netTargetPct: number
  /** Max fraction of capital in one position. */
  maxPositionPct: number
  /** Max fraction of capital risked (entry-to-stop) on one trade. */
  riskPerTradePct: number
  /** Stop trading for the day once realized net loss reaches this fraction of capital. */
  dailyLossBudgetPct: number
  maxPositions: number
  /** Reward:risk the stop is placed for. */
  rewardRisk: number
  /** Skip the trade if the needed target is farther than this many 5-min ATRs. */
  maxTargetAtrMult: number
  /** IST HH:MM window for opening new positions. */
  entryFrom: string
  entryUntil: string
  /** IST HH:MM at which everything still open is squared off. */
  squareOffAt: string
  rates: CostRates
}

export const DEFAULT_PAPER_POLICY: PaperPolicy = {
  netTargetPct: 0.03,
  maxPositionPct: 0.4,
  riskPerTradePct: 0.0035,
  dailyLossBudgetPct: 0.01,
  maxPositions: 3,
  rewardRisk: 1.5,
  maxTargetAtrMult: 6,
  entryFrom: '09:30',
  entryUntil: '14:30',
  squareOffAt: '15:15',
  rates: PAPER_COST_RATES,
}

export interface PaperPosition {
  symbol: string
  name: string
  qty: number
  entryPrice: number
  /** HH:MM of the bar the fill happened in; exits are only checked on later bars. */
  entryBarTime: string
  entryTime: string
  stop: number
  target: number
  score: number
}

export type ExitReason = 'TARGET' | 'STOP' | 'SQUARE_OFF' | 'NO_DATA'

export interface PaperTrade {
  symbol: string
  name: string
  qty: number
  entryTime: string
  exitTime: string
  entryPrice: number
  exitPrice: number
  stop: number
  target: number
  exitReason: ExitReason
  buyValue: number
  grossPnl: number
  costs: CostBreakdown
  netPnl: number
}

export interface PaperBook {
  capital: number
  open: PaperPosition[]
  closed: PaperTrade[]
  /** Symbols already traded today — no re-entry after an exit. */
  traded: string[]
}

export interface PaperDayState {
  /** IST date, YYYY-MM-DD. */
  date: string
  books: Record<string, PaperBook>
  ticks: number
  firstTickAt: string | null
  lastTickAt: string | null
  /** Why the engine stood aside, most recent first — surfaced in the report. */
  notes: string[]
  macro: MacroAssessment | null
  /** Upstox key ratios per symbol, fetched once per day. */
  ratios?: Record<string, KeyRatio[]>
  /** Net-profit bar this day was traded against, so the UI/report show the right target. */
  netTargetPct?: number
}

export function newBook(capital: number): PaperBook {
  return { capital, open: [], closed: [], traded: [] }
}

export function newDayState(date: string, capitals: number[]): PaperDayState {
  return {
    date,
    books: Object.fromEntries(capitals.map((c) => [String(c), newBook(c)])),
    ticks: 0,
    firstTickAt: null,
    lastTickAt: null,
    notes: [],
    macro: null,
  }
}

// ---------------------------------------------------------------- time

export function istDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date)
}

export function istHHMM(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${String(Number(get('hour')) % 24).padStart(2, '0')}:${get('minute')}`
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** A 5-minute candle labelled HH:MM is still forming until HH:MM + 5 minutes. */
export function splitCompleted(candles: Candle[], nowHHMM: string): { completed: Candle[]; forming: Candle | null } {
  const now = toMinutes(nowHHMM)
  const completed: Candle[] = []
  let forming: Candle | null = null
  for (const candle of candles) {
    if (toMinutes(candle.time) + 5 <= now) completed.push(candle)
    else if (toMinutes(candle.time) <= now) forming = candle
  }
  return { completed, forming }
}

// ----------------------------------------------------------- key ratios

export interface KeyRatio {
  name: string
  companyValue: string
  sectorValue: string
}

function num(text: string | undefined): number | null {
  if (!text) return null
  const n = parseFloat(text.replace(/[%,]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Coarse fundamentals veto from Upstox key ratios: loss-making (negative
 * ROE or P/E) or priced at more than 3x its sector's P/E. Intraday moves
 * are driven mostly by flow, so this only screens out the clearly poor
 * names; it never ranks or boosts one. No ratios -> no veto.
 */
export function ratioVeto(ratios: KeyRatio[] | undefined): string | null {
  if (!ratios) return null
  const find = (name: string) => ratios.find((r) => r.name.toLowerCase() === name.toLowerCase())
  const roe = num(find('ROE')?.companyValue)
  if (roe !== null && roe < 0) return `negative ROE (${roe}%)`
  const pe = find('P/E')
  const co = num(pe?.companyValue)
  const sector = num(pe?.sectorValue)
  if (co !== null && co < 0) return `negative P/E (${co})`
  if (co !== null && sector !== null && sector > 0 && co > 3 * sector) return `P/E ${co} is over 3x sector (${sector})`
  return null
}

// ------------------------------------------------------- net-profit math

export function netPnl(entry: number, exit: number, qty: number, rates: CostRates): { gross: number; costs: CostBreakdown; net: number } {
  const gross = (exit - entry) * qty
  const costs = roundTripCosts(entry, exit, qty, rates)
  return { gross, costs, net: gross - costs.total }
}

/**
 * Smallest exit price at which net profit (after every cost) is at least
 * `netPct` of the buy value. Bisection, since costs themselves depend on
 * the exit price. Returns null if even a +50% move would not do it.
 */
export function targetForNetPct(entry: number, qty: number, netPct: number, rates: CostRates): number | null {
  const need = entry * qty * netPct
  const net = (exit: number) => netPnl(entry, exit, qty, rates).net
  let lo = entry
  let hi = entry * 1.5
  if (net(hi) < need) return null
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (net(mid) >= need) hi = mid
    else lo = mid
  }
  return hi
}

// ------------------------------------------------------------ candidates

export interface Candidate {
  symbol: string
  name: string
  /** Price we'd fill at: the forming bar's open, else the last completed close. */
  fillPrice: number
  fillBarTime: string
  atr: number
  score: number
}

const NEGATIVE_NEWS = /\b(fraud|probe|raid|raided|downgrade[sd]?|penalt(y|ies)|resign(s|ed|ation)?|ban(ned)?|default(s|ed)?|plunge[sd]?|slump(s|ed)?|crash(es|ed)?|investigation|sebi (order|notice)|show[- ]cause|loss widens|profit (falls|drops|slumps)|cbi|enforcement directorate)\b/i

/** Veto: any negative-keyword headline from the last 24h. Returns the headline, or null. */
export function newsVeto(articles: NewsArticle[] | undefined, nowMs: number): string | null {
  for (const article of articles ?? []) {
    if (nowMs - article.publishedAtMs > 24 * 3600 * 1000) continue
    if (NEGATIVE_NEWS.test(article.heading)) return article.heading
  }
  return null
}

export function buildCandidate(
  symbol: string,
  name: string,
  candles: Candle[],
  nowHHMM: string,
  news: NewsArticle[] | undefined,
  nowMs: number,
  ratios?: KeyRatio[],
): { candidate: Candidate | null; reason?: string } {
  const { completed, forming } = splitCompleted(candles, nowHHMM)
  const score = computeTechnicalScore(completed)
  if (!score) return { candidate: null, reason: 'not enough completed bars' }
  const atr = computeATR(completed, 14)
  if (atr === null || atr <= 0) return { candidate: null, reason: 'no ATR' }
  if (score.total < TECHNICAL_BUY_THRESHOLD) return { candidate: null, reason: 'score below BUY threshold' }
  if (score.lastClose <= score.vwap) return { candidate: null, reason: 'below VWAP' }
  if (score.emaFast <= score.emaSlow) return { candidate: null, reason: 'EMA9 not above EMA21' }
  if (score.rsi < 50 || score.rsi > 72) return { candidate: null, reason: `RSI ${score.rsi.toFixed(0)} outside 50-72` }
  const veto = newsVeto(news, nowMs)
  if (veto) return { candidate: null, reason: `negative news: ${veto}` }

  const fundamentals = ratioVeto(ratios)
  if (fundamentals) return { candidate: null, reason: `weak fundamentals: ${fundamentals}` }

  const last = completed[completed.length - 1]
  return {
    candidate: {
      symbol,
      name,
      fillPrice: forming ? forming.open : last.close,
      fillBarTime: forming ? forming.time : last.time,
      atr,
      score: score.total,
    },
  }
}

// --------------------------------------------------------------- entries

export interface EntryPlan {
  qty: number
  stop: number
  target: number
}

/**
 * Size and place an entry so that hitting the target nets at least
 * `policy.netTargetPct` after every cost. Returns a reason string instead
 * when the trade isn't worth taking.
 */
export function planEntry(
  candidate: Candidate,
  capital: number,
  cash: number,
  policy: PaperPolicy,
): { plan: EntryPlan } | { reason: string } {
  const entry = candidate.fillPrice
  let qty = Math.floor(Math.min(capital * policy.maxPositionPct, cash) / entry)
  if (qty < 1) return { reason: 'capital too small for one share' }

  for (let pass = 0; pass < 4; pass++) {
    const target = targetForNetPct(entry, qty, policy.netTargetPct, policy.rates)
    if (target === null) return { reason: 'target unreachable at any realistic price' }
    const targetDist = target - entry
    if (targetDist > policy.maxTargetAtrMult * candidate.atr) {
      return {
        reason: `needs +${((targetDist / entry) * 100).toFixed(2)}% (${(targetDist / candidate.atr).toFixed(1)} ATR) to net ${(policy.netTargetPct * 100).toFixed(2)}% — not plausible intraday`,
      }
    }
    const stopDist = Math.max(targetDist / policy.rewardRisk, candidate.atr)
    const riskQty = Math.floor((capital * policy.riskPerTradePct) / stopDist)
    if (riskQty >= qty) return { plan: { qty, stop: round2(entry - stopDist), target: round2(target + 0.005) } }
    if (riskQty < 1) return { reason: 'stop too wide for the per-trade risk limit' }
    qty = riskQty // fewer shares -> brokerage matters more -> recompute target
  }
  return { reason: 'could not size a trade that satisfies both risk and net-profit limits' }
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ------------------------------------------------------------------ tick

export interface TickInput {
  nowHHMM: string
  nowMs: number
  /** Full-day 5-minute candles per symbol (may include the forming bar). */
  candlesBySymbol: Record<string, Candle[]>
  candidates: Candidate[]
  /** True when the whole market looks risk-off; blocks new entries. */
  standAside: string | null
}

function closeTrade(pos: PaperPosition, exitPrice: number, exitTime: string, reason: ExitReason, rates: CostRates): PaperTrade {
  const { gross, costs, net } = netPnl(pos.entryPrice, exitPrice, pos.qty, rates)
  return {
    symbol: pos.symbol,
    name: pos.name,
    qty: pos.qty,
    entryTime: pos.entryTime,
    exitTime,
    entryPrice: pos.entryPrice,
    exitPrice,
    stop: pos.stop,
    target: pos.target,
    exitReason: reason,
    buyValue: pos.entryPrice * pos.qty,
    grossPnl: gross,
    costs,
    netPnl: net,
  }
}

export function manageExits(book: PaperBook, input: TickInput, policy: PaperPolicy): void {
  const stillOpen: PaperPosition[] = []
  for (const pos of book.open) {
    const candles = input.candlesBySymbol[pos.symbol] ?? []
    const later = candles.filter((c) => c.time > pos.entryBarTime)
    let trade: PaperTrade | null = null
    for (const bar of later) {
      if (bar.low <= pos.stop) {
        // A gap below the stop fills at the open, not at the stop.
        trade = closeTrade(pos, Math.min(pos.stop, bar.open), bar.time, 'STOP', policy.rates)
        break
      }
      if (bar.high >= pos.target) {
        trade = closeTrade(pos, pos.target, bar.time, 'TARGET', policy.rates)
        break
      }
    }
    if (!trade && input.nowHHMM >= policy.squareOffAt) {
      const lastBar = candles[candles.length - 1]
      trade = lastBar
        ? closeTrade(pos, lastBar.close, lastBar.time, 'SQUARE_OFF', policy.rates)
        : closeTrade(pos, pos.entryPrice, input.nowHHMM, 'NO_DATA', policy.rates)
    }
    if (trade) book.closed.push(trade)
    else stillOpen.push(pos)
  }
  book.open = stillOpen
}

export function tickBook(book: PaperBook, input: TickInput, policy: PaperPolicy, notes: string[]): void {
  manageExits(book, input, policy)

  if (input.nowHHMM < policy.entryFrom || input.nowHHMM > policy.entryUntil) return
  if (input.standAside) return

  const realized = book.closed.reduce((sum, t) => sum + t.netPnl, 0)
  if (realized <= -book.capital * policy.dailyLossBudgetPct) {
    notes.push(`₹${book.capital}: daily loss budget reached — no new trades.`)
    return
  }

  const deployed = () => book.open.reduce((s, p) => s + p.entryPrice * p.qty, 0)
  const sorted = [...input.candidates].sort((a, b) => b.score - a.score)
  for (const candidate of sorted) {
    if (book.open.length >= policy.maxPositions) break
    if (book.traded.includes(candidate.symbol)) continue

    const cash = book.capital - deployed()
    const planned = planEntry(candidate, book.capital, cash, policy)
    if ('reason' in planned) {
      notes.push(`₹${book.capital} ${candidate.symbol}: skipped — ${planned.reason}`)
      continue
    }
    const { qty, stop, target } = planned.plan
    book.open.push({
      symbol: candidate.symbol,
      name: candidate.name,
      qty,
      entryPrice: candidate.fillPrice,
      entryBarTime: candidate.fillBarTime,
      entryTime: input.nowHHMM,
      stop,
      target,
      score: candidate.score,
    })
    book.traded.push(candidate.symbol)
  }
}

// ----------------------------------------------------------------- macro

export interface MacroAssessment {
  level: 'NORMAL' | 'ELEVATED'
  riskOffHeadlines: string[]
  scanned: number
}

const RISK_OFF =
  /\b(war|missile|airstrike|invasion|escalat\w*|sanctions?|ceasefire collapse|oil (surges?|spikes?|jumps?)|crude (surges?|spikes?|jumps?)|sell-?off|market crash|circuit breaker|rate hike|default|banking crisis|tariff(s)?|recession|black swan|flash crash)\b/i

/**
 * Geopolitical / macro risk gate from raw headlines (see
 * scripts/lib/macroNews.ts). Deliberately simple keyword counting, not a
 * forecast: ELEVATED needs several independent risk-off headlines, and
 * only blocks NEW entries — it never forces an exit.
 */
export function assessMacro(headlines: string[], threshold = 4): MacroAssessment {
  const hits = headlines.filter((h) => RISK_OFF.test(h))
  return {
    level: hits.length >= threshold ? 'ELEVATED' : 'NORMAL',
    riskOffHeadlines: hits.slice(0, 8),
    scanned: headlines.length,
  }
}

/** Median day-change % across the Nifty 50, or null with too little data. */
export function medianChange(changePercents: number[]): number | null {
  const values = changePercents.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (values.length < 10) return null
  return values[Math.floor(values.length / 2)]
}

/** Breadth gate: stand aside when the Nifty 50 median day-change is at or below -1%. */
export function breadthStandAside(changePercents: number[]): string | null {
  const median = medianChange(changePercents)
  return median !== null && median <= -1 ? `Market-wide weakness (median Nifty 50 change ${median.toFixed(2)}%)` : null
}

/**
 * Combined stand-aside decision. Risk-off headlines alone do NOT block
 * trading: a war or oil spike can dominate the news for months while
 * markets trade normally, and a headline-only gate would then block every
 * day. Headlines only tighten the breadth bar (-1% -> -0.3%), so a
 * scary-news day still needs the market itself to be weak.
 */
export function standAsideReason(macro: MacroAssessment | null, changePercents: number[]): string | null {
  const hard = breadthStandAside(changePercents)
  if (hard) return hard
  const median = medianChange(changePercents)
  if (macro?.level === 'ELEVATED' && median !== null && median <= -0.3) {
    return `Risk-off headlines and a weak market (median Nifty 50 change ${median.toFixed(2)}%)`
  }
  return null
}

// --------------------------------------------------------------- summary

export interface BookSummary {
  capital: number
  trades: number
  wins: number
  grossPnl: number
  costs: CostBreakdown
  netPnl: number
  buyTurnover: number
  /** Net P&L as % of the day's total buy value ("overall day's transactions"). */
  netPctOfTurnover: number | null
  netPctOfCapital: number
  meetsTarget: boolean | null
}

export function summarizeBook(book: PaperBook, netTargetPct: number): BookSummary {
  const zero: CostBreakdown = { brokerage: 0, stt: 0, exchangeTxn: 0, sebiFees: 0, gst: 0, stampDuty: 0, slippage: 0, total: 0 }
  const costs = { ...zero }
  let grossPnl = 0
  let net = 0
  let turnover = 0
  let wins = 0
  for (const t of book.closed) {
    grossPnl += t.grossPnl
    net += t.netPnl
    turnover += t.buyValue
    if (t.netPnl > 0) wins++
    for (const k of Object.keys(costs) as (keyof CostBreakdown)[]) costs[k] += t.costs[k]
  }
  const pct = turnover > 0 ? (net / turnover) * 100 : null
  return {
    capital: book.capital,
    trades: book.closed.length,
    wins,
    grossPnl,
    costs,
    netPnl: net,
    buyTurnover: turnover,
    netPctOfTurnover: pct,
    netPctOfCapital: (net / book.capital) * 100,
    meetsTarget: pct === null ? null : pct >= netTargetPct * 100,
  }
}
