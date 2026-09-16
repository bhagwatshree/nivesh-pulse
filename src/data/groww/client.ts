// Fetch wrappers for the Groww passthrough routes on server/upstox-proxy.
// Unlike the Upstox client, there's no client secret involved anywhere in
// this path — the caller supplies a token they generated themselves from
// Groww's dashboard. The proxy exists purely to get past Groww's API not
// sending CORS headers for browser origins.

export class GrowwProxyError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'GrowwProxyError'
    this.status = status
    this.body = body
  }
}

async function parseJsonOrThrow(response: Response, context: string): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new GrowwProxyError(`${context} failed (HTTP ${response.status})`, response.status, body)
  }
  return body
}

export async function fetchGrowwQuote(
  proxyUrl: string,
  accessToken: string,
  growwTradingSymbol: string,
  exchange = 'NSE',
  segment = 'CASH',
): Promise<unknown> {
  const url = `${proxyUrl}/groww/quote?exchange=${encodeURIComponent(exchange)}&segment=${encodeURIComponent(segment)}&trading_symbol=${encodeURIComponent(growwTradingSymbol)}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  return parseJsonOrThrow(response, 'Groww quote fetch')
}

export async function fetchGrowwCandles(
  proxyUrl: string,
  accessToken: string,
  growwSymbol: string,
  startTime: string,
  endTime: string,
  candleInterval = '5minute',
  exchange = 'NSE',
  segment = 'CASH',
): Promise<unknown> {
  const params = new URLSearchParams({
    exchange,
    segment,
    groww_symbol: growwSymbol,
    start_time: startTime,
    end_time: endTime,
    candle_interval: candleInterval,
  })
  const response = await fetch(`${proxyUrl}/groww/candles?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return parseJsonOrThrow(response, 'Groww candle fetch')
}
