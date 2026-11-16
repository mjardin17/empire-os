import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HttpModuleGateway } from '../implementations/module-gateway.impl.js'
import type { ModuleDescriptor } from '../interfaces/index.js'

let server: Server
let baseUrl: string

beforeAll(async () => {
  vi.unstubAllGlobals()
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/echo-key') {
      res.end(JSON.stringify({ key: req.headers['x-empire-api-key'] ?? null }))
      return
    }
    if (req.url === '/echo-source') {
      res.end(JSON.stringify({ source: req.headers['x-source-module'], correlation: req.headers['x-correlation-id'] ? 'set' : 'missing' }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

const descriptor = (): ModuleDescriptor => ({
  id: 'real-http-module', name: 'Real HTTP module', version: '1.0.0', description: 'test module served by node:http',
  capabilities: ['echo'], endpoints: [], healthPath: '/health', baseUrl, priority: 0,
})

describe('ModuleGateway against a real HTTP endpoint', () => {
  it('routes a request to the module over the network and returns its body', async () => {
    const gw = new HttpModuleGateway()
    await gw.register(descriptor())
    const res = await gw.route({ moduleId: 'real-http-module', path: '/echo-source', method: 'GET' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ source: 'empire-os-gateway', correlation: 'set' })
  })

  it('returns the module status for an unknown path without throwing', async () => {
    const gw = new HttpModuleGateway()
    await gw.register(descriptor())
    const res = await gw.route({ moduleId: 'real-http-module', path: '/missing', method: 'GET' })
    expect(res.status).toBe(404)
  })

  it('sends selfHeaders (the Empire key) only to modules on this server', async () => {
    const gw = new HttpModuleGateway({ selfBaseUrl: baseUrl, selfHeaders: { 'X-Empire-Api-Key': 'k-self' } })
    await gw.register(descriptor())
    await gw.register({ ...descriptor(), id: 'elsewhere', baseUrl: baseUrl.replace('127.0.0.1', 'localhost') })
    const own = await gw.route({ moduleId: 'real-http-module', path: '/echo-key', method: 'GET' })
    expect(own.body).toEqual({ key: 'k-self' })
    const other = await gw.route({ moduleId: 'elsewhere', path: '/echo-key', method: 'GET' })
    expect(other.body).toEqual({ key: null })
  })

  it('sends no key without the option', async () => {
    const gw = new HttpModuleGateway()
    await gw.register(descriptor())
    const res = await gw.route({ moduleId: 'real-http-module', path: '/echo-key', method: 'GET' })
    expect(res.body).toEqual({ key: null })
  })
})
