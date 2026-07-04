/**
 * SelfImprovementModule — Phase 3 Recommendation Engine
 *
 * Compares installed models against discovery catalog + benchmark history
 * to produce actionable upgrade/install recommendations.
 *
 * Core rules (HARD — never break):
 *   - NEVER installs anything automatically
 *   - ALL actions require explicit user approval
 *   - Always keeps rollback history (what was installed before)
 *   - Recommendations expire after 7 days if not acted on
 *   - Upgrade suggestions ranked by: composite score delta + RAM fit
 *
 * Recommendation types:
 *   - upgrade    — replace model X with better model Y
 *   - install    — new model worth trying (not replacing anything)
 *   - benchmark  — model installed but never benchmarked
 *   - cleanup    — model using RAM but low score, could uninstall
 *   - mcp        — new MCP server available that fits use case
 *   - tool       — new tool (GitHub trending) worth installing
 *
 * Routes:
 *   GET  /self-improvement/                  → module status + pending count
 *   GET  /self-improvement/recommendations   → all pending recommendations
 *   POST /self-improvement/approve           → approve a recommendation (body: {id})
 *   POST /self-improvement/dismiss           → dismiss (body: {id, reason?})
 *   POST /self-improvement/analyze           → trigger fresh analysis
 *   GET  /self-improvement/history           → approved/dismissed history
 *   GET  /self-improvement/health            → module health
 */

import fs from 'node:fs'
import path from 'node:path'
import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const DATA_DIR   = process.env.DATA_DIR ?? path.resolve('.empire-data')
const RECS_FILE  = path.join(DATA_DIR, 'recommendations.json')
const OLLAMA_BASE = process.env.OLLAMA_BASE ?? 'http://localhost:11434'
const USABLE_RAM_GB = 5.5

// ── Types ─────────────────────────────────────────────────────────────────────

type RecommendationType = 'upgrade' | 'install' | 'benchmark' | 'cleanup' | 'mcp' | 'tool'
type Priority          = 'critical' | 'high' | 'medium' | 'low'
type RecStatus         = 'pending' | 'approved' | 'dismissed' | 'expired'

interface Recommendation {
  id: string
  type: RecommendationType
  priority: Priority
  title: string
  reason: string
  action: string          // human-readable action ("Run: ollama pull X")
  installCmd?: string     // machine-readable install command
  currentModelId?: string // for upgrades: the model being replaced
  targetModelId?: string  // the suggested model
  estimatedImprovementPct?: number  // composite score delta
  ramGB?: number          // RAM requirement of suggested model
  status: RecStatus
  createdAt: string
  actedAt?: string
  dismissReason?: string
  rollbackCmd?: string    // for upgrades: how to get old model back
}

interface RecStore {
  recommendations: Recommendation[]
  lastAnalysis: string
}

// ── Store helpers ─────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadStore(): RecStore {
  ensureDataDir()
  if (!fs.existsSync(RECS_FILE)) return { recommendations: [], lastAnalysis: new Date(0).toISOString() }
  try {
    return JSON.parse(fs.readFileSync(RECS_FILE, 'utf8')) as RecStore
  } catch {
    return { recommendations: [], lastAnalysis: new Date(0).toISOString() }
  }
}

function saveStore(store: RecStore): void {
  ensureDataDir()
  fs.writeFileSync(RECS_FILE, JSON.stringify(store, null, 2))
}

function makeId(): string {
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Installed model reader ────────────────────────────────────────────────────

async function getInstalledModelIds(): Promise<string[]> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal })
    if (!res.ok) return []
    const json = await res.json() as { models?: Array<{ name: string }> }
    return (json.models ?? []).map(m => m.name)
  } catch {
    return []
  }
}

// ── Load benchmark data ───────────────────────────────────────────────────────

interface StoredBenchmark {
  modelId: string
  composite: number
  tokensPerSec: number
  status: string
  timestamp: string
}

function loadBenchmarks(): StoredBenchmark[] {
  const file = path.join(DATA_DIR, 'benchmarks.json')
  if (!fs.existsSync(file)) return []
  try {
    const store = JSON.parse(fs.readFileSync(file, 'utf8')) as { runs: StoredBenchmark[] }
    // Latest run per model
    const seen = new Map<string, StoredBenchmark>()
    for (const r of (store.runs ?? []).slice().reverse()) {
      if (!seen.has(r.modelId) && r.status === 'completed') seen.set(r.modelId, r)
    }
    return Array.from(seen.values())
  } catch {
    return []
  }
}

// ── Load discovery catalog ────────────────────────────────────────────────────

interface DiscoveryEntry {
  id: string
  name: string
  category: string
  source: string
  ramGB: number | null
  qualityScore: number
  installCmd: string
  trending: boolean
  isNew: boolean
  description: string
}

function loadDiscovery(): DiscoveryEntry[] {
  const file = path.join(DATA_DIR, 'discoveries.json')
  if (!fs.existsSync(file)) return []
  try {
    const store = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: DiscoveryEntry[] }
    return store.entries ?? []
  } catch {
    return []
  }
}

// ── Analysis engine ───────────────────────────────────────────────────────────

function expireOld(store: RecStore): RecStore {
  const now = Date.now()
  const EXPIRY_MS = 7 * 24 * 3600 * 1000
  return {
    ...store,
    recommendations: store.recommendations.map(r =>
      r.status === 'pending' && now - new Date(r.createdAt).getTime() > EXPIRY_MS
        ? { ...r, status: 'expired' as RecStatus }
        : r
    ),
  }
}

async function analyze(store: RecStore): Promise<RecStore> {
  const installed  = await getInstalledModelIds()
  const benchmarks = loadBenchmarks()
  const discovery  = loadDiscovery()

  const benchByModel = new Map(benchmarks.map(b => [b.modelId, b]))

  // IDs already pending so we don't duplicate
  const pendingTargets = new Set(
    store.recommendations.filter(r => r.status === 'pending').map(r => r.targetModelId ?? r.id)
  )

  const newRecs: Recommendation[] = []

  // ── 1. Models installed but never benchmarked ─────────────────────────────
  for (const modelId of installed) {
    if (!benchByModel.has(modelId) && !pendingTargets.has(`bench:${modelId}`)) {
      newRecs.push({
        id: makeId(),
        type: 'benchmark',
        priority: 'medium',
        title: `Benchmark ${modelId}`,
        reason: `${modelId} is installed but has never been benchmarked. Benchmarks help rank your models.`,
        action: `Go to Model Benchmark → select ${modelId} → Run Benchmark`,
        targetModelId: `bench:${modelId}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      })
    }
  }

  // ── 2. Upgrade: installed model outclassed by a better same-size model ────
  const ollamaDiscovery = discovery.filter(d => d.source === 'ollama' && d.ramGB !== null && d.ramGB <= USABLE_RAM_GB)
  for (const bench of benchmarks) {
    if (!installed.includes(bench.modelId)) continue
    const better = ollamaDiscovery
      .filter(d => {
        if (installed.includes(d.id.replace('ollama:', ''))) return false  // already installed
        if (pendingTargets.has(d.id)) return false
        if (!d.ramGB || d.ramGB > USABLE_RAM_GB) return false
        return d.qualityScore > bench.composite + 10  // meaningfully better
      })
      .sort((a, b) => b.qualityScore - a.qualityScore)[0]

    if (better) {
      const delta = Math.round(better.qualityScore - bench.composite)
      newRecs.push({
        id: makeId(),
        type: 'upgrade',
        priority: delta > 20 ? 'high' : 'medium',
        title: `Upgrade ${bench.modelId} → ${better.name}`,
        reason: `${better.name} scores ~${delta}% higher than ${bench.modelId} and fits your 8GB RAM.`,
        action: `Review → Approve → Run: ${better.installCmd}`,
        installCmd: better.installCmd,
        currentModelId: bench.modelId,
        targetModelId: better.id,
        estimatedImprovementPct: delta,
        ramGB: better.ramGB ?? undefined,
        rollbackCmd: `ollama pull ${bench.modelId}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      })
    }
  }

  // ── 3. New trending model fits RAM and isn't installed ─────────────────────
  const trendingNew = discovery.filter(d =>
    d.source === 'ollama' &&
    d.trending &&
    d.isNew &&
    d.ramGB !== null && d.ramGB <= USABLE_RAM_GB &&
    !installed.includes(d.id.replace('ollama:', '')) &&
    !installed.includes(d.name) &&
    !pendingTargets.has(d.id)
  ).slice(0, 3)

  for (const item of trendingNew) {
    newRecs.push({
      id: makeId(),
      type: 'install',
      priority: 'low',
      title: `Try ${item.name} — trending new model`,
      reason: item.description,
      action: `Review → Approve → Run: ${item.installCmd}`,
      installCmd: item.installCmd,
      targetModelId: item.id,
      ramGB: item.ramGB ?? undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
  }

  // ── 4. New MCP servers ─────────────────────────────────────────────────────
  const mcpNew = discovery.filter(d =>
    d.source === 'mcp-registry' &&
    d.isNew &&
    !pendingTargets.has(d.id)
  ).slice(0, 2)

  for (const item of mcpNew) {
    newRecs.push({
      id: makeId(),
      type: 'mcp',
      priority: 'low',
      title: `New MCP: ${item.name}`,
      reason: item.description,
      action: `Review → Approve → Run: ${item.installCmd}`,
      installCmd: item.installCmd,
      targetModelId: item.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
  }

  // ── 5. Low-performing installed models (cleanup candidates) ───────────────
  const lowPerformers = benchmarks
    .filter(b => b.composite < 50 && installed.includes(b.modelId))
    .filter(b => !pendingTargets.has(`cleanup:${b.modelId}`))

  for (const b of lowPerformers) {
    newRecs.push({
      id: makeId(),
      type: 'cleanup',
      priority: 'low',
      title: `Consider removing ${b.modelId}`,
      reason: `${b.modelId} scored ${b.composite.toFixed(0)}/100 in benchmarks — low quality relative to its RAM usage.`,
      action: `Review → Approve removal → Run: ollama rm ${b.modelId}`,
      installCmd: `ollama rm ${b.modelId}`,
      currentModelId: b.modelId,
      targetModelId: `cleanup:${b.modelId}`,
      rollbackCmd: `ollama pull ${b.modelId}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
  }

  const updated: RecStore = {
    recommendations: [...store.recommendations, ...newRecs],
    lastAnalysis: new Date().toISOString(),
  }
  saveStore(updated)
  return updated
}

// ── Module implementation ─────────────────────────────────────────────────────

export class SelfImprovementModule implements EmpireModule {
  readonly moduleId = 'self-improvement'
  private _services!: CoreServices
  private _store: RecStore = { recommendations: [], lastAnalysis: new Date(0).toISOString() }
  private _analyzing = false

  async init(services: CoreServices, _config: Record<string, unknown>): Promise<void> {
    this._services = services
    this._store = expireOld(loadStore())
    saveStore(this._store)
    // Background analysis on startup — non-blocking
    setTimeout(() => this._doAnalyze(), 3000)
  }

  private async _doAnalyze(): Promise<void> {
    if (this._analyzing) return
    this._analyzing = true
    try {
      this._store = expireOld(await analyze(this._store))
    } finally {
      this._analyzing = false
    }
  }

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const t0 = Date.now()
    const { path, method, body } = req

    // GET / — status
    if (path === '/' && method === 'GET') {
      const pending = this._store.recommendations.filter(r => r.status === 'pending').length
      return ok({ moduleId: this.moduleId, pending, lastAnalysis: this._store.lastAnalysis, analyzing: this._analyzing }, t0)
    }

    // GET /recommendations
    if (path === '/recommendations' && method === 'GET') {
      const pending = this._store.recommendations
        .filter(r => r.status === 'pending')
        .sort((a, b) => {
          const pri = { critical: 0, high: 1, medium: 2, low: 3 }
          return pri[a.priority] - pri[b.priority]
        })
      return ok({ recommendations: pending, total: pending.length, analyzing: this._analyzing }, t0)
    }

    // GET /history
    if (path === '/history' && method === 'GET') {
      const done = this._store.recommendations.filter(r => r.status !== 'pending')
      return ok({ history: done.slice().reverse(), total: done.length }, t0)
    }

    // POST /approve
    if (path === '/approve' && method === 'POST') {
      const b = (body ?? {}) as { id?: string }
      if (!b.id) return err(400, 'Missing recommendation id', t0)
      const rec = this._store.recommendations.find(r => r.id === b.id)
      if (!rec) return err(404, 'Recommendation not found', t0)
      if (rec.status !== 'pending') return err(409, `Recommendation is already ${rec.status}`, t0)
      rec.status = 'approved'
      rec.actedAt = new Date().toISOString()
      saveStore(this._store)
      return ok({
        message: 'Recommendation approved. Run the install command manually.',
        recommendation: rec,
        installCmd: rec.installCmd,
        rollbackCmd: rec.rollbackCmd,
      }, t0)
    }

    // POST /dismiss
    if (path === '/dismiss' && method === 'POST') {
      const b = (body ?? {}) as { id?: string; reason?: string }
      if (!b.id) return err(400, 'Missing recommendation id', t0)
      const rec = this._store.recommendations.find(r => r.id === b.id)
      if (!rec) return err(404, 'Recommendation not found', t0)
      if (rec.status !== 'pending') return err(409, `Recommendation is already ${rec.status}`, t0)
      rec.status = 'dismissed'
      rec.actedAt = new Date().toISOString()
      rec.dismissReason = b.reason ?? 'No reason given'
      saveStore(this._store)
      return ok({ message: 'Recommendation dismissed', id: b.id }, t0)
    }

    // POST /analyze
    if (path === '/analyze' && method === 'POST') {
      if (this._analyzing) {
        return ok({ message: 'Analysis already running', analyzing: true }, t0)
      }
      this._doAnalyze().catch(console.error)
      return ok({ message: 'Analysis triggered — check /recommendations shortly', analyzing: true }, t0)
    }

    // GET /health
    if (path === '/health' && method === 'GET') {
      const pending = this._store.recommendations.filter(r => r.status === 'pending').length
      return ok({ status: 'healthy', pending, lastAnalysis: this._store.lastAnalysis }, t0)
    }

    return err(404, `Route not found: ${method} ${path}`, t0)
  }

  async handleEvent(_event: unknown): Promise<void> {}

  async health(): Promise<ModuleHealth> {
    const pending = this._store.recommendations.filter(r => r.status === 'pending').length
    return { status: 'healthy', details: { pending, lastAnalysis: this._store.lastAnalysis } }
  }

  async shutdown(): Promise<void> {}
}

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(body: unknown, t0: number): GatewayResponse {
  return { status: 200, body, moduleId: 'self-improvement', durationMs: Date.now() - t0 }
}

function err(status: number, message: string, t0: number): GatewayResponse {
  return { status, body: { error: message }, moduleId: 'self-improvement', durationMs: Date.now() - t0 }
}
