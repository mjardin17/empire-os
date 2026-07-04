/**
 * MEMORY BUS — Frozen Interface
 * Shared persistent memory layer. No module owns this.
 * Empire Assistant reads/writes here like any other module.
 *
 * STABILITY STATUS: FROZEN — do not change without Josh approval.
 */

export type MemoryScope = 'global' | 'session' | 'module' | 'user'

export interface MemoryEntry {
  key: string
  value: unknown
  scope: MemoryScope
  moduleId?: string     // which module wrote this
  userId?: string
  createdAt: string     // ISO 8601
  updatedAt: string
  expiresAt?: string    // ISO 8601, null = permanent
  tags?: string[]
}

export interface MemoryQuery {
  scope?: MemoryScope
  moduleId?: string
  tags?: string[]
  keyPattern?: string   // glob: "agent:*"
  limit?: number
  offset?: number
}

export type MemoryHandler = (entry: MemoryEntry, change: 'write' | 'delete') => void | Promise<void>
export type Unsubscribe = () => void

/**
 * MemoryBus: shared context store across the entire platform.
 * Implemented once by the platform. Injected into every module.
 * Backed by Redis (hot) + PostgreSQL (cold) in production.
 */
export interface MemoryBus {
  read(key: string, scope?: MemoryScope): Promise<MemoryEntry | null>
  write(key: string, value: unknown, options?: MemoryWriteOptions): Promise<void>
  delete(key: string, scope?: MemoryScope): Promise<void>
  search(query: MemoryQuery): Promise<MemoryEntry[]>
  subscribe(pattern: string, handler: MemoryHandler): Unsubscribe
  clear(scope: MemoryScope, moduleId?: string): Promise<number> // returns count deleted
}

export interface MemoryWriteOptions {
  scope?: MemoryScope
  ttlSeconds?: number   // 0 or omit = permanent
  tags?: string[]
  moduleId?: string
}
