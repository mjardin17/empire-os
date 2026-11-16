/**
 * EMPIRE_API_KEY helpers for the Empire OS HTTP server. Pure functions, no I/O.
 *
 * A caller proves it knows the key in one of two ways:
 *   - header  X-Empire-Api-Key: <key>        (CrossPost dashboard, scripts, other apps)
 *   - cookie  empire_session=<token>         (the server's own HTML pages, after /unlock)
 * The cookie holds a token derived from the key, never the key itself.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

export const API_KEY_HEADER = 'x-empire-api-key'
export const SESSION_COOKIE = 'empire_session'
export const DEFAULT_DASHBOARD_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']

const sha256 = (v: string): Buffer => createHash('sha256').update(v).digest()

/** Constant-time comparison (hashing first makes the lengths equal). */
export function safeEqual(given: string | undefined | null, expected: string): boolean {
  if (typeof given !== 'string' || !given) return false
  return timingSafeEqual(sha256(given), sha256(expected))
}

/** The cookie value for a key: a one-way token, so the cookie never contains the key. */
export function sessionToken(apiKey: string): string {
  return createHash('sha256').update(`empire-os-session:${apiKey}`).digest('hex')
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    const name = part.slice(0, i).trim()
    const value = part.slice(i + 1).trim()
    try { out[name] = decodeURIComponent(value) } catch { out[name] = value }
  }
  return out
}

type Headers = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

export type AuthResult =
  | { ok: true; via: 'disabled' | 'public' | 'header' | 'cookie' }
  | { ok: false; reason: 'missing' | 'wrong' }

/**
 * Is this request allowed? With no apiKey, auth is off. Public paths are always open.
 */
export function checkRequest(opts: { apiKey?: string; path: string; headers: Headers; publicPaths: Set<string> }): AuthResult {
  const { apiKey, path, headers, publicPaths } = opts
  if (!apiKey) return { ok: true, via: 'disabled' }
  if (publicPaths.has(path)) return { ok: true, via: 'public' }
  const given = first(headers[API_KEY_HEADER])
  if (given) return safeEqual(given, apiKey) ? { ok: true, via: 'header' } : { ok: false, reason: 'wrong' }
  const cookie = parseCookies(first(headers.cookie))[SESSION_COOKIE]
  if (cookie) return safeEqual(cookie, sessionToken(apiKey)) ? { ok: true, via: 'cookie' } : { ok: false, reason: 'wrong' }
  return { ok: false, reason: 'missing' }
}

/** EMPIRE_ALLOWED_ORIGINS: comma-separated origins; default the CrossPost dashboard on :3000. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  const list = (value ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
  return list.length ? list : DEFAULT_DASHBOARD_ORIGINS
}

/**
 * Access-Control-Allow-Origin for a request. Without an API key every origin is allowed ('*'),
 * as before. With a key only the listed dashboard origins are (echoed back), others get none.
 */
export function corsAllowOrigin(opts: { apiKey?: string; origin: string | undefined; allowedOrigins: string[] }): string | null {
  if (!opts.apiKey) return '*'
  if (!opts.origin) return null
  return opts.allowedOrigins.includes(opts.origin) ? opts.origin : null
}

/** A safe local redirect target ("/x/y?z"), or "/" for anything else (no other hosts). */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/'
  return next
}

/** Set-Cookie header for the session cookie (or for clearing it). */
export function sessionCookie(apiKey: string | null, opts: { maxAgeDays?: number } = {}): string {
  if (!apiKey) return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  const maxAge = Math.round((opts.maxAgeDays ?? 30) * 86400)
  return `${SESSION_COOKIE}=${sessionToken(apiKey)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
}
