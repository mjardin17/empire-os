# Empire OS

AI YouTube factory management system — **Viral Engine**

## Channels
- **Gods & Glory** — History/battle documentaries
- **Machine Learning** — Tech documentaries  
- **Little Olympus** — Kids mythology (Little Zeus)

## Stack
- **Frontend**: Next.js 14 (app router) — port 3000
- **Backend**: FastAPI — port 8000
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **ORM**: Prisma
- **Monorepo**: pnpm + Turborepo

## Quick Start

### Prerequisites
- Node 20+ and pnpm 9+ (required)
- Python 3.12+ (only for the FastAPI service in `apps/api`)
- Docker Desktop (only for Postgres/Redis in `docker/`, which the core server does not need)

### Run it
```bash
# 1. Install dependencies
pnpm install

# 2. (Optional) add AI provider keys so the assistant has models
cp .env.example .env   # then fill in the keys you use

# 3. Start the Empire OS server (port 3001) and the web dashboard (port 3000)
pnpm dev
```

Check the server is up:
```bash
curl http://localhost:3001/health   # → {"status":"online","modules":{...}}
```

Use `pnpm start` to run only the server. Set `PORT` to change its port and `EMPIRE_API_KEY` to require an API key (auth is off when it is unset, so only run without it on your own machine).

### Checks (same as CI)
```bash
pnpm type-check      # core + web TypeScript
pnpm lint            # web ESLint
pnpm test            # core unit tests (vitest)
pnpm --filter @empire-os/web build
pnpm smoke:server    # boots the server and checks GET /health
```

### Services
| Service | URL |
|---------|-----|
| Empire OS server (modules + health) | http://localhost:3001 |
| Health | http://localhost:3001/health |
| Web dashboard | http://localhost:3000 |
| FastAPI (`apps/api`, optional) | http://localhost:8000 |
| DB studio | `pnpm --filter @empire-os/database db:studio` |

## Agent Roster
| Agent | Role |
|-------|------|
| Claude | DevOps / Architecture |
| Gemini | Research / Scripts |
| Goose | Orchestration |
| ChatGPT | Copy |
| Ollama | Local fallback |

## Authority: Josh > Claude > Goose > All others
