/**
 * Unit tests — InProcessEventBus
 * Covers: publish, subscribe, history, replay, stats, unsubscribe
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InProcessEventBus } from '../implementations/event-bus.impl.js'

describe('InProcessEventBus', () => {
  let bus: InProcessEventBus

  beforeEach(() => {
    bus = new InProcessEventBus()
  })

  // ── publish ──────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('returns a full DomainEvent with id and timestamp', async () => {
      const event = await bus.publish({
        topic: 'render.completed',
        source: 'video-pipeline',
        payload: { episodeId: 'EP001' },
      })

      expect(event.id).toBeTruthy()
      expect(event.timestamp).toBeTruthy()
      expect(event.topic).toBe('render.completed')
      expect(event.source).toBe('video-pipeline')
      expect(event.payload).toEqual({ episodeId: 'EP001' })
    })

    it('assigns unique IDs to each published event', async () => {
      const e1 = await bus.publish({ topic: 'system.alert', source: 'a', payload: {} })
      const e2 = await bus.publish({ topic: 'system.alert', source: 'a', payload: {} })
      expect(e1.id).not.toBe(e2.id)
    })
  })

  // ── subscribe / deliver ──────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('delivers published events to subscribers', async () => {
      const received: unknown[] = []
      bus.subscribe('render.completed', (e) => { received.push(e) })

      await bus.publish({ topic: 'render.completed', source: 'test', payload: { ok: true } })

      expect(received).toHaveLength(1)
    })

    it('does not deliver events from a different topic', async () => {
      const received: unknown[] = []
      bus.subscribe('render.started', (e) => { received.push(e) })

      await bus.publish({ topic: 'render.completed', source: 'test', payload: {} })

      expect(received).toHaveLength(0)
    })

    it('delivers to multiple subscribers on the same topic', async () => {
      const a: unknown[] = []
      const b: unknown[] = []
      bus.subscribe('script.created', (e) => { a.push(e) })
      bus.subscribe('script.created', (e) => { b.push(e) })

      await bus.publish({ topic: 'script.created', source: 'storyforge', payload: {} })

      expect(a).toHaveLength(1)
      expect(b).toHaveLength(1)
    })

    it('returns an unsubscribe function that stops delivery', async () => {
      const received: unknown[] = []
      const unsub = bus.subscribe('agent.action', (e) => { received.push(e) })

      await bus.publish({ topic: 'agent.action', source: 'test', payload: {} })
      expect(received).toHaveLength(1)

      unsub()

      await bus.publish({ topic: 'agent.action', source: 'test', payload: {} })
      expect(received).toHaveLength(1) // still 1, second not delivered
    })

    it('replays history when fromBeginning option is set', async () => {
      // Publish before subscribing
      await bus.publish({ topic: 'module.registered', source: 'core', payload: { id: 'x' } })
      await bus.publish({ topic: 'module.registered', source: 'core', payload: { id: 'y' } })

      const received: unknown[] = []
      bus.subscribe('module.registered', (e) => { received.push(e) }, { fromBeginning: true })

      // Allow microtask to flush replay
      await new Promise<void>((res) => setTimeout(res, 0))

      expect(received.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ── history ──────────────────────────────────────────────────────────────

  describe('history()', () => {
    it('returns events for the given topic', async () => {
      await bus.publish({ topic: 'render.queued', source: 'test', payload: { ep: 1 } })
      await bus.publish({ topic: 'render.queued', source: 'test', payload: { ep: 2 } })
      await bus.publish({ topic: 'render.started', source: 'test', payload: {} })

      const h = await bus.history('render.queued')
      expect(h).toHaveLength(2)
    })

    it('returns empty array for unknown topic', async () => {
      const h = await bus.history('nonexistent.topic')
      expect(h).toEqual([])
    })

    it('filters by since timestamp', async () => {
      const before = new Date(Date.now() - 5000).toISOString()
      await bus.publish({ topic: 'workflow.completed', source: 's', payload: {} })

      const h = await bus.history('workflow.completed', { since: before })
      expect(h).toHaveLength(1)

      const future = new Date(Date.now() + 5000).toISOString()
      const h2 = await bus.history('workflow.completed', { since: future })
      expect(h2).toHaveLength(0)
    })
  })

  // ── replay ───────────────────────────────────────────────────────────────

  describe('replay()', () => {
    it('returns events matching a correlationId across topics', async () => {
      const correlationId = 'corr-abc-123'
      await bus.publish({ topic: 'render.queued', source: 's', payload: {}, correlationId })
      await bus.publish({ topic: 'render.started', source: 's', payload: {}, correlationId })
      await bus.publish({ topic: 'render.queued', source: 's', payload: {} }) // different corr

      const events = await bus.replay(correlationId)
      expect(events).toHaveLength(2)
      expect(events.every(e => e.correlationId === correlationId)).toBe(true)
    })
  })

  // ── stats ─────────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('tracks totalPublished and activeSubscribers', async () => {
      bus.subscribe('render.completed', () => {})
      bus.subscribe('render.completed', () => {})
      await bus.publish({ topic: 'render.completed', source: 's', payload: {} })

      const s = await bus.stats()
      expect(s.totalPublished).toBe(1)
      expect(s.totalDelivered).toBe(2)
      expect(s.activeSubscribers).toBe(2)
    })
  })
})
