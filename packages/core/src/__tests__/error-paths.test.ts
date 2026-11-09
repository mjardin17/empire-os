import { describe, it, expect, vi } from 'vitest'
import { InProcessEventBus } from '../implementations/event-bus.impl.js'
import { InMemoryMemoryBus } from '../implementations/memory-bus.impl.js'

describe('EventBus error paths', () => {
  it('a subscriber that throws does not stop publish or the other subscribers', async () => {
    const bus = new InProcessEventBus()
    const healthy = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bus.subscribe('job.failed', () => { throw new Error('subscriber boom') })
    bus.subscribe('job.failed', healthy)
    const event = await bus.publish({ topic: 'job.failed', source: 'test', payload: {} })
    await new Promise(r => setTimeout(r, 0))
    expect(event.id).toBeTruthy()
    expect(healthy).toHaveBeenCalledTimes(1)
  })

  it('a subscriber that rejects is contained and the event is still in history', async () => {
    const bus = new InProcessEventBus()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bus.subscribe('job.rejected', () => Promise.reject(new Error('async boom')))
    await bus.publish({ topic: 'job.rejected', source: 'test', payload: {} })
    await new Promise(r => setTimeout(r, 0))
    const history = await bus.history('job.rejected')
    expect(history.length).toBe(1)
  })
})

describe('MemoryBus error paths', () => {
  it('reading a key that was never written returns nothing instead of throwing', async () => {
    const bus = new InMemoryMemoryBus()
    const value = await bus.read('never-written', 'global')
    expect(value ?? null).toBeNull()
  })

  it('a subscriber that throws does not stop the write or other subscribers', async () => {
    const bus = new InMemoryMemoryBus()
    const healthy = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bus.subscribe('cfg.*', () => { throw new Error('subscriber boom') })
    bus.subscribe('cfg.*', healthy)
    await bus.write('cfg.mode', 'fast', { scope: 'global' })
    await new Promise(r => setTimeout(r, 0))
    expect(await bus.read('cfg.mode', 'global')).toBeTruthy()
    expect(healthy).toHaveBeenCalled()
  })
})
