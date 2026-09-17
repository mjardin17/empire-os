/**
 * Inception Labs Adapter
 * Integrates Mercury-2.5 commercial model for cost-optimized reasoning tasks
 * Endpoint: https://api.inceptionlabs.ai/v1/chat/completions
 * Use for: summary, copy, classification (cost-efficient alternatives)
 */

import type { AIProviderAdapter, AIModel } from '../interfaces/index.js'

const INCEPTION_ENDPOINT = 'https://api.inceptionlabs.ai/v1/chat/completions'

export class InceptionAdapter implements AIProviderAdapter {
  provider = 'inception' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  models: AIModel[] = [
    {
      id: 'mercury-2.5',
      provider: 'inception',
      capabilities: ['chat', 'code', 'research', 'function-calling'],
      contextWindow: 128000,
      costPerMToken: 0.01, // $0.01 per 1M tokens — cost-optimized
      available: !!this.apiKey,
    },
  ]

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const response = await fetch(INCEPTION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mercury-2.5',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 10,
        }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async complete(
    messages: Array<{ role: string; content: string }>,
    model: string,
    options: { maxTokens?: number; temperature?: number }
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }> {
    const startTime = Date.now()

    const response = await fetch(INCEPTION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${INCEPTION_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options.maxTokens ?? 2000,
        temperature: options.temperature ?? 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`Inception API error: ${response.statusText}`)
    }

    const data = (await response.json()) as any
    const durationMs = Date.now() - startTime

    return {
      content: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      durationMs,
    }
  }
}
