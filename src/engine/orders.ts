import type { RiskPolicy } from './policy'

export interface HeldPosition {
  symbol: string
  quantity: number
}

export interface OrderCandidate {
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
}

export interface PolicyResult {
  allowed: boolean
  reason?: string
}

/**
 * Order-time enforcement of spec section 6's guardrails: at most
 * policy.maxPositions concurrent names, and the portfolio never averages
 * down. size.ts's allocate() enforces these when building a plan; this is
 * the second check at the moment an order is actually confirmed, since a
 * plan can go stale between being shown and being acted on (price moved,
 * another position opened in the meantime).
 */
export function canPlaceOrder(order: OrderCandidate, positions: HeldPosition[], policy: RiskPolicy): PolicyResult {
  if (order.quantity <= 0) {
    return { allowed: false, reason: 'Quantity must be a positive whole number.' }
  }

  // Exits are always allowed — spec section 4: EXIT protects capital and
  // is never itself the thing a risk gate should block.
  if (order.side === 'SELL') {
    return { allowed: true }
  }

  const existing = positions.find((p) => p.symbol === order.symbol && p.quantity > 0)
  if (existing && !policy.allowAveragingDown) {
    return { allowed: false, reason: 'A position is already held in this symbol; averaging down is not permitted.' }
  }

  if (!existing) {
    const distinctHeldSymbols = new Set(positions.filter((p) => p.quantity > 0).map((p) => p.symbol)).size
    if (distinctHeldSymbols >= policy.maxPositions) {
      return { allowed: false, reason: `Already holding the maximum of ${policy.maxPositions} positions.` }
    }
  }

  return { allowed: true }
}
