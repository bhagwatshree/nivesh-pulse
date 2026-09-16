// Thin, stateless proxy in front of Upstox's and Groww's REST APIs.
// (Named upstox-proxy from when it only did one — the Groww routes were
// added later as a same-shape passthrough; a rename is cosmetic cleanup,
// not urgent.)
//
// For Upstox: exists because the OAuth authorization-code exchange
// requires UPSTOX_CLIENT_SECRET, which must never reach the browser. The
// candle/quote routes don't need the secret — they just forward the
// caller's own bearer token to Upstox and relay the response, which also
// sidesteps whatever CORS policy Upstox's API applies to direct browser
// calls (unverified either way, and irrelevant once this proxy is in the
// path).
//
// For Groww: no secret is involved at all in this pathway — the caller
// pastes a token they generated themselves from Groww's dashboard. This
// proxy exists purely because Groww's API doesn't send
// Access-Control-Allow-Origin headers (confirmed by direct request — see
// commit history), so a browser can't call it directly regardless of the
// token being valid.
//
// This worker holds no state and no user data: it never stores an access
// token, never sees anything beyond a single request/response.

export interface Env {
  UPSTOX_CLIENT_ID: string
  UPSTOX_CLIENT_SECRET: string
  ALLOWED_ORIGINS: string
}

const UPSTOX_API = 'https://api.upstox.com'
const GROWW_API = 'https://api.groww.in'

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
  // Deliberately not logged or persisted anywhere — relayed straight
  // through. (A prior version of this function logged the full upstream
  // response for debugging, which included the live access_token — never
  // log this response body. See git history if a status-only diagnostic is
  // ever needed again; log upstream.status alone, never `data`.)
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

async function handleGrowwQuote(request: Request, url: URL, cors: HeadersInit): Promise<Response> {
  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization_header' }, 401, cors)

  const exchange = url.searchParams.get('exchange') ?? 'NSE'
  const segment = url.searchParams.get('segment') ?? 'CASH'
  const tradingSymbol = url.searchParams.get('trading_symbol')
  if (!tradingSymbol) return json({ error: 'missing_trading_symbol' }, 400, cors)

  const upstreamUrl =
    `${GROWW_API}/v1/live-data/quote?exchange=${encodeURIComponent(exchange)}` +
    `&segment=${encodeURIComponent(segment)}&trading_symbol=${encodeURIComponent(tradingSymbol)}`

  const upstream = await fetch(upstreamUrl, {
    headers: { Authorization: auth, Accept: 'application/json', 'X-API-VERSION': '1.0' },
  })
  const data = await upstream.json()
  return json(data, upstream.status, cors)
}

async function handleGrowwCandles(request: Request, url: URL, cors: HeadersInit): Promise<Response> {
  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization_header' }, 401, cors)

  const exchange = url.searchParams.get('exchange') ?? 'NSE'
  const segment = url.searchParams.get('segment') ?? 'CASH'
  const growwSymbol = url.searchParams.get('groww_symbol')
  const startTime = url.searchParams.get('start_time')
  const endTime = url.searchParams.get('end_time')
  const candleInterval = url.searchParams.get('candle_interval') ?? '5minute'
  if (!growwSymbol || !startTime || !endTime) {
    return json({ error: 'missing_groww_symbol_or_time_range' }, 400, cors)
  }

  const params = new URLSearchParams({
    exchange,
    segment,
    groww_symbol: growwSymbol,
    start_time: startTime,
    end_time: endTime,
    candle_interval: candleInterval,
  })
  const upstream = await fetch(`${GROWW_API}/v1/historical/candles?${params.toString()}`, {
    headers: { Authorization: auth, Accept: 'application/json', 'X-API-VERSION': '1.0' },
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
    if (url.pathname === '/groww/quote' && request.method === 'GET') {
      return handleGrowwQuote(request, url, cors)
    }
    if (url.pathname === '/groww/candles' && request.method === 'GET') {
      return handleGrowwCandles(request, url, cors)
    }
    if (url.pathname === '/health') {
      return json({ status: 'ok' }, 200, cors)
    }

    // Upstox's order-update Postback URL and Notifier Webhook Endpoint both
    // require: no auth, a 2xx response, open to POST (some setups also
    // GET-probe the URL first to check reachability, so both are accepted
    // here). This app doesn't place real orders through Upstox yet — paper
    // fills stay simulated client-side — so there's nothing to act on the
    // payload for right now. This exists so app registration has a real,
    // working URL to point at instead of a placeholder.
    if (url.pathname === '/webhook/postback' || url.pathname === '/webhook/notifier') {
      if (request.method === 'POST' || request.method === 'GET') {
        return json({ status: 'ok' }, 200, cors)
      }
    }

    return json({ error: 'not_found' }, 404, cors)
  },
}
