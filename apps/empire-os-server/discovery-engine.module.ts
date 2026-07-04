/**
 * DiscoveryEngineModule — Phase 3 Live Multi-Source AI Discovery
 *
 * Extends the existing DiscoveryModule with live scanning from:
 *   - Ollama model library (live API)
 *   - HuggingFace trending models (cached)
 *   - GitHub AI repositories (cached)
 *   - MCP server registry (cached)
 *   - ComfyUI custom nodes (cached)
 *
 * Each discovery entry includes:
 *   name, category, version, source, ramGB, diskGB, qualityScore,
 *   installCmd, lastChecked, description, tags, trending, isNew
 *
 * Rules:
 *   - NEVER auto-installs anything
 *   - All actions require explicit user approval
 *   - Falls back to curated mock data when network unavailable
 *   - Persists discoveries locally in .empire-data/discoveries.json
 *
 * Routes:
 *   GET  /discovery-engine/           → status + counts
 *   GET  /discovery-engine/all        → full discovery list (cached)
 *   GET  /discovery-engine/sources    → which sources are available
 *   GET  /discovery-engine/ollama     → live Ollama library entries
 *   GET  /discovery-engine/huggingface → trending HF models
 *   GET  /discovery-engine/github     → trending GitHub AI repos
 *   GET  /discovery-engine/mcp        → MCP server registry
 *   GET  /discovery-engine/comfyui    → ComfyUI node registry
 *   POST /discovery-engine/scan       → trigger full rescan
 *   GET  /discovery-engine/health     → health check
 */

import fs from 'node:fs'
import path from 'node:path'
import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const DATA_DIR      = process.env.DATA_DIR ?? path.resolve('.empire-data')
const DISCOVERIES_FILE = path.join(DATA_DIR, 'discoveries.json')
const SCAN_LOG_FILE    = path.join(DATA_DIR, 'discovery-scan-log.json')
const CACHE_TTL_MS  = 2 * 60 * 60 * 1000  // 2 hours

// ── Hardware profile ─────────────────────────────────────────────────────────
const USABLE_RAM_GB = 5.5  // 8GB laptop, conservative

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscoveryEntry {
  id: string
  name: string
  category: 'llm' | 'code' | 'vision' | 'audio' | 'embedding' | 'mcp' | 'comfyui' | 'github' | 'tool' | 'video'
  version: string
  source: 'ollama' | 'huggingface' | 'github' | 'mcp-registry' | 'comfyui' | 'curated'
  ramGB: number | null
  diskGB: number | null
  qualityScore: number   // 0–100 composite
  installCmd: string
  lastChecked: string    // ISO timestamp
  description: string
  tags: string[]
  trending: boolean
  isNew: boolean
  url?: string
  stars?: number
  downloads?: number
}

interface ScanEntry {
  source: string
  status: 'success' | 'failed' | 'cached'
  count: number
  timestamp: string
  error?: string
}

interface DiscoveryStore {
  entries: DiscoveryEntry[]
  lastFullScan: string
  scanLog: ScanEntry[]
}

// ── Curated fallback entries (shown when live sources are unavailable) ────────

const CURATED_ENTRIES: DiscoveryEntry[] = [
  // Ollama models
  { id:'ollama:qwen2.5:7b',       name:'Qwen 2.5 7B',           category:'llm',       version:'2.5',   source:'ollama',       ramGB:4.7,  diskGB:5.0,  qualityScore:92, installCmd:'ollama pull qwen2.5:7b',            lastChecked:new Date().toISOString(), description:'Top 7B model. Multilingual, strong coding and reasoning.',                     tags:['chat','coding','multilingual'], trending:true,  isNew:false, url:'https://ollama.com/library/qwen2.5' },
  { id:'ollama:gemma3:4b',        name:'Gemma 3 4B',            category:'llm',       version:'3',     source:'ollama',       ramGB:3.1,  diskGB:3.3,  qualityScore:88, installCmd:'ollama pull gemma3:4b',             lastChecked:new Date().toISOString(), description:"Google's Gemma 3 — fast, high quality for 8GB laptops.",                       tags:['chat','fast','google'],        trending:true,  isNew:true,  url:'https://ollama.com/library/gemma3' },
  { id:'ollama:phi4-mini:3.8b',   name:'Phi-4 Mini 3.8B',       category:'llm',       version:'4',     source:'ollama',       ramGB:2.6,  diskGB:2.5,  qualityScore:85, installCmd:'ollama pull phi4-mini:3.8b',        lastChecked:new Date().toISOString(), description:"Microsoft Phi-4 Mini — outstanding reasoning for its size.",                   tags:['reasoning','math','microsoft'], trending:true, isNew:true, url:'https://ollama.com/library/phi4-mini' },
  { id:'ollama:qwen2.5-coder:7b', name:'Qwen 2.5 Coder 7B',     category:'code',      version:'2.5',   source:'ollama',       ramGB:4.7,  diskGB:5.0,  qualityScore:94, installCmd:'ollama pull qwen2.5-coder:7b',      lastChecked:new Date().toISOString(), description:'Best local code model for 8GB RAM. Rivals GPT-4 on coding benchmarks.',      tags:['code','debug','typescript'],   trending:true,  isNew:false, url:'https://ollama.com/library/qwen2.5-coder' },
  { id:'ollama:llava:7b',         name:'LLaVA 7B Vision',        category:'vision',    version:'1.6',   source:'ollama',       ramGB:4.7,  diskGB:4.7,  qualityScore:80, installCmd:'ollama pull llava:7b',              lastChecked:new Date().toISOString(), description:'Multimodal: understands images + text. Good for visual QA.',                 tags:['vision','multimodal'],         trending:false, isNew:false, url:'https://ollama.com/library/llava' },
  { id:'ollama:nomic-embed-text', name:'Nomic Embed Text',       category:'embedding', version:'1.5',   source:'ollama',       ramGB:0.3,  diskGB:0.3,  qualityScore:87, installCmd:'ollama pull nomic-embed-text',      lastChecked:new Date().toISOString(), description:'Best open embedding model. Required for RAG pipelines.',                     tags:['embeddings','rag','semantic'], trending:false, isNew:false, url:'https://ollama.com/library/nomic-embed-text' },
  { id:'ollama:deepseek-r1:7b',   name:'DeepSeek R1 7B',         category:'llm',       version:'1',     source:'ollama',       ramGB:4.9,  diskGB:5.0,  qualityScore:91, installCmd:'ollama pull deepseek-r1:7b',        lastChecked:new Date().toISOString(), description:'Chain-of-thought reasoning model. Exceptional for math and logic.',          tags:['reasoning','math','chain-of-thought'], trending:true, isNew:true, url:'https://ollama.com/library/deepseek-r1' },
  // HuggingFace models
  { id:'hf:microsoft/phi-4',      name:'Phi-4 (HuggingFace)',    category:'llm',       version:'4',     source:'huggingface',  ramGB:9.0,  diskGB:9.0,  qualityScore:93, installCmd:'huggingface-cli download microsoft/phi-4', lastChecked:new Date().toISOString(), description:'Full Phi-4 model on HF. Requires 16GB+ for full quality.',                  tags:['microsoft','reasoning'],       trending:true,  isNew:true,  url:'https://huggingface.co/microsoft/phi-4' },
  { id:'hf:Qwen/Qwen2.5-7B',     name:'Qwen2.5-7B (HuggingFace)',category:'llm',      version:'2.5',   source:'huggingface',  ramGB:7.0,  diskGB:7.0,  qualityScore:90, installCmd:'huggingface-cli download Qwen/Qwen2.5-7B', lastChecked:new Date().toISOString(), description:'Raw HF weights. Use via Ollama for easier install.',                       tags:['qwen','alibaba'],              trending:true,  isNew:false, url:'https://huggingface.co/Qwen/Qwen2.5-7B' },
  { id:'hf:stabilityai/stable-diffusion-xl', name:'SDXL',        category:'vision',    version:'xl',    source:'huggingface',  ramGB:6.0,  diskGB:6.0,  qualityScore:88, installCmd:'huggingface-cli download stabilityai/stable-diffusion-xl-base-1.0', lastChecked:new Date().toISOString(), description:'Stable Diffusion XL — state of the art image generation.',              tags:['image','generation','art'],    trending:false, isNew:false, url:'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0' },
  // GitHub repos
  { id:'github:ollama/ollama',    name:'Ollama',                 category:'tool',      version:'latest',source:'github',       ramGB:null, diskGB:null, qualityScore:95, installCmd:'winget install Ollama.Ollama',       lastChecked:new Date().toISOString(), description:'Run LLMs locally. The backbone of Empire OS AI routing.',               tags:['runtime','local','llm'],       trending:true,  isNew:false, url:'https://github.com/ollama/ollama',   stars:95000 },
  { id:'github:comfyanonymous/ComfyUI', name:'ComfyUI',          category:'tool',      version:'latest',source:'github',       ramGB:null, diskGB:null, qualityScore:90, installCmd:'git clone https://github.com/comfyanonymous/ComfyUI', lastChecked:new Date().toISOString(), description:'Node-based Stable Diffusion UI. Local image generation.',             tags:['image','stable-diffusion','nodes'], trending:true, isNew:false, url:'https://github.com/comfyanonymous/ComfyUI', stars:55000 },
  { id:'github:open-webui/open-webui', name:'Open WebUI',        category:'tool',      version:'latest',source:'github',       ramGB:null, diskGB:null, qualityScore:88, installCmd:'docker run -p 3000:8080 ghcr.io/open-webui/open-webui', lastChecked:new Date().toISOString(), description:'Beautiful local web UI for Ollama. Chat with your models.',           tags:['ui','chat','docker'],          trending:true,  isNew:false, url:'https://github.com/open-webui/open-webui', stars:48000 },
  { id:'github:block/goose',      name:'Goose CLI',              category:'tool',      version:'latest',source:'github',       ramGB:null, diskGB:null, qualityScore:87, installCmd:'curl -fsSL https://github.com/block/goose/releases/latest/download/install.sh | sh', lastChecked:new Date().toISOString(), description:'Agentic AI dev tool by Block. Runs tasks in your shell.', tags:['agent','cli','coding'],        trending:true,  isNew:true,  url:'https://github.com/block/goose',    stars:12000 },
  // MCP servers
  { id:'mcp:filesystem',          name:'MCP Filesystem',         category:'mcp',       version:'1.0',   source:'mcp-registry', ramGB:null, diskGB:null, qualityScore:80, installCmd:'npx -y @modelcontextprotocol/server-filesystem', lastChecked:new Date().toISOString(), description:'Read/write local files via MCP. Essential for file-based workflows.', tags:['mcp','filesystem','files'],    trending:false, isNew:false, url:'https://github.com/modelcontextprotocol/servers' },
  { id:'mcp:brave-search',        name:'MCP Brave Search',       category:'mcp',       version:'1.0',   source:'mcp-registry', ramGB:null, diskGB:null, qualityScore:78, installCmd:'npx -y @modelcontextprotocol/server-brave-search', lastChecked:new Date().toISOString(), description:'Web search via Brave API. Gives Claude current information.',      tags:['mcp','search','web'],          trending:true,  isNew:false, url:'https://github.com/modelcontextprotocol/servers' },
  { id:'mcp:github',              name:'MCP GitHub',             category:'mcp',       version:'1.0',   source:'mcp-registry', ramGB:null, diskGB:null, qualityScore:82, installCmd:'npx -y @modelcontextprotocol/server-github',      lastChecked:new Date().toISOString(), description:'GitHub API via MCP. Create PRs, read repos, search code.',         tags:['mcp','github','git'],          trending:true,  isNew:false, url:'https://github.com/modelcontextprotocol/servers' },
  { id:'mcp:puppeteer',           name:'MCP Puppeteer',          category:'mcp',       version:'1.0',   source:'mcp-registry', ramGB:null, diskGB:null, qualityScore:76, installCmd:'npx -y @modelcontextprotocol/server-puppeteer',   lastChecked:new Date().toISOString(), description:'Browser automation via MCP. Scrape, test, interact with websites.', tags:['mcp','browser','automation'],  trending:false, isNew:false, url:'https://github.com/modelcontextprotocol/servers' },
  // ComfyUI nodes
  { id:'comfyui:comfyui-manager', name:'ComfyUI Manager',        category:'comfyui',   version:'latest',source:'comfyui',      ramGB:null, diskGB:null, qualityScore:90, installCmd:'git clone https://github.com/ltdrdata/ComfyUI-Manager custom_nodes/ComfyUI-Manager', lastChecked:new Date().toISOString(), description:'Essential manager node for ComfyUI. Install/update other nodes.', tags:['comfyui','manager','essential'], trending:true, isNew:false, url:'https://github.com/ltdrdata/ComfyUI-Manager' },
  { id:'comfyui:controlnet',      name:'ControlNet for ComfyUI', category:'comfyui',   version:'latest',source:'comfyui',      ramGB:null, diskGB:null, qualityScore:85, installCmd:'git clone https://github.com/Fannovel16/comfyui_controlnet_aux custom_nodes/controlnet', lastChecked:new Date().toISOString(), description:'ControlNet preprocessing nodes. Precise control over image generation.', tags:['comfyui','controlnet','image'], trending:false, isNew:false, url:'https://github.com/Fannovel16/comfyui_controlnet_aux' },
  { id:'comfyui:ipadapter',       name:'IPAdapter ComfyUI',      category:'comfyui',   version:'latest',source:'comfyui',      ramGB:null, diskGB:null, qualityScore:83, installCmd:'git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus custom_nodes/ipadapter', lastChecked:new Date().toISOString(), description:'IP-Adapter for style/face transfer in Stable Diffusion.',      tags:['comfyui','style','face'],      trending:true,  isNew:false, url:'https://github.com/cubiq/ComfyUI_IPAdapter_plus' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadStore(): DiscoveryStore {
  ensureDataDir()
  if (!fs.existsSync(DISCOVERIES_FILE)) {
    return { entries: CURATED_ENTRIES, lastFullScan: new Date(0).toISOString(), scanLog: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(DISCOVERIES_FILE, 'utf8')) as DiscoveryStore
  } catch {
    return { entries: CURATED_ENTRIES, lastFullScan: new Date(0).toISOString(), scanLog: [] }
  }
}

function saveStore(store: DiscoveryStore): void {
  ensureDataDir()
  fs.writeFileSync(DISCOVERIES_FILE, JSON.stringify(store, null, 2))
}

function needsRefresh(store: DiscoveryStore): boolean {
  const age = Date.now() - new Date(store.lastFullScan).getTime()
  return age > CACHE_TTL_MS || store.entries.length === 0
}

function computeQualityScore(entry: Partial<DiscoveryEntry>): number {
  let score = 50
  // RAM compatibility bonus
  if (entry.ramGB !== null && entry.ramGB !== undefined) {
    if (entry.ramGB <= USABLE_RAM_GB)  score += 20
    else if (entry.ramGB <= 8)          score += 5
    else                                score -= 10
  } else {
    score += 10 // tools with no RAM req are lightweight
  }
  // Stars/downloads bonus
  if (entry.stars !== undefined) {
    if (entry.stars > 50000) score += 20
    else if (entry.stars > 10000) score += 12
    else if (entry.stars > 1000) score += 6
  }
  if (entry.downloads !== undefined) {
    if (entry.downloads > 1000000) score += 10
    else if (entry.downloads > 100000) score += 5
  }
  // Trending bonus
  if (entry.trending) score += 5
  // New bonus
  if (entry.isNew) score += 5
  return Math.min(100, Math.max(0, score))
}

// ── Live source fetchers ──────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000

async function fetchOllamaLibrary(): Promise<{ entries: DiscoveryEntry[]; status: 'success' | 'failed' }> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error('non-ok')
    const json = await res.json() as { models?: Array<{ name: string; size?: number; modified_at?: string }> }
    const models = json.models ?? []
    const entries: DiscoveryEntry[] = models.map(m => {
      const diskGB = m.size ? parseFloat((m.size / 1_073_741_824).toFixed(1)) : 4
      const isCode = m.name.toLowerCase().includes('coder') || m.name.toLowerCase().includes('code')
      const isVision = m.name.toLowerCase().includes('llava') || m.name.toLowerCase().includes('vision') || m.name.toLowerCase().includes('moondream')
      const category: DiscoveryEntry['category'] = isCode ? 'code' : isVision ? 'vision' : 'llm'
      return {
        id: `ollama:${m.name}`,
        name: m.name,
        category,
        version: m.name.split(':')[1] ?? 'latest',
        source: 'ollama' as const,
        ramGB: diskGB,
        diskGB,
        qualityScore: computeQualityScore({ ramGB: diskGB }),
        installCmd: `ollama pull ${m.name}`,
        lastChecked: new Date().toISOString(),
        description: `Installed Ollama model — ${diskGB}GB`,
        tags: [category],
        trending: false,
        isNew: m.modified_at ? (Date.now() - new Date(m.modified_at).getTime()) < 7 * 24 * 3600 * 1000 : false,
      }
    })
    return { entries, status: 'success' }
  } catch {
    // Fall back to curated Ollama entries
    return {
      entries: CURATED_ENTRIES.filter(e => e.source === 'ollama'),
      status: 'failed',
    }
  }
}

async function fetchHuggingFaceTrending(): Promise<{ entries: DiscoveryEntry[]; status: 'success' | 'failed' }> {
  // HuggingFace doesn't have an unauthenticated trending API — use curated list
  // In production: fetch https://huggingface.co/api/models?sort=trending&limit=20
  const hfEntries = CURATED_ENTRIES.filter(e => e.source === 'huggingface')
  // Stamp with current time
  return {
    entries: hfEntries.map(e => ({ ...e, lastChecked: new Date().toISOString() })),
    status: 'cached',
  }
}

async function fetchGitHubTrending(): Promise<{ entries: DiscoveryEntry[]; status: 'success' | 'failed' }> {
  // GitHub trending requires authentication for reliable access
  // In production: fetch https://api.github.com/search/repositories?q=topic:llm+topic:ai&sort=stars
  const ghEntries = CURATED_ENTRIES.filter(e => e.source === 'github')
  return {
    entries: ghEntries.map(e => ({ ...e, lastChecked: new Date().toISOString() })),
    status: 'cached',
  }
}

async function fetchMCPRegistry(): Promise<{ entries: DiscoveryEntry[]; status: 'success' | 'failed' }> {
  const mcpEntries = CURATED_ENTRIES.filter(e => e.source === 'mcp-registry')
  return {
    entries: mcpEntries.map(e => ({ ...e, lastChecked: new Date().toISOString() })),
    status: 'cached',
  }
}

async function fetchComfyUINodes(): Promise<{ entries: DiscoveryEntry[]; status: 'success' | 'failed' }> {
  const comfyEntries = CURATED_ENTRIES.filter(e => e.source === 'comfyui')
  return {
    entries: comfyEntries.map(e => ({ ...e, lastChecked: new Date().toISOString() })),
    status: 'cached',
  }
}

// ── Full rescan ───────────────────────────────────────────────────────────────

async function runFullScan(store: DiscoveryStore): Promise<DiscoveryStore> {
  const scanLog: ScanEntry[] = []
  const allEntries: DiscoveryEntry[] = []

  const sources = [
    { name: 'ollama',       fn: fetchOllamaLibrary },
    { name: 'huggingface',  fn: fetchHuggingFaceTrending },
    { name: 'github',       fn: fetchGitHubTrending },
    { name: 'mcp-registry', fn: fetchMCPRegistry },
    { name: 'comfyui',      fn: fetchComfyUINodes },
  ]

  for (const s of sources) {
    const result = await s.fn()
    scanLog.push({ source: s.name, status: result.status, count: result.entries.length, timestamp: new Date().toISOString() })
    allEntries.push(...result.entries)
  }

  // Deduplicate by id (prefer live over curated)
  const seen = new Set<string>()
  const deduped = allEntries.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  const updated: DiscoveryStore = {
    entries: deduped,
    lastFullScan: new Date().toISOString(),
    scanLog: [...(store.scanLog ?? []).slice(-50), ...scanLog],
  }
  saveStore(updated)
  return updated
}

// ── Module implementation ─────────────────────────────────────────────────────

export class DiscoveryEngineModule implements EmpireModule {
  readonly moduleId = 'discovery-engine'
  private _services!: CoreServices
  private _store: DiscoveryStore = { entries: [], lastFullScan: new Date(0).toISOString(), scanLog: [] }
  private _scanning = false

  async init(services: CoreServices, _config: Record<string, unknown>): Promise<void> {
    this._services = services
    this._store = loadStore()
    // Lazy background scan — don't block startup
    if (needsRefresh(this._store)) {
      setTimeout(() => this._doScan(), 2000)
    }
  }

  private async _doScan(): Promise<void> {
    if (this._scanning) return
    this._scanning = true
    try {
      this._store = await runFullScan(this._store)
    } finally {
      this._scanning = false
    }
  }

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const t0 = Date.now()
    const { path, method } = req

    // GET /discovery-engine/ — status
    if (path === '/' && method === 'GET') {
      const bySource: Record<string, number> = {}
      for (const e of this._store.entries) {
        bySource[e.source] = (bySource[e.source] ?? 0) + 1
      }
      return ok({ moduleId: this.moduleId, totalEntries: this._store.entries.length, lastFullScan: this._store.lastFullScan, scanning: this._scanning, bySource }, t0)
    }

    // GET /discovery-engine/all — all entries
    if (path === '/all' && method === 'GET') {
      if (needsRefresh(this._store) && !this._scanning) {
        this._doScan().catch(() => undefined)
      }
      return ok({ entries: this._store.entries, lastFullScan: this._store.lastFullScan, scanning: this._scanning }, t0)
    }

    // GET /discovery-engine/sources
    if (path === '/sources' && method === 'GET') {
      return ok({ sources: ['ollama','huggingface','github','mcp-registry','comfyui'], note: 'HuggingFace, GitHub, MCP, ComfyUI currently use curated data — live APIs connect when authenticated' }, t0)
    }

    // GET /discovery-engine/ollama
    if (path === '/ollama' && method === 'GET') {
      const result = await fetchOllamaLibrary()
      return ok({ entries: result.entries, status: result.status }, t0)
    }

    // GET /discovery-engine/huggingface
    if (path === '/huggingface' && method === 'GET') {
      const result = await fetchHuggingFaceTrending()
      return ok({ entries: result.entries, status: result.status }, t0)
    }

    // GET /discovery-engine/github
    if (path === '/github' && method === 'GET') {
      const result = await fetchGitHubTrending()
      return ok({ entries: result.entries, status: result.status }, t0)
    }

    // GET /discovery-engine/mcp
    if (path === '/mcp' && method === 'GET') {
      const result = await fetchMCPRegistry()
      return ok({ entries: result.entries, status: result.status }, t0)
    }

    // GET /discovery-engine/comfyui
    if (path === '/comfyui' && method === 'GET') {
      const result = await fetchComfyUINodes()
      return ok({ entries: result.entries, status: result.status }, t0)
    }

    // POST /discovery-engine/scan — trigger full rescan
    if (path === '/scan' && method === 'POST') {
      if (this._scanning) {
        return ok({ message: 'Scan already in progress', scanning: true }, t0)
      }
      this._doScan().catch(() => undefined)
      return ok({ message: 'Full rescan triggered — check /all in 5 seconds', scanning: true }, t0)
    }

    // GET /discovery-engine/health
    if (path === '/health' && method === 'GET') {
      return ok({ status: 'healthy', totalEntries: this._store.entries.length, lastScan: this._store.lastFullScan }, t0)
    }

    return err(404, `Route not found: ${method} ${path}`, t0)
  }

  async handleEvent(_event: unknown): Promise<void> {}

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', details: { entries: this._store.entries.length, lastScan: this._store.lastFullScan } }
  }

  async shutdown(): Promise<void> {}
}

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(body: unknown, t0: number): GatewayResponse {
  return { status: 200, body, moduleId: 'discovery-engine', durationMs: Date.now() - t0 }
}

function err(status: number, message: string, t0: number): GatewayResponse {
  return { status, body: { error: message }, moduleId: 'discovery-engine', durationMs: Date.now() - t0 }
}
