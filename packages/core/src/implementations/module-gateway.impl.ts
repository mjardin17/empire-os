/**
 * Module Gateway — Implementation
 * Routes internal requests to registered modules via HTTP.
 * Modules never call each other directly — always through here.
 */

import type {
  ModuleGateway,
  ModuleDescriptor,
  GatewayRequest,
  GatewayResponse,
  ModuleStatus,
} from '../interfaces/index.js'

/** A request path must be a plain absolute path on the module's own host: no scheme, no protocol-relative '//',
 *  and no '..' segments that could climb out of the module's routes. */
export function isSafeRequestPath(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false
  if (path.includes('://') || path.includes(String.fromCharCode(92))) return false
  return !path.split('/').includes('..')
}

export interface HttpModuleGatewayOptions {
  /**
   * Headers added to calls whose target URL starts with selfBaseUrl, i.e. modules served by this
   * Empire OS server itself. Used to send X-Empire-Api-Key when EMPIRE_API_KEY is set, so internal
   * calls are not refused. Never sent to any other host.
   */
  selfBaseUrl?: string
  selfHeaders?: Record<string, string>
}

export class HttpModuleGateway implements ModuleGateway {
  constructor(private readonly options: HttpModuleGatewayOptions = {}) {}

  /** selfHeaders, only for URLs on this server. */
  private selfHeadersFor(url: string): Record<string, string> {
    const base = this.options.selfBaseUrl?.replace(/\/+$/, '')
    if (!base || !this.options.selfHeaders) return {}
    return url === base || url.startsWith(base + '/') ? this.options.selfHeaders : {}
  }

  private registry = new Map<string, ModuleDescriptor>()
  private healthCache = new Map<string, { status: ModuleStatus; checkedAt: number }>()
  private readonly HEALTH_TTL_MS = 30_000

  async register(descriptor: ModuleDescriptor): Promise<void> {
    this.registry.set(descriptor.id, descriptor)
  }

  async unregister(moduleId: string): Promise<void> {
    this.registry.delete(moduleId)
    this.healthCache.delete(moduleId)
  }

  async list(): Promise<ModuleDescriptor[]> {
    return Array.from(this.registry.values())
  }

  async status(moduleId: string): Promise<ModuleStatus> {
    const cached = this.healthCache.get(moduleId)
    if (cached && Date.now() - cached.checkedAt < this.HEALTH_TTL_MS) {
      return cached.status
    }
    return this.pollHealth(moduleId)
  }

  private async pollHealth(moduleId: string): Promise<ModuleStatus> {
    const descriptor = this.registry.get(moduleId)
    if (!descriptor) return 'offline'

    try {
      const url = `${descriptor.baseUrl}${descriptor.healthPath}`
      const res = await fetch(url, { headers: this.selfHeadersFor(url), signal: AbortSignal.timeout(5000) })
      const status: ModuleStatus = res.ok ? 'healthy' : 'degraded'
      this.healthCache.set(moduleId, { status, checkedAt: Date.now() })
      return status
    } catch {
      this.healthCache.set(moduleId, { status: 'offline', checkedAt: Date.now() })
      return 'offline'
    }
  }

  async hasCapability(capability: string): Promise<boolean> {
    return Array.from(this.registry.values()).some(m =>
      m.capabilities.includes(capability)
    )
  }

  async findByCapability(capability: string): Promise<ModuleDescriptor[]> {
    return Array.from(this.registry.values()).filter(m =>
      m.capabilities.includes(capability)
    )
  }

  async route(request: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()

    // Resolve target module
    let target: ModuleDescriptor | undefined

    if (request.moduleId) {
      target = this.registry.get(request.moduleId)
      if (!target) throw new Error(`Module not found: ${request.moduleId}`)
    } else if (request.capability) {
      const candidates = await this.findByCapability(request.capability)
      // Pick by priority (higher = preferred), then first registered
      target = candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
      if (!target) throw new Error(`No module with capability: ${request.capability}`)
    } else {
      throw new Error('GatewayRequest requires moduleId or capability')
    }

    if (!isSafeRequestPath(request.path)) throw new Error(`invalid request path: ${request.path}`)
    const url = `${target.baseUrl}${request.path}`
    const timeout = request.timeoutMs ?? 30_000

    // Caller headers go first so they cannot overwrite the correlation id or the source module.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...request.headers,
      ...this.selfHeadersFor(url),
      'X-Correlation-Id': request.correlationId ?? crypto.randomUUID(),
      'X-Source-Module': 'empire-os-gateway',
    }

    const res = await fetch(url, {
      method: request.method,
      headers,
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(timeout),
    })

    let body: unknown
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      body = await res.json()
    } else {
      body = await res.text()
    }

    return {
      status: res.status,
      body,
      headers: Object.fromEntries(res.headers.entries()),
      moduleId: target.id,
      durationMs: Date.now() - start,
    }
  }
}
