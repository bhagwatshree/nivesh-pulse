// Non-secret runtime config for the Groww passthrough. No client id/secret
// here at all — the "quick manual token" path has the user paste a token
// they generated themselves from Groww's dashboard (see useGrowwSession).
// Only the proxy URL is needed, and it happens to be the same deployed
// Worker as Upstox today — kept as its own env var so the two integrations
// aren't code-coupled if that ever changes.

export interface GrowwRuntimeConfig {
  proxyUrl: string
}

function readConfig(): GrowwRuntimeConfig | null {
  const proxyUrl = import.meta.env.VITE_GROWW_PROXY_URL
  if (!proxyUrl) return null
  return { proxyUrl: proxyUrl.replace(/\/+$/, '') }
}

export const growwConfig = readConfig()
export const isGrowwConfigured = growwConfig !== null
