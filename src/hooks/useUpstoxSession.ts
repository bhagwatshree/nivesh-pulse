import { useCallback, useEffect, useState } from 'react'
import { isUpstoxConfigured, upstoxConfig } from '../config/upstox'
import { AuthCallbackError, buildAuthorizeUrl, generateState, parseAuthCallback } from '../data/upstox/auth'
import { exchangeCode, UpstoxProxyError } from '../data/upstox/client'

const STORAGE_KEY = 'nivesh-pulse:upstox-session'
const STATE_KEY = 'nivesh-pulse:upstox-oauth-state'

interface StoredSession {
  accessToken: string
  obtainedAt: number
}

export type UpstoxSessionStatus = 'unconfigured' | 'disconnected' | 'connecting' | 'connected' | 'error'

export interface UpstoxSession {
  status: UpstoxSessionStatus
  accessToken: string | null
  error: string | null
  connect: () => void
  disconnect: () => void
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    // sessionStorage can throw in private-browsing/locked-down contexts —
    // treat that the same as "no session", not as a fatal error.
    return null
  }
}

function saveSession(session: StoredSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* session just won't persist across a refresh in this context */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Drives the Upstox OAuth flow: builds the authorize redirect, picks up the
 * ?code=/&state= (or ?error=) callback on the next load, exchanges the code
 * via server/upstox-proxy (never calls Upstox's token endpoint directly —
 * that needs the client secret), and holds the resulting access token in
 * sessionStorage for the tab's lifetime only.
 */
export function useUpstoxSession(): UpstoxSession {
  const [accessToken, setAccessToken] = useState<string | null>(() => loadStoredSession()?.accessToken ?? null)
  const [status, setStatus] = useState<UpstoxSessionStatus>(() => {
    if (!isUpstoxConfigured) return 'unconfigured'
    return loadStoredSession() ? 'connected' : 'disconnected'
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isUpstoxConfigured || !upstoxConfig) return

    let callback
    try {
      callback = parseAuthCallback(window.location.search)
    } catch (err) {
      if (err instanceof AuthCallbackError) {
        window.history.replaceState(null, '', window.location.pathname)
        setStatus('error')
        setError(err.message)
        return
      }
      throw err
    }
    if (!callback) return

    const expectedState = sessionStorage.getItem(STATE_KEY)
    window.history.replaceState(null, '', window.location.pathname)

    if (expectedState && callback.state !== expectedState) {
      setStatus('error')
      setError('Upstox login could not be verified (state mismatch) — please try connecting again.')
      return
    }

    setStatus('connecting')
    exchangeCode(upstoxConfig.proxyUrl, callback.code, upstoxConfig.redirectUri)
      .then((token) => {
        const session: StoredSession = { accessToken: token.access_token, obtainedAt: Date.now() }
        saveSession(session)
        setAccessToken(session.accessToken)
        setStatus('connected')
        setError(null)
      })
      .catch((err: unknown) => {
        setStatus('error')
        setError(err instanceof UpstoxProxyError ? err.message : 'Could not complete Upstox login.')
      })
    // Runs once on mount to consume the callback exactly one time.
  }, [])

  const connect = useCallback(() => {
    if (!isUpstoxConfigured || !upstoxConfig) return
    const state = generateState()
    sessionStorage.setItem(STATE_KEY, state)
    window.location.href = buildAuthorizeUrl(upstoxConfig, state)
  }, [])

  const disconnect = useCallback(() => {
    clearSession()
    setAccessToken(null)
    setStatus(isUpstoxConfigured ? 'disconnected' : 'unconfigured')
    setError(null)
  }, [])

  return { status, accessToken, error, connect, disconnect }
}
