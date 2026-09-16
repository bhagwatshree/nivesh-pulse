// Thin, stateless proxy in front of Upstox's REST API.
//
// It exists for exactly one reason: the OAuth authorization-code exchange
// requires UPSTOX_CLIENT_SECRET, which must never reach the browser. Every
// other route here (candles, quotes) does NOT need the secret — it just
// forwards the caller's own bearer token to Upstox and relays the response,
// which also sidesteps whatever CORS policy Upstox's API applies to direct
// browser calls (unverified either way, and irrelevant once this proxy is
// in the path).
//
// This worker holds no state and no user data: it never stores an access
// token, never sees anything beyond a single request/response.

export interface Env {
  UPSTOX_CLIENT_ID: string
  UPSTOX_CLIENT_SECRET: string
  ALLOWED_ORIGINS: string
}

const UPSTOX_API = 'https://api.upstox.com'

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, extraHeaders: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

async function handleExchange(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  let body: { code?: string; redirect_uri?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, cors)
  }
  if (!body.code || !body.redirect_uri) {
    return json({ error: 'missing_code_or_redirect_uri' }, 400, cors)
  }

  const form = new URLSearchParams({
    code: body.code,
    client_id: env.UPSTOX_CLIENT_ID,
    client_secret: env.UPSTOX_CLIENT_SECRET,
    redirect_uri: body.redirect_uri,
    grant_type: 'authorization_code',
  })

  const upstream = await fetch(`${UPSTOX_API}/v2/login/authorization/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })

  const data = await upstream.json()
  // Deliberately not logged or persisted anywhere — relayed straight through.
  return json(data, upstream.status, cors)
}

async function handleCandles(request: Request, url: URL, cors: HeadersInit): Promise<Response> {
  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization_header' }, 401, cors)

  const instrumentKey = url.searchParams.get('instrument_key')
  const unit = url.searchParams.get('unit') ?? 'minutes'
  const interval = url.searchParams.get('interval') ?? '5'
  if (!instrumentKey) return json({ error: 'missing_instrument_key' }, 400, cors)

  const upstreamUrl =
    `${UPSTOX_API}/v3/historical-candle/intraday/` +
    `${encodeURIComponent(instrumentKey)}/${encodeURIComponent(unit)}/${encodeURIComponent(interval)}`

  const upstream = await fetch(upstreamUrl, {
    headers: { Authorization: auth, Accept: 'application/json' },
  })
  const data = await upstream.json()
  return json(data, upstream.status, cors)
}

async function handleQuotes(request: Request, url: URL, cors: HeadersInit): Promise<Response> {
  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization_header' }, 401, cors)

  const instrumentKey = url.searchParams.get('instrument_key')
  if (!instrumentKey) return json({ error: 'missing_instrument_key' }, 400, cors)

  const upstreamUrl = `${UPSTOX_API}/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`
  const upstream = await fetch(upstreamUrl, {
    headers: { Authorization: auth, Accept: 'application/json' },
  })
  const data = await upstream.json()
  return json(data, upstream.status, cors)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const cors = corsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const url = new URL(request.url)

    if (url.pathname === '/auth/exchange' && request.method === 'POST') {
      return handleExchange(request, env, cors)
    }
    if (url.pathname === '/api/candles' && request.method === 'GET') {
      return handleCandles(request, url, cors)
    }
    if (url.pathname === '/api/quotes' && request.method === 'GET') {
      return handleQuotes(request, url, cors)
    }
    if (url.pathname === '/health') {
      return json({ status: 'ok' }, 200, cors)
    }

    return json({ error: 'not_found' }, 404, cors)
  },
}
