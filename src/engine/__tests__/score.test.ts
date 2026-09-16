import { describe, expect, it } from 'vitest'
import { decisionProfiles, signals } from '../../data/market'
import { assertScoreConsistent, maxPossibleScore } from '../score'

describe('score', () => {
  it('every fixture signal score equals the sum of its own decision profile components', () => {
    for (const signal of signals) {
      const profile = decisionProfiles[signal.symbol]
      expect(profile, `missing decision profile for ${signal.symbol}`).toBeDefined()
      expect(() => assertScoreConsistent(signal, profile)).not.toThrow()
    }
  })

  it('every fixture decision profile sums its maxScore to 100 (spec section 4 total)', () => {
    for (const symbol of Object.keys(decisionProfiles)) {
      const profile = decisionProfiles[symbol]
      expect(maxPossibleScore(profile.components), `${symbol} max points`).toBe(100)
    }
  })
})
