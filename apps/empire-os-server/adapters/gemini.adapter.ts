/**
 * Google Gemini — AIProviderAdapter
 * Registers gemini-1.5-pro and gemini-1.5-flash in the DefaultAIRouter.
 * Preferred for research and script tasks. Reads GOOGLE_API_KEY from process.env.
 */

import type { AIProviderAdapter } from '@empire-os/core'
import type { AIModel, AIMessage } from '@empire-os/core'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const GEMINI_MODELS: AIModel[] = [
  {
    id: 'gemini-1.5-pro',
    provider: 'google',
    capabilities: ['chat', 'research', 'long-context', 'vision'],
    contextWindow: 1_000_000,
    costPerMToken: 3.5,
    available: true,
  },
  {
    id: 'gemini-1.5-flash',
    provider: 'google',
    capabilities: ['chat', 'research', 'long-context'],
    contextWindow: 1_000_000,
    costPerMToken: 0.075,
    available: true,
  },
]

export class GeminiAdapter implements AIProviderAdapter {
  readonly provider = 'google' as const
  readonly models: AIModel[]

  constructor(private readonly apiKey: string) {
    this.models = GEMINI_MODELS.map(m => ({ ...m }))
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

    // Gemini format: systemInstruction + contents (user/model turns)
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content)
    const conversation = messages.filter(m => m.role !== 'system')

    const contents = conversation.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 4096,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      },
    }
    if (systemParts.length > 0) {
      body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] }
    }

    const url = `${GEMINI_BASE}/${model}:generateContent?key=${this.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`[GeminiAdapter] API error ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
    }

    const content = data.candidates[0]?.content?.parts[0]?.text ?? ''
    return {
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      durationMs: Date.now() - start,
    }
  }
}
