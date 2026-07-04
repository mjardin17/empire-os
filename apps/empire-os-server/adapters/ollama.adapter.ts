/**
 * Ollama — AIProviderAdapter
 *
 * Auto-discovers every locally-installed model by calling GET /api/tags at startup.
 * No API key required — Ollama runs entirely on-machine.
 *
 * Use OllamaAdapter.create() (async factory) so model discovery happens before
 * the adapter is registered with the AIRouter.
 *
 * Ollama API used:
 *   GET  /api/tags          — list installed models
 *   POST /api/chat          — chat completions (stream: false)
 */

import type { AIProviderAdapter } from '@empire-os/core'
import type { AIModel, AIMessage } from '@empire-os/core'

// Shape returned by GET /api/tags
interface OllamaTagEntry {
  name: string
  model: string
  size: number
  details?: {
    parameter_size?: string   // e.g. "8.0B", "70B"
    family?: string           // e.g. "llama", "mistral"
    families?: string[]
  }
}

interface OllamaTagsResponse {
  models: OllamaTagEntry[]
}

// Shape returned by POST /api/chat (stream: false)
interface OllamaChatResponse {
  model: string
  message: { role: string; content: string }
  done: boolean
  prompt_eval_count?: number
  eval_count?: number
  total_duration?: number   // nanoseconds
}

// ── Capability inference ──────────────────────────────────────────────────────

function inferCapabilities(entry: OllamaTagEntry): AIModel['capabilities'] {
  const name = (entry.name + ' ' + (entry.details?.family ?? '')).toLowerCase()
  const caps = new Set<string>(['chat'])

  if (/code|starcoder|deepcoder|codegemma|codellama|qwen.*coder|granite.*code/.test(name)) {
    caps.add('code')
  }
  if (/llava|vision|minicpm.v|bakllava|moondream|cogvlm/.test(name)) {
    caps.add('vision')
  }
  if (/embed/.test(name)) {
    caps.add('embeddings')
  }

  // Large models (≥30B) get research + reasoning
  const billions = parseParamBillions(entry.details?.parameter_size)
  if (billions >= 30) {
    caps.add('reasoning')
    caps.add('research')
    caps.add('long-context')
  } else if (billions >= 13) {
    caps.add('research')
  }

  return [...caps] as AIModel['capabilities']
}

function parseParamBillions(paramSize: string | undefined): number {
  if (!paramSize) return 0
  const match = paramSize.match(/(\d+(?:\.\d+)?)\s*[Bb]/)
  return match ? parseFloat(match[1]) : 0
}

function inferContextWindow(entry: OllamaTagEntry): number {
  const billions = parseParamBillions(entry.details?.parameter_size)
  if (billions >= 70) return 32_768
  if (billions >= 30) return 16_384
  if (billions >= 13) return 8_192
  return 4_096
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class OllamaAdapter implements AIProviderAdapter {
  readonly provider = 'ollama' as const
  readonly models: AIModel[]

  private constructor(
    private readonly baseUrl: string,
    models: AIModel[],
  ) {
    this.models = models
  }

  /**
   * Async factory — discovers installed models before returning.
   * Throws if Ollama is unreachable.
   */
  static async create(baseUrl = 'http://localhost:11434'): Promise<OllamaAdapter> {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      throw new Error(`[OllamaAdapter] /api/tags returned ${res.status}`)
    }

    const data = await res.json() as OllamaTagsResponse
    const entries = data.models ?? []

    const models: AIModel[] = entries.map(entry => ({
      id:            entry.name,
      provider:      'ollama' as const,
      capabilities:  inferCapabilities(entry),
      contextWindow: inferContextWindow(entry),
      costPerMToken: 0,   // free — local inference
      available:     true,
    }))

    return new OllamaAdapter(baseUrl, models)
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async complete(
    messages: AIMessage[],
    model: string,
    options: { maxTokens?: number; temperature?: number },
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }> {
    const start = Date.now()

    const body = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        num_predict:  options.maxTokens  ?? 4_096,
        temperature:  options.temperature ?? 0.7,
      },
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(120_000),   // local models can be slow
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`[OllamaAdapter] /api/chat error ${res.status}: ${text}`)
    }

    const data = await res.json() as OllamaChatResponse

    return {
      content:      data.message?.content ?? '',
      inputTokens:  data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count        ?? 0,
      // prefer Ollama's own timing (nanoseconds → ms), fall back to wall-clock
      durationMs:   data.total_duration
        ? Math.round(data.total_duration / 1_000_000)
        : Date.now() - start,
    }
  }
}
