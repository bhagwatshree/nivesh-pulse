import type { Allocation, StockSignal } from '../types'
import type { RiskPolicy } from './policy'

export interface PolicyBreach {
  kind: 'DAILY_RISK_BUDGET' | 'POSITION_CAP'
  detail: string
}

export interface AllocationPlan {
  allocations: Allocation[]
  invested: number
  unallocated: number
  /** Sum of (entry - stop) * quantity across the plan. */
  totalModeledRisk: number
  riskBudget: number
  /** Uncapped: a value over 100 is a real breach, not something to clamp away. */
  riskUtilisationPct: number
  breaches: PolicyBreach[]
  /** Eligible BUY signals that did not fit within policy.maxPositions. */
  droppedForPositionCap: string[]
}

const emptyPlan = (capital: number, riskBudget: number): AllocationPlan => ({
  allocations: [],
  invested: 0,
  unallocated: Math.max(0, capital),
  totalModeledRisk: 0,
  riskBudget,
  riskUtilisationPct: 0,
  breaches: [],
  droppedForPositionCap: [],
})

/**
 * Whole-share allocator that enforces, rather than merely displays, the
 * spec section 6 guardrails: at most policy.maxPositions names, and total
 * modeled risk across the whole plan never exceeds the daily loss budget.
 *
 * Selection order (score desc, then weight desc, then symbol) is
 * deterministic so the same inputs always produce the same plan.
 */
export function allocate(allSignals: StockSignal[], capital: number, policy: RiskPolicy): AllocationPlan {
  const riskBudget = capital * policy.dailyLossBudgetPct
  if (capital <= 0) return emptyPlan(capital, riskBudget)

  const eligible = allSignals
    .filter((signal) => signal.action === 'BUY' && signal.weight > 0)
    .slice()
    .sort((a, b) => b.score - a.score || b.weight - a.weight || a.symbol.localeCompare(b.symbol))

  if (eligible.length === 0) return emptyPlan(capital, riskBudget)

  const selected = eligible.slice(0, policy.maxPositions)
  const droppedForPositionCap = eligible.slice(policy.maxPositions).map((signal) => signal.symbol)

  const quantities = new Map<string, number>()
  const limits = new Map<string, number>()
  const perShareRisk = new Map<string, number>()
  let spent = 0
  let modeledRisk = 0

  // Initial pass: size each selected signal toward its target weight, capped
  // by per-setup risk, per-position cash, and whatever portfolio risk budget
  // remains after the signals sized ahead of it in this same pass.
  for (const signal of selected) {
    const entry = (signal.entryLow + signal.entryHigh) / 2
    const risk = Math.max(0.01, entry - signal.stopLoss)
    perShareRisk.set(signal.symbol, risk)

    const remainingRiskBudget = Math.max(0, riskBudget - modeledRisk)
    const maxByPortfolioRisk = Math.floor(remainingRiskBudget / risk)
    const maxBySetupRisk = Math.floor((capital * policy.riskPerSetupPct) / risk)
    const maxByPosition = Math.floor((capital * policy.maxPositionPct) / signal.price)
    const limit = Math.max(0, Math.min(maxByPortfolioRisk, maxBySetupRisk, maxByPosition))

    const targetAmount = capital * (signal.weight / 100)
    const quantity = Math.min(Math.floor(targetAmount / signal.price), limit)

    limits.set(signal.symbol, limit)
    quantities.set(signal.symbol, quantity)
    spent += quantity * signal.price
    modeledRisk += quantity * risk
  }

  // Top-up pass: spend whatever cash remains toward whichever selected name
  // is furthest below its target weight, never exceeding its own limit and
  // never pushing modeledRisk past the portfolio risk budget. Bounded by the
  // sum of each name's remaining headroom under its own limit, which is
  // finite and computable up front — no arbitrary iteration ceiling.
  let remaining = capital - spent
  const topUpCeiling = selected.reduce(
    (sum, signal) => sum + (limits.get(signal.symbol) ?? 0) - (quantities.get(signal.symbol) ?? 0),
    0,
  )
  let topUpsUsed = 0

  while (topUpsUsed < topUpCeiling) {
    const affordable = selected.filter((signal) => {
      const risk = perShareRisk.get(signal.symbol) ?? 0
      const quantity = quantities.get(signal.symbol) ?? 0
      const limit = limits.get(signal.symbol) ?? 0
      return signal.price <= remaining && quantity < limit && modeledRisk + risk <= riskBudget
    })
    if (affordable.length === 0) break

    const next = affordable.sort((a, b) => {
      const aAmount = (quantities.get(a.symbol) ?? 0) * a.price
      const bAmount = (quantities.get(b.symbol) ?? 0) * b.price
      const aGap = a.weight / 100 - aAmount / capital
      const bGap = b.weight / 100 - bAmount / capital
      return bGap - aGap
    })[0]

    quantities.set(next.symbol, (quantities.get(next.symbol) ?? 0) + 1)
    remaining -= next.price
    modeledRisk += perShareRisk.get(next.symbol) ?? 0
    topUpsUsed += 1
  }

  const allocations: Allocation[] = selected
    .map((signal) => {
      const quantity = quantities.get(signal.symbol) ?? 0
      const amount = quantity * signal.price
      return { signal, quantity, amount, percent: capital > 0 ? (amount / capital) * 100 : 0 }
    })
    .filter((item) => item.quantity > 0)

  const invested = allocations.reduce((sum, item) => sum + item.amount, 0)
  const riskUtilisationPct = riskBudget > 0 ? (modeledRisk / riskBudget) * 100 : 0

  const breaches: PolicyBreach[] = []
  // Tolerance guards against floating-point noise, not a real slack in the budget.
  if (modeledRisk > riskBudget + 1e-6) {
    breaches.push({
      kind: 'DAILY_RISK_BUDGET',
      detail: `Modeled risk ${modeledRisk.toFixed(2)} exceeds the daily budget ${riskBudget.toFixed(2)}.`,
    })
  }
  if (droppedForPositionCap.length > 0) {
    breaches.push({
      kind: 'POSITION_CAP',
      detail: `${droppedForPositionCap.length} eligible setup(s) not funded by the ${policy.maxPositions}-position cap: ${droppedForPositionCap.join(', ')}.`,
    })
  }

  return {
    allocations,
    invested,
    unallocated: Math.max(0, capital - invested),
    totalModeledRisk: modeledRisk,
    riskBudget,
    riskUtilisationPct,
    breaches,
    droppedForPositionCap,
  }
}
