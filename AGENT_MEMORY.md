# Empire OS — Agent Memory

**UPDATED: 2026-07-04 — CrossPost INTEGRATED. Video Pipeline INTEGRATED. Unit tests 129/129 PASSING. Empire Assistant V2 BUILT. HTTP SERVER BUILT (`apps/empire-os-server/`). Start with START_EMPIRE_OS.bat. Add ANTHROPIC_API_KEY to .env first.**

## What this is
Empire OS is the management layer for the Viral Engine AI YouTube factory.
Channels: Gods & Glory (GG) | Machine Learning (ML) | Little Olympus (LO)

## ARCHITECTURAL RULINGS

**Josh, 2026-07-03:**
> "Freeze the Empire OS core interfaces first. Do not begin implementing
> Empire Assistant until the Empire OS foundation is complete and stable.
> Empire Assistant is a MODULE. It does NOT own memory, AI routing, or orchestration."

**Josh, 2026-07-04 (a):**
> "Integrate StoryForge into Empire OS as a native module.
> Do NOT redesign StoryForge. Do NOT redesign Empire OS. Preserve both."

**Josh, 2026-07-04 (b):**
> "CrossPost Enterprise and Boss Listers DO exist. They were built in Google AI Studio.
> Do not assume they are missing. Treat them as external projects until source is provided.
> Update architecture so they are represented as connected modules."

**2026-07-04 (c) — CrossPost Enterprise integrated:**
> Source ZIP received (`crosspost-content-operating-system.zip`). All files staged to `apps/crosspost-enterprise/`.
> Empire hooks added to server.ts (additive-only). `CrossPostModule extends BaseModule` adapter built.

**Josh, 2026-07-04 (d) — Boss Listers ruling:**
> "Boss Listers is just a plugin right now."
> CONFIRMED: Boss Listers = `BossListers.tsx` UI panel inside CrossPost. No separate service. No separate ZIP needed.
> CLOSED. If a real backend is ever wanted, add a route to server.ts.

**2026-07-04 (e) — Empire Workforce verdict (Claude ruling after full search):**
> "Empire Workforce" has zero source code, zero ZIPs, zero git repos, zero mentions in CrossPost docs.
> VERDICT: LOGICAL LAYER — not a missing repository.
> Empire Workforce = the multi-agent AI routing infrastructure, already implemented as:
>   - `DefaultAIRouter` in packages/core/ (routes Claude/Gemini/GPT/Ollama)
>   - CrossPost POST /api/empire/ai-router endpoint (live Gemini + Ollama routing)
>   - AI_RESPONSIBILITIES.md routing matrix
> Nothing to build. No ZIP needed. CLOSED.

## Stack

```
empire-os/
├── packages/core/               ← SIX FROZEN CORE SERVICES
│   ├── src/interfaces/          ← Frozen contracts (do not change)
│   └── src/implementations/     ← Working implementations (swap for prod)
├── apps/web/                    Next.js 14, port 3000 — dashboard UI (planned)
├── apps/api/                    FastAPI, port 8000 — data + agent API (planned)
├── apps/storyforge/             ← STORYFORGE ENGINE (Python, port 8001) ACTIVE
│   ├── storyforge-engine/       ← Source of truth (GitHub: mjardin17/storyforge)
│   ├── empire_hooks/            ← Python additions (memory_sync, router)
│   ├── empire-module/           ← TypeScript EmpireModule adapter
│   └── README.md
├── apps/video-pipeline/         ← VIDEO BOT PIPELINE WRAPPER ✅ BUILT
│   ├── empire_server.py         ← Python FastAPI (port 8002), empire hooks, render API
│   ├── empire-module/           ← VideoPipelineModule extends BaseModule
│   └── README.md
├── apps/empire-os-server/       ← HTTP SERVER ✅ BUILT — boots all services + modules, port 3001
│   ├── server.ts                ← Entry point (Node built-in http, no Express needed)
│   ├── package.json             ← tsx + dotenv deps
│   └── adapters/
│       ├── anthropic.adapter.ts ← Claude (opus/sonnet/haiku)
│       └── gemini.adapter.ts    ← Gemini (1.5-pro, 1.5-flash)
├── apps/empire-assistant/       ← EMPIRE ASSISTANT V2 ✅ BUILT — EmpireModule (in-process in server)
│   ├── empire-assistant.module.ts
│   └── index.ts
├── apps/crosspost-enterprise/   ← CROSSPOST ENTERPRISE (Node.js/TypeScript, port 3000) ✅ INTEGRATED
│   ├── server.ts                ← 3084 lines — original 2974 + 110 empire hooks (additive)
│   ├── src/components/BossListers.tsx  ← Boss Listers IS this component (UI panel, no separate service)
│   ├── src/                     ← React 19 frontend (App.tsx + 20 components)
│   ├── empire-module/           ← CrossPostModule extends BaseModule
│   └── (docs, config, EmpireOS/Knowledge/)
├── packages/database/           Prisma schema + client (PostgreSQL) (planned)
└── docker/docker-compose.yml    postgres:15 + redis:7 (planned)
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

## Registered Modules

| Module | ID | Language | Port | Status |
|--------|-----|----------|------|--------|
| StoryForge Engine | `storyforge` | Python (FastAPI) | 8001 | ✅ ACTIVE |
| CrossPost Enterprise | `crosspost-enterprise` | Node.js/TypeScript | 3000 | ✅ ACTIVE — empire hooks + CrossPostModule integrated |
| Video Bot Pipeline | `video-pipeline` | Python (FastAPI) | 8002 | ✅ ACTIVE — empire_server.py + VideoPipelineModule built |
| Boss Listers | (plugin panel inside CrossPost) | React component in CrossPost | N/A | ✅ CLOSED — BossListers.tsx UI panel; no separate service needed |
| Empire Assistant | `empire-assistant` | TypeScript (in-process) | 3001 | ✅ BUILT — runs inside empire-os-server, no separate port |

## Registered Connectors (PluginRegistry)

| Plugin | ID | Type | Capabilities |
|--------|-----|------|-------------|
| Higgsfield AI | `higgsfield` | connector | video-generate, image-generate, voice-clone, motion-control, shorts-studio, dubbing, reframe, upscale |

Higgsfield MCP: `mcp__16d46007-5a59-4d9d-8cc0-7748abeda183` | Workspace: f4897b98 | Plan: Plus

## Registered Workflows (WorkflowEngine)

| Workflow | ID | Steps |
|----------|-----|-------|
| Story → Render Pipeline | `story-to-render` | 7 steps: analyze → characters → world → council → cover → epub → approve |

## StoryForge Integration (how it works)

- StoryForge runs as its own Python process (`uvicorn main:app --port 8001`)
- TypeScript `StoryForgeModule` registers it with Module Gateway on Empire OS bootstrap
- Module Gateway health-polls `/empire/health` every 30s
- World Engine writes → `EmpireMemorySync` → Empire OS Memory Bus (when `EMPIRE_OS_MEMORY_URL` set)
- Events flow bidirectionally via `/empire/event` endpoint

## Module Contract

Every module implements `EmpireModule` and receives `CoreServices` injected by platform.
`BaseModule` abstract class available for convenience.

## Stability Criteria (before Empire Assistant)

See ARCHITECTURE.md — 10 checkboxes. All must pass before EA starts.

## AI Routing

Claude=code/arch | Gemini=research/scripts | GPT=copy | Ollama=local fallback
StoryForge uses OpenRouter (routes to same models via one key).

## Ports

3000=CrossPost Enterprise | 8000=FastAPI planned | 8001=StoryForge | 8002=Video Bot Pipeline | 5432=PostgreSQL | 6379=Redis

## Authority

Josh > Claude > Goose > (Gemini, auto_render.py, Council Bots)

## GitHub

- https://github.com/mjardin17/empire-os (branch: main)
- https://github.com/mjardin17/viral-engine (branch: main)
- https://github.com/mjardin17/storyforge (or equivalent — source of truth for StoryForge)
