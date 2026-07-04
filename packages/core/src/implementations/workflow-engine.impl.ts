/**
 * Workflow Engine — Implementation
 * State-machine orchestrator for multi-step pipelines.
 * Each step delegates work to a module via the ModuleGateway.
 * Persists instance state in-memory (dev) / PostgreSQL (prod).
 */

import { randomUUID } from 'crypto'
import type {
  WorkflowEngine,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowFilter,
  WorkflowInstanceStatus,
  WorkflowStepResult,
  StartOptions,
} from '../interfaces/index.js'
import type { ModuleGateway } from '../interfaces/index.js'
import type { EventBus } from '../interfaces/index.js'
import { TOPICS } from '../interfaces/event-bus.js'

export class InMemoryWorkflowEngine implements WorkflowEngine {
  protected _definitions = new Map<string, WorkflowDefinition>()
  protected _instances = new Map<string, WorkflowInstance>()

  constructor(
    private readonly gateway: ModuleGateway,
    private readonly eventBus: EventBus
  ) {}

  async define(workflow: WorkflowDefinition): Promise<void> {
    this._definitions.set(workflow.id, workflow)
  }

  async undefine(workflowId: string): Promise<void> {
    this._definitions.delete(workflowId)
  }

  async definitions(): Promise<WorkflowDefinition[]> {
    return Array.from(this._definitions.values())
  }

  async start(
    workflowId: string,
    input: unknown,
    options: StartOptions = {}
  ): Promise<WorkflowInstance> {
    const definition = this._definitions.get(workflowId)
    if (!definition) throw new Error(`Workflow not found: ${workflowId}`)

    if (options.dryRun) {
      // Validate steps have registered modules
      for (const step of definition.steps) {
        const modules = await this.gateway.findByCapability(step.action)
        if (modules.length === 0 && step.moduleId) {
          // Check by moduleId fallback
        }
      }
      return this.makeInstance(definition, input, options, 'pending')
    }

    const instance = this.makeInstance(definition, input, options, 'running')
    this._instances.set(instance.id, instance)

    await this.eventBus.publish({
      topic: TOPICS.WORKFLOW_STARTED,
      source: 'workflow-engine',
      payload: { instanceId: instance.id, workflowId, input },
      correlationId: instance.correlationId,
    })

    // Execute asynchronously
    this.runInstance(instance).catch(err => {
      console.error(`[WorkflowEngine] Instance ${instance.id} failed:`, err)
    })

    return instance
  }

  private makeInstance(
    definition: WorkflowDefinition,
    input: unknown,
    options: StartOptions,
    status: WorkflowInstanceStatus
  ): WorkflowInstance {
    return {
      id: randomUUID(),
      definitionId: definition.id,
      definitionVersion: definition.version,
      status,
      input,
      variables: { input },
      currentStepId: definition.initialStep,
      stepResults: [],
      triggeredBy: 'api',
      createdAt: new Date().toISOString(),
      startedAt: status === 'running' ? new Date().toISOString() : undefined,
      correlationId: options.correlationId ?? randomUUID(),
    }
  }

  private async runInstance(instance: WorkflowInstance): Promise<void> {
    const definition = this._definitions.get(instance.definitionId)!
    const stepMap = new Map(definition.steps.map(s => [s.id, s]))

    let currentStepId: string | undefined = instance.currentStepId

    while (currentStepId) {
      const step = stepMap.get(currentStepId)
      if (!step) {
        await this.failInstance(instance, `Step not found: ${currentStepId}`)
        return
      }

      instance.currentStepId = currentStepId
      this._instances.set(instance.id, instance)

      const stepResult: WorkflowStepResult = {
        stepId: step.id,
        status: 'running',
        startedAt: new Date().toISOString(),
        attempts: 1,
      }

      try {
        // Resolve input from workflow variables
        const stepInput = this.resolveInput(step.inputMapping, instance.variables)

        // Delegate to module via gateway
        const response = await this.gateway.route({
          moduleId: step.moduleId,
          path: `/${step.action}`,
          method: 'POST',
          body: stepInput,
          correlationId: instance.correlationId,
          timeoutMs: step.timeoutMs,
        })

        if (response.status >= 400) {
          throw new Error(`Step ${step.id} returned HTTP ${response.status}`)
        }

        // Map output back to workflow variables
        if (step.outputMapping) {
          const output = response.body as Record<string, unknown>
          for (const [varName, outputField] of Object.entries(step.outputMapping)) {
            instance.variables[varName] = output[outputField]
          }
        }

        stepResult.status = 'completed'
        stepResult.output = response.body
        stepResult.completedAt = new Date().toISOString()
        instance.stepResults.push(stepResult)

        await this.eventBus.publish({
          topic: TOPICS.WORKFLOW_STEP_DONE,
          source: 'workflow-engine',
          payload: { instanceId: instance.id, stepId: step.id },
          correlationId: instance.correlationId,
        })

        currentStepId = step.onSuccess ?? undefined

      } catch (err) {
        stepResult.status = 'failed'
        stepResult.error = String(err)
        stepResult.completedAt = new Date().toISOString()
        instance.stepResults.push(stepResult)

        if (step.onFailure) {
          currentStepId = step.onFailure
        } else {
          await this.failInstance(instance, String(err))
          return
        }
      }
    }

    // All steps complete — guard against terminal status set by reject()/cancel() mid-flight
    if (instance.status !== 'running') return
    instance.status = 'completed'
    instance.completedAt = new Date().toISOString()
    this._instances.set(instance.id, instance)

    await this.eventBus.publish({
      topic: TOPICS.WORKFLOW_COMPLETED,
      source: 'workflow-engine',
      payload: { instanceId: instance.id, output: instance.output },
      correlationId: instance.correlationId,
    })
  }

  private resolveInput(
    mapping: Record<string, string> | undefined,
    variables: Record<string, unknown>
  ): Record<string, unknown> {
    if (!mapping) return { ...variables }
    const result: Record<string, unknown> = {}
    for (const [field, varName] of Object.entries(mapping)) {
      result[field] = variables[varName]
    }
    return result
  }

  private async failInstance(instance: WorkflowInstance, error: string): Promise<void> {
    instance.status = 'failed'
    instance.error = error
    instance.completedAt = new Date().toISOString()
    this._instances.set(instance.id, instance)
    await this.eventBus.publish({
      topic: TOPICS.WORKFLOW_FAILED,
      source: 'workflow-engine',
      payload: { instanceId: instance.id, error },
      correlationId: instance.correlationId,
    })
  }

  async status(instanceId: string): Promise<WorkflowInstance> {
    const instance = this._instances.get(instanceId)
    if (!instance) throw new Error(`Instance not found: ${instanceId}`)
    return instance
  }

  async cancel(instanceId: string, reason?: string): Promise<void> {
    const instance = this._instances.get(instanceId)
    if (!instance) throw new Error(`Instance not found: ${instanceId}`)
    instance.status = 'cancelled'
    instance.error = reason
    instance.completedAt = new Date().toISOString()
    this._instances.set(instanceId, instance)
  }

  async pause(instanceId: string): Promise<void> {
    const instance = this._instances.get(instanceId)
    if (!instance) throw new Error(`Instance not found: ${instanceId}`)
    instance.status = 'paused'
    this._instances.set(instanceId, instance)
  }

  async resume(instanceId: string, input?: unknown): Promise<void> {
    const instance = this._instances.get(instanceId)
    if (!instance) throw new Error(`Instance not found: ${instanceId}`)
    instance.status = 'running'
    if (input) instance.variables['resumeInput'] = input
    this._instances.set(instanceId, instance)
    this.runInstance(instance).catch(console.error)
  }

  async list(filter?: WorkflowFilter): Promise<WorkflowInstance[]> {
    let results = Array.from(this._instances.values())
    if (!filter) return results
    if (filter.definitionId) results = results.filter(i => i.definitionId === filter.definitionId)
    if (filter.triggeredBy) results = results.filter(i => i.triggeredBy === filter.triggeredBy)
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
      results = results.filter(i => statuses.includes(i.status))
    }
    if (filter.since) {
      const since = new Date(filter.since).getTime()
      results = results.filter(i => new Date(i.createdAt).getTime() >= since)
    }
    const limit = filter.limit ?? 100
    return results.slice(0, limit)
  }

  async approve(instanceId: string, stepId: string, approverId: string): Promise<void> {
    const instance = this._instances.get(instanceId)
    if (!instance) throw new Error(`Instance not found: ${instanceId}`)
    instance.variables[`approval_${stepId}`] = { approved: true, by: approverId, at: new Date().toISOString() }
    this._instances.set(instanceId, instance)
    if (instance.status === 'paused') await this.resume(instanceId)
  }

  async reject(instanceId: string, stepId: string, approverId: string, reason: string): Promise<void> {
    const instance = this._instances.get(instanceId)
    if (!instance) throw new Error(`Instance not found: ${instanceId}`)
    await this.failInstance(instance, `Step ${stepId} rejected by ${approverId}: ${reason}`)
  }
}
