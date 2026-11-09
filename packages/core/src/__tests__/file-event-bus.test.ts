import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FileEventBus } from '../implementations/file-event-bus.impl.js'

describe('FileEventBus persistence', () => {
  it('publish rejects when the event cannot be written, and nothing is counted as published', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feb-'))
    const blocker = path.join(dir, 'not-a-directory')
    fs.writeFileSync(blocker, 'x')                       // the data dir is a file, so the log cannot be created
    const bus = new FileEventBus(blocker)
    await expect(bus.publish({ topic: 'a.b', source: 'test', payload: {} } as never)).rejects.toThrow(/not persisted/)
    const stats = await bus.stats()
    expect(stats.totalPublished).toBe(0)
  })

  it('a published event is still there after a restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feb-'))
    const first = new FileEventBus(dir)
    await first.publish({ topic: 'render.done', source: 'test', payload: { ok: true } } as never)
    const second = new FileEventBus(dir)
    const history = await second.history('render.done')
    expect(history.length).toBe(1)
  })
})
