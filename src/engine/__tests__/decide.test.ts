import { describe, expect, it } from 'vitest'
import type { GateResult } from '../gates'
import { decide } from '../decide'
import { DEFAULT_POLICY } from '../policy'

const passingGates: GateResult[] = [
  { label: 'Feed freshness', status: 'PASS', detail: 'ok' },
  { label: 'Liquidity & spread', status: 'PASS', detail: 'ok' },
]

describe('decide', () => {
  it('returns WAIT/NO_SIGNAL when data is unsafe, regardless of score', () => {
    const result = decide(
      { score: 100, gates: passingGates, heldQuantity: 0, exitTriggered: false, dataUnsafe: { detail: 'stale quote' } },
      DEFAULT_POLICY,
    )
    expect(result.action).toBe('WAIT')
    if (result.action === 'WAIT') expect(result.reason.kind).toBe('NO_SIGNAL')
  })

  it('returns WAIT/GATE_FAILED when score clears the threshold but a required gate fails', () => {
    const gates: GateResult[] = [...passingGates, { label: 'Entry confirmation', status: 'FAIL', detail: 'no close above VWAP' }]
    const result = decide({ score: 95, gates, heldQuantity: 0, exitTriggered: false }, DEFAULT_POLICY)
    expect(result.action).toBe('WAIT')
    if (result.action === 'WAIT' && result.reason.kind === 'GATE_FAILED') {
      expect(result.reason.gate).toBe('Entry confirmation')
    } else {
      throw new Error('expected GATE_FAILED')
    }
  })

  it('a score of exactly the threshold with passing gates is BUY', () => {
    const result = decide(
      { score: DEFAULT_POLICY.buyThreshold, gates: passingGates, heldQuantity: 0, exitTriggered: false },
      DEFAULT_POLICY,
    )
    expect(result.action).toBe('BUY')
  })

  it('one point below threshold with passing gates is WAIT/BELOW_THRESHOLD', () => {
    const result = decide(
      { score: DEFAULT_POLICY.buyThreshold - 1, gates: passingGates, heldQuantity: 0, exitTriggered: false },
      DEFAULT_POLICY,
    )
    expect(result.action).toBe('WAIT')
    if (result.action === 'WAIT') expect(result.reason.kind).toBe('BELOW_THRESHOLD')
  })

  it('never returns EXIT when nothing is held, even with high bearish score and exitTriggered', () => {
    const result = decide({ score: 79, gates: passingGates, heldQuantity: 0, exitTriggered: true }, DEFAULT_POLICY)
    expect(result.action).not.toBe('EXIT')
  })

  it('returns EXIT for exactly the held quantity when a position exists and exit is triggered', () => {
    const result = decide(
      { score: 79, gates: passingGates, heldQuantity: 3, exitTriggered: true, exitDetail: 'stop breached' },
      DEFAULT_POLICY,
    )
    expect(result.action).toBe('EXIT')
    if (result.action === 'EXIT') {
      expect(result.heldQuantity).toBe(3)
      expect(result.detail).toBe('stop breached')
    }
  })

  it('holding a position with no exit trigger is WAIT/POSITION_HELD, never a fresh BUY', () => {
    const result = decide({ score: 95, gates: passingGates, heldQuantity: 5, exitTriggered: false }, DEFAULT_POLICY)
    expect(result.action).toBe('WAIT')
    if (result.action === 'WAIT') expect(result.reason.kind).toBe('POSITION_HELD')
  })

  it('dataUnsafe takes priority over an active exit trigger', () => {
    const result = decide(
      { score: 90, gates: passingGates, heldQuantity: 2, exitTriggered: true, dataUnsafe: { detail: 'clock desync' } },
      DEFAULT_POLICY,
    )
    expect(result.action).toBe('WAIT')
    if (result.action === 'WAIT') expect(result.reason.kind).toBe('NO_SIGNAL')
  })
})
