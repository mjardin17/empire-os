/**
 * Memory Bus — In-Memory + Redis-ready Implementation
 * Hot layer: Map (dev) / Redis (prod).
 * Cold layer: PostgreSQL via AgentLog table (add MemoryEntry model for prod).
 */

import type {
  MemoryBus,
  MemoryEntry,
  MemoryScope,
  MemoryQuery,
  MemoryHandler,
  MemoryWriteOptions,
  Unsubscribe,
} from '../interfaces/index.js'

interface StoredEntry {
  entry: MemoryEntry
  expiresAt?: number  // ms since epoch
}

export class InMemoryMemoryBus implements MemoryBus {
  private store = new Map<string, StoredEntry>()
  private subscribers = new Map<string, Set<MemoryHandler>>()

  private storeKey(key: string, scope: MemoryScope): string {
    return `${scope}:${key}`
  }

  private isExpired(stored: StoredEntry): boolean {
    return stored.expiresAt !== undefined && Date.now() > stored.expiresAt
  }

  private matchPattern(pattern: string, key: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return regex.test(key)
  }

  private notifySubscribers(
    key: string,
    entry: MemoryEntry,
    change: 'write' | 'delete'
  ): void {
    for (const [pattern, handlers] of this.subscribers.entries()) {
      if (this.matchPattern(pattern, key)) {
        for (const handler of handlers) {
          Promise.resolve(handler(entry, change)).catch(console.error)
        }
      }
    }
  }

  async read(key: string, scope: MemoryScope = 'global'): Promise<MemoryEntry | null> {
    const stored = this.store.get(this.storeKey(key, scope))
    if (!stored) return null
    if (this.isExpired(stored)) {
      this.store.delete(this.storeKey(key, scope))
      return null
    }
    return stored.entry
  }

  async write(key: string, value: unknown, options: MemoryWriteOptions = {}): Promise<void> {
    const scope = options.scope ?? 'global'
    const storeKey = this.storeKey(key, scope)
    const now = new Date().toISOString()
    const existing = this.store.get(storeKey)

    const entry: MemoryEntry = {
      key,
      value,
      scope,
      moduleId: options.moduleId,
      createdAt: existing?.entry.createdAt ?? now,
      updatedAt: now,
      tags: options.tags,
      expiresAt: options.ttlSeconds
        ? new Date(Date.now() + options.ttlSeconds * 1000).toISOString()
        : undefined,
    }

    this.store.set(storeKey, {
      entry,
      expiresAt: options.ttlSeconds
        ? Date.now() + options.ttlSeconds * 1000
        : undefined,
    })

    this.notifySubscribers(key, entry, 'write')
  }

  async delete(key: string, scope: MemoryScope = 'global'): Promise<void> {
    const storeKey = this.storeKey(key, scope)
    const stored = this.store.get(storeKey)
    if (stored) {
      this.store.delete(storeKey)
      this.notifySubscribers(key, stored.entry, 'delete')
    }
  }

  async search(query: MemoryQuery): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = []

    for (const [, stored] of this.store.entries()) {
      if (this.isExpired(stored)) continue
      const { entry } = stored

      if (query.scope && entry.scope !== query.scope) continue
      if (query.moduleId && entry.moduleId !== query.moduleId) continue
      if (query.keyPattern && !this.matchPattern(query.keyPattern, entry.key)) continue
      if (query.tags?.length) {
        const hasAll = query.tags.every(t => entry.tags?.includes(t))
        if (!hasAll) continue
      }

      results.push(entry)
    }

    const offset = query.offset ?? 0
    const limit = query.limit ?? 100
    return results.slice(offset, offset + limit)
  }

  subscribe(pattern: string, handler: MemoryHandler): Unsubscribe {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set())
    }
    this.subscribers.get(pattern)!.add(handler)

    return () => {
      this.subscribers.get(pattern)?.delete(handler)
    }
  }

  async clear(scope: MemoryScope, moduleId?: string): Promise<number> {
    let count = 0
    for (const [key, stored] of this.store.entries()) {
      if (stored.entry.scope !== scope) continue
      if (moduleId && stored.entry.moduleId !== moduleId) continue
      this.store.delete(key)
      count++
    }
    return count
  }
}
