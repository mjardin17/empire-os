/**
 * RemoteAppModule: an Empire OS module for an app that runs as its own process
 * (Bookmaker, Boss Listers, ...). It registers the app with the Module Gateway,
 * proxies /:moduleId/* requests to the app, forwards selected Empire OS events to
 * the app's POST /empire/event, and reports the app's GET /empire/health.
 *
 * The app's base URL comes from an env var with a default (e.g. BOSSLISTERS_BASE_URL,
 * default http://localhost:3001). When the app is not running, health() reports
 * "unhealthy" with a reason and proxied calls answer 502, so panels can show an
 * offline state instead of failing silently.
 */

import { BaseModule } from '../interfaces/empire-module.js'
import type { DomainEvent, HealthReport, HealthStatus } from '../interfaces/index.js'
import type { GatewayRequest, GatewayResponse, ModuleDescriptor, ModuleEndpoint } from '../interfaces/module-gateway.js'

export interface RemoteAppOptions {
  /** Module id; requests to /:moduleId/* are proxied to the app. */
  moduleId: string
  /** Display name, used in messages ("Boss Listers is not reachable"). */
  name: string
  version: string
  description: string
  /** Env var holding the app's base URL, and the default when it is unset. */
  baseUrlEnv: string
  defaultBaseUrl: string
  capabilities: string[]
  endpoints: ModuleEndpoint[]
  healthPath?: string            // default /empire/health
  eventPath?: string             // default /empire/event
  /** Empire OS event topics forwarded to the app (fire-and-forget). */
  forwardTopics?: string[]
  /**
   * Only proxy paths declared in `endpoints` ({id} segments match anything but "/").
   * Default true. Anything else answers 404 without calling the app.
   */
  restrictToEndpoints?: boolean
  /** Headers added to every call to the app, e.g. a shared key. Read at call time. */
  authHeaders?: () => Record<string, string>
  priority?: number
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch
  /** Injected for tests; defaults to process.env. */
  env?: Record<string, string | undefined>
}

// Only these caller headers are passed on. Hop-by-hop headers (host, content-length) must
// not be forwarded because the body is re-serialised, and caller auth headers must never
// reach the app: the module adds its own.
const FORWARDED_HEADERS = ['x-correlation-id', 'accept']
const VALID_STATUS: HealthStatus[] = ['healthy', 'degraded', 'unhealthy']

export function resolveBaseUrl(env: Record<string, string | undefined>, name: string, fallback: string): string {
  const raw = (env[name] || '').trim() || fallback
  return raw.replace(/\/+$/, '')
}

function pathPattern(path: string): RegExp {
  const escaped = path.split(/\{[^}]+\}/).map((s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('[^/]+')
  return new RegExp(`^${escaped}/?$`)
}

export class RemoteAppModule extends BaseModule {
  readonly moduleId: string
  protected readonly options: RemoteAppOptions
  private readonly patterns: Array<{ method: string; re: RegExp }>

  constructor(options: RemoteAppOptions) {
    super()
    this.options = options
    this.moduleId = options.moduleId
    this.patterns = options.endpoints.map((e) => ({ method: e.method, re: pathPattern(e.path) }))
  }

  /** The app's base URL, read from the env var each time (so tests and restarts pick up changes). */
  get baseUrl(): string {
    return resolveBaseUrl(this.options.env ?? process.env, this.options.baseUrlEnv, this.options.defaultBaseUrl)
  }

  get descriptor(): ModuleDescriptor {
    const o = this.options
    return {
      id: o.moduleId,
      name: o.name,
      version: o.version,
      description: o.description,
      capabilities: o.capabilities,
      endpoints: o.endpoints,
      healthPath: o.healthPath ?? '/empire/health',
      baseUrl: this.baseUrl,
      priority: o.priority,
    }
  }

  private get fetchImpl(): typeof fetch {
    return this.options.fetch ?? fetch
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { 'Content-Type': 'application/json', ...(extra ?? {}), ...(this.options.authHeaders?.() ?? {}) }
  }

  /** Is this method + path one of the declared endpoints? */
  allows(method: string, path: string): boolean {
    if (this.options.restrictToEndpoints === false) return true
    const clean = path.split('?')[0]
    return this.patterns.some((p) => p.method === method && p.re.test(clean))
  }

  protected override async onInit(): Promise<void> {
    await this.services.moduleGateway.register(this.descriptor)
    for (const topic of this.options.forwardTopics ?? []) {
      await this.services.eventBus.subscribe(topic, (e) => this.handleEvent(e))
    }
    await this.emit('agent.action', {
      action: 'module.registered',
      moduleId: this.moduleId,
      version: this.options.version,
      url: this.baseUrl,
    })
  }

  async handleRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const done = (status: number, body: unknown): GatewayResponse => ({ status, body, moduleId: this.moduleId, durationMs: Date.now() - start })

    if (!this.allows(request.method, request.path)) {
      return done(404, {
        error: `${this.options.name} has no Empire OS route ${request.method} ${request.path}`,
        routes: this.options.endpoints.map((e) => `${e.method} ${e.path}`),
      })
    }

    const forwarded: Record<string, string> = {}
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      if (typeof value === 'string' && FORWARDED_HEADERS.includes(key.toLowerCase())) forwarded[key.toLowerCase()] = value
    }

    try {
      const isBodyless = request.method === 'GET' || request.method === 'DELETE'
      const res = await this.fetchImpl(`${this.baseUrl}${request.path}`, {
        method: request.method,
        headers: this.headers(forwarded),
        body: isBodyless ? undefined : JSON.stringify(request.body ?? {}),
        signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
      })
      const body = await res.json().catch(() => null)
      return done(res.status, body)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      await this.emit('agent.error', { moduleId: this.moduleId, path: request.path, error: detail }).catch(() => undefined)
      return done(502, { error: `${this.options.name} service unavailable`, detail, url: this.baseUrl })
    }
  }

  override async handleEvent(event: DomainEvent): Promise<void> {
    // Fire-and-forget: the app may not be running, which is not an error for Empire OS.
    this.fetchImpl(`${this.baseUrl}${this.options.eventPath ?? '/empire/event'}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ topic: event.topic, source: event.source, payload: event.payload, correlationId: event.correlationId }),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => undefined)
  }

  override async health(): Promise<HealthReport> {
    const url = this.baseUrl
    const checkedAt = new Date().toISOString()
    try {
      const res = await this.fetchImpl(`${url}${this.options.healthPath ?? '/empire/health'}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      })
      const body = (await res.json().catch(() => null)) as { status?: unknown; details?: unknown } | null
      if (!res.ok) {
        return {
          status: 'degraded',
          details: { url, httpStatus: res.status, reason: `${this.options.name} answered HTTP ${res.status}${res.status === 404 ? ' (no Empire OS routes in this version?)' : ''}`, app: body },
          checkedAt,
        }
      }
      // The app may report itself degraded (e.g. not fully set up); pass that on.
      const remote = VALID_STATUS.includes(body?.status as HealthStatus) ? (body!.status as HealthStatus) : 'healthy'
      return { status: remote, details: { url, app: body }, checkedAt }
    } catch (err) {
      return {
        status: 'unhealthy',
        details: { url, reason: `${this.options.name} is not reachable at ${url}`, error: err instanceof Error ? err.message : String(err) },
        checkedAt,
      }
    }
  }
}
