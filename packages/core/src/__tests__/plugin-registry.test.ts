/**
 * Unit tests — InMemoryPluginRegistry
 * Covers: register, unregister, update, get, list, hasCapability, findByCapability,
 *         setStatus, stats, validateDependencies
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryPluginRegistry } from '../implementations/plugin-registry.impl.js'
import type { PluginDescriptor } from '../interfaces/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDescriptor(
  id: string,
  overrides: Partial<Omit<PluginDescriptor, 'registeredAt' | 'updatedAt'>> = {}
): Omit<PluginDescriptor, 'registeredAt' | 'updatedAt'> {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    type: 'module',
    status: 'active',
    capabilities: [{ name: 'default-cap', description: 'A default capability' }],
    endpoints: [],
    dependencies: [],
    priority: 10,
    tags: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryPluginRegistry', () => {
  let registry: InMemoryPluginRegistry

  beforeEach(() => {
    registry = new InMemoryPluginRegistry()
  })

  // ── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('registers a plugin and returns a full PluginDescriptor', async () => {
      const descriptor = await registry.register(makeDescriptor('crosspost'))
      expect(descriptor.id).toBe('crosspost')
      expect(descriptor.registeredAt).toBeTruthy()
      expect(descriptor.updatedAt).toBeTruthy()
    })

    it('re-registers (upsert) without changing registeredAt', async () => {
      const first = await registry.register(makeDescriptor('storyforge'))
      const createdAt = first.registeredAt

      const second = await registry.register(makeDescriptor('storyforge', { version: '1.1.0' }))
      expect(second.registeredAt).toBe(createdAt)
      expect(second.version).toBe('1.1.0')
    })
  })

  // ── unregister ─────────────────────────────────────────────────────────────

  describe('unregister()', () => {
    it('removes a plugin from the registry', async () => {
      await registry.register(makeDescriptor('temp-module'))
      await registry.unregister('temp-module')
      expect(await registry.get('temp-module')).toBeNull()
    })

    it('is a no-op for unknown plugin id', async () => {
      await expect(registry.unregister('ghost')).resolves.toBeUndefined()
    })
  })

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('merges updates and preserves id + registeredAt', async () => {
      await registry.register(makeDescriptor('video-pipeline'))
      const updated = await registry.update('video-pipeline', { version: '2.0.0', priority: 50 })

      expect(updated.id).toBe('video-pipeline')
      expect(updated.version).toBe('2.0.0')
      expect(updated.priority).toBe(50)
    })

    it('throws for unknown plugin', async () => {
      await expect(registry.update('ghost', { version: '1.0.0' })).rejects.toThrow(
        'Plugin not found: ghost'
      )
    })
  })

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns null for unregistered plugin', async () => {
      expect(await registry.get('unknown')).toBeNull()
    })

    it('returns the plugin after registration', async () => {
      await registry.register(makeDescriptor('empire-assistant'))
      const plugin = await registry.get('empire-assistant')
      expect(plugin).not.toBeNull()
      expect(plugin!.id).toBe('empire-assistant')
    })
  })

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list()', () => {
    beforeEach(async () => {
      await registry.register(makeDescriptor('mod-a', { type: 'module', status: 'active', tags: ['render'] }))
      await registry.register(makeDescriptor('mod-b', { type: 'module', status: 'inactive', tags: ['script'] }))
      await registry.register(makeDescriptor('plug-c', { type: 'plugin', status: 'active', tags: ['render'] }))
    })

    it('returns all plugins with no filter', async () => {
      const plugins = await registry.list()
      expect(plugins).toHaveLength(3)
    })

    it('filters by type', async () => {
      const modules = await registry.list({ type: 'module' })
      expect(modules).toHaveLength(2)
    })

    it('filters by status', async () => {
      const active = await registry.list({ status: 'active' })
      expect(active).toHaveLength(2)
    })

    it('filters by capability name', async () => {
      await registry.register(makeDescriptor('special', {
        capabilities: [{ name: 'render-episode', description: 'Renders an episode' }],
      }))
      const found = await registry.list({ capability: 'render-episode' })
      expect(found).toHaveLength(1)
      expect(found[0].id).toBe('special')
    })

    it('filters by tags — all tags must match', async () => {
      const results = await registry.list({ tags: ['render'] })
      expect(results).toHaveLength(2)

      const noMatch = await registry.list({ tags: ['render', 'script'] })
      expect(noMatch).toHaveLength(0)
    })
  })

  // ── hasCapability / findByCapability ──────────────────────────────────────

  describe('hasCapability() + findByCapability()', () => {
    it('returns false when no active plugin has the capability', async () => {
      expect(await registry.hasCapability('render-season')).toBe(false)
    })

    it('returns true when an active plugin has the capability', async () => {
      await registry.register(makeDescriptor('video-pipeline', {
        status: 'active',
        capabilities: [{ name: 'render-season', description: '' }],
      }))
      expect(await registry.hasCapability('render-season')).toBe(true)
    })

    it('returns false for inactive plugin even if it has the capability', async () => {
      await registry.register(makeDescriptor('offline-mod', {
        status: 'inactive',
        capabilities: [{ name: 'secret-cap', description: '' }],
      }))
      expect(await registry.hasCapability('secret-cap')).toBe(false)
    })

    it('findByCapability returns all active matching plugins', async () => {
      await registry.register(makeDescriptor('a', {
        status: 'active',
        capabilities: [{ name: 'publish-video', description: '' }],
      }))
      await registry.register(makeDescriptor('b', {
        status: 'active',
        capabilities: [{ name: 'publish-video', description: '' }],
      }))
      const found = await registry.findByCapability('publish-video')
      expect(found).toHaveLength(2)
    })
  })

  // ── setStatus ─────────────────────────────────────────────────────────────

  describe('setStatus()', () => {
    it('updates the status of a plugin', async () => {
      await registry.register(makeDescriptor('storyforge', { status: 'active' }))
      await registry.setStatus('storyforge', 'inactive')
      const p = await registry.get('storyforge')
      expect(p!.status).toBe('inactive')
    })

    it('sets errorMessage when status is "error"', async () => {
      await registry.register(makeDescriptor('broken-mod'))
      await registry.setStatus('broken-mod', 'error', 'Connection refused')
      const p = await registry.get('broken-mod')
      expect(p!.errorMessage).toBe('Connection refused')
    })

    it('clears errorMessage when status changes away from "error"', async () => {
      await registry.register(makeDescriptor('recovering-mod'))
      await registry.setStatus('recovering-mod', 'error', 'Oops')
      await registry.setStatus('recovering-mod', 'active')
      const p = await registry.get('recovering-mod')
      expect(p!.errorMessage).toBeUndefined()
    })

    it('throws for unknown plugin', async () => {
      await expect(registry.setStatus('ghost', 'active')).rejects.toThrow(
        'Plugin not found: ghost'
      )
    })
  })

  // ── stats ─────────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('returns zero stats on empty registry', async () => {
      const s = await registry.stats()
      expect(s.total).toBe(0)
    })

    it('counts plugins by type and status', async () => {
      await registry.register(makeDescriptor('m1', { type: 'module', status: 'active' }))
      await registry.register(makeDescriptor('m2', { type: 'module', status: 'active' }))
      await registry.register(makeDescriptor('p1', { type: 'plugin', status: 'inactive' }))

      const s = await registry.stats()
      expect(s.total).toBe(3)
      expect(s.byType['module']).toBe(2)
      expect(s.byType['plugin']).toBe(1)
      expect(s.byStatus['active']).toBe(2)
      expect(s.byStatus['inactive']).toBe(1)
    })

    it('collects unique capabilities across all plugins', async () => {
      await registry.register(makeDescriptor('a', {
        capabilities: [{ name: 'cap-x', description: '' }],
      }))
      await registry.register(makeDescriptor('b', {
        capabilities: [{ name: 'cap-y', description: '' }],
      }))
      const s = await registry.stats()
      expect(s.capabilities).toContain('cap-x')
      expect(s.capabilities).toContain('cap-y')
    })
  })

  // ── validateDependencies ──────────────────────────────────────────────────

  describe('validateDependencies()', () => {
    it('returns valid:true when all required deps are registered', async () => {
      await registry.register(makeDescriptor('core'))
      await registry.register(makeDescriptor('storyforge', {
        dependencies: [{ pluginId: 'core', optional: false }],
      }))

      const result = await registry.validateDependencies('storyforge')
      expect(result.valid).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('returns valid:false with missing ids when dep is absent', async () => {
      await registry.register(makeDescriptor('crosspost', {
        dependencies: [{ pluginId: 'missing-module', optional: false }],
      }))

      const result = await registry.validateDependencies('crosspost')
      expect(result.valid).toBe(false)
      expect(result.missing).toContain('missing-module')
    })

    it('ignores optional deps that are missing', async () => {
      await registry.register(makeDescriptor('video-pipeline', {
        dependencies: [{ pluginId: 'optional-cache', optional: true }],
      }))

      const result = await registry.validateDependencies('video-pipeline')
      expect(result.valid).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('throws for unknown plugin', async () => {
      await expect(registry.validateDependencies('ghost')).rejects.toThrow(
        'Plugin not found: ghost'
      )
    })
  })
})
