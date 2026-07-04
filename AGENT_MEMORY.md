# Empire OS — Agent Memory

## What this is
Empire OS is the management layer for the Viral Engine AI YouTube factory.
It tracks channels, episodes, render jobs, and agent activity across:
- Gods & Glory (GG) — history/battle
- Machine Learning (ML) — tech docs
- Little Olympus (LO) — kids mythology

## Architecture (read before touching anything)
```
empire-os/
├── apps/
│   ├── web/          Next.js 14, port 3000 — dashboard UI
│   └── api/          FastAPI, port 8000 — data + agent API
├── packages/
│   ├── database/     Prisma schema + client (PostgreSQL)
│   └── ui/           Shared React components
├── docker/
│   └── docker-compose.yml   postgres:15 + redis:7
└── .github/workflows/ci.yml
```

## DB Models
- Channel — GG / ML / LO
- Episode — per channel, status: scripted|rendering|rendered|uploaded
- RenderJob — tracks auto_render.py runs
- AgentLog — audit trail for all AI actions

## API Endpoints
- GET /health — liveness check
- GET /status — pipeline overview
- GET /agents — agent roster
- GET /models — active models
- GET /tasks — task queue

## Ports
- 3000 — Next.js web
- 8000 — FastAPI
- 5432 — PostgreSQL
- 6379 — Redis

## Authority
Josh Jardin > Claude > Goose > (Gemini, auto_render.py, Council Bots)

## GitHub
https://github.com/mjardin17/empire-os (branch: main)

## Linked repos
- Viral Engine pipeline: https://github.com/mjardin17/viral-engine
