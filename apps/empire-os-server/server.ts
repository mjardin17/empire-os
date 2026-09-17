/**
 * Empire OS Server — Entry Point
 *
 * Boots all CoreServices, registers AI adapters, initialises EmpireModules,
 * and serves HTTP on PORT (default 3001).
 *
 * URL scheme:  http://localhost:PORT/:moduleId/path
 *   empire-assistant  → all AI + agent endpoints
 *   storyforge        → proxies to the StoryForge Python engine (port 8001)
 *   (future)          → crosspost, video-pipeline
 *
 * Start:  npm start   (or: npx tsx server.ts)
 * Keys:   copy .env.example → .env  then add your API keys
 */

import dotenv from 'dotenv'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// Load .env from project root
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { bootstrap } from '@empire-os/core/bootstrap'
import type { ConfigurableAIRouter } from '@empire-os/core'
import { EmpireAssistantModule } from '../empire-assistant/empire-assistant.module.js'
import { AnthropicAdapter } from './adapters/anthropic.adapter.js'
import { GeminiAdapter } from './adapters/gemini.adapter.js'
import { OpenAIAdapter } from './adapters/openai.adapter.js'
import { OllamaAdapter } from './adapters/ollama.adapter.js'
import { InceptionAdapter } from './adapters/inception.adapter.js'
import { GooseExecutor } from './goose.executor.js'
import { ModelManagerModule } from './model-manager.module.js'
import { DiscoveryModule } from './discovery.module.js'
import { HealthMonitorModule } from './health-monitor.module.js'
import { MediaEngineModule } from './media-engine.module.js'
import { KnowledgeBaseModule } from './knowledge-base.module.js'
import { EmpireDashboardModule } from './empire-dashboard.module.js'
import { EmpireStoreModule } from './store.module.js'
import { EmpireInstallerModule } from './installer.module.js'
// Phase 3 — Discovery Engine, Benchmark Engine, Self-Improvement
import { DiscoveryEngineModule } from './discovery-engine.module.js'
import { BenchmarkEngineModule } from './benchmark-engine.module.js'
import { SelfImprovementModule } from './self-improvement.module.js'
import { StoryForgeModule } from '../storyforge/empire-module/storyforge.module.js'
import type { EmpireModule } from '@empire-os/core'
import type { GatewayRequest, HttpMethod } from '@empire-os/core'

const PORT      = Number(process.env.PORT ?? 3001)
const HOST      = process.env.HOST ?? 'localhost'
const BASE_URL  = `http://${HOST}:${PORT}`
const DATA_DIR  = process.env.DATA_DIR ?? path.resolve('.empire-data')
const API_KEY   = process.env.EMPIRE_API_KEY  // undefined = auth disabled (dev mode)

// Paths that don't require authentication
const PUBLIC_PATHS = new Set(['/', '/health'])

// ── helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  process.stdout.write(`[Empire OS] ${msg}\n`)
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown, extra?: Record<string, string>): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extra })
  res.end(JSON.stringify(body))
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString()
  if (!raw) return undefined
  try { return JSON.parse(raw) } catch { return raw }
}

// ── bootstrap ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('Booting...')

  log(`Data directory: ${DATA_DIR}`)
  if (API_KEY) {
    log('Auth: ENABLED — X-Empire-Api-Key required on all non-public endpoints')
  } else {
    log('Auth: DISABLED — set EMPIRE_API_KEY in .env to enable')
  }

  // 1. Core services — file-backed persistence (survives restarts)
  const services = await bootstrap({ dataDir: DATA_DIR })
  log('Core services ready (file-backed persistence active).')

  // 2. Register AI adapters
  //    Provider priority (cost strategy = default):
  //      Ollama  → local, free, handles routine/copy/summary/classification
  //      Claude  → code, architecture, complex reasoning
  //      Gemini  → research, long-context, planning
  //      OpenAI  → GPT-specific features
  //
  //    Routing: 'cost' strategy wins Ollama (costPerMToken=0).
  //             'quality' strategy wins Claude/Gemini (larger context window).
  //             'local-only' strategy forces Ollama exclusively.

  const aiRouter = services.aiRouter as ConfigurableAIRouter

  // ── 1. Ollama (local — no key needed) ─────────────────────────────────────
  const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
  try {
    const ollama = await OllamaAdapter.create(OLLAMA_BASE)
    if (ollama.models.length === 0) {
      log('⚠  Ollama is running but has no models installed. Run: ollama pull llama3')
    } else {
      aiRouter.registerAdapter(ollama)
      // Set cost as default so Ollama wins routine tasks automatically
      await aiRouter.setDefaultStrategy('cost')
      log(`Ollama adapter registered — ${ollama.models.length} model(s): ${ollama.models.map(m => m.id).join(', ')}`)
      log('   Default strategy: cost (Ollama handles routine tasks; cloud AI on fallback)')
    }
  } catch (err) {
    log(`⚠  Ollama not reachable at ${OLLAMA_BASE} — ${err instanceof Error ? err.message : String(err)}`)
    log('   Start Ollama: run  ollama serve  in a terminal, then restart Empire OS')
  }

  // ── 2. Anthropic Claude (complex code, architecture, reasoning) ────────────
  if (process.env.ANTHROPIC_API_KEY) {
    aiRouter.registerAdapter(new AnthropicAdapter(process.env.ANTHROPIC_API_KEY))
    log('Anthropic adapter registered (claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5-20251001)')
    log('   Role: code, architecture, complex reasoning')
  } else {
    log('⚠  ANTHROPIC_API_KEY not set — Claude models unavailable')
  }

  // ── 3. Google Gemini (research, long-context, planning) ───────────────────
  if (process.env.GOOGLE_API_KEY) {
    aiRouter.registerAdapter(new GeminiAdapter(process.env.GOOGLE_API_KEY))
    log('Gemini adapter registered (gemini-1.5-pro, gemini-1.5-flash)')
    log('   Role: research, long-context planning, scripts')
  } else {
    log('   GOOGLE_API_KEY not set — Gemini models skipped (optional)')
  }

  // ── 4. OpenAI (GPT-specific features) ────────────────────────────────────
  if (process.env.OPENAI_API_KEY) {
    aiRouter.registerAdapter(new OpenAIAdapter(process.env.OPENAI_API_KEY))
    log('OpenAI adapter registered (gpt-4o, gpt-4o-mini)')
    log('   Role: GPT-specific tasks, copy, function-calling features')
  } else {
    log('   OPENAI_API_KEY not set — OpenAI models skipped (optional)')
  }

  // ── 5. Inception Labs (cost-optimized tasks: summary, copy, classification) ──
  if (process.env.INCEPTION_API_KEY) {
    aiRouter.registerAdapter(new InceptionAdapter(process.env.INCEPTION_API_KEY))
    log('Inception adapter registered (mercury-2.5)')
    log('   Role: cost-optimized summary, copy, classification')
  } else {
    log('   INCEPTION_API_KEY not set — Inception models skipped (optional)')
  }

  // ── 6. Goose (local dev agent — file ops, shell, coding execution) ────────
  const goose = await GooseExecutor.create()
  if (goose.available) {
    const gooseVersion = await goose.version()
    log(`Goose agent detected (${gooseVersion ?? 'version unknown'})`)
    log('   Role: local coding tasks, file operations, terminal commands')
    log(`   Send tasks to: POST ${BASE_URL}/goose/run`)
  } else {
    log('   Goose not found on PATH — local dev agent disabled')
    log('   Install: https://github.com/block/goose')
  }

  const hasAnyAI = process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || process.env.INCEPTION_API_KEY
  if (!hasAnyAI) {
    log('⚠  No cloud AI keys configured. Ollama will handle all requests (or add keys to .env).')
  }

  // 3. Instantiate and init modules
  const modules = new Map<string, EmpireModule>()

  const ea = new EmpireAssistantModule()
  await ea.init(services, {
    port: PORT,
    baseUrl: `${BASE_URL}/empire-assistant`,
  })
  modules.set(ea.moduleId, ea)
  log(`Module ready: ${ea.moduleId}`)

  const modelManager = new ModelManagerModule()
  await modelManager.init(services, {})
  modules.set(modelManager.moduleId, modelManager)
  log(`Module ready: ${modelManager.moduleId} — http://${HOST}:${PORT}/model-manager/`)

  const discovery = new DiscoveryModule()
  await discovery.init(services, {})
  modules.set(discovery.moduleId, discovery)
  log(`Module ready: ${discovery.moduleId} — http://${HOST}:${PORT}/discovery/`)

  const healthMonitor = new HealthMonitorModule()
  await healthMonitor.init(services, {})
  modules.set(healthMonitor.moduleId, healthMonitor)
  log(`Module ready: ${healthMonitor.moduleId} — http://${HOST}:${PORT}/health-monitor/`)

  const mediaEngine = new MediaEngineModule()
  await mediaEngine.init(services, {})
  modules.set(mediaEngine.moduleId, mediaEngine)
  log(`Module ready: ${mediaEngine.moduleId} — http://${HOST}:${PORT}/media-engine/`)

  const knowledgeBase = new KnowledgeBaseModule()
  await knowledgeBase.init(services, {})
  modules.set(knowledgeBase.moduleId, knowledgeBase)
  log(`Module ready: ${knowledgeBase.moduleId} — http://${HOST}:${PORT}/knowledge-base/`)

  const store = new EmpireStoreModule()
  await store.init(services, {})
  modules.set(store.moduleId, store)
  log(`Module ready: ${store.moduleId} — http://${HOST}:${PORT}/store/`)

  const installer = new EmpireInstallerModule()
  await installer.init(services, {})
  modules.set(installer.moduleId, installer)
  log(`Module ready: ${installer.moduleId} — http://${HOST}:${PORT}/installer/`)

  const dashboard = new EmpireDashboardModule()
  await dashboard.init(services, {})
  modules.set(dashboard.moduleId, dashboard)
  log(`Module ready: ${dashboard.moduleId} — http://${HOST}:${PORT}/empire-dashboard/`)

  // Phase 3 — Discovery Engine
  const discoveryEngine = new DiscoveryEngineModule()
  await discoveryEngine.init(services, {})
  modules.set(discoveryEngine.moduleId, discoveryEngine)
  log(`Module ready: ${discoveryEngine.moduleId} — http://${HOST}:${PORT}/discovery-engine/`)

  // Phase 3 — Benchmark Engine
  const benchmarkEngine = new BenchmarkEngineModule()
  await benchmarkEngine.init(services, {})
  modules.set(benchmarkEngine.moduleId, benchmarkEngine)
  log(`Module ready: ${benchmarkEngine.moduleId} — http://${HOST}:${PORT}/benchmark-engine/`)

  // Phase 3 — Self Improvement Engine
  const selfImprovement = new SelfImprovementModule()
  await selfImprovement.init(services, {})
  modules.set(selfImprovement.moduleId, selfImprovement)
  log(`Module ready: ${selfImprovement.moduleId} — http://${HOST}:${PORT}/self-improvement/`)

  // StoryForge — proxies to the Python engine on its own process/port.
  // Reads STORYFORGE_BASE_URL itself (defaults to http://localhost:8001);
  // no port/baseUrl config needed here. Registers its own workflow +
  // Higgsfield plugin inside onInit(). Runs `python main.py` / `uvicorn
  // main:app --port 8001` separately in apps/storyforge/storyforge-engine/.
  const storyforge = new StoryForgeModule()
  await storyforge.init(services, {})
  modules.set(storyforge.moduleId, storyforge)
  log(`Module ready: ${storyforge.moduleId} — ${process.env.STORYFORGE_BASE_URL ?? 'http://localhost:8001'}`)

  // Future modules — add here:
  // const crosspost = new CrossPostModule()
  // await crosspost.init(services, { port: PORT, baseUrl: `${BASE_URL}/crosspost` })
  // modules.set(crosspost.moduleId, crosspost)

  // 4. HTTP server
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
    const correlationId = (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID()

    try {
      // CORS — allow CrossPost Enterprise (port 3000) to call this server directly
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Empire-Api-Key, X-Correlation-Id')
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      // Auth check — skip for public paths
      if (API_KEY && !PUBLIC_PATHS.has(url.pathname)) {
        const provided = req.headers['x-empire-api-key']
        if (provided !== API_KEY) {
          jsonResponse(res, 401, {
            error: 'Unauthorized',
            hint: 'Include X-Empire-Api-Key header with your EMPIRE_API_KEY value',
          })
          return
        }
      }

      // Server root — redirect to the premium dashboard
      if (url.pathname === '/' || url.pathname === '') {
        res.writeHead(302, { Location: '/empire-dashboard/' })
        res.end()
        return
      }

      // Server-level health
      if (url.pathname === '/health') {
        const health: Record<string, unknown> = { status: 'online', modules: {} }
        for (const [id, mod] of modules) {
          const h = await mod.health().catch(e => ({ status: 'unhealthy', error: String(e) }))
          ;(health.modules as Record<string, unknown>)[id] = h
        }
        jsonResponse(res, 200, health)
        return
      }

      // Provider inventory — GET /providers
      if (url.pathname === '/providers' && req.method === 'GET') {
        const allModels = await services.aiRouter.models()
        jsonResponse(res, 200, {
          providers: allModels.reduce((acc: Record<string, unknown[]>, m) => {
            if (!acc[m.provider]) acc[m.provider] = []
            acc[m.provider].push({ id: m.id, capabilities: m.capabilities, contextWindow: m.contextWindow, costPerMToken: m.costPerMToken })
            return acc
          }, {}),
          goose: { available: goose.available, role: 'local dev agent — file ops, shell, coding' },
          defaultStrategy: 'cost',
          routingRules: {
            cost:       'Ollama wins (costPerMToken=0) — handles routine/copy/summary',
            quality:    'Claude or Gemini wins (largest context window)',
            'local-only': 'Ollama exclusively, no cloud fallback',
            speed:      'Cheapest available model',
          },
        })
        return
      }

      // Goose endpoint — POST /goose/run
      if (url.pathname === '/goose/run' && req.method === 'POST') {
        if (!goose.available) {
          jsonResponse(res, 503, { error: 'Goose not installed', hint: 'Install from https://github.com/block/goose' })
          return
        }
        const reqBody = await readBody(req) as { task?: string } | undefined
        const task = reqBody?.task
        if (!task) {
          jsonResponse(res, 400, { error: 'Missing required field: task' })
          return
        }
        const result = await goose.run(task)
        jsonResponse(res, result.exitCode === 0 ? 200 : 500, result)
        return
      }

      // Module routing — /:moduleId/...path
      const parts = url.pathname.split('/').filter(Boolean)
      const moduleId = parts[0]
      const path = '/' + parts.slice(1).join('/')

      const mod = modules.get(moduleId)
      if (!mod) {
        jsonResponse(res, 404, { error: `Module not found: ${moduleId}`, available: [...modules.keys()] })
        return
      }

      const body = await readBody(req)

      const gReq: GatewayRequest = {
        moduleId,
        path: path || '/',
        method: (req.method ?? 'GET') as HttpMethod,
        body,
        headers: req.headers as Record<string, string>,
        correlationId,
        timeoutMs: 30_000,
      }

      const gRes = await mod.handleRequest(gReq)

      // If the module set a Content-Type (e.g. text/html), honour it
      const contentType = gRes.headers?.['Content-Type'] ?? 'application/json'
      const bodyStr = typeof gRes.body === 'string' ? gRes.body : JSON.stringify(gRes.body)
      res.writeHead(gRes.status, {
        'Content-Type': contentType,
        'X-Module-Id': gRes.moduleId,
        'X-Duration-Ms': String(gRes.durationMs),
        'X-Correlation-Id': correlationId,
      })
      res.end(bodyStr)
    } catch (e) {
      log(`Error handling ${req.method} ${req.url}: ${e instanceof Error ? e.message : String(e)}`)
      jsonResponse(res, 500, {
        error: e instanceof Error ? e.message : 'Internal server error',
        correlationId,
      })
    }
  })

  server.listen(PORT, HOST, () => {
    log(`─────────────────────────────────────────────`)
    log(`Empire OS running at ${BASE_URL}`)
    log(`─────────────────────────────────────────────`)
    log(`Providers:  GET  ${BASE_URL}/providers`)
    log(`Health:     GET  ${BASE_URL}/health`)
    log(`Chat:       POST ${BASE_URL}/empire-assistant/agent/chat`)
    log(`AI:         POST ${BASE_URL}/empire-assistant/ai/complete`)
    log(`Models:     GET  ${BASE_URL}/empire-assistant/ai/models`)
    log(`Goose:      POST ${BASE_URL}/goose/run`)
    log(`Dashboard:  GET  ${BASE_URL}/empire-dashboard/   ← OPEN THIS`)
    log(`Store:      GET  ${BASE_URL}/store/`)
    log(`Models UI:  GET  ${BASE_URL}/model-manager/`)
    log(`Discovery:  GET  ${BASE_URL}/discovery/`)
    log(`Health:     GET  ${BASE_URL}/health-monitor/`)
    log(`Media:      GET  ${BASE_URL}/media-engine/`)
    log(`Memory:     GET  ${BASE_URL}/knowledge-base/`)
    log(`─────────────────────────────────────────────`)
    log(`Provider routing (default strategy: cost)`)
    log(`  Ollama  → local/routine tasks (free, fastest)`)
    log(`  Claude  → code, architecture, reasoning`)
    log(`  Gemini  → research, long-context, scripts`)
    log(`  OpenAI  → GPT-specific features`)
    log(`  Goose   → local dev: file ops, shell, coding`)
    log(`─────────────────────────────────────────────`)
    log(`Apps route AI through:`)
    log(`  POST ${BASE_URL}/empire-assistant/ai/complete`)
    log(`─────────────────────────────────────────────`)
  })

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    log(`${signal} received — shutting down...`)
    await Promise.allSettled([...modules.values()].map(m => m.shutdown()))
    server.close(() => {
      log('Server closed.')
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

main().catch(e => {
  process.stderr.write(`[Empire OS] Fatal startup error: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
