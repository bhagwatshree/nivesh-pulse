// Regenerates src/data/growwInstruments.ts from Groww's public instrument
// master CSV. No Groww account or API key needed — this is a public,
// unauthenticated static asset.
//
// Run with: node scripts/fetch-groww-instruments.mjs

import { writeFileSync } from 'node:fs'

const SOURCE_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv'
const OUT_FILE = new URL('../src/data/growwInstruments.ts', import.meta.url)

// Same symbol set (and the same TATAMOTORS -> TMPV judgment call) as
// scripts/fetch-instrument-keys.mjs, for consistency across providers.
const WANTED = {
  RELIANCE: 'RELIANCE',
  HDFCBANK: 'HDFCBANK',
  TATAMOTORS: 'TMPV',
  INFY: 'INFY',
  SBIN: 'SBIN',
  ASIANPAINT: 'ASIANPAINT',
}

const res = await fetch(SOURCE_URL)
if (!res.ok) throw new Error(`Failed to fetch Groww instrument master: ${res.status}`)
const csv = await res.text()
const [headerLine, ...lines] = csv.split('\n')
const columns = headerLine.split(',')
const col = (row, name) => row[columns.indexOf(name)]

const resolved = {}
for (const [ourSymbol, growwTradingSymbol] of Object.entries(WANTED)) {
  const match = lines
    .map((line) => line.split(','))
    .find((row) => col(row, 'exchange') === 'NSE' && col(row, 'segment') === 'CASH' && col(row, 'trading_symbol') === growwTradingSymbol)
  if (!match) {
    console.warn(`WARNING: no Groww instrument found for ${ourSymbol} (looked up as ${growwTradingSymbol})`)
    continue
  }
  resolved[ourSymbol] = {
    growwSymbol: col(match, 'groww_symbol'),
    isin: col(match, 'isin'),
    growwTradingSymbol: col(match, 'trading_symbol'),
    growwName: col(match, 'name'),
  }
}

const generatedAt = new Date().toISOString()
const body = `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-groww-instruments.mjs
// Source: ${SOURCE_URL}
// Generated: ${generatedAt}
//
// Same TATAMOTORS -> TMPV judgment call as src/data/instrumentKeys.ts — see
// that file's header comment for why. The ISINs there and here agree,
// which is a second independent confirmation of the Tata Motors demerger.

export interface ResolvedGrowwInstrument {
  growwSymbol: string
  isin: string
  growwTradingSymbol: string
  growwName: string
}

export const growwInstruments: Record<string, ResolvedGrowwInstrument> = ${JSON.stringify(resolved, null, 2)}
`

writeFileSync(OUT_FILE, body)
console.log(`Wrote ${Object.keys(resolved).length} Groww instrument keys to src/data/growwInstruments.ts`)
