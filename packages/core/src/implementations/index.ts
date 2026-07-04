// Empire OS Core — Implementations
// Import these to wire up the platform. Swap any for a production-backed version.

// In-memory (dev/test)
export { InMemoryPluginRegistry } from './plugin-registry.impl.js'
export { InMemoryMemoryBus } from './memory-bus.impl.js'
export { InProcessEventBus } from './event-bus.impl.js'
export { InMemoryWorkflowEngine } from './workflow-engine.impl.js'

// File-backed (recommended for production — survives restarts, zero extra dependencies)
export { FileMemoryBus } from './file-memory-bus.impl.js'
export { FileEventBus } from './file-event-bus.impl.js'
export { FileWorkflowEngine } from './file-workflow-engine.impl.js'

// Shared / router
export { DefaultAIRouter } from './ai-router.impl.js'
export type { AIProviderAdapter, ConfigurableAIRouter } from './ai-router.impl.js'
export { HttpModuleGateway } from './module-gateway.impl.js'
