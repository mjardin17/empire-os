/**
 * DiscoveryEngine — Phase 3 React UI
 * Full discovery catalog with search, filters, quality scores, and install prompts.
 * Calls: GET http://localhost:3001/discovery-engine/all
 * Falls back to mock data when backend unavailable.
 * NEVER installs automatically — copy-to-clipboard pattern only.
 */

import { useState, useEffect, useCallback } from 'react'
import { Search, Star, Download, Cpu, HardDrive, RefreshCw, ExternalLink, Copy, CheckCircle } from 'lucide-react'

interface DiscoveryItem {
  id: string
  name: string
  category: 'llm' | 'code' | 'vision' | 'audio' | 'embedding' | 'mcp' | 'comfyui' | 'github' | 'tool' | 'video'
  version: string
  source: 'ollama' | 'huggingface' | 'github' | 'mcp-registry' | 'comfyui' | 'curated'
  ramGB: number | null
  diskGB: number | null
  qualityScore: number
  installCmd: string
  lastChecked: string
  description: string
  tags: string[]
  trending: boolean
  isNew: boolean
  url?: string
  stars?: number
}

const USABLE_RAM = 5.5

const MOCK: DiscoveryItem[] = [
  { id:'ollama:qwen2.5:7b',        name:'Qwen 2.5 7B',       category:'llm',   version:'2.5',  source:'ollama',  ramGB:4.7,  diskGB:5.0,  qualityScore:92, installCmd:'ollama pull qwen2.5:7b',       lastChecked:new Date().toISOString(), description:'Top 7B model. Multilingual, strong coding and reasoning.', tags:['chat','coding','multilingual'], trending:true, isNew:false, url:'https://ollama.com/library/qwen2.5' },
  { id:'ollama:qwen2.5-coder:7b',  name:'Qwen 2.5 Coder 7B', category:'code',  version:'2.5',  source:'ollama',  ramGB:4.7,  diskGB:5.0,  qualityScore:94, installCmd:'ollama pull qwen2.5-coder:7b', lastChecked:new Date().toISOString(), description:'Best local code model for 8GB RAM. Rivals GPT-4 on coding benchmarks.', tags:['code','typescript','debug'], trending:true, isNew:false, url:'https://ollama.com/library/qwen2.5-coder' },
  { id:'ollama:gemma3:4b',         name:'Gemma 3 4B',         category:'llm',   version:'3',    source:'ollama',  ramGB:3.1,  diskGB:3.3,  qualityScore:88, installCmd:'ollama pull gemma3:4b',        lastChecked:new Date().toISOString(), description:"Google's Gemma 3 — fast, high quality for 8GB laptops.", tags:['chat','fast','google'], trending:true, isNew:true },
  { id:'ollama:phi4-mini:3.8b',    name:'Phi-4 Mini 3.8B',    category:'llm',   version:'4',    source:'ollama',  ramGB:2.6,  diskGB:2.5,  qualityScore:85, installCmd:'ollama pull phi4-mini:3.8b',   lastChecked:new Date().toISOString(), description:'Microsoft Phi-4 Mini — outstanding reasoning for its size.', tags:['reasoning','math'], trending:true, isNew:true },
  { id:'ollama:deepseek-r1:7b',    name:'DeepSeek R1 7B',     category:'llm',   version:'1',    source:'ollama',  ramGB:4.9,  diskGB:5.0,  qualityScore:91, installCmd:'ollama pull deepseek-r1:7b',   lastChecked:new Date().toISOString(), description:'Chain-of-thought reasoning model. Exceptional for math and logic.', tags:['reasoning','chain-of-thought'], trending:true, isNew:true },
  { id:'ollama:llava:7b',          name:'LLaVA 7B Vision',     category:'vision',version:'1.6',  source:'ollama',  ramGB:4.7,  diskGB:4.7,  qualityScore:80, installCmd:'ollama pull llava:7b',          lastChecked:new Date().toISOString(), description:'Multimodal: understands images + text.', tags:['vision','multimodal'], trending:false, isNew:false },
  { id:'ollama:nomic-embed-text',  name:'Nomic Embed Text',    category:'embedding',version:'1.5',source:'ollama', ramGB:0.3,  diskGB:0.3,  qualityScore:87, installCmd:'ollama pull nomic-embed-text', lastChecked:new Date().toISOString(), description:'Best open embedding model. Required for RAG pipelines.', tags:['embeddings','rag'], trending:false, isNew:false },
  { id:'github:ollama/ollama',     name:'Ollama',              category:'tool',  version:'latest',source:'github', ramGB:null, diskGB:null, qualityScore:95, installCmd:'winget install Ollama.Ollama',  lastChecked:new Date().toISOString(), description:'Run LLMs locally. The backbone of Empire OS AI routing.', tags:['runtime','local'], trending:true, isNew:false, url:'https://github.com/ollama/ollama', stars:95000 },
  { id:'github:comfyanonymous/ComfyUI', name:'ComfyUI',       category:'tool',  version:'latest',source:'github', ramGB:null, diskGB:null, qualityScore:90, installCmd:'git clone https://github.com/comfyanonymous/ComfyUI', lastChecked:new Date().toISOString(), description:'Node-based Stable Diffusion UI. Local image generation.', tags:['image','stable-diffusion'], trending:true, isNew:false, url:'https://github.com/comfyanonymous/ComfyUI', stars:55000 },
  { id:'mcp:filesystem',           name:'MCP Filesystem',      category:'mcp',   version:'1.0',  source:'mcp-registry',ramGB:null,diskGB:null,qualityScore:80, installCmd:'npx -y @modelcontextprotocol/server-filesystem', lastChecked:new Date().toISOString(), description:'Read/write local files via MCP. Essential for file-based workflows.', tags:['mcp','files'], trending:false, isNew:false },
  { id:'mcp:brave-search',         name:'MCP Brave Search',    category:'mcp',   version:'1.0',  source:'mcp-registry',ramGB:null,diskGB:null,qualityScore:78, installCmd:'npx -y @modelcontextprotocol/server-brave-search', lastChecked:new Date().toISOString(), description:'Web search via Brave API.', tags:['mcp','search','web'], trending:true, isNew:false },
  { id:'mcp:github',               name:'MCP GitHub',          category:'mcp',   version:'1.0',  source:'mcp-registry',ramGB:null,diskGB:null,qualityScore:82, installCmd:'npx -y @modelcontextprotocol/server-github', lastChecked:new Date().toISOString(), description:'GitHub API via MCP. Create PRs, read repos, search code.', tags:['mcp','github'], trending:true, isNew:false },
]

const CATEGORIES = ['all','llm','code','vision','audio','embedding','mcp','comfyui','github','tool'] as const
type CatFilter = typeof CATEGORIES[number]

const SOURCE_COLORS: Record<string, string> = {
  ollama: 'text-blue-400 bg-blue-400/10',
  huggingface: 'text-yellow-400 bg-yellow-400/10',
  github: 'text-purple-400 bg-purple-400/10',
  'mcp-registry': 'text-green-400 bg-green-400/10',
  comfyui: 'text-orange-400 bg-orange-400/10',
  curated: 'text-gray-400 bg-gray-400/10',
}

function ramBadge(ramGB: number | null): string {
  if (ramGB === null) return '— GB'
  if (ramGB <= USABLE_RAM) return `✅ ${ramGB}GB`
  if (ramGB <= 8) return `⚠️ ${ramGB}GB`
  return `❌ ${ramGB}GB`
}

function ramBadgeColor(ramGB: number | null): string {
  if (ramGB === null) return 'text-gray-400'
  if (ramGB <= USABLE_RAM) return 'text-green-400'
  if (ramGB <= 8) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-green-400'
  if (score >= 70) return 'text-yellow-400'
  return 'text-red-400'
}

export default function DiscoveryEngine() {
  const [items, setItems] = useState<DiscoveryItem[]>([])
  const [filter, setFilter] = useState<CatFilter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 6000)
      const res = await fetch('http://localhost:3001/discovery-engine/all', { signal: controller.signal })
      if (!res.ok) throw new Error('non-ok')
      const data = await res.json() as { entries: DiscoveryItem[]; lastFullScan: string }
      setItems(data.entries ?? MOCK)
      setLastScan(data.lastFullScan ?? null)
    } catch {
      setItems(MOCK)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const triggerScan = async () => {
    setScanning(true)
    try {
      await fetch('http://localhost:3001/discovery-engine/scan', { method: 'POST' })
      setTimeout(() => { load(); setScanning(false) }, 5000)
    } catch {
      setScanning(false)
    }
  }

  const copyCmd = (item: DiscoveryItem) => {
    navigator.clipboard.writeText(item.installCmd).then(() => {
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const filtered = items.filter(it => {
    if (filter !== 'all' && it.category !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q) || it.tags.some(t => t.includes(q))
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">AI Discovery Engine</h2>
          <p className="text-sm text-gray-400">
            {lastScan ? `Last scan: ${new Date(lastScan).toLocaleTimeString()}` : 'Not yet scanned'} · {items.length} items
          </p>
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models, tools, MCPs…"
          className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-500">{filtered.length} results</div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading discovery catalog…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(item => (
            <div key={item.id} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Top row */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-white text-sm">{item.name}</span>
                    {item.trending && <span className="text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">🔥 trending</span>}
                    {item.isNew && <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">✨ new</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${SOURCE_COLORS[item.source] ?? 'text-gray-400'}`}>{item.source}</span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-gray-400 mb-2 leading-relaxed">{item.description}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.tags.map(t => (
                      <span key={t} className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">{t}</span>
                    ))}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-xs">
                    <span className={`flex items-center gap-1 font-medium ${ramBadgeColor(item.ramGB)}`}>
                      <Cpu size={10} />
                      {ramBadge(item.ramGB)}
                    </span>
                    {item.diskGB !== null && (
                      <span className="text-gray-400 flex items-center gap-1">
                        <HardDrive size={10} />
                        {item.diskGB}GB
                      </span>
                    )}
                    <span className={`flex items-center gap-1 font-bold ${scoreColor(item.qualityScore)}`}>
                      <Star size={10} />
                      {item.qualityScore}/100
                    </span>
                    {item.stars !== undefined && (
                      <span className="text-gray-400">⭐ {(item.stars / 1000).toFixed(0)}k</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => copyCmd(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors"
                    title={item.installCmd}
                  >
                    {copiedId === item.id
                      ? <><CheckCircle size={12} className="text-green-400" /> Copied!</>
                      : <><Copy size={12} /> Copy cmd</>
                    }
                  </button>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
                    >
                      <ExternalLink size={12} /> View
                    </a>
                  )}
                </div>
              </div>

              {/* Install cmd */}
              <div className="mt-3 bg-gray-900 rounded-lg px-3 py-2 font-mono text-xs text-green-400 truncate">
                $ {item.installCmd}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">No items match your filters.</div>
          )}
        </div>
      )}
    </div>
  )
}
