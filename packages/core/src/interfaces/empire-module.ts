/**
 * EMPIRE MODULE CONTRACT — Frozen Interface
 * Every module in Empire OS — including Empire Assistant — implements this.
 * The platform injects CoreServices at init time. Modules never own these services.
 *
 * Empire Assistant is a MODULE, not a core service.
 * It CONSUMES CoreServices. It does NOT own memory, AI routing, or orchestration.
 *
 * STABILITY STATUS: FROZEN — do not change without Josh approval.
 */

import type { MemoryBus } from './memory-bus.js'
import type { ModuleGateway, GatewayRequest, GatewayResponse } from './module-gateway.js'
import type { AIRouter } from './ai-router.js'
import type { EventBus, DomainEvent } from './event-bus.js'
import type { WorkflowEngine } from './workflow-engine.js'
import type { PluginRegistry } from './plugin-registry.js'

/**
 * CoreServices: injected by the platform into every module at startup.
 * A module that needs memory calls this.memoryBus.read().
 * A module that needs AI calls this.aiRouter.complete().
 * No module constructs these directly.
 */
export interface CoreServices {
  memoryBus: MemoryBus
  moduleGateway: ModuleGateway
  aiRouter: AIRouter
  eventBus: EventBus
  workflowEngine: WorkflowEngine
  pluginRegistry: PluginRegistry
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface HealthReport {
  status: HealthStatus
  details?: Record<string, unknown>
  checkedAt: string     // ISO 8601
}

export interface ModuleConfig {
  [key: string]: unknown
}

/**
 * EmpireModule: the contract every module must implement.
 *
 * Lifecycle:
 *   1. Platform creates module instance
 *   2. Platform calls init(services, config) — module stores refs, registers handlers
 *   3. Platform registers module in PluginRegistry + ModuleGateway
 *   4. Module starts receiving requests via handleRequest()
 *   5. Module starts receiving events via handleEvent()
 *   6. On shutdown, platform calls shutdown()
 */
export interface EmpireModule {
  /**
   * Unique identifier matching PluginDescriptor.id.
   * Must be stable across restarts.
   */
  readonly moduleId: string

  /**
   * Called once by the platform before the module handles any traffic.
   * Module should: store service refs, subscribe to events, register workflows.
   * Must resolve before the module is marked 'active' in PluginRegistry.
   */
  init(services: CoreServices, config: ModuleConfig): Promise<void>

  /**
   * Called by ModuleGateway when a request is routed to this module.
   * Module must not call other modules directly — use services.moduleGateway.route().
   */
  handleRequest(request: GatewayRequest): Promise<GatewayResponse>

  /**
   * Called by EventBus for events this module subscribed to during init().
   * Must not throw — catch internally and emit an AGENT_ERROR event if needed.
   */
  handleEvent(event: DomainEvent): Promise<void>

  /**
   * Polled by the platform every 30s. Return degraded/unhealthy to trigger alerts.
   */
  health(): Promise<HealthReport>

  /**
   * Called by the platform on graceful shutdown.
   * Module should: flush state, unsubscribe events, close connections.
   * Must resolve within 10 seconds or platform force-kills.
   */
  shutdown(): Promise<void>
}

/**
 * BaseModule: optional abstract base class modules can extend.
 * Provides default implementations for boilerplate methods.
 * Not required — modules can implement EmpireModule directly.
 */
export abstract class BaseModule implements EmpireModule {
  abstract readonly moduleId: string

  protected services!: CoreServices
  protected config!: ModuleConfig

  async init(services: CoreServices, config: ModuleConfig): Promise<void> {
    this.services = services
    this.config = config
    await this.onInit()
  }

  /**
   * Override this instead of init() to keep service injection clean.
   */
  protected async onInit(): Promise<void> {}

  abstract handleRequest(request: GatewayRequest): Promise<GatewayResponse>

  async handleEvent(_event: DomainEvent): Promise<void> {
    // Default: no-op. Override to handle events.
  }

  async health(): Promise<HealthReport> {
    return { status: 'healthy', checkedAt: new Date().toISOString() }
  }

  async shutdown(): Promise<void> {
    // Default: no-op. Override for cleanup.
  }

  /**
   * Convenience: emit an event through the platform's event bus.
   */
  protected emit(
    topic: string,
    payload: unknown,
    correlationId?: string
  ): Promise<DomainEvent> {
    return this.services.eventBus.publish({
      topic,
      source: this.moduleId,
      payload,
      correlationId,
    })
  }
}
