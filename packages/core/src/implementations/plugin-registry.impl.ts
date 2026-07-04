/**
 * Plugin Registry — In-Memory Implementation
 * Production: swap backing store to PostgreSQL via Prisma.
 * This impl is the source of truth for all registered plugins/modules.
 */

import type {
  PluginRegistry,
  PluginDescriptor,
  PluginFilter,
  PluginStatus,
  RegistryStats,
  PluginType,
} from '../interfaces/index.js'

export class InMemoryPluginRegistry implements PluginRegistry {
  private store = new Map<string, PluginDescriptor>()

  async register(
    descriptor: Omit<PluginDescriptor, 'registeredAt' | 'updatedAt'>
  ): Promise<PluginDescriptor> {
    const now = new Date().toISOString()
    const existing = this.store.get(descriptor.id)
    const full: PluginDescriptor = {
      ...descriptor,
      registeredAt: existing?.registeredAt ?? now,
      updatedAt: now,
    }
    this.store.set(descriptor.id, full)
    return full
  }

  async unregister(pluginId: string): Promise<void> {
    this.store.delete(pluginId)
  }

  async update(
    pluginId: string,
    updates: Partial<PluginDescriptor>
  ): Promise<PluginDescriptor> {
    const existing = this.store.get(pluginId)
    if (!existing) throw new Error(`Plugin not found: ${pluginId}`)
    const updated: PluginDescriptor = {
      ...existing,
      ...updates,
      id: existing.id,
      registeredAt: existing.registeredAt,
      updatedAt: new Date().toISOString(),
    }
    this.store.set(pluginId, updated)
    return updated
  }

  async get(pluginId: string): Promise<PluginDescriptor | null> {
    return this.store.get(pluginId) ?? null
  }

  async list(filter?: PluginFilter): Promise<PluginDescriptor[]> {
    let results = Array.from(this.store.values())
    if (!filter) return results

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type]
      results = results.filter(p => types.includes(p.type))
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
      results = results.filter(p => statuses.includes(p.status))
    }
    if (filter.capability) {
      results = results.filter(p =>
        p.capabilities.some(c => c.name === filter.capability)
      )
    }
    if (filter.tags?.length) {
      results = results.filter(p =>
        filter.tags!.every(t => p.tags?.includes(t))
      )
    }
    return results
  }

  async hasCapability(capability: string): Promise<boolean> {
    return Array.from(this.store.values()).some(
      p => p.status === 'active' && p.capabilities.some(c => c.name === capability)
    )
  }

  async findByCapability(capability: string): Promise<PluginDescriptor[]> {
    return Array.from(this.store.values()).filter(
      p => p.status === 'active' && p.capabilities.some(c => c.name === capability)
    )
  }

  async setStatus(
    pluginId: string,
    status: PluginStatus,
    errorMessage?: string
  ): Promise<void> {
    const existing = this.store.get(pluginId)
    if (!existing) throw new Error(`Plugin not found: ${pluginId}`)
    this.store.set(pluginId, {
      ...existing,
      status,
      errorMessage: status === 'error' ? errorMessage : undefined,
      updatedAt: new Date().toISOString(),
    })
  }

  async stats(): Promise<RegistryStats> {
    const plugins = Array.from(this.store.values())
    const byType = {} as Record<PluginType, number>
    const byStatus = {} as Record<PluginStatus, number>
    const capSet = new Set<string>()

    for (const p of plugins) {
      byType[p.type] = (byType[p.type] ?? 0) + 1
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
      p.capabilities.forEach(c => capSet.add(c.name))
    }

    return {
      total: plugins.length,
      byType,
      byStatus,
      capabilities: Array.from(capSet),
    }
  }

  async validateDependencies(
    pluginId: string
  ): Promise<{ valid: boolean; missing: string[] }> {
    const plugin = this.store.get(pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)

    const missing: string[] = []
    for (const dep of plugin.dependencies ?? []) {
      const found = this.store.get(dep.pluginId)
      if (!found && !dep.optional) missing.push(dep.pluginId)
    }
    return { valid: missing.length === 0, missing }
  }
}
