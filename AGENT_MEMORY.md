# Empire OS — Agent Memory

**UPDATED: Core architecture frozen. See ARCHITECTURE.md.**

## What this is
Empire OS is the management layer for the Viral Engine AI YouTube factory.
Channels: Gods & Glory (GG) | Machine Learning (ML) | Little Olympus (LO)

## ARCHITECTURAL RULING (Josh, 2026-07-03)
> "Freeze the Empire OS core interfaces first. Do not begin implementing
> Empire Assistant until the Empire OS foundation (Memory Bus, Module Gateway,
> AI Router, Event Bus, Workflow Engine, and Plugin Registry) is complete and
> stable. Then implement Empire Assistant as an Empire OS module that consumes
> those services rather than owning them."

Empire Assistant is a MODULE. It does NOT own memory, AI routing, or orchestration.

## Stack
```
empire-os/
├── packages/core/          ← SIX FROZEN CORE SERVICES (start here)
│   ├── src/interfaces/     ← Frozen contracts (do not change)
│   └── src/implementations/← Working implementations (swap for prod)
├── apps/web/               Next.js 14, port 3000 — dashboard UI
├── apps/api/               FastAPI, port 8000 — data + agent API
├── packages/database/      Prisma schema + client (PostgreSQL)
└── docker/docker-compose.yml  postgres:15 + redis:7
```

## Six Core Services (packages/core/)
| Service | Interface | Implementation |
|---------|-----------|---------------|
| Memory Bus | `MemoryBus` | `InMemoryMemoryBus` |
| Module Gateway | `ModuleGateway` | `HttpModuleGateway` |
| AI Router | `AIRouter` | `DefaultAIRouter` |
| Event Bus | `EventBus` | `InProcessEventBus` |
| Workflow Engine | `WorkflowEngine` | `InMemoryWorkflowEngine` |
| Plugin Registry | `PluginRegistry` | `InMemoryPluginRegistry` |

Bootstrap: `import { bootstrap } from '@empire-os/core'`

## Module Contract
Every module implements `EmpireModule` and receives `CoreServices` injected by platform.
`BaseModule` abstract class available for convenience.

## Stability Criteria (before Empire Assistant)
See ARCHITECTURE.md — 10 checkboxes. All must pass before EA starts.

## AI Routing
Claude=code/arch | Gemini=research/scripts | GPT=copy | Ollama=local fallback

## Ports
3000=Next.js | 8000=FastAPI | 5432=PostgreSQL | 6379=Redis

## Authority
Josh > Claude > Goose > (Gemini, auto_render.py, Council Bots)

## GitHub
https://github.com/mjardin17/empire-os (branch: main)
https://github.com/mjardin17/viral-engine (branch: main)
