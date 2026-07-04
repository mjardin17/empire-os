/**
 * Unit tests — InMemoryWorkflowEngine
 * Covers: define/undefine/definitions, start, 3-step execution, onSuccess/onFailure routing,
 *         status, cancel, pause/resume, list, approve/reject, dryRun, variable mapping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InMemoryWorkflowEngine } from '../implementations/workflow-engine.impl.js'
import type {
  ModuleGateway,
  EventBus,
  WorkflowDefinition,
  GatewayResponse,
} from '../interfaces/index.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeGatewayMock(responseBody: unknown = { ok: true }): ModuleGateway {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    status: vi.fn().mockResolvedValue('healthy'),
    hasCapability: vi.fn().mockResolvedValue(true),
    findByCapability: vi.fn().mockResolvedValue([]),
    route: vi.fn().mockResolvedValue({
      status: 200,
      body: responseBody,
      headers: {},
      moduleId: 'test-module',
      durationMs: 10,
    } satisfies GatewayResponse),
  } as unknown as ModuleGateway
}

function makeEventBusMock(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    history: vi.fn().mockResolvedValue([]),
    replay: vi.fn().mockResolvedValue([]),
    stats: vi.fn().mockResolvedValue({}),
  } as unknown as EventBus
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLinearWorkflow(stepCount: number): WorkflowDefinition {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    id: `step-${i + 1}`,
    action: 'do-thing',
    moduleId: 'test-module',
    onSuccess: i < stepCount - 1 ? `step-${i + 2}` : undefined,
  }))

  return {
    id: `linear-wf-${stepCount}`,
    name: `Linear ${stepCount}-step Workflow`,
    version: '1',
    initialStep: 'step-1',
    steps,
    timeout: 60000,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryWorkflowEngine', () => {
  let gateway: ModuleGateway
  let eventBus: EventBus
  let engine: InMemoryWorkflowEngine

  beforeEach(() => {
    gateway = makeGatewayMock()
    eventBus = makeEventBusMock()
    engine = new InMemoryWorkflowEngine(gateway, eventBus)
  })

  // ── define / undefine / definitions ──────────────────────────────────────

  describe('define() + undefine() + definitions()', () => {
    it('registers a workflow definition', async () => {
      await engine.define(makeLinearWorkflow(1))
      const defs = await engine.definitions()
      expect(defs).toHaveLength(1)
    })

    it('undefine removes the workflow', async () => {
      await engine.define(makeLinearWorkflow(1))
      await engine.undefine('linear-wf-1')
      const defs = await engine.definitions()
      expect(defs).toHaveLength(0)
    })

    it('registers multiple workflows independently', async () => {
      await engine.define(makeLinearWorkflow(1))
      await engine.define(makeLinearWorkflow(2))
      await engine.define(makeLinearWorkflow(3))
      const defs = await engine.definitions()
      expect(defs).toHaveLength(3)
    })
  })

  // ── start — happy path ────────────────────────────────────────────────────

  describe('start() — basic execution', () => {
    it('returns a running WorkflowInstance immediately', async () => {
      await engine.define(makeLinearWorkflow(1))
      const instance = await engine.start('linear-wf-1', { input: 'data' })
      expect(instance.status).toBe('running')
      expect(instance.id).toBeTruthy()
      expect(instance.definitionId).toBe('linear-wf-1')
    })

    it('throws when workflow id is not defined', async () => {
      await expect(engine.start('nonexistent', {})).rejects.toThrow(
        'Workflow not found: nonexistent'
      )
    })

    it('publishes workflow.started event on launch', async () => {
      await engine.define(makeLinearWorkflow(1))
      await engine.start('linear-wf-1', {})
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'workflow.started' })
      )
    })
  })

  // ── 3-step workflow execution ─────────────────────────────────────────────

  describe('3-step linear workflow', () => {
    it('executes all 3 steps and reaches completed status', async () => {
      await engine.define(makeLinearWorkflow(3))
      const instance = await engine.start('linear-wf-3', { episode: 'EP012' })

      // Allow async runInstance to complete
      await new Promise<void>((res) => setTimeout(res, 10))

      const result = await engine.status(instance.id)
      expect(result.status).toBe('completed')
      expect(result.stepResults).toHaveLength(3)
      expect(result.stepResults.every(sr => sr.status === 'completed')).toBe(true)
    })

    it('calls gateway.route once per step (3 times)', async () => {
      await engine.define(makeLinearWorkflow(3))
      const instance = await engine.start('linear-wf-3', {})
      await new Promise<void>((res) => setTimeout(res, 10))

      expect(gateway.route).toHaveBeenCalledTimes(3)
    })

    it('publishes workflow.completed event after all steps', async () => {
      await engine.define(makeLinearWorkflow(3))
      const instance = await engine.start('linear-wf-3', {})
      await new Promise<void>((res) => setTimeout(res, 10))

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'workflow.completed' })
      )
    })

    it('publishes workflow.step-done for each step', async () => {
      await engine.define(makeLinearWorkflow(3))
      await engine.start('linear-wf-3', {})
      await new Promise<void>((res) => setTimeout(res, 10))

      const stepDoneCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([event]) => event?.topic === 'workflow.step.completed'
      )
      expect(stepDoneCalls).toHaveLength(3)
    })
  })

  // ── failure routing (onFailure) ───────────────────────────────────────────

  describe('onFailure routing', () => {
    it('routes to onFailure step when a step throws', async () => {
      const failingGateway = makeGatewayMock()
      let callCount = 0
      ;(failingGateway.route as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ status: 500, body: { error: 'server error' }, headers: {}, moduleId: 'mod', durationMs: 5 })
        }
        return Promise.resolve({ status: 200, body: { ok: true }, headers: {}, moduleId: 'mod', durationMs: 5 })
      })

      const failEngine = new InMemoryWorkflowEngine(failingGateway, eventBus)
      const wf: WorkflowDefinition = {
        id: 'failing-wf',
        name: 'Failing Workflow',
        version: '1',
        initialStep: 'step-primary',
        steps: [
          {
            id: 'step-primary',
            action: 'do-primary',
            moduleId: 'test-module',
            onFailure: 'step-recovery',
          },
          {
            id: 'step-recovery',
            action: 'do-recovery',
            moduleId: 'test-module',
          },
        ],
      }

      await failEngine.define(wf)
      const instance = await failEngine.start('failing-wf', {})
      await new Promise<void>((res) => setTimeout(res, 20))

      const result = await failEngine.status(instance.id)
      // Recovery step ran, so instance reaches completed (recovery step succeeded)
      expect(result.stepResults.length).toBeGreaterThanOrEqual(2)
    })

    it('marks instance as failed when step fails with no onFailure handler', async () => {
      const failingGateway = makeGatewayMock()
      ;(failingGateway.route as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 500,
        body: {},
        headers: {},
        moduleId: 'mod',
        durationMs: 5,
      })

      const failEngine = new InMemoryWorkflowEngine(failingGateway, eventBus)
      const wf: WorkflowDefinition = {
        id: 'no-handler-wf',
        name: 'No Handler',
        version: '1',
        initialStep: 'step-1',
        steps: [{ id: 'step-1', action: 'will-fail', moduleId: 'test-module' }],
      }

      await failEngine.define(wf)
      const instance = await failEngine.start('no-handler-wf', {})
      await new Promise<void>((res) => setTimeout(res, 20))

      const result = await failEngine.status(instance.id)
      expect(result.status).toBe('failed')
    })
  })

  // ── status ────────────────────────────────────────────────────────────────

  describe('status()', () => {
    it('throws for unknown instance id', async () => {
      await expect(engine.status('ghost-id')).rejects.toThrow(
        'Instance not found: ghost-id'
      )
    })

    it('returns the instance matching the id', async () => {
      await engine.define(makeLinearWorkflow(1))
      const instance = await engine.start('linear-wf-1', {})
      const fetched = await engine.status(instance.id)
      expect(fetched.id).toBe(instance.id)
    })
  })

  // ── cancel ────────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('marks a running instance as cancelled', async () => {
      await engine.define(makeLinearWorkflow(3))
      const instance = await engine.start('linear-wf-3', {})
      await engine.cancel(instance.id, 'manual stop')

      const result = await engine.status(instance.id)
      expect(result.status).toBe('cancelled')
      expect(result.error).toBe('manual stop')
    })
  })

  // ── pause / resume ────────────────────────────────────────────────────────

  describe('pause() + resume()', () => {
    it('pauses a running instance', async () => {
      await engine.define(makeLinearWorkflow(1))
      const instance = await engine.start('linear-wf-1', {})
      await engine.pause(instance.id)

      const result = await engine.status(instance.id)
      expect(result.status).toBe('paused')
    })

    it('resume restores running status', async () => {
      await engine.define(makeLinearWorkflow(1))
      const instance = await engine.start('linear-wf-1', {})
      await engine.pause(instance.id)
      await engine.resume(instance.id)

      const result = await engine.status(instance.id)
      // Status is now 'running' again (or already completed if resume triggered execution)
      expect(['running', 'completed']).toContain(result.status)
    })
  })

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns all instances with no filter', async () => {
      await engine.define(makeLinearWorkflow(1))
      await engine.start('linear-wf-1', {})
      await engine.start('linear-wf-1', {})
      const instances = await engine.list()
      expect(instances.length).toBe(2)
    })

    it('filters by definitionId', async () => {
      await engine.define(makeLinearWorkflow(1))
      await engine.define(makeLinearWorkflow(2))
      await engine.start('linear-wf-1', {})
      await engine.start('linear-wf-2', {})

      const filtered = await engine.list({ definitionId: 'linear-wf-1' })
      expect(filtered.length).toBe(1)
      expect(filtered[0].definitionId).toBe('linear-wf-1')
    })

    it('respects limit', async () => {
      await engine.define(makeLinearWorkflow(1))
      for (let i = 0; i < 5; i++) await engine.start('linear-wf-1', {})

      const limited = await engine.list({ limit: 3 })
      expect(limited.length).toBe(3)
    })
  })

  // ── dryRun ────────────────────────────────────────────────────────────────

  describe('dryRun option', () => {
    it('returns a pending instance without storing or executing', async () => {
      await engine.define(makeLinearWorkflow(3))
      const instance = await engine.start('linear-wf-3', {}, { dryRun: true })

      expect(instance.status).toBe('pending')
      expect(gateway.route).not.toHaveBeenCalled()

      // Not stored — list is empty
      const all = await engine.list()
      expect(all).toHaveLength(0)
    })
  })

  // ── approve / reject ──────────────────────────────────────────────────────

  describe('approve() + reject()', () => {
    it('approve sets approval variable on the instance', async () => {
      await engine.define(makeLinearWorkflow(1))
      const instance = await engine.start('linear-wf-1', {})
      await engine.pause(instance.id)

      await engine.approve(instance.id, 'step-1', 'reviewer-josh')
      const result = await engine.status(instance.id)
      expect(result.variables['approval_step-1']).toMatchObject({
        approved: true,
        by: 'reviewer-josh',
      })
    })

    it('reject marks the instance as failed', async () => {
      // Block the gateway so runInstance can never advance to 'completed'
      // before reject() fires — eliminates the timing race entirely
      ;(gateway.route as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<never>(() => {})
      )
      await engine.define(makeLinearWorkflow(1))
      const instance = await engine.start('linear-wf-1', {})
      // runInstance is now stuck at gateway.route; it can never set 'completed'

      await engine.pause(instance.id)
      await engine.reject(instance.id, 'step-1', 'reviewer-josh', 'Quality failed')

      const result = await engine.status(instance.id)
      expect(result.status).toBe('failed')
      expect(result.error).toContain('Quality failed')
    })
  })
})
