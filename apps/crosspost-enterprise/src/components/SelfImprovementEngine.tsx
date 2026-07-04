/**
 * SelfImprovementEngine — Phase 3 React UI
 * Recommendations with approve/dismiss flow. Rollback info always shown.
 * Calls: GET /self-improvement/recommendations, POST /approve, POST /dismiss, POST /analyze
 * NEVER auto-installs — Josh approves everything manually.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, ArrowUpCircle, Package, Trash2, Server, Wrench, CheckCircle, XCircle, Clock, Copy } from 'lucide-react'

type RecType = 'upgrade' | 'install' | 'benchmark' | 'cleanup' | 'mcp' | 'tool'
type Priority = 'critical' | 'high' | 'medium' | 'low'
type RecStatus = 'pending' | 'approved' | 'dismissed' | 'expired'

interface Recommendation {
  id: string
  type: RecType
  priority: Priority
  title: string
  reason: string
  action: string
  installCmd?: string
  currentModelId?: string
  targetModelId?: string
  estimatedImprovementPct?: number
  ramGB?: number
  status: RecStatus
  createdAt: string
  actedAt?: string
  rollbackCmd?: string
}

const MOCK_RECS: Recommendation[] = [
  { id:'r1', type:'upgrade', priority:'high', title:'Upgrade qwen2.5:7b → Qwen 2.5 Coder 7B', reason:'Qwen 2.5 Coder scores ~12% higher composite for coding tasks and fits your 8GB RAM.', action:'Review → Approve → Run: ollama pull qwen2.5-coder:7b', installCmd:'ollama pull qwen2.5-coder:7b', currentModelId:'qwen2.5:7b', targetModelId:'ollama:qwen2.5-coder:7b', estimatedImprovementPct:12, ramGB:4.7, status:'pending', createdAt:new Date().toISOString(), rollbackCmd:'ollama pull qwen2.5:7b' },
  { id:'r2', type:'install', priority:'medium', title:'Try DeepSeek R1 7B — trending reasoning model', reason:'DeepSeek R1 uses chain-of-thought and scores extremely high on math/logic. 4.9GB RAM — fits your machine.', action:'Review → Approve → Run: ollama pull deepseek-r1:7b', installCmd:'ollama pull deepseek-r1:7b', targetModelId:'ollama:deepseek-r1:7b', ramGB:4.9, status:'pending', createdAt:new Date().toISOString() },
  { id:'r3', type:'benchmark', priority:'low', title:'Benchmark gemma3:4b', reason:'gemma3:4b is installed but has never been benchmarked. Run benchmarks to see how it ranks.', action:'Go to Model Benchmark → select gemma3:4b → Run Benchmark', status:'pending', createdAt:new Date().toISOString() },
  { id:'r4', type:'mcp', priority:'low', title:'New MCP: Brave Search', reason:'Web search via Brave API. Gives Claude current information during tasks.', action:'Review → Approve → Run: npx -y @modelcontextprotocol/server-brave-search', installCmd:'npx -y @modelcontextprotocol/server-brave-search', status:'pending', createdAt:new Date().toISOString() },
]

const TYPE_ICON: Record<RecType, React.ReactNode> = {
  upgrade:   <ArrowUpCircle size={16} className="text-blue-400" />,
  install:   <Package size={16} className="text-green-400" />,
  benchmark: <TrendingUp size={16} className="text-yellow-400" />,
  cleanup:   <Trash2 size={16} className="text-red-400" />,
  mcp:       <Server size={16} className="text-purple-400" />,
  tool:      <Wrench size={16} className="text-orange-400" />,
}

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: 'text-red-400 bg-red-400/10 border-red-400/30',
  high:     'text-orange-400 bg-orange-400/10 border-orange-400/30',
  medium:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  low:      'text-gray-400 bg-gray-400/10 border-gray-400/30',
}

export default function SelfImprovementEngine() {
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [history, setHistory] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 6000)
      const [rRes, hRes] = await Promise.all([
        fetch('http://localhost:3001/self-improvement/recommendations', { signal: controller.signal }),
        fetch('http://localhost:3001/self-improvement/history', { signal: controller.signal }),
      ])
      const rData = rRes.ok ? (await rRes.json() as { recommendations: Recommendation[] }).recommendations : MOCK_RECS
      const hData = hRes.ok ? (await hRes.json() as { history: Recommendation[] }).history : []
      setRecs(rData)
      setHistory(hData)
    } catch {
      setRecs(MOCK_RECS)
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const analyze = async () => {
    setAnalyzing(true)
    try {
      await fetch('http://localhost:3001/self-improvement/analyze', { method: 'POST' })
      setTimeout(() => { load(); setAnalyzing(false) }, 4000)
    } catch {
      setAnalyzing(false)
    }
  }

  const approve = async (rec: Recommendation) => {
    setActingId(rec.id)
    try {
      await fetch('http://localhost:3001/self-improvement/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id }),
      })
    } catch { /* offline — still update local state */ }
    // Optimistic update
    setRecs(prev => prev.filter(r => r.id !== rec.id))
    setHistory(prev => [{ ...rec, status: 'approved', actedAt: new Date().toISOString() }, ...prev])
    if (rec.installCmd) {
      navigator.clipboard.writeText(rec.installCmd).catch(() => {})
    }
    setActingId(null)
  }

  const dismiss = async (rec: Recommendation) => {
    setActingId(rec.id)
    try {
      await fetch('http://localhost:3001/self-improvement/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, reason: 'Dismissed by user' }),
      })
    } catch { /* offline */ }
    setRecs(prev => prev.filter(r => r.id !== rec.id))
    setHistory(prev => [{ ...rec, status: 'dismissed', actedAt: new Date().toISOString() }, ...prev])
    setActingId(null)
  }

  const copyCmd = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const pending = recs.filter(r => r.status === 'pending')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Self Improvement Engine</h2>
          <p className="text-sm text-gray-400">{pending.length} pending recommendations</p>
        </div>
        <button
          onClick={analyze}
          disabled={analyzing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={analyzing ? 'animate-spin' : ''} />
          {analyzing ? 'Analyzing…' : 'Re-analyze'}
        </button>
      </div>

      {/* Safety banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-xs text-yellow-300">
        ⚠️ Nothing installs automatically. Approving a recommendation copies the install command to your clipboard — you run it manually.
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('pending')} className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${tab==='pending' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
          Pending {pending.length > 0 && <span className="ml-1 bg-blue-500 text-white text-xs rounded-full px-1.5">{pending.length}</span>}
        </button>
        <button onClick={() => setTab('history')} className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${tab==='history' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
          History
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading recommendations…</div>
      ) : tab === 'pending' ? (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={40} className="text-green-400 mx-auto mb-3" />
              <div className="text-gray-400 text-sm">All caught up! No recommendations right now.</div>
              <div className="text-gray-500 text-xs mt-1">Click Re-analyze to check for new opportunities.</div>
            </div>
          ) : (
            pending.map(rec => (
              <div key={rec.id} className={`border rounded-xl p-4 ${PRIORITY_COLOR[rec.priority]}`} style={{ background:'rgba(17,24,39,0.8)' }}>
                {/* Type + priority header */}
                <div className="flex items-center gap-2 mb-2">
                  {TYPE_ICON[rec.type]}
                  <span className="text-white font-semibold text-sm flex-1">{rec.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[rec.priority]}`}>{rec.priority}</span>
                </div>

                {/* Reason */}
                <p className="text-xs text-gray-300 mb-3 leading-relaxed">{rec.reason}</p>

                {/* Improvement badge */}
                {rec.estimatedImprovementPct !== undefined && (
                  <div className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full mb-3">
                    <TrendingUp size={10} /> ~{rec.estimatedImprovementPct}% improvement
                  </div>
                )}

                {/* RAM info */}
                {rec.ramGB !== undefined && (
                  <div className="text-xs text-gray-400 mb-3">
                    RAM required: <span className={rec.ramGB <= 5.5 ? 'text-green-400' : 'text-yellow-400'}>{rec.ramGB}GB</span>
                    {rec.ramGB <= 5.5 ? ' ✅ fits your machine' : ' ⚠️ tight on 8GB'}
                  </div>
                )}

                {/* Action */}
                <div className="text-xs text-gray-400 mb-3">
                  <span className="font-medium text-white">Action: </span>{rec.action}
                </div>

                {/* Install command */}
                {rec.installCmd && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 bg-gray-900 rounded-lg px-3 py-1.5 font-mono text-xs text-green-400 truncate">
                      $ {rec.installCmd}
                    </div>
                    <button onClick={() => copyCmd(rec.installCmd!, rec.id)} className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
                      {copiedId === rec.id
                        ? <CheckCircle size={14} className="text-green-400" />
                        : <Copy size={14} className="text-gray-400" />
                      }
                    </button>
                  </div>
                )}

                {/* Rollback info */}
                {rec.rollbackCmd && (
                  <div className="text-xs text-gray-500 mb-3">
                    Rollback: <span className="font-mono text-gray-400">{rec.rollbackCmd}</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(rec)}
                    disabled={actingId === rec.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition-colors"
                  >
                    <CheckCircle size={13} />
                    {rec.type === 'benchmark' ? 'Note it' : 'Approve + Copy cmd'}
                  </button>
                  <button
                    onClick={() => dismiss(rec)}
                    disabled={actingId === rec.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-xs rounded-lg transition-colors"
                  >
                    <XCircle size={13} /> Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* History tab */
        <div className="space-y-2">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No history yet.</div>
          ) : (
            history.map(rec => (
              <div key={rec.id} className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex items-start gap-3">
                {TYPE_ICON[rec.type]}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{rec.title}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <Clock size={10} />
                    {rec.actedAt ? new Date(rec.actedAt).toLocaleString() : '—'}
                    <span className={`px-1.5 py-0.5 rounded-full ${rec.status === 'approved' ? 'text-green-400 bg-green-400/10' : 'text-gray-400 bg-gray-400/10'}`}>
                      {rec.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
