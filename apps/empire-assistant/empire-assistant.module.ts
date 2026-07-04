/**
 * Empire Assistant V2 — EmpireModule
 *
 * The AI brain of Viral Engine. Empire Assistant is a MODULE, not a CoreService.
 * It CONSUMES the AIRouter, MemoryBus, EventBus, and ModuleGateway injected by the
 * platform — it owns nothing itself.
 *
 * Responsibilities:
 *   - Route AI completion and task requests through AIRouter
 *   - Persist conversation context and agent events in MemoryBus
 *   - Subscribe to platform events and summarize them as memory entries
 *   - Surface a single /agent/chat endpoint for human-in-the-loop queries
 *
 * Routing strategy defaults:
 *   - Script / research  → quality (Gemini or Claude)
 *   - Code               → quality (Claude)
 *   - Copy / summary     → speed (fastest available)
 *   - Classification     → cost (cheapest capable model)
 *
 * Event subscriptions:
 *   - agent.action  → logs to MemoryBus with moduleId tag
 *   - agent.error   → logs to MemoryBus, emits system.alert
 *   - system.alert  → persists in MemoryBus under alerts scope
 *
 * Requests handled:
 *   POST  /ai/complete      → AIRouter.complete()
 *   POST  /ai/task          → AIRouter.task()
 *   GET   /ai/models        → AIRouter.models()
 *   GET   /ai/stats         → AIRouter.stats()
 *   POST  /agent/chat       → context-aware chat (reads MemoryBus for context)
 *   GET   /agent/memory     → recent entries from MemoryBus
 *   POST  /agent/remember   → write to MemoryBus
 *   GET   /health           → module health (all CoreServices reachable)
 */

import { BaseModule } from '@empire-os/core'
import type {
  GatewayRequest,
  GatewayResponse,
  DomainEvent,
  HealthReport,
  AIRequest,
  AITask,
} from '@empire-os/core'

const MODULE_ID = 'empire-assistant'
const MEMORY_SCOPE = 'empire-assistant'
const EVENTS_SCOPE = 'empire-assistant-events'
const MAX_CONTEXT_ENTRIES = 20

// baseUrl and healthPath are set during onInit() from config injected by the server.
// Endpoints require description per ModuleDescriptor interface.
const EA_DESCRIPTOR_BASE = {
  id: MODULE_ID,
  name: 'Empire Assistant V2',
  version: '2.0.0',
  description:
    'AI orchestration layer for Viral Engine. Routes all AI requests through AIRouter. ' +
    'Maintains conversation context in MemoryBus. ' +
    'Channels: Gods & Glory, Machine Learning, Little Olympus.',
  capabilities: [
    'ai-complete',
    'ai-task',
    'ai-models',
    'ai-stats',
    'agent-chat',
    'agent-query',
    'agent-remember',
  ],
  endpoints: [
    { path: '/ai/complete',    method: 'POST' as const, description: 'Raw AI completion via AIRouter' },
    { path: '/ai/task',        method: 'POST' as const, description: 'Structured AI task (research/code/copy/etc)' },
    { path: '/ai/models',      method: 'GET'  as const, description: 'List all registered AI models' },
    { path: '/ai/stats',       method: 'GET'  as const, description: 'AI routing statistics' },
    { path: '/agent/chat',     method: 'POST' as const, description: 'Context-aware chat with memory' },
    { path: '/agent/memory',   method: 'GET'  as const, description: 'Read recent MemoryBus entries' },
    { path: '/agent/remember', method: 'POST' as const, description: 'Write key/value to MemoryBus' },
    { path: '/health',         method: 'GET'  as const, description: 'Module health check', auth: false },
  ],
  healthPath: '/health',
  priority: 10,  // highest priority — EA routes before any other module
}

// ── helpers ────────────────────────────────────────────────────────────────

function ok(body: unknown, durationMs: number): GatewayResponse {
  return { status: 200, body, moduleId: MODULE_ID, durationMs }
}

function err(status: number, message: string, durationMs: number): GatewayResponse {
  return { status, body: { error: message }, moduleId: MODULE_ID, durationMs }
}

function elapsed(start: number): number {
  return Date.now() - start
}

// ── module ─────────────────────────────────────────────────────────────────

export class EmpireAssistantModule extends BaseModule {
  readonly moduleId = MODULE_ID

  protected override async onInit(): Promise<void> {
    const { moduleGateway, eventBus, memoryBus } = this.services

    // Build the full descriptor — baseUrl comes from server config at init time
    const baseUrl = (this.config.baseUrl as string) ?? 'http://localhost:3001/empire-assistant'
    const descriptor = { ...EA_DESCRIPTOR_BASE, baseUrl }

    // Register with ModuleGateway so the platform can route to us
    await moduleGateway.register(descriptor)

    // Subscribe to platform events
    eventBus.subscribe('agent.action', (e) => this.handleEvent(e))
    eventBus.subscribe('agent.error',  (e) => this.handleEvent(e))
    eventBus.subscribe('system.alert', (e) => this.handleEvent(e))

    // Seed working memory — EA is now online
    await memoryBus.write(`${MEMORY_SCOPE}.boot`, {
      status: 'online',
      version: '2.0.0',
      bootedAt: new Date().toISOString(),
      channels: ['gods-glory', 'machine-learning', 'little-olympus'],
    }, { moduleId: MODULE_ID, tags: ['boot', 'status'] })

    await this.emit('agent.action', {
      action: 'module.registered',
      moduleId: MODULE_ID,
      version: '2.0.0',
      capabilities: EA_DESCRIPTOR_BASE.capabilities,
    })
  }

  // ── request router ────────────────────────────────────────────────────────

  async handleRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const path = request.path.replace(/\?.*$/, '')

    try {
      if (path === '/ai/complete'    && request.method === 'POST')  return await this.aiComplete(request, start)
      if (path === '/ai/task'        && request.method === 'POST')  return await this.aiTask(request, start)
      if (path === '/ai/models'      && request.method === 'GET')   return await this.aiModels(request, start)
      if (path === '/ai/stats'       && request.method === 'GET')   return await this.aiStats(request, start)
      if (path === '/agent/chat'     && request.method === 'POST')  return await this.agentChat(request, start)
      if (path === '/agent/memory'   && request.method === 'GET')   return await this.agentMemory(request, start)
      if (path === '/agent/remember' && request.method === 'POST')  return await this.agentRemember(request, start)
      if (path === '/health'         && request.method === 'GET')   return ok(await this.health(), elapsed(start))
      return err(404, `Unknown path: ${path}`, elapsed(start))
    } catch (e) {
      await this.emit('agent.error', {
        moduleId: MODULE_ID,
        path,
        error: e instanceof Error ? e.message : String(e),
      }, request.correlationId)
      return err(500, e instanceof Error ? e.message : 'Internal error', elapsed(start))
    }
  }

  // ── /ai/complete ──────────────────────────────────────────────────────────

  private async aiComplete(req: GatewayRequest, start: number): Promise<GatewayResponse> {
    const body = req.body as Partial<AIRequest>
    if (!body?.messages?.length) return err(400, 'messages[] required', elapsed(start))

    const aiReq: AIRequest = {
      messages: body.messages,
      model: body.model,
      strategy: body.strategy ?? 'quality',
      requiredCapabilities: body.requiredCapabilities,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      allowFallback: body.allowFallback ?? true,
      callerId: MODULE_ID,
      correlationId: req.correlationId,
    }

    const response = await this.services.aiRouter.complete(aiReq)
    return ok(response, elapsed(start))
  }

  // ── /ai/task ──────────────────────────────────────────────────────────────

  private async aiTask(req: GatewayRequest, start: number): Promise<GatewayResponse> {
    const body = req.body as Partial<AITask>
    if (!body?.type || !body?.prompt) return err(400, 'type and prompt required', elapsed(start))

    const task: AITask = {
      type: body.type,
      prompt: body.prompt,
      context: body.context,
      outputFormat: body.outputFormat ?? 'text',
      callerId: MODULE_ID,
      strategy: body.strategy,
    }

    const result = await this.services.aiRouter.task(task)
    return ok(result, elapsed(start))
  }

  // ── /ai/models ────────────────────────────────────────────────────────────

  private async aiModels(req: GatewayRequest, start: number): Promise<GatewayResponse> {
    const qs = req.body as Record<string, string> | null
    const models = await this.services.aiRouter.models({
      provider: qs?.provider as never,
      capability: qs?.capability as never,
    })
    return ok(models, elapsed(start))
  }

  // ── /ai/stats ─────────────────────────────────────────────────────────────

  private async aiStats(req: GatewayRequest, start: number): Promise<GatewayResponse> {
    const qs = req.body as Record<string, string> | null
    const window = qs?.window ? Number(qs.window) : undefined
    const stats = await this.services.aiRouter.stats(window)
    return ok(stats, elapsed(start))
  }

  // ── /agent/chat ───────────────────────────────────────────────────────────
  //
  // Context-aware chat: reads the last N MemoryBus entries and prepends them
  // as system context so the AI has awareness of recent pipeline activity.

  private async agentChat(req: GatewayRequest, start: number): Promise<GatewayResponse> {
    const body = req.body as { prompt?: string; strategy?: string; model?: string } | null
    if (!body?.prompt) return err(400, 'prompt required', elapsed(start))

    const { memoryBus, aiRouter } = this.services

    // Read recent context from memory
    const contextEntries = await memoryBus.search({
      moduleId: MODULE_ID,
      limit: MAX_CONTEXT_ENTRIES,
    })

    const contextText = contextEntries
      .map(e => `[${e.key}] ${typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}`)
      .join('\n')

    const systemPrompt = [
      'You are Empire Assistant V2, the AI brain of the Viral Engine YouTube documentary empire.',
      'Channels: Gods & Glory (history battles), Machine Learning (tech docs), Little Olympus (Little Zeus).',
      'You have access to the following recent pipeline memory:',
      contextText || '(no recent context)',
    ].join('\n')

    const response = await aiRouter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: body.prompt },
      ],
      strategy: (body.strategy as never) ?? 'quality',
      model: body.model,
      callerId: MODULE_ID,
      correlationId: req.correlationId,
      allowFallback: true,
    })

    // Persist this exchange to memory
    await memoryBus.write(`${MEMORY_SCOPE}.last-chat`, {
      prompt: body.prompt,
      response: response.content,
      model: response.model,
      at: new Date().toISOString(),
    }, { moduleId: MODULE_ID, tags: ['chat', 'history'] })

    return ok(response, elapsed(start))
  }

  // ── /agent/memory ─────────────────────────────────────────────────────────

  private async agentMemory(_req: GatewayRequest, start: number): Promise<GatewayResponse> {
    const entries = await this.services.memoryBus.search({
      moduleId: MODULE_ID,
      limit: 50,
    })
    return ok({ entries, count: entries.length }, elapsed(start))
  }

  // ── /agent/remember ───────────────────────────────────────────────────────

  private async agentRemember(req: GatewayRequest, start: number): Promise<GatewayResponse> {
    const body = req.body as { key?: string; value?: unknown; tags?: string[] } | null
    if (!body?.key || body.value === undefined) {
      return err(400, 'key and value required', elapsed(start))
    }
    await this.services.memoryBus.write(
      `${MEMORY_SCOPE}.${body.key}`,
      body.value,
      { moduleId: MODULE_ID, tags: body.tags }
    )
    return ok({ written: true, key: body.key }, elapsed(start))
  }

  // ── event handler ─────────────────────────────────────────────────────────

  override async handleEvent(event: DomainEvent): Promise<void> {
    const { memoryBus } = this.services

    try {
      const key = `${EVENTS_SCOPE}.${event.topic}.${event.id ?? Date.now()}`
      await memoryBus.write(key, {
        topic: event.topic,
        source: event.source,
        payload: event.payload,
        at: event.timestamp,
      }, {
        moduleId: MODULE_ID,
        tags: ['event', event.topic, event.source ?? 'unknown'],
      })

      // Escalate errors to system.alert if not already one
      if (event.topic === 'agent.error' && event.source !== MODULE_ID) {
        await this.emit('system.alert', {
          severity: 'warning',
          from: MODULE_ID,
          originalEvent: event.topic,
          source: event.source,
          detail: event.payload,
        }, event.correlationId)
      }
    } catch {
      // Never throw from handleEvent
    }
  }

  // ── health ────────────────────────────────────────────────────────────────

  override async health(): Promise<HealthReport> {
    const { aiRouter, memoryBus } = this.services

    try {
      const [models, memCheck] = await Promise.all([
        aiRouter.models().catch(() => [] as never[]),
        memoryBus.read(`${MEMORY_SCOPE}.boot`).catch(() => null),
      ])

      const availableModels = models.filter((m: { available: boolean }) => m.available).length

      if (availableModels === 0) {
        return {
          status: 'degraded',
          details: {
            reason: 'No AI models available — configure at least one provider in .env',
            models: 0,
            memoryBoot: !!memCheck,
          },
          checkedAt: new Date().toISOString(),
        }
      }

      return {
        status: 'healthy',
        details: {
          availableModels,
          memoryBoot: !!memCheck,
          version: '2.0.0',
        },
        checkedAt: new Date().toISOString(),
      }
    } catch (e) {
      return {
        status: 'unhealthy',
        details: { error: e instanceof Error ? e.message : String(e) },
        checkedAt: new Date().toISOString(),
      }
    }
  }

  // ── shutdown ──────────────────────────────────────────────────────────────

  override async shutdown(): Promise<void> {
    await this.services.memoryBus.write(`${MEMORY_SCOPE}.boot`, {
      status: 'offline',
      shutdownAt: new Date().toISOString(),
    }, { moduleId: MODULE_ID, tags: ['boot', 'status'] }).catch(() => {})
  }
}

export default EmpireAssistantModule
