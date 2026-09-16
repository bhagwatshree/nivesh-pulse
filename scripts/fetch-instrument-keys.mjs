// Regenerates src/data/instrumentKeys.ts from Upstox's public NSE instrument
// master file. No Upstox account or API key needed — this file is a public,
// unauthenticated static asset that Upstox republishes daily (~6am IST).
//
// Run with: node scripts/fetch-instrument-keys.mjs
//
// Why this exists as a checked-in file instead of a runtime fetch: the
// master file is ~38MB uncompressed for all NSE instruments, and instrument
// keys (built from ISIN) are effectively permanent for a given listed
// entity. Re-run this script if a fixture symbol is added, or after a
// corporate action that changes which entity a symbol refers to.

import { gunzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SOURCE_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz'
const OUT_FILE = new URL('../src/data/instrumentKeys.ts', import.meta.url)

// symbol -> which trading_symbol to resolve against in the instrument
// master. Most map 1:1. TATAMOTORS is the exception: see the note below.
const WANTED = {
  RELIANCE: 'RELIANCE',
  HDFCBANK: 'HDFCBANK',
  TATAMOTORS: 'TMPV', // see note in the generated file
  INFY: 'INFY',
  SBIN: 'SBIN',
  ASIANPAINT: 'ASIANPAINT',
}

const res = await fetch(SOURCE_URL)
if (!res.ok) throw new Error(`Failed to fetch instrument master: ${res.status}`)
const gz = Buffer.from(await res.arrayBuffer())
const instruments = JSON.parse(gunzipSync(gz).toString('utf8'))

const resolved = {}
for (const [ourSymbol, upstoxSymbol] of Object.entries(WANTED)) {
  const match = instruments.find(
    (d) => d.segment === 'NSE_EQ' && d.instrument_type === 'EQ' && d.trading_symbol === upstoxSymbol,
  )
  if (!match) {
    console.warn(`WARNING: no instrument found for ${ourSymbol} (looked up as ${upstoxSymbol})`)
    continue
  }
  resolved[ourSymbol] = {
    instrumentKey: match.instrument_key,
    isin: match.isin,
    upstoxTradingSymbol: match.trading_symbol,
    upstoxName: match.name,
  }
}

const generatedAt = new Date().toISOString()
const body = `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-instrument-keys.mjs
// Source: ${SOURCE_URL}
// Generated: ${generatedAt}
//
// IMPORTANT: Tata Motors underwent a corporate demerger and no longer trades
// as a single "TATAMOTORS" symbol. It split into two separately listed
// entities:
//   - TMCV — Tata Motors Limited (commercial vehicles), the original entity
//   - TMPV — Tata Motors Passenger Vehicles Limited (the demerged entity)
// This mapping defaults our fixture's "TATAMOTORS" label to TMPV (passenger
// vehicles), since that is the business retail investors most commonly mean
// by "Tata Motors." This is a judgment call, not a fact — confirm it against
// current NSE circulars before using it for anything beyond a demo, and
// consider whether the app should track both entities instead of picking one.
// This is exactly the class of event spec section 1's Corporate Actions API
// exists to catch automatically instead of via a stale hardcoded symbol.

export interface ResolvedInstrument {
  instrumentKey: string
  isin: string
  upstoxTradingSymbol: string
  upstoxName: string
}

export const instrumentKeys: Record<string, ResolvedInstrument> = ${JSON.stringify(resolved, null, 2)}
`

writeFileSync(OUT_FILE, body)
console.log(`Wrote ${Object.keys(resolved).length} instrument keys to src/data/instrumentKeys.ts`)
