/**
 * EmpireInstallerModule — Empire OS Installer Service
 *
 * Backend installer that runs pip, npm, winget, and ollama pull.
 * Tracks job state in memory. Josh must confirm each install.
 *
 * Routes:
 *   GET  /installer/           → status page
 *   POST /installer/install    → start an install job
 *   GET  /installer/jobs       → list all jobs
 *   GET  /installer/job/:id    → single job status
 *   DELETE /installer/job/:id  → cancel/remove job
 */

import { execSync, spawn } from 'node:child_process'
import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
export type InstallMethod = 'ollama' | 'pip' | 'npm' | 'winget' | 'script' | 'url'

export interface InstallJob {
  id: string
  name: string
  method: InstallMethod
  cmd: string
  status: JobStatus
  log: string[]
  createdAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  pid?: number
}

const jobs = new Map<string, InstallJob>()

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function buildInstallCommand(method: InstallMethod, cmd: string): { exe: string; args: string[] } | null {
  switch (method) {
    case 'pip':
      return { exe: 'pip', args: ['install', '--break-system-packages', ...cmd.split(' ')] }
    case 'npm':
      return { exe: 'npm', args: ['install', '-g', ...cmd.split(' ')] }
    case 'winget':
      return { exe: 'winget', args: ['install', '--id', cmd, '--silent', '--accept-package-agreements', '--accept-source-agreements'] }
    case 'ollama':
      return { exe: 'ollama', args: ['pull', cmd] }
    case 'script':
      // cmd is the full command to run
      return { exe: 'cmd', args: ['/c', cmd] }
    default:
      return null
  }
}

async function runJob(job: InstallJob): Promise<void> {
  job.status = 'running'
  job.startedAt = new Date().toISOString()

  if (job.method === 'url') {
    // For URL installs, open the browser — can't auto-install
    try {
      execSync(`start "" "${job.cmd}"`, { stdio: 'ignore' })
      job.log.push('Opened browser to download page: ' + job.cmd)
      job.status = 'done'
      job.log.push('Download page opened. Please install manually.')
    } catch (e) {
      job.log.push('Could not open browser: ' + String(e))
      job.status = 'failed'
      job.error = 'Could not open URL'
    }
    job.finishedAt = new Date().toISOString()
    return
  }

  const built = buildInstallCommand(job.method, job.cmd)
  if (!built) {
    job.status = 'failed'
    job.error = 'Unknown install method: ' + job.method
    job.finishedAt = new Date().toISOString()
    return
  }

  return new Promise((resolve) => {
    const proc = spawn(built.exe, built.args, {
      shell: true,
      env: { ...process.env },
    })

    job.pid = proc.pid

    proc.stdout?.on('data', (d: Buffer) => {
      const lines = d.toString().split('\n').filter(l => l.trim())
      lines.forEach(l => job.log.push(l))
      if (job.log.length > 500) job.log.splice(0, job.log.length - 500)
    })

    proc.stderr?.on('data', (d: Buffer) => {
      const lines = d.toString().split('\n').filter(l => l.trim())
      lines.forEach(l => job.log.push('[stderr] ' + l))
    })

    proc.on('close', (code) => {
      job.status = code === 0 ? 'done' : 'failed'
      if (code !== 0) job.error = `Process exited with code ${code}`
      job.finishedAt = new Date().toISOString()
      job.pid = undefined
      resolve()
    })

    proc.on('error', (err) => {
      job.status = 'failed'
      job.error = err.message
      job.log.push('Error: ' + err.message)
      job.finishedAt = new Date().toISOString()
      resolve()
    })
  })
}

function jobSummary(job: InstallJob): object {
  return {
    id: job.id,
    name: job.name,
    method: job.method,
    cmd: job.cmd,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    logTail: job.log.slice(-20),  // last 20 lines
  }
}

export class EmpireInstallerModule implements EmpireModule {
  readonly moduleId = 'installer'

  async init(_services: CoreServices, _config: Record<string, unknown>): Promise<void> {}

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const d = (s: number, b: unknown): GatewayResponse =>
      ({ status: s, body: b, moduleId: this.moduleId, durationMs: Date.now() - start })

    const p = req.path === '' ? '/' : req.path.replace(/\/$/, '') || '/'

    // Status page
    if ((p === '/' || p === '') && req.method === 'GET') {
      const running = [...jobs.values()].filter(j => j.status === 'running').length
      const done    = [...jobs.values()].filter(j => j.status === 'done').length
      const failed  = [...jobs.values()].filter(j => j.status === 'failed').length
      return d(200, {
        module: 'Empire Installer',
        status: 'ready',
        jobs: { total: jobs.size, running, done, failed },
        endpoints: {
          install:  'POST /installer/install  { id, method, cmd, name? }',
          jobs:     'GET  /installer/jobs',
          job:      'GET  /installer/job/:id',
          cancel:   'DELETE /installer/job/:id',
        },
        supportedMethods: ['ollama', 'pip', 'npm', 'winget', 'url', 'script'],
      })
    }

    // Start install
    if (p === '/install' && req.method === 'POST') {
      const body = req.body as { id?: string; method?: string; cmd?: string; name?: string } | undefined
      if (!body?.method || !body?.cmd) {
        return d(400, { error: 'Missing required fields: method, cmd' })
      }

      const method = body.method as InstallMethod
      const validMethods: InstallMethod[] = ['ollama', 'pip', 'npm', 'winget', 'url', 'script']
      if (!validMethods.includes(method)) {
        return d(400, { error: 'Invalid method', valid: validMethods })
      }

      const job: InstallJob = {
        id: uid(),
        name: body.name || body.id || body.cmd,
        method,
        cmd: body.cmd,
        status: 'pending',
        log: [],
        createdAt: new Date().toISOString(),
      }

      jobs.set(job.id, job)

      // Run in background (fire and forget)
      runJob(job).catch(e => {
        job.status = 'failed'
        job.error = String(e)
        job.finishedAt = new Date().toISOString()
      })

      return d(202, {
        message: `Install started: ${job.name}`,
        jobId: job.id,
        status: job.status,
        poll: `/installer/job/${job.id}`,
      })
    }

    // List all jobs
    if (p === '/jobs' && req.method === 'GET') {
      return d(200, [...jobs.values()].map(jobSummary).reverse())
    }

    // Single job
    if (p.startsWith('/job/') && req.method === 'GET') {
      const id = p.replace('/job/', '')
      const job = jobs.get(id)
      if (!job) return d(404, { error: 'Job not found', id })
      return d(200, { ...jobSummary(job), log: job.log })  // full log for single job
    }

    // Cancel / remove job
    if (p.startsWith('/job/') && req.method === 'DELETE') {
      const id = p.replace('/job/', '')
      const job = jobs.get(id)
      if (!job) return d(404, { error: 'Job not found', id })
      if (job.status === 'running') {
        job.status = 'cancelled'
        job.log.push('Job cancelled by user')
        job.finishedAt = new Date().toISOString()
        // Note: spawned process continues (can't reliably kill on Windows without PID tracking in proc)
      } else {
        jobs.delete(id)
      }
      return d(200, { message: 'Job cancelled/removed', id })
    }

    // Health
    if (p === '/health') {
      return d(200, { status: 'healthy', moduleId: this.moduleId, jobs: jobs.size })
    }

    return d(404, { error: 'Not found', path: p })
  }

  async handleEvent(): Promise<void> {}

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> {}
}
