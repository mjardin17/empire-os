/**
 * RemoteAppModule: an Empire OS module for an app running as its own process.
 * Uses a real local HTTP server as the "app", and a closed port for the offline case.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { bootstrap, _resetBootstrap } from '../bootstrap.js'
import { RemoteAppModule, resolveBaseUrl } from '../modules/remote-app.module.js'
import type { RemoteAppOptions } from '../modules/remote-app.module.js'

interface Seen { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }
let server: http.Server
let appUrl = ''
const seen: Seen[] = []
let healthBody: unknown = { status: 'healthy', details: { module: 'demo' } }
let healthStatus = 200

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
      const json = (status: number, b: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)) }
      if (req.url === '/empire/health') return json(healthStatus, healthBody)
      if (req.url === '/empire/items/add') return json(201, { ok: true })
      if (req.url?.startsWith('/empire/items')) return json(200, { ok: true, url: req.url })
      if (req.url === '/empire/event') return json(202, { accepted: true })
      json(404, { error: 'nope' })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  appUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))
beforeEach(() => { seen.length = 0; healthBody = { status: 'healthy', details: { module: 'demo' } }; healthStatus = 200; _resetBootstrap() })
afterEach(() => _resetBootstrap())

function options(env: Record<string, string | undefined>, extra: Partial<RemoteAppOptions> = {}): RemoteAppOptions {
  return {
    moduleId: 'demo',
    name: 'Demo App',
    version: '1.0.0',
    description: 'test app',
    baseUrlEnv: 'DEMO_BASE_URL',
    defaultBaseUrl: 'http://127.0.0.1:1',
    capabilities: ['demo-list'],
    endpoints: [
      { path: '/empire/health', method: 'GET', description: 'health', auth: false },
      { path: '/empire/items', method: 'GET', description: 'list' },
      { path: '/empire/items/{id}', method: 'GET', description: 'one' },
      { path: '/empire/items/add', method: 'POST', description: 'add' },
    ],
    forwardTopics: ['system.alert'],
    authHeaders: () => ({ 'x-empire-key': 'k1' }),
    env,
    ...extra,
  }
}

async function makeModule(env: Record<string, string | undefined>, extra?: Partial<RemoteAppOptions>) {
  const mod = new RemoteAppModule(options(env, extra))
  const services = await bootstrap()
  await mod.init(services, {})
  return { mod, services }
}

describe('resolveBaseUrl', () => {
  it('uses the env var, falls back to the default, trims trailing slashes', () => {
    expect(resolveBaseUrl({ X: 'http://a:1/' }, 'X', 'http://d:2')).toBe('http://a:1')
    expect(resolveBaseUrl({ X: '  ' }, 'X', 'http://d:2/')).toBe('http://d:2')
    expect(resolveBaseUrl({}, 'X', 'http://d:2')).toBe('http://d:2')
  })
})

describe('RemoteAppModule', () => {
  it('registers with the Module Gateway using the env URL', async () => {
    const { mod, services } = await makeModule({ DEMO_BASE_URL: appUrl })
    const list = await services.moduleGateway.list()
    const d = list.find((m) => m.id === 'demo')
    expect(d?.baseUrl).toBe(appUrl)
    expect(d?.capabilities).toContain('demo-list')
    expect(mod.baseUrl).toBe(appUrl)
  })

  it('health: healthy when the app says so, with the app body and URL', async () => {
    const { mod } = await makeModule({ DEMO_BASE_URL: appUrl })
    const h = await mod.health()
    expect(h.status).toBe('healthy')
    expect(h.details?.url).toBe(appUrl)
    expect((h.details?.app as any).details.module).toBe('demo')
    expect(seen[seen.length - 1].headers['x-empire-key']).toBe('k1')
  })

  it('health: passes on "degraded" from the app; an HTTP error is degraded with a reason', async () => {
    const { mod } = await makeModule({ DEMO_BASE_URL: appUrl })
    healthBody = { status: 'degraded', details: { problems: ['key not set'] } }
    expect((await mod.health()).status).toBe('degraded')
    healthStatus = 404
    const h = await mod.health()
    expect(h.status).toBe('degraded')
    expect(h.details?.httpStatus).toBe(404)
    expect(String(h.details?.reason)).toMatch(/Demo App answered HTTP 404/)
  })

  it('health: unhealthy with a readable reason when the app is not running', async () => {
    const { mod } = await makeModule({})
    const h = await mod.health()
    expect(h.status).toBe('unhealthy')
    expect(h.details?.reason).toBe('Demo App is not reachable at http://127.0.0.1:1')
  })

  it('proxies declared routes with the query string and auth header, and drops caller auth headers', async () => {
    const { mod } = await makeModule({ DEMO_BASE_URL: appUrl })
    const res = await mod.handleRequest({
      path: '/empire/items?limit=5', method: 'GET',
      headers: { 'x-correlation-id': 'c-1', authorization: 'Bearer caller', 'x-empire-key': 'caller-key', host: 'evil' },
    })
    expect(res.status).toBe(200)
    expect(res.moduleId).toBe('demo')
    expect((res.body as any).url).toBe('/empire/items?limit=5')
    const h = seen[0].headers
    expect(h['x-empire-key']).toBe('k1')
    expect(h['x-correlation-id']).toBe('c-1')
    expect(h.authorization).toBeUndefined()
    expect(h.host).not.toBe('evil')
  })

  it('{id} templates match one path segment', async () => {
    const { mod } = await makeModule({ DEMO_BASE_URL: appUrl })
    expect(mod.allows('GET', '/empire/items/abc')).toBe(true)
    expect(mod.allows('GET', '/empire/items/abc/def')).toBe(false)
    expect(mod.allows('POST', '/empire/items')).toBe(false)
  })

  it('undeclared routes answer 404 without calling the app (unless restrictToEndpoints is false)', async () => {
    const { mod } = await makeModule({ DEMO_BASE_URL: appUrl })
    const res = await mod.handleRequest({ path: '/api/admin/delete-everything', method: 'POST', body: {} })
    expect(res.status).toBe(404)
    expect(seen).toHaveLength(0)
    _resetBootstrap()
    const open = await makeModule({ DEMO_BASE_URL: appUrl }, { restrictToEndpoints: false })
    expect((await open.mod.handleRequest({ path: '/anything', method: 'GET' })).status).toBe(404) // the app's own 404
    expect(seen).toHaveLength(1)
  })

  it('POST bodies are sent as JSON', async () => {
    const { mod } = await makeModule({ DEMO_BASE_URL: appUrl })
    const res = await mod.handleRequest({ path: '/empire/items/add', method: 'POST', body: { title: 'Lamp', dryRun: true } })
    expect(res.status).toBe(201)
    expect(JSON.parse(seen[0].body)).toEqual({ title: 'Lamp', dryRun: true })
    expect(seen[0].headers['content-type']).toBe('application/json')
  })

  it('app offline: proxied calls answer 502 with the URL', async () => {
    const { mod } = await makeModule({})
    const res = await mod.handleRequest({ path: '/empire/items', method: 'GET', timeoutMs: 2000 })
    expect(res.status).toBe(502)
    expect(res.body).toMatchObject({ error: 'Demo App service unavailable', url: 'http://127.0.0.1:1' })
  })

  it('forwards subscribed Empire OS events to the app', async () => {
    const { services } = await makeModule({ DEMO_BASE_URL: appUrl })
    await services.eventBus.publish({ topic: 'system.alert', source: 'test', payload: { msg: 'hi' } })
    for (let i = 0; i < 50 && !seen.some((s) => s.url === '/empire/event'); i++) await new Promise((r) => setTimeout(r, 20))
    const ev = seen.find((s) => s.url === '/empire/event')
    expect(ev).toBeDefined()
    expect(JSON.parse(ev!.body)).toMatchObject({ topic: 'system.alert', source: 'test', payload: { msg: 'hi' } })
    expect(ev!.headers['x-empire-key']).toBe('k1')
  })
})
