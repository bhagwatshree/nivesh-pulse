// Non-secret runtime config, baked in at build time from .env.production
// (committed — see that file for why none of this is confidential) or from
// a local .env.local for `npm run dev`.

export interface UpstoxRuntimeConfig {
  clientId: string
  redirectUri: string
  proxyUrl: string
}

function readConfig(): UpstoxRuntimeConfig | null {
  const clientId = import.meta.env.VITE_UPSTOX_CLIENT_ID
  const redirectUri = import.meta.env.VITE_UPSTOX_REDIRECT_URI
  const proxyUrl = import.meta.env.VITE_UPSTOX_PROXY_URL
  if (!clientId || !redirectUri || !proxyUrl) return null
  // Trim trailing slashes so route-joining elsewhere doesn't need to guess.
  return { clientId, redirectUri, proxyUrl: proxyUrl.replace(/\/+$/, '') }
}

export const upstoxConfig = readConfig()
export const isUpstoxConfigured = upstoxConfig !== null
