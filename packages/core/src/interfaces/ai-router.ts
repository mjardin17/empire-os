/**
 * AI ROUTER — Frozen Interface
 * Decides which AI model handles which task.
 * Modules never instantiate model clients directly.
 * Empire Assistant is just another caller of this interface.
 *
 * STABILITY STATUS: FROZEN — do not change without Josh approval.
 */

export type AIProvider = 'anthropic' | 'google' | 'openai' | 'ollama' | 'deepseek'
export type AIRoutingStrategy = 'speed' | 'quality' | 'cost' | 'local-only'

export interface AIModel {
  id: string            // "claude-sonnet-4-6", "gemini-pro", "gpt-4o"
  provider: AIProvider
  capabilities: AICapability[]
  contextWindow: number // tokens
  costPerMToken?: number // USD per million tokens, null = local/free
  available: boolean
}

export type AICapability =
  | 'chat'
  | 'code'
  | 'research'
  | 'vision'
  | 'long-context'
  | 'function-calling'
  | 'embeddings'
  | 'reasoning'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIRequest {
  messages: AIMessage[]
  model?: string          // explicit model ID; if omitted, router decides
  strategy?: AIRoutingStrategy
  requiredCapabilities?: AICapability[]
  maxTokens?: number
  temperature?: number
  allowFallback?: boolean // try next model on failure (default: true)
  callerId: string        // module ID making the request — for audit/routing
  correlationId?: string
}

export interface AIResponse {
  content: string
  model: string           // actual model used (may differ from requested)
  provider: AIProvider
  inputTokens: number
  outputTokens: number
  durationMs: number
  fallbackUsed: boolean
  correlationId?: string
}

export interface AITask {
  type: 'research' | 'script' | 'copy' | 'code' | 'summary' | 'classification'
  prompt: string
  context?: string
  outputFormat?: 'text' | 'json' | 'markdown'
  callerId: string
  strategy?: AIRoutingStrategy
}

export interface AITaskResult {
  output: string
  parsedOutput?: unknown    // set when outputFormat = 'json'
  model: string
  durationMs: number
}

export interface RoutingStats {
  totalRequests: number
  byProvider: Record<AIProvider, number>
  byModel: Record<string, number>
  fallbackRate: number      // 0-1
  avgDurationMs: number
  errorRate: number
}

/**
 * AIRouter: platform-level AI orchestration.
 * Handles model selection, failover, cost tracking, and audit.
 * Gemini → research/scripts. Claude → code/architecture. ChatGPT → copy.
 * Ollama → local fallback. DeepSeek → code review.
 */
export interface AIRouter {
  complete(request: AIRequest): Promise<AIResponse>
  task(task: AITask): Promise<AITaskResult>
  models(filter?: { provider?: AIProvider; capability?: AICapability }): Promise<AIModel[]>
  stats(windowMinutes?: number): Promise<RoutingStats>
  setDefaultStrategy(strategy: AIRoutingStrategy): Promise<void>
}
