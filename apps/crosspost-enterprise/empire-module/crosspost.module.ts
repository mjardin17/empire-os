/**
 * CrossPost Enterprise EmpireModule — Empire OS adapter.
 *
 * CrossPost runs as its own Node.js process (port 3000).
 * This module is the Empire OS "face" — registration, health, events.
 * All business logic lives in the CrossPost server (server.ts).
 *
 * Capabilities:
 *   - content-generate    POST /api/generate (multi-agent, 6 platforms)
 *   - platform-publish    Social syndication pipeline
 *   - ai-route            POST /api/empire/ai-router (Gemini + Ollama routing)
 *   - empire-inspect      GET /api/inspector/health + POST /api/inspector/advisor
 *   - ollama-manage       GET/POST /api/ollama/*
 *   - video-pipeline      POST /api/video-pipeline/create + execute-step
 *   - mission-control     GET /api/empire/event-bus (live telemetry)
 *   - boss-listers        Listing optimizer UI (frontend panel, no dedicated backend route)
 *   - github-audit        GET /api/github/audit-repo
 *
 * NOTE: Boss Listers is a UI panel inside CrossPost (BossListers.tsx).
 * It simulates listing optimization on the frontend. A real backend route
 * can be added to server.ts when needed — hook already present in module descriptor.
 */

import { BaseModule } from '@empire-os/core'
import type {
  CoreServices,
  ModuleConfig,
  GatewayRequest,
  GatewayResponse,
  DomainEvent,
  HealthReport,
} from '@empire-os/core'

const CROSSPOST_URL = process.env.CROSSPOST_BASE_URL ?? 'http://localhost:3000'
const MODULE_ID = 'crosspost-enterprise'

const CROSSPOST_DESCRIPTOR = {
  id: MODULE_ID,
  name: 'CrossPost Content Operating System',
  version: '2.1.0',
  description:
    'Multi-agent content publishing pipeline (6 platforms), AI routing (Gemini + Ollama), ' +
    'Empire Inspector, Mission Control, Boss Listers listing optimizer, ' +
    'Video Pipeline (13-stage), GitHub auditor, and social syndication.',
  capabilities: [
    'content-generate', 'platform-publish', 'ai-route', 'empire-inspect',
    'ollama-manage', 'video-pipeline', 'mission-control', 'boss-listers',
    'analytics', 'github-audit', 'cron-manage',
  ],
  endpoints: [
    { path: '/api/platforms',                   method: 'GET'  as const },
    { path: '/api/generate',                    method: 'POST' as const },
    { path: '/api/research-monetization',       method: 'POST' as const },
    { path: '/api/empire/register',             method: 'GET'  as const },
    { path: '/api/empire/event-bus',            method: 'GET'  as const },
    { path: '/api/empire/event-bus',            method: 'POST' as const },
    { path: '/api/empire/ai-router',            method: 'POST' as const },
    { path: '/api/video-pipeline/create',       method: 'POST' as const },
    { path: '/api/video-pipeline/execute-step', method: 'POST' as const },
    { path: '/api/inspector/health',            method: 'GET'  as const },
    { path: '/api/inspector/advisor',           method: 'POST' as const },
    { path: '/api/ollama/models',               method: 'GET'  as const },
    { path: '/api/ollama/route',                method: 'POST' as const },
    { path: '/api/ollama/benchmark',            method: 'POST' as const },
    { path: '/api/github/audit-repo',           method: 'GET'  as const },
    { path: '/empire/health',                   method: 'GET'  as const, auth: false },
    { path: '/empire/status',                   method: 'GET'  as const, auth: false },
  ],
  healthPath: '/empire/health',
  baseUrl: CROSSPOST_URL,
  priority: 30,
}

export class CrossPostModule extends BaseModule {
  readonly moduleId = MODULE_ID

  protected override async onInit(): Promise<void> {
    const { workflowEngine, eventBus, moduleGateway } = this.services

    // Register CrossPost with Module Gateway
    await moduleGateway.register(CROSSPOST_DESCRIPTOR)

    // Subscribe: when Video Bot Pipeline renders an episode, forward to CrossPost
    await eventBus.subscribe('render.completed', (e) => this.handleEvent(e))
    // Subscribe: when StoryForge creates a script, CrossPost can draft platform copy
    await eventBus.subscribe('script.created', (e) => this.handleEvent(e))
    // Subscribe: platform alerts
    await eventBus.subscribe('system.alert', (e) => this.handleEvent(e))

    await this.emit('agent.action', {
      action: 'module.registered',
      moduleId: MODULE_ID,
      version: '2.1.0',
      crosspostUrl: CROSSPOST_URL,
      platforms: ['youtube', 'tiktok', 'instagram', 'twitter', 'linkedin', 'reddit'],
    })
  }

  /**
   * Proxy Empire OS gateway requests to CrossPost's Express server.
   * HttpModuleGateway already uses fetch(baseUrl + path) directly,
   * so this method handles in-process routing (tests, direct calls).
   */
  async handleRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const url = `${CROSSPOST_URL}${request.path}`

    try {
      const isBodyless = request.method === 'GET' || request.method === 'DELETE'
      const res = await fetch(url, {
        method: request.method,
        headers: { 'Content-Type': 'application/json', ...(request.headers ?? {}) },
        body: isBodyless ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
      })
      const body = await res.json().catch(() => null)
      return { status: res.status, body, moduleId: MODULE_ID, durationMs: Date.now() - start }
    } catch (err) {
      await this.emit('agent.error', {
        moduleId: MODULE_ID,
        path: request.path,
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        status: 502,
        body: { error: 'CrossPost service unavailable', detail: String(err) },
        moduleId: MODULE_ID,
        durationMs: Date.now() - start,
      }
    }
  }

  /** Forward Empire OS events to CrossPost's /empire/event endpoint (fire-and-forget) */
  override async handleEvent(event: DomainEvent): Promise<void> {
    fetch(`${CROSSPOST_URL}/empire/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: event.topic,
        source: event.source,
        payload: event.payload,
        correlationId: event.correlationId,
      }),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => { /* CrossPost may not be running — non-fatal */ })
  }

  override async health(): Promise<HealthReport> {
    try {
      const res = await fetch(`${CROSSPOST_URL}/empire/health`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) {
        return {
          status: 'degraded',
          details: { httpStatus: res.status, url: CROSSPOST_URL },
          checkedAt: new Date().toISOString(),
        }
      }
      const body = await res.json()
      return {
        status: 'healthy',
        details: { crosspost: body, url: CROSSPOST_URL },
        checkedAt: new Date().toISOString(),
      }
    } catch {
      return {
        status: 'unhealthy',
        details: { reason: 'CrossPost service not reachable', url: CROSSPOST_URL },
        checkedAt: new Date().toISOString(),
      }
    }
  }

  override async shutdown(): Promise<void> {
    // Node.js process manages its own state
  }
}

export default CrossPostModule
