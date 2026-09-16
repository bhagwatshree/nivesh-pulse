import type { Allocation, StockSignal } from '../types'

export function buildAllocation(allSignals: StockSignal[], capital: number): Allocation[] {
  const eligible = allSignals.filter((signal) => signal.action === 'BUY' && signal.weight > 0)
  if (capital <= 0 || eligible.length === 0) return []

  const quantities = new Map<string, number>()
  const limits = new Map<string, number>()
  let spent = 0

  for (const signal of eligible) {
    const targetAmount = capital * (signal.weight / 100)
    const entry = (signal.entryLow + signal.entryHigh) / 2
    const perShareRisk = Math.max(0.01, entry - signal.stopLoss)
    const maxByRisk = Math.floor((capital * 0.0035) / perShareRisk)
    const maxByPosition = Math.floor((capital * 0.4) / signal.price)
    const limit = Math.max(0, Math.min(maxByRisk, maxByPosition))
    const quantity = Math.min(Math.floor(targetAmount / signal.price), limit)
    limits.set(signal.symbol, limit)
    quantities.set(signal.symbol, quantity)
    spent += quantity * signal.price
  }

  let remaining = capital - spent
  let safety = 0
  while (safety < 100) {
    const affordable = eligible
      .filter(
        (signal) =>
          signal.price <= remaining &&
          (quantities.get(signal.symbol) ?? 0) < (limits.get(signal.symbol) ?? 0),
      )
      .sort((a, b) => {
        const aAmount = (quantities.get(a.symbol) ?? 0) * a.price
        const bAmount = (quantities.get(b.symbol) ?? 0) * b.price
        const aGap = a.weight / 100 - aAmount / capital
        const bGap = b.weight / 100 - bAmount / capital
        return bGap - aGap
      })

    if (affordable.length === 0) break
    const next = affordable[0]
    quantities.set(next.symbol, (quantities.get(next.symbol) ?? 0) + 1)
    remaining -= next.price
    safety += 1
  }

  return eligible
    .map((signal) => {
      const quantity = quantities.get(signal.symbol) ?? 0
      const amount = quantity * signal.price
      return {
        signal,
        quantity,
        amount,
        percent: capital > 0 ? (amount / capital) * 100 : 0,
      }
    })
    .filter((item) => item.quantity > 0)
}

export const inr = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits,
  }).format(value)

export const compactNumber = (value: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
