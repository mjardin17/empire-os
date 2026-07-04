/**
 * StoryForge EmpireModule — Empire OS adapter for the StoryForge Engine (Phase 5).
 *
 * Phases 1-5: story science, character memory, world engine, image studio,
 * publishing intelligence, empire automation studio (campaigns, formats,
 * workflows, scheduler, event bus).
 *
 * Architecture: StoryForge runs as its own Python process (port 8001).
 * This module is the Empire OS "face" — registration, health, events, workflows.
 * All business logic lives in the Python engine.
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
import { HIGGSFIELD_PLUGIN } from './higgsfield.plugin.js'
import { STORY_PIPELINE_WORKFLOW } from './workflows/story-pipeline.js'

const STORYFORGE_URL = process.env.STORYFORGE_BASE_URL ?? 'http://localhost:8001'
const MODULE_ID = 'storyforge'

/** ModuleDescriptor registered with the Module Gateway */
const STORYFORGE_DESCRIPTOR = {
  id: MODULE_ID,
  name: 'StoryForge Engine',
  version: '5.0.0',
  description:
    'Narrative synthesis + publishing + automation engine. ' +
    'Phases 1-5: story science, character memory, world engine, image studio, ' +
    'publishing intelligence, empire automation studio.',
  capabilities: [
    // Phase 1
    'story-science', 'character-memory', 'character-get', 'council-review', 'book-export',
    // Phase 2
    'world-engine', 'world-search', 'continuity-validate',
    // Phase 3
    'image-generate', 'image-list',
    // Phase 4
    'publishing-studio', 'market-research', 'design-brief', 'book-metadata',
    'listing-copy', 'marketing-generate', 'platform-export', 'approve-publish',
    // Phase 5
    'automation-ready', 'automation-status', 'format-generate', 'format-generate-all',
    'campaign-create', 'campaign-start', 'campaign-improve', 'analytics-record',
    'analytics-summary', 'workflow-run', 'schedule-job', 'event-poll',
  ],
  endpoints: [
    // Phase 1
    { path: '/science/analyze',                method: 'POST' as const, description: 'Analyze manuscript' },
    { path: '/characters',                      method: 'POST' as const, description: 'Create character' },
    { path: '/council/review',                  method: 'POST' as const, description: 'Creative Council review (14 specialists)' },
    { path: '/book/export/epub',                method: 'POST' as const, description: 'Export EPUB 3' },
    // Phase 2
    { path: '/worlds',                          method: 'POST' as const, description: 'Create world' },
    { path: '/worlds/{id}/encyclopedia/search', method: 'GET'  as const, description: 'Search world encyclopedia (FTS5)' },
    { path: '/worlds/{id}/continuity/validate', method: 'GET'  as const, description: 'Run 5 continuity checks' },
    // Phase 3
    { path: '/images/generate',                 method: 'POST' as const, description: 'Generate image (Higgsfield/OpenAI/ComfyUI/Placeholder)' },
    { path: '/images',                          method: 'GET'  as const, description: 'List images with filters' },
    // Phase 4
    { path: '/publishing/research/analyze',     method: 'POST' as const, description: 'Aggregate market research' },
    { path: '/publishing/approve',              method: 'POST' as const, description: 'Approve book → package all platforms' },
    // Phase 5
    { path: '/automation/projects/{id}/ready',       method: 'POST' as const, description: 'Mark project ready for automation' },
    { path: '/automation/projects/{id}/status',      method: 'GET'  as const, description: 'Get automation status' },
    { path: '/automation/format-packages/generate',  method: 'POST' as const, description: 'Generate one format package' },
    { path: '/automation/format-packages/generate-all', method: 'POST' as const, description: 'Generate all format packages' },
    { path: '/automation/campaigns',                 method: 'POST' as const, description: 'Create campaign' },
    { path: '/automation/campaigns/{id}/start',      method: 'POST' as const, description: 'Start campaign' },
    { path: '/automation/campaigns/{id}/improve',    method: 'POST' as const, description: 'Run improvement engine' },
    { path: '/automation/analytics/metrics',         method: 'POST' as const, description: 'Record analytics metric' },
    { path: '/automation/workflows',                 method: 'POST' as const, description: 'Create automation workflow' },
    { path: '/automation/workflows/{id}/run',        method: 'POST' as const, description: 'Run automation workflow' },
    { path: '/automation/schedule',                  method: 'POST' as const, description: 'Schedule a job' },
    { path: '/automation/scheduler/run-due',         method: 'POST' as const, description: 'Execute all due scheduled jobs' },
    { path: '/automation/events',                    method: 'GET'  as const, description: 'Poll Phase 5 event log' },
    { path: '/empire/health',                        method: 'GET'  as const, description: 'Health check', auth: false },
  ],
  healthPath: '/empire/health',
  baseUrl: STORYFORGE_URL,
  priority: 20,
}

export class StoryForgeModule extends BaseModule {
  readonly moduleId = MODULE_ID

  protected override async onInit(): Promise<void> {
    const { pluginRegistry, workflowEngine, eventBus, moduleGateway } = this.services

    // Register Higgsfield as cinematic connector
    await pluginRegistry.register(HIGGSFIELD_PLUGIN)

    // Register story-to-render workflow (includes Phase 5 automation steps)
    await workflowEngine.define(STORY_PIPELINE_WORKFLOW)

    // Register StoryForge with Module Gateway
    await moduleGateway.register(STORYFORGE_DESCRIPTOR)

    // Subscribe to Empire OS events to forward to StoryForge
    await eventBus.subscribe('render.completed', (e) => this.handleEvent(e))
    await eventBus.subscribe('render.failed', (e) => this.handleEvent(e))
    await eventBus.subscribe('workflow.step.completed', (e) => this.handleEvent(e))
    await eventBus.subscribe('system.alert', (e) => this.handleEvent(e))

    await this.emit('agent.action', {
      action: 'module.registered',
      moduleId: MODULE_ID,
      version: '5.0.0',
      storyforgeUrl: STORYFORGE_URL,
      phases: [1, 2, 3, 4, 5],
    })
  }

  /**
   * Proxy Empire OS gateway requests to the StoryForge Python service.
   * HttpModuleGateway calls fetch(baseUrl + path) directly, so this
   * method handles in-process routing (tests, direct calls).
   */
  async handleRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const url = `${STORYFORGE_URL}${request.path}`

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
        body: { error: 'StoryForge service unavailable', detail: String(err) },
        moduleId: MODULE_ID,
        durationMs: Date.now() - start,
      }
    }
  }

  override async handleEvent(event: DomainEvent): Promise<void> {
    // Forward Empire OS events to StoryForge's /empire/event endpoint (fire-and-forget)
    fetch(`${STORYFORGE_URL}/empire/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: event.topic,
        source: event.source,
        payload: event.payload,
        correlationId: event.correlationId,
      }),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => { /* StoryForge may not be running — non-fatal */ })
  }

  override async health(): Promise<HealthReport> {
    try {
      const res = await fetch(`${STORYFORGE_URL}/empire/health`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) {
        return {
          status: 'degraded',
          details: { httpStatus: res.status, url: STORYFORGE_URL },
          checkedAt: new Date().toISOString(),
        }
      }
      const body = await res.json()
      return {
        status: 'healthy',
        details: { storyforge: body, url: STORYFORGE_URL },
        checkedAt: new Date().toISOString(),
      }
    } catch {
      return {
        status: 'unhealthy',
        details: { reason: 'StoryForge service not reachable', url: STORYFORGE_URL },
        checkedAt: new Date().toISOString(),
      }
    }
  }

  override async shutdown(): Promise<void> {
    // Python process manages its own state — nothing to flush
  }
}

export default StoryForgeModule
