// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-instrument-keys.mjs
// Source: https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
// Generated: 2026-09-16T07:04:11.891Z
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

export const instrumentKeys: Record<string, ResolvedInstrument> = {
  "RELIANCE": {
    "instrumentKey": "NSE_EQ|INE002A01018",
    "isin": "INE002A01018",
    "upstoxTradingSymbol": "RELIANCE",
    "upstoxName": "RELIANCE INDUSTRIES LTD"
  },
  "HDFCBANK": {
    "instrumentKey": "NSE_EQ|INE040A01034",
    "isin": "INE040A01034",
    "upstoxTradingSymbol": "HDFCBANK",
    "upstoxName": "HDFC BANK LTD"
  },
  "TATAMOTORS": {
    "instrumentKey": "NSE_EQ|INE155A01022",
    "isin": "INE155A01022",
    "upstoxTradingSymbol": "TMPV",
    "upstoxName": "TATA MOTORS PASS VEH LTD"
  },
  "INFY": {
    "instrumentKey": "NSE_EQ|INE009A01021",
    "isin": "INE009A01021",
    "upstoxTradingSymbol": "INFY",
    "upstoxName": "INFOSYS LIMITED"
  },
  "SBIN": {
    "instrumentKey": "NSE_EQ|INE062A01020",
    "isin": "INE062A01020",
    "upstoxTradingSymbol": "SBIN",
    "upstoxName": "STATE BANK OF INDIA"
  },
  "ASIANPAINT": {
    "instrumentKey": "NSE_EQ|INE021A01026",
    "isin": "INE021A01026",
    "upstoxTradingSymbol": "ASIANPAINT",
    "upstoxName": "ASIAN PAINTS LIMITED"
  }
}
