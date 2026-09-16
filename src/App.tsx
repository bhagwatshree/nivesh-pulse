import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  WalletCards,
  X,
} from 'lucide-react'
import Brand from './components/Brand'
import CandlestickChart from './components/CandlestickChart'
import {
  dataSourcePlan,
  decisionProfiles,
  marketIndices,
  newsItems,
  notifications,
  signals,
} from './data/market'
import { buildAllocation, inr } from './lib/allocation'
import type { PaperOrder, SignalAction, StockSignal } from './types'

type NavId = 'overview' | 'signals' | 'plan' | 'insights' | 'history'

interface Position {
  symbol: string
  quantity: number
  averagePrice: number
  openedAt: string
}

const navItems: { id: NavId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Today', icon: LayoutDashboard },
  { id: 'signals', label: 'Signals', icon: CandlestickIcon },
  { id: 'plan', label: 'Allocation', icon: WalletCards },
  { id: 'insights', label: 'Research', icon: Newspaper },
  { id: 'history', label: 'Journal', icon: History },
]

const formatTimer = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

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

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 70 ? '#147d64' : score >= 55 ? '#bf7b21' : '#c64f55'
  return (
    <div
      className="score-ring"
      style={{ '--score': `${score * 3.6}deg`, '--score-color': tone } as CSSProperties}
      aria-label={`Model score ${score} out of 100`}
    >
      <span>{score}</span>
      <small>/100</small>
    </div>
  )
}

function App() {
  const [capital, setCapital] = useState(10_000)
  const [capitalInput, setCapitalInput] = useState('10000')
  const [selectedSymbol, setSelectedSymbol] = useState(signals[0].symbol)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNav, setActiveNav] = useState<NavId>('overview')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [alertsPaused, setAlertsPaused] = useState(false)
  const [scanSeconds, setScanSeconds] = useState(165)
  const [now, setNow] = useState(new Date())
  const [orderReview, setOrderReview] = useState<StockSignal | null>(null)
  const [orders, setOrders] = useState<PaperOrder[]>([])
  const [positions, setPositions] = useState<Position[]>([
    { symbol: 'SBIN', quantity: 3, averagePrice: 821.2, openedAt: '10:07' },
  ])
  const [toast, setToast] = useState<string | null>(null)
  const [methodOpen, setMethodOpen] = useState(false)

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

  const allocations = useMemo(() => buildAllocation(signals, capital), [capital])
  const selected = signals.find((signal) => signal.symbol === selectedSymbol) ?? signals[0]
  const decisionProfile = decisionProfiles[selected.symbol]
  const selectedAllocation = allocations.find((item) => item.signal.symbol === selected.symbol)
  const invested = allocations.reduce((sum, item) => sum + item.amount, 0)
  const unallocated = Math.max(0, capital - invested)
  const maxModeledLoss = allocations.reduce((sum, item) => {
    const entry = (item.signal.entryLow + item.signal.entryHigh) / 2
    return sum + Math.max(0, entry - item.signal.stopLoss) * item.quantity
  }, 0)
  const riskBudget = capital * 0.01
  const riskUsed = Math.min(100, riskBudget ? (maxModeledLoss / riskBudget) * 100 : 0)
  const filteredSignals = signals.filter((signal) => {
    const query = searchQuery.trim().toLowerCase()
    return !query || signal.symbol.toLowerCase().includes(query) || signal.company.toLowerCase().includes(query)
  })
  const activePosition = positions.find((position) => position.symbol === selected.symbol)
  const orderQuantity = selected.action === 'EXIT' ? activePosition?.quantity ?? 0 : selectedAllocation?.quantity ?? 0
  const entryPrice =
    selected.action === 'EXIT' ? selected.price : (selected.entryLow + selected.entryHigh) / 2
  const selectedMaxLoss =
    selected.action === 'BUY' ? Math.max(0, entryPrice - selected.stopLoss) * orderQuantity : 0
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
    if (!orderReview || orderQuantity <= 0) return
    const side = orderReview.action === 'EXIT' ? 'SELL' : 'BUY'
    const order: PaperOrder = {
      id: `NP-${String(orders.length + 1).padStart(3, '0')}`,
      symbol: orderReview.symbol,
      side,
      quantity: orderQuantity,
      price: entryPrice,
      createdAt: new Date(),
      status: 'Filled',
    }
    setOrders((current) => [order, ...current])

    if (side === 'SELL') {
      setPositions((current) => current.filter((position) => position.symbol !== orderReview.symbol))
    } else {
      setPositions((current) => {
        const existing = current.find((position) => position.symbol === orderReview.symbol)
        if (!existing) {
          return [
            ...current,
            {
              symbol: orderReview.symbol,
              quantity: orderQuantity,
              averagePrice: entryPrice,
              openedAt: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            },
          ]
        }
        const totalQuantity = existing.quantity + orderQuantity
        const averagePrice =
          (existing.quantity * existing.averagePrice + orderQuantity * entryPrice) / totalQuantity
        return current.map((position) =>
          position.symbol === orderReview.symbol
            ? { ...position, quantity: totalQuantity, averagePrice }
            : position,
        )
      })
    }

    setToast(`${side === 'BUY' ? 'Paper buy' : 'Paper exit'} filled · ${orderQuantity} ${orderReview.symbol}`)
    setOrderReview(null)
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
        <span className="avatar avatar-small">AK</span>
        <span>
          <small>Workspace</small>
          <strong>Personal research</strong>
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
        <span className="avatar">AK</span>
        <span>
          <strong>Arjun Kumar</strong>
          <small>Paper portfolio</small>
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
              <span className="unread-dot" />
            </button>
            <span className="avatar avatar-top">AK</span>
          </div>
        </header>

        <div className="demo-notice">
          <Info size={16} />
          <p><strong>Interface demo:</strong> prices, news, scores and fills are synthetic—not live market data or investment advice.</p>
          <button onClick={() => setMethodOpen(true)}>How it works</button>
        </div>

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

          <section className="market-tape" aria-label="Illustrative market indices">
            <span className="tape-label"><Radio size={14} /> Demo snapshot</span>
            {marketIndices.map((index) => (
              <span className="index-tick" key={index.name}>
                <small>{index.name}</small>
                <strong>{index.value}</strong>
                <em className={index.change.startsWith('+') ? 'positive' : 'negative'}>{index.change}</em>
              </span>
            ))}
            <span className="data-time">Data as of 10:42:31 IST</span>
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
              <strong className="metric-value">3 <small>of 6</small></strong>
              <span className="metric-note positive-note"><ArrowUpRight size={14} /> 2 strong · 1 developing</span>
            </article>
            <article className="summary-card">
              <div className="summary-topline">
                <span className="metric-icon amber"><ShieldCheck size={17} /></span>
                <span className="metric-label">Daily risk budget</span>
                <span className="metric-percent">{riskUsed.toFixed(0)}%</span>
              </div>
              <strong className="metric-value">{inr(maxModeledLoss)} <small>modeled</small></strong>
              <div className="risk-progress"><span style={{ width: `${riskUsed}%` }} /></div>
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
                candles={selected.candles}
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
                    <div><span>Missing</span><strong>Volume confirmation</strong></div>
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
                  onClick={() => setOrderReview(selected)}
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
              <span className="section-meta">6 liquid equities screened · 3 passed</span>
            </div>
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
                            setOrderReview(item.signal)
                          }}
                        >Review <ChevronRight size={14} /></button>
                      </div>
                    )
                  })}
                  {allocations.length === 0 && (
                    <div className="allocation-empty">
                      <TriangleAlert size={19} /> Capital is below the price and risk requirements for the current setups.
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
                    className="risk-gauge"
                    style={{ '--risk': `${riskUsed * 1.8}deg` } as CSSProperties}
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
                  <strong><SignalBadge action={selected.action} /> {selected.score}/100</strong>
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
                    <strong>{selected.score}<small>/100</small></strong>
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
                        ? 'BUY requires ≥70 points and every required entry gate to pass.'
                        : selected.action === 'EXIT'
                          ? 'EXIT requires bearish pressure ≥70 and a recorded long holding. It never opens a short.'
                          : 'WAIT is returned when the score is below 70 or a required entry gate fails.'}
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
                            if (quote.action === 'EXIT') setOrderReview(quote)
                            else setToast(`No validated exit setup for ${quote.symbol}`)
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
            <div className="notification-list">
              {notifications.map((notification) => (
                <button className="notification-item" key={notification.id} onClick={() => setNotificationsOpen(false)}>
                  <span className={`notification-tone ${notification.tone}`} />
                  <span><strong>{notification.title}</strong><p>{notification.detail}</p><small>{notification.time}</small></span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
            <div className="drawer-footnote"><ShieldCheck size={16} /><p>Notifications always open the review screen. They never place an order.</p></div>
          </aside>
        </>
      )}

      {orderReview && (
        <div className="modal-layer" role="presentation">
          <button className="modal-backdrop" onClick={() => setOrderReview(null)} aria-label="Close order review" />
          <section className="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-title">
            <div className="modal-header">
              <span className={orderReview.action === 'EXIT' ? 'modal-icon exit' : 'modal-icon'}>
                {orderReview.action === 'EXIT' ? <ArrowDownRight size={21} /> : <ArrowUpRight size={21} />}
              </span>
              <div><p className="eyebrow">Simulated execution</p><h2 id="order-title">Review paper {orderReview.action === 'EXIT' ? 'exit' : 'buy'}</h2></div>
              <button className="icon-button" onClick={() => setOrderReview(null)} aria-label="Close order review"><X size={19} /></button>
            </div>
            <div className="order-security">
              <span className="stock-monogram">{orderReview.symbol.slice(0, 2)}</span>
              <span><strong>{orderReview.symbol}</strong><small>{orderReview.company} · NSE</small></span>
              <SignalBadge action={orderReview.action} />
            </div>
            <div className="order-summary-grid">
              <div><span>Quantity</span><strong>{orderQuantity} shares</strong></div>
              <div><span>Reference price</span><strong>{inr(entryPrice, 2)}</strong></div>
              <div><span>Order value</span><strong>{inr(orderQuantity * entryPrice, 2)}</strong></div>
              <div><span>{orderReview.action === 'EXIT' ? 'Estimated P&L' : 'Maximum modeled loss'}</span><strong className={orderReview.action === 'EXIT' ? 'text-exit' : ''}>
                {orderReview.action === 'EXIT' && activePosition
                  ? inr((entryPrice - activePosition.averagePrice) * activePosition.quantity, 2)
                  : inr(selectedMaxLoss, 2)}
              </strong></div>
            </div>
            {orderReview.action !== 'EXIT' && (
              <div className="order-level-line"><span>Protective stop <strong>{inr(orderReview.stopLoss, 2)}</strong></span><span>Indicative exit <strong>{inr(orderReview.target, 2)}</strong></span></div>
            )}
            <div className="paper-warning"><ShieldCheck size={17} /><p><strong>Paper mode only.</strong> This records a simulated fill and never connects to a broker or exchange.</p></div>
            <label className="review-check"><input type="checkbox" defaultChecked /><span>I reviewed quantity, price, stop and modeled risk.</span></label>
            <button className={orderReview.action === 'EXIT' ? 'button full-width danger-button' : 'button full-width primary'} onClick={confirmPaperOrder} disabled={orderQuantity <= 0}>
              <CheckCircle2 size={17} /> Confirm simulated {orderReview.action === 'EXIT' ? 'exit' : 'buy'}
            </button>
            <button className="text-button" onClick={() => setOrderReview(null)}>Cancel</button>
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
              <div><span>01</span><p><strong>Trend & momentum</strong>EMA alignment, RSI, opening range and price versus VWAP.</p></div>
              <div><span>02</span><p><strong>Participation</strong>Volume expansion, liquidity and sector-relative strength.</p></div>
              <div><span>03</span><p><strong>Context check</strong>Verified announcements and time-stamped news act as context or a veto.</p></div>
              <div><span>04</span><p><strong>Risk & sizing</strong>Whole-share quantity is limited by capital, stop distance and daily loss budget.</p></div>
            </div>
            <div className="decision-thresholds">
              <div className="buy"><span>BUY</span><strong>70–100</strong><small>All required gates pass</small></div>
              <div className="wait"><span>WAIT</span><strong>45–69</strong><small>Or any entry gate fails</small></div>
              <div className="avoid"><span>AVOID</span><strong>0–44</strong><small>No actionable edge</small></div>
              <div className="exit"><span>EXIT</span><strong>≥70 bearish</strong><small>Only against a held long</small></div>
            </div>
            <p className="formula-line">Score = 25% trend + 20% momentum + 15% volume/liquidity + 15% market/sector + 10% news/events + 10% peer fundamentals + 5% risk quality.</p>
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
