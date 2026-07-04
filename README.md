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
- Node 20+, pnpm 9+, Python 3.12+, Docker Desktop

### Dev setup
```bash
# 1. Copy env
cp .env.example .env
# Fill in your API keys in .env

# 2. Start infrastructure
cd docker && docker compose up -d

# 3. Install dependencies
pnpm install

# 4. Generate Prisma client
cd packages/database && pnpm db:generate && pnpm db:push

# 5. Start all apps
pnpm dev
```

### Services
| Service | URL |
|---------|-----|
| Web dashboard | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| DB studio | `pnpm db:studio` |

## Agent Roster
| Agent | Role |
|-------|------|
| Claude | DevOps / Architecture |
| Gemini | Research / Scripts |
| Goose | Orchestration |
| ChatGPT | Copy |
| Ollama | Local fallback |

## Authority: Josh > Claude > Goose > All others
