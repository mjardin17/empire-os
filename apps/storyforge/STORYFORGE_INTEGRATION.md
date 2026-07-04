# StoryForge ↔ Empire OS Integration Plan

**Date:** 2026-07-04  
**Status:** Approved for implementation — Phase 2A  
**Rule:** Preserve both projects. Additive only. No redesign.

---

## Audit Findings

### What StoryForge Is (Phase 4 — published to GitHub)

StoryForge is a **Python FastAPI engine** for creative content production.  
It is **not** a React app or a video pipeline. It is a backend service.

| Phase | Module | What It Does |
|-------|--------|-------------|
| 1 | Story Science | Flesch-Kincaid readability, emotion scoring, conflict/pacing analysis, plot-hole detection |
| 1 | Character Memory | SQLite character store with guarded-attribute contradiction detection (409 on canon violation) |
| 1 | Creative Council | 14 AI specialists (Story Architect, Character Designer, Continuity Inspector, etc.) |
| 1 | Book Exporter | Real EPUB 3 generation (no external deps) |
| 2 | World Engine | Persistent world memory — maps, timeline, cultures, magic systems, governments, species, lore, FTS5 search |
| 3 | Image Studio | Provider-agnostic image generation — Placeholder / ComfyUI / OpenAI / **Higgsfield** (scaffolded, activates via env) |
| 4 | Publishing Studio | Market research aggregation, design briefs, AI listing copy, platform export (KDP, Etsy, Shopify, Gumroad) |

### Integration Seams Already Designed In

StoryForge was built with Empire OS in mind:

| Seam | Location | How to Activate |
|------|----------|----------------|
| `WorldMemorySync` | `core/world/world_engine.py` | Implement `EmpireMemorySync(WorldMemorySync)` → every World Engine write forwards to Empire OS Memory Bus |
| `ImageProvider` | `core/image/providers.py` | `HiggsFieldProvider` scaffolded — set `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_URL` |
| `AIProvider` | `core/ai/provider.py` | Add `EmpireAIProvider` → routes through Empire OS AI Router |
| `PublishingConnector` | `core/publishing/platform_export.py` | Implement per-platform direct API connectors |
| `MarketDataSource` | `core/publishing/research.py` | Register licensed data sources |

### Architecture Gap

| Property | StoryForge | Empire OS |
|----------|-----------|-----------|
| Language | Python 3 | TypeScript |
| Framework | FastAPI + Uvicorn | Next.js 14 + Express |
| Storage | SQLite (local) | In-memory → Redis/PostgreSQL |
| AI | AIProvider (OpenRouter/Anthropic/Ollama) | AIRouter (routes by task type) |
| Port | 8001 | 3000 (web), 8000 (api) |

---

## Integration Strategy

**Approach: HTTP Adapter + Integration Seams**

StoryForge runs as its own Python service at port 8001.  
Empire OS Module Gateway proxies requests to it.  
The `WorldMemorySync` seam connects StoryForge writes to Empire OS Memory Bus.  
No code in either project is deleted or rewritten.

### What Gets Added to StoryForge (Python)

```
storyforge-engine/
└── empire_hooks/           ← NEW — additive only
    ├── __init__.py
    ├── memory_sync.py      ← EmpireMemorySync(WorldMemorySync)
    ├── event_emitter.py    ← emit to Empire OS Event Bus on writes
    └── router.py           ← /empire/health endpoint for Module Gateway
```

**One line in `main.py`** (existing file, one additive import):
```python
from empire_hooks.router import empire_router
app.include_router(empire_router)
```

**One line in `WorldEngine.__init__`** (if EMPIRE_OS_MEMORY_URL is set):
```python
sync = EmpireMemorySync() if os.getenv("EMPIRE_OS_MEMORY_URL") else NullMemorySync()
```

### What Gets Added to Empire OS (TypeScript)

```
apps/storyforge/
├── empire-module/          ← NEW EmpireModule adapter
│   ├── package.json
│   ├── tsconfig.json
│   ├── index.ts
│   ├── storyforge.module.ts   ← EmpireModule implementation
│   ├── higgsfield.plugin.ts   ← Higgsfield PluginDescriptor
│   ├── types.ts               ← TypeScript mirrors of StoryForge types
│   └── workflows/
│       └── story-pipeline.ts  ← WorkflowDefinition
└── README.md               ← env vars, startup guide
```

---

## Module Gateway Registration

```
Module ID:   storyforge
Base URL:    http://localhost:8001
Health:      GET /empire/health
Priority:    20
```

### Capabilities

| Capability | Endpoint | Method |
|-----------|----------|--------|
| `story-science` | `/science/analyze` | POST |
| `character-memory` | `/characters` | POST |
| `character-get` | `/characters/{id}` | GET |
| `world-engine` | `/worlds` | POST |
| `world-search` | `/worlds/{id}/encyclopedia/search` | GET |
| `image-generate` | `/images/generate` | POST |
| `publishing-studio` | `/publishing/research/analyze` | POST |
| `book-export` | `/book/export/epub` | POST |
| `council-review` | `/council/review` | POST |

### Higgsfield Plugin

```
Plugin ID:    higgsfield
Type:         connector
Capabilities: video-generate, image-generate, audio-generate, voice-clone, motion-control
Status:       active (activates when HIGGSFIELD_API_KEY is set)
```

---

## Workflow: story-to-render

```
premise → [science-analyze] → [character-matrix] → [world-build]
       → [council-review] → [image-generate (parallel)] → [book-export]
       → [human-approval: publish-package]
```

---

## Environment Variables

```env
# StoryForge ← Empire OS signals
EMPIRE_OS_MEMORY_URL=http://localhost:3100/memory
EMPIRE_OS_EVENT_URL=http://localhost:3100/events

# StoryForge AI providers
OPENROUTER_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://localhost:11434

# Image providers
HIGGSFIELD_API_KEY=...
HIGGSFIELD_API_URL=https://api.higgsfield.ai
OPENAI_API_KEY=sk-...
```

---

## Implementation Order (incremental)

1. ✅ **Audit** — this document
2. 🔨 **Python additions** — `empire_hooks/` (memory_sync, event_emitter, router)
3. 🔨 **TypeScript EmpireModule** — `apps/storyforge/empire-module/`
4. 🔨 **Higgsfield plugin** — registered in PluginRegistry on module init
5. 🔨 **Workflow** — `story-pipeline` registered in WorkflowEngine on module init
6. 🔨 **Docs** — ARCHITECTURE.md + AGENT_MEMORY.md updated
7. 🔨 **Commit + push** — `COMMIT_STORYFORGE.bat`

---

## What Is NOT in Scope (Phase 2A)

- Video Studio (Phase 5 of StoryForge — Higgsfield video gen pipeline)
- Direct platform publishing connectors (Amazon SP-API, Etsy, Shopify)
- Licensed market data sources (Keepa, Jungle Scout, PA-API)
- StoryForge UI (React frontend) — separate from the engine
- Viral Engine / Video Bot Pipeline → StoryForge bridge (future)
