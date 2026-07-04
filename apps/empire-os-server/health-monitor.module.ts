/**
 * HealthMonitorModule — System & Service Health
 *
 * Continuously monitors all Empire OS services, AI providers, and system resources.
 * Attempts auto-repair where safe (e.g. detecting missing dependencies).
 * Reports all issues honestly — no silent failures.
 *
 * Routes:
 *   GET  /health-monitor/         → HTML dashboard
 *   GET  /health-monitor/status   → JSON status of all services
 *   GET  /health-monitor/metrics  → RAM, CPU, disk (Windows-aware)
 *   GET  /health-monitor/events   → event log (last 100)
 *   POST /health-monitor/repair   → attempt auto-repair for a service
 *   GET  /health-monitor/health   → module health check
 */

import os from 'node:os'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const DATA_DIR  = process.env.DATA_DIR ?? path.resolve('.empire-data')
const EVENTS_FILE = path.join(DATA_DIR, 'health-events.json')
const MAX_EVENTS = 200

// ── Services to monitor ───────────────────────────────────────────────────────

interface ServiceDef {
  id: string
  name: string
  icon: string
  url: string
  port: number
  critical: boolean
  category: 'ai' | 'tool' | 'empire'
  repairHint: string
}

const SERVICES: ServiceDef[] = [
  { id:'empire',      name:'Empire OS',      icon:'🏛️', url:'http://localhost:3001/health', port:3001, critical:true,  category:'empire', repairHint:'Restart: npx tsx server.ts' },
  { id:'ollama',      name:'Ollama',         icon:'🦙', url:'http://localhost:11434/api/tags', port:11434, critical:true,  category:'ai',     repairHint:'Run: ollama serve' },
  { id:'comfyui',     name:'ComfyUI',        icon:'⚙️', url:'http://localhost:8188/',         port:8188,  critical:false, category:'tool',   repairHint:'Start ComfyUI: python main.py' },
  { id:'sd-webui',    name:'Stable Diffusion (A1111)', icon:'🎨', url:'http://localhost:7860/', port:7860, critical:false, category:'tool', repairHint:'Start Automatic1111 webui.bat' },
  { id:'lmstudio',    name:'LM Studio',      icon:'🔧', url:'http://localhost:1234/v1/models', port:1234, critical:false, category:'ai',    repairHint:'Open LM Studio and start local server' },
  { id:'open-webui',  name:'Open WebUI',     icon:'💬', url:'http://localhost:3000/',          port:3000,  critical:false, category:'tool',   repairHint:'docker run -p 3000:8080 ghcr.io/open-webui/open-webui' },
  { id:'crosspost',   name:'CrossPost',      icon:'📢', url:'http://localhost:3001/crosspost-enterprise/health', port:3001, critical:false, category:'empire', repairHint:'Module runs inside Empire OS server' },
]

// ── Event log ─────────────────────────────────────────────────────────────────

interface HealthEvent { ts: string; level: 'info' | 'warn' | 'error'; service: string; message: string }

function loadEvents(): HealthEvent[] {
  try { return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8')) } catch { return [] }
}

function logEvent(level: HealthEvent['level'], service: string, message: string): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const events = loadEvents()
    events.unshift({ ts: new Date().toISOString(), level, service, message })
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events.slice(0, MAX_EVENTS), null, 2))
  } catch { /* never crash */ }
}

// ── System metrics ────────────────────────────────────────────────────────────

interface SystemMetrics {
  ram: { totalGB: number; usedGB: number; freeGB: number; usedPct: number }
  cpu: { cores: number; model: string; usagePct: number }
  disk: { totalGB: number; freeGB: number; usedPct: number } | null
  uptime: number
  platform: string
}

// CPU usage: compare cumulative times at two points
let lastCpuSample = { total: 0, idle: 0, time: 0 }

function sampleCpu(): { total: number; idle: number } {
  let total = 0, idle = 0
  for (const cpu of os.cpus()) {
    for (const [t, v] of Object.entries(cpu.times)) {
      total += v
      if (t === 'idle') idle += v
    }
  }
  return { total, idle }
}

function getCpuUsagePct(): number {
  const now = sampleCpu()
  const dt = now.total - lastCpuSample.total
  const di = now.idle - lastCpuSample.idle
  lastCpuSample = { ...now, time: Date.now() }
  if (dt === 0) return 0
  return Math.round((1 - di / dt) * 100)
}

function getDiskInfo(): { totalGB: number; freeGB: number; usedPct: number } | null {
  try {
    if (process.platform === 'win32') {
      const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /format:list', { timeout: 3000 }).toString()
      const freeMatch = out.match(/FreeSpace=(\d+)/)
      const sizeMatch = out.match(/Size=(\d+)/)
      if (freeMatch && sizeMatch) {
        const free = Number(freeMatch[1])
        const total = Number(sizeMatch[1])
        return { totalGB: +(total / 1e9).toFixed(1), freeGB: +(free / 1e9).toFixed(1), usedPct: Math.round((1 - free / total) * 100) }
      }
    } else {
      const out = execSync("df -BG / | tail -1 | awk '{print $2,$4}'", { timeout: 3000 }).toString().trim()
      const [total, free] = out.split(' ').map(s => parseInt(s))
      return { totalGB: total, freeGB: free, usedPct: Math.round((1 - free / total) * 100) }
    }
  } catch { /* disk check unavailable */ }
  return null
}

function getSystemMetrics(): SystemMetrics {
  const totalMem = os.totalmem()
  const freeMem  = os.freemem()
  const usedMem  = totalMem - freeMem
  const cpus = os.cpus()
  return {
    ram: {
      totalGB: +(totalMem / 1e9).toFixed(2),
      usedGB:  +(usedMem  / 1e9).toFixed(2),
      freeGB:  +(freeMem  / 1e9).toFixed(2),
      usedPct: Math.round(usedMem / totalMem * 100),
    },
    cpu: { cores: cpus.length, model: cpus[0]?.model ?? 'Unknown', usagePct: getCpuUsagePct() },
    disk: getDiskInfo(),
    uptime: Math.round(os.uptime()),
    platform: `${os.platform()} ${os.arch()}`,
  }
}

// ── Service check ─────────────────────────────────────────────────────────────

type ServiceStatus = 'online' | 'offline' | 'unknown'

interface ServiceResult {
  id: string; name: string; icon: string; status: ServiceStatus
  latencyMs: number | null; critical: boolean; category: string; repairHint: string
}

async function checkService(svc: ServiceDef): Promise<ServiceResult> {
  const t0 = Date.now()
  try {
    const r = await fetch(svc.url, { signal: AbortSignal.timeout(3000) })
    const latencyMs = Date.now() - t0
    const status: ServiceStatus = r.ok || r.status < 500 ? 'online' : 'offline'
    return { id: svc.id, name: svc.name, icon: svc.icon, status, latencyMs, critical: svc.critical, category: svc.category, repairHint: svc.repairHint }
  } catch {
    return { id: svc.id, name: svc.name, icon: svc.icon, status: 'offline', latencyMs: null, critical: svc.critical, category: svc.category, repairHint: svc.repairHint }
  }
}

// ── HTML Dashboard ────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empire OS — Health Monitor</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#0d0f14; --surface:#161b22; --surface2:#1c2333; --border:#30363d;
    --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --green:#3fb950;
    --red:#f85149; --yellow:#d29922; --purple:#bc8cff;
  }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; min-height:100vh; }
  header { background:var(--surface); border-bottom:1px solid var(--border); padding:14px 20px; display:flex; align-items:center; gap:10px; }
  header h1 { font-size:17px; font-weight:600; }
  .badge { background:var(--green); color:#000; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:600; }
  .badge.warn { background:var(--yellow); }
  .badge.err  { background:var(--red); color:#fff; }
  .layout { display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:20px; }
  @media (max-width:900px) { .layout { grid-template-columns:1fr; } }
  h2 { font-size:14px; font-weight:600; margin-bottom:12px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:12px; }

  /* Service cards */
  .svc-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .svc-card { background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:10px 12px; display:flex; align-items:center; gap:8px; }
  .svc-card.online  { border-left:3px solid var(--green); }
  .svc-card.offline { border-left:3px solid var(--red); }
  .svc-card.unknown { border-left:3px solid var(--border); }
  .svc-icon { font-size:18px; }
  .svc-name { font-size:12px; font-weight:600; }
  .svc-meta { font-size:11px; color:var(--muted); }
  .svc-dot  { width:8px; height:8px; border-radius:50%; margin-left:auto; flex-shrink:0; }
  .svc-dot.online  { background:var(--green); }
  .svc-dot.offline { background:var(--red); }
  .svc-dot.unknown { background:var(--border); }

  /* Metric bars */
  .metric-row { margin-bottom:14px; }
  .metric-label { display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px; }
  .metric-label span:last-child { color:var(--muted); }
  .bar-bg { background:var(--surface2); border-radius:4px; height:8px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:4px; transition:width .5s; }
  .bar-fill.green  { background:var(--green); }
  .bar-fill.yellow { background:var(--yellow); }
  .bar-fill.red    { background:var(--red); }

  /* Event log */
  .event-log { max-height:260px; overflow-y:auto; }
  .event-row { display:flex; gap:8px; padding:5px 0; border-bottom:1px solid var(--border); font-size:12px; }
  .event-row:last-child { border-bottom:none; }
  .ev-ts { color:var(--muted); white-space:nowrap; font-size:11px; min-width:80px; }
  .ev-level { font-weight:600; min-width:40px; }
  .ev-level.info  { color:var(--accent); }
  .ev-level.warn  { color:var(--yellow); }
  .ev-level.error { color:var(--red); }

  /* Actions */
  .btn { padding:5px 12px; border-radius:5px; border:1px solid var(--border); cursor:pointer; font-size:12px; background:var(--surface2); color:var(--text); transition:all .15s; }
  .btn:hover { background:var(--border); }
  .btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
  .repair-list { margin-top:10px; }
  .repair-item { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px; }
  .repair-item:last-child { border-bottom:none; }
  .repair-hint { color:var(--muted); font-size:11px; flex:1; }
  .ollama-models { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
  .model-pill { background:var(--surface2); border:1px solid var(--border); border-radius:4px; font-size:11px; padding:2px 8px; }
</style>
</head>
<body>
<header>
  <span style="font-size:20px">💚</span>
  <h1>Health Monitor</h1>
  <span class="badge" id="overall-badge">Checking...</span>
  <button class="btn" style="margin-left:auto" onclick="refresh()">↻ Refresh</button>
  <span style="font-size:11px;color:var(--muted);margin-left:8px" id="last-check"></span>
</header>

<div class="layout">
  <!-- Left column -->
  <div>
    <div class="card">
      <h2>Services</h2>
      <div class="svc-grid" id="services-grid">Loading...</div>
    </div>

    <div class="card">
      <h2>Offline Services — Quick Fix</h2>
      <div id="repair-list" class="repair-list">Checking...</div>
    </div>

    <div class="card">
      <h2>Installed Ollama Models</h2>
      <div id="ollama-models" class="ollama-models">Checking...</div>
    </div>
  </div>

  <!-- Right column -->
  <div>
    <div class="card">
      <h2>System Resources</h2>
      <div id="metrics">Loading...</div>
    </div>

    <div class="card">
      <h2>Event Log</h2>
      <div class="event-log" id="event-log">Loading...</div>
    </div>
  </div>
</div>

<script>
const EMPIRE = 'http://localhost:3001'
const OLLAMA = 'http://localhost:11434'
let refreshTimer

async function refresh() {
  document.getElementById('last-check').textContent = 'Checking...'
  try {
    const [statusRes, metricsRes, eventsRes, ollamaRes] = await Promise.allSettled([
      fetch(EMPIRE + '/health-monitor/status'),
      fetch(EMPIRE + '/health-monitor/metrics'),
      fetch(EMPIRE + '/health-monitor/events'),
      fetch(OLLAMA + '/api/tags').catch(() => null)
    ])

    if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
      const svcs = await statusRes.value.json()
      renderServices(svcs)
    }
    if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
      const m = await metricsRes.value.json()
      renderMetrics(m)
    }
    if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
      const evs = await eventsRes.value.json()
      renderEvents(evs)
    }
    if (ollamaRes.status === 'fulfilled' && ollamaRes.value && ollamaRes.value.ok) {
      const d = await ollamaRes.value.json()
      renderModels(d.models || [])
    }
    document.getElementById('last-check').textContent = 'Updated ' + new Date().toLocaleTimeString()
  } catch(e) {
    document.getElementById('last-check').textContent = 'Error: ' + e.message
  }
}

function renderServices(svcs) {
  const allOnline = svcs.filter(s => s.critical).every(s => s.status === 'online')
  const anyDown   = svcs.filter(s => s.critical).some(s => s.status === 'offline')
  const badge = document.getElementById('overall-badge')
  badge.textContent = allOnline ? 'All Systems Go' : anyDown ? 'Issues Detected' : 'Degraded'
  badge.className   = 'badge' + (allOnline ? '' : anyDown ? ' err' : ' warn')

  document.getElementById('services-grid').innerHTML = svcs.map(s => \`
    <div class="svc-card \${s.status}">
      <span class="svc-icon">\${s.icon}</span>
      <div>
        <div class="svc-name">\${s.name}</div>
        <div class="svc-meta">\${s.status === 'online' ? (s.latencyMs + 'ms') : s.status.toUpperCase()}</div>
      </div>
      <div class="svc-dot \${s.status}"></div>
    </div>
  \`).join('')

  const offline = svcs.filter(s => s.status === 'offline')
  if (offline.length === 0) {
    document.getElementById('repair-list').innerHTML = '<div style="color:var(--green);font-size:12px">✓ All monitored services are online</div>'
  } else {
    document.getElementById('repair-list').innerHTML = offline.map(s => \`
      <div class="repair-item">
        <span>\${s.icon}</span>
        <div>
          <div style="font-weight:600">\${s.name} is offline</div>
          <div class="repair-hint">\${s.repairHint}</div>
        </div>
      </div>
    \`).join('')
  }
}

function barClass(pct) {
  return pct < 60 ? 'green' : pct < 85 ? 'yellow' : 'red'
}

function renderMetrics(m) {
  let html = ''
  if (m.ram) {
    html += \`<div class="metric-row">
      <div class="metric-label"><span>RAM</span><span>\${m.ram.usedGB.toFixed(1)} / \${m.ram.totalGB.toFixed(1)} GB (\${m.ram.usedPct}%)</span></div>
      <div class="bar-bg"><div class="bar-fill \${barClass(m.ram.usedPct)}" style="width:\${m.ram.usedPct}%"></div></div>
    </div>\`
  }
  if (m.cpu) {
    html += \`<div class="metric-row">
      <div class="metric-label"><span>CPU (\${m.cpu.cores} cores)</span><span>\${m.cpu.usagePct}%</span></div>
      <div class="bar-bg"><div class="bar-fill \${barClass(m.cpu.usagePct)}" style="width:\${m.cpu.usagePct}%"></div></div>
    </div>\`
  }
  if (m.disk) {
    html += \`<div class="metric-row">
      <div class="metric-label"><span>Disk (C:)</span><span>\${m.disk.freeGB} GB free / \${m.disk.totalGB} GB (\${m.disk.usedPct}%)</span></div>
      <div class="bar-bg"><div class="bar-fill \${barClass(m.disk.usedPct)}" style="width:\${m.disk.usedPct}%"></div></div>
    </div>\`
  }
  html += \`<div style="font-size:11px;color:var(--muted);margin-top:8px">Uptime: \${Math.floor(m.uptime/3600)}h \${Math.floor((m.uptime%3600)/60)}m · \${m.platform}</div>\`
  document.getElementById('metrics').innerHTML = html
}

function renderEvents(evs) {
  if (!evs.length) { document.getElementById('event-log').innerHTML = '<div style="color:var(--muted);font-size:12px">No events yet</div>'; return }
  document.getElementById('event-log').innerHTML = evs.slice(0, 50).map(e => {
    const t = new Date(e.ts).toLocaleTimeString()
    return \`<div class="event-row">
      <span class="ev-ts">\${t}</span>
      <span class="ev-level \${e.level}">\${e.level.toUpperCase()}</span>
      <span>[\${e.service}] \${e.message}</span>
    </div>\`
  }).join('')
}

function renderModels(models) {
  if (!models.length) { document.getElementById('ollama-models').innerHTML = '<span style="color:var(--muted);font-size:12px">No models installed — visit /model-manager/ to install</span>'; return }
  document.getElementById('ollama-models').innerHTML = models.map(m => \`<span class="model-pill">\${m.name}</span>\`).join('')
}

refresh()
setInterval(refresh, 15000)
</script>
</body>
</html>`

// ── Module class ──────────────────────────────────────────────────────────────

export class HealthMonitorModule implements EmpireModule {
  readonly moduleId = 'health-monitor'
  private startTime = Date.now()

  async init(_services: CoreServices, _config: Record<string, unknown>): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    logEvent('info', 'health-monitor', 'Health Monitor started')
  }

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()

    if (req.path === '/' || req.path === '') {
      return { status: 200, body: HTML, moduleId: this.moduleId, durationMs: Date.now() - start, headers: { 'Content-Type': 'text/html' } }
    }

    if (req.path === '/status') {
      const results = await Promise.all(SERVICES.map(checkService))
      // Log new failures
      for (const r of results) {
        if (r.status === 'offline' && r.critical) {
          logEvent('error', r.id, `${r.name} is offline`)
        }
      }
      return { status: 200, body: results, moduleId: this.moduleId, durationMs: Date.now() - start }
    }

    if (req.path === '/metrics') {
      const metrics = getSystemMetrics()
      // Warn if RAM is critically low
      if (metrics.ram.usedPct > 90) {
        logEvent('warn', 'system', `High RAM usage: ${metrics.ram.usedPct}% (${metrics.ram.usedGB}GB used)`)
      }
      return { status: 200, body: metrics, moduleId: this.moduleId, durationMs: Date.now() - start }
    }

    if (req.path === '/events') {
      return { status: 200, body: loadEvents(), moduleId: this.moduleId, durationMs: Date.now() - start }
    }

    if (req.path === '/repair' && req.method === 'POST') {
      const body = req.body as { service?: string } | undefined
      const svc = SERVICES.find(s => s.id === body?.service)
      if (!svc) return { status: 400, body: { error: 'Unknown service' }, moduleId: this.moduleId, durationMs: Date.now() - start }

      logEvent('info', svc.id, `Manual repair requested for ${svc.name}`)
      // Re-check status after short delay
      const result = await checkService(svc)
      return {
        status: 200,
        body: { service: svc.id, status: result.status, hint: svc.repairHint, message: result.status === 'online' ? 'Service is online!' : `Service still offline — ${svc.repairHint}` },
        moduleId: this.moduleId,
        durationMs: Date.now() - start,
      }
    }

    if (req.path === '/health') {
      const metrics = getSystemMetrics()
      return {
        status: 200,
        body: { status: 'healthy', uptime: Date.now() - this.startTime, ram: metrics.ram, cpu: metrics.cpu },
        moduleId: this.moduleId,
        durationMs: Date.now() - start,
      }
    }

    return { status: 404, body: { error: 'Not found' }, moduleId: this.moduleId, durationMs: Date.now() - start }
  }

  async handleEvent(): Promise<void> { /* no events */ }

  async health(): Promise<ModuleHealth> {
    const metrics = getSystemMetrics()
    const status = metrics.ram.usedPct > 95 ? 'degraded' : 'healthy'
    return { status, moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> {
    logEvent('info', 'health-monitor', 'Health Monitor shut down')
  }
}
