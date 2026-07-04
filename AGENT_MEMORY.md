# Empire OS — Agent Memory

**UPDATED: 2026-07-04 — Empire OS Phase 3 + Electron wrapper COMPLETE.**

**Phase 1 backend:** 10 modules live (Dashboard, Store, Installer + 7 others).
**Phase 2 frontend:** 6 React panels (Health Monitor, AI Router, Discovery Feed, Benchmark, Connectors, Higgsfield).
**Phase 3:** 3 backend modules + 4 React components + 4 new sidebar entries.
**Electron (NEW):** Native Windows desktop wrapper - apps/electron/

Phase 3 backend (empire-os-server/):
- discovery-engine.module.ts — live multi-source AI discovery (Ollama, HF, GitHub, MCP, ComfyUI) + JSON cache
- benchmark-engine.module.ts — persist benchmark history, one model at a time, recharts-ready JSON
- self-improvement.module.ts — recommendation engine with approve/dismiss/rollback, NEVER auto-installs

Phase 3 frontend (crosspost-enterprise/src/components/):
- DiscoveryEngine.tsx — search/filter/category/quality-score/copy-cmd interface
- BenchmarkEngine.tsx — recharts BarChart + RadarChart, run benchmarks from UI
- SelfImprovementEngine.tsx — approve/dismiss/rollback recommendation cards
- DiscoveryDashboard.tsx — unified premium dashboard (new models, trending, benchmarks, recs, MCP)

Electron desktop wrapper (apps/electron/):
- main.ts — BrowserWindow loading localhost:3000, system tray (show/hide/autostart/quit), window state JSON, minimize-to-tray, single-instance lock, connection error overlay, IPC handlers
- preload.ts — contextBridge exposes window.empireOS API (notify, getAutoStart, setAutoStart, minimizeToTray, getVersion, openExternal, isDesktop)
- tsconfig.json — CommonJS target for Electron main process
- package.json — electron 30 + electron-builder, npm run start / dist:win
- assets/icon.png — 16x16 dark blue tray icon

To build the desktop app:
  cd C:\Users\jjard\empire-os\apps\electron
  npm install
  npm run start       (dev: launches Electron wrapping localhost:3000)
  npm run dist:win    (production: generates installer in release/)

COMMIT_SERVER.ps1 updated to copy all Phase 3 + Electron files.
NEXT: Run COMMIT_SERVER.ps1, then: cd apps/electron && npm install && npm run start**

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
| Model Manager | `model-manager` | TypeScript (in-process) | 3001 | ✅ BUILT — graphical Ollama model browser at /model-manager/ |
| Discovery | `discovery` | TypeScript (in-process) | 3001 | ✅ BUILT — AI catalog, HF/GitHub trending, HW compat, benchmark at /discovery/ |
| Health Monitor | `health-monitor` | TypeScript (in-process) | 3001 | ✅ BUILT — service status, RAM/CPU/disk, event log at /health-monitor/ |
| Media Engine | `media-engine` | TypeScript (in-process) | 3001 | ✅ BUILT — video/image/audio/music routing + detection at /media-engine/ |
| Knowledge Base | `knowledge-base` | TypeScript (in-process) | 3001 | ✅ BUILT — persistent memory store at /knowledge-base/ |
| Empire Dashboard | `empire-dashboard` | TypeScript (in-process) | 3001 | ✅ BUILT — glassmorphism SPA, all modules unified at / (redirects here) |
| Empire Store | `store` | TypeScript (in-process) | 3001 | ✅ BUILT — 40+ items: AI models, video, image, voice, ocr, dev tools at /store/ |
| Empire Installer | `installer` | TypeScript (in-process) | 3001 | ✅ BUILT — pip/npm/winget/ollama installer at /installer/ |

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

Default strategy: **cost** (Ollama wins all routine tasks — costPerMToken=0)
Ollama=local/routine | Claude=code/arch | Gemini=research/scripts | OpenAI=GPT-specific | Goose=local dev agent
StoryForge uses OpenRouter (routes to same models via one key).

## Model Manager Packs

coding | writing | research | image | video | creative
Image Pack: llava:34b, llava-llama3:8b, minicpm-v:8b, moondream:1.8b
Video Pack: video-llava:7b, llava:34b, minicpm-v:8b
UI: http://localhost:3001/model-manager/ — browse/install/remove/register without terminal

## Ports

3000=CrossPost Enterprise | 8000=FastAPI planned | 8001=StoryForge | 8002=Video Bot Pipeline | 5432=PostgreSQL | 6379=Redis

## Authority

Josh > Claude > Goose > (Gemini, auto_render.py, Council Bots)

## GitHub

- https://github.com/mjardin17/empire-os (branch: main)
- https://github.com/mjardin17/viral-engine (branch: main)
- https://github.com/mjardin17/storyforge (or equivalent — source of truth for StoryForge)
