// End-of-day report: closes anything the scan failed to square off,
// archives the day into the multi-month history, and emails the result.
// Invoked by .github/workflows/daily-report.yml at ~15:45 IST.

import { DEFAULT_PAPER_POLICY, istDate, netPnl, summarizeBook, type BookSummary, type PaperDayState } from '../src/engine/paperTrader'
import { mapCandleResponse } from '../src/data/upstox/mappers'
import { nifty50Keys } from '../src/data/nifty50Keys'
import { PROXY_URL, loadPaper, savePaper, type DayRecord } from './lib/paperStore'

const SECRET = process.env.SCAN_SHARED_SECRET
const RESEND_API_KEY = process.env.RESEND_API_KEY
const REPORT_TO = process.env.REPORT_TO ?? 'bhagwat.shree@gmail.com'
const REPORT_FROM = process.env.REPORT_FROM ?? 'NiveshPulse <onboarding@resend.dev>'
const NET_TARGET_PCT = process.env.NET_TARGET_PCT ? Number(process.env.NET_TARGET_PCT) / 100 : DEFAULT_PAPER_POLICY.netTargetPct

if (!SECRET) {
  console.error('SCAN_SHARED_SECRET is not set — refusing to run.')
  process.exit(1)
}

const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}%`)

async function closeLeftovers(state: PaperDayState): Promise<string[]> {
  const notes: string[] = []
  const left = Object.values(state.books).flatMap((b) => b.open.map((p) => ({ b, p })))
  if (left.length === 0) return notes

  let token: string | null = null
  try {
    const r = await fetch(`${PROXY_URL}/internal/token`, { headers: { Authorization: `Bearer ${SECRET}` } })
    const body = (await r.json()) as { provider: string | null; accessToken: string | null }
    token = body.provider === 'upstox' ? body.accessToken : null
  } catch {
    // falls through to NO_DATA below
  }

  const lastClose = new Map<string, { price: number; time: string }>()
  for (const symbol of new Set(left.map((l) => l.p.symbol))) {
    const key = nifty50Keys[symbol]?.upstoxInstrumentKey
    if (!token || !key) continue
    try {
      const url = `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(key)}/minutes/5`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
      const candles = mapCandleResponse(await response.json())
      const last = candles[candles.length - 1]
      if (last) lastClose.set(symbol, { price: last.close, time: last.time })
    } catch {
      // falls through to NO_DATA below
    }
  }

  for (const { b, p } of left) {
    const last = lastClose.get(p.symbol)
    const exitPrice = last?.price ?? p.entryPrice
    const { gross, costs, net } = netPnl(p.entryPrice, exitPrice, p.qty, DEFAULT_PAPER_POLICY.rates)
    b.closed.push({
      symbol: p.symbol,
      name: p.name,
      qty: p.qty,
      entryTime: p.entryTime,
      exitTime: last?.time ?? 'n/a',
      entryPrice: p.entryPrice,
      exitPrice,
      stop: p.stop,
      target: p.target,
      exitReason: last ? 'SQUARE_OFF' : 'NO_DATA',
      buyValue: p.entryPrice * p.qty,
      grossPnl: gross,
      costs,
      netPnl: net,
    })
    notes.push(`${p.symbol} was still open at report time (scan missed square-off); closed at ${last ? 'last price' : 'entry price — no data'}.`)
  }
  for (const b of Object.values(state.books)) b.open = []
  return notes
}

function bookTable(s: BookSummary): string {
  const row = (k: string, v: string) => `<tr><td style="padding:3px 12px 3px 0;color:#555">${k}</td><td style="text-align:right"><b>${v}</b></td></tr>`
  const met = s.meetsTarget === null ? 'no trades' : s.meetsTarget ? 'YES' : 'NO'
  return `<table style="border-collapse:collapse;font-size:14px">
    ${row('Trades (wins)', `${s.trades} (${s.wins})`)}
    ${row('Money bought (turnover)', inr(s.buyTurnover))}
    ${row('Gross P&L', inr(s.grossPnl))}
    ${row('− Brokerage', inr(s.costs.brokerage))}
    ${row('− STT', inr(s.costs.stt))}
    ${row('− Exchange + SEBI fees', inr(s.costs.exchangeTxn + s.costs.sebiFees))}
    ${row('− GST', inr(s.costs.gst))}
    ${row('− Stamp duty', inr(s.costs.stampDuty))}
    ${row('− Slippage allowance', inr(s.costs.slippage))}
    ${row('Total costs', inr(s.costs.total))}
    ${row('NET P&L', inr(s.netPnl))}
    ${row('Net % of money bought', pct(s.netPctOfTurnover))}
    ${row('Net % of capital', pct(s.netPctOfCapital))}
    ${row(`Target ${(NET_TARGET_PCT * 100).toFixed(2)}% met?`, met)}
  </table>`
}

async function main() {
  const today = istDate(new Date())
  let state = await loadPaper<PaperDayState>('state', SECRET!)
  const extraNotes: string[] = []
  if (!state || state.date !== today) {
    extraNotes.push(
      'No scan ran today, so nothing was traded. Usual causes: market holiday, or the Upstox/Groww session token was not refreshed (open the app and log in before ~09:15 IST).',
    )
    state = null
  } else {
    extraNotes.push(...(await closeLeftovers(state)))
  }

  const history = (await loadPaper<DayRecord[]>('history', SECRET!)) ?? []
  const todaySummaries = state ? Object.values(state.books).map((b) => summarizeBook(b, NET_TARGET_PCT)) : []

  if (state) {
    const record: DayRecord = {
      date: state.date,
      ticks: state.ticks,
      firstTickAt: state.firstTickAt,
      lastTickAt: state.lastTickAt,
      macroLevel: state.macro?.level ?? null,
      summaries: todaySummaries,
      books: state.books,
      reported: true,
    }
    const idx = history.findIndex((d) => d.date === record.date)
    if (idx >= 0) history[idx] = record
    else history.push(record)
    await savePaper('history', history, SECRET!)
    await savePaper('state', state, SECRET!)
  }

  // Cumulative, per capital, across every archived day.
  const capitals = [...new Set(history.flatMap((d) => Object.values(d.books).map((b) => b.capital)))].sort((a, b) => a - b)
  const cumulative = capitals.map((capital) => {
    let net = 0
    let turnover = 0
    let tradingDays = 0
    let hitDays = 0
    let trades = 0
    for (const d of history) {
      const book = Object.values(d.books).find((b) => b.capital === capital)
      if (!book) continue
      const s = summarizeBook(book, NET_TARGET_PCT)
      net += s.netPnl
      turnover += s.buyTurnover
      trades += s.trades
      if (s.trades > 0) {
        tradingDays++
        if (s.meetsTarget) hitDays++
      }
    }
    return { capital, net, turnover, tradingDays, hitDays, trades, pct: turnover > 0 ? (net / turnover) * 100 : null }
  })

  const tradeRows = state
    ? Object.values(state.books)
        .flatMap((b) =>
          b.closed.map(
            (t) =>
              `<tr><td>₹${b.capital / 1000}k</td><td>${t.symbol}</td><td>${t.qty}</td><td>${t.entryPrice.toFixed(2)} @${t.entryTime}</td><td>${t.exitPrice.toFixed(2)} @${t.exitTime}</td><td>${t.exitReason}</td><td>${inr(t.netPnl)}</td></tr>`,
          ),
        )
        .join('')
    : ''

  const macroLine = state
    ? `<p>Scans today: ${state.ticks}. Macro/geopolitical risk: <b>${state.macro?.level ?? 'n/a'}</b>${
        state.macro?.riskOffHeadlines.length ? '<br>' + state.macro.riskOffHeadlines.map((h) => `• ${h}`).join('<br>') : ''
      }</p>`
    : ''

  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;color:#111">
  <h2>NiveshPulse paper-trading report — ${today}</h2>
  <p style="color:#555">Mock trades only; no real orders. Fills at next-bar open, stop assumed first if a bar touches both, all costs deducted. Required net per trade: <b>${(NET_TARGET_PCT * 100).toFixed(2)}%</b> of the money bought.</p>
  ${macroLine}
  ${todaySummaries.map((s) => `<h3>₹${s.capital.toLocaleString('en-IN')} book</h3>${bookTable(s)}`).join('')}
  ${state ? `<h3>Trades</h3><table style="border-collapse:collapse;font-size:13px" cellpadding="4"><tr style="text-align:left"><th>Cap</th><th>Stock</th><th>Qty</th><th>In</th><th>Out</th><th>Why</th><th>Net</th></tr>${tradeRows || '<tr><td colspan="7">No trades today.</td></tr>'}</table>` : ''}
  <h3>Since start (${history.length} day${history.length === 1 ? '' : 's'})</h3>
  <table style="border-collapse:collapse;font-size:13px" cellpadding="4"><tr style="text-align:left"><th>Capital</th><th>Trades</th><th>Days traded</th><th>Days ≥ target</th><th>Cumulative net</th><th>Net % of money bought</th></tr>${
    cumulative.map((c) => `<tr><td>₹${c.capital.toLocaleString('en-IN')}</td><td>${c.trades}</td><td>${c.tradingDays}</td><td>${c.hitDays}</td><td>${inr(c.net)}</td><td>${pct(c.pct)}</td></tr>`).join('') ||
    '<tr><td colspan="6">No history yet.</td></tr>'
  }</table>
  ${state && state.notes.length ? `<h3>Why the engine skipped or stood aside</h3><ul style="font-size:13px">${state.notes.slice(0, 15).map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
  ${extraNotes.length ? `<h3>Notices</h3><ul style="font-size:13px">${extraNotes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
  <p style="color:#888;font-size:12px">Cost rates are estimates (Rs20-or-0.1% brokerage; current STT/GST/stamp/exchange/SEBI) — check against your broker's contract note. Key ratios (P/E, ROE vs sector) are used only as a veto on clearly weak names. Not investment advice.</p>
  </div>`

  console.log(`Report built for ${today}: ${todaySummaries.reduce((n, s) => n + s.trades, 0)} trades.`)
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set — report built but NOT emailed.')
    process.exit(1)
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REPORT_FROM, to: [REPORT_TO], subject: `NiveshPulse daily report ${today}`, html }),
  })
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${await response.text()}`)
  console.log(`Emailed to ${REPORT_TO}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
