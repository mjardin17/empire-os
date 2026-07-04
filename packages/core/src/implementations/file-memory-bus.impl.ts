/**
 * File-backed Memory Bus
 * Persists all memory entries to disk as JSON. Survives server restarts.
 * Drop-in replacement for InMemoryMemoryBus — identical interface.
 *
 * Data file: <dataDir>/memory-bus.json
 * Writes are atomic (temp file + rename) to prevent corruption.
 */

import fs from 'node:fs'
import path from 'node:path'
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

type FileStore = Record<string, StoredEntry>

export class FileMemoryBus implements MemoryBus {
  private store = new Map<string, StoredEntry>()
  private subscribers = new Map<string, Set<MemoryHandler>>()
  private readonly filePath: string

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'memory-bus.json')
    this.load()
  }

  // ── persistence ────────────────────────────────────────────────────────────

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const data = JSON.parse(raw) as FileStore
      for (const [k, v] of Object.entries(data)) {
        // Skip already-expired entries on load
        if (v.expiresAt !== undefined && Date.now() > v.expiresAt) continue
        this.store.set(k, v)
      }
    } catch {
      // Corrupt file — start fresh; old data is logged as warning
      process.stderr.write('[FileMemoryBus] Warning: could not load memory-bus.json — starting fresh\n')
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const data: FileStore = Object.fromEntries(this.store)
      const tmp = this.filePath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
      fs.renameSync(tmp, this.filePath)  // atomic on same filesystem
    } catch (e) {
      process.stderr.write(`[FileMemoryBus] Warning: persist failed: ${e}\n`)
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private storeKey(key: string, scope: MemoryScope): string {
    return `${scope}:${key}`
  }

  private isExpired(stored: StoredEntry): boolean {
    return stored.expiresAt !== undefined && Date.now() > stored.expiresAt
  }

  private matchPattern(pattern: string, key: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    return regex.test(key)
  }

  private notifySubscribers(key: string, entry: MemoryEntry, change: 'write' | 'delete'): void {
    for (const [pattern, handlers] of this.subscribers.entries()) {
      if (this.matchPattern(pattern, key)) {
        for (const handler of handlers) {
          Promise.resolve(handler(entry, change)).catch(() => {})
        }
      }
    }
  }

  // ── interface ──────────────────────────────────────────────────────────────

  async read(key: string, scope: MemoryScope = 'global'): Promise<MemoryEntry | null> {
    const stored = this.store.get(this.storeKey(key, scope))
    if (!stored) return null
    if (this.isExpired(stored)) {
      this.store.delete(this.storeKey(key, scope))
      this.persist()
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
      expiresAt: options.ttlSeconds ? Date.now() + options.ttlSeconds * 1000 : undefined,
    })

    this.persist()
    this.notifySubscribers(key, entry, 'write')
  }

  async delete(key: string, scope: MemoryScope = 'global'): Promise<void> {
    const storeKey = this.storeKey(key, scope)
    const stored = this.store.get(storeKey)
    if (stored) {
      this.store.delete(storeKey)
      this.persist()
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
    return () => { this.subscribers.get(pattern)?.delete(handler) }
  }

  async clear(scope: MemoryScope, moduleId?: string): Promise<number> {
    let count = 0
    for (const [key, stored] of this.store.entries()) {
      if (stored.entry.scope !== scope) continue
      if (moduleId && stored.entry.moduleId !== moduleId) continue
      this.store.delete(key)
      count++
    }
    if (count > 0) this.persist()
    return count
  }
}
