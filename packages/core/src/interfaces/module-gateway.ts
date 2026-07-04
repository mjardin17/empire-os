/**
 * MODULE GATEWAY — Frozen Interface
 * Internal API gateway. Every module registers here.
 * External requests come in → gateway routes to the right module.
 *
 * STABILITY STATUS: FROZEN — do not change without Josh approval.
 */

export type ModuleStatus = 'healthy' | 'degraded' | 'offline' | 'starting'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ModuleEndpoint {
  path: string          // e.g. "/summarize", "/render"
  method: HttpMethod
  description: string
  inputSchema?: Record<string, unknown>   // JSON Schema
  outputSchema?: Record<string, unknown>  // JSON Schema
  auth?: boolean        // requires auth token (default: true)
  rateLimit?: number    // requests/minute, 0 = unlimited
}

export interface ModuleDescriptor {
  id: string            // unique: "empire-assistant", "render-engine"
  name: string          // display: "Empire Assistant"
  version: string       // semver: "1.0.0"
  description: string
  capabilities: string[]        // e.g. ["chat", "summarize", "task-planning"]
  endpoints: ModuleEndpoint[]
  healthPath: string            // e.g. "/health" — polled every 30s
  baseUrl: string               // internal: "http://localhost:3100"
  priority?: number             // tie-break when multiple modules share a capability
}

export interface GatewayRequest {
  moduleId?: string     // target specific module; if omitted, routed by capability
  capability?: string   // route to first module with this capability
  path: string
  method: HttpMethod
  headers?: Record<string, string>
  body?: unknown
  correlationId?: string
  timeoutMs?: number
}

export interface GatewayResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
  moduleId: string      // which module actually handled it
  durationMs: number
}

/**
 * ModuleGateway: the platform's internal service mesh.
 * Every capability is addressable through here.
 * Modules never call each other directly — always through the gateway.
 */
export interface ModuleGateway {
  register(descriptor: ModuleDescriptor): Promise<void>
  unregister(moduleId: string): Promise<void>
  route(request: GatewayRequest): Promise<GatewayResponse>
  list(): Promise<ModuleDescriptor[]>
  status(moduleId: string): Promise<ModuleStatus>
  hasCapability(capability: string): Promise<boolean>
  findByCapability(capability: string): Promise<ModuleDescriptor[]>
}
