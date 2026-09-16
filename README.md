# NiveshPulse

NiveshPulse is a responsive paper-trading decision-support prototype for Indian cash equities. It demonstrates five-minute BUY, WAIT, and EXIT setups, whole-share capital allocation, risk limits, alerts, explainable model factors, and an immutable-style decision journal.

All prices, candles, headlines, model scores, and fills in this repository are synthetic. The app does not connect to an exchange or broker and does not provide live investment advice.

## Run locally

```bash
npm install
npm run dev
```

Production build and code checks:

```bash
npm run build
npm run lint
```

## Included in the prototype

- ₹10,000 default capital with ₹10k, ₹20k, ₹50k, and custom inputs.
- Whole-share allocation across a common model basket.
- A maximum of three positions, 40% per-stock cap, 0.35% modeled risk per setup, 1% daily loss budget, and no leverage.
- Five-minute signal expiry and a visible data timestamp.
- BUY, WAIT / NO TRADE, and EXIT-only-if-held states.
- Entry band, protective stop, indicative exit zone, risk/reward, invalidation, model score, and supporting/opposing evidence.
- Interactive illustrative candlestick chart with EMA and VWAP overlays.
- Paper-order review and fills; no broker or exchange connection.
- Notification drawer, open positions, P&L, and an audit trail.
- Desktop, tablet, and mobile layouts with a mobile bottom navigation.

The allocator uses whole shares and respects both capital and stop-distance risk:

```text
riskLimitedQty = floor((capital × 0.35%) / abs(entry − stop))
cashLimitedQty = floor((capital × 40%) / price)
quantity       = min(riskLimitedQty, cashLimitedQty)
```

Any remainder is shown explicitly. It is not silently treated as an equity allocation.

## Safe product boundary

Do not market this product around a 1–3% daily target, accuracy rate, guaranteed return, or “sure-shot” calls. The intended first release is a paper-only research product with:

1. One common, non-personalized signal stream and model portfolio.
2. User capital used only to scale the same published weights into whole shares.
3. Manual review of every alert and no custody of client funds or broker credentials.
4. A mandatory no-trade outcome and automatic suppression on stale data, missing bars, poor liquidity, circuits/halts, abnormal spread, excessive volatility, or exhausted risk budget.
5. A retained, time-stamped report for every issued, changed, expired, or cancelled signal.

Before a public or paid beta, obtain Indian securities counsel and compliance review. Current primary references include the [SEBI Research Analyst Master Circular (6 February 2026)](https://www.sebi.gov.in/sebi_data/attachdocs/feb-2026/1770375507051.pdf), [SEBI IA FAQ on intraday trading calls](https://www.sebi.gov.in/sebi_data/faqfiles/aug-2025/1755174193178.pdf), [SEBI intraday investor study](https://www.sebi.gov.in/media-and-notifications/press-releases/jul-2024/sebi-study-finds-that-7-out-of-10-individual-intraday-traders-in-equity-cash-segment-make-losses_84948.html), and [NSE market-data licensing policy](https://www.nseindia.com/static/market-data/nse-data-policy).

## Production architecture

The UI is intentionally data-source agnostic. A production system should add a server-side pipeline:

```text
Licensed market/news adapters
  → tick normalization and finalized 1m/5m bars
  → PostgreSQL + TimescaleDB
  → point-in-time feature engine
  → explainable model scorer
  → risk gate and capital allocator
  → signal/report/audit store
  → FastAPI REST + WebSocket
  → web app and push notification service
```

Redis can hold the latest quote state, scheduled jobs, and notification-deduplication keys. Keep the first deployment a modular monolith; Kafka and microservices are unnecessary for an MVP.

### Selected API path

For a closed beta, use one authenticated Upstox connection per tester. The 2026 API surface covers [Market Data Feed V3](https://upstox.com/developer/api-documentation/v3/get-market-data-feed/), [intraday candles](https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/), [instrument-linked news](https://upstox.com/developer/api-documentation/get-news/), [key ratios with sector values](https://upstox.com/developer/api-documentation/get-key-ratios/), [company fundamentals](https://upstox.com/developer/api-documentation/announcements/company-fundamentals-api/), and [corporate actions](https://upstox.com/developer/api-documentation/get-corporate-actions/).

For a public multi-user product, use an enterprise market-data contract such as [TrueData](https://www.truedata.in/products/marketdataapi), [Global Datafeeds](https://globaldatafeeds.in/apis/), or a direct [NSE real-time feed](https://www.nseindia.com/static/market-data/real-time-data-subscription). Written rights must cover non-display algorithms, externally distributed derived signals, app display, retention, and replay. Customer broker OAuth remains for that customer's holdings and eventual execution; one consumer broker token must not power signals for all users.

The exact source selection, evidence contract, weighted decision logic, vetoes, industry comparison rules, and human-readable explanation format are documented in [docs/DATA_AND_DECISION_SPEC.md](docs/DATA_AND_DECISION_SPEC.md).

### Five-minute pipeline

At each finalized five-minute boundary:

1. Verify exchange time, quote/news freshness, bar completeness, liquidity, spread, circuits, and surveillance eligibility.
2. Compute EMA 9/21, price versus VWAP, RSI, ATR, opening-range position, volume z-score, and relative strength versus Nifty/sector.
3. Use verified news and exchange announcements as contextual features or vetoes—not as LLM-generated facts.
4. Score the next-bar setup with an explainable rules baseline. Later compare calibrated logistic regression or gradient boosting on a time-based holdout set.
5. Require expected edge to exceed realistic brokerage, STT, exchange/SEBI charges, GST, stamp duty, and conservative slippage.
6. Apply risk, concentration, stale-data, and no-trade gates; persist the full feature/model snapshot before notifying.

An LLM may summarize the retained evidence. It should not invent prices, determine the trading action, or bypass the deterministic risk gate.

## Validation and release gates

- Event-driven replay with next-bar fills, spread, slippage, fees, rejects, partial fills, corporate actions, and intraday square-off.
- Point-in-time universe membership and news timestamps to prevent survivorship and look-ahead leakage.
- Walk-forward train/validation/test splits, then several weeks of shadow and paper operation.
- Report net expectancy, maximum drawdown, profit factor, turnover, exposure, calibration, and market-regime performance—not win rate alone.
- Kill switch, idempotent signals/notifications, reconciliation, backups, monitoring, and incident response.
- Regulatory sign-off, licensed data agreements, KYC/consent and disclosure flows, grievance/SCORES links, conflicts/holdings disclosures, and five-year record retention where applicable.

Live execution is deliberately outside the MVP. If added later, it requires a registered broker integration, explicit user confirmation, reconciliation controls, and review against the current SEBI retail-algorithm framework.
