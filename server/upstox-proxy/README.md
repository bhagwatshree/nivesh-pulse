# nivesh-pulse-upstox-proxy

A Cloudflare Worker that stands between the NiveshPulse frontend and the
Upstox/Groww APIs. Its jobs: hold `UPSTOX_CLIENT_SECRET` somewhere the
browser can never read it; relay the OAuth token exchange and the
(bearer-token-authenticated) candle/quote requests; and — the one place it
holds state — persist the day's session token and the Nifty 50 screener's
latest results in KV, so the GitHub Actions scan job
(`.github/workflows/screener-scan.yml`, `scripts/run-screener-scan.ts`) can
run without a browser session or any credential of its own. See that
workflow for the scan side of this.

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
5. Create the KV namespace and add its `id` to `wrangler.toml` under `[[kv_namespaces]] binding = "NIVESH_KV"` (already done for this deployment — only needed once per Cloudflare account):
   ```
   npx wrangler kv namespace create NIVESH_KV
   ```
6. Generate a random shared secret and set it both here and as a GitHub Actions secret on the repo (must be the exact same value in both places):
   ```
   wrangler secret put SCAN_SHARED_SECRET
   gh secret set SCAN_SHARED_SECRET --repo <owner>/<repo>
   ```
7. Deploy:
   ```
   npm run deploy
   ```
   Wrangler prints the deployed URL, e.g. `https://nivesh-pulse-upstox-proxy.<your-subdomain>.workers.dev`.
8. Put that URL into the frontend's `VITE_UPSTOX_PROXY_URL` / `VITE_GROWW_PROXY_URL` environment variables (see the repo root `.env.example`) and into `PROXY_URL` if it differs from the default hardcoded in `scripts/run-screener-scan.ts`.

## Routes

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/auth/exchange` | POST `{code, redirect_uri}` | none | Exchanges an OAuth authorization code for an access token. The only route that touches the client secret. |
| `/api/candles?instrument_key=&unit=&interval=` | GET | `Authorization: Bearer <token>` from the caller | Proxies Upstox's Intraday Candle Data V3. |
| `/api/quotes?instrument_key=` | GET | `Authorization: Bearer <token>` from the caller | Proxies Upstox's full market quote endpoint. |
| `/health` | GET | none | Liveness check. |
| `/groww/quote?exchange=&segment=&trading_symbol=` | GET | `Authorization: Bearer <token>` from the caller | Proxies Groww's live quote endpoint — needed purely because Groww's API sends no CORS headers, not because of a secret. |
| `/groww/candles?...` | GET | `Authorization: Bearer <token>` from the caller | Proxies Groww's historical candles endpoint. |
| `/groww/register-token` | POST `{token}` | none | Registers a manually-pasted Groww token into KV, same purpose as the Upstox exchange persisting its token automatically — lets the screener scan use it later today. |
| `/internal/token` | GET | `Authorization: Bearer <SCAN_SHARED_SECRET>` | Returns whichever provider's token is currently stored (Upstox preferred, Groww fallback), or `{provider: null}` if none. Called by the GitHub Actions scan job only. |
| `/internal/screener` | POST | `Authorization: Bearer <SCAN_SHARED_SECRET>` | The scan job publishes its results here after each run. |
| `/screener/latest` | GET | none (public, read-only) | The frontend polls this for the current top-10 list. |
| `/webhook/postback`, `/webhook/notifier` | GET/POST | none | Order-update callback URLs for Upstox app registration. Always returns 200; this app doesn't place real orders through Upstox yet, so there's nothing to act on the payload for. Point the app's "Postback URL" / "Notifier Webhook Endpoint" fields here once deployed. |

CORS is restricted to the origins listed in `wrangler.toml`'s `ALLOWED_ORIGINS` for browser-facing routes. The `/internal/*` routes are meant for server-to-server calls (the GitHub Actions runner) and don't rely on CORS for protection — the shared-secret bearer check is what actually gates them.

## KV keys

| Key | Written by | Read by |
| --- | --- | --- |
| `token:upstox` | `/auth/exchange` on a successful exchange | `/internal/token` |
| `token:groww` | `/groww/register-token` | `/internal/token` |
| `screener:latest` | `/internal/screener` | `/screener/latest` |

Tokens expire out of KV after ~20 hours (`expirationTtl`) — comfortably covers same-day reuse without holding a stale credential indefinitely.
