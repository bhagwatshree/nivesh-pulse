# nivesh-pulse-upstox-proxy

A minimal, stateless Cloudflare Worker that stands between the NiveshPulse
frontend and the Upstox API. Its only job is to hold `UPSTOX_CLIENT_SECRET`
somewhere the browser can never read it, and to relay the OAuth token
exchange and the (bearer-token-authenticated) candle/quote requests.

It stores nothing. It sees each request once and forwards it.

## Setup

1. Install dependencies:
   ```
   cd server/upstox-proxy
   npm install
   ```
2. Log in to Cloudflare (free tier is enough):
   ```
   npx wrangler login
   ```
3. Register an app at https://upstox.com/developer/apps and set:
   - **Redirect URI**: `https://bhagwatshree.github.io/nivesh-pulse/` (must match exactly what the frontend sends — see `src/lib/upstoxAuth.ts`)
4. Put the client id in `wrangler.toml` under `[vars] UPSTOX_CLIENT_ID` (not secret — fine to commit) and the client secret into Cloudflare's secret store (never committed):
   ```
   npm run secret:client-secret
   ```
5. Deploy:
   ```
   npm run deploy
   ```
   Wrangler prints the deployed URL, e.g. `https://nivesh-pulse-upstox-proxy.<your-subdomain>.workers.dev`.
6. Put that URL into the frontend's `VITE_UPSTOX_PROXY_URL` environment variable (see the repo root `.env.example`).

## Routes

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/auth/exchange` | POST `{code, redirect_uri}` | none | Exchanges an OAuth authorization code for an access token. The only route that touches the client secret. |
| `/api/candles?instrument_key=&unit=&interval=` | GET | `Authorization: Bearer <token>` from the caller | Proxies Upstox's Intraday Candle Data V3. |
| `/api/quotes?instrument_key=` | GET | `Authorization: Bearer <token>` from the caller | Proxies Upstox's full market quote endpoint. |
| `/health` | GET | none | Liveness check. |
| `/webhook/postback`, `/webhook/notifier` | GET/POST | none | Order-update callback URLs for Upstox app registration. Always returns 200; this app doesn't place real orders through Upstox yet, so there's nothing to act on the payload for. Point the app's "Postback URL" / "Notifier Webhook Endpoint" fields here once deployed. |

CORS is restricted to the origins listed in `wrangler.toml`'s `ALLOWED_ORIGINS`.
