// OAuth2 authorization-code flow against Upstox's login dialog. Contract
// verified against https://upstox.com/developer/api-documentation/authentication
// (fetched 2026-09-16):
//   authorize: GET https://api.upstox.com/v2/login/authorization/dialog
//              ?client_id=&redirect_uri=&response_type=code&state=
//   callback:  redirect_uri?code=...&state=...  (or ?error=...)
//   exchange:  POST https://api.upstox.com/v2/login/authorization/token
//              (handled server-side in server/upstox-proxy — never here,
//               it needs the client secret)

export interface UpstoxAuthConfig {
  clientId: string
  redirectUri: string
}

export function buildAuthorizeUrl(config: UpstoxAuthConfig, state: string): string {
  const url = new URL('https://api.upstox.com/v2/login/authorization/dialog')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export interface AuthCallbackResult {
  code: string
  state: string | null
}

export class AuthCallbackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthCallbackError'
  }
}

/**
 * Parses the query string Upstox appends to the redirect URI after login.
 * Returns null if this isn't an OAuth callback at all (e.g. a normal page
 * load with no query params) so the caller can tell "not a callback" apart
 * from "callback carrying an error."
 */
export function parseAuthCallback(search: string): AuthCallbackResult | null {
  const params = new URLSearchParams(search)
  const error = params.get('error')
  if (error) {
    throw new AuthCallbackError(params.get('error_description') ?? error)
  }
  const code = params.get('code')
  if (!code) return null
  return { code, state: params.get('state') }
}

/** A fresh per-attempt value to guard against CSRF on the OAuth redirect. */
export function generateState(): string {
  return crypto.randomUUID()
}
