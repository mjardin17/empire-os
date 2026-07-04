// Empire OS Core — Implementations
// Import these to wire up the platform. Swap any for a production-backed version.

export { InMemoryPluginRegistry } from './plugin-registry.impl.js'
export { InMemoryMemoryBus } from './memory-bus.impl.js'
export { InProcessEventBus } from './event-bus.impl.js'
export { DefaultAIRouter } from './ai-router.impl.js'
export type { AIProviderAdapter } from './ai-router.impl.js'
export { HttpModuleGateway } from './module-gateway.impl.js'
export { InMemoryWorkflowEngine } from './workflow-engine.impl.js'
