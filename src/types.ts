export type SignalAction = 'BUY' | 'WATCH' | 'EXIT'

export interface Candle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface SignalFactor {
  label: string
  value: string
  tone: 'positive' | 'neutral' | 'negative'
}

export interface StockSignal {
  symbol: string
  company: string
  sector: string
  exchange: 'NSE'
  price: number
  changePercent: number
  action: SignalAction
  score: number
  entryLow: number
  entryHigh: number
  target: number
  stopLoss: number
  weight: number
  horizon: string
  riskReward: string
  updatedAt: string
  thesis: string
  caution: string
  catalyst: string
  factors: SignalFactor[]
  candles: Candle[]
}

export interface Allocation {
  signal: StockSignal
  quantity: number
  amount: number
  percent: number
}

export interface Position {
  symbol: string
  quantity: number
  averagePrice: number
  openedAt: string
  /**
   * Snapshotted from the signal at buy time, not re-derived live — a
   * live, price-relative stop (price - k*ATR) sits below current price
   * by construction and would never trigger if recomputed every render.
   */
  stopLoss: number
  target: number
}

export interface PaperOrder {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  createdAt: Date
  status: 'Queued' | 'Filled'
}

export interface DecisionContribution {
  label: string
  score: number
  maxScore: number
  detail: string
  source: 'market' | 'news' | 'events' | 'fundamentals' | 'risk'
}

export interface DecisionCheck {
  label: string
  passed: boolean
  detail: string
}

export interface PeerMetric {
  label: string
  percentile: number
  assessment: string
  tone: 'positive' | 'neutral' | 'negative'
}

/** Real corporate action from Upstox's official Corporate Actions API — see scripts/run-screener-scan.ts. */
export interface CorporateAction {
  name: string
  expiryDate: string
  amount: number | null
  ratio: string | null
}

/** Real news article from Upstox's official News API — see scripts/run-screener-scan.ts. */
export interface NewsArticle {
  heading: string
  summary: string
  articleLink: string
  publishedAtMs: number
}

export interface DecisionProfile {
  components: DecisionContribution[]
  checks: DecisionCheck[]
  peerGroup: string
  peerMetrics: PeerMetric[]
  /**
   * Real corporate actions/news for this symbol, shown as informational
   * context — deliberately not folded into `components`' scored "News &
   * events" category, which stays honestly "not available" there (see
   * src/engine/liveSignal.ts): turning a headline or a dividend
   * announcement into a 0-10 point value would be fabricated judgment,
   * not a genuine measurement. Absent/empty when nothing was fetched.
   */
  newsEvents?: { corporateActions: CorporateAction[]; news: NewsArticle[] }
}
