/**
 * EMPIRE OS CORE — Bootstrap
 * Wires all 6 core services together and returns a ready CoreServices object.
 * Import this in apps/api/main.py equivalent for Node, or in your Next.js server init.
 *
 * Usage:
 *   import { bootstrap } from '@empire-os/core/bootstrap'
 *   const services = await bootstrap()
 *   // Pass services to every module via module.init(services, config)
 */

import { InMemoryPluginRegistry } from './implementations/plugin-registry.impl.js'
import { InMemoryMemoryBus } from './implementations/memory-bus.impl.js'
import { InProcessEventBus } from './implementations/event-bus.impl.js'
import { DefaultAIRouter } from './implementations/ai-router.impl.js'
import { HttpModuleGateway } from './implementations/module-gateway.impl.js'
import { InMemoryWorkflowEngine } from './implementations/workflow-engine.impl.js'
import type { CoreServices } from './interfaces/empire-module.js'

export interface BootstrapOptions {
  /** Skip registering built-in workflow definitions (useful in tests) */
  skipBuiltinWorkflows?: boolean
}

let _services: CoreServices | null = null

export async function bootstrap(options: BootstrapOptions = {}): Promise<CoreServices> {
  if (_services) return _services  // singleton — call once

  // 1. Instantiate all 6 core services
  const pluginRegistry = new InMemoryPluginRegistry()
  const memoryBus = new InMemoryMemoryBus()
  const eventBus = new InProcessEventBus()
  const aiRouter = new DefaultAIRouter()
  const moduleGateway = new HttpModuleGateway()
  const workflowEngine = new InMemoryWorkflowEngine(moduleGateway, eventBus)

  _services = {
    pluginRegistry,
    memoryBus,
    eventBus,
    aiRouter,
    moduleGateway,
    workflowEngine,
  }

  // 2. Register core platform plugin entries
  await pluginRegistry.register({
    id: 'empire-os-core',
    name: 'Empire OS Core',
    version: '1.0.0',
    type: 'module',
    description: 'Platform core services: Memory Bus, Event Bus, AI Router, Module Gateway, Workflow Engine, Plugin Registry',
    capabilities: [
      { name: 'memory', version: '1.0.0' },
      { name: 'events', version: '1.0.0' },
      { name: 'ai-routing', version: '1.0.0' },
      { name: 'module-gateway', version: '1.0.0' },
      { name: 'workflows', version: '1.0.0' },
      { name: 'plugin-registry', version: '1.0.0' },
    ],
    status: 'active',
  })

  // 3. Announce platform ready
  await eventBus.publish({
    topic: 'system.platform.ready',
    source: 'empire-os-core',
    payload: { services: Object.keys(_services), timestamp: new Date().toISOString() },
  })

  console.log('[Empire OS] Core services bootstrapped.')
  return _services
}

/** Reset singleton (tests only) */
export function _resetBootstrap(): void {
  _services = null
}
