import { DEFAULT_PAPER_POLICY, summarizeBook } from '../engine/paperTrader'
import type { PaperReport } from '../hooks/usePaperReport'
import { inr } from '../lib/allocation'

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}%`)

export default function PaperTrackRecord({ report, error }: { report: PaperReport | null; error: string | null }) {
  const target = report?.state?.netTargetPct ?? DEFAULT_PAPER_POLICY.netTargetPct
  const state = report?.state ?? null
  const days = [...(report?.history ?? [])]
  if (state && !days.some((d) => d.date === state.date)) days.push(state)

  const capitals = [...new Set(days.flatMap((d) => Object.values(d.books).map((b) => b.capital)))].sort((a, b) => a - b)
  const cumulative = capitals.map((capital) => {
    let net = 0
    let turnover = 0
    let trades = 0
    let tradingDays = 0
    let hitDays = 0
    for (const d of days) {
      const book = Object.values(d.books).find((b) => b.capital === capital)
      if (!book) continue
      const s = summarizeBook(book, target)
      net += s.netPnl
      turnover += s.buyTurnover
      trades += s.trades
      if (s.trades > 0) {
        tradingDays++
        if (s.meetsTarget) hitDays++
      }
    }
    return { capital, net, turnover, trades, tradingDays, hitDays, pct: turnover > 0 ? (net / turnover) * 100 : null }
  })

  const hasTrades = state ? Object.values(state.books).some((b) => b.open.length + b.closed.length > 0) : false

  return (
    <section id="track" className="anchor-section section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Mock trading · no real orders</p>
          <h2>Track record after all costs</h2>
        </div>
        <span className="section-meta">
          {state ? `${state.date} · ${state.ticks} scans · target ${(target * 100).toFixed(2)}% net` : 'No mock trades yet'}
        </span>
      </div>

      <article className="panel screener-panel">
        <div className="screener-disclaimer">
          <p>
            Each trade must net at least {(target * 100).toFixed(2)}% of the money bought <em>after</em> brokerage, STT,
            exchange/SEBI fees, GST, stamp duty and a slippage allowance. Fills are at the next bar&apos;s open; if a bar
            touches both stop and target the stop is assumed first. If no trade can realistically clear the bar, the
            engine takes none — so some days show no trades.
          </p>
        </div>
        {error && <p className="screener-updated">Could not load the ledger: {error}</p>}
        {!report && !error && <p className="screener-updated">Loading…</p>}

        {state && (
          <>
            <h3 className="track-h">Today</h3>
            <div className="track-table">
              <div className="track-row track-head">
                <span>Book</span><span>Trades</span><span>Gross</span><span>Costs</span><span>Net</span><span>Net % of bought</span><span>Target</span>
              </div>
              {Object.values(state.books).map((book) => {
                const s = summarizeBook(book, target)
                return (
                  <div className="track-row" key={book.capital}>
                    <span>{inr(book.capital)}</span>
                    <span>{s.trades}{book.open.length ? ` (+${book.open.length} open)` : ''}</span>
                    <span>{inr(s.grossPnl, 2)}</span>
                    <span>{inr(s.costs.total, 2)}</span>
                    <span className={s.netPnl >= 0 ? 'track-pos' : 'track-neg'}>{inr(s.netPnl, 2)}</span>
                    <span>{pct(s.netPctOfTurnover)}</span>
                    <span>{s.meetsTarget === null ? 'no trades' : s.meetsTarget ? 'met' : 'missed'}</span>
                  </div>
                )
              })}
            </div>

            {hasTrades && (
              <>
                <h3 className="track-h">Trades</h3>
                <div className="track-table">
                  <div className="track-row track-head">
                    <span>Book</span><span>Stock</span><span>Qty</span><span>In</span><span>Out / stop / target</span><span>Why</span><span>Net</span>
                  </div>
                  {Object.values(state.books).flatMap((b) => [
                    ...b.open.map((p) => (
                      <div className="track-row" key={`${b.capital}-o-${p.symbol}`}>
                        <span>{inr(b.capital)}</span><span>{p.symbol}</span><span>{p.qty}</span>
                        <span>{p.entryPrice.toFixed(2)} @{p.entryTime}</span>
                        <span>stop {p.stop} · target {p.target}</span><span>OPEN</span><span>—</span>
                      </div>
                    )),
                    ...b.closed.map((t) => (
                      <div className="track-row" key={`${b.capital}-c-${t.symbol}`}>
                        <span>{inr(b.capital)}</span><span>{t.symbol}</span><span>{t.qty}</span>
                        <span>{t.entryPrice.toFixed(2)} @{t.entryTime}</span>
                        <span>{t.exitPrice.toFixed(2)} @{t.exitTime}</span><span>{t.exitReason}</span>
                        <span className={t.netPnl >= 0 ? 'track-pos' : 'track-neg'}>{inr(t.netPnl, 2)}</span>
                      </div>
                    )),
                  ])}
                </div>
              </>
            )}

            {state.macro && (
              <p className="screener-updated">
                Macro / geopolitical risk: <strong>{state.macro.level}</strong>
                {state.macro.riskOffHeadlines.length > 0 && ` — ${state.macro.riskOffHeadlines.slice(0, 3).join(' · ')}`}
              </p>
            )}
            {state.notes.length > 0 && (
              <details className="screener-updated">
                <summary>Why trades were skipped ({state.notes.length})</summary>
                <ul>{state.notes.slice(0, 15).map((n) => <li key={n}>{n}</li>)}</ul>
              </details>
            )}
          </>
        )}

        <h3 className="track-h">Since start ({days.length} day{days.length === 1 ? '' : 's'})</h3>
        <div className="track-table">
          <div className="track-row track-head">
            <span>Book</span><span>Trades</span><span>Days traded</span><span>Days ≥ target</span><span>Cumulative net</span><span>Net % of bought</span><span />
          </div>
          {cumulative.length === 0 && <div className="track-row"><span>No history yet.</span></div>}
          {cumulative.map((c) => (
            <div className="track-row" key={c.capital}>
              <span>{inr(c.capital)}</span><span>{c.trades}</span><span>{c.tradingDays}</span><span>{c.hitDays}</span>
              <span className={c.net >= 0 ? 'track-pos' : 'track-neg'}>{inr(c.net, 2)}</span>
              <span>{pct(c.pct)}</span><span />
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
