import { describe, expect, it } from 'vitest'
import { DEFAULT_COST_RATES, edgeSurvivesCosts, roundTripCosts } from '../costs'

describe('roundTripCosts', () => {
  it('is zero for zero quantity', () => {
    expect(roundTripCosts(100, 105, 0).total).toBe(0)
  })

  it('is strictly positive for any non-zero quantity', () => {
    const costs = roundTripCosts(100, 105, 10)
    expect(costs.total).toBeGreaterThan(0)
    expect(costs.brokerage).toBeGreaterThan(0)
    expect(costs.stt).toBeGreaterThan(0)
  })

  it('scales roughly linearly with quantity for the percentage-based charges', () => {
    const one = roundTripCosts(100, 105, 10)
    const ten = roundTripCosts(100, 105, 100)
    // Brokerage is flat per order, so total won't be exactly 10x, but the
    // percentage-based components (stt, exchangeTxn, stampDuty) should be.
    expect(ten.stt).toBeCloseTo(one.stt * 10, 6)
    expect(ten.stampDuty).toBeCloseTo(one.stampDuty * 10, 6)
  })

  it('GST is applied to brokerage + exchange charges + SEBI fees, not to trade value', () => {
    const costs = roundTripCosts(1000, 1010, 5, DEFAULT_COST_RATES)
    const expectedGst = (costs.brokerage + costs.exchangeTxn + costs.sebiFees) * DEFAULT_COST_RATES.gstPct
    expect(costs.gst).toBeCloseTo(expectedGst, 6)
  })
})

describe('edgeSurvivesCosts', () => {
  it('rejects a setup whose gross edge is smaller than modeled round-trip costs', () => {
    // 1 share, 1 paisa of edge: costs will dwarf it.
    expect(edgeSurvivesCosts(100, 100.01, 1)).toBe(false)
  })

  it('accepts a setup with a comfortably large edge and reasonable size', () => {
    expect(edgeSurvivesCosts(1000, 1050, 20)).toBe(true)
  })

  it('rejects zero or negative quantity', () => {
    expect(edgeSurvivesCosts(100, 110, 0)).toBe(false)
    expect(edgeSurvivesCosts(100, 110, -5)).toBe(false)
  })
})
