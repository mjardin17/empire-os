/**
 * Unit tests — HttpModuleGateway
 * Covers: register, unregister, list, hasCapability, findByCapability, status, route
 * Note: route() and status() make real HTTP calls — they are tested with a mocked global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpModuleGateway } from '../implementations/module-gateway.impl.js'
import type { ModuleDescriptor, GatewayRequest } from '../interfaces/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDescriptor(
  id: string,
  overrides: Partial<ModuleDescriptor> = {}
): ModuleDescriptor {
  return {
    id,
    name: `Module ${id}`,
    baseUrl: `http://localhost:300${id.charCodeAt(0) % 10}`,
    healthPath: '/empire/health',
    capabilities: ['default-cap'],
    endpoints: [],
    priority: 10,
    ...overrides,
  }
}

function mockFetch(
  status: number,
  body: unknown = {},
  contentType = 'application/json'
): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => name === 'content-type' ? contentType : null,
      entries: () => [][Symbol.iterator](),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(body)),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────

describe('HttpModuleGateway', () => {
  let gateway: HttpModuleGateway

  beforeEach(() => {
    gateway = new HttpModuleGateway()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('adds a module to the registry', async () => {
      await gateway.register(makeDescriptor('storyforge'))
      const list = await gateway.list()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('storyforge')
    })

    it('overwrites an existing registration with the same id', async () => {
      await gateway.register(makeDescriptor('storyforge', { priority: 10 }))
      await gateway.register(makeDescriptor('storyforge', { priority: 99 }))

      const list = await gateway.list()
      expect(list).toHaveLength(1)
      expect(list[0].priority).toBe(99)
    })
  })

  // ── unregister ─────────────────────────────────────────────────────────────

  describe('unregister()', () => {
    it('removes a module from the registry', async () => {
      await gateway.register(makeDescriptor('crosspost'))
      await gateway.unregister('crosspost')

      const list = await gateway.list()
      expect(list).toHaveLength(0)
    })

    it('is a no-op for unknown module', async () => {
      await expect(gateway.unregister('ghost')).resolves.toBeUndefined()
    })
  })

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns all registered modules', async () => {
      await gateway.register(makeDescriptor('a'))
      await gateway.register(makeDescriptor('b'))
      await gateway.register(makeDescriptor('c'))

      const list = await gateway.list()
      expect(list).toHaveLength(3)
    })
  })

  // ── hasCapability / findByCapability ───────────────────────────────────────

  describe('hasCapability() + findByCapability()', () => {
    it('returns false when no module has the capability', async () => {
      await gateway.register(makeDescriptor('mod-a', { capabilities: ['render-episode'] }))
      expect(await gateway.hasCapability('publish-video')).toBe(false)
    })

    it('returns true when a module has the capability', async () => {
      await gateway.register(makeDescriptor('mod-a', { capabilities: ['render-episode'] }))
      expect(await gateway.hasCapability('render-episode')).toBe(true)
    })

    it('findByCapability returns all matching modules', async () => {
      await gateway.register(makeDescriptor('a', { capabilities: ['render-episode', 'council-run'] }))
      await gateway.register(makeDescriptor('b', { capabilities: ['render-episode'] }))
      await gateway.register(makeDescriptor('c', { capabilities: ['publish-video'] }))

      const found = await gateway.findByCapability('render-episode')
      expect(found).toHaveLength(2)
    })
  })

  // ── status ─────────────────────────────────────────────────────────────────

  describe('status()', () => {
    it('returns "offline" for unregistered module', async () => {
      const s = await gateway.status('unknown-module')
      expect(s).toBe('offline')
    })

    it('returns "healthy" when /empire/health responds 200', async () => {
      mockFetch(200, { status: 'healthy' })
      await gateway.register(makeDescriptor('video-pipeline', {
        baseUrl: 'http://localhost:8002',
      }))

      const s = await gateway.status('video-pipeline')
      expect(s).toBe('healthy')
    })

    it('returns "degraded" when /empire/health responds non-2xx', async () => {
      mockFetch(503, { status: 'degraded' })
      await gateway.register(makeDescriptor('storyforge', {
        baseUrl: 'http://localhost:8001',
      }))

      const s = await gateway.status('storyforge')
      expect(s).toBe('degraded')
    })

    it('returns "offline" when fetch throws (connection refused)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
      await gateway.register(makeDescriptor('unreachable', {
        baseUrl: 'http://localhost:9999',
      }))

      const s = await gateway.status('unreachable')
      expect(s).toBe('offline')
    })
  })

  // ── route ──────────────────────────────────────────────────────────────────

  describe('route()', () => {
    it('routes to module by moduleId and returns GatewayResponse', async () => {
      mockFetch(200, { rendered: true })
      await gateway.register(makeDescriptor('video-pipeline', {
        baseUrl: 'http://localhost:8002',
        capabilities: ['render-episode'],
      }))

      const request: GatewayRequest = {
        moduleId: 'video-pipeline',
        path: '/api/render',
        method: 'POST',
        body: { episode_id: 'EP012' },
      }

      const response = await gateway.route(request)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ rendered: true })
      expect(response.moduleId).toBe('video-pipeline')
      expect(response.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('routes to module by capability, selecting highest priority', async () => {
      mockFetch(200, { ok: true })
      await gateway.register(makeDescriptor('low-priority', {
        baseUrl: 'http://localhost:3001',
        capabilities: ['publish-video'],
        priority: 5,
      }))
      await gateway.register(makeDescriptor('high-priority', {
        baseUrl: 'http://localhost:3002',
        capabilities: ['publish-video'],
        priority: 100,
      }))

      const response = await gateway.route({
        capability: 'publish-video',
        path: '/publish',
        method: 'POST',
      })

      expect(response.moduleId).toBe('high-priority')
    })

    it('throws when moduleId is not registered', async () => {
      await expect(
        gateway.route({ moduleId: 'ghost', path: '/', method: 'GET' })
      ).rejects.toThrow('Module not found: ghost')
    })

    it('throws when no module has the requested capability', async () => {
      await expect(
        gateway.route({ capability: 'nonexistent-cap', path: '/', method: 'GET' })
      ).rejects.toThrow('No module with capability: nonexistent-cap')
    })

    it('throws when neither moduleId nor capability is provided', async () => {
      await expect(
        // @ts-expect-error intentionally invalid
        gateway.route({ path: '/', method: 'GET' })
      ).rejects.toThrow('GatewayRequest requires moduleId or capability')
    })

    it('forwards custom headers to the upstream call', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
          entries: () => [][Symbol.iterator](),
        },
        json: () => Promise.resolve({}),
      })
      vi.stubGlobal('fetch', fetchSpy)

      await gateway.register(makeDescriptor('storyforge', { baseUrl: 'http://localhost:8001' }))
      await gateway.route({
        moduleId: 'storyforge',
        path: '/api/scripts',
        method: 'GET',
        headers: { 'X-Custom': 'empire-test' },
      })

      const callArgs = fetchSpy.mock.calls[0]
      expect((callArgs[1] as RequestInit).headers).toMatchObject({ 'X-Custom': 'empire-test' })
    })
  })
})
