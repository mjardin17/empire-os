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

# 3. Start the Empire OS server (port 4000) and the web dashboard (port 3000)
pnpm dev
```

Check the server is up:
```bash
curl http://localhost:4000/health   # → {"status":"online","modules":{...}}
```

Use `pnpm start` to run only the server. Set `PORT` to change its port. To lock the server with a key, see [Lock Empire OS with a key](#lock-empire-os-with-a-key) below (without a key anything on your network can use it, so only run it that way on your own machine).

### Checks (same as CI)
```bash
pnpm type-check      # core + web TypeScript
pnpm lint            # web ESLint
pnpm test            # core unit tests (vitest)
pnpm test:dashboard  # CrossPost dashboard: Empire key handling
pnpm --filter @empire-os/web build
pnpm smoke:server        # boots the server (no key) and checks GET /health
pnpm smoke:server:key    # same, with EMPIRE_API_KEY set: key, unlock page and CORS
```

### Lock Empire OS with a key
With `EMPIRE_API_KEY` set, the server refuses every request that does not carry the key, except `GET /health`.

1. **Make up a key.** Any long random string works. To generate one:
   ```bash
   openssl rand -hex 32
   # or, without openssl:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Put it in `apps/empire-os-server/.env`** (create the file; it is git-ignored, so never commit it):
   ```
   EMPIRE_API_KEY=paste-your-key-here
   ```
   Restart the server (`pnpm start`). The log says `Auth: ENABLED`.
3. **Enter it once in the dashboard.** Open CrossPost (http://localhost:3000). A yellow bar says *"Empire OS is locked: enter your Empire key"*. Paste the key and click **Unlock**. This browser remembers it (in its local storage) and sends it with every Empire OS request. Use **change key** or **forget key** in the top bar to change it.
4. **The server's own pages** (http://localhost:4000/empire-dashboard/, model manager, and so on) show an *"Empire OS is locked"* page. Enter the same key there once; that browser stays unlocked for 30 days (an HttpOnly cookie that holds a hash of the key, not the key).

Scripts and other apps send the key in the `X-Empire-Api-Key` header:
```bash
curl -H "X-Empire-Api-Key: $EMPIRE_API_KEY" http://localhost:4000/providers
```

**Which web pages may call the server.** With a key set, only the CrossPost dashboard (`http://localhost:3000` and `http://127.0.0.1:3000`) may call Empire OS from a browser. If you open the dashboard from another address (for example over Tailscale), list every address in `apps/empire-os-server/.env`, comma-separated:
```
EMPIRE_ALLOWED_ORIGINS=http://localhost:3000,http://my-pc.tailnet.ts.net:3000
```
Without a key the server allows any origin, as before.

For local use only, you can skip step 3 by putting `VITE_EMPIRE_API_KEY=...` in `apps/crosspost-enterprise/.env`. Vite builds that value into the page's JavaScript, so never use it for a build anyone else can open.

### Services
| Service | URL |
|---------|-----|
| Empire OS server (modules + health) | http://localhost:4000 |
| Health | http://localhost:4000/health |
| Web dashboard | http://localhost:3000 |
| FastAPI (`apps/api`, optional) | http://localhost:8000 |
| DB studio | `pnpm --filter @empire-os/database db:studio` |

## Connected apps

### Bookmaker (books)
Empire OS loads the StoryForge module, which proxies `/storyforge/*` to your Bookmaker book studio.

1. Run Bookmaker (the `feat/empire-contract` version or later): `npm run dev` in the bookmaker folder. It listens on **3010**.
2. Start Empire OS (`pnpm start`). If Bookmaker is somewhere else, set `STORYFORGE_BASE_URL` (in the shell or `apps/empire-os-server/.env`).
3. Check it: `curl http://localhost:4000/health` shows `storyforge: healthy`, and `curl http://localhost:4000/storyforge/empire/books` lists your books.
4. The CrossPost app's **StoryForge** tab (`apps/crosspost-enterprise`, port 3000) lists your books and Book Factory runs and starts new books. Set `VITE_EMPIRE_OS_URL` if Empire OS isn't on `http://localhost:4000`.

When Bookmaker isn't running, `/health` reports `storyforge: unhealthy`, `/storyforge/*` answers 502, and the panel says "Bookmaker is not running".

| Empire OS route | Bookmaker route | What it does |
|---|---|---|
| `GET /storyforge/empire/books` | `GET /empire/books` | Finished books in `output_books/` plus Book Factory runs |
| `POST /storyforge/empire/books/start` | `POST /empire/books/start` | `{ "title", "niche"?, "dryRun"? }` creates a DRY_RUN Book Factory run (no AI calls). `dryRun: true` only validates. |

### Boss Listers (reselling)
Empire OS loads the Boss Listers module, which proxies `/bosslisters/*` to the Boss Listers app (boss-listers-mvp).

1. In Boss Listers (the `feat/empire-contract` version or later) set `EMPIRE_SHARED_KEY` to a long random value, and run it as usual (`npm run dev`, port **3001**).
2. In Empire OS set `BOSSLISTERS_EMPIRE_KEY` to the same value. If Boss Listers isn't on `http://localhost:3001`, set `BOSSLISTERS_BASE_URL` (e.g. your Tailscale URL).
3. Check it: `curl http://localhost:4000/health` shows `bosslisters: healthy`, and `curl http://localhost:4000/bosslisters/empire/listings?limit=5` shows your stock list.
4. The CrossPost app's **Boss Listers** tab shows stock totals by stage, the newest items, which selling sites have credentials, and adds an item as an unlisted draft ("Check only" is on by default).

Without the key only health works (the panel says what is missing). When Boss Listers isn't running, `/health` reports `bosslisters: unhealthy`, `/bosslisters/*` answers 502, and the panel shows it offline. Only the routes below are proxied; nothing in Empire OS can post or publish a listing.

| Empire OS route | Boss Listers route | What it does |
|---|---|---|
| `GET /bosslisters/empire/health` | `GET /empire/health` | Is it up and set up (no key needed) |
| `GET /bosslisters/empire/listings?limit=&stage=` | `GET /empire/listings` | Stock list totals by stage and the newest items |
| `GET /bosslisters/empire/platforms` | `GET /empire/platforms` | Which selling sites have credentials (no live calls) |
| `POST /bosslisters/empire/stock/add` | `POST /empire/stock/add` | `{ "title", "price"?, "quantity"?, "condition"?, "dryRun"? }` adds an unlisted draft |
| `POST /bosslisters/empire/event` | `POST /empire/event` | Empire OS events (`system.alert` is forwarded automatically) |

### Adding the next app
Both modules are `RemoteAppModule`s (`packages/core/src/modules/remote-app.module.ts`). For another app, give it `GET /empire/health` and `POST /empire/event`, then create a module with its id, base-URL env var and default, its endpoints (only declared endpoints are proxied), and optional auth headers; see `apps/empire-os-server/bosslisters.module.ts`, then add it in `server.ts`.

### Ports
Empire OS listens on **4000** (`PORT` overrides it). It used to default to 3001, which Boss Listers has always used (phone, Chrome extension, OAuth redirects, Tailscale), so Empire OS moved. If your `.env` still says `PORT=3001`, change it to 4000. The CrossPost panels use `VITE_EMPIRE_OS_URL` (default `http://localhost:4000`).

## Agent Roster
| Agent | Role |
|-------|------|
| Claude | DevOps / Architecture |
| Gemini | Research / Scripts |
| Goose | Orchestration |
| ChatGPT | Copy |
| Ollama | Local fallback |

## Authority: Josh > Claude > Goose > All others
