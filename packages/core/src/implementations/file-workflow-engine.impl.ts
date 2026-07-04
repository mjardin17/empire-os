/**
 * File-backed Workflow Engine
 * Extends InMemoryWorkflowEngine, persisting definitions and instances to JSON.
 * On startup, loads saved state so in-flight workflows survive server restarts.
 *
 * Data file: <dataDir>/workflow-state.json
 * Writes are atomic (temp file + rename) to prevent corruption.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { WorkflowDefinition, WorkflowInstance, WorkflowFilter, StartOptions } from '../interfaces/index.js'
import type { ModuleGateway, EventBus } from '../interfaces/index.js'
import { InMemoryWorkflowEngine } from './workflow-engine.impl.js'

interface WorkflowStateFile {
  definitions: WorkflowDefinition[]
  instances: WorkflowInstance[]
  savedAt: string
}

export class FileWorkflowEngine extends InMemoryWorkflowEngine {
  private readonly filePath: string

  constructor(gateway: ModuleGateway, eventBus: EventBus, dataDir: string) {
    super(gateway, eventBus)
    this.filePath = path.join(dataDir, 'workflow-state.json')
    this.load()
  }

  // ── persistence ────────────────────────────────────────────────────────────

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const data = JSON.parse(raw) as WorkflowStateFile

      for (const def of data.definitions ?? []) {
        this._definitions.set(def.id, def)
      }
      for (const inst of data.instances ?? []) {
        // Only restore non-terminal instances that were active
        // 'running' instances become 'paused' after restart (can't resume mid-step)
        if (inst.status === 'running') {
          inst.status = 'paused'
          inst.error = 'Server restarted mid-execution — instance paused. Resume manually.'
        }
        this._instances.set(inst.id, inst)
      }
    } catch {
      process.stderr.write('[FileWorkflowEngine] Warning: could not load workflow-state.json — starting fresh\n')
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      const data: WorkflowStateFile = {
        definitions: Array.from(this._definitions.values()),
        instances: Array.from(this._instances.values()),
        savedAt: new Date().toISOString(),
      }

      const tmp = this.filePath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
      fs.renameSync(tmp, this.filePath)
    } catch (e) {
      process.stderr.write(`[FileWorkflowEngine] Warning: persist failed: ${e}\n`)
    }
  }

  // ── overrides ──────────────────────────────────────────────────────────────

  override async define(workflow: WorkflowDefinition): Promise<void> {
    await super.define(workflow)
    this.persist()
  }

  override async undefine(workflowId: string): Promise<void> {
    await super.undefine(workflowId)
    this.persist()
  }

  override async start(
    workflowId: string,
    input: unknown,
    options: StartOptions = {}
  ): Promise<WorkflowInstance> {
    const instance = await super.start(workflowId, input, options)
    this.persist()
    return instance
  }

  override async cancel(instanceId: string, reason?: string): Promise<void> {
    await super.cancel(instanceId, reason)
    this.persist()
  }

  override async pause(instanceId: string): Promise<void> {
    await super.pause(instanceId)
    this.persist()
  }

  override async resume(instanceId: string, input?: unknown): Promise<void> {
    await super.resume(instanceId, input)
    this.persist()
  }

  override async approve(
    instanceId: string,
    stepId: string,
    approverId: string
  ): Promise<void> {
    await super.approve(instanceId, stepId, approverId)
    this.persist()
  }

  override async reject(
    instanceId: string,
    stepId: string,
    approverId: string,
    reason: string
  ): Promise<void> {
    await super.reject(instanceId, stepId, approverId, reason)
    this.persist()
  }
}
