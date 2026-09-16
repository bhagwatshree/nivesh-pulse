// Regenerates src/data/nifty50Keys.ts from three public, unauthenticated
// sources: NSE's own published Nifty 50 constituent list, and both
// providers' instrument masters (same pattern as
// fetch-instrument-keys.mjs / fetch-groww-instruments.mjs). No account
// needed for any of it.
//
// Run with: node scripts/fetch-nifty50-keys.mjs
//
// Nifty 50 membership is rebalanced semi-annually (spec: 31 Jan / 31 Jul
// cut-offs) — re-run this after a rebalance.

import { gunzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const NIFTY50_SOURCE = 'https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv'
const UPSTOX_SOURCE = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz'
const GROWW_SOURCE = 'https://growwapi-assets.groww.in/instruments/instrument.csv'
const OUT_FILE = new URL('../src/data/nifty50Keys.ts', import.meta.url)

const nifty50Res = await fetch(NIFTY50_SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0' } })
if (!nifty50Res.ok) throw new Error(`Failed to fetch Nifty 50 list: ${nifty50Res.status}`)
const nifty50Csv = await nifty50Res.text()
const [nifty50Header, ...nifty50Lines] = nifty50Csv.trim().split('\n')
const nifty50Columns = nifty50Header.split(',')
const symbolIdx = nifty50Columns.indexOf('Symbol')
const nameIdx = nifty50Columns.indexOf('Company Name')
const symbols = nifty50Lines.map((line) => {
  const cols = line.split(',')
  return { symbol: cols[symbolIdx], name: cols[nameIdx] }
})

const upstoxRes = await fetch(UPSTOX_SOURCE)
if (!upstoxRes.ok) throw new Error(`Failed to fetch Upstox instrument master: ${upstoxRes.status}`)
const upstoxInstruments = JSON.parse(gunzipSync(Buffer.from(await upstoxRes.arrayBuffer())).toString('utf8'))

const growwRes = await fetch(GROWW_SOURCE)
if (!growwRes.ok) throw new Error(`Failed to fetch Groww instrument master: ${growwRes.status}`)
const growwCsv = await growwRes.text()
const [growwHeaderLine, ...growwLines] = growwCsv.split('\n')
const growwColumns = growwHeaderLine.split(',')
const growwCol = (row, name) => row[growwColumns.indexOf(name)]
const growwRows = growwLines.map((line) => line.split(','))

const resolved = {}
const missing = []
for (const { symbol, name } of symbols) {
  const upstoxMatch = upstoxInstruments.find(
    (d) => d.segment === 'NSE_EQ' && d.instrument_type === 'EQ' && d.trading_symbol === symbol,
  )
  const growwMatch = growwRows.find(
    (row) => growwCol(row, 'exchange') === 'NSE' && growwCol(row, 'segment') === 'CASH' && growwCol(row, 'trading_symbol') === symbol,
  )
  if (!upstoxMatch && !growwMatch) {
    missing.push(symbol)
    continue
  }
  resolved[symbol] = {
    name,
    upstoxInstrumentKey: upstoxMatch?.instrument_key ?? null,
    isin: upstoxMatch?.isin ?? (growwMatch ? growwCol(growwMatch, 'isin') : null),
    growwSymbol: growwMatch ? growwCol(growwMatch, 'groww_symbol') : null,
    growwTradingSymbol: growwMatch ? growwCol(growwMatch, 'trading_symbol') : null,
  }
}

if (missing.length > 0) {
  console.warn(`WARNING: could not resolve ${missing.length} symbol(s) on either provider: ${missing.join(', ')}`)
}

const generatedAt = new Date().toISOString()
const body = `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-nifty50-keys.mjs
// Sources: ${NIFTY50_SOURCE}
//          ${UPSTOX_SOURCE}
//          ${GROWW_SOURCE}
// Generated: ${generatedAt}
// Resolved ${Object.keys(resolved).length} of ${symbols.length} Nifty 50 constituents.
//
// Nifty 50 membership is rebalanced semi-annually (31 Jan / 31 Jul
// cut-offs per NSE) — re-run this script after a rebalance rather than
// hand-editing entries.

export interface ResolvedNifty50Stock {
  name: string
  upstoxInstrumentKey: string | null
  isin: string | null
  growwSymbol: string | null
  growwTradingSymbol: string | null
}

export const nifty50Keys: Record<string, ResolvedNifty50Stock> = ${JSON.stringify(resolved, null, 2)}
`

writeFileSync(OUT_FILE, body)
console.log(`Wrote ${Object.keys(resolved).length} Nifty 50 instrument keys to src/data/nifty50Keys.ts`)
