import type { StockSignal } from '../../types'
import type { QuoteSnapshot } from './mappers'

/**
 * Overlays live last-traded price and day change onto the fixture signals.
 * Deliberately leaves every decision-engine field untouched — score,
 * entry/target/stop, thesis, factors — those remain the documented
 * v0.3-demo synthetic baseline until the tested engine in src/engine/ is
 * wired in (see docs/IMPLEMENTATION_PLAN.md Phase 2). Price and
 * changePercent are the only fields a live quote can correct without
 * silently re-deriving a decision this app hasn't actually recomputed.
 */
export function mergeLiveQuotes(signals: StockSignal[], liveBySymbol: Record<string, QuoteSnapshot>): StockSignal[] {
  return signals.map((signal) => {
    const live = liveBySymbol[signal.symbol]
    if (!live) return signal
    const changePercent =
      typeof live.close === 'number' && live.close > 0
        ? ((live.lastPrice - live.close) / live.close) * 100
        : signal.changePercent
    return { ...signal, price: live.lastPrice, changePercent }
  })
}
