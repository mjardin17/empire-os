/**
 * Integration test — bootstrap() + all 6 CoreServices
 * This is EA stability criterion 4: a test module instantiates and calls all 6 CoreServices.
 *
 * This test verifies:
 *   1. bootstrap() resolves without throwing
 *   2. All 6 services are present on the returned CoreServices object
 *   3. Each service responds correctly to a baseline operation
 *   4. The singleton pattern works (second call returns same instance)
 *   5. Services are genuinely wired (WorkflowEngine uses the injected EventBus)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { bootstrap, _resetBootstrap } from '../bootstrap.js'

beforeEach(() => {
  _resetBootstrap()
  // gateway.status and route call fetch — stub it for the integration test
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: () => 'application/json',
      entries: () => [][Symbol.iterator](),
    },
    json: () => Promise.resolve({ status: 'healthy' }),
    text: () => Promise.resolve('healthy'),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  _resetBootstrap()
})

describe('bootstrap()', () => {
  it('returns a CoreServices object with all 6 services', async () => {
    const services = await bootstrap()

    expect(services.eventBus).toBeDefined()
    expect(services.memoryBus).toBeDefined()
    expect(services.aiRouter).toBeDefined()
    expect(services.moduleGateway).toBeDefined()
    expect(services.workflowEngine).toBeDefined()
    expect(services.pluginRegistry).toBeDefined()
  })

  it('is a singleton — second call returns the same instance', async () => {
    const first = await bootstrap()
    const second = await bootstrap()
    expect(first).toBe(second)
  })

  it('registers empire-os-core plugin in the PluginRegistry', async () => {
    const { pluginRegistry } = await bootstrap()
    const core = await pluginRegistry.get('empire-os-core')
    expect(core).not.toBeNull()
    expect(core!.status).toBe('active')
    expect(core!.capabilities.some(c => c.name === 'memory')).toBe(true)
    expect(core!.capabilities.some(c => c.name === 'events')).toBe(true)
    expect(core!.capabilities.some(c => c.name === 'ai-routing')).toBe(true)
    expect(core!.capabilities.some(c => c.name === 'module-gateway')).toBe(true)
    expect(core!.capabilities.some(c => c.name === 'workflows')).toBe(true)
    expect(core!.capabilities.some(c => c.name === 'plugin-registry')).toBe(true)
  })

  it('publishes system.platform.ready event during bootstrap', async () => {
    const { eventBus } = await bootstrap()
    const history = await eventBus.history('system.platform.ready')
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history[0].source).toBe('empire-os-core')
    expect(history[0].payload).toMatchObject({ services: expect.any(Array) })
  })
})

describe('CoreServices — cross-service wiring', () => {
  it('EventBus: publish → subscribe round-trip', async () => {
    const { eventBus } = await bootstrap()
    const received: unknown[] = []
    eventBus.subscribe('render.completed', (e) => { received.push(e) })
    await eventBus.publish({ topic: 'render.completed', source: 'video-pipeline', payload: { episodeId: 'EP012' } })
    expect(received).toHaveLength(1)
  })

  it('MemoryBus: write → read round-trip', async () => {
    const { memoryBus } = await bootstrap()
    await memoryBus.write('test.key', { value: 42 })
    const entry = await memoryBus.read('test.key')
    expect(entry).not.toBeNull()
    expect(entry!.value).toEqual({ value: 42 })
  })

  it('PluginRegistry: register → get → validateDependencies', async () => {
    const { pluginRegistry } = await bootstrap()

    await pluginRegistry.register({
      id: 'test-module-a',
      name: 'Test A',
      version: '1.0.0',
      type: 'module',
      status: 'active',
      capabilities: [{ name: 'test-cap', description: '' }],
      endpoints: [],
    })
    await pluginRegistry.register({
      id: 'test-module-b',
      name: 'Test B',
      version: '1.0.0',
      type: 'module',
      status: 'active',
      capabilities: [],
      endpoints: [],
      dependencies: [{ pluginId: 'test-module-a', optional: false }],
    })

    const result = await pluginRegistry.validateDependencies('test-module-b')
    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('ModuleGateway: register → list → hasCapability', async () => {
    const { moduleGateway } = await bootstrap()

    await moduleGateway.register({
      id: 'video-pipeline',
      name: 'Video Pipeline',
      baseUrl: 'http://localhost:8002',
      healthPath: '/empire/health',
      capabilities: ['render-episode', 'council-run'],
      endpoints: [],
      priority: 20,
    })

    const list = await moduleGateway.list()
    expect(list.some(m => m.id === 'video-pipeline')).toBe(true)
    expect(await moduleGateway.hasCapability('render-episode')).toBe(true)
    expect(await moduleGateway.hasCapability('nonexistent')).toBe(false)
  })

  it('AIRouter: registerAdapter → models()', async () => {
    const { aiRouter } = await bootstrap()

    aiRouter.registerAdapter({
      provider: 'anthropic',
      models: [
        {
          id: 'claude-3-5',
          provider: 'anthropic',
          name: 'Claude 3.5',
          capabilities: ['completion', 'code'],
          contextWindow: 200000,
          costPerMToken: 15,
          available: true,
        },
      ],
      complete: vi.fn().mockResolvedValue({ content: 'ok', inputTokens: 10, outputTokens: 5, durationMs: 100 }),
      isAvailable: vi.fn().mockResolvedValue(true),
    })

    const models = await aiRouter.models()
    expect(models.length).toBeGreaterThanOrEqual(1)
    expect(models.some(m => m.id === 'claude-3-5')).toBe(true)
  })

  it('WorkflowEngine: define → start → status reaches completed', async () => {
    const { workflowEngine, moduleGateway } = await bootstrap()

    // Register a module so workflow can route to it
    await moduleGateway.register({
      id: 'test-worker',
      name: 'Test Worker',
      baseUrl: 'http://localhost:9999',
      healthPath: '/empire/health',
      capabilities: ['test-action'],
      endpoints: [],
      priority: 10,
    })

    // fetch is already mocked to return 200 for this test suite
    await workflowEngine.define({
      id: 'test-workflow',
      name: 'Test Workflow',
      version: '1',
      initialStep: 'step-a',
      steps: [
        {
          id: 'step-a',
          action: 'test-action',
          moduleId: 'test-worker',
          onSuccess: 'step-b',
        },
        {
          id: 'step-b',
          action: 'test-action',
          moduleId: 'test-worker',
        },
      ],
      timeout: 10000,
    })

    const instance = await workflowEngine.start('test-workflow', { input: 'bootstrap-test' })
    await new Promise<void>((res) => setTimeout(res, 20))

    const result = await workflowEngine.status(instance.id)
    expect(result.status).toBe('completed')
    expect(result.stepResults).toHaveLength(2)
  })

  it('WorkflowEngine uses the shared EventBus — completed event is visible in history', async () => {
    const { workflowEngine, eventBus, moduleGateway } = await bootstrap()

    await moduleGateway.register({
      id: 'test-worker-2',
      name: 'Worker 2',
      baseUrl: 'http://localhost:9998',
      healthPath: '/empire/health',
      capabilities: ['noop'],
      endpoints: [],
    })

    await workflowEngine.define({
      id: 'shared-bus-test',
      name: 'Shared Bus Test',
      version: '1',
      initialStep: 'only-step',
      steps: [{ id: 'only-step', action: 'noop', moduleId: 'test-worker-2' }],
    })

    await workflowEngine.start('shared-bus-test', {})
    await new Promise<void>((res) => setTimeout(res, 20))

    // The WorkflowEngine publishes to the eventBus that bootstrap injected
    const history = await eventBus.history('workflow.completed')
    expect(history.length).toBeGreaterThanOrEqual(1)
  })
})
