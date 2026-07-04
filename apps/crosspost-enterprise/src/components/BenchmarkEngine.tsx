/**
 * BenchmarkEngine — Phase 3 React UI
 * Recharts benchmark history + run benchmarks.
 * Calls: GET /benchmark-engine/models, GET /benchmark-engine/history, POST /benchmark-engine/run
 * Falls back to mock data when backend unavailable.
 */

import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend } from 'recharts'
import { Play, RefreshCw, Trophy, Zap, Clock, Cpu } from 'lucide-react'

interface BenchmarkScores {
  coding:      number
  reasoning:   number
  story:       number
  videoPrompt: number
  vision:      number | null
}

interface BenchmarkRun {
  id: string
  modelId: string
  modelName: string
  timestamp: string
  durationMs: number
  tokensPerSec: number
  firstTokenMs: number
  ramUsageMB: number | null
  scores: BenchmarkScores
  composite: number
  status: 'completed' | 'failed' | 'partial'
}

interface ModelEntry {
  modelId: string
  modelName: string
  diskGB: number
  lastBenchmark: BenchmarkRun | null
}

const USABLE_RAM_MB = 5500

const MOCK_RUNS: BenchmarkRun[] = [
  { id:'m1', modelId:'qwen2.5-coder:7b', modelName:'qwen2.5-coder:7b', timestamp:new Date(Date.now()-7200000).toISOString(), durationMs:42000, tokensPerSec:28.4, firstTokenMs:820, ramUsageMB:4800, scores:{ coding:91, reasoning:78, story:72, videoPrompt:68, vision:null }, composite:83.4, status:'completed' },
  { id:'m2', modelId:'qwen2.5:7b',       modelName:'qwen2.5:7b',       timestamp:new Date(Date.now()-3600000).toISOString(), durationMs:38000, tokensPerSec:31.2, firstTokenMs:760, ramUsageMB:4600, scores:{ coding:82, reasoning:86, story:79, videoPrompt:74, vision:null }, composite:82.0, status:'completed' },
  { id:'m3', modelId:'gemma3:4b',         modelName:'gemma3:4b',         timestamp:new Date(Date.now()-1800000).toISOString(), durationMs:22000, tokensPerSec:46.1, firstTokenMs:430, ramUsageMB:3100, scores:{ coding:75, reasoning:71, story:76, videoPrompt:65, vision:null }, composite:74.8, status:'completed' },
  { id:'m4', modelId:'phi4-mini:3.8b',    modelName:'phi4-mini:3.8b',    timestamp:new Date(Date.now()-900000).toISOString(),  durationMs:18000, tokensPerSec:52.3, firstTokenMs:310, ramUsageMB:2600, scores:{ coding:78, reasoning:88, story:70, videoPrompt:60, vision:null }, composite:77.5, status:'completed' },
]

const MOCK_MODELS: ModelEntry[] = [
  { modelId:'qwen2.5-coder:7b', modelName:'qwen2.5-coder:7b', diskGB:5.0, lastBenchmark: MOCK_RUNS[0] },
  { modelId:'qwen2.5:7b',       modelName:'qwen2.5:7b',       diskGB:4.8, lastBenchmark: MOCK_RUNS[1] },
  { modelId:'gemma3:4b',         modelName:'gemma3:4b',         diskGB:3.3, lastBenchmark: MOCK_RUNS[2] },
  { modelId:'phi4-mini:3.8b',    modelName:'phi4-mini:3.8b',    diskGB:2.5, lastBenchmark: MOCK_RUNS[3] },
]

function scoreColor(n: number): string {
  if (n >= 85) return '#4ade80'
  if (n >= 70) return '#facc15'
  return '#f87171'
}

function tpsColor(n: number): string {
  if (n >= 40) return '#4ade80'
  if (n >= 20) return '#facc15'
  return '#f87171'
}

function ramColor(mb: number | null): string {
  if (mb === null) return '#6b7280'
  if (mb <= USABLE_RAM_MB) return '#4ade80'
  return '#f87171'
}

export default function BenchmarkEngine() {
  const [models, setModels] = useState<ModelEntry[]>([])
  const [runs, setRuns] = useState<BenchmarkRun[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [selected, setSelected] = useState<BenchmarkRun | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 6000)
      const [mRes, hRes] = await Promise.all([
        fetch('http://localhost:3001/benchmark-engine/models', { signal: controller.signal }),
        fetch('http://localhost:3001/benchmark-engine/history', { signal: controller.signal }),
      ])
      const mData = mRes.ok ? (await mRes.json() as { models: ModelEntry[] }).models : MOCK_MODELS
      const hData = hRes.ok ? (await hRes.json() as { runs: BenchmarkRun[] }).runs : MOCK_RUNS
      setModels(mData)
      setRuns(hData)
    } catch {
      setModels(MOCK_MODELS)
      setRuns(MOCK_RUNS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const runBenchmark = async (modelId: string) => {
    setRunning(modelId)
    try {
      const res = await fetch('http://localhost:3001/benchmark-engine/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      })
      if (!res.ok) throw new Error('non-ok')
      // Poll for results after 30s
      setTimeout(() => { load(); setRunning(null) }, 30000)
    } catch {
      setRunning(null)
    }
  }

  // Latest run per model for the comparison chart
  const latestRuns = (() => {
    const seen = new Map<string, BenchmarkRun>()
    for (const r of runs.slice().reverse()) {
      if (!seen.has(r.modelId) && r.status === 'completed') seen.set(r.modelId, r)
    }
    return Array.from(seen.values()).sort((a, b) => b.composite - a.composite)
  })()

  const chartData = latestRuns.map(r => ({
    name: r.modelId.split(':')[0].slice(0, 12),
    composite: r.composite,
    tokensPerSec: r.tokensPerSec,
    coding: r.scores.coding,
    reasoning: r.scores.reasoning,
  }))

  const radarData = selected ? [
    { dim:'Coding',       score: selected.scores.coding },
    { dim:'Reasoning',    score: selected.scores.reasoning },
    { dim:'Story',        score: selected.scores.story },
    { dim:'VideoPrompt',  score: selected.scores.videoPrompt },
  ] : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Model Benchmark Engine</h2>
          <p className="text-sm text-gray-400">{runs.length} runs recorded · {models.length} models installed</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading benchmarks…</div>
      ) : (
        <>
          {/* Composite score bar chart */}
          {chartData.length > 0 && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Composite Score Comparison</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={{ fill:'#9ca3af', fontSize:10 }} />
                  <YAxis domain={[0,100]} tick={{ fill:'#9ca3af', fontSize:10 }} />
                  <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #374151', color:'#fff' }} />
                  <Bar dataKey="composite" name="Composite" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="tokensPerSec" name="Tok/s" fill="#8b5cf6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Model cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">Installed Models</h3>
            {models.map(m => {
              const bench = m.lastBenchmark
              const isRunning = running === m.modelId
              return (
                <div
                  key={m.modelId}
                  className={`bg-gray-800/60 border rounded-xl p-4 cursor-pointer transition-colors ${selected?.modelId === m.modelId ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'}`}
                  onClick={() => setSelected(bench ?? null)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium text-sm">{m.modelId}</span>
                        <span className="text-xs text-gray-400">{m.diskGB}GB disk</span>
                      </div>
                      {bench ? (
                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1" style={{ color: scoreColor(bench.composite) }}>
                            <Trophy size={10} /> {bench.composite.toFixed(1)}/100
                          </span>
                          <span className="flex items-center gap-1" style={{ color: tpsColor(bench.tokensPerSec) }}>
                            <Zap size={10} /> {bench.tokensPerSec} tok/s
                          </span>
                          <span className="flex items-center gap-1 text-gray-400">
                            <Clock size={10} /> {bench.firstTokenMs}ms first
                          </span>
                          <span className="flex items-center gap-1" style={{ color: ramColor(bench.ramUsageMB) }}>
                            <Cpu size={10} /> {bench.ramUsageMB ? `${(bench.ramUsageMB/1024).toFixed(1)}GB` : '—'}
                          </span>
                          <span className="text-gray-500">{new Date(bench.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500">Never benchmarked</div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); runBenchmark(m.modelId) }}
                      disabled={!!running}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors shrink-0"
                    >
                      <Play size={12} className={isRunning ? 'animate-pulse' : ''} />
                      {isRunning ? 'Running…' : 'Benchmark'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Radar chart for selected model */}
          {selected && radarData.length > 0 && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-1">{selected.modelId} — Skill Breakdown</h3>
              <p className="text-xs text-gray-400 mb-3">Ran {new Date(selected.timestamp).toLocaleString()}</p>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill:'#9ca3af', fontSize:11 }} />
                  <Radar name={selected.modelId} dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                  <Legend />
                  <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #374151', color:'#fff' }} />
                </RadarChart>
              </ResponsiveContainer>
              {/* Score pills */}
              <div className="grid grid-cols-4 gap-2 mt-3">
                {Object.entries(selected.scores)
                  .filter(([, v]) => v !== null)
                  .map(([key, val]) => (
                  <div key={key} className="text-center bg-gray-900 rounded-lg p-2">
                    <div className="text-xs text-gray-400 capitalize mb-1">{key}</div>
                    <div className="text-sm font-bold" style={{ color: scoreColor(val as number) }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {running && (
            <div className="text-center py-3 text-yellow-400 text-sm animate-pulse">
              ⚡ Benchmarking {running} — this takes ~30s. Results will appear automatically.
            </div>
          )}
        </>
      )}
    </div>
  )
}
