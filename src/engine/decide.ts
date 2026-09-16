import type { GateResult } from './gates'
import { firstBlockingGate } from './gates'
import type { RiskPolicy } from './policy'

// Deliberately shaped to mirror DATA_AND_DECISION_SPEC.md section 4's
// pseudocode branch-for-branch, so the two can be compared by eye:
//
//   if required data is stale, missing, or operationally unsafe:
//       NO SIGNAL (shown as WAIT with the blocking reason)
//   else if a long position exists and a stop, invalidation, severe event,
//           daily kill switch, or end-of-day rule is triggered:
//       EXIT (sell only the held quantity; never reverse short)
//   else if no position exists and score >= 70 and every entry gate passes:
//       BUY
//   else:
//       WAIT

export type WaitReason =
  | { kind: 'NO_SIGNAL'; detail: string }
  | { kind: 'BELOW_THRESHOLD'; score: number; threshold: number }
  | { kind: 'GATE_FAILED'; gate: string; detail: string }
  | { kind: 'POSITION_HELD'; detail: string }

export type Decision =
  | { action: 'BUY'; score: number; gates: GateResult[] }
  | { action: 'EXIT'; score: number; heldQuantity: number; detail: string; gates: GateResult[] }
  | { action: 'WAIT'; score: number; reason: WaitReason; gates: GateResult[] }

export interface DecisionInput {
  score: number
  /** Entry gates: freshness, liquidity, circuit/halt, event veto, entry confirmation, etc. */
  gates: GateResult[]
  /** Whole shares currently held for this symbol (0 if no position). */
  heldQuantity: number
  /** True if a stop, invalidation, severe event, kill switch, or EOD rule fired. */
  exitTriggered: boolean
  exitDetail?: string
  /** Set when required data is stale, missing, or operationally unsafe. Forces NO_SIGNAL. */
  dataUnsafe?: { detail: string }
}

export function decide(input: DecisionInput, policy: RiskPolicy): Decision {
  // 1. if required data is stale, missing, or operationally unsafe: NO SIGNAL
  if (input.dataUnsafe) {
    return {
      action: 'WAIT',
      score: input.score,
      reason: { kind: 'NO_SIGNAL', detail: input.dataUnsafe.detail },
      gates: input.gates,
    }
  }

  // 2. else if a long position exists and an exit condition is triggered: EXIT
  if (input.heldQuantity > 0 && input.exitTriggered) {
    return {
      action: 'EXIT',
      score: input.score,
      heldQuantity: input.heldQuantity,
      detail: input.exitDetail ?? 'Exit condition triggered.',
      gates: input.gates,
    }
  }

  // 3. else if no position exists and score >= threshold and every entry gate passes: BUY
  if (input.heldQuantity === 0) {
    const blocking = firstBlockingGate(input.gates)
    if (blocking) {
      return {
        action: 'WAIT',
        score: input.score,
        reason: { kind: 'GATE_FAILED', gate: blocking.label, detail: blocking.detail },
        gates: input.gates,
      }
    }
    if (input.score >= policy.buyThreshold) {
      return { action: 'BUY', score: input.score, gates: input.gates }
    }
    return {
      action: 'WAIT',
      score: input.score,
      reason: { kind: 'BELOW_THRESHOLD', score: input.score, threshold: policy.buyThreshold },
      gates: input.gates,
    }
  }

  // 4. else: WAIT — a position is held but no exit condition fired. Bearish
  // evidence alone is never enough to open a short (spec section 4).
  return {
    action: 'WAIT',
    score: input.score,
    reason: { kind: 'POSITION_HELD', detail: 'Position is held; no exit condition has triggered.' },
    gates: input.gates,
  }
}
