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

export interface DecisionProfile {
  components: DecisionContribution[]
  checks: DecisionCheck[]
  peerGroup: string
  peerMetrics: PeerMetric[]
}
