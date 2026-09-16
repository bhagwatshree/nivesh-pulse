// Regenerates src/data/indexKeys.ts from both providers' public instrument
// masters. No account needed for either — same pattern as
// fetch-instrument-keys.mjs (Upstox) and fetch-groww-instruments.mjs
// (Groww), combined here since the market-indices tape needs both.
//
// Run with: node scripts/fetch-index-keys.mjs

import { gunzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const UPSTOX_SOURCE = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz'
const GROWW_SOURCE = 'https://growwapi-assets.groww.in/instruments/instrument.csv'
const OUT_FILE = new URL('../src/data/indexKeys.ts', import.meta.url)

// our label -> [Upstox trading_symbol, Groww trading_symbol]
const WANTED = {
  'NIFTY 50': ['NIFTY', 'NIFTY'],
  'BANK NIFTY': ['BANKNIFTY', 'BANKNIFTY'],
  'INDIA VIX': ['INDIA VIX', 'INDIAVIX'],
}

const upstoxRes = await fetch(UPSTOX_SOURCE)
if (!upstoxRes.ok) throw new Error(`Failed to fetch Upstox instrument master: ${upstoxRes.status}`)
const upstoxInstruments = JSON.parse(gunzipSync(Buffer.from(await upstoxRes.arrayBuffer())).toString('utf8'))

const growwRes = await fetch(GROWW_SOURCE)
if (!growwRes.ok) throw new Error(`Failed to fetch Groww instrument master: ${growwRes.status}`)
const growwCsv = await growwRes.text()
const [growwHeaderLine, ...growwLines] = growwCsv.split('\n')
const growwColumns = growwHeaderLine.split(',')
const growwCol = (row, name) => row[growwColumns.indexOf(name)]

const resolved = {}
for (const [label, [upstoxSymbol, growwSymbol]] of Object.entries(WANTED)) {
  const upstoxMatch = upstoxInstruments.find((d) => d.segment === 'NSE_INDEX' && d.trading_symbol === upstoxSymbol)
  const growwMatch = growwLines
    .map((line) => line.split(','))
    .find((row) => growwCol(row, 'exchange') === 'NSE' && growwCol(row, 'instrument_type') === 'IDX' && growwCol(row, 'trading_symbol') === growwSymbol)

  if (!upstoxMatch) console.warn(`WARNING: no Upstox index found for ${label} (looked up as ${upstoxSymbol})`)
  if (!growwMatch) console.warn(`WARNING: no Groww index found for ${label} (looked up as ${growwSymbol})`)

  resolved[label] = {
    upstoxInstrumentKey: upstoxMatch?.instrument_key ?? null,
    growwSymbol: growwMatch ? growwCol(growwMatch, 'groww_symbol') : null,
    growwTradingSymbol: growwMatch ? growwCol(growwMatch, 'trading_symbol') : null,
  }
}

const generatedAt = new Date().toISOString()
const body = `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-index-keys.mjs
// Sources: ${UPSTOX_SOURCE}
//          ${GROWW_SOURCE}
// Generated: ${generatedAt}

export interface ResolvedIndex {
  upstoxInstrumentKey: string | null
  growwSymbol: string | null
  growwTradingSymbol: string | null
}

export const indexKeys: Record<string, ResolvedIndex> = ${JSON.stringify(resolved, null, 2)}
`

writeFileSync(OUT_FILE, body)
console.log(`Wrote ${Object.keys(resolved).length} index keys to src/data/indexKeys.ts`)
