#!/usr/bin/env node
// Boot smoke check: starts the Empire OS server, waits for GET /health to
// answer {"status":"online"}, checks the remote-app wiring through a fake
// Boss Listers, then shuts it down. Exits non-zero on failure.
//
//   node scripts/smoke-server.mjs              EMPIRE_API_KEY unset (auth off, CORS '*')
//   node scripts/smoke-server.mjs --with-key   EMPIRE_API_KEY set to a random throwaway key: checks the
//                                              header, the /unlock cookie, the HTML redirect and CORS
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

const port = process.env.SMOKE_PORT ?? '3199'
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 60000)
const dataDir = mkdtempSync(path.join(tmpdir(), 'empire-smoke-'))
const base = `http://localhost:${port}`
const url = `${base}/health`
const SMOKE_KEY = 'smoke-test-key'
const WITH_KEY = process.argv.includes('--with-key')
// A random throwaway key for this run only (never printed).
const EMPIRE_KEY = WITH_KEY ? randomBytes(32).toString('hex') : ''
const keyHeaders = WITH_KEY ? { 'X-Empire-Api-Key': EMPIRE_KEY } : {}
const DASHBOARD = 'http://localhost:3000'

// A stand-in for Boss Listers (no real app, data or selling site): just its Empire OS routes.
const fakeCalls = []
const fake = http.createServer((req, res) => {
  fakeCalls.push({ url: req.url, key: req.headers['x-empire-key'] })
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.url === '/empire/health') return json(200, { status: 'healthy', details: { module: 'bosslisters' }, checkedAt: new Date().toISOString() })
  if (req.headers['x-empire-key'] !== SMOKE_KEY) return json(401, { ok: false, error: 'Wrong X-Empire-Key' })
  if (req.url?.startsWith('/empire/listings')) return json(200, { ok: true, total: 1, items: [{ sku: 'SMOKE-1', title: 'Smoke item' }], query: req.url })
  json(404, { ok: false })
})
await new Promise((r) => fake.listen(0, '127.0.0.1', r))
const fakeUrl = `http://127.0.0.1:${fake.address().port}`

const child = spawn('pnpm', ['--filter', '@empire-os/server', 'start'], {
  env: { ...process.env, PORT: port, HOST: 'localhost', DATA_DIR: dataDir, BOSSLISTERS_BASE_URL: fakeUrl, BOSSLISTERS_EMPIRE_KEY: SMOKE_KEY,
    // Set explicitly (also when empty) so a local apps/empire-os-server/.env cannot change the mode.
    EMPIRE_API_KEY: EMPIRE_KEY, EMPIRE_ALLOWED_ORIGINS: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let output = ''
child.stdout.on('data', (d) => { output += d })
child.stderr.on('data', (d) => { output += d })
let exited = false
child.on('exit', () => { exited = true })

async function stop() {
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  // Wait for the server to exit so it stops writing into dataDir, then clean up best-effort.
  const exitDeadline = Date.now() + 10000
  while (!exited && Date.now() < exitDeadline) await new Promise((r) => setTimeout(r, 100))
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
  await new Promise((r) => fake.close(r))
}

async function checkRemoteApps(body) {
  for (const id of ['storyforge', 'bosslisters']) {
    if (!body.modules?.[id]) return `/health has no ${id} module`
  }
  if (body.modules.bosslisters.status !== 'healthy') return `bosslisters is ${body.modules.bosslisters.status}, expected healthy (fake app at ${fakeUrl})`
  const res = await fetch(`${base}/bosslisters/empire/listings?limit=3`, { headers: keyHeaders })
  const listings = await res.json()
  if (res.status !== 200 || listings.items?.[0]?.sku !== 'SMOKE-1') return `/bosslisters/empire/listings answered ${res.status}: ${JSON.stringify(listings)}`
  if (listings.query !== '/empire/listings?limit=3') return `query string not passed on: ${listings.query}`
  if (!fakeCalls.some((c) => c.url?.startsWith('/empire/listings') && c.key === SMOKE_KEY)) return 'X-Empire-Key was not sent to Boss Listers'
  const blocked = await fetch(`${base}/bosslisters/api/stock`, { headers: keyHeaders })
  if (blocked.status !== 404 || fakeCalls.some((c) => c.url === '/api/stock')) return 'an undeclared Boss Listers route was proxied'
  return WITH_KEY ? checkKeyMode() : checkOpenMode()
}

// EMPIRE_API_KEY unset: everything open, any origin (unchanged behaviour).
async function checkOpenMode() {
  const res = await fetch(`${base}/providers`, { headers: { Origin: 'http://elsewhere.test' } })
  if (res.status !== 200) return `/providers answered ${res.status} with no key set, expected 200`
  if (res.headers.get('access-control-allow-origin') !== '*') return `CORS is ${res.headers.get('access-control-allow-origin')}, expected *`
  return null
}

// EMPIRE_API_KEY set.
async function checkKeyMode() {
  const get = (p, headers = {}, extra = {}) => fetch(`${base}${p}`, { headers, redirect: 'manual', ...extra })
  let r = await get('/providers')
  if (r.status !== 401) return `/providers without the key answered ${r.status}, expected 401`
  if (!(await r.json()).locked) return '401 body has no locked flag'
  if ((r = await get('/providers', { 'X-Empire-Api-Key': 'wrong' })).status !== 401) return `wrong key answered ${r.status}, expected 401`
  if ((r = await get('/providers', keyHeaders)).status !== 200) return `right key answered ${r.status}, expected 200`
  if ((r = await get('/bosslisters/empire/listings?limit=1')).status !== 401) return `proxy without key answered ${r.status}, expected 401`

  // The server's own HTML pages: a browser without the key is sent to /unlock.
  r = await get('/empire-dashboard/', { Accept: 'text/html' })
  if (r.status !== 302 || !r.headers.get('location')?.startsWith('/unlock?next=')) return `locked page answered ${r.status} → ${r.headers.get('location')}, expected 302 → /unlock`
  if ((r = await get('/unlock')).status !== 200 || !(await r.text()).includes('Empire OS is locked')) return '/unlock page did not load'
  const form = (key) => ({ method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key, next: '/empire-dashboard/' }) })
  if ((r = await fetch(`${base}/unlock`, form('wrong'))).status !== 401 || r.headers.get('set-cookie')) return `wrong key on /unlock answered ${r.status}`
  r = await fetch(`${base}/unlock`, form(EMPIRE_KEY))
  const setCookie = r.headers.get('set-cookie') ?? ''
  if (r.status !== 303 || r.headers.get('location') !== '/empire-dashboard/') return `/unlock answered ${r.status} → ${r.headers.get('location')}`
  if (!/HttpOnly/.test(setCookie) || !/SameSite=Strict/.test(setCookie) || setCookie.includes(EMPIRE_KEY)) return 'session cookie is not HttpOnly/SameSite=Strict, or contains the key'
  const cookie = setCookie.split(';')[0]
  if ((r = await get('/providers', { Cookie: cookie })).status !== 200) return `cookie session answered ${r.status}, expected 200`
  if ((r = await get('/empire-dashboard/', { Cookie: cookie, Accept: 'text/html' })).status !== 200) return `dashboard page with cookie answered ${r.status}`
  r = await get('/goose/run', { Cookie: cookie, Origin: 'http://elsewhere.test', 'Content-Type': 'application/json' }, { method: 'POST', body: '{}' })
  if (r.status !== 403) return `cross-site POST riding the cookie answered ${r.status}, expected 403`

  // CORS: only the dashboard origin (default http://localhost:3000).
  r = await fetch(`${base}/providers`, { method: 'OPTIONS', headers: { Origin: DASHBOARD, 'Access-Control-Request-Headers': 'x-empire-api-key' } })
  if (r.status !== 204 || r.headers.get('access-control-allow-origin') !== DASHBOARD) return `preflight from ${DASHBOARD} answered ${r.status} / ${r.headers.get('access-control-allow-origin')}`
  r = await fetch(`${base}/providers`, { method: 'OPTIONS', headers: { Origin: 'http://elsewhere.test' } })
  if (r.status !== 403 || r.headers.get('access-control-allow-origin')) return `preflight from another origin answered ${r.status} / ${r.headers.get('access-control-allow-origin')}`
  r = await get('/health', { Origin: 'http://elsewhere.test' })
  if (r.status !== 200 || r.headers.get('access-control-allow-origin')) return '/health must stay open but must not grant CORS to other origins'
  return null
}

const deadline = Date.now() + timeoutMs
let ok = false
while (Date.now() < deadline && !exited) {
  try {
    const res = await fetch(url)
    const body = await res.json()
    if (res.ok && body.status === 'online') {
      const problem = await checkRemoteApps(body)
      if (problem) {
        console.error(`Smoke check failed: ${problem}`)
        break
      }
      console.log(`Server answered ${url}: status=${body.status}, modules=${Object.keys(body.modules ?? {}).length}; bosslisters proxied OK; ${WITH_KEY ? 'EMPIRE_API_KEY set: header, /unlock cookie, redirect and CORS OK' : 'EMPIRE_API_KEY unset: open, CORS *'}`)
      ok = true
      break
    }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 1000))
}
await stop()
if (!ok) {
  console.error(`Smoke check failed: ${url} did not pass${exited ? ' (server exited)' : ''}.`)
  console.error(output.slice(-4000))
  process.exit(1)
}
process.exit(0)
