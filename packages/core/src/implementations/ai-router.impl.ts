/**
 * AI Router — Implementation
 * Routes requests to the right AI based on strategy, availability, and capability.
 * Model priority: Claude=code/arch, Gemini=research/scripts, GPT=copy, Ollama=local fallback.
 * Actual API calls are delegated to provider adapters (not included here — add your keys).
 */

import type {
  AIRouter,
  AIRequest,
  AIResponse,
  AITask,
  AITaskResult,
  AIModel,
  AIProvider,
  AICapability,
  AIRoutingStrategy,
  RoutingStats,
} from '../interfaces/index.js'

/**
 * ConfigurableAIRouter: extends AIRouter with adapter registration.
 * Use this type in server.ts instead of casting to DefaultAIRouter.
 * Kept in implementations (not frozen interfaces) because it is a runtime concern.
 */
export interface ConfigurableAIRouter extends import('../interfaces/index.js').AIRouter {
  registerAdapter(adapter: AIProviderAdapter): void
  setDefaultStrategy(strategy: import('../interfaces/index.js').AIRoutingStrategy): Promise<void>
}

// Provider adapter interface — implement one per AI provider
export interface AIProviderAdapter {
  provider: AIProvider
  models: AIModel[]
  complete(
    messages: AIRequest['messages'],
    model: string,
    options: { maxTokens?: number; temperature?: number }
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }>
  isAvailable(): Promise<boolean>
}

// Routing table: task type → preferred provider order
// Ollama (local, free) leads on cheap/routine tasks.
// Claude leads on code/architecture. Gemini on research/long-context.
// OpenAI for tasks that specifically require GPT models.
const TASK_ROUTING: Record<AITask['type'], AIProvider[]> = {
  code:           ['anthropic', 'ollama', 'openai', 'deepseek'],
  research:       ['google',   'anthropic', 'ollama', 'openai'],
  script:         ['google',   'anthropic', 'ollama', 'openai'],
  copy:           ['ollama',   'openai',    'anthropic', 'google'],
  summary:        ['ollama',   'anthropic', 'google',    'openai'],
  classification: ['ollama',   'anthropic', 'google',    'openai'],
}

// Strategy → model selection heuristic
const STRATEGY_PREFERENCE: Record<AIRoutingStrategy, 'quality' | 'speed' | 'cost'> = {
  quality:     'quality',
  speed:       'speed',
  cost:        'cost',
  'local-only': 'cost',
}

export class DefaultAIRouter implements AIRouter {
  private adapters = new Map<AIProvider, AIProviderAdapter>()
  private defaultStrategy: AIRoutingStrategy = 'quality'
  private callLog: Array<{ model: string; provider: AIProvider; durationMs: number; failed: boolean }> = []

  registerAdapter(adapter: AIProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter)
  }

  private async selectModel(
    request: AIRequest
  ): Promise<{ model: AIModel; adapter: AIProviderAdapter } | null> {
    const strategy = request.strategy ?? this.defaultStrategy
    const required = request.requiredCapabilities ?? []

    // If local-only, try Ollama exclusively
    if (strategy === 'local-only') {
      const adapter = this.adapters.get('ollama')
      if (!adapter || !(await adapter.isAvailable())) return null
      const model = adapter.models.find(m =>
        required.every(cap => m.capabilities.includes(cap))
      )
      return model ? { model, adapter } : null
    }

    // If explicit model requested
    if (request.model) {
      for (const adapter of this.adapters.values()) {
        const model = adapter.models.find(m => m.id === request.model && m.available)
        if (model && (await adapter.isAvailable())) {
          return { model, adapter }
        }
      }
    }

    // Strategy-based selection
    const candidates: Array<{ model: AIModel; adapter: AIProviderAdapter }> = []
    for (const adapter of this.adapters.values()) {
      if (!(await adapter.isAvailable())) continue
      for (const model of adapter.models) {
        if (!model.available) continue
        if (!required.every(cap => model.capabilities.includes(cap))) continue
        candidates.push({ model, adapter })
      }
    }

    if (candidates.length === 0) return null

    // Sort by strategy
    candidates.sort((a, b) => {
      if (strategy === 'cost') {
        const aCost = a.model.costPerMToken ?? 0
        const bCost = b.model.costPerMToken ?? 0
        return aCost - bCost
      }
      if (strategy === 'quality') {
        // Prefer larger context window as quality proxy
        return b.model.contextWindow - a.model.contextWindow
      }
      // speed: prefer local/cheaper
      const aCost = a.model.costPerMToken ?? 0
      const bCost = b.model.costPerMToken ?? 0
      return aCost - bCost
    })

    return candidates[0] ?? null
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const selected = await this.selectModel(request)
    if (!selected) throw new Error('[AIRouter] No available model matches request')

    let { model, adapter } = selected
    let fallbackUsed = false

    try {
      const result = await adapter.complete(request.messages, model.id, {
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      })
      this.callLog.push({ model: model.id, provider: adapter.provider, durationMs: result.durationMs, failed: false })
      return {
        content: result.content,
        model: model.id,
        provider: adapter.provider,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        fallbackUsed,
        correlationId: request.correlationId,
      }
    } catch (err) {
      if (!request.allowFallback) throw err

      // Try next available model
      for (const [provider, fallbackAdapter] of this.adapters.entries()) {
        if (provider === adapter.provider) continue
        if (!(await fallbackAdapter.isAvailable())) continue
        const fallbackModel = fallbackAdapter.models.find(m => m.available)
        if (!fallbackModel) continue

        try {
          const result = await fallbackAdapter.complete(request.messages, fallbackModel.id, {
            maxTokens: request.maxTokens,
          })
          fallbackUsed = true
          this.callLog.push({ model: fallbackModel.id, provider, durationMs: result.durationMs, failed: false })
          return {
            content: result.content,
            model: fallbackModel.id,
            provider,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            durationMs: result.durationMs,
            fallbackUsed,
            correlationId: request.correlationId,
          }
        } catch {
          this.callLog.push({ model: fallbackModel.id, provider, durationMs: 0, failed: true })
        }
      }
      throw new Error('[AIRouter] All models failed')
    }
  }

  async task(task: AITask): Promise<AITaskResult> {
    const providerOrder = TASK_ROUTING[task.type] ?? ['anthropic']
    const systemPrompt = task.outputFormat === 'json'
      ? 'Respond with valid JSON only. No markdown, no explanation.'
      : undefined

    const messages: AIRequest['messages'] = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...(task.context ? [{ role: 'system' as const, content: task.context }] : []),
      { role: 'user' as const, content: task.prompt },
    ]

    // Try providers in task-specific order
    for (const provider of providerOrder) {
      const adapter = this.adapters.get(provider)
      if (!adapter || !(await adapter.isAvailable())) continue
      const model = adapter.models.find(m => m.available)
      if (!model) continue

      try {
        const result = await adapter.complete(messages, model.id, {})
        let parsedOutput: unknown
        if (task.outputFormat === 'json') {
          try { parsedOutput = JSON.parse(result.content) } catch {}
        }
        return { output: result.content, parsedOutput, model: model.id, durationMs: result.durationMs }
      } catch {
        continue
      }
    }
    throw new Error(`[AIRouter] No provider could handle task type: ${task.type}`)
  }

  async models(filter?: { provider?: AIProvider; capability?: AICapability }): Promise<AIModel[]> {
    const all: AIModel[] = []
    for (const [provider, adapter] of this.adapters.entries()) {
      if (filter?.provider && provider !== filter.provider) continue
      for (const model of adapter.models) {
        if (filter?.capability && !model.capabilities.includes(filter.capability)) continue
        all.push(model)
      }
    }
    return all
  }

  async stats(windowMinutes = 60): Promise<RoutingStats> {
    const cutoff = Date.now() - windowMinutes * 60 * 1000
    const recent = this.callLog.slice(-500) // approximate window

    const byProvider: Record<string, number> = {}
    const byModel: Record<string, number> = {}
    let totalDuration = 0
    let fallbacks = 0
    let errors = 0

    for (const call of recent) {
      byProvider[call.provider] = (byProvider[call.provider] ?? 0) + 1
      byModel[call.model] = (byModel[call.model] ?? 0) + 1
      totalDuration += call.durationMs
      if (call.failed) errors++
    }

    return {
      totalRequests: recent.length,
      byProvider: byProvider as Record<AIProvider, number>,
      byModel,
      fallbackRate: fallbacks / Math.max(recent.length, 1),
      avgDurationMs: recent.length ? totalDuration / recent.length : 0,
      errorRate: errors / Math.max(recent.length, 1),
    }
  }

  async setDefaultStrategy(strategy: AIRoutingStrategy): Promise<void> {
    this.defaultStrategy = strategy
  }
}
