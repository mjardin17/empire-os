/**
 * Empire OS Server — Entry Point
 *
 * Boots all CoreServices, registers AI adapters, initialises EmpireModules,
 * and serves HTTP on PORT (default 3001).
 *
 * URL scheme:  http://localhost:PORT/:moduleId/path
 *   empire-assistant  → all AI + agent endpoints
 *   (future)          → crosspost, storyforge, video-pipeline
 *
 * Start:  npm start   (or: npx tsx server.ts)
 * Keys:   copy .env.example → .env  then add your API keys
 */

import 'dotenv/config'
import http from 'node:http'
import path from 'node:path'
import { bootstrap } from '@empire-os/core/bootstrap'
import type { ConfigurableAIRouter } from '@empire-os/core'
import { EmpireAssistantModule } from '../empire-assistant/empire-assistant.module.js'
import { AnthropicAdapter } from './adapters/anthropic.adapter.js'
import { GeminiAdapter } from './adapters/gemini.adapter.js'
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

  // 2. Register AI adapters — only if keys are present
  const aiRouter = services.aiRouter as ConfigurableAIRouter

  if (process.env.ANTHROPIC_API_KEY) {
    aiRouter.registerAdapter(new AnthropicAdapter(process.env.ANTHROPIC_API_KEY))
    log('Anthropic adapter registered (claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5-20251001)')
  } else {
    log('⚠  ANTHROPIC_API_KEY not set — Claude models unavailable')
  }

  if (process.env.GOOGLE_API_KEY) {
    aiRouter.registerAdapter(new GeminiAdapter(process.env.GOOGLE_API_KEY))
    log('Gemini adapter registered (gemini-1.5-pro, gemini-1.5-flash)')
  } else {
    log('   GOOGLE_API_KEY not set — Gemini models skipped (optional)')
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) {
    log('⚠  No AI keys configured. Add ANTHROPIC_API_KEY to .env and restart.')
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

  // Future modules — add here:
  // const crosspost = new CrossPostModule()
  // await crosspost.init(services, { port: PORT, baseUrl: `${BASE_URL}/crosspost` })
  // modules.set(crosspost.moduleId, crosspost)

  // 4. HTTP server
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
    const correlationId = (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID()

    try {
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

      // Server root — info page
      if (url.pathname === '/' || url.pathname === '') {
        jsonResponse(res, 200, {
          service: 'Empire OS',
          version: '1.0.0',
          status: 'running',
          port: PORT,
          modules: [...modules.keys()].map(id => ({
            id,
            health: `${BASE_URL}/${id}/health`,
            chat: `${BASE_URL}/${id}/agent/chat`,
            ai: `${BASE_URL}/${id}/ai/complete`,
          })),
          docs: [
            `POST ${BASE_URL}/:moduleId/ai/complete   — raw AI completion`,
            `POST ${BASE_URL}/:moduleId/ai/task        — structured AI task`,
            `GET  ${BASE_URL}/:moduleId/ai/models      — list available models`,
            `GET  ${BASE_URL}/:moduleId/ai/stats       — routing stats`,
            `POST ${BASE_URL}/:moduleId/agent/chat     — context-aware chat`,
            `GET  ${BASE_URL}/:moduleId/agent/memory   — recent memory entries`,
            `POST ${BASE_URL}/:moduleId/agent/remember — write to memory`,
          ],
        })
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

      jsonResponse(res, gRes.status, gRes.body, {
        'X-Module-Id': gRes.moduleId,
        'X-Duration-Ms': String(gRes.durationMs),
        'X-Correlation-Id': correlationId,
      })
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
    log(`🚀 Empire OS running at ${BASE_URL}`)
    log(`   Health:  ${BASE_URL}/health`)
    log(`   Chat:    POST ${BASE_URL}/empire-assistant/agent/chat`)
    log(`   AI:      POST ${BASE_URL}/empire-assistant/ai/complete`)
    log(`   Models:  GET  ${BASE_URL}/empire-assistant/ai/models`)
    log(`─────────────────────────────────────────────`)
    log(`CrossPost / StoryForge can now call:`)
    log(`   ${BASE_URL}/empire-assistant/ai/complete`)
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
