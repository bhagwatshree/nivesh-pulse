# Implementation plan

Status: proposed. Derived from a review of [DATA_AND_DECISION_SPEC.md](DATA_AND_DECISION_SPEC.md) against the current `src/` tree.

## Premise

The spec describes a decision engine with hard safety invariants. The code contains a UI that *renders* those invariants as text but does not *enforce* them. Every phase below is ordered so that the enforcement gap closes before the UI grows.

Each phase is independently shippable and has an acceptance check that can be run. Do not start a phase before the previous phase's check passes.

---

## Defect register

Findings, mapped to the phase that closes them.

| # | Defect | Location | Severity | Phase |
| ---: | --- | --- | --- | ---: |
| 1 | 3-position cap never enforced; satisfied only because the fixture has exactly 3 BUYs | `lib/allocation.ts:4` | High | 2 |
| 2 | 1% daily loss budget is displayed, never applied; breach clamps the bar via `Math.min(100, …)` | `App.tsx:150` | High | 2 |
| 3 | Per-setup 0.35% × 3 positions = 1.05% — design permits exceeding the 1% budget | `lib/allocation.ts:18` | High | 2 |
| 4 | "Never averages down" (spec §6) contradicted by weighted-average merge branch | `App.tsx:205-216` | High | 2 |
| 5 | Order modal sizes from `selected` but renders `orderReview` — latent wrong-qty/wrong-price | `App.tsx:156-159` | High | 2 |
| 6 | Review checkbox is uncontrolled, never read; consent gate is decorative | `App.tsx:963` | High | 2 |
| 7 | Flat `invested * 0.0012` cost figure; spec §4 makes after-cost edge a hard gate | `App.tsx:647` | High | 1 |
| 8 | `DecisionCheck.passed: boolean` cannot express spec §7's required UNAVAILABLE state | `types.ts:70` | Med | 3 |
| 9 | No evidence envelope: `updatedAt` is a bare `"10:42:15"`, no provider/freshness/coverage | `types.ts:22` | Med | 3 |
| 10 | `SignalAction` collapses spec §4's NO SIGNAL and low-score WAIT into one `WATCH` | `types.ts:1` | Med | 3 |
| 11 | Component scores duplicated by hand against `signal.score`; no assertion they sum | `data/market.ts` | Med | 1 |
| 12 | Modals: no focus trap, no Escape, no focus restore, on the order-confirm path | `App.tsx:928` | Med | 5 |
| 13 | `role="table"`/`role="row"` with no cells — invalid ARIA table | `App.tsx:611` | Med | 5 |
| 14 | Chart is mouse-only; unusable on the advertised mobile layout | `CandlestickChart.tsx:75` | Med | 5 |
| 15 | Non-functional affordances: ⌘K hint, timeframe tabs, Settings link | `App.tsx:319,449,270` | Med | 5 |
| 16 | Hardcoded counts that desync from data: `3`, `3 of 6`, `6 screened / 3 passed`, date, timestamp | `App.tsx:252,346,377,396,523,878` | Med | 2 |
| 17 | `safety < 100` guards an unproven bound; returns a wrong allocation instead of failing | `lib/allocation.ts:29` | Med | 1 |
| 18 | `tsconfig.node.json` lacks `noEmit` — emits `vite.config.js`/`.d.ts` into the repo root | `tsconfig.node.json` | Low | 0 |
| 19 | No `.gitignore`, not a git repo, `dist/` and `*.tsbuildinfo` in the tree | repo root | Low | 0 |
| 20 | EMA labelled "EMA 5" (`2/(5+1)`); spec and README specify EMA 9/21 | `CandlestickChart.tsx:41` | Low | 5 |
| 21 | 1s interval re-renders the whole 1,010-line tree to advance a clock | `App.tsx:125` | Low | 4 |
| 22 | Risk math (`maxModeledLoss`, `riskUsed`, `entryPrice`, `orderQuantity`, `totalPnl`) inline in a render body | `App.tsx:145-165` | Med | 1,2 |
| 23 | `v0.3-demo` as a string literal repeated in 4 JSX nodes; spec §7 requires recorded versions | `App.tsx:730,867,894` | Low | 1 |
| 24 | No test runner at all, for an app whose value is arithmetic about money | `package.json` | **Critical** | 1 |

---

## Phase 0 — Repo hygiene

**Goal:** stop shipping build output as source; get the work under version control before changing anything.

Closes: 18, 19.

1. `git init`, then commit the current tree as the pre-change baseline.
2. Add `.gitignore`:
   ```
   node_modules/
   dist/
   *.tsbuildinfo
   vite.config.js
   vite.config.d.ts
   .env*
   ```
3. Delete the emitted `vite.config.js` and `vite.config.d.ts` from the repo root.
4. Fix `tsconfig.node.json` — add `"noEmit": true` and redirect the build-info file:
   ```jsonc
   {
     "compilerOptions": {
       "composite": true,
       "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
       "skipLibCheck": true,
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "noEmit": true
     },
     "include": ["vite.config.ts"]
   }
   ```
   Verified: `composite` + `noEmit` compiles clean on the pinned TypeScript 5.6.3.
5. Do the same `tsBuildInfoFile` redirect in `tsconfig.app.json`.

**Acceptance:** `npm run build` succeeds and `git status` is clean afterwards — no generated file reappears in the working tree.

**Effort:** S (under an hour).

---

## Phase 1 — Extract a pure, tested decision engine

**Goal:** every number the app asserts about money is produced by a pure function with a test. This is the phase that makes all later phases verifiable.

Closes: 7, 11, 17, 22 (partly), 23, 24.

### 1.1 Add the test runner

```bash
npm i -D vitest @vitest/coverage-v8
```

`package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
(`jsdom` and `@testing-library/react` are not needed yet — Phase 1 tests are pure. Add them in Phase 4.)

### 1.2 New module layout

```
src/engine/
  policy.ts     RiskPolicy + version constants
  costs.ts      Indian cash-equity round-trip cost model
  score.ts      component sum + invariant check
  gates.ts      GateStatus, entry/exit gate evaluation
  decide.ts     the spec-§4 state machine, transcribed
  size.ts       spec-§6 sizing, portfolio-aware
  index.ts      barrel
```

No file in `src/engine/` may import React. Enforce with an ESLint `no-restricted-imports` rule scoped to that directory.

### 1.3 `policy.ts` — magic numbers become versioned data

Replaces `0.0035`, `0.4`, `0.01`, `70`, `0.0012` scattered across `allocation.ts` and `App.tsx`, and the four `v0.3-demo` string literals.

```ts
export const ENGINE_VERSION = 'v0.3-demo'
export const FEATURE_VERSION = 'f0.1'
export const NORMALIZATION_VERSION = 'n0.1'

export interface RiskPolicy {
  version: string
  buyThreshold: number          // 70
  riskPerSetupPct: number       // 0.0035
  maxPositionPct: number        // 0.40
  dailyLossBudgetPct: number    // 0.01
  maxPositions: number          // 3
  allowAveragingDown: boolean   // false
  minCapital: number            // 1_000
  maxCapital: number            // 1_000_000
}

export const DEFAULT_POLICY: RiskPolicy = { /* … */ }
```

Note the tension this surfaces: `riskPerSetupPct × maxPositions` is 1.05%, above `dailyLossBudgetPct`. The policy is not internally consistent, and Phase 2 resolves it by making the portfolio budget bind (defect 3). Add a unit test asserting the relationship is *handled*, not that it is absent.

### 1.4 `costs.ts` — replace the 12bps decoration

Spec §4 makes "expected edge remains positive after brokerage, STT, exchange/SEBI charges, GST, stamp duty, spread, and slippage" a **hard gate**, so this cannot stay a display string.

```ts
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

export function roundTripCosts(
  entryPrice: number, exitPrice: number, quantity: number, rates: CostRates,
): CostBreakdown
```

Keep the actual rates in a `CostRates` object alongside `RiskPolicy` so they are configurable and reviewable rather than embedded. Indian intraday cost is dominated by STT and stamp duty in ways a flat bps figure misrepresents, and since this number decides whether a setup clears, getting it wrong is not cosmetic.

**Have someone verify the rate table against current exchange/SEBI schedules before it drives a gate.** Until then, mark the module with the date the rates were sourced.

### 1.5 `score.ts` — kill the hand-authored duplication

```ts
export function totalScore(components: DecisionContribution[]): number
export function assertScoreConsistent(signal: StockSignal, profile: DecisionProfile): void
```

Today the six fixtures' components do sum to their declared `score` — checked by hand, correct at the moment, and unguarded. A test over every fixture makes that permanent.

### 1.6 `decide.ts` — transcribe spec §4 literally

This is the one function where spec and code can be compared by eye. Keep it shaped like the pseudocode.

```ts
export type Decision =
  | { action: 'BUY'; score: number; gates: GateResult[] }
  | { action: 'EXIT'; score: number; heldQuantity: number; trigger: ExitTrigger; gates: GateResult[] }
  | { action: 'WAIT'; score: number; reason: WaitReason; gates: GateResult[] }

export type WaitReason =
  | { kind: 'NO_SIGNAL'; detail: string }                      // stale/missing/unsafe data
  | { kind: 'BELOW_THRESHOLD'; score: number; threshold: number }
  | { kind: 'GATE_FAILED'; gate: string; detail: string }

export function decide(input: DecisionInput, policy: RiskPolicy): Decision
```

Branch order must match the spec exactly: data-unsafe first, then exit-if-held, then buy-if-gated, then wait.

### 1.7 `size.ts` — portfolio-aware allocation

Supersedes `lib/allocation.ts`. Two structural changes over the current function:

- It selects at most `policy.maxPositions` candidates (rank by score desc, then weight desc, then symbol for determinism) instead of taking every BUY.
- It tracks remaining *portfolio* risk budget as it fills, so the top-up loop cannot push aggregate modeled loss past `dailyLossBudgetPct`.

```ts
export interface AllocationPlan {
  allocations: Allocation[]
  invested: number
  unallocated: number
  totalModeledRisk: number
  riskBudget: number
  riskUtilisationPct: number       // uncapped; the caller decides how to render a breach
  breaches: PolicyBreach[]
  droppedForPositionCap: string[]  // shown in the UI, not silently discarded
}

export function allocate(
  signals: StockSignal[], capital: number, policy: RiskPolicy,
): AllocationPlan
```

Replace `safety < 100` with a provable bound: the top-up loop can add at most `sum(perSignalLimit) − sum(assignedQuantity)` shares, so use that as the iteration ceiling and assert the loop exits under it. A guard against an unproven bound that silently returns a *wrong allocation* is the worst failure mode for this specific function.

### 1.8 The invariant test suite

This is the deliverable of the phase, not an afterthought. `src/engine/__tests__/`:

**`size.test.ts`**
- never returns more than `policy.maxPositions` allocations
- `totalModeledRisk <= riskBudget` — swept across capital from 1,000 to 1,000,000 in 1,000 steps, against the real fixtures
- every quantity is a positive integer
- `invested <= capital`
- no single position exceeds `maxPositionPct × capital`
- allocation is deterministic: same inputs, same output, run twice
- the top-up loop terminates under its computed bound for every capital in the sweep

**`decide.test.ts`**
- score 95 with one failing required entry gate → `WAIT` / `GATE_FAILED`
- stale feed at score 100 → `WAIT` / `NO_SIGNAL`
- bearish evidence at score 79 with `heldQuantity: 0` → `WAIT`, never `EXIT` (spec §4: no shorts)
- bearish evidence at score 79 with a held position → `EXIT` for exactly the held quantity
- score 69 with all gates passing → `WAIT` / `BELOW_THRESHOLD`

**`score.test.ts`**
- every fixture's components sum to its declared score (defect 11)

**`costs.test.ts`**
- round-trip cost is strictly positive for any non-zero quantity
- a setup whose `target − entry` is smaller than modeled costs fails the edge gate

**Acceptance:** `npm test` passes; the engine directory has no React import; `npm run build` and `npm run lint` still pass. The UI is untouched in this phase and still works.

**Effort:** L (the bulk of the project — 2-3 focused sessions).

---

## Phase 2 — Wire the UI to the engine and close the enforcement gaps

**Goal:** the guardrails the interface claims become the guardrails the interface has.

Closes: 1, 2, 3, 4, 5, 6, 16, 22.

1. Replace the `buildAllocation` call at `App.tsx:139` with `allocate(signals, capital, DEFAULT_POLICY)`. Delete `lib/allocation.ts` (keep `inr` / `compactNumber` — move them to `src/lib/format.ts`).
2. Delete the inline risk math at `App.tsx:145-165`. Read `totalModeledRisk`, `riskBudget`, `riskUtilisationPct` off the plan.
3. **Render breaches instead of clamping them.** `Math.min(100, …)` disappears; when `riskUtilisationPct > 100` the risk panel shows a blocked state and the Review buttons disable. A demo that clamps a breach trains testers to trust an enforcement layer that does not exist.
4. **Show `droppedForPositionCap`** in the allocation table — "2 further BUY setups not funded: 3-position cap". Silently dropping candidates is how the current 3-position coincidence stayed invisible.
5. **Give the order modal its own payload.** Replace the `orderReview: StockSignal | null` state with:
   ```ts
   interface OrderTicket {
     signal: StockSignal
     side: 'BUY' | 'SELL'
     quantity: number
     price: number
     maxLoss: number
     costs: CostBreakdown
   }
   const [ticket, setTicket] = useState<OrderTicket | null>(null)
   ```
   The modal reads only `ticket`. It stops reading ambient `selected` state, which removes the wrong-quantity-at-wrong-price class of bug entirely rather than relying on every call site remembering to sync two setters.
6. **Enforce the policy in `confirmPaperOrder`.** Delete the averaging-down branch; when `allowAveragingDown` is false and a position exists, reject with a toast. Reject a BUY that would exceed `maxPositions`. These checks belong in a pure `canPlace(ticket, positions, policy): PolicyResult` in the engine, tested, with the component only rendering the result.
7. **Make the review checkbox real.** Controlled state, defaults to *un*checked, and `disabled={!reviewed}` on the confirm button.
8. **Derive the hardcoded counts.** `3`, `3 of 6`, `6 screened / 3 passed`, the nav badge — all computable from `signals` and the plan. Replace the hardcoded `Wednesday` and `Data as of 10:42:31 IST` with values from the (synthetic) data source's own timestamp.

**Acceptance:** add a test that drives `canPlace` and the sizing path together — a 4th BUY signal added to the fixtures must not be fundable, and a second BUY on a held symbol must be rejected. Manually confirm the risk panel shows a blocked state when forced past budget.

**Effort:** M (1 session).

---

## Phase 3 — Move the evidence contract into the type system

**Goal:** make spec §2 unrepresentable-if-wrong rather than aspirational. Highest leverage per line of code in the project, and it costs nothing at runtime.

Closes: 8, 9, 10.

```ts
// src/engine/evidence.ts
export type Freshness = 'FRESH' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE'
export type Coverage  = 'COMPLETE' | 'COMPLETE_EMPTY' | 'PARTIAL' | 'UNAVAILABLE'

export interface Evidence<T> {
  value: T
  provider: string
  feed: string
  upstreamInstrumentId: string
  instrumentKey: string          // canonical internal id / ISIN
  publishedAt: string            // ISO 8601 with offset
  receivedAt: string
  ingestedAt: string
  freshness: Freshness
  coverage: Coverage
  payloadHash: string
  normalizationVersion: string
}
```

Then migrate the decision-bearing fields: `price: Evidence<number>`, `factors: Evidence<SignalFactor>[]`, and so on. The synthetic fixtures become the *first implementation of the contract* rather than an unrelated shape that has to be migrated away from later.

Two smaller type fixes in the same pass:

- `DecisionCheck.passed: boolean` becomes `status: 'PASS' | 'FAIL' | 'UNAVAILABLE'`. Spec §7 question 3 requires "passed, failed, **or were unavailable**", which a boolean cannot express — and `UNAVAILABLE` is the state spec §2 says must block a new trade.
- `SignalAction = 'BUY' | 'WATCH' | 'EXIT'` is replaced by the `Decision` union from Phase 1. `WATCH` currently collapses spec §4's NO SIGNAL (blocked, must show the blocking reason) with an ordinary low-score WAIT. Once the reason travels with the decision, the UI can stop hardcoding threshold prose at `App.tsx:816-822`.

**Acceptance:** `npm run build` type-checks with the migrated fixtures; the threshold-explanation JSX no longer contains a hardcoded `70`; a fixture marked `STALE` renders a blocked WAIT with its reason.

**Effort:** M-L (1-2 sessions — mechanical but touches every component).

---

## Phase 4 — Decompose `App.tsx`

**Goal:** 1,010 lines, 14 `useState`, one component becomes something two people can work in.

Closes: 21.

1. Add `react-router-dom`. The five "pages" are currently `scrollIntoView` anchors pretending to be routes (`App.tsx:172`) — navigation state without navigation, so no deep links, no back button, no code splitting.
2. Split:
   ```
   src/routes/     Overview, Signals, Plan, Research, Journal
   src/features/   signals/ allocation/ orders/ journal/ notifications/
   src/components/ shared primitives (Brand, SignalBadge, ScoreRing, CandlestickChart)
   ```
3. Lift `capital`, `positions`, `orders` into one `useReducer` — they genuinely are a single state machine and currently interact only through hand-written `setState` sequences (which is the root of defect 5).
4. Isolate the 1s interval into a `<SessionClock/>` so the countdown stops re-rendering the entire tree every second.
5. Add `jsdom` + `@testing-library/react`; smoke-test each route renders and the order flow completes.

**Acceptance:** no file over ~250 lines; routes deep-link; `npm test` green.

**Effort:** L (1-2 sessions).

---

## Phase 5 — Accessibility and honest affordances

Closes: 12, 13, 14, 15, 20.

1. **Modals** (`App.tsx:928`): focus trap, Escape to close, focus restore to the trigger. The order-confirmation dialog is the wrong place to skip this.
2. **Allocation table** (`App.tsx:611`): either complete the ARIA table (`columnheader`, `cell`) or drop the roles and use a real `<table>`. The current half-implementation reads *worse* than a plain div.
3. **Chart** (`CandlestickChart.tsx:75`): add pointer events and keyboard navigation (arrow keys move the crosshair, announce OHLC via a live region). Mouse-only makes the chart unusable on the mobile layout the README advertises.
4. **Delete or implement the fake affordances**: the ⌘K hint has no listener anywhere in the codebase; the `1m/15m/1h` tabs and the Settings nav item are inert. Nothing in a demo shown to testers should look clickable and not be.
5. **Fix the EMA label** — the chart computes a 5-period EMA while spec and README both specify 9/21. Either compute 9/21 or correct both documents.

**Acceptance:** keyboard-only walkthrough completes a full paper buy; axe-core reports no critical violations.

**Effort:** M (1 session).

---

## Phase 6 — The data seam

**Goal:** make "I don't know" a representable state before real feeds arrive.

`signals` is currently a module singleton read directly in six places, so swapping in a live feed means rewriting the UI. Introduce:

```ts
export interface MarketDataSource {
  getSignals(): Promise<Evidence<StockSignal>[]>
  getNews(instrumentKey: string): Promise<Evidence<NewsEvent>[]>
  getDecisionProfile(symbol: string): Promise<DecisionProfile>
}
```

`SyntheticSource` implements it today; `UpstoxSource` later. Put TanStack Query (or equivalent) behind it so every screen must handle loading, error, and — critically — **stale**, which spec §2 says must block a trade. Today no component can express uncertainty, and that is the state that matters most in this product.

Also in this phase: the news fixtures gain the fields spec §5 requires and the UI already apologises for at `App.tsx:718` — publisher link, published vs first-seen time, event type, verification status, and whether the event supported, opposed, or vetoed the setup.

---

## Sequencing summary

| Phase | Theme | Blocks | Effort |
| ---: | --- | --- | --- |
| 0 | Repo hygiene | everything | S |
| 1 | Pure tested engine | 2, 3 | L |
| 2 | Wire UI, enforce policy | — | M |
| 3 | Evidence contract in types | 6 | M-L |
| 4 | Decompose `App.tsx` | 5 | L |
| 5 | A11y and honest affordances | — | M |
| 6 | Data seam | live feeds | L |

Phases 0-2 are the ones that matter most: they convert a demo that *depicts* correctness into one that *has* it. Phases 3-6 are what make it survivable as the surface grows.

## Out of scope

Deliberately excluded, and should stay excluded until the above is done: live broker execution, real money, calibrated probabilities, any public or paid release. Spec §8 lists the prerequisites for those, and none of this plan satisfies them.
