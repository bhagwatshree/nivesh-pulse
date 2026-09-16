// Thin fetch wrappers around server/upstox-proxy (never the Upstox API
// directly — see that package's README for why). Kept free of any parsing
// logic beyond "is this JSON, did the proxy report an error" so the actual
// response-shape handling in mappers.ts can be tested against fixtures
// independent of network behavior.

export class UpstoxProxyError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'UpstoxProxyError'
    this.status = status
    this.body = body
  }
}

async function parseJsonOrThrow(response: Response, context: string): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new UpstoxProxyError(`${context} failed (HTTP ${response.status})`, response.status, body)
  }
  return body
}

export interface TokenResponse {
  access_token: string
  [key: string]: unknown
}

export async function exchangeCode(proxyUrl: string, code: string, redirectUri: string): Promise<TokenResponse> {
  const response = await fetch(`${proxyUrl}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
  return parseJsonOrThrow(response, 'Token exchange') as Promise<TokenResponse>
}

export type CandleUnit = 'minutes' | 'hours' | 'days'

export async function fetchIntradayCandles(
  proxyUrl: string,
  accessToken: string,
  instrumentKey: string,
  unit: CandleUnit = 'minutes',
  interval = '5',
): Promise<unknown> {
  const url = `${proxyUrl}/api/candles?instrument_key=${encodeURIComponent(instrumentKey)}&unit=${encodeURIComponent(unit)}&interval=${encodeURIComponent(interval)}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  return parseJsonOrThrow(response, 'Candle fetch')
}

export async function fetchQuotes(proxyUrl: string, accessToken: string, instrumentKeys: string[]): Promise<unknown> {
  const url = `${proxyUrl}/api/quotes?instrument_key=${encodeURIComponent(instrumentKeys.join(','))}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  return parseJsonOrThrow(response, 'Quote fetch')
}
