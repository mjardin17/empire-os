#!/usr/bin/env node
// Boot smoke check: starts the Empire OS server, waits for GET /health to
// answer {"status":"online"}, checks the remote-app wiring through a fake
// Boss Listers, then shuts it down. Exits non-zero on failure.
import { spawn } from 'node:child_process'
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
  env: { ...process.env, PORT: port, HOST: 'localhost', DATA_DIR: dataDir, BOSSLISTERS_BASE_URL: fakeUrl, BOSSLISTERS_EMPIRE_KEY: SMOKE_KEY },
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
  const res = await fetch(`${base}/bosslisters/empire/listings?limit=3`)
  const listings = await res.json()
  if (res.status !== 200 || listings.items?.[0]?.sku !== 'SMOKE-1') return `/bosslisters/empire/listings answered ${res.status}: ${JSON.stringify(listings)}`
  if (listings.query !== '/empire/listings?limit=3') return `query string not passed on: ${listings.query}`
  if (!fakeCalls.some((c) => c.url?.startsWith('/empire/listings') && c.key === SMOKE_KEY)) return 'X-Empire-Key was not sent to Boss Listers'
  const blocked = await fetch(`${base}/bosslisters/api/stock`)
  if (blocked.status !== 404 || fakeCalls.some((c) => c.url === '/api/stock')) return 'an undeclared Boss Listers route was proxied'
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
      console.log(`Server answered ${url}: status=${body.status}, modules=${Object.keys(body.modules ?? {}).length}; bosslisters proxied OK`)
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
