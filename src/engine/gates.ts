import type { DecisionCheck } from '../types'

export type GateStatus = 'PASS' | 'FAIL' | 'UNAVAILABLE'

export interface GateResult {
  label: string
  status: GateStatus
  detail: string
}

/**
 * Bridges the current UI's boolean DecisionCheck to the three-state gate
 * status spec section 7 actually requires ("passed, failed, or were
 * unavailable"). A boolean cannot express UNAVAILABLE, which spec section 2
 * says must block a new trade exactly like a hard FAIL. Once DecisionCheck
 * itself carries a status (Phase 3), this adapter goes away.
 */
export function toGateResult(check: DecisionCheck): GateResult {
  return { label: check.label, status: check.passed ? 'PASS' : 'FAIL', detail: check.detail }
}

export function evaluateGates(checks: DecisionCheck[]): GateResult[] {
  return checks.map(toGateResult)
}

/** The first gate that is not PASS, or undefined if every gate passes. */
export function firstBlockingGate(gates: GateResult[]): GateResult | undefined {
  return gates.find((gate) => gate.status !== 'PASS')
}

export function allGatesPass(gates: GateResult[]): boolean {
  return firstBlockingGate(gates) === undefined
}
