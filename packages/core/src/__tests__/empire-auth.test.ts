import { describe, it, expect } from 'vitest'
import {
  checkRequest, corsAllowOrigin, parseAllowedOrigins, parseCookies, safeEqual, safeNextPath,
  sessionCookie, sessionToken, SESSION_COOKIE, DEFAULT_DASHBOARD_ORIGINS,
} from '../http/empire-auth.js'

const KEY = 'test-key-0123456789abcdef'
const PUBLIC = new Set(['/', '/health', '/unlock', '/lock'])
const check = (path: string, headers: Record<string, string> = {}, opts: { noKey?: boolean } = {}) =>
  checkRequest({ apiKey: opts.noKey ? undefined : KEY, path, headers, publicPaths: PUBLIC })

describe('checkRequest', () => {
  it('lets everything through when no key is set', () => {
    expect(check('/providers', {}, { noKey: true })).toEqual({ ok: true, via: 'disabled' })
  })
  it('keeps public paths open with a key set', () => {
    expect(check('/health')).toEqual({ ok: true, via: 'public' })
    expect(check('/unlock')).toEqual({ ok: true, via: 'public' })
  })
  it('rejects a protected path with no key', () => {
    expect(check('/providers')).toEqual({ ok: false, reason: 'missing' })
  })
  it('accepts the right header and rejects a wrong one', () => {
    expect(check('/providers', { 'x-empire-api-key': KEY })).toEqual({ ok: true, via: 'header' })
    expect(check('/providers', { 'x-empire-api-key': 'nope' })).toEqual({ ok: false, reason: 'wrong' })
  })
  it('accepts the session cookie from /unlock, and not the raw key as a cookie', () => {
    expect(check('/providers', { cookie: `a=1; ${SESSION_COOKIE}=${sessionToken(KEY)}` })).toEqual({ ok: true, via: 'cookie' })
    expect(check('/providers', { cookie: `${SESSION_COOKIE}=${KEY}` })).toEqual({ ok: false, reason: 'wrong' })
    expect(check('/providers', { cookie: `${SESSION_COOKIE}=${sessionToken('other')}` })).toEqual({ ok: false, reason: 'wrong' })
  })
  it('a wrong header is not rescued by a valid cookie', () => {
    expect(check('/providers', { 'x-empire-api-key': 'nope', cookie: `${SESSION_COOKIE}=${sessionToken(KEY)}` }).ok).toBe(false)
  })
})

describe('session cookie', () => {
  it('never contains the key and is HttpOnly + SameSite=Strict', () => {
    const c = sessionCookie(KEY)
    expect(c).not.toContain(KEY)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Strict')
    expect(c).toContain(`${SESSION_COOKIE}=${sessionToken(KEY)}`)
  })
  it('clears with Max-Age=0', () => {
    expect(sessionCookie(null)).toContain('Max-Age=0')
  })
  it('token is stable per key and differs between keys', () => {
    expect(sessionToken(KEY)).toBe(sessionToken(KEY))
    expect(sessionToken(KEY)).not.toBe(sessionToken(KEY + 'x'))
  })
})

describe('safeEqual / parseCookies', () => {
  it('compares safely', () => {
    expect(safeEqual(KEY, KEY)).toBe(true)
    expect(safeEqual(KEY.slice(1), KEY)).toBe(false)
    expect(safeEqual('', KEY)).toBe(false)
    expect(safeEqual(undefined, KEY)).toBe(false)
  })
  it('parses cookie headers', () => {
    expect(parseCookies('a=1; b = two%20words ;bad')).toEqual({ a: '1', b: 'two words' })
    expect(parseCookies(undefined)).toEqual({})
  })
})

describe('CORS', () => {
  it('defaults to the CrossPost dashboard origins', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_DASHBOARD_ORIGINS)
    expect(parseAllowedOrigins('  ')).toEqual(DEFAULT_DASHBOARD_ORIGINS)
  })
  it('reads EMPIRE_ALLOWED_ORIGINS', () => {
    expect(parseAllowedOrigins('http://a.test, http://b.test:8080/ ')).toEqual(['http://a.test', 'http://b.test:8080'])
  })
  it("is '*' without a key (dev mode, unchanged)", () => {
    expect(corsAllowOrigin({ origin: 'http://evil.test', allowedOrigins: DEFAULT_DASHBOARD_ORIGINS })).toBe('*')
  })
  it('echoes only allowed origins when a key is set', () => {
    const o = { apiKey: KEY, allowedOrigins: DEFAULT_DASHBOARD_ORIGINS }
    expect(corsAllowOrigin({ ...o, origin: 'http://localhost:3000' })).toBe('http://localhost:3000')
    expect(corsAllowOrigin({ ...o, origin: 'http://evil.test' })).toBeNull()
    expect(corsAllowOrigin({ ...o, origin: undefined })).toBeNull()
  })
})

describe('safeNextPath', () => {
  it('only allows local paths', () => {
    expect(safeNextPath('/model-manager/?x=1')).toBe('/model-manager/?x=1')
    expect(safeNextPath('//evil.test/')).toBe('/')
    expect(safeNextPath('https://evil.test/')).toBe('/')
    expect(safeNextPath('/\\evil.test')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })
})
