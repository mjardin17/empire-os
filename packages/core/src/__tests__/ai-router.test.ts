/**
 * Unit tests — DefaultAIRouter
 * Covers: registerAdapter, complete, fallback, task routing, models filter, stats, strategy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DefaultAIRouter, type AIProviderAdapter } from '../implementations/ai-router.impl.js'
import type { AIModel, AIProvider } from '../interfaces/index.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeModel(
  id: string,
  provider: AIProvider,
  capabilities: string[] = ['completion'],
  contextWindow = 8192,
  costPerMToken = 1.0
): AIModel {
  return {
    id,
    provider,
    name: id,
    capabilities: capabilities as AIModel['capabilities'],
    contextWindow,
    costPerMToken,
    available: true,
  }
}

function makeAdapter(
  provider: AIProvider,
  models: AIModel[],
  available = true,
  responseContent = 'test-response'
): AIProviderAdapter {
  return {
    provider,
    models,
    complete: vi.fn().mockResolvedValue({
      content: responseContent,
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 200,
    }),
    isAvailable: vi.fn().mockResolvedValue(available),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('DefaultAIRouter', () => {
  let router: DefaultAIRouter

  beforeEach(() => {
    router = new DefaultAIRouter()
  })

  // ── registerAdapter ───────────────────────────────────────────────────────

  describe('registerAdapter()', () => {
    it('registers an adapter so models() returns it', async () => {
      const model = makeModel('claude-3', 'anthropic')
      router.registerAdapter(makeAdapter('anthropic', [model]))

      const models = await router.models()
      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('claude-3')
    })
  })

  // ── complete ──────────────────────────────────────────────────────────────

  describe('complete()', () => {
    it('returns AIResponse with content, model, provider', async () => {
      const model = makeModel('claude-3', 'anthropic')
      router.registerAdapter(makeAdapter('anthropic', [model], true, 'Hello!'))

      const response = await router.complete({
        messages: [{ role: 'user', content: 'Say hello' }],
      })

      expect(response.content).toBe('Hello!')
      expect(response.provider).toBe('anthropic')
      expect(response.model).toBe('claude-3')
      expect(response.fallbackUsed).toBe(false)
    })

    it('selects by explicit model id', async () => {
      const m1 = makeModel('claude-3', 'anthropic')
      const m2 = makeModel('gpt-4', 'openai')
      router.registerAdapter(makeAdapter('anthropic', [m1]))
      router.registerAdapter(makeAdapter('openai', [m2]))

      const response = await router.complete({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4',
      })

      expect(response.model).toBe('gpt-4')
    })

    it('throws when no adapter is registered', async () => {
      await expect(
        router.complete({ messages: [{ role: 'user', content: 'x' }] })
      ).rejects.toThrow('[AIRouter] No available model matches request')
    })

    it('throws when adapter is unavailable and no fallback allowed', async () => {
      const model = makeModel('claude-3', 'anthropic')
      router.registerAdapter(makeAdapter('anthropic', [model], false))

      await expect(
        router.complete({
          messages: [{ role: 'user', content: 'x' }],
          allowFallback: false,
        })
      ).rejects.toThrow()
    })
  })

  // ── fallback ──────────────────────────────────────────────────────────────

  describe('fallback behavior', () => {
    it('uses fallback adapter when primary fails', async () => {
      const primaryModel = makeModel('claude-3', 'anthropic')
      const fallbackModel = makeModel('gpt-4', 'openai')

      const primaryAdapter = makeAdapter('anthropic', [primaryModel])
      ;(primaryAdapter.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'))

      const fallbackAdapter = makeAdapter('openai', [fallbackModel], true, 'fallback response')

      router.registerAdapter(primaryAdapter)
      router.registerAdapter(fallbackAdapter)

      const response = await router.complete({
        messages: [{ role: 'user', content: 'test' }],
        allowFallback: true,
      })

      expect(response.fallbackUsed).toBe(true)
      expect(response.content).toBe('fallback response')
    })

    it('throws when all adapters fail and allowFallback is true', async () => {
      const model = makeModel('claude-3', 'anthropic')
      const adapter = makeAdapter('anthropic', [model])
      ;(adapter.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'))

      router.registerAdapter(adapter)

      await expect(
        router.complete({
          messages: [{ role: 'user', content: 'test' }],
          allowFallback: true,
        })
      ).rejects.toThrow('[AIRouter] All models failed')
    })
  })

  // ── local-only strategy ───────────────────────────────────────────────────

  describe('local-only strategy', () => {
    it('returns null selection when no ollama adapter registered', async () => {
      const model = makeModel('claude-3', 'anthropic')
      router.registerAdapter(makeAdapter('anthropic', [model]))

      await expect(
        router.complete({
          messages: [{ role: 'user', content: 'x' }],
          strategy: 'local-only',
        })
      ).rejects.toThrow()
    })

    it('routes to ollama when strategy is local-only', async () => {
      const model = makeModel('llama3', 'ollama', ['completion'])
      const adapter = makeAdapter('ollama', [model], true, 'local response')
      router.registerAdapter(adapter)

      const response = await router.complete({
        messages: [{ role: 'user', content: 'local test' }],
        strategy: 'local-only',
      })

      expect(response.provider).toBe('ollama')
      expect(response.content).toBe('local response')
    })
  })

  // ── task() ────────────────────────────────────────────────────────────────

  describe('task()', () => {
    it('runs a code task and returns output', async () => {
      const model = makeModel('claude-3', 'anthropic', ['completion', 'code'])
      router.registerAdapter(makeAdapter('anthropic', [model], true, 'const x = 1'))

      const result = await router.task({ type: 'code', prompt: 'write a variable' })
      expect(result.output).toBe('const x = 1')
      expect(result.model).toBe('claude-3')
    })

    it('parses JSON output when outputFormat is json', async () => {
      const model = makeModel('claude-3', 'anthropic')
      router.registerAdapter(makeAdapter('anthropic', [model], true, '{"key":"value"}'))

      const result = await router.task({
        type: 'summary',
        prompt: 'summarize',
        outputFormat: 'json',
      })

      expect(result.parsedOutput).toEqual({ key: 'value' })
    })

    it('throws when no provider is available for the task type', async () => {
      await expect(
        router.task({ type: 'code', prompt: 'test' })
      ).rejects.toThrow('[AIRouter] No provider could handle task type: code')
    })
  })

  // ── models() ──────────────────────────────────────────────────────────────

  describe('models()', () => {
    beforeEach(() => {
      router.registerAdapter(makeAdapter('anthropic', [
        makeModel('claude-3', 'anthropic', ['completion', 'code'], 200000),
      ]))
      router.registerAdapter(makeAdapter('openai', [
        makeModel('gpt-4', 'openai', ['completion', 'copy'], 128000),
      ]))
    })

    it('returns all models with no filter', async () => {
      const models = await router.models()
      expect(models).toHaveLength(2)
    })

    it('filters by provider', async () => {
      const models = await router.models({ provider: 'anthropic' })
      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('claude-3')
    })

    it('filters by capability', async () => {
      const models = await router.models({ capability: 'code' })
      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('claude-3')
    })
  })

  // ── stats() ──────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('returns zero stats when no calls made', async () => {
      const s = await router.stats()
      expect(s.totalRequests).toBe(0)
      expect(s.errorRate).toBe(0)
    })

    it('increments totalRequests after each complete call', async () => {
      const model = makeModel('claude-3', 'anthropic')
      router.registerAdapter(makeAdapter('anthropic', [model]))

      await router.complete({ messages: [{ role: 'user', content: 'a' }] })
      await router.complete({ messages: [{ role: 'user', content: 'b' }] })

      const s = await router.stats()
      expect(s.totalRequests).toBe(2)
      expect(s.byProvider['anthropic']).toBe(2)
    })
  })

  // ── setDefaultStrategy() ──────────────────────────────────────────────────

  describe('setDefaultStrategy()', () => {
    it('prefers lower-cost model with cost strategy', async () => {
      const cheap = makeModel('gpt-3.5', 'openai', ['completion'], 4096, 0.5)
      const expensive = makeModel('claude-3', 'anthropic', ['completion'], 200000, 15.0)

      router.registerAdapter(makeAdapter('openai', [cheap]))
      router.registerAdapter(makeAdapter('anthropic', [expensive]))

      await router.setDefaultStrategy('cost')

      const response = await router.complete({
        messages: [{ role: 'user', content: 'test' }],
      })

      expect(response.model).toBe('gpt-3.5')
    })

    it('prefers largest context window with quality strategy', async () => {
      const small = makeModel('gpt-3.5', 'openai', ['completion'], 4096, 0.5)
      const large = makeModel('claude-3', 'anthropic', ['completion'], 200000, 15.0)

      router.registerAdapter(makeAdapter('openai', [small]))
      router.registerAdapter(makeAdapter('anthropic', [large]))

      await router.setDefaultStrategy('quality')

      const response = await router.complete({
        messages: [{ role: 'user', content: 'test' }],
      })

      expect(response.model).toBe('claude-3')
    })
  })
})
