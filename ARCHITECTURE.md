# Empire OS — Architecture

**Status: CORE FROZEN. Do not add features until core is stable.**

---

## The Rule

> Empire Assistant is an Empire OS **module**.
> It **consumes** core services. It does **not** own them.
> Core services are implemented once, injected everywhere.

---

## Six Core Services (packages/core/)

All interfaces are in `packages/core/src/interfaces/`. They are frozen.
All implementations are in `packages/core/src/implementations/`.

| Service | Interface | Implementation | Purpose |
|---------|-----------|---------------|---------|
| **Memory Bus** | `MemoryBus` | `InMemoryMemoryBus` | Shared persistent context. No module owns this. |
| **Module Gateway** | `ModuleGateway` | `HttpModuleGateway` | Routes requests between modules. Modules never call each other directly. |
| **AI Router** | `AIRouter` | `DefaultAIRouter` | Selects and calls the right AI model. No module holds API clients. |
| **Event Bus** | `EventBus` | `InProcessEventBus` | Pub/sub backbone. All cross-module comms happen here. |
| **Workflow Engine** | `WorkflowEngine` | `InMemoryWorkflowEngine` | Orchestrates multi-step pipelines (render, upload, script). |
| **Plugin Registry** | `PluginRegistry` | `InMemoryPluginRegistry` | Source of truth for what exists in the system. |

---

## Module Contract

Every module (including Empire Assistant) implements `EmpireModule`:

```typescript
interface EmpireModule {
  readonly moduleId: string
  init(services: CoreServices, config: ModuleConfig): Promise<void>
  handleRequest(request: GatewayRequest): Promise<GatewayResponse>
  handleEvent(event: DomainEvent): Promise<void>
  health(): Promise<HealthReport>
  shutdown(): Promise<void>
}
```

`CoreServices` is injected by the platform. Modules never instantiate core services.

---

## AI Routing Rules

| Task Type | Primary | Fallback Order |
|-----------|---------|---------------|
| Code / Architecture | Claude (Anthropic) | DeepSeek → GPT |
| Research / Scripts | Gemini (Google) | Claude → GPT |
| Copy / Marketing | GPT (OpenAI) | Claude → Gemini |
| Summary | Claude | Gemini → GPT |
| Local / Offline | Ollama | None |

---

## Event Topics (well-known, stable)

```
render.queued / render.started / render.completed / render.failed
script.created / episode.uploaded
agent.action / agent.error
workflow.started / workflow.step.completed / workflow.completed / workflow.failed
module.registered / module.health.changed
system.alert
```

Adding a new topic requires updating `TOPICS` in `event-bus.ts` AND this document.

---

## Startup Sequence

```
1. bootstrap() — instantiates all 6 core services
2. pluginRegistry.register() — core platform registers itself
3. eventBus.publish('system.platform.ready')
4. Each module: module.init(services, config)
5. Each module: moduleGateway.register(descriptor)
6. Each module: pluginRegistry.register(descriptor)
7. Traffic begins
```

---

## Stability Criteria (before Empire Assistant begins)

The core is **stable** when ALL of the following are true:

- [ ] All 6 interface files compile with zero TypeScript errors
- [ ] All 6 implementations pass unit tests (happy path + error path)
- [ ] `bootstrap()` runs end-to-end without errors
- [ ] A test module successfully calls all 6 services via `CoreServices`
- [ ] WorkflowEngine runs a 3-step workflow end-to-end
- [ ] EventBus delivers events across a publish → subscribe cycle
- [ ] MemoryBus read/write/search/subscribe cycle passes
- [ ] AIRouter routes, falls back, and returns stats correctly
- [ ] ModuleGateway routes to a real HTTP endpoint (mock or real module)
- [ ] PluginRegistry validates dependencies correctly

**Empire Assistant does not start until every box above is checked.**

---

## What Empire Assistant Is (future)

Empire Assistant is a **module** that:
- Registers itself in `PluginRegistry` with capability `["chat", "task-planning"]`
- Receives requests via `ModuleGateway` (users talk to it through the gateway)
- Reads/writes memory via `MemoryBus` (conversation context, user prefs)
- Calls AI via `AIRouter` (never holds its own API client)
- Triggers pipelines via `WorkflowEngine` ("render episode 12")
- Subscribes to events via `EventBus` (knows when renders complete)

It does **not** own any of those services.

---

## Production Swap Plan

Current implementations are in-memory (dev-ready). Production swaps:

| Current | Production Replacement |
|---------|----------------------|
| `InMemoryMemoryBus` | Redis (hot) + PostgreSQL MemoryEntry table (cold) |
| `InProcessEventBus` | Redis pub/sub + PostgreSQL EventLog table |
| `InMemoryPluginRegistry` | PostgreSQL PluginDescriptor table |
| `InMemoryWorkflowEngine` | PostgreSQL WorkflowInstance table + BullMQ queue |
| `HttpModuleGateway` | Same impl — already HTTP-based |
| `DefaultAIRouter` | Same impl — add real provider adapters with API keys |

Swap one at a time. Interfaces don't change.
