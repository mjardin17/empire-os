/**
 * PLUGIN REGISTRY — Frozen Interface
 * Central catalog of every module, tool, connector, and AI provider in the system.
 * Nothing runs unless it's registered here.
 *
 * STABILITY STATUS: FROZEN — do not change without Josh approval.
 */

export type PluginType = 'module' | 'tool' | 'connector' | 'ai-provider' | 'workflow'
export type PluginStatus = 'active' | 'inactive' | 'error' | 'starting' | 'deprecated'

export interface PluginCapability {
  name: string          // e.g. "chat", "render-video", "fetch-research"
  version: string       // semver of capability spec
  description?: string
}

export interface PluginDependency {
  pluginId: string
  minVersion: string    // semver range: ">=1.0.0"
  optional?: boolean
}

export interface PluginDescriptor {
  id: string            // unique slug: "empire-assistant", "render-engine"
  name: string          // display name
  version: string       // semver
  type: PluginType
  description: string
  author?: string
  capabilities: PluginCapability[]
  dependencies?: PluginDependency[]
  config?: Record<string, unknown>    // runtime config (no secrets)
  status: PluginStatus
  errorMessage?: string               // set when status = 'error'
  registeredAt: string                // ISO 8601
  updatedAt: string
  baseUrl?: string                    // for modules with HTTP endpoints
  tags?: string[]
}

export interface PluginFilter {
  type?: PluginType | PluginType[]
  status?: PluginStatus | PluginStatus[]
  capability?: string   // filter by capability name
  tags?: string[]
}

export interface RegistryStats {
  total: number
  byType: Record<PluginType, number>
  byStatus: Record<PluginStatus, number>
  capabilities: string[]  // all registered capability names
}

/**
 * PluginRegistry: the source of truth for what exists in Empire OS.
 * Before a module can receive requests or publish events, it must be registered.
 * The registry is read by the ModuleGateway to route requests.
 */
export interface PluginRegistry {
  register(descriptor: Omit<PluginDescriptor, 'registeredAt' | 'updatedAt'>): Promise<PluginDescriptor>
  unregister(pluginId: string): Promise<void>
  update(pluginId: string, updates: Partial<PluginDescriptor>): Promise<PluginDescriptor>
  get(pluginId: string): Promise<PluginDescriptor | null>
  list(filter?: PluginFilter): Promise<PluginDescriptor[]>
  hasCapability(capability: string): Promise<boolean>
  findByCapability(capability: string): Promise<PluginDescriptor[]>
  setStatus(pluginId: string, status: PluginStatus, errorMessage?: string): Promise<void>
  stats(): Promise<RegistryStats>
  // Validate that all declared dependencies are satisfied
  validateDependencies(pluginId: string): Promise<{ valid: boolean; missing: string[] }>
}
