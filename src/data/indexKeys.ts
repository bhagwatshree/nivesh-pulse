// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-index-keys.mjs
// Sources: https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
//          https://growwapi-assets.groww.in/instruments/instrument.csv
// Generated: 2026-09-16T12:29:41.334Z

export interface ResolvedIndex {
  upstoxInstrumentKey: string | null
  growwSymbol: string | null
  growwTradingSymbol: string | null
}

export const indexKeys: Record<string, ResolvedIndex> = {
  "NIFTY 50": {
    "upstoxInstrumentKey": "NSE_INDEX|Nifty 50",
    "growwSymbol": "NSE-NIFTY",
    "growwTradingSymbol": "NIFTY"
  },
  "BANK NIFTY": {
    "upstoxInstrumentKey": "NSE_INDEX|Nifty Bank",
    "growwSymbol": "NSE-BANKNIFTY",
    "growwTradingSymbol": "BANKNIFTY"
  },
  "INDIA VIX": {
    "upstoxInstrumentKey": "NSE_INDEX|India VIX",
    "growwSymbol": "NSE-INDIAVIX",
    "growwTradingSymbol": "INDIAVIX"
  }
}
