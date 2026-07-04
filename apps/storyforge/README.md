# StoryForge Engine — Empire OS Integration

StoryForge is a Python FastAPI engine for creative content production.
It lives at `apps/storyforge/storyforge-engine/` in this monorepo.

The Empire OS adapter lives at `apps/storyforge/empire-module/`.

## Architecture

```
Empire OS                           StoryForge
─────────────────────────────────   ──────────────────────────────────
StoryForgeModule (TypeScript)   ←→  FastAPI server (Python, port 8001)
├── registers with ModuleGateway    ├── /science/analyze
├── registers Higgsfield plugin     ├── /characters/*
├── registers story-to-render       ├── /worlds/*
│   workflow                        ├── /images/generate
└── proxies requests via HTTP       ├── /book/export/epub
                                    ├── /publishing/*
                                    ├── /council/review
                                    └── /empire/health  ← Module Gateway polls here
```

## Startup

### 1. Start StoryForge Python engine

```bash
cd apps/storyforge/storyforge-engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### 2. Activate Empire OS hooks (in storyforge-engine/main.py)

Add these two lines to `main.py`:

```python
from empire_hooks.router import empire_router
app.include_router(empire_router)
```

### 3. Configure environment

Copy `.env.example` and fill in your keys:

```bash
cp apps/storyforge/.env.example apps/storyforge/storyforge-engine/.env
```

### 4. Start Empire OS

The TypeScript `StoryForgeModule` will self-register on bootstrap.

## Environment Variables

```env
# ── Empire OS signals ─────────────────────────────────────────────────
STORYFORGE_BASE_URL=http://localhost:8001
EMPIRE_OS_MEMORY_URL=http://localhost:3100/memory
EMPIRE_OS_EVENT_URL=http://localhost:3100/events

# ── AI providers (StoryForge) ─────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://localhost:11434

# ── Image providers ───────────────────────────────────────────────────
HIGGSFIELD_API_KEY=...          # activates HiggsFieldProvider in image studio
HIGGSFIELD_API_URL=https://api.higgsfield.ai
OPENAI_API_KEY=sk-...           # activates OpenAI image provider
COMFYUI_BASE_URL=http://localhost:8188  # activates ComfyUI provider
```

## What's Next (Phase 2B)

- **Video Studio**: Higgsfield video generation pipeline (Phase 5 of StoryForge)
- **Platform Connectors**: Amazon SP-API, Etsy Open API, Shopify Admin API
- **Market Data Sources**: Keepa, Jungle Scout, Amazon PA-API
- **Franchise Engine**: Sequel/spin-off/merch generation on top of World Engine + Character Memory

## Integration Seams (already designed in StoryForge)

| Seam | File | Status |
|------|------|--------|
| `WorldMemorySync` | `core/world/world_engine.py` | ✅ Ready — implement `EmpireMemorySync` |
| `ImageProvider` (Higgsfield) | `core/image/providers.py` | ✅ Scaffolded — set env vars |
| `AIProvider` | `core/ai/provider.py` | ✅ Ready — add `EmpireAIProvider` |
| `PublishingConnector` | `core/publishing/platform_export.py` | ✅ Ready — implement per-platform |
| `MarketDataSource` | `core/publishing/research.py` | ✅ Ready — register licensed source |
| Empire OS event endpoint | `empire_hooks/router.py` | ✅ Built — POST /empire/event |
