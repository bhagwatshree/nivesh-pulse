import { afterEach, describe, expect, it, vi } from 'vitest'
import { exchangeCode, fetchIntradayCandles, fetchQuotes, UpstoxProxyError } from '../client'

const PROXY = 'https://proxy.example.workers.dev'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exchangeCode', () => {
  it('POSTs to /auth/exchange with the code and redirect_uri, and returns the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok_123' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await exchangeCode(PROXY, 'auth-code', 'https://example.com/callback')

    expect(result).toEqual({ access_token: 'tok_123' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${PROXY}/auth/exchange`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ code: 'auth-code', redirect_uri: 'https://example.com/callback' })
  })

  it('throws UpstoxProxyError with the status and body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
    )
    await expect(exchangeCode(PROXY, 'bad-code', 'https://example.com/callback')).rejects.toThrow(UpstoxProxyError)
  })
})

describe('fetchIntradayCandles', () => {
  it('GETs /api/candles with the instrument key, unit, interval, and bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchIntradayCandles(PROXY, 'tok_123', 'NSE_EQ|INE002A01018', 'minutes', '5')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${PROXY}/api/candles?instrument_key=NSE_EQ%7CINE002A01018&unit=minutes&interval=5`)
    expect(init.headers.Authorization).toBe('Bearer tok_123')
  })
})

describe('fetchQuotes', () => {
  it('GETs /api/quotes with a comma-joined instrument key list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchQuotes(PROXY, 'tok_123', ['NSE_EQ|A', 'NSE_EQ|B'])

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(`${PROXY}/api/quotes?instrument_key=NSE_EQ%7CA%2CNSE_EQ%7CB`)
  })
})
