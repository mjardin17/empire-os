/**
 * OpenAI — AIProviderAdapter
 * Registers GPT-4o and GPT-4o-mini.
 * Reads OPENAI_API_KEY from process.env — never hardcoded.
 */

import type { AIProviderAdapter } from '@empire-os/core'
import type { AIModel, AIMessage } from '@empire-os/core'

const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

const OPENAI_MODELS: AIModel[] = [
  {
    id:            'gpt-4o',
    provider:      'openai',
    capabilities:  ['chat', 'code', 'vision', 'function-calling', 'long-context', 'reasoning'],
    contextWindow: 128_000,
    costPerMToken: 5,
    available:     true,
  },
  {
    id:            'gpt-4o-mini',
    provider:      'openai',
    capabilities:  ['chat', 'code', 'vision', 'function-calling'],
    contextWindow: 128_000,
    costPerMToken: 0.15,
    available:     true,
  },
]

export class OpenAIAdapter implements AIProviderAdapter {
  readonly provider = 'openai' as const
  readonly models: AIModel[]

  constructor(private readonly apiKey: string) {
    this.models = OPENAI_MODELS.map(m => ({ ...m }))
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey)
  }

  async complete(
    messages: AIMessage[],
    model: string,
    options: { maxTokens?: number; temperature?: number },
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }> {
    const start = Date.now()

    const body = {
      model,
      messages:    messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens:  options.maxTokens  ?? 4_096,
      temperature: options.temperature ?? 0.7,
    }

    const res = await fetch(OPENAI_API, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`[OpenAIAdapter] API error ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>
      usage:   { prompt_tokens: number; completion_tokens: number }
    }

    return {
      content:      data.choices[0]?.message?.content ?? '',
      inputTokens:  data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      durationMs:   Date.now() - start,
    }
  }
}
