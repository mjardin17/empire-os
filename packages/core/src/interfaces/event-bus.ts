/**
 * EVENT BUS — Frozen Interface
 * Pub/sub backbone. Modules talk to each other through events.
 * No module imports another module directly — only events.
 *
 * STABILITY STATUS: FROZEN — do not change without Josh approval.
 */

export interface DomainEvent {
  id: string            // UUID v4
  topic: string         // "render.started", "script.completed", "episode.uploaded"
  source: string        // module ID that emitted this
  payload: unknown
  timestamp: string     // ISO 8601
  correlationId?: string  // trace a chain of events
  causationId?: string    // ID of the event that caused this one
  version?: number        // schema version of payload (default: 1)
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>

export interface EventFilter {
  sourceModuleId?: string
  correlationId?: string
  payloadMatch?: Record<string, unknown>  // shallow match on payload fields
}

export interface SubscribeOptions {
  filter?: EventFilter
  fromBeginning?: boolean   // replay history on subscribe (default: false)
  groupId?: string          // consumer group — only one member gets each event
}

export interface HistoryOptions {
  since?: string    // ISO 8601
  until?: string    // ISO 8601
  limit?: number
  sourceModuleId?: string
}

export interface EventBusStats {
  totalPublished: number
  totalDelivered: number
  activeSubscribers: number
  topicCounts: Record<string, number>
  pendingRetries: number
}

/**
 * Well-known topics — modules MUST use these string constants.
 * Adding a new topic requires updating this list and AGENT_MEMORY.md.
 */
export const TOPICS = {
  // Render pipeline
  RENDER_QUEUED:      'render.queued',
  RENDER_STARTED:     'render.started',
  RENDER_COMPLETED:   'render.completed',
  RENDER_FAILED:      'render.failed',
  // Script / Episode
  SCRIPT_CREATED:     'script.created',
  EPISODE_UPLOADED:   'episode.uploaded',
  // Agent activity
  AGENT_ACTION:       'agent.action',
  AGENT_ERROR:        'agent.error',
  // Workflow
  WORKFLOW_STARTED:   'workflow.started',
  WORKFLOW_STEP_DONE: 'workflow.step.completed',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED:    'workflow.failed',
  // Module lifecycle
  MODULE_REGISTERED:  'module.registered',
  MODULE_HEALTH_CHANGED: 'module.health.changed',
  // System
  SYSTEM_ALERT:       'system.alert',
} as const

export type KnownTopic = typeof TOPICS[keyof typeof TOPICS]

/**
 * EventBus: the nervous system of Empire OS.
 * All cross-module communication happens here.
 * Backed by Redis pub/sub (ephemeral) + PostgreSQL EventLog (durable).
 */
export interface EventBus {
  publish(event: Omit<DomainEvent, 'id' | 'timestamp'>): Promise<DomainEvent>
  subscribe(topic: string, handler: EventHandler, options?: SubscribeOptions): Unsubscribe
  history(topic: string, options?: HistoryOptions): Promise<DomainEvent[]>
  stats(): Promise<EventBusStats>
  replay(correlationId: string): Promise<DomainEvent[]>
}

export type Unsubscribe = () => void
