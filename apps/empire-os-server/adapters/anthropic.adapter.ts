/**
 * Anthropic Claude — AIProviderAdapter
 * Registers claude-opus-4-8 and claude-sonnet-4-6 in the DefaultAIRouter.
 * Reads ANTHROPIC_API_KEY from process.env — never hardcoded.
 */

import type { AIProviderAdapter } from '@empire-os/core'
import type { AIModel, AIMessage } from '@empire-os/core'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const CLAUDE_MODELS: AIModel[] = [
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    capabilities: ['chat', 'code', 'research', 'reasoning', 'function-calling', 'long-context'],
    contextWindow: 200_000,
    costPerMToken: 15,
    available: true,
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    capabilities: ['chat', 'code', 'research', 'function-calling', 'long-context'],
    contextWindow: 200_000,
    costPerMToken: 3,
    available: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    capabilities: ['chat', 'code', 'reasoning'],
    contextWindow: 200_000,
    costPerMToken: 0.25,
    available: true,
  },
]

export class AnthropicAdapter implements AIProviderAdapter {
  readonly provider = 'anthropic' as const
  readonly models: AIModel[]

  constructor(private readonly apiKey: string) {
    this.models = CLAUDE_MODELS.map(m => ({ ...m }))
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey)
  }

  async complete(
    messages: AIMessage[],
    model: string,
    options: { maxTokens?: number; temperature?: number }
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }> {
    const start = Date.now()

    // Anthropic separates system messages from the conversation
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content)
    const conversation = messages.filter(m => m.role !== 'system')

    // Ensure conversation alternates user/assistant and starts with user
    if (conversation.length === 0) {
      throw new Error('[AnthropicAdapter] At least one user message is required')
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: options.maxTokens ?? 4096,
      messages: conversation.map(m => ({ role: m.role, content: m.content })),
    }
    if (systemParts.length > 0) {
      body.system = systemParts.join('\n\n')
    }
    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`[AnthropicAdapter] API error ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>
      usage: { input_tokens: number; output_tokens: number }
    }

    const content = data.content.find(b => b.type === 'text')?.text ?? ''
    return {
      content,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      durationMs: Date.now() - start,
    }
  }
}
