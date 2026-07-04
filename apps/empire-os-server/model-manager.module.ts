/**
 * ModelManagerModule — Ollama Model Manager
 *
 * Serves a graphical interface at /model-manager for browsing, installing,
 * updating, removing, and registering Ollama models.
 *
 * Routes:
 *   GET  /model-manager/          → HTML UI
 *   GET  /model-manager/health    → health check
 *   GET  /model-manager/models    → installed models from Ollama
 *   GET  /model-manager/packs     → recommended model packs
 *   POST /model-manager/register  → register a model with Empire Assistant AIRouter
 */

import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

const RECOMMENDED_PACKS = {
  coding: {
    name: 'Coding Pack',
    description: 'Code generation, review, and debugging',
    icon: '💻',
    models: [
      { id: 'deepseek-coder-v2', size: '8.9GB', description: 'Best for code — deep understanding of 338 languages' },
      { id: 'qwen2.5-coder:7b', size: '4.7GB', description: 'Fast, accurate code generation and completion' },
      { id: 'codellama:13b', size: '7.4GB', description: 'Meta\'s code specialist — Python, JS, TypeScript, more' },
    ],
  },
  writing: {
    name: 'Writing Pack',
    description: 'Copywriting, scripts, and narrative content',
    icon: '✍️',
    models: [
      { id: 'qwen2.5:14b', size: '9.0GB', description: 'Excellent multilingual writer — scripts, emails, copy' },
      { id: 'mistral:7b', size: '4.1GB', description: 'Sharp, concise writing — great for marketing copy' },
      { id: 'neural-chat:7b', size: '4.1GB', description: 'Conversational and natural tone for content creation' },
    ],
  },
  research: {
    name: 'Research Pack',
    description: 'Analysis, summarization, and long-context reasoning',
    icon: '🔬',
    models: [
      { id: 'llama3.1:8b', size: '4.7GB', description: 'Meta\'s flagship — research, analysis, summarization' },
      { id: 'phi3:14b', size: '7.9GB', description: 'Microsoft\'s efficient reasoning model' },
      { id: 'mixtral:8x7b', size: '26GB', description: 'Mixture of experts — exceptional reasoning depth' },
    ],
  },
  image: {
    name: 'Image Pack',
    description: 'Best local models for image understanding, captioning, and visual Q&A',
    icon: '🖼️',
    models: [
      { id: 'llava:34b', size: '20GB', description: 'Highest quality vision — detailed image analysis and description' },
      { id: 'llava-llama3:8b', size: '5.5GB', description: 'LLaVA on Llama 3 — sharp image understanding, fast' },
      { id: 'minicpm-v:8b', size: '5.5GB', description: 'Exceptional at charts, documents, screenshots, and dense scenes' },
      { id: 'moondream:1.8b', size: '1.1GB', description: 'Ultra-fast — instant image captioning at minimal VRAM cost' },
    ],
  },
  video: {
    name: 'Video Pack',
    description: 'Local models for video frame analysis and video understanding',
    icon: '🎬',
    models: [
      { id: 'video-llava:7b', size: '4.8GB', description: 'Purpose-built for video — understands motion, scenes, and temporal context' },
      { id: 'llava:34b', size: '20GB', description: 'Best-in-class for detailed video frame analysis (shared with Image Pack)' },
      { id: 'minicpm-v:8b', size: '5.5GB', description: 'Strong on action recognition, subtitles, and scene text in frames' },
    ],
  },
  creative: {
    name: 'Creative Pack',
    description: 'Storytelling, roleplay, and creative writing',
    icon: '🎨',
    models: [
      { id: 'gemma2:9b', size: '5.4GB', description: 'Google\'s creative storyteller — vivid narratives' },
      { id: 'llama3.1:70b', size: '40GB', description: 'Full-power Llama — deepest creative reasoning' },
      { id: 'dolphin-mistral:7b', size: '4.1GB', description: 'Uncensored creative — great for fiction and scripts' },
    ],
  },
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empire OS — Model Manager</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0f14; --surface: #161b22; --surface2: #1c2333;
    --border: #30363d; --text: #e6edf3; --muted: #8b949e;
    --accent: #58a6ff; --green: #3fb950; --red: #f85149;
    --yellow: #d29922; --purple: #bc8cff;
  }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; min-height: 100vh; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 18px; font-weight: 600; }
  header .badge { background: var(--accent); color: #000; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
  #status-bar { background: var(--surface2); border-bottom: 1px solid var(--border); padding: 8px 24px; font-size: 12px; color: var(--muted); display: flex; gap: 16px; align-items: center; }
  #status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); display: inline-block; }
  .layout { display: grid; grid-template-columns: 1fr 380px; gap: 0; height: calc(100vh - 88px); overflow: hidden; }
  .panel { overflow-y: auto; padding: 20px; }
  .panel-right { border-left: 1px solid var(--border); background: var(--surface); }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 14px; color: var(--text); }
  h3 { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }

  /* Installed models */
  .model-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; display: flex; align-items: flex-start; gap: 14px; transition: border-color .15s; }
  .model-card:hover { border-color: var(--accent); }
  .model-icon { font-size: 22px; min-width: 32px; text-align: center; margin-top: 2px; }
  .model-info { flex: 1; min-width: 0; }
  .model-name { font-weight: 600; font-size: 14px; }
  .model-meta { color: var(--muted); font-size: 12px; margin-top: 3px; }
  .model-caps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .cap { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; font-size: 11px; padding: 1px 7px; color: var(--muted); }
  .cap.primary { background: rgba(88,166,255,.1); border-color: rgba(88,166,255,.3); color: var(--accent); }
  .model-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  .btn { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; font-size: 12px; font-weight: 500; transition: all .15s; background: var(--surface2); color: var(--text); }
  .btn:hover { background: var(--border); }
  .btn.primary { background: var(--accent); color: #000; border-color: var(--accent); }
  .btn.primary:hover { opacity: .85; }
  .btn.danger { color: var(--red); border-color: rgba(248,81,73,.3); }
  .btn.danger:hover { background: rgba(248,81,73,.1); }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
  .registered-badge { font-size: 11px; color: var(--green); font-weight: 500; }

  /* Packs */
  .pack-section { margin-bottom: 20px; }
  .pack-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer; padding: 8px; border-radius: 6px; border: 1px solid transparent; }
  .pack-header:hover { border-color: var(--border); background: var(--surface2); }
  .pack-title { font-weight: 600; font-size: 13px; }
  .pack-desc { font-size: 11px; color: var(--muted); }
  .pack-models { display: none; }
  .pack-models.open { display: block; }
  .pack-model-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; margin-bottom: 4px; }
  .pack-model-row:hover { background: var(--surface2); }
  .pack-model-name { flex: 1; font-size: 12px; font-weight: 500; }
  .pack-model-desc { font-size: 11px; color: var(--muted); }
  .pack-model-size { font-size: 11px; color: var(--yellow); min-width: 44px; text-align: right; }
  .install-btn { padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); font-size: 11px; cursor: pointer; white-space: nowrap; }
  .install-btn:hover { background: var(--accent); color: #000; border-color: var(--accent); }
  .install-btn.installed { color: var(--green); border-color: rgba(63,185,80,.3); background: rgba(63,185,80,.08); cursor: default; }
  .install-btn.installing { color: var(--yellow); cursor: not-allowed; }

  /* Progress */
  #progress-panel { display: none; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
  #progress-panel.active { display: block; }
  .progress-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .progress-bar-bg { background: var(--border); border-radius: 4px; height: 6px; margin-bottom: 6px; overflow: hidden; }
  .progress-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width .3s; width: 0%; }
  .progress-status { font-size: 11px; color: var(--muted); }

  /* Empty state */
  .empty { text-align: center; padding: 40px 20px; color: var(--muted); }
  .empty-icon { font-size: 32px; margin-bottom: 10px; }

  /* Search */
  .search-row { display: flex; gap: 8px; margin-bottom: 16px; }
  .search-input { flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; color: var(--text); font-size: 13px; }
  .search-input:focus { outline: none; border-color: var(--accent); }
  .search-input::placeholder { color: var(--muted); }

  .section-divider { border: none; border-top: 1px solid var(--border); margin: 18px 0; }
  .toast { position: fixed; bottom: 20px; right: 20px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; font-size: 13px; z-index: 100; display: none; }
  .toast.show { display: block; animation: slideup .2s ease; }
  .toast.success { border-color: var(--green); color: var(--green); }
  .toast.error { border-color: var(--red); color: var(--red); }
  @keyframes slideup { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
</style>
</head>
<body>
<header>
  <span style="font-size:20px">🤖</span>
  <h1>Ollama Model Manager</h1>
  <span class="badge">Empire OS</span>
  <span style="margin-left:auto;font-size:12px;color:var(--muted)" id="header-count"></span>
</header>
<div id="status-bar">
  <span id="status-dot"></span>
  <span id="status-text">Connecting to Ollama...</span>
  <span style="margin-left:auto" id="ollama-url">localhost:11434</span>
</div>

<div class="layout">
  <!-- LEFT: installed models -->
  <div class="panel">
    <h2>Installed Models</h2>
    <div class="search-row">
      <input class="search-input" id="search" placeholder="Filter models..." oninput="filterModels()">
      <button class="btn" onclick="loadModels()">↻ Refresh</button>
    </div>
    <div id="progress-panel">
      <div class="progress-title" id="progress-title">Installing...</div>
      <div class="progress-bar-bg"><div class="progress-bar-fill" id="progress-bar"></div></div>
      <div class="progress-status" id="progress-status"></div>
    </div>
    <div id="models-list"></div>
  </div>

  <!-- RIGHT: recommended packs -->
  <div class="panel panel-right">
    <h2>Recommended Packs</h2>
    <div id="packs-list"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const OLLAMA = 'http://localhost:11434'
const EMPIRE = 'http://localhost:3001'
let installedModels = []

function toast(msg, type='success') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast show ' + type
  setTimeout(() => el.className = 'toast', 3000)
}

function modelIcon(name) {
  const n = name.toLowerCase()
  if (/llava|vision|moondream|cogvlm/.test(n)) return '👁️'
  if (/code|coder|deepseek/.test(n)) return '💻'
  if (/math|phi/.test(n)) return '🔢'
  if (/embed/.test(n)) return '📐'
  if (/dolphin|neural|chat/.test(n)) return '💬'
  if (/mistral|mixtral/.test(n)) return '⚡'
  if (/llama/.test(n)) return '🦙'
  if (/gemma/.test(n)) return '💎'
  if (/qwen/.test(n)) return '🌐'
  return '🤖'
}

function caps(name) {
  const n = name.toLowerCase()
  const c = ['chat']
  if (/code|coder|deepseek/.test(n)) c.push('code')
  if (/llava|vision|moondream|bakllava/.test(n)) c.push('vision')
  if (/embed/.test(n)) c.push('embeddings')
  if (/70b|34b|32b/.test(n)) c.push('reasoning', 'long-context')
  else if (/14b|13b/.test(n)) c.push('research')
  return c
}

function formatSize(bytes) {
  if (!bytes) return ''
  const gb = bytes / 1e9
  return gb >= 1 ? gb.toFixed(1) + ' GB' : (bytes / 1e6).toFixed(0) + ' MB'
}

async function loadModels() {
  try {
    const r = await fetch(OLLAMA + '/api/tags')
    if (!r.ok) throw new Error('Ollama unreachable')
    const data = await r.json()
    installedModels = data.models ?? []
    renderModels()
    updateStatus(true)
    document.getElementById('header-count').textContent = installedModels.length + ' model' + (installedModels.length === 1 ? '' : 's') + ' installed'
    renderPacks()
  } catch(e) {
    updateStatus(false)
    document.getElementById('models-list').innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Cannot reach Ollama at localhost:11434<br><small style="margin-top:6px;display:block">Make sure Ollama is running</small></div>'
  }
}

function updateStatus(ok) {
  document.getElementById('status-dot').style.background = ok ? 'var(--green)' : 'var(--red)'
  document.getElementById('status-text').textContent = ok
    ? 'Ollama connected — ' + installedModels.length + ' model' + (installedModels.length !== 1 ? 's' : '') + ' installed'
    : 'Ollama not reachable'
}

function renderModels(filter='') {
  const list = document.getElementById('models-list')
  const filtered = installedModels.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()))
  if (filtered.length === 0) {
    list.innerHTML = filter
      ? '<div class="empty"><div class="empty-icon">🔍</div>No models match "' + filter + '"</div>'
      : '<div class="empty"><div class="empty-icon">📭</div>No models installed yet<br><small style="margin-top:6px;display:block">Install a pack from the right panel</small></div>'
    return
  }
  list.innerHTML = filtered.map(m => {
    const c = caps(m.name)
    const capHtml = c.map((cap, i) => '<span class="cap ' + (i === 0 ? 'primary' : '') + '">' + cap + '</span>').join('')
    return \`<div class="model-card" id="card-\${m.name.replace(/[^a-z0-9]/gi,'_')}">
      <div class="model-icon">\${modelIcon(m.name)}</div>
      <div class="model-info">
        <div class="model-name">\${m.name}</div>
        <div class="model-meta">\${formatSize(m.size)}\${m.details?.parameter_size ? ' · ' + m.details.parameter_size : ''}\${m.details?.quantization_level ? ' · ' + m.details.quantization_level : ''}</div>
        <div class="model-caps">\${capHtml}</div>
      </div>
      <div class="model-actions">
        <button class="btn primary" onclick="registerModel('\${m.name}')">Register</button>
        <button class="btn danger" onclick="removeModel('\${m.name}')">Remove</button>
      </div>
    </div>\`
  }).join('')
}

function filterModels() {
  renderModels(document.getElementById('search').value)
}

async function registerModel(name) {
  try {
    const r = await fetch(EMPIRE + '/model-manager/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name })
    })
    const data = await r.json()
    if (data.success) toast('✓ ' + name + ' registered with Empire Assistant')
    else toast(data.error ?? 'Registration failed', 'error')
  } catch(e) {
    toast('Empire OS unreachable', 'error')
  }
}

async function removeModel(name) {
  if (!confirm('Remove ' + name + '? This cannot be undone.')) return
  try {
    const r = await fetch(OLLAMA + '/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    if (r.ok) {
      toast('✓ Removed ' + name)
      await loadModels()
    } else {
      toast('Failed to remove model', 'error')
    }
  } catch(e) {
    toast('Error: ' + e.message, 'error')
  }
}

async function installModel(name, btnEl) {
  if (installedModels.find(m => m.name === name || m.name.startsWith(name.split(':')[0]))) {
    toast(name + ' is already installed', 'error')
    return
  }

  btnEl.textContent = '⋯'
  btnEl.className = 'install-btn installing'
  btnEl.disabled = true

  const panel = document.getElementById('progress-panel')
  const bar = document.getElementById('progress-bar')
  const status = document.getElementById('progress-status')
  const title = document.getElementById('progress-title')
  panel.className = 'progress-panel active'
  title.textContent = 'Installing ' + name
  bar.style.width = '0%'
  status.textContent = 'Starting...'

  try {
    const r = await fetch(OLLAMA + '/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true })
    })

    if (!r.ok) throw new Error('Pull failed: ' + r.status)

    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const d = JSON.parse(line)
          if (d.total && d.completed) {
            const pct = Math.round(d.completed / d.total * 100)
            bar.style.width = pct + '%'
            status.textContent = 'Downloading... ' + pct + '% (' + (d.completed / 1e9).toFixed(2) + ' / ' + (d.total / 1e9).toFixed(2) + ' GB)'
          } else if (d.status) {
            status.textContent = d.status
            if (d.status === 'success') bar.style.width = '100%'
          }
        } catch {}
      }
    }

    panel.className = 'progress-panel'
    btnEl.textContent = '✓ Installed'
    btnEl.className = 'install-btn installed'
    toast('✓ ' + name + ' installed!')

    // Auto-register with Empire Assistant
    await registerModel(name)
    await loadModels()

  } catch(e) {
    panel.className = 'progress-panel'
    btnEl.textContent = 'Install'
    btnEl.className = 'install-btn'
    btnEl.disabled = false
    toast('Install failed: ' + e.message, 'error')
  }
}

async function renderPacks() {
  try {
    const r = await fetch(EMPIRE + '/model-manager/packs')
    const packs = await r.json()
    const container = document.getElementById('packs-list')
    container.innerHTML = Object.entries(packs).map(([key, pack]) => {
      const models = pack.models.map(m => {
        const isInstalled = installedModels.some(im => im.name === m.id || im.name.startsWith(m.id.split(':')[0]))
        return \`<div class="pack-model-row">
          <div>
            <div class="pack-model-name">\${m.id}</div>
            <div class="pack-model-desc">\${m.description}</div>
          </div>
          <div class="pack-model-size">\${m.size}</div>
          <button class="install-btn \${isInstalled ? 'installed' : ''}" \${isInstalled ? 'disabled' : ''}
            onclick="installModel('\${m.id}', this)">
            \${isInstalled ? '✓' : 'Install'}
          </button>
        </div>\`
      }).join('')
      return \`<div class="pack-section">
        <div class="pack-header" onclick="togglePack('\${key}')">
          <span style="font-size:18px">\${pack.icon}</span>
          <div>
            <div class="pack-title">\${pack.name}</div>
            <div class="pack-desc">\${pack.description}</div>
          </div>
          <span style="margin-left:auto;color:var(--muted);font-size:12px">▾</span>
        </div>
        <div class="pack-models" id="pack-\${key}">\${models}</div>
      </div>\`
    }).join('<hr class="section-divider">')
  } catch(e) {
    document.getElementById('packs-list').innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px">Could not load packs</div>'
  }
}

function togglePack(key) {
  const el = document.getElementById('pack-' + key)
  el.className = el.className.includes('open') ? 'pack-models' : 'pack-models open'
}

// Boot
loadModels()
setInterval(loadModels, 30000)
</script>
</body>
</html>`

export class ModelManagerModule implements EmpireModule {
  readonly moduleId = 'model-manager'
  private services!: CoreServices

  async init(services: CoreServices, _config: Record<string, unknown>): Promise<void> {
    this.services = services
  }

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()

    // Serve HTML UI
    if (req.path === '/' || req.path === '') {
      return {
        status: 200,
        body: HTML,
        moduleId: this.moduleId,
        durationMs: Date.now() - start,
        headers: { 'Content-Type': 'text/html' },
      }
    }

    // List installed models (proxy from Ollama)
    if (req.path === '/models' && req.method === 'GET') {
      try {
        const r = await fetch(`${OLLAMA_BASE}/api/tags`)
        const data = await r.json() as { models: unknown[] }
        return { status: 200, body: data, moduleId: this.moduleId, durationMs: Date.now() - start }
      } catch {
        return { status: 503, body: { error: 'Ollama unreachable' }, moduleId: this.moduleId, durationMs: Date.now() - start }
      }
    }

    // Recommended packs
    if (req.path === '/packs' && req.method === 'GET') {
      return { status: 200, body: RECOMMENDED_PACKS, moduleId: this.moduleId, durationMs: Date.now() - start }
    }

    // Register a model with the AIRouter
    if (req.path === '/register' && req.method === 'POST') {
      const body = req.body as { model?: string } | undefined
      const modelName = body?.model
      if (!modelName) {
        return { status: 400, body: { error: 'Missing field: model' }, moduleId: this.moduleId, durationMs: Date.now() - start }
      }

      try {
        // Fetch model details from Ollama to build proper AIModel entry
        const r = await fetch(`${OLLAMA_BASE}/api/tags`)
        const data = await r.json() as { models: Array<{ name: string; size: number; details?: { parameter_size?: string; family?: string } }> }
        const found = data.models.find(m => m.name === modelName)

        // Emit an event so the OllamaAdapter can pick it up on next request
        await this.services.eventBus.publish({
          type: 'ollama.model.registered',
          payload: { model: modelName, size: found?.size, details: found?.details },
          source: this.moduleId,
          timestamp: new Date().toISOString(),
        })

        return {
          status: 200,
          body: { success: true, message: `${modelName} registered with Empire Assistant` },
          moduleId: this.moduleId,
          durationMs: Date.now() - start,
        }
      } catch (err) {
        return {
          status: 500,
          body: { success: false, error: err instanceof Error ? err.message : 'Registration failed' },
          moduleId: this.moduleId,
          durationMs: Date.now() - start,
        }
      }
    }

    // Health
    if (req.path === '/health') {
      let ollamaOk = false
      try {
        const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
        ollamaOk = r.ok
      } catch { /* ignore */ }
      return {
        status: 200,
        body: { status: ollamaOk ? 'healthy' : 'degraded', ollama: ollamaOk ? 'connected' : 'unreachable' },
        moduleId: this.moduleId,
        durationMs: Date.now() - start,
      }
    }

    return { status: 404, body: { error: 'Not found' }, moduleId: this.moduleId, durationMs: Date.now() - start }
  }

  async handleEvent(): Promise<void> { /* no events handled */ }

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> { /* stateless */ }
}
