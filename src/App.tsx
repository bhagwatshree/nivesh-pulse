import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  CandlestickChart as CandlestickIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  Gauge,
  History,
  Info,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Newspaper,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ScanSearch,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  WalletCards,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import Brand from './components/Brand'
import CandlestickChart from './components/CandlestickChart'
import { dataSourcePlan, marketIndices, newsItems } from './data/market'
import { nifty50Keys } from './data/nifty50Keys'
import { isGrowwConfigured } from './config/groww'
import { isUpstoxConfigured } from './config/upstox'
import { mergeLiveQuotes } from './data/upstox/mergeSignals'
import { useGrowwCandlesForSymbols } from './hooks/useGrowwCandlesForSymbols'
import { useGrowwQuotes } from './hooks/useGrowwQuotes'
import { useGrowwSession } from './hooks/useGrowwSession'
import { useLiveCandlesForSymbols } from './hooks/useLiveCandlesForSymbols'
import { useLiveIndices } from './hooks/useLiveIndices'
import { useLiveQuotes } from './hooks/useLiveQuotes'
import { useScreener, type ScreenerPick } from './hooks/useScreener'
import { useUpstoxSession } from './hooks/useUpstoxSession'
import { inr } from './lib/allocation'
import { computeSignalPnl, RESOLUTION_WINDOW_MS, type SignalNotification } from './lib/signalOutcome'
import { canPlaceOrder } from './engine/orders'
import { costGate } from './engine/costs'
import { decide, type Decision } from './engine/decide'
import { evaluateGates, type GateResult } from './engine/gates'
import { buildLiveDecisionProfile, buildLiveSignal, LIVE_POLICY } from './engine/liveSignal'
import { computeTechnicalScore, TECHNICAL_BUY_THRESHOLD, TECHNICAL_SCORE_MAX, TECHNICAL_WATCH_THRESHOLD } from './engine/technicals'
import { allocate } from './engine/size'
import type { DecisionProfile, PaperOrder, Position, SignalAction, StockSignal } from './types'

type NavId = 'overview' | 'signals' | 'screener' | 'plan' | 'insights' | 'history'

const navItems: { id: NavId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Today', icon: LayoutDashboard },
  { id: 'signals', label: 'Signals', icon: CandlestickIcon },
  { id: 'screener', label: 'Screener', icon: ScanSearch },
  { id: 'plan', label: 'Allocation', icon: WalletCards },
  { id: 'insights', label: 'Research', icon: Newspaper },
  { id: 'history', label: 'Journal', icon: History },
]

const formatTimer = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

// Only used when the scheduled scan hasn't published anything yet
// (screener.result is null/empty) and there's no held position either, so
// there is genuinely no live signal to select — keeps `selected.symbol`
// etc. safe without pretending there's real data behind it.
const EMPTY_SIGNAL_PLACEHOLDER: StockSignal = {
  symbol: '—',
  company: 'Waiting for the next scan',
  sector: '—',
  exchange: 'NSE',
  price: 0,
  changePercent: 0,
  action: 'WATCH',
  score: 0,
  entryLow: 0,
  entryHigh: 0,
  target: 0,
  stopLoss: 0,
  weight: 0,
  horizon: '—',
  riskReward: '—',
  updatedAt: '—',
  thesis: 'The scheduled 50-stock scan has not published a result yet. It runs every 5 minutes during market hours.',
  caution: '—',
  catalyst: 'Technical scan only — no live news or fundamentals feed.',
  factors: [],
  candles: [],
}

const actionCopy: Record<SignalAction, { verb: string; description: string }> = {
  BUY: { verb: 'Buy setup', description: 'Entry conditions are currently met' },
  WATCH: { verb: 'Wait', description: 'Confirmation is still missing' },
  EXIT: { verb: 'Exit setup', description: 'Protect capital if already holding' },
}

const actionLabel: Record<SignalAction, 'BUY' | 'WAIT' | 'EXIT'> = {
  BUY: 'BUY',
  WATCH: 'WAIT',
  EXIT: 'EXIT',
}

/** engine/decide.ts's 'WAIT' maps to this UI's 'WATCH' — same state, older name here predates the engine. */
function decisionToUiAction(decision: Decision): SignalAction {
  if (decision.action === 'BUY') return 'BUY'
  if (decision.action === 'EXIT') return 'EXIT'
  return 'WATCH'
}

interface OrderTicket {
  signal: StockSignal
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  maxLoss: number
  estimatedPnl: number | null
}

/**
 * A snapshot taken at the moment "Review" is clicked, not a live read of
 * ambient `selected` state — the order modal renders only from this ticket.
 * Previously the modal read `selected`/`orderQuantity`/`entryPrice`
 * directly, which meant the confirm button would size and price against
 * whatever symbol happened to be selected at confirm time rather than the
 * one the modal was opened for. Every call site that opens the modal now
 * builds one of these first.
 */
function buildOrderTicket(
  signal: StockSignal,
  allocation: { quantity: number } | undefined,
  activePosition: Position | undefined,
): OrderTicket | null {
  const isExit = signal.action === 'EXIT'
  const quantity = isExit ? activePosition?.quantity ?? 0 : allocation?.quantity ?? 0
  if (quantity <= 0) return null
  const price = isExit ? signal.price : (signal.entryLow + signal.entryHigh) / 2
  const maxLoss = isExit ? 0 : Math.max(0, price - signal.stopLoss) * quantity
  const estimatedPnl = isExit && activePosition ? (price - activePosition.averagePrice) * quantity : null
  return { signal, side: isExit ? 'SELL' : 'BUY', quantity, price, maxLoss, estimatedPnl }
}

/** One human-readable line for why a WAIT decision is a WAIT, for the copy that used to just say "Wait for close." */
function waitReasonCopy(decision: Decision): string {
  if (decision.action !== 'WAIT') return ''
  switch (decision.reason.kind) {
    case 'NO_SIGNAL':
      return decision.reason.detail
    case 'GATE_FAILED':
      return `${decision.reason.gate}: ${decision.reason.detail}`
    case 'BELOW_THRESHOLD':
      return `Score ${decision.reason.score} is below the ${decision.reason.threshold}-point BUY threshold.`
    case 'POSITION_HELD':
      return decision.reason.detail
  }
}

function SignalBadge({ action }: { action: SignalAction }) {
  return (
    <span className={`signal-badge signal-${action.toLowerCase()}`}>
      {action === 'BUY' && <ArrowUpRight size={13} strokeWidth={2.5} />}
      {action === 'EXIT' && <ArrowDownRight size={13} strokeWidth={2.5} />}
      {action === 'WATCH' && <span className="minus-mark">—</span>}
      {actionLabel[action]}
    </span>
  )
}

// Real score is out of TECHNICAL_SCORE_MAX (60, technical-only — see
// src/engine/liveSignal.ts for why), not the spec's 100-point scale.
function ScoreRing({ score }: { score: number }) {
  const tone = score >= TECHNICAL_BUY_THRESHOLD ? '#147d64' : score >= TECHNICAL_WATCH_THRESHOLD ? '#bf7b21' : '#c64f55'
  return (
    <div
      className="score-ring"
      style={{ '--score': `${(score / TECHNICAL_SCORE_MAX) * 360}deg`, '--score-color': tone } as CSSProperties}
      aria-label={`Model score ${score} out of ${TECHNICAL_SCORE_MAX}`}
    >
      <span>{score}</span>
      <small>/{TECHNICAL_SCORE_MAX}</small>
    </div>
  )
}

function App() {
  const [capital, setCapital] = useState(10_000)
  const [capitalInput, setCapitalInput] = useState('10000')
  // Empty until the scheduled scan's first result arrives — see the
  // auto-select effect below, which picks the top real result once one
  // exists rather than defaulting to a hardcoded symbol.
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNav, setActiveNav] = useState<NavId>('overview')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [alertsPaused, setAlertsPaused] = useState(false)
  const [scanSeconds, setScanSeconds] = useState(165)
  const [now, setNow] = useState(new Date())
  const [orderTicket, setOrderTicket] = useState<OrderTicket | null>(null)
  const [reviewChecked, setReviewChecked] = useState(false)
  const [orders, setOrders] = useState<PaperOrder[]>([])
  // Starts empty rather than a seeded demo holding — a live signal engine
  // shouldn't claim you're already holding a position you never bought.
  const [positions, setPositions] = useState<Position[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [methodOpen, setMethodOpen] = useState(false)
  const [growwTokenInput, setGrowwTokenInput] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
      setScanSeconds((current) => (current <= 1 ? 300 : current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const upstoxSession = useUpstoxSession()
  const growwSession = useGrowwSession()
  const screener = useScreener()

  // Auto-select the scheduled scan's top real pick once one arrives,
  // rather than defaulting to a hardcoded symbol. Only runs while nothing
  // is selected yet — never overrides a symbol the user actually clicked.
  useEffect(() => {
    if (selectedSymbol) return
    const top = screener.result?.picks[0]
    if (top) setSelectedSymbol(top.symbol)
  }, [selectedSymbol, screener.result])

  // Automatic per-symbol failover: both providers fetch independently and
  // continuously whenever their own session is connected (each hook is a
  // no-op with no token). Upstox is preferred — it's the documented, durable
  // integration — but for any symbol Upstox's fetch didn't return (an
  // error, a gap, or simply not connected), Groww's value is used instead
  // if available. Spreading Groww first then Upstox means Upstox always
  // wins per key when both have one, and this degrades correctly in every
  // connection combination (only Upstox, only Groww, both, or neither)
  // without a separate branch for each.
  const upstoxConnected = upstoxSession.status === 'connected'
  const growwConnected = growwSession.status === 'connected'
  const anyLiveConnected = upstoxConnected || growwConnected
  const providerLabel =
    upstoxConnected && growwConnected ? 'Upstox + Groww' : upstoxConnected ? 'Upstox' : growwConnected ? 'Groww' : null

  const liveIndices = useLiveIndices(upstoxSession.accessToken, growwSession.accessToken)
  const hasLiveIndices = Object.keys(liveIndices.byLabel).length > 0
  const effectiveIndices = useMemo(
    () =>
      marketIndices.map((index) => {
        const live = liveIndices.byLabel[index.name]
        if (!live || live.value <= 0) return index
        return {
          name: index.name,
          value: live.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          change:
            live.changePercent !== null
              ? `${live.changePercent >= 0 ? '+' : '−'}${Math.abs(live.changePercent).toFixed(2)}%`
              : index.change,
        }
      }),
    [liveIndices.byLabel],
  )

  // Declared here (ahead of the tracked-symbols computation below, which
  // needs to know about pending notifications) rather than next to the
  // effect that fires them further down.
  const [signalNotifications, setSignalNotifications] = useState<SignalNotification[]>([])

  // Which symbols get a live signal built: whatever the scheduled 50-stock
  // scan (scripts/run-screener-scan.ts, published to /screener/latest)
  // currently leans BUY or WATCH on. screenerPickBySymbol is a plain
  // lookup table (every published pick, any lean) used below to fill in
  // real numbers where they're available; it does not itself decide who's
  // tracked — trackedSymbols does.
  const screenerPickBySymbol = useMemo(() => {
    const bySymbol = new Map<string, ScreenerPick>()
    for (const pick of screener.result?.picks ?? []) bySymbol.set(pick.symbol, pick)
    return bySymbol
  }, [screener.result])

  // Which symbols get tracked at all: whatever currently leans BUY/WATCH,
  // plus any symbol already held (so a position can never silently drop
  // out of view before its EXIT condition is checked, even after it falls
  // out of the top 10 or to AVOID), plus any symbol with a signal
  // notification still awaiting its 5-minute shadow-P&L resolution (see
  // src/lib/signalOutcome.ts) — otherwise a fired BUY/EXIT that rotates
  // out of the top 10 mid-window resolves against a stale price and
  // silently records a wrong (usually zero) P&L instead of the real one.
  const trackedSymbols = useMemo(() => {
    const set = new Set<string>()
    for (const pick of screener.result?.picks ?? []) {
      if (pick.lean !== 'AVOID') set.add(pick.symbol)
    }
    for (const position of positions) set.add(position.symbol)
    for (const notification of signalNotifications) {
      if (notification.status === 'pending') set.add(notification.symbol)
    }
    return set
  }, [screener.result, positions, signalNotifications])

  // Symbols to fetch live candles for — the whole tracked set, not just
  // whichever one is selected, so more than one name can genuinely clear
  // the real BUY gates and the 3-position allocation plan can actually
  // fill. One request per symbol (neither broker has a batch candle
  // endpoint), run in parallel, on the same 60s cadence as the screener.
  const shortlistSymbols = useMemo(() => Array.from(trackedSymbols), [trackedSymbols])
  const liveCandlesMulti = useLiveCandlesForSymbols(upstoxSession.accessToken, shortlistSymbols)
  const growwCandlesMulti = useGrowwCandlesForSymbols(growwSession.accessToken, shortlistSymbols)
  const candlesBySymbol = useMemo(
    () => ({ ...growwCandlesMulti.bySymbol, ...liveCandlesMulti.bySymbol }),
    [growwCandlesMulti.bySymbol, liveCandlesMulti.bySymbol],
  )
  const activeLiveCandles = candlesBySymbol[selectedSymbol] ?? null

  // Quotes carry the previous close, which is what a real day-over-day
  // change % needs — candles alone only give an intraday reference.
  // Automatic per-symbol failover: both providers fetch independently and
  // continuously whenever their own session is connected (each hook is a
  // no-op with no token). Upstox is preferred — it's the documented,
  // durable integration — but for any symbol Upstox's fetch didn't return
  // (an error, a gap, or simply not connected), Groww's value is used
  // instead if available. Spreading Groww first then Upstox means Upstox
  // always wins per key when both have one.
  const liveQuotes = useLiveQuotes(upstoxSession.accessToken, shortlistSymbols)
  const growwQuotes = useGrowwQuotes(growwSession.accessToken, shortlistSymbols)
  const liveQuotesBySymbol = useMemo(
    () => ({ ...growwQuotes.bySymbol, ...liveQuotes.bySymbol }),
    [growwQuotes.bySymbol, liveQuotes.bySymbol],
  )
  const liveLastUpdated = [liveQuotes.lastUpdated, growwQuotes.lastUpdated]
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  // Real signals + decision profiles (src/engine/liveSignal.ts): full
  // technicals from a symbol's own live candles when a broker session is
  // connected; the scan's last published (coarser but still real) numbers
  // when it isn't but the symbol is still in the top 10; and, failing
  // both (a held/pending symbol that dropped off the published top 10
  // with no session connected), the last real price we actually observed
  // for it — a held position's average buy price, or a pending
  // notification's price-at-fire — never a fabricated one. Nothing here
  // is fixture data.
  const { signalsBySymbol, profilesBySymbol } = useMemo(() => {
    const signals = new Map<string, StockSignal>()
    const profiles = new Map<string, DecisionProfile>()
    for (const symbol of trackedSymbols) {
      const candles = candlesBySymbol[symbol] ?? null
      const pick = screenerPickBySymbol.get(symbol)
      const heldPosition = positions.find((position) => position.symbol === symbol)
      const pendingNotification = signalNotifications.find(
        (notification) => notification.symbol === symbol && notification.status === 'pending',
      )
      const lastKnownPrice = heldPosition?.averagePrice ?? pendingNotification?.priceAtFire
      const name = pick?.name ?? nifty50Keys[symbol]?.name ?? symbol
      const signal = buildLiveSignal({ symbol, name, candles, fallback: pick, lastKnownPrice })
      if (signal) signals.set(symbol, signal)
      const corporateActions = screener.result?.corporateActionsBySymbol?.[symbol] ?? []
      const news = screener.result?.newsBySymbol?.[symbol] ?? []
      profiles.set(
        symbol,
        buildLiveDecisionProfile(candles ? computeTechnicalScore(candles) : null, corporateActions, news),
      )
    }
    return { signalsBySymbol: signals, profilesBySymbol: profiles }
  }, [trackedSymbols, screenerPickBySymbol, candlesBySymbol, positions, signalNotifications, screener.result])

  const priceAdjustedSignals = useMemo(
    () => mergeLiveQuotes(Array.from(signalsBySymbol.values()), liveQuotesBySymbol),
    [signalsBySymbol, liveQuotesBySymbol],
  )
  const fallbackDecisionProfile = useMemo(() => buildLiveDecisionProfile(null), [])

  // The tested decision engine (src/engine/), run per symbol against
  // LIVE_POLICY's technical-only BUY bar (see src/engine/liveSignal.ts for
  // why DEFAULT_POLICY's full 70/100 threshold doesn't apply here) — the
  // BUY/WAIT/EXIT call itself, and every gate behind it including the
  // cost-adjusted-edge check, is genuinely computed, not hardcoded.
  const decisions = useMemo(() => {
    const map = new Map<string, Decision>()
    for (const signal of priceAdjustedSignals) {
      const profile = profilesBySymbol.get(signal.symbol) ?? fallbackDecisionProfile
      const heldPosition = positions.find((position) => position.symbol === signal.symbol)
      const heldQuantity = heldPosition?.quantity ?? 0
      const entry = (signal.entryLow + signal.entryHigh) / 2
      // Approximates the quantity this signal alone would get at current
      // capital, so the cost gate can run before the real multi-signal
      // allocation (which only sizes signals already flagged BUY). Slightly
      // optimistic versus the real joint allocation, since a signal sharing
      // capital with two others may size smaller than this single-signal
      // probe suggests — a documented approximation, not a silent one.
      const candidateQuantity = allocate([signal], capital, LIVE_POLICY).allocations[0]?.quantity ?? 0
      const gates: GateResult[] = [...evaluateGates(profile.checks), costGate(entry, signal.target, candidateQuantity)]
      // A held position's stop is pinned at buy time (see confirmPaperOrder)
      // rather than re-derived from the live signal every render — a live,
      // price-relative stop sits below current price by construction and
      // would never trigger if recomputed fresh each time.
      const exitTriggered = heldPosition ? signal.price <= heldPosition.stopLoss : false
      map.set(signal.symbol, decide({ score: signal.score, gates, heldQuantity, exitTriggered }, LIVE_POLICY))
    }
    return map
  }, [priceAdjustedSignals, positions, capital, profilesBySymbol, fallbackDecisionProfile])

  // Shadows the old fixture import: every existing `signals.find/.filter/[0]`
  // usage below picks this up automatically.
  const signals = useMemo(
    () =>
      priceAdjustedSignals.map((signal) => {
        const decision = decisions.get(signal.symbol)
        return decision ? { ...signal, action: decisionToUiAction(decision) } : signal
      }),
    [priceAdjustedSignals, decisions],
  )

  // previousActionsRef tracks each symbol's last-seen action across
  // renders purely to detect transitions for the notification effect below
  // — it holds no state the UI reads directly. The very first pass never
  // fires anything (nothing to compare against yet), only genuine changes
  // after that.
  const previousActionsRef = useRef<Map<string, SignalAction>>(new Map())

  useEffect(() => {
    const previous = previousActionsRef.current
    const fired: SignalNotification[] = []

    for (const signal of priceAdjustedSignals) {
      const decision = decisions.get(signal.symbol)
      if (!decision) continue
      const uiAction = decisionToUiAction(decision)
      const prevAction = previous.get(signal.symbol)

      if (prevAction !== undefined && prevAction !== uiAction) {
        let quantity = 0
        if (uiAction === 'BUY') {
          quantity = allocate([signal], capital, LIVE_POLICY).allocations[0]?.quantity ?? 0
        } else if (uiAction === 'EXIT') {
          quantity = positions.find((position) => position.symbol === signal.symbol)?.quantity ?? 0
        }
        const firedAt = Date.now()
        const resolvable = (uiAction === 'BUY' || uiAction === 'EXIT') && quantity > 0
        fired.push({
          id: `SN-${firedAt}-${signal.symbol}`,
          symbol: signal.symbol,
          company: signal.company,
          action: uiAction,
          detail:
            uiAction === 'BUY'
              ? `Score ${signal.score} cleared every entry gate.`
              : uiAction === 'EXIT'
                ? 'Exit condition triggered — protective level breached.'
                : waitReasonCopy(decision) || 'Setup no longer confirmed.',
          firedAt,
          priceAtFire: signal.price,
          quantity,
          resolveAt: firedAt + RESOLUTION_WINDOW_MS,
          status: resolvable ? 'pending' : 'not-applicable',
        })
      }
      previous.set(signal.symbol, uiAction)
    }

    if (fired.length > 0) {
      setSignalNotifications((current) => [...fired, ...current])
    }
  }, [decisions, priceAdjustedSignals, capital, positions])

  // Resolves pending notifications 5 minutes after they fired: records the
  // live price at that moment and the resulting shadow P&L (see
  // src/lib/signalOutcome.ts — "what this would have earned if acted on
  // promptly," independent of whether the user actually placed the paper
  // order). Re-running this on every priceAdjustedSignals update (roughly
  // every live-quote poll) is what supplies a fresh price to resolve
  // against, rather than a separate always-on timer.
  useEffect(() => {
    const dueNotifications = signalNotifications.some(
      (notification) => notification.status === 'pending' && Date.now() >= notification.resolveAt,
    )
    if (!dueNotifications) return

    setSignalNotifications((current) =>
      current.map((notification) => {
        if (notification.status !== 'pending' || Date.now() < notification.resolveAt) return notification
        const live = priceAdjustedSignals.find((signal) => signal.symbol === notification.symbol)
        const priceAtResolve = live?.price ?? notification.priceAtFire
        const pnl =
          notification.action === 'WATCH'
            ? 0
            : computeSignalPnl(notification.action, notification.priceAtFire, priceAtResolve, notification.quantity)
        return { ...notification, status: 'resolved' as const, priceAtResolve, pnl }
      }),
    )
    // `now` (already ticking every second for the scan countdown) is a
    // deliberate dependency here too: without it, a pending notification
    // would never resolve while running on synthetic/disconnected data,
    // since priceAdjustedSignals only changes when a live quote poll lands.
  }, [priceAdjustedSignals, signalNotifications, now])

  const resolvedSignalNotifications = signalNotifications.filter((notification) => notification.status === 'resolved')
  const dailySignalPnl = resolvedSignalNotifications.reduce((sum, notification) => sum + (notification.pnl ?? 0), 0)

  const allocationPlan = useMemo(() => allocate(signals, capital, LIVE_POLICY), [signals, capital])
  const allocations = allocationPlan.allocations
  const selected = signals.find((signal) => signal.symbol === selectedSymbol) ?? signals[0] ?? EMPTY_SIGNAL_PLACEHOLDER
  const selectedDecision = decisions.get(selected.symbol)
  // selectedDecisionProfile is only genuinely computed for `selectedSymbol`
  // itself (the one with live candles fetched) — anything else (including
  // the `signals[0]` fallback above, when `selectedSymbol` isn't in the
  // current list) gets the honest "not available" profile instead of a
  // mismatched one.
  const decisionProfile = profilesBySymbol.get(selected.symbol) ?? fallbackDecisionProfile
  const selectedAllocation = allocations.find((item) => item.signal.symbol === selected.symbol)
  const invested = allocationPlan.invested
  const unallocated = allocationPlan.unallocated
  const maxModeledLoss = allocationPlan.totalModeledRisk
  const riskBudget = allocationPlan.riskBudget
  const riskUsed = allocationPlan.riskUtilisationPct
  const riskBreached = allocationPlan.breaches.some((breach) => breach.kind === 'DAILY_RISK_BUDGET')
  const buySignals = signals.filter((signal) => signal.action === 'BUY')
  const strongBuyCount = buySignals.filter((signal) => signal.score >= 80).length
  const developingBuyCount = buySignals.length - strongBuyCount
  const filteredSignals = signals.filter((signal) => {
    const query = searchQuery.trim().toLowerCase()
    return !query || signal.symbol.toLowerCase().includes(query) || signal.company.toLowerCase().includes(query)
  })
  const activePosition = positions.find((position) => position.symbol === selected.symbol)
  const orderQuantity = selected.action === 'EXIT' ? activePosition?.quantity ?? 0 : selectedAllocation?.quantity ?? 0
  const totalPnl = positions.reduce((sum, position) => {
    const quote = signals.find((signal) => signal.symbol === position.symbol)?.price ?? position.averagePrice
    return sum + (quote - position.averagePrice) * position.quantity
  }, 0)

  const commitCapital = (value: number) => {
    const safe = Math.max(1_000, Math.min(1_000_000, Math.round(value || 10_000)))
    setCapital(safe)
    setCapitalInput(String(safe))
    setToast(`Allocation rebuilt for ${inr(safe)}`)
  }

  const navigateTo = (id: NavId) => {
    setActiveNav(id)
    setMobileMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const confirmPaperOrder = () => {
    if (!orderTicket || !reviewChecked) return
    const { signal, side, quantity, price } = orderTicket

    // Order-time enforcement, independent of whatever the plan looked like
    // when the modal was opened — the position cap or averaging-down rule
    // could have been crossed by another order placed in the meantime.
    const check = canPlaceOrder({ symbol: signal.symbol, side, quantity }, positions, LIVE_POLICY)
    if (!check.allowed) {
      setToast(check.reason ?? 'Order blocked by risk policy.')
      setOrderTicket(null)
      setReviewChecked(false)
      return
    }

    const order: PaperOrder = {
      id: `NP-${String(orders.length + 1).padStart(3, '0')}`,
      symbol: signal.symbol,
      side,
      quantity,
      price,
      createdAt: new Date(),
      status: 'Filled',
    }
    setOrders((current) => [order, ...current])

    if (side === 'SELL') {
      setPositions((current) => current.filter((position) => position.symbol !== signal.symbol))
    } else {
      setPositions((current) => {
        // canPlaceOrder already rejected averaging down on an existing
        // open position — this branch only runs for a genuinely new
        // position, since a full exit removes the symbol from `positions`
        // entirely rather than leaving a zero-quantity record behind.
        const existing = current.find((position) => position.symbol === signal.symbol)
        if (!existing) {
          return [
            ...current,
            {
              symbol: signal.symbol,
              quantity,
              averagePrice: price,
              openedAt: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
              // Pinned at buy time, not re-derived live — see the
              // `decisions` memo above for why a live-recomputed stop would
              // never trigger.
              stopLoss: signal.stopLoss,
              target: signal.target,
            },
          ]
        }
        const totalQuantity = existing.quantity + quantity
        const averagePrice = (existing.quantity * existing.averagePrice + quantity * price) / totalQuantity
        return current.map((position) =>
          position.symbol === signal.symbol ? { ...position, quantity: totalQuantity, averagePrice } : position,
        )
      })
    }

    setToast(`${side === 'BUY' ? 'Paper buy' : 'Paper exit'} filled · ${quantity} ${signal.symbol}`)
    setOrderTicket(null)
    setReviewChecked(false)
  }

  const sidebar = (
    <>
      <div className="sidebar-brand-row">
        <Brand />
        <button className="icon-button mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
          <X size={19} />
        </button>
      </div>
      <div className="workspace-switcher">
        <span className="avatar avatar-small">DT</span>
        <span>
          <small>Workspace</small>
          <strong>Demo workspace</strong>
        </span>
        <ChevronDown size={15} />
      </div>
      <nav className="side-nav" aria-label="Primary navigation">
        <span className="nav-label">Workspace</span>
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => navigateTo(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.id === 'signals' && <span className="nav-count">3</span>}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="paper-mode-card">
        <span className="paper-mode-icon"><ShieldCheck size={18} /></span>
        <div>
          <strong>Paper mode is on</strong>
          <p>Orders use simulated fills.</p>
        </div>
        <span className="status-dot" />
      </div>
      <button className="nav-item settings-link">
        <Settings2 size={18} />
        <span>Settings</span>
      </button>
      <div className="sidebar-profile">
        <span className="avatar">DT</span>
        <span>
          <strong>Demo trader (sample profile)</strong>
          <small>Paper portfolio · not you</small>
        </span>
        <ChevronRight size={16} />
      </div>
    </>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebar}</aside>
      {mobileMenuOpen && (
        <>
          <button className="drawer-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" />
          <aside className="mobile-sidebar">{sidebar}</aside>
        </>
      )}

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand-wrap">
            <button className="icon-button menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
              <Menu size={21} />
            </button>
            <Brand compact />
          </div>
          <div className="market-state">
            <span className="pulse-dot"><span /></span>
            <strong>Replay running</strong>
            <span>·</span>
            <span>Simulated NSE session</span>
          </div>
          <label className="global-search">
            <Search size={17} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search symbol or company"
              aria-label="Search symbol or company"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="topbar-actions">
            <span className="ist-clock">
              {now.toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}{' '}
              IST
            </span>
            <button
              className="icon-button notification-button"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Open notifications"
            >
              <Bell size={19} />
              {signalNotifications.length > 0 && <span className="unread-dot" />}
            </button>
            <span className="avatar avatar-top">DT</span>
          </div>
        </header>

        <div className={anyLiveConnected ? 'demo-notice demo-notice-live' : 'demo-notice'}>
          {anyLiveConnected ? (
            <Wifi size={16} />
          ) : upstoxSession.status === 'error' ? (
            <TriangleAlert size={16} />
          ) : (
            <Info size={16} />
          )}
          {anyLiveConnected ? (
            <p>
              <strong>Live prices from {providerLabel}.</strong>
              {upstoxConnected && growwConnected && ' Upstox preferred, Groww fills in automatically for anything Upstox misses.'}
              {' '}Scores, entries, stops and fills remain the synthetic v0.3-demo baseline—not investment advice.
              {liveLastUpdated && (
                <> Updated {Math.max(0, Math.round((now.getTime() - liveLastUpdated.getTime()) / 1000))}s ago.</>
              )}
            </p>
          ) : upstoxSession.status === 'connecting' ? (
            <p>Connecting to your Upstox account…</p>
          ) : upstoxSession.status === 'error' ? (
            <p><strong>Upstox connection failed:</strong> {upstoxSession.error}</p>
          ) : (
            <p>
              <strong>Interface demo:</strong> prices, news, scores and fills are synthetic—not live market data or
              investment advice.
              {(isUpstoxConfigured || isGrowwConfigured) && ' Connect a broker below for live prices.'}
            </p>
          )}
          {isUpstoxConfigured &&
            (upstoxSession.status === 'connected' ? (
              <button className="demo-notice-connect" onClick={upstoxSession.disconnect}>
                <WifiOff size={13} /> Disconnect Upstox
              </button>
            ) : (
              <button
                className="demo-notice-connect"
                onClick={upstoxSession.connect}
                disabled={upstoxSession.status === 'connecting'}
              >
                <Wifi size={13} /> {upstoxSession.status === 'error' ? 'Try again' : 'Connect Upstox'}
              </button>
            ))}
          <button onClick={() => setMethodOpen(true)}>How it works</button>
        </div>

        {isGrowwConfigured && (
          <div className={growwSession.status === 'connected' ? 'demo-notice demo-notice-live demo-notice-groww' : 'demo-notice demo-notice-groww'}>
            {growwSession.status === 'connected' ? <Wifi size={16} /> : <Info size={16} />}
            {growwSession.status === 'connected' ? (
              <p>
                <strong>Groww token active.</strong>
                {upstoxConnected
                  ? ' Filling in automatically for anything Upstox misses.'
                  : ' Feeding live prices.'}
                {' '}Expires ~6:00 AM IST daily—reconnect with a fresh token tomorrow.
              </p>
            ) : (
              <>
                <input
                  type="password"
                  className="groww-token-input"
                  placeholder="Paste Groww access token"
                  value={growwTokenInput}
                  onChange={(event) => setGrowwTokenInput(event.target.value)}
                  aria-label="Groww access token"
                />
              </>
            )}
            <button
              className="demo-notice-connect"
              onClick={() => {
                if (growwSession.status === 'connected') {
                  growwSession.disconnect()
                } else if (growwTokenInput.trim()) {
                  growwSession.setToken(growwTokenInput)
                  setGrowwTokenInput('')
                }
              }}
            >
              {growwSession.status === 'connected' ? (
                <>
                  <WifiOff size={13} /> Disconnect Groww
                </>
              ) : (
                <>
                  <Wifi size={13} /> Connect Groww
                </>
              )}
            </button>
          </div>
        )}

        <div className="page-wrap">
          <section id="overview" className="page-heading anchor-section">
            <div>
              <p className="eyebrow">Wednesday · Paper session</p>
              <h1>Your intraday control room</h1>
              <p className="heading-subtitle">One clear plan, sized to your capital and checked every five minutes.</p>
            </div>
            <div className="heading-actions">
              <button
                className={alertsPaused ? 'button secondary pause-active' : 'button secondary'}
                onClick={() => {
                  setAlertsPaused((current) => !current)
                  setToast(alertsPaused ? 'Signal alerts resumed' : 'Signal alerts paused')
                }}
              >
                {alertsPaused ? <Play size={16} /> : <Pause size={16} />}
                {alertsPaused ? 'Resume alerts' : 'Pause alerts'}
              </button>
              <button className="button primary" onClick={() => navigateTo('plan')}>
                <SlidersHorizontal size={16} />
                Adjust plan
              </button>
            </div>
          </section>

          <section className="market-tape" aria-label={hasLiveIndices ? 'Live market indices' : 'Illustrative market indices'}>
            <span className="tape-label">
              <Radio size={14} /> {hasLiveIndices ? `Live · ${providerLabel}` : 'Demo snapshot'}
            </span>
            {effectiveIndices.map((index) => (
              <span className="index-tick" key={index.name}>
                <small>{index.name}</small>
                <strong>{index.value}</strong>
                <em className={index.change.startsWith('+') ? 'positive' : 'negative'}>{index.change}</em>
              </span>
            ))}
            <span className="data-time">
              {hasLiveIndices ? 'Live index quotes' : 'Illustrative only—not live index data'}
            </span>
          </section>

          <section className="summary-grid" aria-label="Day summary">
            <article className="summary-card capital-summary">
              <div className="summary-topline">
                <span className="metric-icon"><WalletCards size={17} /></span>
                <span className="metric-label">Trading capital</span>
                <button className="mini-link" onClick={() => navigateTo('plan')}>Edit</button>
              </div>
              <strong className="metric-value">{inr(capital)}</strong>
              <span className="metric-note">{inr(invested)} planned · {allocations.length} equities</span>
            </article>
            <article className="summary-card">
              <div className="summary-topline">
                <span className="metric-icon green"><Crosshair size={17} /></span>
                <span className="metric-label">Valid setups</span>
                <span className="tiny-status">Now</span>
              </div>
              <strong className="metric-value">{buySignals.length} <small>of {signals.length}</small></strong>
              <span className={riskBreached ? 'metric-note negative-note' : 'metric-note positive-note'}>
                <ArrowUpRight size={14} /> {strongBuyCount} strong · {developingBuyCount} developing
              </span>
            </article>
            <article className="summary-card">
              <div className="summary-topline">
                <span className="metric-icon amber"><ShieldCheck size={17} /></span>
                <span className="metric-label">Daily risk budget</span>
                <span className={riskBreached ? 'metric-percent metric-percent-breached' : 'metric-percent'}>
                  {riskUsed.toFixed(0)}%
                </span>
              </div>
              <strong className="metric-value">{inr(maxModeledLoss)} <small>modeled</small></strong>
              <div className={riskBreached ? 'risk-progress risk-progress-breached' : 'risk-progress'}>
                <span style={{ width: `${Math.min(100, riskUsed)}%` }} />
              </div>
            </article>
            <article className="summary-card countdown-card">
              <div className="summary-topline">
                <span className="metric-icon blue"><RefreshCw size={17} /></span>
                <span className="metric-label">Next model scan</span>
                <span className="live-label"><i /> ACTIVE</span>
              </div>
              <strong className="metric-value mono">{formatTimer(scanSeconds)}</strong>
              <span className="metric-note">Signals expire at the next scan</span>
            </article>
          </section>

          <section className="decision-grid">
            <article className="panel chart-panel">
              <div className="panel-header chart-panel-header">
                <div>
                  <div className="title-with-badge">
                    <h2>{selected.symbol}</h2>
                    <span className="exchange-tag">{selected.exchange}</span>
                    <SignalBadge action={selected.action} />
                  </div>
                  <p>{selected.company} <span>·</span> {selected.sector}</p>
                </div>
                <div className="quote-block">
                  <strong>{inr(selected.price, 2)}</strong>
                  <span className={selected.changePercent >= 0 ? 'quote-up' : 'quote-down'}>
                    {selected.changePercent >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(selected.changePercent).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="timeframe-row">
                <div className="timeframe-tabs">
                  {['1m', '5m', '15m', '1h'].map((timeframe) => (
                    <button key={timeframe} className={timeframe === '5m' ? 'active' : ''}>{timeframe}</button>
                  ))}
                </div>
                <span><Clock3 size={14} /> Updated {selected.updatedAt} IST</span>
              </div>
              <CandlestickChart
                key={selected.symbol}
                candles={activeLiveCandles ?? selected.candles}
                symbol={selected.symbol}
                positive={selected.changePercent >= 0}
              />
            </article>

            <article className={`panel decision-card decision-${selected.action.toLowerCase()}`}>
              <div className="decision-topline">
                <SignalBadge action={selected.action} />
                <span className="validity"><Clock3 size={14} /> Valid for {formatTimer(scanSeconds)}</span>
              </div>
              <div className="decision-title-row">
                <div>
                  <p className="eyebrow">Current decision</p>
                  <h2>{actionCopy[selected.action].verb}</h2>
                  <p>{actionCopy[selected.action].description}</p>
                </div>
                <ScoreRing score={selected.score} />
              </div>

              <div className="trade-levels">
                {selected.action === 'BUY' ? (
                  <>
                    <div><span>Entry zone</span><strong>{inr(selected.entryLow, 2)}–{inr(selected.entryHigh, 2).replace('₹', '')}</strong></div>
                    <div><span>Indicative exit zone</span><strong className="text-buy">{inr(selected.target, 2)}</strong></div>
                    <div><span>Protective stop</span><strong className="text-exit">{inr(selected.stopLoss, 2)}</strong></div>
                    <div><span>Risk / reward</span><strong>{selected.riskReward}</strong></div>
                  </>
                ) : selected.action === 'EXIT' ? (
                  <>
                    <div><span>Current price</span><strong>{inr(selected.price, 2)}</strong></div>
                    <div><span>Exit trigger</span><strong className="text-exit">Below {inr(selected.stopLoss, 2)}</strong></div>
                    <div><span>Paper holding</span><strong>{activePosition ? `${activePosition.quantity} shares` : 'None'}</strong></div>
                    <div><span>Instruction</span><strong>Do not reverse short</strong></div>
                  </>
                ) : (
                  <>
                    <div><span>Watch above</span><strong>{inr(selected.entryLow, 2)}</strong></div>
                    <div><span>Current price</span><strong>{inr(selected.price, 2)}</strong></div>
                    <div><span>Blocked by</span><strong>{selectedDecision ? waitReasonCopy(selectedDecision) : 'Confirmation pending'}</strong></div>
                    <div><span>Action</span><strong>No trade yet</strong></div>
                  </>
                )}
              </div>

              <div className="thesis-box">
                <span><Sparkles size={15} /> Why this signal</span>
                <p>{selected.thesis}</p>
              </div>
              <div className="invalidation-note"><TriangleAlert size={15} /><span><strong>Invalidation:</strong> {selected.caution}</span></div>

              {selected.action === 'WATCH' ? (
                <button className="button primary full-width" onClick={() => setToast(`Price alert set for ${selected.symbol}`)}>
                  <Bell size={16} /> Set confirmation alert
                </button>
              ) : (
                <button
                  className={`button full-width ${selected.action === 'EXIT' ? 'danger-button' : 'primary'}`}
                  disabled={orderQuantity <= 0}
                  onClick={() => {
                    const ticket = buildOrderTicket(selected, selectedAllocation, activePosition)
                    if (ticket) {
                      setOrderTicket(ticket)
                      setReviewChecked(false)
                    }
                  }}
                >
                  <BookOpenCheck size={16} />
                  {selected.action === 'EXIT' ? 'Review paper exit' : `Review paper buy · ${orderQuantity} shares`}
                </button>
              )}
              <p className="score-disclaimer">Model score ranks setup quality; it is not a success probability.</p>
            </article>
          </section>

          <section id="signals" className="anchor-section section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Decision queue</p>
                <h2>Signals worth your attention</h2>
              </div>
              <span className="section-meta">
                {screener.result?.scannedCount ?? 0} of {screener.result?.universeSize ?? 50} screened ·{' '}
                {buySignals.length} passed
              </span>
            </div>
            {signals.length === 0 && (
              <p className="score-disclaimer">
                {screener.result?.generatedAt
                  ? 'No symbol currently leans BUY or WATCH.'
                  : "Waiting for the scheduled scan's first result today — it runs every 5 minutes during market hours."}
              </p>
            )}
            <div className="signal-strip">
              {filteredSignals.map((signal) => (
                <button
                  key={signal.symbol}
                  className={signal.symbol === selected.symbol ? 'signal-list-card active' : 'signal-list-card'}
                  onClick={() => {
                    setSelectedSymbol(signal.symbol)
                    document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                >
                  <div className="signal-list-top">
                    <span className="stock-monogram">{signal.symbol.slice(0, 2)}</span>
                    <span className="stock-id"><strong>{signal.symbol}</strong><small>{signal.company}</small></span>
                    <SignalBadge action={signal.action} />
                  </div>
                  <div className="signal-price-row">
                    <strong>{inr(signal.price, 2)}</strong>
                    <span className={signal.changePercent >= 0 ? 'text-buy' : 'text-exit'}>
                      {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="micro-chart" aria-hidden="true">
                    {signal.candles.slice(-9).map((candle, index) => {
                      const delta = candle.close - candle.open
                      const magnitude = Math.min(90, 28 + Math.abs(delta / signal.price) * 4200)
                      return <i key={index} className={delta >= 0 ? 'up' : 'down'} style={{ height: `${magnitude}%` }} />
                    })}
                  </div>
                  <div className="signal-list-footer">
                    <span>Score <strong>{signal.score}</strong></span>
                    <span>{signal.horizon}</span>
                    <ChevronRight size={16} />
                  </div>
                </button>
              ))}
              {filteredSignals.length === 0 && (
                <div className="empty-search"><Search size={20} /><span>No symbol matches “{searchQuery}”.</span></div>
              )}
            </div>
          </section>

          <section id="screener" className="anchor-section section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Nifty 50 technical screener</p>
                <h2>Top picks across the index</h2>
              </div>
              <span className="section-meta">
                {screener.result?.generatedAt
                  ? `Scanned ${screener.result.scannedCount ?? 0} of ${screener.result.universeSize ?? 50} · via ${screener.result.provider === 'upstox' ? 'Upstox' : 'Groww'}`
                  : 'No scan yet'}
              </span>
            </div>

            <article className="panel screener-panel">
              <div className="screener-disclaimer">
                <TriangleAlert size={15} />
                <p>
                  Technical score only (max 60/100) — RSI, EMA 9/21, VWAP and volume z-score from real candles.
                  Market/sector, news, fundamentals and risk-quality evidence (the spec's other 40 points) aren't
                  included. "Lean" is a ranking, not a gated verdict — the Signals panel above runs this same
                  technical score through the real BUY/WAIT/EXIT engine (entry gates, a real ATR-based stop, and the
                  cost-adjusted-edge check) for whichever symbol you select. Updates every 5 minutes during market
                  hours, only on days a connected session exists.
                </p>
              </div>

              {screener.error && (
                <div className="screener-empty">
                  <TriangleAlert size={22} />
                  <strong>Could not load the screener</strong>
                  <p>{screener.error}</p>
                </div>
              )}

              {!screener.error && (!screener.result || screener.result.picks.length === 0) && (
                <div className="screener-empty">
                  <ScanSearch size={22} />
                  <strong>No scan published yet</strong>
                  <p>
                    The scheduled scan runs every 5 minutes during market hours once a session token is available —
                    connect Upstox or Groww above, then check back.
                  </p>
                </div>
              )}

              {screener.result && screener.result.picks.length > 0 && (
                <div className="screener-table" role="table" aria-label="Nifty 50 top picks">
                  <div className="screener-head" role="row">
                    <span>Rank</span>
                    <span>Stock</span>
                    <span>Price</span>
                    <span>Technical score</span>
                    <span>RSI</span>
                    <span>Volume</span>
                    <span>Lean</span>
                  </div>
                  {screener.result.picks.map((pick, index) => (
                    <div className="screener-row" role="row" key={pick.symbol}>
                      <span className="screener-rank">{index + 1}</span>
                      <span className="screener-stock">
                        <strong>{pick.symbol}</strong>
                        <small>{pick.name}</small>
                      </span>
                      <span>{inr(pick.lastClose, 2)}</span>
                      <span className="screener-score">
                        <strong>{pick.technicalScore.toFixed(1)}</strong>
                        <small>/{pick.technicalScoreMax}</small>
                        <i><b style={{ width: `${Math.min(100, (pick.technicalScore / pick.technicalScoreMax) * 100)}%` }} /></i>
                      </span>
                      <span>{pick.rsi.toFixed(1)}</span>
                      <span className={pick.volumeZScore >= 0 ? 'text-buy' : 'text-exit'}>
                        {pick.volumeZScore >= 0 ? '+' : ''}
                        {pick.volumeZScore.toFixed(2)}σ
                      </span>
                      <span className={`screener-lean screener-lean-${pick.lean.toLowerCase()}`}>{pick.lean}</span>
                    </div>
                  ))}
                </div>
              )}
              {screener.result?.generatedAt && (
                <p className="screener-updated">
                  Last scanned{' '}
                  {new Date(screener.result.generatedAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}{' '}
                  IST
                </p>
              )}
            </article>
          </section>

          <section id="plan" className="anchor-section section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Capital plan</p>
                <h2>Today’s suggested allocation</h2>
              </div>
              <span className="section-meta">Whole shares · no leverage · up to 3 positions</span>
            </div>

            <div className="allocation-layout">
              <article className="panel capital-builder">
                <div className="capital-input-header">
                  <div>
                    <label htmlFor="capital-input">Capital for today</label>
                    <p>The plan updates around whole-share quantities.</p>
                  </div>
                  <div className="capital-input-wrap">
                    <span>₹</span>
                    <input
                      id="capital-input"
                      inputMode="numeric"
                      value={capitalInput}
                      onChange={(event) => setCapitalInput(event.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={() => commitCapital(Number(capitalInput))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitCapital(Number(capitalInput))
                      }}
                    />
                  </div>
                </div>
                <div className="preset-row">
                  {[10_000, 20_000, 50_000].map((amount) => (
                    <button
                      key={amount}
                      className={capital === amount ? 'active' : ''}
                      onClick={() => commitCapital(amount)}
                    >
                      {inr(amount)}
                    </button>
                  ))}
                  <span>Min ₹1,000 · max ₹10 lakh</span>
                </div>

                <div className="allocation-table" role="table" aria-label="Suggested equity allocation">
                  <div className="allocation-head" role="row">
                    <span>Equity</span><span>Plan</span><span>Allocation</span><span>Stop risk</span><span />
                  </div>
                  {allocations.map((item) => {
                    const perShareRisk = Math.max(0, (item.signal.entryLow + item.signal.entryHigh) / 2 - item.signal.stopLoss)
                    return (
                      <div className="allocation-row" role="row" key={item.signal.symbol}>
                        <span className="allocation-stock">
                          <i className="stock-monogram">{item.signal.symbol.slice(0, 2)}</i>
                          <span><strong>{item.signal.symbol}</strong><small>{item.signal.sector}</small></span>
                        </span>
                        <span className="quantity-cell"><strong>{item.quantity}</strong><small>shares</small></span>
                        <span className="amount-cell">
                          <strong>{inr(item.amount)}</strong>
                          <small>{item.percent.toFixed(1)}% of capital</small>
                          <i><b style={{ width: `${Math.min(100, item.percent)}%` }} /></i>
                        </span>
                        <span className="risk-cell"><strong>{inr(perShareRisk * item.quantity)}</strong><small>if stop fills</small></span>
                        <button
                          className="table-action"
                          onClick={() => {
                            setSelectedSymbol(item.signal.symbol)
                            const ticket = buildOrderTicket(
                              item.signal,
                              item,
                              positions.find((position) => position.symbol === item.signal.symbol),
                            )
                            if (ticket) {
                              setOrderTicket(ticket)
                              setReviewChecked(false)
                            }
                          }}
                        >Review <ChevronRight size={14} /></button>
                      </div>
                    )
                  })}
                  {allocations.length === 0 && (
                    <div className="allocation-empty">
                      <TriangleAlert size={19} />{' '}
                      {buySignals.length === 0
                        ? signals.length === 0
                          ? "Waiting for the scheduled scan's first result today — nothing to allocate against yet."
                          : 'No symbol currently clears every entry gate for a BUY — nothing to allocate right now.'
                        : 'Capital is below the price and risk requirements for the current setups.'}
                    </div>
                  )}
                </div>
                <div className="allocation-total">
                  <span><small>Planned in equities</small><strong>{inr(invested)}</strong></span>
                  <span><small>Whole-share remainder</small><strong>{inr(unallocated)}</strong></span>
                  <span><small>Estimated fees + slippage</small><strong>≈ {inr(invested * 0.0012)}</strong></span>
                </div>
              </article>

              <aside className="panel risk-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Before you act</p>
                    <h3>Risk guardrails</h3>
                  </div>
                  <span className="shield-mark"><ShieldCheck size={21} /></span>
                </div>
                <div className="risk-gauge-wrap">
                  <div
                    className={riskBreached ? 'risk-gauge risk-gauge-breached' : 'risk-gauge'}
                    style={{ '--risk': `${Math.min(100, riskUsed) * 1.8}deg` } as CSSProperties}
                  >
                    <div><strong>{riskUsed.toFixed(0)}%</strong><span>budget used</span></div>
                  </div>
                  <p>Maximum modeled plan loss<br /><strong>{inr(maxModeledLoss)}</strong> of {inr(riskBudget)}</p>
                </div>
                <div className="guardrail-list">
                  <span><Check size={15} /> <b>1.0%</b> daily loss cutoff</span>
                  <span><Check size={15} /> <b>0.35%</b> risk per setup</span>
                  <span><Check size={15} /> <b>3</b> positions maximum</span>
                  <span><Check size={15} /> <b>0×</b> leverage</span>
                  <span><Check size={15} /> Exit before session close</span>
                </div>
                {riskBreached && (
                  <div className="risk-callout risk-callout-warning">
                    <TriangleAlert size={15} />
                    <p><strong>Daily risk budget exceeded.</strong> Modeled plan loss is above the 1% cutoff — reduce capital or wait for a smaller-risk setup before confirming a new buy.</p>
                  </div>
                )}
                {allocationPlan.droppedForPositionCap.length > 0 && (
                  <div className="risk-callout risk-callout-warning">
                    <TriangleAlert size={15} />
                    <p>
                      <strong>{allocationPlan.droppedForPositionCap.length} eligible setup(s) not funded</strong> by
                      the 3-position cap: {allocationPlan.droppedForPositionCap.join(', ')}.
                    </p>
                  </div>
                )}
                <div className="risk-callout">
                  <Info size={15} />
                  <p>The unallocated remainder is intentional: NSE cash equities trade in whole shares, and every plan must pass the risk cap.</p>
                </div>
              </aside>
            </div>
          </section>

          <section id="insights" className="anchor-section section-block research-layout">
            <article className="panel factor-panel">
              <div className="panel-header">
                <div><p className="eyebrow">Explainable signal</p><h2>Evidence for {selected.symbol}</h2></div>
                <button className="icon-button" aria-label="Signal methodology" onClick={() => setMethodOpen(true)}><CircleHelp size={18} /></button>
              </div>
              <div className="factor-grid">
                {selected.factors.map((factor) => (
                  <div className="factor" key={factor.label}>
                    <span>{factor.label}</span>
                    <strong className={`factor-${factor.tone}`}>{factor.value}</strong>
                    <i className={factor.tone}><b /></i>
                  </div>
                ))}
              </div>
              <div className="context-row">
                <span className="metric-icon blue"><Activity size={17} /></span>
                <div><small>Market context</small><strong>{selected.catalyst}</strong></div>
              </div>
              <button className="method-toggle" onClick={() => setMethodOpen(true)}>
                View methodology & opposing evidence <ChevronRight size={15} />
              </button>
            </article>

            <article className="panel news-panel">
              <div className="panel-header">
                <div><p className="eyebrow">Context feed</p><h2>News & market pulse</h2></div>
                <span className="source-pill"><LockKeyhole size={12} /> Simulated</span>
              </div>
              <div className="news-list">
                {newsItems.map((item) => (
                  <div className="news-item" key={`${item.time}-${item.title}`}>
                    <span className={`sentiment sentiment-${item.sentiment.toLowerCase()}`} />
                    <div>
                      <span className="news-meta">{item.time} · {item.source} <em>{item.sentiment}</em></span>
                      <strong>{item.title}</strong>
                      <small>{item.related}</small>
                    </div>
                  </div>
                ))}
              </div>
              <p className="news-disclaimer">A production feed must show the original publisher link and verified publication time.</p>
            </article>

            <article className="panel decision-explain-panel">
              <div className="explain-header">
                <div>
                  <p className="eyebrow">Decision trace · model v0.3-demo</p>
                  <h2>Why {selected.symbol} is {actionLabel[selected.action]}</h2>
                  <p>A weighted score ranks the setup; hard safety gates make the final decision.</p>
                </div>
                <div className={`decision-result result-${selected.action.toLowerCase()}`}>
                  <span>Final output</span>
                  <strong><SignalBadge action={selected.action} /> {selected.score}/{TECHNICAL_SCORE_MAX}</strong>
                </div>
              </div>

              <div className="logic-layout">
                <div className="score-breakdown">
                  <div className="logic-subhead">
                    <h3>Weighted evidence</h3>
                    <span>Points earned / maximum</span>
                  </div>
                  {decisionProfile.components.map((component) => (
                    <div className="score-row" key={component.label}>
                      <div className="score-copy">
                        <span><strong>{component.label}</strong><em className={`source-key source-${component.source}`}>{component.source}</em></span>
                        <p>{component.detail}</p>
                      </div>
                      <div className="score-track" aria-hidden="true">
                        <i style={{ width: `${(component.score / component.maxScore) * 100}%` }} />
                      </div>
                      <span className="score-points"><strong>{component.score}</strong>/{component.maxScore}</span>
                    </div>
                  ))}
                  <div className="score-total">
                    <span>Total evidence score</span>
                    <strong>{selected.score}<small>/{TECHNICAL_SCORE_MAX}</small></strong>
                  </div>
                </div>

                <div className="gate-panel">
                  <div className="logic-subhead">
                    <h3>Hard safety gates</h3>
                    <span>Any required failure can force WAIT</span>
                  </div>
                  <div className="gate-list">
                    {decisionProfile.checks.map((check) => (
                      <div className={check.passed ? 'gate-row passed' : 'gate-row blocked'} key={check.label}>
                        <span className="gate-icon">{check.passed ? <Check size={14} /> : <X size={14} />}</span>
                        <span><strong>{check.label}</strong><small>{check.detail}</small></span>
                        <em>{check.passed ? 'PASS' : 'BLOCK'}</em>
                      </div>
                    ))}
                  </div>
                  <div className="threshold-rule">
                    <Info size={15} />
                    <p>
                      {selected.action === 'BUY'
                        ? `BUY requires ≥${TECHNICAL_BUY_THRESHOLD}/${TECHNICAL_SCORE_MAX} points and every required entry gate to pass.`
                        : selected.action === 'EXIT'
                          ? 'EXIT fires only against a recorded long holding, when live price crosses the stop set at buy time — independent of score. It never opens a short.'
                          : `WAIT is returned when the score is below ${TECHNICAL_BUY_THRESHOLD}/${TECHNICAL_SCORE_MAX}, a required entry gate fails, or (while holding) no exit condition has triggered yet.`}
                    </p>
                  </div>
                </div>

                <div className="peer-panel">
                  <div className="logic-subhead">
                    <h3>Industry-relative context</h3>
                    <span>{decisionProfile.peerGroup}</span>
                  </div>
                  <p className="peer-note">Fundamentals are a context filter, not a five-minute timing trigger.</p>
                  <div className="peer-list">
                    {decisionProfile.peerMetrics.map((metric) => (
                      <div className="peer-row" key={metric.label}>
                        <span><strong>{metric.label}</strong><small>{metric.assessment}</small></span>
                        <div className="percentile-track"><i className={metric.tone} style={{ width: `${metric.percentile}%` }} /></div>
                        <em>{metric.percentile}<small>th pct</small></em>
                      </div>
                    ))}
                  </div>
                  <p className="synthetic-label"><TriangleAlert size={13} /> Illustrative peer percentiles—not current company fundamentals.</p>
                </div>
              </div>

              <article className="panel news-events-panel">
                <div className="logic-subhead">
                  <h3>Corporate actions & news</h3>
                  <span>Real data (Upstox) — informational only, not scored</span>
                </div>
                {decisionProfile.newsEvents ? (
                  <div className="news-events-list">
                    {decisionProfile.newsEvents.corporateActions.map((action, index) => (
                      <div className="news-event-row" key={`ca-${index}`}>
                        <Bell size={14} />
                        <span>
                          <strong>{action.name}</strong>
                          <small>
                            {action.expiryDate}
                            {action.ratio ? ` · ${action.ratio}` : ''}
                            {action.amount ? ` · ₹${action.amount}` : ''}
                          </small>
                        </span>
                        <em>Verified · NSE/Upstox corporate action</em>
                      </div>
                    ))}
                    {decisionProfile.newsEvents.news.map((article, index) => (
                      <a
                        className="news-event-row news-event-link"
                        key={`news-${index}`}
                        href={article.articleLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Newspaper size={14} />
                        <span>
                          <strong>{article.heading}</strong>
                          <small>{new Date(article.publishedAtMs).toLocaleString('en-IN')}</small>
                        </span>
                        <em>Verified · Upstox News API</em>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="score-disclaimer">
                    Not available for this symbol right now — no recent corporate action or news article from Upstox
                    (or the scan ran on Groww, which has no equivalent endpoint).
                  </p>
                )}
              </article>

              <div className="source-stack-header">
                <div><h3>Selected closed-beta APIs</h3><p>Use each tester's Upstox OAuth. A public multi-user release requires a separately licensed shared feed.</p></div>
                <span className="not-connected"><i /> NOT CONNECTED</span>
              </div>
              <div className="source-stack">
                {dataSourcePlan.map((source) => (
                  <div className={`source-card source-card-${source.key}`} key={source.key}>
                    <span className="source-card-icon">
                      {source.key === 'market' && <Activity size={16} />}
                      {source.key === 'news' && <Newspaper size={16} />}
                      {source.key === 'events' && <Bell size={16} />}
                      {source.key === 'fundamentals' && <Gauge size={16} />}
                    </span>
                    <div><strong>{source.name}</strong><p>{source.role}</p><small>{source.cadence}</small></div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section id="history" className="anchor-section section-block">
            <div className="section-heading">
              <div><p className="eyebrow">Paper portfolio</p><h2>Positions & decision journal</h2></div>
              <span className={totalPnl >= 0 ? 'pnl-pill positive' : 'pnl-pill negative'}>
                Unrealized P&amp;L {totalPnl >= 0 ? '+' : ''}{inr(totalPnl, 2)}
              </span>
            </div>
            <div className="journal-layout">
              <article className="panel positions-panel">
                <div className="subpanel-title"><h3>Open positions</h3><span>{positions.length} active</span></div>
                {positions.length === 0 ? (
                  <div className="empty-state"><CheckCircle2 size={23} /><strong>No open paper positions</strong><p>New paper fills will appear here.</p></div>
                ) : (
                  positions.map((position) => {
                    const quote = signals.find((signal) => signal.symbol === position.symbol)
                    const currentPrice = quote?.price ?? position.averagePrice
                    const pnl = (currentPrice - position.averagePrice) * position.quantity
                    return (
                      <div className="position-row" key={position.symbol}>
                        <span className="stock-monogram">{position.symbol.slice(0, 2)}</span>
                        <span><strong>{position.symbol}</strong><small>{position.quantity} shares · avg {inr(position.averagePrice, 2)}</small></span>
                        <span><small>Live*</small><strong>{inr(currentPrice, 2)}</strong></span>
                        <span className={pnl >= 0 ? 'text-buy' : 'text-exit'}><small>P&amp;L</small><strong>{pnl >= 0 ? '+' : ''}{inr(pnl, 2)}</strong></span>
                        <button onClick={() => {
                          if (quote) {
                            setSelectedSymbol(quote.symbol)
                            if (quote.action === 'EXIT') {
                              const ticket = buildOrderTicket(quote, undefined, position)
                              if (ticket) {
                                setOrderTicket(ticket)
                                setReviewChecked(false)
                              }
                            } else {
                              setToast(`No validated exit setup for ${quote.symbol}`)
                            }
                          }
                        }}>Review</button>
                      </div>
                    )
                  })
                )}
                <p className="asterisk-note">*Synthetic replay quote, not a live exchange price.</p>
              </article>

              <article className="panel activity-panel">
                <div className="subpanel-title"><h3>Audit trail</h3><span>Model v0.3-demo</span></div>
                <div className="activity-list">
                  {orders.map((order) => (
                    <div className="activity-row" key={order.id}>
                      <span className={`activity-icon ${order.side.toLowerCase()}`}>{order.side === 'BUY' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</span>
                      <span><strong>{order.side} {order.symbol}</strong><small>{order.quantity} shares at {inr(order.price, 2)}</small></span>
                      <span><small>{order.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small><em>{order.status}</em></span>
                    </div>
                  ))}
                  <div className="activity-row">
                    <span className="activity-icon scan"><RefreshCw size={15} /></span>
                    <span><strong>Signal scan completed</strong><small>6 equities screened · 3 passed</small></span>
                    <span><small>10:42</small><em>Logged</em></span>
                  </div>
                  <div className="activity-row">
                    <span className="activity-icon warning"><TriangleAlert size={15} /></span>
                    <span><strong>SBIN exit condition</strong><small>Price moved below protective level</small></span>
                    <span><small>10:41</small><em>Logged</em></span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <footer className="app-footer">
            <div><Brand /><span>Research interface · demo build</span></div>
            <p>Market-linked recommendations can lose capital. No return is assured. Verify price, liquidity, costs and order details before acting. Time-sensitive signals may become stale.</p>
            <span>Model v0.3-demo · Synthetic dataset</span>
          </footer>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon
          return <button key={item.id} className={activeNav === item.id ? 'active' : ''} onClick={() => navigateTo(item.id)}><Icon size={19} /><span>{item.label}</span></button>
        })}
      </nav>

      {notificationsOpen && (
        <>
          <button className="drawer-scrim" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications" />
          <aside className="notification-drawer" aria-label="Notifications">
            <div className="drawer-header">
              <div><p className="eyebrow">Signal centre</p><h2>Notifications</h2></div>
              <button className="icon-button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={19} /></button>
            </div>
            <div className={alertsPaused ? 'alert-status paused' : 'alert-status'}>
              <span>{alertsPaused ? <Pause size={16} /> : <Bell size={16} />}</span>
              <div><strong>{alertsPaused ? 'Alerts paused' : 'Alerts are active'}</strong><p>{alertsPaused ? 'No new signals will be surfaced.' : 'Next scan in ' + formatTimer(scanSeconds)}</p></div>
              <button onClick={() => setAlertsPaused((current) => !current)}>{alertsPaused ? 'Resume' : 'Pause'}</button>
            </div>
            {resolvedSignalNotifications.length > 0 && (
              <div className={dailySignalPnl >= 0 ? 'signal-pnl-summary positive' : 'signal-pnl-summary negative'}>
                <span>Signal P&amp;L this session</span>
                <strong>{dailySignalPnl >= 0 ? '+' : ''}{inr(dailySignalPnl, 2)}</strong>
                <small>{resolvedSignalNotifications.length} resolved · mark-to-market at +5 min</small>
              </div>
            )}
            <div className="notification-list">
              {signalNotifications.length === 0 ? (
                <div className="empty-state">
                  <CheckCircle2 size={23} />
                  <strong>No signal changes yet</strong>
                  <p>Real BUY/WAIT/EXIT changes will appear here as they happen this session.</p>
                </div>
              ) : (
                signalNotifications.map((notification) => {
                  const secondsToResolve = Math.max(0, Math.round((notification.resolveAt - now.getTime()) / 1000))
                  const tone = notification.action === 'BUY' ? 'buy' : notification.action === 'EXIT' ? 'exit' : 'info'
                  return (
                    <button
                      className="notification-item"
                      key={notification.id}
                      onClick={() => {
                        setSelectedSymbol(notification.symbol)
                        setNotificationsOpen(false)
                        document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                    >
                      <span className={`notification-tone ${tone}`} />
                      <span>
                        <strong>{notification.symbol} {actionLabel[notification.action]}</strong>
                        <p>{notification.detail}</p>
                        <small>
                          {notification.status === 'resolved' && notification.pnl !== undefined
                            ? `${notification.pnl >= 0 ? '+' : ''}${inr(notification.pnl, 2)} if acted on within 5 min`
                            : notification.status === 'pending'
                              ? `Resolving in ${formatTimer(secondsToResolve)}`
                              : 'No sizeable quantity to track'}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  )
                })
              )}
            </div>
            <div className="drawer-footnote">
              <ShieldCheck size={16} />
              <p>Opens the symbol's decision screen. Shadow P&amp;L reflects what a prompt paper order would have earned — it is not applied to your actual paper positions unless you separately confirm an order.</p>
            </div>
          </aside>
        </>
      )}

      {orderTicket && (
        <div className="modal-layer" role="presentation">
          <button
            className="modal-backdrop"
            onClick={() => {
              setOrderTicket(null)
              setReviewChecked(false)
            }}
            aria-label="Close order review"
          />
          <section className="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-title">
            <div className="modal-header">
              <span className={orderTicket.side === 'SELL' ? 'modal-icon exit' : 'modal-icon'}>
                {orderTicket.side === 'SELL' ? <ArrowDownRight size={21} /> : <ArrowUpRight size={21} />}
              </span>
              <div><p className="eyebrow">Simulated execution</p><h2 id="order-title">Review paper {orderTicket.side === 'SELL' ? 'exit' : 'buy'}</h2></div>
              <button
                className="icon-button"
                onClick={() => {
                  setOrderTicket(null)
                  setReviewChecked(false)
                }}
                aria-label="Close order review"
              ><X size={19} /></button>
            </div>
            <div className="order-security">
              <span className="stock-monogram">{orderTicket.signal.symbol.slice(0, 2)}</span>
              <span><strong>{orderTicket.signal.symbol}</strong><small>{orderTicket.signal.company} · NSE</small></span>
              <SignalBadge action={orderTicket.signal.action} />
            </div>
            <div className="order-summary-grid">
              <div><span>Quantity</span><strong>{orderTicket.quantity} shares</strong></div>
              <div><span>Reference price</span><strong>{inr(orderTicket.price, 2)}</strong></div>
              <div><span>Order value</span><strong>{inr(orderTicket.quantity * orderTicket.price, 2)}</strong></div>
              <div><span>{orderTicket.side === 'SELL' ? 'Estimated P&L' : 'Maximum modeled loss'}</span><strong className={orderTicket.side === 'SELL' ? 'text-exit' : ''}>
                {orderTicket.side === 'SELL' && orderTicket.estimatedPnl !== null
                  ? inr(orderTicket.estimatedPnl, 2)
                  : inr(orderTicket.maxLoss, 2)}
              </strong></div>
            </div>
            {orderTicket.side === 'BUY' && (
              <div className="order-level-line"><span>Protective stop <strong>{inr(orderTicket.signal.stopLoss, 2)}</strong></span><span>Indicative exit <strong>{inr(orderTicket.signal.target, 2)}</strong></span></div>
            )}
            <div className="paper-warning"><ShieldCheck size={17} /><p><strong>Paper mode only.</strong> This records a simulated fill and never connects to a broker or exchange.</p></div>
            <label className="review-check">
              <input type="checkbox" checked={reviewChecked} onChange={(event) => setReviewChecked(event.target.checked)} />
              <span>I reviewed quantity, price, stop and modeled risk.</span>
            </label>
            <button
              className={orderTicket.side === 'SELL' ? 'button full-width danger-button' : 'button full-width primary'}
              onClick={confirmPaperOrder}
              disabled={!reviewChecked}
            >
              <CheckCircle2 size={17} /> Confirm simulated {orderTicket.side === 'SELL' ? 'exit' : 'buy'}
            </button>
            <button
              className="text-button"
              onClick={() => {
                setOrderTicket(null)
                setReviewChecked(false)
              }}
            >Cancel</button>
          </section>
        </div>
      )}

      {methodOpen && (
        <div className="modal-layer" role="presentation">
          <button className="modal-backdrop" onClick={() => setMethodOpen(false)} aria-label="Close methodology" />
          <section className="method-modal" role="dialog" aria-modal="true" aria-labelledby="method-title">
            <div className="modal-header">
              <span className="modal-icon blue"><Gauge size={21} /></span>
              <div><p className="eyebrow">Model card</p><h2 id="method-title">How the demo signal works</h2></div>
              <button className="icon-button" onClick={() => setMethodOpen(false)} aria-label="Close methodology"><X size={19} /></button>
            </div>
            <p className="method-intro">Every finalized five-minute candle is scored with information available at that timestamp. A risk gate can turn any score into <strong>WAIT / NO TRADE</strong>.</p>
            <div className="method-steps">
              <div><span>01</span><p><strong>Trend & momentum</strong>EMA alignment, RSI, and price versus VWAP — computed from real candles.</p></div>
              <div><span>02</span><p><strong>Participation</strong>Real volume expansion versus its own recent baseline.</p></div>
              <div><span>03</span><p><strong>Context check</strong>Real corporate actions and news (Upstox) shown as context — informational only, not scored or vetoed.</p></div>
              <div><span>04</span><p><strong>Risk & sizing</strong>Whole-share quantity is limited by capital, a real ATR-based stop, and the daily loss budget.</p></div>
            </div>
            <div className="decision-thresholds">
              <div className="buy"><span>BUY</span><strong>{TECHNICAL_BUY_THRESHOLD}–{TECHNICAL_SCORE_MAX}</strong><small>All required gates pass</small></div>
              <div className="wait"><span>WAIT</span><strong>{TECHNICAL_WATCH_THRESHOLD}–{TECHNICAL_BUY_THRESHOLD - 1}</strong><small>Or any entry gate fails</small></div>
              <div className="avoid"><span>AVOID</span><strong>0–{TECHNICAL_WATCH_THRESHOLD - 1}</strong><small>No actionable edge</small></div>
              <div className="exit"><span>EXIT</span><strong>Stop hit</strong><small>Only against a held long — independent of score</small></div>
            </div>
            <p className="formula-line">
              Score (max {TECHNICAL_SCORE_MAX}, technical-only) = 25% trend/VWAP + 20% momentum + 15% volume/liquidity —
              market/sector, peer fundamentals and risk quality (the spec's other 40 points) aren't computed; see the
              Screener tab's disclaimer.
            </p>
            <div className="opposing-evidence">
              <TriangleAlert size={17} />
              <p><strong>Opposing evidence is required.</strong> For {selected.symbol}: {selected.caution}</p>
            </div>
            <p className="method-legal">This interface uses synthetic data and an unvalidated demonstration model. Production release requires licensed feeds, timestamped audit records, walk-forward testing after all costs, and Indian regulatory review.</p>
            <button className="button primary full-width" onClick={() => setMethodOpen(false)}>Understood</button>
          </section>
        </div>
      )}

      {toast && <div className="toast"><CheckCircle2 size={17} /><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  )
}

export default App
