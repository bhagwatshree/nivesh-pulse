# Data and decision specification

Status: proposed production contract for the NiveshPulse paper-trading prototype. The current UI is synthetic and none of these providers is connected yet.

## 1. Chosen data APIs

### Closed beta

Use Upstox through a separate OAuth or read-only Analytics Token for every tester:

| Information | API | Use in the product |
| --- | --- | --- |
| Live prices, depth, status | [Market Data Feed V3](https://upstox.com/developer/api-documentation/v3/get-market-data-feed/) | Build the current quote and finalized one- and five-minute candles. |
| Intraday history | [Intraday Candle Data V3](https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/) | Indicators, replay, feature baselines, and gap checks. |
| Financial news | [News API](https://upstox.com/developer/api-documentation/get-news/) | Instrument-linked headline, summary, article URL, and publication time. It is a pull API with a seven-day window, so do not assume a breaking-news latency SLA. |
| Ratios and sector values | [Key Ratios API](https://upstox.com/developer/api-documentation/get-key-ratios/) | P/E, P/B, ROA, ROE, ROCE, and EV/EBITDA with available sector comparisons. |
| Statements and peers | [Company Fundamentals APIs](https://upstox.com/developer/api-documentation/announcements/company-fundamentals-api/) | Profile, income statement, balance sheet, cash flow, shareholding, and competitors. |
| Corporate events | [Corporate Actions API](https://upstox.com/developer/api-documentation/get-corporate-actions/) | Dividends, bonuses, splits, rights, and effective dates. |

Upstox is the fastest route to a useful closed beta because all records can be mapped by instrument key or ISIN. It is not automatically a licence to redistribute the same feed or derived calls to a public audience.

### Public multi-user product

Before a public or paid release, procure a written enterprise contract. The leading implementation path is:

| Information | Primary | Premium or fallback |
| --- | --- | --- |
| NSE/BSE market data | [TrueData Market Data API](https://www.truedata.in/products/marketdataapi) | [Global Datafeeds](https://globaldatafeeds.in/apis/) or direct [NSE data](https://www.nseindia.com/static/market-data/real-time-data-subscription) |
| Official announcements | Licensed TrueData corporate feed with source links | Direct [NSE Corporate Data](https://www.nseindia.com/static/market-data/corporate-data-subscription) and BSE contract |
| India-focused news | TrueData News or NSE Cogencis | [LSEG News Service](https://developers.lseg.com/en/product/news/news_service_rdp) for machine-readable premium news |
| Fundamentals | TrueData or Accord ACE | [LSEG Company Fundamentals](https://developers.lseg.com/en/api-catalog/daas/DaaS/Products/CompanyFundamentalsViaDaaS) |
| Industry taxonomy | [NSE industry classification](https://www.nseindia.com/static/products-services/industry-classification) | Licensed LSEG taxonomy |

The contract must explicitly permit non-display calculation, external distribution of derived BUY/WAIT/EXIT signals, web/mobile display, storage, replay, number of users/devices, and the intended use of news text. Broker APIs are customer-specific portfolio/execution adapters, not the shared market-data backbone.

## 2. Evidence and freshness contract

Every value used in a decision must retain:

- provider, feed, upstream instrument ID, and canonical internal instrument/ISIN;
- source publication or exchange timestamp, first-received timestamp, and server-ingest timestamp;
- freshness state (`FRESH`, `DEGRADED`, `STALE`, or `UNAVAILABLE`) and source age;
- coverage state (`COMPLETE`, `COMPLETE_EMPTY`, `PARTIAL`, or `UNAVAILABLE`);
- raw-payload hash, normalization version, and licence-use flags;
- point-in-time availability so a later filing or corrected article cannot leak into a historical test.

`COMPLETE_EMPTY` news means a healthy search found no article and is neutral. `UNAVAILABLE` means the engine cannot establish that and must block a new trade. Only finalized five-minute candles are eligible for a decision.

Source precedence is: exchange/company filing, licensed newswire, corroborated publisher, then unverified report. Duplicate stories are clustered into one event. An LLM may structure or summarize retained evidence, but it cannot choose the trading action or invent facts.

## 3. Ratios and industry comparison

There is no universal “industry compatibility” number. The UI should disclose each peer metric, peer group, stock value, peer median, percentile, period, filing date, formula version, and whether higher or lower is desirable.

For ordinary non-financial companies, the context score may combine:

- quality: ROCE, ROE, operating margin, and operating cash flow versus profit;
- balance sheet: net debt/EBITDA and interest coverage;
- growth: sales and EPS growth;
- valuation: P/E and EV/EBITDA.

Banks and NBFCs use a separate schema: ROA, net interest margin, gross/net NPA, capital adequacy, growth, and P/B. EV/EBITDA and normal-company debt/equity comparisons are not meaningful for banks. Peer membership follows the versioned NSE industry classification and requires a minimum comparable peer count.

Fundamentals are slow-moving stock-selection context. They cannot time the next five-minute move and therefore never bypass price, volume, liquidity, or risk gates.

## 4. Transparent decision policy

The UI's `v0.3-demo` score is a deterministic, reviewable baseline:

| Evidence family | Maximum points |
| --- | ---: |
| Trend and session VWAP | 25 |
| Momentum | 20 |
| Volume and liquidity | 15 |
| Broad market and sector | 15 |
| News and corporate events | 10 |
| Industry-relative fundamentals | 10 |
| Risk quality | 5 |
| **Total** | **100** |

This score is not a probability and must not be labelled “confidence.” A later probability field is allowed only after point-in-time walk-forward calibration against the exact target, stop, timeout, slippage, and fee policy.

The action state machine is:

```text
if required data is stale, missing, or operationally unsafe:
    NO SIGNAL (shown as WAIT with the blocking reason)
else if a long position exists and a stop, invalidation, severe event,
        daily kill switch, or end-of-day rule is triggered:
    EXIT (sell only the held quantity; never reverse short)
else if no position exists and score >= 70 and every entry gate passes:
    BUY
else:
    WAIT
```

A score of 70 or more alone is insufficient. A hard gate overrides it. Representative gates are:

- finalized candle, synchronized clock, fresh quote/news/announcement feeds, and no sequence gap;
- eligible cash-equity series, market open, no halt/circuit or unadjusted corporate action;
- spread, liquidity, estimated price impact, and volatility inside configured limits;
- no scheduled-results blackout or verified high-materiality adverse event;
- market and sector are not both adverse and the technical entry is confirmed;
- expected edge remains positive after brokerage, STT, exchange/SEBI charges, GST, stamp duty, spread, and slippage;
- per-stock, sector, open-risk, daily-loss, model-drift, and broker-health limits pass.

For a candidate BUY, positive news cannot replace price/volume confirmation. A verified material negative event can veto a BUY. An EXIT requires a known held position; otherwise the same bearish evidence means `WAIT / AVOID`, not a short recommendation.

## 5. News contribution

Each deduplicated event is scored as structured evidence:

```text
impact = sentiment × materiality × ticker relevance × source reliability
         × novelty × time decay
```

The UI must show the original link, publisher, published time, first-seen time, event type, verification status, and whether the event supported, opposed, or vetoed the setup. Scheduled results use a conservative blackout until an event-specific strategy is separately validated.

## 6. Capital and risk logic

For the current no-leverage paper prototype:

```text
risk_rupees      = capital × 0.35%
risk_limited_qty = floor(risk_rupees / abs(entry - stop))
cash_limited_qty = floor((capital × 40%) / estimated_fill_price)
quantity         = min(risk_limited_qty, cash_limited_qty, liquidity_limit)
```

The portfolio holds at most three names, applies a 1% daily-loss budget, uses whole shares, never averages down, and may retain cash. Live limits must be validated after all costs; they are safety constraints, not return promises.

## 7. Human-readable decision record

Every alert and detail page should answer:

1. What is the action, price range, expiry, and position state?
2. Which evidence added or removed points, including raw value, weight, source, and timestamp?
3. Which hard gates passed, failed, or were unavailable?
4. What opposing evidence was considered?
5. Why was the next-best action rejected?
6. What invalidates the setup, and what are the stop, target, expected costs, and maximum rupee loss?
7. Which engine, feature, risk-policy, and data-normalization versions produced it?

Example:

> WAIT — evidence score 58/100 versus the 70 BUY threshold. The balance sheet is strong and price is stabilizing, but the five-minute close remains below VWAP and volume is below its time-of-day baseline. All feeds are fresh. Re-evaluate only after the next finalized candle.

Persist an immutable input snapshot, factor contributions, gate results, output, notification, model/rule versions, and eventual paper outcome. A corrected decision supersedes the earlier record instead of editing it in place.

## 8. Release boundary

Do not present the app as capable of delivering a fixed 1–3% daily profit. Before live advisory use: obtain securities-law review, required registration/approvals, exchange/vendor licences, point-in-time backtests, after-cost walk-forward results, paper/shadow operation, calibrated probabilities, monitoring, kill switches, and an audited incident process.
