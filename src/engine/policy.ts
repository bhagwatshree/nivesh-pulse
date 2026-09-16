// Versioned, reviewable trading policy. Every threshold that used to be a
// magic number scattered across App.tsx and lib/allocation.ts lives here so
// it can be tested, diffed, and cited in the decision record (spec section 7).

export const ENGINE_VERSION = 'v0.3-demo'
export const FEATURE_VERSION = 'f0.1'
export const NORMALIZATION_VERSION = 'n0.1'

export interface RiskPolicy {
  version: string
  /** Minimum evidence score (0-100) required for a BUY, before gates apply. */
  buyThreshold: number
  /** Fraction of capital risked per setup, sized by stop distance. */
  riskPerSetupPct: number
  /** Maximum fraction of capital in a single position. */
  maxPositionPct: number
  /** Maximum fraction of capital the whole plan may lose in a session. */
  dailyLossBudgetPct: number
  /** Maximum number of concurrent open positions. */
  maxPositions: number
  /** Spec section 6: the portfolio never averages down. */
  allowAveragingDown: boolean
  minCapital: number
  maxCapital: number
}

// NOTE: riskPerSetupPct * maxPositions = 0.35% * 3 = 1.05%, which exceeds
// dailyLossBudgetPct (1%). This is intentional and not a bug: the per-setup
// figure is a ceiling on any one position, while size.ts's allocate()
// enforces the tighter, binding portfolio-level dailyLossBudgetPct as the
// actual constraint (see size.test.ts). Do not "fix" this by shrinking
// riskPerSetupPct without re-reading size.ts first.
export const DEFAULT_POLICY: RiskPolicy = {
  version: ENGINE_VERSION,
  buyThreshold: 70,
  riskPerSetupPct: 0.0035,
  maxPositionPct: 0.4,
  dailyLossBudgetPct: 0.01,
  maxPositions: 3,
  allowAveragingDown: false,
  minCapital: 1_000,
  maxCapital: 1_000_000,
}
