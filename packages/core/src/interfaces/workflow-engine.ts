/**
 * WORKFLOW ENGINE — Frozen Interface
 * Multi-step pipeline orchestration. Defines how work moves through the system.
 * The render pipeline (script→images→TTS→FFmpeg→MP4) is one workflow.
 * Empire Assistant triggers workflows — it does not implement them.
 *
 * STABILITY STATUS: FROZEN — do not change without Josh approval.
 */

export type WorkflowStepType = 'action' | 'decision' | 'parallel' | 'wait' | 'human-approval'
export type WorkflowInstanceStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WorkflowStep {
  id: string
  type: WorkflowStepType
  name: string
  description?: string
  moduleId: string      // which module executes this step
  action: string        // action name within that module
  inputMapping?: Record<string, string>  // maps workflow vars → step input fields
  outputMapping?: Record<string, string> // maps step output fields → workflow vars
  onSuccess?: string    // next step ID (null = end)
  onFailure?: string    // step ID to run on error (null = fail workflow)
  retryPolicy?: RetryPolicy
  timeoutMs?: number
  // For type='decision'
  conditions?: WorkflowCondition[]
  // For type='parallel'
  branches?: string[][] // array of step ID sequences to run in parallel
  // For type='wait'
  waitForEvent?: string // TOPICS constant — resume when this event fires
  // For type='human-approval'
  approvers?: string[]  // user IDs who can approve
  approvalTimeoutMs?: number
}

export interface WorkflowCondition {
  variable: string      // workflow variable to check
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists'
  value?: unknown
  nextStepId: string    // jump to this step if condition is true
}

export interface RetryPolicy {
  maxAttempts: number
  backoffMs: number     // initial backoff
  backoffMultiplier?: number  // exponential factor (default: 2)
  maxBackoffMs?: number
}

export interface WorkflowTrigger {
  type: 'event' | 'schedule' | 'api' | 'manual'
  topic?: string        // for type='event'
  cron?: string         // for type='schedule'
  inputSchema?: Record<string, unknown>  // JSON Schema for API/manual triggers
}

export interface WorkflowDefinition {
  id: string            // unique: "render-episode", "upload-youtube"
  name: string
  version: string       // semver
  description: string
  steps: WorkflowStep[]
  initialStep: string   // step ID to start
  inputSchema?: Record<string, unknown>   // JSON Schema for workflow inputs
  outputSchema?: Record<string, unknown>  // JSON Schema for workflow outputs
  triggers?: WorkflowTrigger[]
  tags?: string[]
}

export interface WorkflowStepResult {
  stepId: string
  status: StepStatus
  output?: unknown
  error?: string
  startedAt: string
  completedAt?: string
  attempts: number
}

export interface WorkflowInstance {
  id: string            // UUID
  definitionId: string
  definitionVersion: string
  status: WorkflowInstanceStatus
  input: unknown
  output?: unknown
  variables: Record<string, unknown>  // runtime state
  currentStepId?: string
  stepResults: WorkflowStepResult[]
  triggeredBy: string   // module ID or 'system'
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  correlationId?: string
}

export interface WorkflowFilter {
  definitionId?: string
  status?: WorkflowInstanceStatus | WorkflowInstanceStatus[]
  triggeredBy?: string
  since?: string
  limit?: number
}

/**
 * WorkflowEngine: orchestrates multi-step pipelines across modules.
 * The render pipeline, upload pipeline, script pipeline all run here.
 * Empire Assistant starts workflows; it doesn't define pipeline logic.
 */
export interface WorkflowEngine {
  define(workflow: WorkflowDefinition): Promise<void>
  undefine(workflowId: string): Promise<void>
  definitions(): Promise<WorkflowDefinition[]>
  start(workflowId: string, input: unknown, options?: StartOptions): Promise<WorkflowInstance>
  status(instanceId: string): Promise<WorkflowInstance>
  cancel(instanceId: string, reason?: string): Promise<void>
  pause(instanceId: string): Promise<void>
  resume(instanceId: string, input?: unknown): Promise<void>
  list(filter?: WorkflowFilter): Promise<WorkflowInstance[]>
  approve(instanceId: string, stepId: string, approverId: string): Promise<void>
  reject(instanceId: string, stepId: string, approverId: string, reason: string): Promise<void>
}

export interface StartOptions {
  correlationId?: string
  dryRun?: boolean    // validate without executing
  priority?: 'low' | 'normal' | 'high'
}
