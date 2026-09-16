// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-groww-instruments.mjs
// Source: https://growwapi-assets.groww.in/instruments/instrument.csv
// Generated: 2026-09-16T10:58:18.936Z
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

export const growwInstruments: Record<string, ResolvedGrowwInstrument> = {
  "RELIANCE": {
    "growwSymbol": "NSE-RELIANCE",
    "isin": "INE002A01018",
    "growwTradingSymbol": "RELIANCE",
    "growwName": "Reliance Industries"
  },
  "HDFCBANK": {
    "growwSymbol": "NSE-HDFCBANK",
    "isin": "INE040A01034",
    "growwTradingSymbol": "HDFCBANK",
    "growwName": "HDFC Bank"
  },
  "TATAMOTORS": {
    "growwSymbol": "NSE-TMPV",
    "isin": "INE155A01022",
    "growwTradingSymbol": "TMPV",
    "growwName": "Tata Motors Passenger"
  },
  "INFY": {
    "growwSymbol": "NSE-INFY",
    "isin": "INE009A01021",
    "growwTradingSymbol": "INFY",
    "growwName": "Infosys"
  },
  "SBIN": {
    "growwSymbol": "NSE-SBIN",
    "isin": "INE062A01020",
    "growwTradingSymbol": "SBIN",
    "growwName": "State Bank Of India"
  },
  "ASIANPAINT": {
    "growwSymbol": "NSE-ASIANPAINT",
    "isin": "INE021A01026",
    "growwTradingSymbol": "ASIANPAINT",
    "growwName": "Asian Paints"
  }
}
