import type { DecisionContribution, DecisionProfile, StockSignal } from '../types'

/** Sums a decision profile's weighted evidence components. */
export function totalScore(components: DecisionContribution[]): number {
  return components.reduce((sum, component) => sum + component.score, 0)
}

/** Sums the declared maximum points across evidence families (spec section 4: 100). */
export function maxPossibleScore(components: DecisionContribution[]): number {
  return components.reduce((sum, component) => sum + component.maxScore, 0)
}

export class ScoreMismatchError extends Error {
  constructor(symbol: string, declared: number, computed: number) {
    super(`${symbol}: declared score ${declared} does not equal the sum of its components (${computed})`)
    this.name = 'ScoreMismatchError'
  }
}

/**
 * Guards against the score shown on a signal silently drifting from the sum
 * of its own evidence components (previously unverified — defect: hand-authored
 * fixtures with no assertion that they agreed with each other).
 */
export function assertScoreConsistent(signal: StockSignal, profile: DecisionProfile): void {
  const computed = totalScore(profile.components)
  if (computed !== signal.score) {
    throw new ScoreMismatchError(signal.symbol, signal.score, computed)
  }
}
