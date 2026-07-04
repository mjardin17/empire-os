/**
 * DiscoveryDashboard — Phase 3 Premium Unified Dashboard
 * Shows: new AI models, trending repos, recommendations, benchmark bests, MCP servers.
 * Aggregates from: /discovery-engine/all, /benchmark-engine/latest, /self-improvement/recommendations
 * Falls back gracefully to curated mock data on any failure.
 */

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Star, Zap, Server, Package, ArrowUpCircle, RefreshCw, ExternalLink, Copy, CheckCircle, Sparkles, Trophy, Cpu } from 'lucide-react'

// ── Minimal shared types ──────────────────────────────────────────────────────

interface DiscoveryItem {
  id: string; name: string; category: string; source: string
  ramGB: number | null; qualityScore: number; installCmd: string
  description: string; tags: string[]; trending: boolean; isNew: boolean; url?: string
}

interface BenchmarkRun {
  modelId: string; composite: number; tokensPerSec: number; timestamp: string
  scores: { coding: number; reasoning: number; story: number; videoPrompt: number; vision: number | null }
}

interface Recommendation {
  id: string; type: string; priority: string; title: string; reason: string
  installCmd?: string; estimatedImprovementPct?: number
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_NEW: DiscoveryItem[] = [
  { id:'ollama:gemma3:4b',       name:'Gemma 3 4B',      category:'llm',  source:'ollama', ramGB:3.1, qualityScore:88, installCmd:'ollama pull gemma3:4b',      description:"Google's Gemma 3 — fast, high quality for 8GB laptops.", tags:['google','fast'], trending:true, isNew:true },
  { id:'ollama:phi4-mini:3.8b',  name:'Phi-4 Mini 3.8B', category:'llm',  source:'ollama', ramGB:2.6, qualityScore:85, installCmd:'ollama pull phi4-mini:3.8b', description:'Microsoft Phi-4 Mini — outstanding reasoning for its size.', tags:['reasoning','microsoft'], trending:true, isNew:true },
  { id:'ollama:deepseek-r1:7b',  name:'DeepSeek R1 7B',  category:'code', source:'ollama', ramGB:4.9, qualityScore:91, installCmd:'ollama pull deepseek-r1:7b',  description:'Chain-of-thought reasoning. Exceptional for math and logic.', tags:['reasoning','chain-of-thought'], trending:true, isNew:true },
]

const MOCK_TRENDING: DiscoveryItem[] = [
  { id:'ollama:qwen2.5-coder:7b', name:'Qwen 2.5 Coder 7B', category:'code', source:'ollama', ramGB:4.7, qualityScore:94, installCmd:'ollama pull qwen2.5-coder:7b', description:'Best local code model for 8GB RAM.', tags:['code','typescript'], trending:true, isNew:false, url:'https://ollama.com/library/qwen2.5-coder' },
  { id:'github:block/goose',       name:'Goose CLI',          category:'tool', source:'github', ramGB:null, qualityScore:87, installCmd:'curl -fsSL https://github.com/block/goose/releases/latest/download/install.sh | sh', description:'Agentic AI dev tool by Block. Runs tasks in your shell.', tags:['agent','cli'], trending:true, isNew:true },
  { id:'github:open-webui/open-webui', name:'Open WebUI',     category:'tool', source:'github', ramGB:null, qualityScore:88, installCmd:'docker run -p 3000:8080 ghcr.io/open-webui/open-webui', description:'Beautiful local chat UI for Ollama.', tags:['ui','chat'], trending:true, isNew:false },
]

const MOCK_MCP: DiscoveryItem[] = [
  { id:'mcp:github', name:'MCP GitHub', category:'mcp', source:'mcp-registry', ramGB:null, qualityScore:82, installCmd:'npx -y @modelcontextprotocol/server-github', description:'GitHub API via MCP.', tags:['github','git'], trending:true, isNew:false },
  { id:'mcp:brave-search', name:'MCP Brave Search', category:'mcp', source:'mcp-registry', ramGB:null, qualityScore:78, installCmd:'npx -y @modelcontextprotocol/server-brave-search', description:'Web search via Brave API.', tags:['search','web'], trending:true, isNew:false },
]

const MOCK_BENCHMARKS: BenchmarkRun[] = [
  { modelId:'qwen2.5-coder:7b', composite:83.4, tokensPerSec:28.4, timestamp:new Date(Date.now()-7200000).toISOString(), scores:{ coding:91, reasoning:78, story:72, videoPrompt:68, vision:null } },
  { modelId:'qwen2.5:7b',       composite:82.0, tokensPerSec:31.2, timestamp:new Date(Date.now()-3600000).toISOString(), scores:{ coding:82, reasoning:86, story:79, videoPrompt:74, vision:null } },
  { modelId:'phi4-mini:3.8b',   composite:77.5, tokensPerSec:52.3, timestamp:new Date(Date.now()-900000).toISOString(),  scores:{ coding:78, reasoning:88, story:70, videoPrompt:60, vision:null } },
]

const MOCK_RECS: Recommendation[] = [
  { id:'r1', type:'upgrade', priority:'high',   title:'Upgrade to Qwen 2.5 Coder 7B', reason:'~12% composite improvement over current best.', installCmd:'ollama pull qwen2.5-coder:7b', estimatedImprovementPct:12 },
  { id:'r2', type:'install', priority:'medium', title:'Try DeepSeek R1 7B',           reason:'Trending chain-of-thought model, fits 8GB RAM.', installCmd:'ollama pull deepseek-r1:7b' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function ramBadge(ramGB: number | null): { text: string; color: string } {
  if (ramGB === null)    return { text:'—', color:'text-gray-400' }
  if (ramGB <= 5.5)      return { text:`${ramGB}GB ✅`, color:'text-green-400' }
  if (ramGB <= 8)        return { text:`${ramGB}GB ⚠️`, color:'text-yellow-400' }
  return                  { text:`${ramGB}GB ❌`, color:'text-red-400' }
}

function scoreBar(score: number): string {
  if (score >= 85) return '#4ade80'
  if (score >= 70) return '#facc15'
  return '#f87171'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)  return 'just now'
  if (diff < 3600000) return `${Math.round(diff/60000)}m ago`
  if (diff < 86400000) return `${Math.round(diff/3600000)}h ago`
  return `${Math.round(diff/86400000)}d ago`
}

// ── Card sub-components ───────────────────────────────────────────────────────

function DiscoveryCard({ item }: { item: DiscoveryItem }) {
  const [copied, setCopied] = useState(false)
  const ram = ramBadge(item.ramGB)
  const copy = () => {
    navigator.clipboard.writeText(item.installCmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col gap-2 hover:border-gray-500 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">{item.name}</div>
          <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-bold" style={{ color: scoreBar(item.qualityScore) }}>{item.qualityScore}</span>
          <span className={`text-xs ${ram.color}`}>{ram.text}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={copy} className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors">
          {copied ? <><CheckCircle size={10} className="text-green-400" /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
            <ExternalLink size={10} /> Docs
          </a>
        )}
        <div className="flex gap-1 ml-auto">
          {item.trending && <span className="text-xs text-orange-400">🔥</span>}
          {item.isNew && <span className="text-xs text-green-400">✨</span>}
        </div>
      </div>
    </div>
  )
}

function BenchmarkCard({ run, rank }: { run: BenchmarkRun; rank: number }) {
  const color = rank === 1 ? '#fbbf24' : rank === 2 ? '#9ca3af' : '#cd7c2f'
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{medal}</span>
        <span className="text-sm font-semibold text-white flex-1">{run.modelId}</span>
        <span className="text-sm font-bold" style={{ color }}>{run.composite.toFixed(1)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {Object.entries(run.scores)
          .filter(([, v]) => v !== null)
          .map(([key, val]) => (
          <div key={key} className="text-center">
            <div className="text-xs text-gray-500 capitalize">{key.slice(0,4)}</div>
            <div className="text-xs font-medium" style={{ color: scoreBar(val as number) }}>{val}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span><Zap size={10} className="inline" /> {run.tokensPerSec} tok/s</span>
        <span>{timeAgo(run.timestamp)}</span>
      </div>
    </div>
  )
}

function RecCard({ rec }: { rec: Recommendation }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (!rec.installCmd) return
    navigator.clipboard.writeText(rec.installCmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  const typeIcon = rec.type === 'upgrade' ? <ArrowUpCircle size={14} className="text-blue-400" /> : <Package size={14} className="text-green-400" />
  const priorityColor = rec.priority === 'high' ? 'text-orange-400' : rec.priority === 'critical' ? 'text-red-400' : 'text-yellow-400'
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
      <div className="flex items-start gap-2 mb-1">
        {typeIcon}
        <span className="text-sm font-medium text-white flex-1">{rec.title}</span>
        <span className={`text-xs ${priorityColor}`}>{rec.priority}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{rec.reason}</p>
      {rec.estimatedImprovementPct !== undefined && (
        <div className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full mb-2">
          <TrendingUp size={9} /> ~{rec.estimatedImprovementPct}%
        </div>
      )}
      {rec.installCmd && (
        <button onClick={copy} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors w-full justify-center">
          {copied ? <><CheckCircle size={11} className="text-green-400" /> Copied install cmd</> : <><Copy size={11} /> Copy install cmd</>}
        </button>
      )}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

interface DashboardData {
  newItems: DiscoveryItem[]
  trendingItems: DiscoveryItem[]
  mcpItems: DiscoveryItem[]
  benchmarks: BenchmarkRun[]
  recommendations: Recommendation[]
  lastUpdated: string
}

async function fetchAll(): Promise<DashboardData> {
  const timeout = (ms: number) => new AbortController().signal
  // fire all in parallel, fail individually to mock
  const [discRes, benchRes, recRes] = await Promise.allSettled([
    fetch('http://localhost:3001/discovery-engine/all', { signal: AbortSignal.timeout(6000) }),
    fetch('http://localhost:3001/benchmark-engine/latest', { signal: AbortSignal.timeout(6000) }),
    fetch('http://localhost:3001/self-improvement/recommendations', { signal: AbortSignal.timeout(6000) }),
  ])

  let allItems: DiscoveryItem[] = []
  if (discRes.status === 'fulfilled' && discRes.value.ok) {
    const d = await discRes.value.json() as { entries: DiscoveryItem[] }
    allItems = d.entries ?? []
  }
  const newItems       = allItems.filter(i => i.isNew).slice(0, 6)
  const trendingItems  = allItems.filter(i => i.trending && !i.isNew).slice(0, 6)
  const mcpItems       = allItems.filter(i => i.source === 'mcp-registry').slice(0, 4)

  let benchmarks: BenchmarkRun[] = MOCK_BENCHMARKS
  if (benchRes.status === 'fulfilled' && benchRes.value.ok) {
    const d = await benchRes.value.json() as { runs: BenchmarkRun[] }
    if ((d.runs ?? []).length > 0) benchmarks = d.runs.slice(0, 5)
  }

  let recommendations: Recommendation[] = MOCK_RECS
  if (recRes.status === 'fulfilled' && recRes.value.ok) {
    const d = await recRes.value.json() as { recommendations: Recommendation[] }
    if ((d.recommendations ?? []).length > 0) recommendations = d.recommendations.slice(0, 4)
  }

  return {
    newItems:        newItems.length      > 0 ? newItems      : MOCK_NEW,
    trendingItems:   trendingItems.length > 0 ? trendingItems : MOCK_TRENDING,
    mcpItems:        mcpItems.length      > 0 ? mcpItems      : MOCK_MCP,
    benchmarks,
    recommendations,
    lastUpdated: new Date().toISOString(),
  }
}

export default function DiscoveryDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchAll())
    } catch {
      setData({ newItems: MOCK_NEW, trendingItems: MOCK_TRENDING, mcpItems: MOCK_MCP, benchmarks: MOCK_BENCHMARKS, recommendations: MOCK_RECS, lastUpdated: new Date().toISOString() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <RefreshCw size={32} className="text-blue-400 animate-spin mx-auto mb-3" />
          <div className="text-gray-400">Loading discovery dashboard…</div>
        </div>
      </div>
    )
  }

  const topBenchmarks = data.benchmarks.slice().sort((a, b) => b.composite - a.composite).slice(0, 3)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-xl">
            <Sparkles size={22} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Discovery Dashboard</h2>
            <p className="text-xs text-gray-400">Updated {timeAgo(data.lastUpdated)}</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'New Models',     value: data.newItems.length,        icon: <Package size={16} className="text-green-400" />,    color:'border-green-500/20 bg-green-500/5' },
          { label:'Trending',       value: data.trendingItems.length,   icon: <TrendingUp size={16} className="text-orange-400" />, color:'border-orange-500/20 bg-orange-500/5' },
          { label:'MCP Servers',    value: data.mcpItems.length,        icon: <Server size={16} className="text-purple-400" />,    color:'border-purple-500/20 bg-purple-500/5' },
          { label:'Recommendations',value: data.recommendations.length, icon: <Star size={16} className="text-yellow-400" />,       color:'border-yellow-500/20 bg-yellow-500/5' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${s.color}`}>
            <div className="flex justify-center mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout below */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left column */}
        <div className="space-y-6">

          {/* New models */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} className="text-green-400" />
              <h3 className="text-sm font-semibold text-white">New Models ✨</h3>
            </div>
            <div className="space-y-2">
              {data.newItems.slice(0,4).map(item => <DiscoveryCard key={item.id} item={item} />)}
            </div>
          </section>

          {/* Recommendations */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Star size={16} className="text-yellow-400" />
              <h3 className="text-sm font-semibold text-white">Recommendations</h3>
            </div>
            <div className="space-y-2">
              {data.recommendations.slice(0,3).map(r => <RecCard key={r.id} rec={r} />)}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">

          {/* Benchmark leaders */}
          {topBenchmarks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={16} className="text-yellow-400" />
                <h3 className="text-sm font-semibold text-white">Benchmark Leaders</h3>
              </div>
              <div className="space-y-2">
                {topBenchmarks.map((b, i) => <BenchmarkCard key={b.modelId} run={b} rank={i+1} />)}
              </div>
            </section>
          )}

          {/* Trending tools */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-orange-400" />
              <h3 className="text-sm font-semibold text-white">Trending Tools 🔥</h3>
            </div>
            <div className="space-y-2">
              {data.trendingItems.slice(0,3).map(item => <DiscoveryCard key={item.id} item={item} />)}
            </div>
          </section>

          {/* MCP servers */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Server size={16} className="text-purple-400" />
              <h3 className="text-sm font-semibold text-white">Latest MCP Servers</h3>
            </div>
            <div className="space-y-2">
              {data.mcpItems.slice(0,3).map(item => <DiscoveryCard key={item.id} item={item} />)}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
