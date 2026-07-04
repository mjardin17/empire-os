/**
 * Video Bot Pipeline EmpireModule — Empire OS adapter.
 *
 * The Video Bot Pipeline runs as a standalone Python system at
 * C:\Users\jjard\claude\video-bot-pipeline\ (or wherever PIPELINE_BASE_URL points).
 * empire_server.py provides the HTTP bridge (FastAPI, port 8002).
 *
 * This module is the Empire OS "face" — registration, health, events.
 * All render logic lives in auto_render.py + the 9 Council bots.
 *
 * Channels:
 *   - Gods & Glory (GG): EP001–EP025 (S1 done, S2 partial, S3 scripted)
 *   - Machine Learning (ML): EP001 scripted
 *   - Little Olympus (LO): EP001 scripted
 *
 * Event subscriptions:
 *   - script.created  → queue a new render
 *
 * Events published:
 *   - render.queued       (delegated to empire_server.py)
 *   - render.started      (delegated to empire_server.py)
 *   - render.completed    (delegated to empire_server.py)
 *   - render.failed       (delegated to empire_server.py)
 */

import { BaseModule } from '@empire-os/core'
import type {
  GatewayRequest,
  GatewayResponse,
  DomainEvent,
  HealthReport,
} from '@empire-os/core'

const PIPELINE_URL = process.env.PIPELINE_BASE_URL ?? 'http://localhost:8002'
const MODULE_ID = 'video-pipeline'

const VIDEO_PIPELINE_DESCRIPTOR = {
  id: MODULE_ID,
  name: 'Video Bot Pipeline',
  version: '1.0.0',
  description:
    'Python auto_render pipeline: JSON scripts → AI images (Pollinations) → ' +
    'TTS (edge-tts) → FFmpeg → MP4. ' +
    '9-bot self-healing Council system. ' +
    'Channels: Gods & Glory, Machine Learning, Little Olympus.',
  capabilities: [
    'render-episode', 'render-season', 'council-run',
    'episode-list', 'render-status',
  ],
  endpoints: [
    { path: '/api/episodes',       method: 'GET'  as const },
    { path: '/api/render',         method: 'POST' as const },
    { path: '/api/renders',        method: 'GET'  as const },
    { path: '/api/council/status', method: 'GET'  as const },
    { path: '/api/render/status',  method: 'GET'  as const },
    { path: '/empire/health',      method: 'GET'  as const, auth: false },
    { path: '/empire/status',      method: 'GET'  as const, auth: false },
  ],
  healthPath: '/empire/health',
  baseUrl: PIPELINE_URL,
  priority: 20,
}

export class VideoPipelineModule extends BaseModule {
  readonly moduleId = MODULE_ID

  protected override async onInit(): Promise<void> {
    const { moduleGateway, eventBus } = this.services

    // Register with Module Gateway
    await moduleGateway.register(VIDEO_PIPELINE_DESCRIPTOR)

    // When StoryForge creates a script, queue a render
    await eventBus.subscribe('script.created', (e) => this.handleEvent(e))

    await this.emit('agent.action', {
      action: 'module.registered',
      moduleId: MODULE_ID,
      version: '1.0.0',
      pipelineUrl: PIPELINE_URL,
      channels: ['gods-glory', 'machine-learning', 'little-olympus'],
    })
  }

  /**
   * Proxy Empire OS gateway requests to the Python empire_server.py.
   * Primary use: trigger renders via POST /api/render, check status, list episodes.
   */
  async handleRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const url = `${PIPELINE_URL}${request.path}`

    try {
      const isBodyless = request.method === 'GET' || request.method === 'DELETE'
      const res = await fetch(url, {
        method: request.method,
        headers: { 'Content-Type': 'application/json', ...(request.headers ?? {}) },
        body: isBodyless ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(request.timeoutMs ?? 120_000), // renders are slow
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
        body: {
          error: 'Video Pipeline server unavailable',
          detail: String(err),
          hint: 'Start empire_server.py: python empire_server.py',
        },
        moduleId: MODULE_ID,
        durationMs: Date.now() - start,
      }
    }
  }

  /**
   * Forward Empire OS events to the pipeline's /empire/event endpoint.
   * script.created → empire_server.py queues auto_render.py subprocess.
   */
  override async handleEvent(event: DomainEvent): Promise<void> {
    fetch(`${PIPELINE_URL}/empire/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: event.topic,
        source: event.source,
        payload: event.payload,
        correlationId: event.correlationId,
      }),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => { /* pipeline server may not be running — non-fatal */ })
  }

  override async health(): Promise<HealthReport> {
    try {
      const res = await fetch(`${PIPELINE_URL}/empire/health`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) {
        return {
          status: 'degraded',
          details: { httpStatus: res.status, url: PIPELINE_URL },
          checkedAt: new Date().toISOString(),
        }
      }
      const body = await res.json()
      return {
        status: body.status === 'healthy' ? 'healthy' : 'degraded',
        details: { pipeline: body, url: PIPELINE_URL },
        checkedAt: new Date().toISOString(),
      }
    } catch {
      return {
        status: 'unhealthy',
        details: {
          reason: 'empire_server.py not running',
          url: PIPELINE_URL,
          fix: 'Run: python empire_server.py  (in C:\\Users\\jjard\\claude\\video-bot-pipeline\\)',
        },
        checkedAt: new Date().toISOString(),
      }
    }
  }

  override async shutdown(): Promise<void> {
    // Python process manages its own state
  }
}

export default VideoPipelineModule
