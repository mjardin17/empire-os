/**
 * Unit tests — InMemoryMemoryBus
 * Covers: read, write, delete, search, subscribe, clear, TTL
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InMemoryMemoryBus } from '../implementations/memory-bus.impl.js'

describe('InMemoryMemoryBus', () => {
  let bus: InMemoryMemoryBus

  beforeEach(() => {
    bus = new InMemoryMemoryBus()
  })

  // ── write / read ──────────────────────────────────────────────────────────

  describe('write() + read()', () => {
    it('stores and retrieves a value', async () => {
      await bus.write('episode.latest', 'EP012')
      const entry = await bus.read('episode.latest')
      expect(entry).not.toBeNull()
      expect(entry!.value).toBe('EP012')
      expect(entry!.key).toBe('episode.latest')
    })

    it('returns null for an unknown key', async () => {
      const result = await bus.read('does.not.exist')
      expect(result).toBeNull()
    })

    it('scopes keys — same key in different scopes are independent', async () => {
      await bus.write('config', 'global-val', { scope: 'global' })
      await bus.write('config', 'local-val', { scope: 'local', moduleId: 'storyforge' })

      const g = await bus.read('config', 'global')
      const l = await bus.read('config', 'local')

      expect(g!.value).toBe('global-val')
      expect(l!.value).toBe('local-val')
    })

    it('updates an existing key (preserves createdAt)', async () => {
      vi.useFakeTimers()
      try {
        await bus.write('status', 'v1')
        const first = await bus.read('status')
        const createdAt = first!.createdAt

        vi.advanceTimersByTime(1) // ensure updatedAt timestamp differs by at least 1ms
        await bus.write('status', 'v2')
        const second = await bus.read('status')

        expect(second!.value).toBe('v2')
        expect(second!.createdAt).toBe(createdAt)     // unchanged
        expect(second!.updatedAt).not.toBe(createdAt) // bumped
      } finally {
        vi.useRealTimers()
      }
    })

    it('attaches tags and moduleId', async () => {
      await bus.write('render.state', { running: true }, {
        moduleId: 'video-pipeline',
        tags: ['render', 'active'],
      })
      const entry = await bus.read('render.state')
      expect(entry!.moduleId).toBe('video-pipeline')
      expect(entry!.tags).toContain('render')
    })
  })

  // ── TTL ───────────────────────────────────────────────────────────────────

  describe('TTL expiry', () => {
    it('returns null after ttlSeconds elapses', async () => {
      vi.useFakeTimers()

      await bus.write('temp-key', 'expires-soon', { ttlSeconds: 1 })
      expect(await bus.read('temp-key')).not.toBeNull()

      vi.advanceTimersByTime(1500)
      expect(await bus.read('temp-key')).toBeNull()

      vi.useRealTimers()
    })
  })

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('removes an existing entry', async () => {
      await bus.write('to-delete', 'x')
      await bus.delete('to-delete')
      expect(await bus.read('to-delete')).toBeNull()
    })

    it('is a no-op for unknown keys', async () => {
      await expect(bus.delete('ghost-key')).resolves.toBeUndefined()
    })
  })

  // ── search ────────────────────────────────────────────────────────────────

  describe('search()', () => {
    beforeEach(async () => {
      await bus.write('render.ep001', 'done', { moduleId: 'video-pipeline', tags: ['render'] })
      await bus.write('render.ep002', 'pending', { moduleId: 'video-pipeline', tags: ['render'] })
      await bus.write('script.ep001', 'written', { moduleId: 'storyforge', tags: ['script'] })
    })

    it('returns all entries when no filter', async () => {
      const results = await bus.search({})
      expect(results.length).toBeGreaterThanOrEqual(3)
    })

    it('filters by moduleId', async () => {
      const results = await bus.search({ moduleId: 'video-pipeline' })
      expect(results.length).toBe(2)
      expect(results.every(e => e.moduleId === 'video-pipeline')).toBe(true)
    })

    it('filters by keyPattern wildcard', async () => {
      const results = await bus.search({ keyPattern: 'render.*' })
      expect(results.length).toBe(2)
    })

    it('filters by tags — all tags must match', async () => {
      const results = await bus.search({ tags: ['render'] })
      expect(results.length).toBe(2)

      const noMatch = await bus.search({ tags: ['render', 'script'] })
      expect(noMatch.length).toBe(0)
    })

    it('respects limit and offset', async () => {
      const first = await bus.search({ limit: 2 })
      expect(first.length).toBe(2)

      const second = await bus.search({ limit: 2, offset: 2 })
      expect(second.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── subscribe ────────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('fires handler on write matching pattern', async () => {
      const changes: string[] = []
      bus.subscribe('render.*', (entry, change) => { changes.push(change) })

      await bus.write('render.ep003', 'queued')
      await new Promise<void>((res) => setTimeout(res, 0))

      expect(changes).toContain('write')
    })

    it('fires handler on delete matching pattern', async () => {
      const changes: string[] = []
      bus.subscribe('render.*', (entry, change) => { changes.push(change) })

      await bus.write('render.ep004', 'done')
      await bus.delete('render.ep004')
      await new Promise<void>((res) => setTimeout(res, 0))

      expect(changes).toContain('delete')
    })

    it('unsubscribe stops notifications', async () => {
      const changes: string[] = []
      const unsub = bus.subscribe('script.*', (_, change) => { changes.push(change) })
      unsub()

      await bus.write('script.ep005', 'new')
      await new Promise<void>((res) => setTimeout(res, 0))

      expect(changes).toHaveLength(0)
    })
  })

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('removes all entries matching scope', async () => {
      await bus.write('a', 1, { scope: 'local', moduleId: 'mod-a' })
      await bus.write('b', 2, { scope: 'local', moduleId: 'mod-b' })
      await bus.write('c', 3, { scope: 'global' })

      const count = await bus.clear('local')
      expect(count).toBe(2)
      expect(await bus.read('c', 'global')).not.toBeNull()
    })

    it('scopes clear by moduleId when provided', async () => {
      await bus.write('x', 1, { scope: 'local', moduleId: 'mod-a' })
      await bus.write('y', 2, { scope: 'local', moduleId: 'mod-b' })

      const count = await bus.clear('local', 'mod-a')
      expect(count).toBe(1)
      expect(await bus.read('y', 'local')).not.toBeNull()
    })
  })
})
