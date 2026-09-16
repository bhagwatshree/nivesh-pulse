// Tracks what today's signal notifications would actually have earned if
// acted on promptly — a "shadow P&L" journal, not the paper-order P&L
// (which only reflects orders the user actually confirmed). This is the
// mark-to-market variant: price at the moment the signal fired vs. price
// exactly 5 minutes later (the app's existing signal-validity window),
// not a full target/stop simulation.

export type ResolvableAction = 'BUY' | 'EXIT'

export interface SignalNotification {
  id: string
  symbol: string
  company: string
  action: 'BUY' | 'WATCH' | 'EXIT'
  detail: string
  firedAt: number
  priceAtFire: number
  /** Reference quantity for the hypothetical trade — 0 for WATCH or when nothing was sizeable. */
  quantity: number
  resolveAt: number
  status: 'pending' | 'resolved' | 'not-applicable'
  priceAtResolve?: number
  pnl?: number
}

export const RESOLUTION_WINDOW_MS = 5 * 60 * 1000

/**
 * The sign flips between BUY and EXIT on purpose: a BUY notification asks
 * "did price rise after this fired" (good if yes), while an EXIT
 * notification asks "did exiting when it fired protect you from a further
 * fall" (good if price kept dropping after you'd have sold).
 */
export function computeSignalPnl(
  action: ResolvableAction,
  priceAtFire: number,
  priceAtResolve: number,
  quantity: number,
): number {
  if (quantity <= 0) return 0
  return action === 'BUY' ? (priceAtResolve - priceAtFire) * quantity : (priceAtFire - priceAtResolve) * quantity
}
