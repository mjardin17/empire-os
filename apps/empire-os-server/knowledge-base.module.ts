/**
 * KnowledgeBaseModule — Persistent AI Memory
 *
 * Empire OS's long-term memory. Stores benchmarks, preferences, project history,
 * workflow patterns, discoveries, and personal context across sessions.
 *
 * Routes:
 *   GET  /knowledge-base/          → HTML browser
 *   GET  /knowledge-base/entries   → all entries (optional ?category=)
 *   POST /knowledge-base/store     → save an entry
 *   GET  /knowledge-base/search    → search entries (?q=)
 *   GET  /knowledge-base/benchmarks → benchmark history
 *   DELETE /knowledge-base/entry/:id → remove entry
 *   POST /knowledge-base/preference → save a preference
 *   GET  /knowledge-base/export    → export all as JSON
 *   GET  /knowledge-base/health    → health check
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const DATA_DIR  = process.env.DATA_DIR ?? path.resolve('.empire-data')
const KB_DIR    = path.join(DATA_DIR, 'knowledge')
const KB_FILE   = path.join(KB_DIR, 'entries.json')
const PREF_FILE = path.join(KB_DIR, 'preferences.json')
const BENCH_FILE = path.join(DATA_DIR, 'discovery-cache.json')  // shared with discovery module

// ── Types ─────────────────────────────────────────────────────────────────────

interface KBEntry {
  id: string
  category: 'benchmark' | 'preference' | 'workflow' | 'discovery' | 'project' | 'note' | 'failure'
  title: string
  content: unknown
  tags: string[]
  createdAt: string
  updatedAt: string
}

// ── Storage ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  fs.mkdirSync(KB_DIR, { recursive: true })
}

function loadEntries(): KBEntry[] {
  try { return JSON.parse(fs.readFileSync(KB_FILE, 'utf8')) } catch { return [] }
}

function saveEntries(entries: KBEntry[]): void {
  ensureDir()
  fs.writeFileSync(KB_FILE, JSON.stringify(entries, null, 2))
}

function loadPrefs(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(PREF_FILE, 'utf8')) } catch { return {} }
}

function savePrefs(prefs: Record<string, unknown>): void {
  ensureDir()
  fs.writeFileSync(PREF_FILE, JSON.stringify(prefs, null, 2))
}

function loadBenchmarks(): Record<string, unknown> {
  try {
    const cache = JSON.parse(fs.readFileSync(BENCH_FILE, 'utf8'))
    return (cache['benchmarks']?.data as Record<string, unknown>) ?? {}
  } catch { return {} }
}

function storeEntry(category: KBEntry['category'], title: string, content: unknown, tags: string[] = []): KBEntry {
  const entries = loadEntries()
  const existing = entries.find(e => e.title === title && e.category === category)
  const now = new Date().toISOString()

  if (existing) {
    existing.content = content
    existing.tags = [...new Set([...existing.tags, ...tags])]
    existing.updatedAt = now
    saveEntries(entries)
    return existing
  }

  const entry: KBEntry = {
    id: crypto.randomUUID(),
    category, title, content, tags,
    createdAt: now, updatedAt: now,
  }
  entries.unshift(entry)
  saveEntries(entries.slice(0, 2000))  // cap at 2000 entries
  return entry
}

function searchEntries(q: string): KBEntry[] {
  const ql = q.toLowerCase()
  return loadEntries().filter(e =>
    e.title.toLowerCase().includes(ql) ||
    JSON.stringify(e.content).toLowerCase().includes(ql) ||
    e.tags.some(t => t.toLowerCase().includes(ql))
  )
}

// ── HTML Dashboard ────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empire OS — Knowledge Base</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --bg:#0d0f14; --surface:#161b22; --surface2:#1c2333; --border:#30363d;
    --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --green:#3fb950;
    --red:#f85149; --yellow:#d29922; --purple:#bc8cff; --orange:#e3b341;
  }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; }
  header { background:var(--surface); border-bottom:1px solid var(--border); padding:14px 20px; display:flex; align-items:center; gap:10px; }
  header h1 { font-size:17px; font-weight:600; }
  .badge { background:var(--orange); color:#000; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:600; }
  .layout { display:grid; grid-template-columns:200px 1fr; height:calc(100vh - 53px); }
  .sidebar { background:var(--surface); border-right:1px solid var(--border); padding:16px; overflow-y:auto; }
  .sidebar h3 { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px; }
  .cat-btn { display:block; width:100%; text-align:left; padding:7px 10px; border-radius:6px; border:none; background:none; color:var(--muted); font-size:13px; cursor:pointer; margin-bottom:2px; }
  .cat-btn:hover { background:var(--surface2); color:var(--text); }
  .cat-btn.active { background:var(--surface2); color:var(--accent); }
  .main { padding:20px; overflow-y:auto; }
  .toolbar { display:flex; gap:8px; margin-bottom:16px; align-items:center; }
  .search-input { flex:1; background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:7px 12px; color:var(--text); font-size:13px; }
  .search-input:focus { outline:none; border-color:var(--accent); }
  .search-input::placeholder { color:var(--muted); }
  .btn { padding:6px 14px; border-radius:5px; border:1px solid var(--border); cursor:pointer; font-size:12px; background:var(--surface2); color:var(--text); }
  .btn:hover { background:var(--border); }
  .btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
  .btn.danger { color:var(--red); border-color:rgba(248,81,73,.3); }
  .entry-list { display:flex; flex-direction:column; gap:8px; }
  .entry-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; }
  .entry-card:hover { border-color:var(--accent); }
  .entry-header { display:flex; align-items:flex-start; gap:8px; margin-bottom:6px; }
  .entry-icon { font-size:16px; }
  .entry-title { font-weight:600; font-size:13px; flex:1; }
  .entry-cat { font-size:10px; padding:1px 7px; border-radius:4px; border:1px solid var(--border); background:var(--surface2); color:var(--muted); }
  .entry-content { font-size:12px; color:var(--muted); line-height:1.5; margin-bottom:6px; }
  .entry-footer { display:flex; align-items:center; gap:8px; }
  .entry-ts { font-size:10px; color:var(--muted); }
  .entry-tags { display:flex; gap:4px; flex:1; flex-wrap:wrap; }
  .tag { font-size:10px; padding:1px 6px; border-radius:3px; background:var(--surface2); color:var(--muted); }
  .empty { text-align:center; padding:60px 20px; color:var(--muted); }
  .empty-icon { font-size:40px; margin-bottom:12px; }
  .bench-table { width:100%; border-collapse:collapse; font-size:12px; }
  .bench-table th { text-align:left; padding:8px 12px; border-bottom:1px solid var(--border); color:var(--muted); font-weight:500; }
  .bench-table td { padding:8px 12px; border-bottom:1px solid var(--border); }
  .tps { color:var(--green); font-weight:600; }
  .pref-table { width:100%; font-size:13px; }
  .pref-row { display:flex; gap:12px; padding:8px 0; border-bottom:1px solid var(--border); }
  .pref-key { font-weight:600; min-width:200px; }
  .pref-val { color:var(--muted); flex:1; }
  .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:200; align-items:center; justify-content:center; }
  .modal.show { display:flex; }
  .modal-box { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:20px; width:480px; }
  .modal-box h3 { margin-bottom:14px; }
  .form-row { margin-bottom:10px; }
  .form-row label { display:block; font-size:12px; color:var(--muted); margin-bottom:4px; }
  .form-control { width:100%; background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:7px 10px; color:var(--text); font-size:13px; }
  .form-control:focus { outline:none; border-color:var(--accent); }
</style>
</head>
<body>
<header>
  <span style="font-size:20px">🧠</span>
  <h1>Knowledge Base</h1>
  <span class="badge">Empire Memory</span>
  <button class="btn" style="margin-left:auto" onclick="openModal()">+ Add Note</button>
  <button class="btn" style="margin-left:6px" onclick="exportAll()">⬇ Export</button>
</header>

<div class="layout">
  <div class="sidebar">
    <h3>Categories</h3>
    <button class="cat-btn active" onclick="filterCat('all', this)">📦 All Entries</button>
    <button class="cat-btn" onclick="filterCat('benchmark', this)">⚡ Benchmarks</button>
    <button class="cat-btn" onclick="filterCat('preference', this)">⚙️ Preferences</button>
    <button class="cat-btn" onclick="filterCat('workflow', this)">🔄 Workflows</button>
    <button class="cat-btn" onclick="filterCat('project', this)">📁 Projects</button>
    <button class="cat-btn" onclick="filterCat('discovery', this)">🔭 Discoveries</button>
    <button class="cat-btn" onclick="filterCat('note', this)">📝 Notes</button>
    <button class="cat-btn" onclick="filterCat('failure', this)">⚠️ Failures</button>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <div id="stats" style="font-size:11px;color:var(--muted);line-height:1.8"></div>
    </div>
  </div>

  <div class="main">
    <div class="toolbar">
      <input class="search-input" id="search" placeholder="Search knowledge base..." oninput="search(this.value)">
    </div>
    <div id="entries-list" class="entry-list">Loading...</div>
  </div>
</div>

<!-- Add Note Modal -->
<div class="modal" id="modal">
  <div class="modal-box">
    <h3>Add Knowledge Entry</h3>
    <div class="form-row">
      <label>Category</label>
      <select id="modal-cat" class="form-control">
        <option value="note">📝 Note</option>
        <option value="workflow">🔄 Workflow</option>
        <option value="project">📁 Project</option>
        <option value="preference">⚙️ Preference</option>
        <option value="discovery">🔭 Discovery</option>
      </select>
    </div>
    <div class="form-row">
      <label>Title</label>
      <input id="modal-title" class="form-control" placeholder="What is this about?">
    </div>
    <div class="form-row">
      <label>Content</label>
      <textarea id="modal-content" class="form-control" rows="4" placeholder="Details, steps, links, context..."></textarea>
    </div>
    <div class="form-row">
      <label>Tags (comma separated)</label>
      <input id="modal-tags" class="form-control" placeholder="empire, ollama, workflow">
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn primary" onclick="saveEntry()">Save</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>
  </div>
</div>

<script>
const EMPIRE = 'http://localhost:3001'
let allEntries = [], currentCat = 'all', currentSearch = ''

const CAT_ICONS = { benchmark:'⚡', preference:'⚙️', workflow:'🔄', project:'📁', discovery:'🔭', note:'📝', failure:'⚠️' }

async function loadEntries(cat='all') {
  const url = EMPIRE + '/knowledge-base/entries' + (cat !== 'all' ? '?category=' + cat : '')
  const r = await fetch(url)
  allEntries = await r.json()
  renderEntries(allEntries)
  updateStats(allEntries)
}

function renderEntries(entries) {
  if (!entries.length) {
    document.getElementById('entries-list').innerHTML = \`<div class="empty"><div class="empty-icon">🧠</div><div>No entries yet in this category</div><div style="margin-top:8px;font-size:12px">Add notes, workflows, or discoveries to build your knowledge base</div></div>\`
    return
  }
  document.getElementById('entries-list').innerHTML = entries.map(e => {
    const contentStr = typeof e.content === 'string' ? e.content : JSON.stringify(e.content, null, 2)
    const preview = contentStr.slice(0, 180) + (contentStr.length > 180 ? '...' : '')
    const tags = (e.tags || []).map(t => \`<span class="tag">\${t}</span>\`).join('')
    const ts = new Date(e.createdAt).toLocaleDateString()
    return \`<div class="entry-card">
      <div class="entry-header">
        <span class="entry-icon">\${CAT_ICONS[e.category] || '📦'}</span>
        <span class="entry-title">\${e.title}</span>
        <span class="entry-cat">\${e.category}</span>
        <button class="btn danger" style="padding:2px 8px;font-size:10px" onclick="deleteEntry('\${e.id}')">✕</button>
      </div>
      <div class="entry-content"><pre style="white-space:pre-wrap;font-family:inherit">\${escHtml(preview)}</pre></div>
      <div class="entry-footer">
        <div class="entry-tags">\${tags}</div>
        <span class="entry-ts">\${ts}</span>
      </div>
    </div>\`
  }).join('')
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function updateStats(entries) {
  const cats = {}
  entries.forEach(e => { cats[e.category] = (cats[e.category]||0)+1 })
  document.getElementById('stats').innerHTML = \`Total: \${entries.length}<br>\` +
    Object.entries(cats).map(([k,v]) => \`\${CAT_ICONS[k]} \${k}: \${v}\`).join('<br>')
}

function filterCat(cat, btn) {
  currentCat = cat
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  const filtered = cat === 'all' ? allEntries : allEntries.filter(e => e.category === cat)
  renderEntries(filtered)
}

function search(q) {
  currentSearch = q
  if (!q) { filterCat(currentCat, document.querySelector('.cat-btn.active')); return }
  fetch(EMPIRE + '/knowledge-base/search?q=' + encodeURIComponent(q))
    .then(r => r.json()).then(renderEntries)
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return
  await fetch(EMPIRE + '/knowledge-base/entry/' + id, { method:'DELETE' })
  await loadEntries(currentCat)
}

function openModal()  { document.getElementById('modal').className = 'modal show' }
function closeModal() { document.getElementById('modal').className = 'modal' }

async function saveEntry() {
  const cat     = document.getElementById('modal-cat').value
  const title   = document.getElementById('modal-title').value.trim()
  const content = document.getElementById('modal-content').value.trim()
  const tags    = document.getElementById('modal-tags').value.split(',').map(t=>t.trim()).filter(Boolean)
  if (!title || !content) { alert('Title and content required'); return }
  await fetch(EMPIRE + '/knowledge-base/store', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ category: cat, title, content, tags })
  })
  closeModal()
  document.getElementById('modal-title').value = ''
  document.getElementById('modal-content').value = ''
  document.getElementById('modal-tags').value = ''
  await loadEntries()
}

async function exportAll() {
  const r = await fetch(EMPIRE + '/knowledge-base/export')
  const data = await r.json()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'empire-knowledge-' + new Date().toISOString().slice(0,10) + '.json'
  a.click()
}

loadEntries()
</script>
</body>
</html>`

// ── Module class ──────────────────────────────────────────────────────────────

export class KnowledgeBaseModule implements EmpireModule {
  readonly moduleId = 'knowledge-base'

  async init(_services: CoreServices, _config: Record<string, unknown>): Promise<void> {
    ensureDir()
    // Seed with initial system context if empty
    const entries = loadEntries()
    if (entries.length === 0) {
      storeEntry('preference', 'Machine: Josh\'s Windows Laptop', {
        ram: '8GB',
        platform: 'Windows',
        gpu: 'Unknown — check via Task Manager',
        recommendedModels: ['qwen2.5:7b', 'qwen2.5-coder:7b', 'llama3.1:8b', 'gemma3:4b', 'phi4-mini:3.8b'],
        maxModelSize: '6GB RAM',
      }, ['hardware', 'machine', 'config'])

      storeEntry('preference', 'Viral Engine — Josh\'s AI Channel Empire', {
        channels: ['Gods & Glory (GG)', 'Machine Learning (ML)', 'Little Olympus (LO)'],
        pipeline: 'auto_render.py — JSON scripts → images → TTS → FFmpeg → MP4',
        status: 'S1 complete, S2 partial, S3 scripted — render with render_season3.bat',
        empire_os_port: 3001,
        ollama_port: 11434,
      }, ['project', 'youtube', 'viral-engine', 'pipeline'])

      storeEntry('workflow', 'Empire OS Provider Routing', {
        routing: {
          'ollama': 'Local/routine — copy, summary, classification (free, fastest)',
          'anthropic': 'Code, architecture, complex reasoning',
          'google': 'Research, long-context planning, scripts',
          'openai': 'GPT-specific features, function calling',
          'goose': 'Local dev tasks, file ops, shell commands',
        },
        defaultStrategy: 'cost',
      }, ['empire', 'routing', 'providers'])
    }
  }

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const done = (status: number, body: unknown) => ({ status, body, moduleId: this.moduleId, durationMs: Date.now() - start })

    if (req.path === '/' || req.path === '') return { ...done(200, HTML), headers: { 'Content-Type': 'text/html' } }

    if (req.path === '/entries') {
      const params = req.body as { category?: string } | undefined
      const category = (req.headers?.['x-category'] ?? params?.category) as string | undefined
      const entries = loadEntries()
      const filtered = category ? entries.filter(e => e.category === category) : entries
      return done(200, filtered)
    }

    if (req.path === '/store' && req.method === 'POST') {
      const body = req.body as { category?: KBEntry['category']; title?: string; content?: unknown; tags?: string[] } | undefined
      if (!body?.category || !body?.title) return done(400, { error: 'Missing: category, title' })
      const entry = storeEntry(body.category, body.title, body.content ?? {}, body.tags ?? [])
      return done(200, { success: true, entry })
    }

    if (req.path === '/search') {
      const q = (req.headers?.['x-q'] ?? '') as string
      if (!q) return done(400, { error: 'Missing: q param' })
      return done(200, searchEntries(q))
    }

    if (req.path === '/benchmarks') {
      return done(200, loadBenchmarks())
    }

    if (req.path === '/preference' && req.method === 'POST') {
      const body = req.body as { key?: string; value?: unknown } | undefined
      if (!body?.key) return done(400, { error: 'Missing: key' })
      const prefs = loadPrefs()
      prefs[body.key] = body.value
      savePrefs(prefs)
      storeEntry('preference', body.key, body.value, ['preference'])
      return done(200, { success: true, key: body.key })
    }

    if (req.path === '/export') {
      return done(200, {
        entries: loadEntries(),
        preferences: loadPrefs(),
        benchmarks: loadBenchmarks(),
        exportedAt: new Date().toISOString(),
        version: '1.0',
      })
    }

    // DELETE /entry/:id
    if (req.path.startsWith('/entry/') && req.method === 'DELETE') {
      const id = req.path.replace('/entry/', '')
      const entries = loadEntries()
      const idx = entries.findIndex(e => e.id === id)
      if (idx === -1) return done(404, { error: 'Entry not found' })
      entries.splice(idx, 1)
      saveEntries(entries)
      return done(200, { success: true })
    }

    if (req.path === '/health') {
      const count = loadEntries().length
      return done(200, { status: 'healthy', entries: count, storePath: KB_FILE })
    }

    return done(404, { error: 'Not found' })
  }

  async handleEvent(event: { type: string; payload: unknown }): Promise<void> {
    // Auto-capture events into knowledge base
    if (event.type === 'ollama.model.registered') {
      const payload = event.payload as { model?: string; details?: unknown }
      if (payload?.model) {
        storeEntry('discovery', `Installed model: ${payload.model}`, payload, ['ollama', 'model', 'installed'])
      }
    }
  }

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> { /* file-backed, no cleanup needed */ }
}
