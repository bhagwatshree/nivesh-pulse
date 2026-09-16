import { describe, expect, it } from 'vitest'
import { AuthCallbackError, buildAuthorizeUrl, generateState, parseAuthCallback } from '../auth'

describe('buildAuthorizeUrl', () => {
  it('builds the documented Upstox authorize-dialog URL with all required params', () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: 'abc123', redirectUri: 'https://example.com/callback' }, 'my-state'),
    )
    expect(url.origin + url.pathname).toBe('https://api.upstox.com/v2/login/authorization/dialog')
    expect(url.searchParams.get('client_id')).toBe('abc123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('my-state')
  })
})

describe('parseAuthCallback', () => {
  it('returns null when the query string carries no OAuth params', () => {
    expect(parseAuthCallback('')).toBeNull()
    expect(parseAuthCallback('?foo=bar')).toBeNull()
  })

  it('extracts code and state from a successful callback', () => {
    const result = parseAuthCallback('?code=abc&state=xyz')
    expect(result).toEqual({ code: 'abc', state: 'xyz' })
  })

  it('extracts code with a null state when Upstox omits it', () => {
    const result = parseAuthCallback('?code=abc')
    expect(result).toEqual({ code: 'abc', state: null })
  })

  it('throws AuthCallbackError when Upstox reports an error instead of a code', () => {
    expect(() => parseAuthCallback('?error=access_denied&error_description=User+declined')).toThrow(
      AuthCallbackError,
    )
  })
})

describe('generateState', () => {
  it('generates a non-empty, unique value on each call', () => {
    const a = generateState()
    const b = generateState()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})
