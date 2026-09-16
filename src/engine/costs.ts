import type { GateResult } from './gates'

// Indian cash-equity intraday round-trip cost model.
//
// IMPORTANT: the rates in DEFAULT_COST_RATES are illustrative placeholders,
// not a verified regulatory or brokerage schedule. STT, exchange transaction
// charges, SEBI fees, GST and stamp duty all change by government/exchange
// notification, and brokerage varies by broker. Before this module is
// allowed to drive the spec section 4 "expected edge remains positive after
// costs" hard gate, have someone confirm current rates against the
// broker's published tariff and the exchange/SEBI circulars in force, and
// update RATES_AS_OF below.
//
// What is NOT a placeholder: the shape of the calculation (which side each
// charge applies to, and that GST applies to brokerage + exchange charges,
// not to the trade value) — that structure is stable even when rates move.

export const RATES_AS_OF = 'unverified-placeholder'

export interface CostRates {
  /** Flat brokerage per executed order (charged on both the buy and the sell leg). */
  brokeragePerOrder: number
  /** Securities Transaction Tax — intraday equity: sell leg only. */
  sttSellPct: number
  /** Exchange transaction charges — both legs. */
  exchangeTxnPct: number
  /** SEBI turnover fees — both legs. */
  sebiFeesPct: number
  /** GST on (brokerage + exchange transaction charges + SEBI fees). */
  gstPct: number
  /** Stamp duty — buy leg only. */
  stampDutyBuyPct: number
  /** Modeled slippage vs. the reference price, applied to both legs' traded value. */
  slippageBps: number
}

export const DEFAULT_COST_RATES: CostRates = {
  brokeragePerOrder: 20,
  sttSellPct: 0.00025,
  exchangeTxnPct: 0.0000297,
  sebiFeesPct: 0.0000001,
  gstPct: 0.18,
  stampDutyBuyPct: 0.00003,
  slippageBps: 5,
}

export interface CostBreakdown {
  brokerage: number
  stt: number
  exchangeTxn: number
  sebiFees: number
  gst: number
  stampDuty: number
  slippage: number
  total: number
}

const zeroed = (): CostBreakdown => ({
  brokerage: 0,
  stt: 0,
  exchangeTxn: 0,
  sebiFees: 0,
  gst: 0,
  stampDuty: 0,
  slippage: 0,
  total: 0,
})

/** Round-trip cost of buying `quantity` at `entryPrice` and selling at `exitPrice`. */
export function roundTripCosts(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  rates: CostRates = DEFAULT_COST_RATES,
): CostBreakdown {
  if (quantity <= 0 || entryPrice <= 0 || exitPrice <= 0) return zeroed()

  const buyValue = entryPrice * quantity
  const sellValue = exitPrice * quantity

  const brokerage = rates.brokeragePerOrder * 2
  const stt = sellValue * rates.sttSellPct
  const exchangeTxn = (buyValue + sellValue) * rates.exchangeTxnPct
  const sebiFees = (buyValue + sellValue) * rates.sebiFeesPct
  const gst = (brokerage + exchangeTxn + sebiFees) * rates.gstPct
  const stampDuty = buyValue * rates.stampDutyBuyPct
  const slippage = (buyValue + sellValue) * (rates.slippageBps / 10_000)

  const total = brokerage + stt + exchangeTxn + sebiFees + gst + stampDuty + slippage

  return { brokerage, stt, exchangeTxn, sebiFees, gst, stampDuty, slippage, total }
}

/** True if the modeled edge (target - entry) survives round-trip costs at this size. */
export function edgeSurvivesCosts(
  entryPrice: number,
  targetPrice: number,
  quantity: number,
  rates: CostRates = DEFAULT_COST_RATES,
): boolean {
  if (quantity <= 0) return false
  const grossEdge = (targetPrice - entryPrice) * quantity
  const costs = roundTripCosts(entryPrice, targetPrice, quantity, rates)
  return grossEdge > costs.total
}

/**
 * Spec section 4's "expected edge remains positive after costs" as an
 * entry gate: given the quantity current capital would actually buy, does
 * the modeled move to target clear round-trip costs? A quantity of 0
 * (capital too small for even one share) is UNAVAILABLE rather than FAIL —
 * there's no trade to evaluate costs against, as distinct from a real trade
 * that's sized but still a net loser after costs.
 */
export function costGate(
  entryPrice: number,
  targetPrice: number,
  quantity: number,
  rates: CostRates = DEFAULT_COST_RATES,
): GateResult {
  if (quantity <= 0) {
    return {
      label: 'Cost-adjusted edge',
      status: 'UNAVAILABLE',
      detail: 'No sizeable quantity at current capital.',
    }
  }
  const survives = edgeSurvivesCosts(entryPrice, targetPrice, quantity, rates)
  const costs = roundTripCosts(entryPrice, targetPrice, quantity, rates)
  const grossEdge = (targetPrice - entryPrice) * quantity
  return {
    label: 'Cost-adjusted edge',
    status: survives ? 'PASS' : 'FAIL',
    detail: survives
      ? `Modeled edge Rs${grossEdge.toFixed(2)} clears round-trip costs of Rs${costs.total.toFixed(2)}.`
      : `Modeled edge Rs${grossEdge.toFixed(2)} does not clear round-trip costs of Rs${costs.total.toFixed(2)}.`,
  }
}
