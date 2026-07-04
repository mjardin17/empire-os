/**
 * DiscoveryModule — AI Discovery Service
 *
 * Scans for new AI models, tools, and integrations.
 * Shows hardware compatibility for Josh's 8GB RAM Windows laptop.
 * NEVER auto-installs — all actions require user confirmation.
 *
 * Routes:
 *   GET  /discovery/          → HTML dashboard
 *   GET  /discovery/catalog   → full curated model catalog (JSON)
 *   GET  /discovery/trending  → HuggingFace + GitHub trending (cached 1hr)
 *   GET  /discovery/installed → what's currently in Ollama
 *   POST /discovery/install   → pull a model via Ollama
 *   POST /discovery/remove    → delete a model via Ollama
 *   POST /discovery/benchmark → run timed inference, store result
 *   GET  /discovery/health    → health check
 */

import fs from 'node:fs'
import path from 'node:path'
import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const OLLAMA_BASE   = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const DATA_DIR      = process.env.DATA_DIR ?? path.resolve('.empire-data')
const CACHE_FILE    = path.join(DATA_DIR, 'discovery-cache.json')
const CACHE_TTL_MS  = 60 * 60 * 1000  // 1 hour

// ── Hardware profile ──────────────────────────────────────────────────────────
// Josh's machine: 8GB RAM, Windows laptop
// Rule: models needing ≤ 5GB RAM = ✅, 5-7GB = ⚠️, >7GB = ❌
const TOTAL_RAM_GB = 8
const USABLE_RAM_GB = 5.5  // conservatively leaves 2.5GB for OS + other apps

// ── Curated model catalog ─────────────────────────────────────────────────────
interface ModelEntry {
  id: string
  name: string
  category: 'text' | 'code' | 'vision' | 'video' | 'audio' | 'music' | 'embedding' | 'agent'
  ramGB: number
  diskGB: number
  contextK: number
  capabilities: string[]
  description: string
  ollama_id: string
  trending?: boolean
  isNew?: boolean
  recommended?: boolean  // recommended for this PC
}

const MODEL_CATALOG: ModelEntry[] = [
  // ── TEXT ─────────────────────────────────────────────────────────────────────
  { id:'qwen2.5:0.5b', name:'Qwen 2.5 0.5B', category:'text', ramGB:0.5, diskGB:0.4, contextK:32, ollama_id:'qwen2.5:0.5b', capabilities:['chat','summary'], description:'Ultra-light — runs on anything, good for simple tasks', recommended:true },
  { id:'qwen2.5:1.5b', name:'Qwen 2.5 1.5B', category:'text', ramGB:1.0, diskGB:1.0, contextK:32, ollama_id:'qwen2.5:1.5b', capabilities:['chat','summary','classification'], description:'Tiny but surprisingly capable — great for fast responses', recommended:true },
  { id:'qwen2.5:3b',   name:'Qwen 2.5 3B',   category:'text', ramGB:2.0, diskGB:2.0, contextK:32, ollama_id:'qwen2.5:3b',   capabilities:['chat','summary','reasoning'], description:'Excellent balance of speed and quality for an 8GB machine', recommended:true },
  { id:'qwen2.5:7b',   name:'Qwen 2.5 7B',   category:'text', ramGB:4.7, diskGB:5.0, contextK:128, ollama_id:'qwen2.5:7b', capabilities:['chat','reasoning','writing','summary','analysis'], description:"Alibaba's flagship small model — top-tier quality, fits in 8GB", recommended:true, trending:true },
  { id:'qwen2.5:14b',  name:'Qwen 2.5 14B',  category:'text', ramGB:8.9, diskGB:9.0, contextK:128, ollama_id:'qwen2.5:14b', capabilities:['chat','reasoning','writing'], description:'Excellent but exceeds 8GB — requires swap or 16GB machine' },
  { id:'llama3.2:1b',  name:'Llama 3.2 1B',  category:'text', ramGB:0.8, diskGB:1.3, contextK:128, ollama_id:'llama3.2:1b', capabilities:['chat','summary'], description:"Meta's smallest — instant responses, minimal RAM", recommended:true },
  { id:'llama3.2:3b',  name:'Llama 3.2 3B',  category:'text', ramGB:2.0, diskGB:2.0, contextK:128, ollama_id:'llama3.2:3b', capabilities:['chat','reasoning','writing'], description:'Great all-rounder for 8GB machines — fast and smart', recommended:true },
  { id:'llama3.1:8b',  name:'Llama 3.1 8B',  category:'text', ramGB:5.0, diskGB:5.0, contextK:128, ollama_id:'llama3.1:8b', capabilities:['chat','reasoning','writing','research'], description:'Meta flagship — excellent reasoning, fits just inside 8GB', recommended:true, trending:true },
  { id:'gemma3:1b',    name:'Gemma 3 1B',    category:'text', ramGB:0.8, diskGB:0.8, contextK:32,  ollama_id:'gemma3:1b',   capabilities:['chat','summary'], description:"Google's smallest — surprisingly coherent for its size", recommended:true, isNew:true },
  { id:'gemma3:4b',    name:'Gemma 3 4B',    category:'text', ramGB:3.0, diskGB:3.3, contextK:128, ollama_id:'gemma3:4b',   capabilities:['chat','reasoning','writing'], description:"Google's new 4B — top-tier quality in a small package", recommended:true, isNew:true, trending:true },
  { id:'gemma3:12b',   name:'Gemma 3 12B',   category:'text', ramGB:7.5, diskGB:8.0, contextK:128, ollama_id:'gemma3:12b',  capabilities:['chat','reasoning','research'], description:'Excellent but tight on 8GB — close the browser first' },
  { id:'phi4-mini:3.8b', name:'Phi-4 Mini 3.8B', category:'text', ramGB:2.6, diskGB:2.5, contextK:128, ollama_id:'phi4-mini:3.8b', capabilities:['chat','reasoning','math'], description:"Microsoft's Phi-4 Mini — outstanding reasoning for its size", recommended:true, isNew:true, trending:true },
  { id:'phi3:3.8b',    name:'Phi-3 3.8B',    category:'text', ramGB:2.4, diskGB:2.3, contextK:128, ollama_id:'phi3:3.8b',   capabilities:['chat','reasoning'], description:'Microsoft Phi-3 Mini — reliable and fast', recommended:true },
  { id:'mistral:7b',   name:'Mistral 7B',    category:'text', ramGB:4.1, diskGB:4.1, contextK:32,  ollama_id:'mistral:7b',  capabilities:['chat','writing','reasoning'], description:'Rock-solid 7B — great for writing and general tasks', recommended:true },
  { id:'dolphin-mistral:7b', name:'Dolphin Mistral 7B', category:'text', ramGB:4.1, diskGB:4.1, contextK:32, ollama_id:'dolphin-mistral:7b', capabilities:['chat','creative','roleplay'], description:'Uncensored Mistral — best for creative fiction and scripts' },
  { id:'neural-chat:7b', name:'Neural Chat 7B', category:'text', ramGB:4.1, diskGB:4.1, contextK:8, ollama_id:'neural-chat:7b', capabilities:['chat','copy','creative'], description:'Intel fine-tune — excellent for conversational content', recommended:true },
  { id:'orca-mini:3b', name:'Orca Mini 3B',  category:'text', ramGB:2.0, diskGB:1.9, contextK:4,  ollama_id:'orca-mini:3b', capabilities:['chat','reasoning'], description:'Fast reasoning model — good for quick Q&A', recommended:true },
  { id:'smollm2:1.7b', name:'SmolLM 2 1.7B', category:'text', ramGB:1.1, diskGB:1.0, contextK:8, ollama_id:'smollm2:1.7b', capabilities:['chat','summary'], description:'HuggingFace SmolLM2 — tiny, fast, surprisingly useful', recommended:true, isNew:true },

  // ── CODE ─────────────────────────────────────────────────────────────────────
  { id:'qwen2.5-coder:7b',  name:'Qwen 2.5 Coder 7B',  category:'code', ramGB:4.7, diskGB:5.0, contextK:128, ollama_id:'qwen2.5-coder:7b',  capabilities:['code','debug','review','completion'], description:"Best local code model for 8GB — Alibaba's coding specialist", recommended:true, trending:true },
  { id:'qwen2.5-coder:3b',  name:'Qwen 2.5 Coder 3B',  category:'code', ramGB:2.0, diskGB:2.0, contextK:128, ollama_id:'qwen2.5-coder:3b',  capabilities:['code','completion','debug'], description:'Lightning-fast code completion — barely uses any RAM', recommended:true },
  { id:'qwen2.5-coder:1.5b',name:'Qwen 2.5 Coder 1.5B',category:'code', ramGB:1.0, diskGB:1.0, contextK:32,  ollama_id:'qwen2.5-coder:1.5b',capabilities:['completion','code'], description:'Smallest usable code model — great for autocomplete', recommended:true },
  { id:'deepseek-coder-v2:16b', name:'DeepSeek Coder V2 16B', category:'code', ramGB:9.1, diskGB:10, contextK:128, ollama_id:'deepseek-coder-v2:16b', capabilities:['code','architecture','debug'], description:'Most capable open code model — too large for 8GB' },
  { id:'codellama:7b',  name:'Code Llama 7B',  category:'code', ramGB:4.0, diskGB:3.8, contextK:16, ollama_id:'codellama:7b',  capabilities:['code','completion'], description:"Meta's Code Llama — solid all-rounder for code tasks", recommended:true },
  { id:'codellama:13b', name:'Code Llama 13B', category:'code', ramGB:8.0, diskGB:7.4, contextK:16, ollama_id:'codellama:13b', capabilities:['code','architecture'], description:'Better than 7B but needs 8GB+ — borderline for this machine' },
  { id:'starcoder2:3b', name:'StarCoder 2 3B', category:'code', ramGB:2.0, diskGB:1.7, contextK:16, ollama_id:'starcoder2:3b', capabilities:['code','completion'], description:'Efficient code model from HuggingFace — good for completion', recommended:true },
  { id:'starcoder2:7b', name:'StarCoder 2 7B', category:'code', ramGB:4.5, diskGB:4.0, contextK:16, ollama_id:'starcoder2:7b', capabilities:['code','completion','review'], description:'Strong code understanding — fits in 8GB', recommended:true },

  // ── VISION / IMAGE ───────────────────────────────────────────────────────────
  { id:'llava:7b',        name:'LLaVA 7B',          category:'vision', ramGB:4.5, diskGB:4.7, contextK:4,   ollama_id:'llava:7b',        capabilities:['image-understanding','caption','vqa'], description:'Best small vision model — understands images well', recommended:true },
  { id:'llava:13b',       name:'LLaVA 13B',          category:'vision', ramGB:8.0, diskGB:8.0, contextK:4,   ollama_id:'llava:13b',       capabilities:['image-understanding','caption','vqa','ocr'], description:'High-quality vision — borderline on 8GB' },
  { id:'llava:34b',       name:'LLaVA 34B',          category:'vision', ramGB:20, diskGB:20, contextK:4,    ollama_id:'llava:34b',       capabilities:['image-understanding','caption','vqa'], description:'Best quality but requires 20GB+ RAM' },
  { id:'llava-llama3:8b', name:'LLaVA Llama3 8B',   category:'vision', ramGB:5.5, diskGB:5.5, contextK:4,   ollama_id:'llava-llama3:8b', capabilities:['image-understanding','caption','vqa'], description:'LLaVA on Llama 3 — sharp image understanding', recommended:true },
  { id:'minicpm-v:8b',    name:'MiniCPM-V 8B',       category:'vision', ramGB:5.5, diskGB:5.5, contextK:32,  ollama_id:'minicpm-v:8b',    capabilities:['image-understanding','caption','ocr','charts','documents'], description:'Exceptional at charts, docs, screenshots — long context', recommended:true, trending:true },
  { id:'moondream:1.8b',  name:'Moondream 1.8B',     category:'vision', ramGB:1.1, diskGB:1.1, contextK:2,   ollama_id:'moondream:1.8b',  capabilities:['caption','vqa'], description:'Tiny vision model — instant image captions, minimal RAM', recommended:true },
  { id:'bakllava:7b',     name:'BakLLaVA 7B',        category:'vision', ramGB:4.5, diskGB:4.7, contextK:4,   ollama_id:'bakllava:7b',     capabilities:['image-understanding','caption'], description:'Alternative LLaVA architecture — solid image understanding', recommended:true },

  // ── VIDEO ────────────────────────────────────────────────────────────────────
  { id:'video-llava:7b',  name:'Video-LLaVA 7B',     category:'video', ramGB:4.8, diskGB:4.8, contextK:4,   ollama_id:'video-llava:7b',  capabilities:['video-understanding','motion','temporal'], description:'Purpose-built for video — understands motion and temporal context', recommended:true },

  // ── EMBEDDINGS ───────────────────────────────────────────────────────────────
  { id:'nomic-embed-text', name:'Nomic Embed Text', category:'embedding', ramGB:0.3, diskGB:0.3, contextK:8, ollama_id:'nomic-embed-text', capabilities:['embeddings','similarity','search'], description:'Best local embedding model — fast semantic search', recommended:true },
  { id:'mxbai-embed-large', name:'MXBai Embed Large', category:'embedding', ramGB:0.7, diskGB:0.7, contextK:8, ollama_id:'mxbai-embed-large', capabilities:['embeddings','search'], description:'High-quality embeddings for RAG pipelines', recommended:true },
  { id:'all-minilm', name:'All-MiniLM', category:'embedding', ramGB:0.1, diskGB:0.1, contextK:0.5, ollama_id:'all-minilm', capabilities:['embeddings'], description:'Tiny embedding model — good for classification and search', recommended:true },
]

// ── Cache helpers ─────────────────────────────────────────────────────────────

interface CacheEntry { data: unknown; fetchedAt: number }

function loadCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  } catch { return {} }
}

function saveCache(cache: Record<string, CacheEntry>): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
  } catch { /* ignore */ }
}

function getCached(key: string): unknown | null {
  const cache = loadCache()
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null
  return entry.data
}

function setCache(key: string, data: unknown): void {
  const cache = loadCache()
  cache[key] = { data, fetchedAt: Date.now() }
  saveCache(cache)
}

// ── Hardware scoring ──────────────────────────────────────────────────────────

function scoreForHardware(m: ModelEntry): { compatible: boolean; rating: '✅' | '⚠️' | '❌'; label: string } {
  if (m.ramGB <= USABLE_RAM_GB)      return { compatible: true,  rating: '✅', label: 'Runs great on your PC' }
  if (m.ramGB <= TOTAL_RAM_GB)       return { compatible: true,  rating: '⚠️', label: 'Works — close other apps first' }
  return { compatible: false, rating: '❌', label: `Needs ${m.ramGB}GB RAM — too large` }
}

// ── HTML Dashboard ────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empire OS — AI Discovery</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#0d0f14; --surface:#161b22; --surface2:#1c2333; --border:#30363d;
    --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --green:#3fb950;
    --red:#f85149; --yellow:#d29922; --purple:#bc8cff; --orange:#e3b341;
  }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; }
  header { background:var(--surface); border-bottom:1px solid var(--border); padding:14px 20px; display:flex; align-items:center; gap:10px; }
  header h1 { font-size:17px; font-weight:600; }
  .badge { background:var(--purple); color:#fff; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:600; }
  .hw-banner { background:var(--surface2); border-bottom:1px solid var(--border); padding:8px 20px; font-size:12px; color:var(--muted); display:flex; gap:20px; align-items:center; }
  .hw-pill { background:var(--surface); border:1px solid var(--border); padding:2px 10px; border-radius:10px; color:var(--text); font-weight:500; }
  .tabs { display:flex; background:var(--surface); border-bottom:1px solid var(--border); padding:0 20px; }
  .tab { padding:10px 16px; font-size:13px; cursor:pointer; border-bottom:2px solid transparent; color:var(--muted); transition:all .15s; }
  .tab.active { color:var(--accent); border-bottom-color:var(--accent); }
  .tab:hover { color:var(--text); }
  .panel { display:none; padding:18px 20px; overflow-y:auto; height:calc(100vh - 130px); }
  .panel.active { display:block; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:12px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; transition:border-color .15s; }
  .card:hover { border-color:var(--accent); }
  .card-header { display:flex; align-items:flex-start; gap:10px; margin-bottom:8px; }
  .card-icon { font-size:20px; min-width:28px; }
  .card-title { font-weight:600; font-size:14px; }
  .card-sub { font-size:11px; color:var(--muted); margin-top:2px; }
  .card-desc { font-size:12px; color:var(--muted); margin-bottom:10px; line-height:1.5; }
  .card-chips { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px; }
  .chip { font-size:10px; padding:1px 7px; border-radius:4px; border:1px solid var(--border); background:var(--surface2); color:var(--muted); }
  .chip.compat-ok { background:rgba(63,185,80,.08); border-color:rgba(63,185,80,.3); color:var(--green); }
  .chip.compat-warn { background:rgba(210,153,34,.08); border-color:rgba(210,153,34,.3); color:var(--yellow); }
  .chip.compat-no { background:rgba(248,81,73,.08); border-color:rgba(248,81,73,.3); color:var(--red); }
  .chip.trending { background:rgba(188,140,255,.08); border-color:rgba(188,140,255,.3); color:var(--purple); }
  .chip.new { background:rgba(63,185,80,.08); border-color:rgba(63,185,80,.3); color:var(--green); }
  .chip.installed { background:rgba(88,166,255,.08); border-color:rgba(88,166,255,.3); color:var(--accent); }
  .card-actions { display:flex; gap:6px; flex-wrap:wrap; }
  .btn { padding:4px 12px; border-radius:5px; border:1px solid var(--border); cursor:pointer; font-size:11px; font-weight:500; background:var(--surface2); color:var(--text); transition:all .15s; }
  .btn:hover { background:var(--border); }
  .btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
  .btn.primary:hover { opacity:.85; }
  .btn.danger { color:var(--red); border-color:rgba(248,81,73,.3); }
  .btn.danger:hover { background:rgba(248,81,73,.1); }
  .btn.warn { color:var(--yellow); border-color:rgba(210,153,34,.3); }
  .btn:disabled { opacity:.4; cursor:not-allowed; }
  .section-title { font-size:13px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; margin-top:4px; }
  .section-gap { margin-bottom:24px; }
  .filter-row { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
  .search-input { background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:6px 12px; color:var(--text); font-size:13px; flex:1; min-width:200px; }
  .search-input:focus { outline:none; border-color:var(--accent); }
  .search-input::placeholder { color:var(--muted); }
  .filter-btn { padding:5px 12px; border-radius:5px; border:1px solid var(--border); font-size:12px; cursor:pointer; background:var(--surface2); color:var(--muted); }
  .filter-btn.active { background:var(--accent); color:#000; border-color:var(--accent); }
  #progress-overlay { display:none; position:fixed; bottom:20px; right:20px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px 18px; min-width:280px; z-index:100; }
  #progress-overlay.show { display:block; }
  .prog-title { font-size:13px; font-weight:600; margin-bottom:6px; }
  .prog-bar-bg { background:var(--border); border-radius:4px; height:5px; margin-bottom:5px; overflow:hidden; }
  .prog-bar-fill { height:100%; background:var(--accent); border-radius:4px; transition:width .3s; }
  .prog-status { font-size:11px; color:var(--muted); }
  .toast { position:fixed; bottom:20px; left:20px; background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:10px 16px; font-size:13px; z-index:200; display:none; }
  .toast.show { display:block; }
  .toast.ok { border-color:var(--green); color:var(--green); }
  .toast.err { border-color:var(--red); color:var(--red); }
  .bench-result { font-size:11px; color:var(--green); font-weight:500; margin-top:4px; }
</style>
</head>
<body>
<header>
  <span style="font-size:20px">🔭</span>
  <h1>AI Discovery</h1>
  <span class="badge">Empire OS</span>
  <button class="btn" style="margin-left:auto" onclick="refresh()">↻ Scan Now</button>
</header>
<div class="hw-banner">
  <span>💻 Your PC:</span>
  <span class="hw-pill">8 GB RAM</span>
  <span class="hw-pill">Windows</span>
  <span id="free-ram" class="hw-pill">Checking RAM...</span>
  <span style="margin-left:auto;font-size:11px" id="last-scan">Loading...</span>
</div>
<div class="tabs">
  <div class="tab active" onclick="showTab('recommended')">⭐ Recommended</div>
  <div class="tab" onclick="showTab('all')">📦 All Models</div>
  <div class="tab" onclick="showTab('video')">🎬 Video AI</div>
  <div class="tab" onclick="showTab('image')">🖼️ Image AI</div>
  <div class="tab" onclick="showTab('audio')">🎵 Audio & Music</div>
  <div class="tab" onclick="showTab('tools')">🔧 Tools & Agents</div>
</div>

<div class="panel active" id="tab-recommended"></div>
<div class="panel" id="tab-all"></div>
<div class="panel" id="tab-video"></div>
<div class="panel" id="tab-image"></div>
<div class="panel" id="tab-audio"></div>
<div class="panel" id="tab-tools"></div>

<div id="progress-overlay">
  <div class="prog-title" id="prog-title">Installing...</div>
  <div class="prog-bar-bg"><div class="prog-bar-fill" id="prog-bar" style="width:0%"></div></div>
  <div class="prog-status" id="prog-status"></div>
</div>
<div class="toast" id="toast"></div>

<script>
const EMPIRE = 'http://localhost:3001'
const OLLAMA = 'http://localhost:11434'
let catalog = [], installed = [], benchmarks = {}

function toast(msg, type='ok') {
  const el = document.getElementById('toast')
  el.textContent = msg; el.className = 'toast show ' + type
  setTimeout(() => el.className = 'toast', 3500)
}

function compatClass(compat) {
  if (compat === '✅') return 'compat-ok'
  if (compat === '⚠️') return 'compat-warn'
  return 'compat-no'
}

function catIcon(cat) {
  return {text:'💬',code:'💻',vision:'👁️',video:'🎬',audio:'🎵',music:'🎼',embedding:'📐',agent:'🤖'}[cat] ?? '📦'
}

function isInstalled(id) {
  return installed.some(m => m.name === id || m.name.startsWith(id.split(':')[0]))
}

function renderCard(m) {
  const hw = m.compat || {}
  const inst = isInstalled(m.ollama_id || m.id)
  const bench = benchmarks[m.ollama_id || m.id]
  const badges = []
  if (m.trending) badges.push('<span class="chip trending">🔥 Trending</span>')
  if (m.isNew)    badges.push('<span class="chip new">✨ New</span>')
  if (inst)       badges.push('<span class="chip installed">✓ Installed</span>')
  if (hw.rating)  badges.push(\`<span class="chip \${compatClass(hw.rating)}">\${hw.rating} \${hw.label}</span>\`)

  const caps = (m.capabilities||[]).map(c => \`<span class="chip">\${c}</span>\`).join('')
  const benchHtml = bench ? \`<div class="bench-result">⚡ \${bench}</div>\` : ''

  const actions = inst
    ? \`<button class="btn" onclick="benchmark('\${m.ollama_id||m.id}', this)">⏱ Benchmark</button>
       <button class="btn danger" onclick="removeModel('\${m.ollama_id||m.id}')">Remove</button>\`
    : (hw.compatible !== false
        ? \`<button class="btn primary" onclick="installModel('\${m.ollama_id||m.id}', this)">Install</button>\`
        : \`<button class="btn" disabled title="\${hw.label}">Too Large</button>\`)

  return \`<div class="card" id="card-\${(m.ollama_id||m.id).replace(/[^a-z0-9]/gi,'_')}">
    <div class="card-header">
      <div class="card-icon">\${catIcon(m.category)}</div>
      <div>
        <div class="card-title">\${m.name}</div>
        <div class="card-sub">\${m.ramGB}GB RAM · \${m.diskGB}GB disk · \${m.contextK}K context</div>
      </div>
    </div>
    <div class="card-desc">\${m.description}</div>
    <div class="card-chips">\${badges.join('')}\${caps}</div>
    \${benchHtml}
    <div class="card-actions">\${actions}</div>
  </div>\`
}

async function loadData() {
  try {
    const [catRes, instRes] = await Promise.all([
      fetch(EMPIRE + '/discovery/catalog'),
      fetch(OLLAMA + '/api/tags').catch(() => ({ ok: false }))
    ])
    catalog = await catRes.json()
    if (instRes.ok) {
      const d = await instRes.json()
      installed = d.models || []
    }
    document.getElementById('last-scan').textContent = 'Updated: ' + new Date().toLocaleTimeString()
    renderAll()
    updateFreeRam()
  } catch(e) {
    toast('Could not load catalog: ' + e.message, 'err')
  }
}

async function updateFreeRam() {
  try {
    const r = await fetch(EMPIRE + '/health-monitor/metrics')
    if (r.ok) {
      const d = await r.json()
      if (d.ram) document.getElementById('free-ram').textContent = d.ram.freeGB.toFixed(1) + ' GB free'
    }
  } catch {}
}

function renderAll() {
  const recommended = catalog.filter(m => m.recommended)
  const all = catalog
  const video = catalog.filter(m => m.category === 'video')
  const image = catalog.filter(m => m.category === 'vision')
  const audio = catalog.filter(m => m.category === 'audio' || m.category === 'music')

  document.getElementById('tab-recommended').innerHTML = \`
    <div class="section-title section-gap">Best for your 8GB Windows PC</div>
    <div class="grid">\${recommended.map(renderCard).join('')}</div>\`

  renderAllTab('')
  document.getElementById('tab-video').innerHTML = \`
    <div class="section-title section-gap">Local Video AI</div>
    <div class="grid">\${video.map(renderCard).join('')}</div>
    \${renderVideoCloud()}\`
  document.getElementById('tab-image').innerHTML = \`
    <div class="section-title section-gap">Local Image AI</div>
    <div class="grid">\${image.map(renderCard).join('')}</div>
    \${renderImageCloud()}\`
  document.getElementById('tab-audio').innerHTML = renderAudioTab()
  document.getElementById('tab-tools').innerHTML = renderToolsTab()
}

function renderAllTab(filter) {
  const cats = ['text','code','vision','embedding']
  let html = '<div class="filter-row">'
  html += '<input class="search-input" id="search-all" placeholder="Search models..." oninput="renderAllTab(this.value)">'
  html += '</div>'
  const filtered = catalog.filter(m => !filter || m.name.toLowerCase().includes(filter.toLowerCase()) || m.description.toLowerCase().includes(filter.toLowerCase()))
  html += '<div class="grid">' + filtered.map(renderCard).join('') + '</div>'
  document.getElementById('tab-all').innerHTML = html
}

function renderVideoCloud() {
  const providers = [
    {name:'ComfyUI', icon:'⚙️', desc:'Local workflow engine — supports LTX Video, AnimateDiff, SVD, and more. Best for full control.', url:'http://localhost:8188', local:true, ram:'GPU-dependent', badge:'Local'},
    {name:'LTX Video', icon:'🎞️', desc:'Fast text-to-video — good quality, runs locally with enough VRAM. 8GB VRAM recommended.', url:'https://huggingface.co/Lightricks/LTX-Video', local:true, ram:'8GB VRAM', badge:'Local/GPU'},
    {name:'Wan', icon:'🌊', desc:'Wan 2.1 — high quality, supports I2V and T2V. Heavy GPU requirements.', url:'https://huggingface.co/Wan-AI', local:true, ram:'12GB+ VRAM', badge:'Local/GPU'},
    {name:'Pika', icon:'✨', desc:'Cloud — cinematic video generation, 1080p. Fast turnaround.', url:'https://pika.art', local:false, ram:'None (cloud)', badge:'Cloud'},
    {name:'Kling', icon:'🎬', desc:'Cloud — excellent motion quality, realistic videos. Subscriptions available.', url:'https://klingai.com', local:false, ram:'None (cloud)', badge:'Cloud'},
    {name:'Luma', icon:'🌌', desc:'Cloud — Dream Machine, excellent for cinematic content and characters.', url:'https://lumalabs.ai', local:false, ram:'None (cloud)', badge:'Cloud'},
    {name:'Runway', icon:'🛤️', desc:'Cloud — Gen-3 Alpha, professional-grade video. Industry standard.', url:'https://runwayml.com', local:false, ram:'None (cloud)', badge:'Cloud'},
  ]
  return '<div class="section-title" style="margin-top:24px;margin-bottom:12px">Video Generation Engines</div><div class="grid">' +
    providers.map(p => \`<div class="card">
      <div class="card-header"><div class="card-icon">\${p.icon}</div>
        <div><div class="card-title">\${p.name}</div><div class="card-sub">\${p.badge} · \${p.ram}</div></div>
      </div>
      <div class="card-desc">\${p.desc}</div>
      <div class="card-actions">
        <button class="btn" onclick="window.open('\${p.url}','_blank')">Open ↗</button>
        \${p.local ? '<button class="btn" onclick="checkLocal(\''+p.name+'\')">Detect</button>' : ''}
      </div>
    </div>\`).join('') + '</div>'
}

function renderImageCloud() {
  const providers = [
    {name:'ComfyUI + FLUX', icon:'⚙️', desc:'Run FLUX locally via ComfyUI — best local image quality. Needs 8-12GB VRAM.', badge:'Local'},
    {name:'ComfyUI + SDXL', icon:'⚙️', desc:'Run SDXL locally via ComfyUI — excellent quality, needs 6GB+ VRAM.', badge:'Local'},
    {name:'Stable Diffusion', icon:'🎨', desc:'Automatic1111 or Forge — the classic local SD interface. Port 7860.', badge:'Local'},
    {name:'DALL·E 3', icon:'🖼️', desc:'OpenAI cloud — highest prompt adherence, photorealistic.', badge:'Cloud (OpenAI key)'},
  ]
  return '<div class="section-title" style="margin-top:24px;margin-bottom:12px">Image Generation Engines</div><div class="grid">' +
    providers.map(p => \`<div class="card">
      <div class="card-header"><div class="card-icon">\${p.icon}</div>
        <div><div class="card-title">\${p.name}</div><div class="card-sub">\${p.badge}</div></div>
      </div>
      <div class="card-desc">\${p.desc}</div>
    </div>\`).join('') + '</div>'
}

function renderAudioTab() {
  const tools = [
    {name:'Whisper (Ollama)', icon:'🎤', id:'whisper', desc:'OpenAI Whisper via Ollama — accurate speech-to-text for any language. Run: ollama pull whisper'},
    {name:'Whisper.cpp', icon:'⚡', desc:'C++ Whisper — fastest local STT. Excellent for transcription workflows.', url:'https://github.com/ggerganov/whisper.cpp'},
    {name:'Piper TTS', icon:'🔊', desc:'Very fast local TTS — many voices, 100% offline. Perfect for video narration.', url:'https://github.com/rhasspy/piper'},
    {name:'Kokoro TTS', icon:'🎶', desc:'High-quality TTS — natural-sounding voices. Small model, local.', url:'https://huggingface.co/hexgrad/Kokoro-82M'},
    {name:'MusicGen (Audiocraft)', icon:'🎸', desc:'Meta MusicGen — generate music from text descriptions. Runs locally.', url:'https://github.com/facebookresearch/audiocraft'},
    {name:'Stable Audio', icon:'🎵', desc:'Stability AI — high-quality music and sound generation. Local or cloud.', url:'https://stableaudio.com'},
    {name:'ElevenLabs', icon:'✨', desc:'Cloud TTS — most natural AI voices available. Production quality.', url:'https://elevenlabs.io', cloud:true},
    {name:'Suno', icon:'🎼', desc:'Cloud music generation — full songs from prompts, lyrics included.', url:'https://suno.com', cloud:true},
  ]
  return '<div class="section-title section-gap">Audio, Speech & Music Tools</div><div class="grid">' +
    tools.map(t => \`<div class="card">
      <div class="card-header"><div class="card-icon">\${t.icon}</div>
        <div><div class="card-title">\${t.name}</div><div class="card-sub">\${t.cloud?'Cloud':'Local'}</div></div>
      </div>
      <div class="card-desc">\${t.desc}</div>
      <div class="card-actions">
        \${t.url ? '<button class="btn" onclick="window.open(\\''+t.url+'\\',\\'_blank\\')">Open ↗</button>' : ''}
      </div>
    </div>\`).join('') + '</div>'
}

function renderToolsTab() {
  const tools = [
    {icon:'🐦', name:'Goose', desc:"Block's Goose — local dev agent. File ops, shell, coding tasks. Already integrated with Empire OS.", badge:'Integrated'},
    {icon:'🎭', name:'Playwright', desc:'Browser automation — scrape, test, interact with any website. Install: npm i -g playwright', badge:'Install via npm'},
    {icon:'🔧', name:'LM Studio', desc:'Desktop GUI for running local LLMs — alternative to Ollama with a nice interface.', badge:'Download'},
    {icon:'🔌', name:'ComfyUI', desc:'Node-based workflow engine for image/video AI. Runs at localhost:8188.', badge:'Download'},
    {icon:'🌐', name:'Open WebUI', desc:'ChatGPT-like UI for your local Ollama models. Docker or npm install.', badge:'Install'},
    {icon:'📡', name:'MCP Servers', desc:'Model Context Protocol servers — connect Claude to any tool or API. Browse at mcp.so', badge:'Ecosystem'},
    {icon:'🤗', name:'HuggingFace Hub', desc:'Browse and download any open-source model. 500k+ models available.', badge:'Cloud'},
  ]
  return '<div class="section-title section-gap">Tools, Agents & Integrations</div><div class="grid">' +
    tools.map(t => \`<div class="card">
      <div class="card-header"><div class="card-icon">\${t.icon}</div>
        <div><div class="card-title">\${t.name}</div><div class="card-sub">\${t.badge}</div></div>
      </div>
      <div class="card-desc">\${t.desc}</div>
    </div>\`).join('') + '</div>'
}

function showTab(id) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.remove('active'))
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.getElementById('tab-' + id).classList.add('active')
  event.target.classList.add('active')
}

async function installModel(id, btn) {
  const old = btn.textContent
  btn.textContent = '⋯'; btn.disabled = true
  const prog = document.getElementById('progress-overlay')
  const bar  = document.getElementById('prog-bar')
  const stat = document.getElementById('prog-status')
  document.getElementById('prog-title').textContent = 'Installing ' + id
  prog.className = 'show'
  bar.style.width = '0%'
  stat.textContent = 'Starting pull...'

  try {
    const r = await fetch(OLLAMA + '/api/pull', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: id, stream: true })
    })
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\\n'); buf = lines.pop() || ''
      for (const l of lines) {
        if (!l.trim()) continue
        try {
          const d = JSON.parse(l)
          if (d.total && d.completed) {
            const pct = Math.round(d.completed / d.total * 100)
            bar.style.width = pct + '%'
            stat.textContent = 'Downloading... ' + pct + '% (' + (d.completed/1e9).toFixed(2) + '/' + (d.total/1e9).toFixed(2) + ' GB)'
          } else if (d.status) {
            stat.textContent = d.status
            if (d.status === 'success') bar.style.width = '100%'
          }
        } catch {}
      }
    }
    prog.className = ''
    toast('✓ ' + id + ' installed and ready')
    btn.textContent = '✓ Installed'; btn.disabled = true
    // Auto-register with Empire
    await fetch(EMPIRE + '/model-manager/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ model: id }) }).catch(() => {})
    await loadData()
  } catch(e) {
    prog.className = ''
    btn.textContent = old; btn.disabled = false
    toast('Install failed: ' + e.message, 'err')
  }
}

async function removeModel(id) {
  if (!confirm('Remove ' + id + '?')) return
  try {
    await fetch(OLLAMA + '/api/delete', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: id }) })
    toast('Removed ' + id)
    await loadData()
  } catch(e) { toast('Remove failed', 'err') }
}

async function benchmark(id, btn) {
  const old = btn.textContent
  btn.textContent = '⏱ Running...'; btn.disabled = true
  try {
    const start = Date.now()
    const r = await fetch(OLLAMA + '/api/generate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model: id, prompt: 'Explain photosynthesis in exactly one sentence.', stream: false })
    })
    const d = await r.json()
    const tps = d.eval_count && d.eval_duration ? (d.eval_count / (d.eval_duration / 1e9)).toFixed(1) : '?'
    const ms = Date.now() - start
    benchmarks[id] = tps + ' tok/s (' + (ms/1000).toFixed(1) + 's)'
    toast('⚡ ' + id + ': ' + benchmarks[id])
    renderAll()
  } catch(e) { toast('Benchmark failed: ' + e.message, 'err') }
  finally { btn.textContent = old; btn.disabled = false }
}

function checkLocal(name) { toast('Checking for ' + name + '...') }
function refresh() { loadData(); toast('Scanning...') }

loadData()
</script>
</body>
</html>`

// ── Module class ──────────────────────────────────────────────────────────────

export class DiscoveryModule implements EmpireModule {
  readonly moduleId = 'discovery'
  private startTime = Date.now()

  async init(_services: CoreServices, _config: Record<string, unknown>): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()

    if (req.path === '/' || req.path === '') {
      return { status: 200, body: HTML, moduleId: this.moduleId, durationMs: Date.now() - start, headers: { 'Content-Type': 'text/html' } }
    }

    if (req.path === '/catalog') {
      const catalogWithCompat = MODEL_CATALOG.map(m => ({
        ...m,
        compat: scoreForHardware(m),
      }))
      return { status: 200, body: catalogWithCompat, moduleId: this.moduleId, durationMs: Date.now() - start }
    }

    if (req.path === '/trending') {
      const cached = getCached('trending')
      if (cached) return { status: 200, body: cached, moduleId: this.moduleId, durationMs: Date.now() - start }

      try {
        const [hfRes, ghRes] = await Promise.allSettled([
          fetch('https://huggingface.co/api/models?sort=downloads&direction=-1&limit=12&filter=text-generation&full=false', { signal: AbortSignal.timeout(8000) }),
          fetch('https://api.github.com/search/repositories?q=topic:llm+topic:ai+language:python&sort=stars&order=desc&per_page=10', {
            signal: AbortSignal.timeout(8000),
            headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Empire-OS/1.0' },
          }),
        ])

        const result: Record<string, unknown> = {}

        if (hfRes.status === 'fulfilled' && hfRes.value.ok) {
          const models = await hfRes.value.json() as Array<{ id: string; downloads?: number; likes?: number }>
          result.huggingface = models.map(m => ({
            id: m.id, name: m.id.split('/').pop(), downloads: m.downloads, likes: m.likes,
            url: `https://huggingface.co/${m.id}`,
          }))
        }

        if (ghRes.status === 'fulfilled' && ghRes.value.ok) {
          const data = await ghRes.value.json() as { items: Array<{ full_name: string; description?: string; stargazers_count: number; html_url: string }> }
          result.github = data.items.map(r => ({
            name: r.full_name, description: r.description, stars: r.stargazers_count, url: r.html_url,
          }))
        }

        setCache('trending', result)
        return { status: 200, body: result, moduleId: this.moduleId, durationMs: Date.now() - start }
      } catch (e) {
        return { status: 503, body: { error: 'Trending fetch failed', detail: String(e) }, moduleId: this.moduleId, durationMs: Date.now() - start }
      }
    }

    if (req.path === '/installed') {
      try {
        const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) })
        const data = await r.json()
        return { status: 200, body: data, moduleId: this.moduleId, durationMs: Date.now() - start }
      } catch {
        return { status: 503, body: { error: 'Ollama unreachable' }, moduleId: this.moduleId, durationMs: Date.now() - start }
      }
    }

    if (req.path === '/benchmark' && req.method === 'POST') {
      const body = req.body as { model?: string } | undefined
      if (!body?.model) return { status: 400, body: { error: 'Missing: model' }, moduleId: this.moduleId, durationMs: Date.now() - start }

      try {
        const t0 = Date.now()
        const r = await fetch(`${OLLAMA_BASE}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: body.model, prompt: 'Explain photosynthesis in exactly one sentence.', stream: false }),
          signal: AbortSignal.timeout(120_000),
        })
        const data = await r.json() as { eval_count?: number; eval_duration?: number; response?: string }
        const ms = Date.now() - t0
        const tps = data.eval_count && data.eval_duration
          ? Math.round(data.eval_count / (data.eval_duration / 1e9))
          : null

        // Save to knowledge base cache
        const cache = loadCache()
        if (!cache['benchmarks']) cache['benchmarks'] = { data: {}, fetchedAt: Date.now() }
        const bench = cache['benchmarks'].data as Record<string, unknown>
        bench[body.model] = { tps, ms, testedAt: new Date().toISOString(), sample: data.response?.slice(0, 100) }
        saveCache(cache)

        return {
          status: 200,
          body: { model: body.model, tokensPerSec: tps, totalMs: ms, evalCount: data.eval_count },
          moduleId: this.moduleId,
          durationMs: Date.now() - start,
        }
      } catch (e) {
        return { status: 500, body: { error: String(e) }, moduleId: this.moduleId, durationMs: Date.now() - start }
      }
    }

    if (req.path === '/health') {
      return { status: 200, body: { status: 'healthy', uptime: Date.now() - this.startTime, models: MODEL_CATALOG.length }, moduleId: this.moduleId, durationMs: Date.now() - start }
    }

    return { status: 404, body: { error: 'Not found' }, moduleId: this.moduleId, durationMs: Date.now() - start }
  }

  async handleEvent(): Promise<void> { /* no events */ }

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> { /* stateless */ }
}
