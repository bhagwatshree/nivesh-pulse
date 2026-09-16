import { describe, expect, it } from 'vitest'
import { canPlaceOrder } from '../orders'
import { DEFAULT_POLICY } from '../policy'

describe('canPlaceOrder', () => {
  it('rejects zero or negative quantity', () => {
    expect(canPlaceOrder({ symbol: 'RELIANCE', side: 'BUY', quantity: 0 }, [], DEFAULT_POLICY).allowed).toBe(false)
    expect(canPlaceOrder({ symbol: 'RELIANCE', side: 'BUY', quantity: -1 }, [], DEFAULT_POLICY).allowed).toBe(false)
  })

  it('always allows a SELL (exit), regardless of position/cap state', () => {
    const result = canPlaceOrder({ symbol: 'SBIN', side: 'SELL', quantity: 3 }, [], DEFAULT_POLICY)
    expect(result.allowed).toBe(true)
  })

  it('rejects a BUY on a symbol already held (no averaging down)', () => {
    const positions = [{ symbol: 'RELIANCE', quantity: 2 }]
    const result = canPlaceOrder({ symbol: 'RELIANCE', side: 'BUY', quantity: 1 }, positions, DEFAULT_POLICY)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/averaging down/i)
  })

  it('allows a fresh BUY when under the position cap', () => {
    const positions = [{ symbol: 'RELIANCE', quantity: 2 }]
    const result = canPlaceOrder({ symbol: 'HDFCBANK', side: 'BUY', quantity: 2 }, positions, DEFAULT_POLICY)
    expect(result.allowed).toBe(true)
  })

  it('rejects a fresh BUY once the position cap is reached', () => {
    const positions = [
      { symbol: 'RELIANCE', quantity: 2 },
      { symbol: 'HDFCBANK', quantity: 2 },
      { symbol: 'TATAMOTORS', quantity: 3 },
    ]
    const result = canPlaceOrder({ symbol: 'SBIN', side: 'BUY', quantity: 1 }, positions, DEFAULT_POLICY)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/maximum of 3 positions/i)
  })

  it('ignores zero-quantity (closed) positions when counting the cap and the averaging-down check', () => {
    const positions = [
      { symbol: 'RELIANCE', quantity: 0 }, // previously closed
      { symbol: 'HDFCBANK', quantity: 2 },
      { symbol: 'TATAMOTORS', quantity: 3 },
    ]
    const result = canPlaceOrder({ symbol: 'SBIN', side: 'BUY', quantity: 1 }, positions, DEFAULT_POLICY)
    expect(result.allowed).toBe(true)
    const reBuy = canPlaceOrder({ symbol: 'RELIANCE', side: 'BUY', quantity: 1 }, positions, DEFAULT_POLICY)
    expect(reBuy.allowed).toBe(true)
  })
})
