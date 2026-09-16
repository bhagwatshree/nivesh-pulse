// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/fetch-nifty50-keys.mjs
// Sources: https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv
//          https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
//          https://growwapi-assets.groww.in/instruments/instrument.csv
// Generated: 2026-09-16T17:04:01.182Z
// Resolved 50 of 50 Nifty 50 constituents.
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

export const nifty50Keys: Record<string, ResolvedNifty50Stock> = {
  "ADANIENT": {
    "name": "Adani Enterprises Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE423A01024",
    "isin": "INE423A01024",
    "growwSymbol": "NSE-ADANIENT",
    "growwTradingSymbol": "ADANIENT"
  },
  "ADANIPORTS": {
    "name": "Adani Ports and Special Economic Zone Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE742F01042",
    "isin": "INE742F01042",
    "growwSymbol": "NSE-ADANIPORTS",
    "growwTradingSymbol": "ADANIPORTS"
  },
  "APOLLOHOSP": {
    "name": "Apollo Hospitals Enterprise Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE437A01024",
    "isin": "INE437A01024",
    "growwSymbol": "NSE-APOLLOHOSP",
    "growwTradingSymbol": "APOLLOHOSP"
  },
  "ASIANPAINT": {
    "name": "Asian Paints Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE021A01026",
    "isin": "INE021A01026",
    "growwSymbol": "NSE-ASIANPAINT",
    "growwTradingSymbol": "ASIANPAINT"
  },
  "AXISBANK": {
    "name": "Axis Bank Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE238A01034",
    "isin": "INE238A01034",
    "growwSymbol": "NSE-AXISBANK",
    "growwTradingSymbol": "AXISBANK"
  },
  "BAJAJ-AUTO": {
    "name": "Bajaj Auto Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE917I01010",
    "isin": "INE917I01010",
    "growwSymbol": "NSE-BAJAJ-AUTO",
    "growwTradingSymbol": "BAJAJ-AUTO"
  },
  "BAJFINANCE": {
    "name": "Bajaj Finance Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE296A01032",
    "isin": "INE296A01032",
    "growwSymbol": "NSE-BAJFINANCE",
    "growwTradingSymbol": "BAJFINANCE"
  },
  "BAJAJFINSV": {
    "name": "Bajaj Finserv Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE918I01026",
    "isin": "INE918I01026",
    "growwSymbol": "NSE-BAJAJFINSV",
    "growwTradingSymbol": "BAJAJFINSV"
  },
  "BEL": {
    "name": "Bharat Electronics Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE263A01024",
    "isin": "INE263A01024",
    "growwSymbol": "NSE-BEL",
    "growwTradingSymbol": "BEL"
  },
  "BHARTIARTL": {
    "name": "Bharti Airtel Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE397D01024",
    "isin": "INE397D01024",
    "growwSymbol": "NSE-BHARTIARTL",
    "growwTradingSymbol": "BHARTIARTL"
  },
  "CIPLA": {
    "name": "Cipla Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE059A01026",
    "isin": "INE059A01026",
    "growwSymbol": "NSE-CIPLA",
    "growwTradingSymbol": "CIPLA"
  },
  "COALINDIA": {
    "name": "Coal India Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE522F01014",
    "isin": "INE522F01014",
    "growwSymbol": "NSE-COALINDIA",
    "growwTradingSymbol": "COALINDIA"
  },
  "DRREDDY": {
    "name": "Dr. Reddy's Laboratories Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE089A01031",
    "isin": "INE089A01031",
    "growwSymbol": "NSE-DRREDDY",
    "growwTradingSymbol": "DRREDDY"
  },
  "EICHERMOT": {
    "name": "Eicher Motors Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE066A01021",
    "isin": "INE066A01021",
    "growwSymbol": "NSE-EICHERMOT",
    "growwTradingSymbol": "EICHERMOT"
  },
  "ETERNAL": {
    "name": "Eternal Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE758T01015",
    "isin": "INE758T01015",
    "growwSymbol": "NSE-ETERNAL",
    "growwTradingSymbol": "ETERNAL"
  },
  "GRASIM": {
    "name": "Grasim Industries Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE047A01021",
    "isin": "INE047A01021",
    "growwSymbol": "NSE-GRASIM",
    "growwTradingSymbol": "GRASIM"
  },
  "HCLTECH": {
    "name": "HCL Technologies Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE860A01027",
    "isin": "INE860A01027",
    "growwSymbol": "NSE-HCLTECH",
    "growwTradingSymbol": "HCLTECH"
  },
  "HDFCBANK": {
    "name": "HDFC Bank Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE040A01034",
    "isin": "INE040A01034",
    "growwSymbol": "NSE-HDFCBANK",
    "growwTradingSymbol": "HDFCBANK"
  },
  "HDFCLIFE": {
    "name": "HDFC Life Insurance Company Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE795G01014",
    "isin": "INE795G01014",
    "growwSymbol": "NSE-HDFCLIFE",
    "growwTradingSymbol": "HDFCLIFE"
  },
  "HINDALCO": {
    "name": "Hindalco Industries Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE038A01020",
    "isin": "INE038A01020",
    "growwSymbol": "NSE-HINDALCO",
    "growwTradingSymbol": "HINDALCO"
  },
  "HINDUNILVR": {
    "name": "Hindustan Unilever Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE030A01027",
    "isin": "INE030A01027",
    "growwSymbol": "NSE-HINDUNILVR",
    "growwTradingSymbol": "HINDUNILVR"
  },
  "ICICIBANK": {
    "name": "ICICI Bank Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE090A01021",
    "isin": "INE090A01021",
    "growwSymbol": "NSE-ICICIBANK",
    "growwTradingSymbol": "ICICIBANK"
  },
  "ITC": {
    "name": "ITC Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE154A01025",
    "isin": "INE154A01025",
    "growwSymbol": "NSE-ITC",
    "growwTradingSymbol": "ITC"
  },
  "INFY": {
    "name": "Infosys Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE009A01021",
    "isin": "INE009A01021",
    "growwSymbol": "NSE-INFY",
    "growwTradingSymbol": "INFY"
  },
  "INDIGO": {
    "name": "InterGlobe Aviation Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE646L01027",
    "isin": "INE646L01027",
    "growwSymbol": "NSE-INDIGO",
    "growwTradingSymbol": "INDIGO"
  },
  "JSWSTEEL": {
    "name": "JSW Steel Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE019A01038",
    "isin": "INE019A01038",
    "growwSymbol": "NSE-JSWSTEEL",
    "growwTradingSymbol": "JSWSTEEL"
  },
  "JIOFIN": {
    "name": "Jio Financial Services Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE758E01017",
    "isin": "INE758E01017",
    "growwSymbol": "NSE-JIOFIN",
    "growwTradingSymbol": "JIOFIN"
  },
  "KOTAKBANK": {
    "name": "Kotak Mahindra Bank Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE237A01036",
    "isin": "INE237A01036",
    "growwSymbol": "NSE-KOTAKBANK",
    "growwTradingSymbol": "KOTAKBANK"
  },
  "LT": {
    "name": "Larsen & Toubro Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE018A01030",
    "isin": "INE018A01030",
    "growwSymbol": "NSE-LT",
    "growwTradingSymbol": "LT"
  },
  "M&M": {
    "name": "Mahindra & Mahindra Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE101A01026",
    "isin": "INE101A01026",
    "growwSymbol": "NSE-M&M",
    "growwTradingSymbol": "M&M"
  },
  "MARUTI": {
    "name": "Maruti Suzuki India Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE585B01010",
    "isin": "INE585B01010",
    "growwSymbol": "NSE-MARUTI",
    "growwTradingSymbol": "MARUTI"
  },
  "MAXHEALTH": {
    "name": "Max Healthcare Institute Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE027H01010",
    "isin": "INE027H01010",
    "growwSymbol": "NSE-MAXHEALTH",
    "growwTradingSymbol": "MAXHEALTH"
  },
  "NTPC": {
    "name": "NTPC Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE733E01010",
    "isin": "INE733E01010",
    "growwSymbol": "NSE-NTPC",
    "growwTradingSymbol": "NTPC"
  },
  "NESTLEIND": {
    "name": "Nestle India Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE239A01024",
    "isin": "INE239A01024",
    "growwSymbol": "NSE-NESTLEIND",
    "growwTradingSymbol": "NESTLEIND"
  },
  "ONGC": {
    "name": "Oil & Natural Gas Corporation Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE213A01029",
    "isin": "INE213A01029",
    "growwSymbol": "NSE-ONGC",
    "growwTradingSymbol": "ONGC"
  },
  "POWERGRID": {
    "name": "Power Grid Corporation of India Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE752E01010",
    "isin": "INE752E01010",
    "growwSymbol": "NSE-POWERGRID",
    "growwTradingSymbol": "POWERGRID"
  },
  "RELIANCE": {
    "name": "Reliance Industries Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE002A01018",
    "isin": "INE002A01018",
    "growwSymbol": "NSE-RELIANCE",
    "growwTradingSymbol": "RELIANCE"
  },
  "SBILIFE": {
    "name": "SBI Life Insurance Company Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE123W01016",
    "isin": "INE123W01016",
    "growwSymbol": "NSE-SBILIFE",
    "growwTradingSymbol": "SBILIFE"
  },
  "SHRIRAMFIN": {
    "name": "Shriram Finance Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE721A01047",
    "isin": "INE721A01047",
    "growwSymbol": "NSE-SHRIRAMFIN",
    "growwTradingSymbol": "SHRIRAMFIN"
  },
  "SBIN": {
    "name": "State Bank of India",
    "upstoxInstrumentKey": "NSE_EQ|INE062A01020",
    "isin": "INE062A01020",
    "growwSymbol": "NSE-SBIN",
    "growwTradingSymbol": "SBIN"
  },
  "SUNPHARMA": {
    "name": "Sun Pharmaceutical Industries Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE044A01036",
    "isin": "INE044A01036",
    "growwSymbol": "NSE-SUNPHARMA",
    "growwTradingSymbol": "SUNPHARMA"
  },
  "TCS": {
    "name": "Tata Consultancy Services Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE467B01029",
    "isin": "INE467B01029",
    "growwSymbol": "NSE-TCS",
    "growwTradingSymbol": "TCS"
  },
  "TATACONSUM": {
    "name": "Tata Consumer Products Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE192A01025",
    "isin": "INE192A01025",
    "growwSymbol": "NSE-TATACONSUM",
    "growwTradingSymbol": "TATACONSUM"
  },
  "TMPV": {
    "name": "Tata Motors Passenger Vehicles Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE155A01022",
    "isin": "INE155A01022",
    "growwSymbol": "NSE-TMPV",
    "growwTradingSymbol": "TMPV"
  },
  "TATASTEEL": {
    "name": "Tata Steel Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE081A01020",
    "isin": "INE081A01020",
    "growwSymbol": "NSE-TATASTEEL",
    "growwTradingSymbol": "TATASTEEL"
  },
  "TECHM": {
    "name": "Tech Mahindra Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE669C01036",
    "isin": "INE669C01036",
    "growwSymbol": "NSE-TECHM",
    "growwTradingSymbol": "TECHM"
  },
  "TITAN": {
    "name": "Titan Company Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE280A01028",
    "isin": "INE280A01028",
    "growwSymbol": "NSE-TITAN",
    "growwTradingSymbol": "TITAN"
  },
  "TRENT": {
    "name": "Trent Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE849A01020",
    "isin": "INE849A01020",
    "growwSymbol": "NSE-TRENT",
    "growwTradingSymbol": "TRENT"
  },
  "ULTRACEMCO": {
    "name": "UltraTech Cement Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE481G01011",
    "isin": "INE481G01011",
    "growwSymbol": "NSE-ULTRACEMCO",
    "growwTradingSymbol": "ULTRACEMCO"
  },
  "WIPRO": {
    "name": "Wipro Ltd.",
    "upstoxInstrumentKey": "NSE_EQ|INE075A01022",
    "isin": "INE075A01022",
    "growwSymbol": "NSE-WIPRO",
    "growwTradingSymbol": "WIPRO"
  }
}
