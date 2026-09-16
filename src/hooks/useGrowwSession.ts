import { useCallback, useState } from 'react'
import { isGrowwConfigured } from '../config/groww'

const STORAGE_KEY = 'nivesh-pulse:groww-token'

export type GrowwSessionStatus = 'unconfigured' | 'disconnected' | 'connected'

export interface GrowwSession {
  status: GrowwSessionStatus
  accessToken: string | null
  /** Sets a manually-generated token (from Groww's own dashboard). Expires ~6 AM IST daily — that's Groww's limit, not ours. */
  setToken: (token: string) => void
  disconnect: () => void
}

function loadToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Holds a manually-pasted Groww access token for the tab's lifetime. There
 * is no OAuth flow here by design — this is the "quick manual token" path:
 * the user generates a token themselves from Groww's web dashboard and
 * pastes it in. No secret ever touches this app.
 */
export function useGrowwSession(): GrowwSession {
  const [accessToken, setAccessToken] = useState<string | null>(() => loadToken())
  const [status, setStatus] = useState<GrowwSessionStatus>(() => {
    if (!isGrowwConfigured) return 'unconfigured'
    return loadToken() ? 'connected' : 'disconnected'
  })

  const setToken = useCallback((token: string) => {
    const trimmed = token.trim()
    if (!trimmed) return
    try {
      sessionStorage.setItem(STORAGE_KEY, trimmed)
    } catch {
      /* token just won't persist across a refresh in this context */
    }
    setAccessToken(trimmed)
    setStatus('connected')
  }, [])

  const disconnect = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setAccessToken(null)
    setStatus(isGrowwConfigured ? 'disconnected' : 'unconfigured')
  }, [])

  return { status, accessToken, setToken, disconnect }
}
