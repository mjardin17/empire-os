#!/usr/bin/env node
// Boot smoke check: starts the Empire OS server, waits for GET /health to
// answer {"status":"online"}, then shuts it down. Exits non-zero on failure.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const port = process.env.SMOKE_PORT ?? '3199'
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 60000)
const dataDir = mkdtempSync(path.join(tmpdir(), 'empire-smoke-'))
const url = `http://localhost:${port}/health`

const child = spawn('pnpm', ['--filter', '@empire-os/server', 'start'], {
  env: { ...process.env, PORT: port, HOST: 'localhost', DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let output = ''
child.stdout.on('data', (d) => { output += d })
child.stderr.on('data', (d) => { output += d })
let exited = false
child.on('exit', () => { exited = true })

function stop() {
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  rmSync(dataDir, { recursive: true, force: true })
}

const deadline = Date.now() + timeoutMs
let ok = false
while (Date.now() < deadline && !exited) {
  try {
    const res = await fetch(url)
    const body = await res.json()
    if (res.ok && body.status === 'online') {
      if (!body.modules?.storyforge) {
        console.error('Smoke check failed: /health has no storyforge module')
        break
      }
      console.log(`Server answered ${url}: status=${body.status}, modules=${Object.keys(body.modules ?? {}).length}`)
      ok = true
      break
    }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 1000))
}
stop()
if (!ok) {
  console.error(`Smoke check failed: ${url} did not answer with status "online"${exited ? ' (server exited)' : ''}.`)
  console.error(output.slice(-4000))
  process.exit(1)
}
process.exit(0)
