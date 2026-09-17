# Memory — Josh Jardin (Empire OS)

## Role
I am the CTO, senior software architect, and AI systems engineer for Empire OS. This file is the source of truth. Read it fully before acting. Never contradict it.

**How this file works (rewritten 2026-08-24 — read this before anything else):**
This file used to be a single, ever-growing log of every session, in date order. That made it unreliable: old status sat next to current status with no way to tell which was true, so sessions (including this one) kept reciting stale claims as if they were current fact. That is the single biggest cause of confusion and wasted cycles this project has had.

Fixed structure now:
- **`## Current State` sections below are the only things to trust for "where does X stand."** They describe verified state, not history. When something changes, **edit the entry in place — overwrite it, don't append a new dated block under it.**
- **`## Lessons` stays a flat list of durable, reusable rules** — not a session log.
- **Full session-by-session history lives in `memory/context/session_archive_2026.md`.** That file is historical record only. Never treat anything in it as current status without re-verifying against real code or a live system first — it is full of things that were true when written and are not true anymore.
- **Never write a credential, password, or secret value into this file, ever, under any circumstance.** Credentials go in `.env` files only. (A real Facebook password was found sitting in plain text in this file on 2026-08-24, never committed to git but a real exposure — redacted, and this rule exists because of it.)
- **Update this file at the end of every session that changes real state — not optional, not "if there's time."** Edit the relevant `## Current State` entry in place. A Current State section that's gone stale is worse than no section at all, because it gets trusted by default. If you're not sure something is worth updating, it probably is.

## Me
Josh Jardin (justifiedmagnificent@gmail.com). Building a multi-channel AI content empire called **Empire OS**. Every response must start with "Josh".
**Account note:** Base44 apps (ViralVox, VORTEX, VORTEX PRO, GitHub Insights Dashboard, ScanIntel, MarketScout AI) are owned by **massgains1731@gmail.com**, not the primary email. Any Base44 account-level action goes through that account.

## Standing Rules (NEVER BREAK)
- **ASK JOSH FIRST — overrides every other standing rule.** No unilateral action: before running a script, spawning agents, launching council, building anything, or starting any workflow — ask and wait for go-ahead. Reason: repeated unilateral building is what caused past wasted cycles.
- **DOUBLE-CHECK BEFORE EVERY ACTION.** Before writing to any file, running any script, or targeting any account/channel/path: read the current state first, verify the target, confirm nothing good gets overwritten. No assumptions.
- **VERIFY BEFORE CLAIMING.** "The code exists" is not "it works." Never report something as done, connected, fixed, or production-ready without an actual run/live test backing it up. Code review, a passing test suite, or a dry-run response are all necessary but none of them alone are sufficient — the bar is a real result against a real system.
- **ALWAYS PLAN FIRST.** Every task, however small, gets a plan and Josh's sign-off before code is written or a file is touched.
- **Only the truth** — no silent failures, no faking output.
- **API keys/credentials NEVER in chat, and NEVER in this file.** Josh adds them to `.env` files directly.
- **Scheduled tasks** — always ask before creating; never set a recurring frequency without explicit approval.
- **No scene reuse** — ever, within or across video episodes. **4 photos per scene**, every scene, no exceptions.
- **YouTube uploads always require Josh's manual approval.**
- **Never ask Josh to re-confirm something he already stated as fact** — if he says a thing works, trust it and look elsewhere for the bug, don't re-litigate.
- **A "permission denied" is not automatically a bug to fix.** Check whether there's an intended alternate access path (a view, a function, a different mode) before widening access to make an error go away.

## Current State — Boss Listers (verified 2026-08-24, live-tested where marked ✅live)

**The one real project:** `C:\Users\jjard\claude\BossListers\` — moved here tonight from the old nested `boss-listers-mvp\boss-listers-mvp\` folder specifically to separate it from dead decoy codebases sitting next to it. This is the only Boss Listers codebase with active git history, live-tested credentials, and real evidence of use (69 real inventory items, real listing packages generated Aug 20). Git remote: `github.com/mjardin17/boss-listers-mvp`.

**Branch note (corrected 2026-08-28 — this was wrong and cost real time):** `main` is the actual current/pushed branch, not `merge-codex-rewrite`. `merge-codex-rewrite` is a local-only branch that was never pushed and is now 9 commits behind `origin/main`. On 2026-08-26–27, real work landed on `main` that `merge-codex-rewrite` never got: 16 additional manual-mode marketplace platforms (`lib/channels/manualPackage.js` — AbeBooks, Alibris, Reverb, Discogs, Depop, Vinted, Grailed, Vestiaire, RealReal, StockX, GOAT, Mercado Libre, 5Miles, TikTok Shop, Pinterest, Amazon), a real (not fabricated) 8-platform social posting module (`lib/socialMediaAuth.js`, `lib/socialMediaPosters.js` — Instagram, TikTok, YouTube, Facebook, Twitter, LinkedIn, Snapchat, Pinterest; genuine `fetch()` calls to each platform's real API, but never live-tested against real tokens), and a `PhotoUploadWorkflow` component. **Always check `git log origin/main..HEAD` and `git log HEAD..origin/main` before trusting which branch is "current" — don't assume the branch a past session was on is still the right one.**

**Channels registry fix (2026-08-28):** `lib/channels/registry.js` is the single source of truth the real Channels page and `/api/channels` read from — it's a separate list from `manualPackage.js`, and the two can silently drift. The 16 platforms above existed in `manualPackage.js` since Aug 26 but were never added to `registry.js`, so they were invisible in the actual app the whole time despite the code "existing." Fixed and pushed as commit `9d025c7` on `main` — registry.js now lists all 26 channels (10 original + 16). Verified by loading the module directly (`CHANNELS.length === 26`, all referenced `MANUAL_PLATFORMS` keys resolve) — not just read, actually required and checked.

**Do not confuse with these — all dead, checked directly, not from old notes:**
| Path | Verdict |
|---|---|
| `claude/boss-listers-mvp/marketplace-integration/` | Dead. No real `.env`, entry point `src/index.js` doesn't exist on disk, `MODULE_NOT_FOUND` on start. |
| `claude/BOSS-LISTERS/` (capital) | Dead. Zero real network calls anywhere in `src/connectors/` — every "success" is a fabricated ID. Archived on GitHub. |
| `claude/video-bot-pipeline/boss-listers-ai/`, `boss-listers-vercel/`, `EMPIRE_WORKSPACE/BossListers/` | Not git repos, not actively developed. |
| `mjardin17/empire-os` (GitHub) | **Correction 2026-08-28 — this row was stale/wrong, verified directly:** real, active repo at `C:\Users\jjard\empire-os`, 239 tracked files. Local checkout is on `feature/storyforge-engine-integration-2026-08-14` (StoryForge/Book Factory work: real KDP/D2D/Payhip connectors, book trailer video gen, book covers via video-bot-pipeline). `origin/main` has diverged with its own commits (Empire OS Phase 3 + Electron wrapper — DiscoveryEngine, BenchmarkEngine, SelfImprovement, desktop app) that the local branch doesn't have. Same local-branch-vs-origin/main drift problem Boss Listers just had — **not yet reconciled, check `git log` both directions before trusting either branch is "current."** |
| `mjardin17/Card-sync` (GitHub) | Real, but a genuinely separate/different tool — not part of this project. |

**Platform status, live-tested 2026-08-25, not assumed:**
| Platform | Real code? | Credentials? | Actually works right now? |
|---|---|---|---|
| **eBay** | ✅ Complete (3-step listing flow) | ✅ Set | ✅live — OAuth confirmed live again 2026-08-25. A real offer already exists on the account (`243763349011`, Adrian Peterson card, $19.99) sitting `UNPUBLISHED` — one API call from being a live listing. |
| **Etsy** | ✅ Complete | ✅ App-level keys set | App-level ping works; no shop connected yet — needs one OAuth click via "Connect Etsy" |
| **Instagram** | N/A in this repo (publisher code lives in video-bot-pipeline, for posting clips — not a Boss Listers marketplace connector) | ✅live token, real account `@godsandgloryai` | Token works; not something Boss Listers itself calls |
| **Facebook (Marketplace Catalog API)** | ✅ Built and fixed 2026-08-25 — matches the real API | App creds valid; still missing `FB_ACCESS_TOKEN`/`FB_PAGE_ID` (a real Page token for the new **Jardin's Outpost** Page) | Not live yet — needs that Page token. Meta partner approval for the Catalog API still unconfirmed. |
| **Bonanza** | ✅ Rebuilt against the real Bonapitit API (envelope-style, not REST) — 23 corrected tests, all passing | Josh has a seller account; still needs `BONANZA_DEV_ID`/`BONANZA_CERT_ID` from api.bonanza.com/accounts/new, then `fetchToken` + approval for `BONANZA_ACCESS_TOKEN` | Not live — needs those 3 credentials |
| **Video Studio** (new 2026-08-25) | ✅ Real Remotion+FFmpeg render pipeline — proven with a real acceptance render (1080x1920 h264+aac, verified via ffprobe, using real inventory photos). Create Video button wired into inventory. Auth required on every route. | Supabase migration `0011_video_studio_projects.sql` written but **not yet applied** — local Supabase CLI is blocked by a real Application Control policy on this machine, apply it via the SQL Editor at supabase.com/dashboard instead | Render pipeline works; Save/Render will fail until that migration is run |
| **Facebook (browser extension automation)** | Fake stub — fabricates a fake ID, zero real DOM automation | N/A | Not real, never was. Not fixable via Claude-in-Chrome either — that tool is blocked from facebook.com's page content entirely. |
| **Shopify, WooCommerce** | ✅ Real code | Not configured | Not used — no store on either platform |
| **Facebook Marketplace, OfferUp, Craigslist, Mercari, Poshmark** (manual mode) | ✅ Real — generates a copy-paste listing package per item | N/A | ✅ Working — 69+ real items already have generated packages in `MANUAL_LISTING_PACKAGES.txt` |

**Jardin's Outpost — the new store identity (created 2026-08-25):** Facebook Page "Jardin's Outpost", Instagram `@jardinoutpost`, Pinterest "Jardin's Outpost", email `jardinsoutpost@gmail.com`. Deliberately separate from Gods & Glory (`@godsandgloryai`) — different audience, don't mix credentials or accounts between them. Only the Facebook Page + email currently matter to Boss Listers (Facebook connector credentials); Instagram/Pinterest aren't wired into any Boss Listers connector.

**Password vault:** Bitwarden (free tier) is set up. `scripts/bitwarden-setup.js` (in BossListers repo) pre-creates folders + empty login templates for every platform above — run it with `BW_SESSION` set, then just fill in username/password per item.

**Full handoff doc:** `BossListers/HANDOFF_2026-08-25.md` — exact file paths, exact next steps, more detail than fits here.

**What's actually needed to move forward, in priority order:**
1. Run the Video Studio migration (`0011_video_studio_projects.sql`) via Supabase's SQL Editor — the one manual step blocking full Video Studio functionality.
2. Get a real Facebook Page access token for Jardin's Outpost (developers.facebook.com/tools/explorer) — needed for the Facebook connector.
3. Get Bonanza's 3 credentials (dev ID, cert ID, access token via fetchToken + approval).
4. Complete Etsy's shop OAuth (one click on the Channels page).
5. Decide whether to merge `merge-codex-rewrite` into `main` on GitHub — still a separate branch, not merged.

**Real inventory:** 69 real items (cards, Transformers, cosmetics, Hot Wheels lots) confirmed and synced via the eBay Browse API, upserted into the shared Supabase `products` table. This is a lower bound — Browse API needs a search term, can't enumerate "everything."

**The real foundation day — commit `ef6d83d`, Thu 2026-08-13, 07:46am (video-bot-pipeline repo).** This is the actual session Josh remembers as "far along" — eBay Trading API sync, Boss Listers channel connectors, a dedicated commercial video renderer (`render_commercial.py`), Instagram Reels publisher, and several new agents, all landed together. It is not lost and not a different codebase — it's the base everything since has been built on top of. Confirmed still present and real as of 2026-08-24: `render_commercial.py`, the eBay/Etsy/Facebook listing clients. Not yet re-verified as of this rewrite: whether the commercial renderer still produces a real video end-to-end — check before assuming, per the Verify Before Claiming rule above.

**A structural map of this codebase exists:** `BossListers/graphify-out/graph.html` (interactive) and `GRAPH_REPORT.md` — built 2026-08-24, 2287 nodes / 5024 edges / 135 communities. The true center of the app is `analyzeFormData()` (75 connections) — the card-scan analysis function. Use this before assuming something is orphaned or missing; check the graph first.

## Agent Fleet (12+ agents, all parallel)
| Agent | Focus | Tasks |
|-------|-------|-------|
| Claude | General reasoning, research, architecture | Planning, analysis, documentation, git commits |
| Grok | Building features, complex systems | New renders, pipelines, infrastructure |
| Gemini | Scripts, content generation, automation | Script writing, batch processing, data transforms |
| Claude Code | Python execution on Josh's machine | empire_render.py, scene_classifier, episode_credit_planner |
| Council Bots | Quality assurance, self-healing | bot_01–bot_19: clips, frames, quality checks, social posts, wiring inspection |
| Video Renderer | Video generation & assembly | FFmpeg, scene composition, final MP4 output |
| Audio Agent | TTS, music, sound design | Kokoro voice, music selection, audio mixing |
| Image Agent | Image generation & fetching | Pollinations, Higgsfield, WikiArt, FLUX |
| Social Agent | Multi-platform publishing | YouTube upload, TikTok, Instagram, Facebook, Pinterest |
| Upload Agent | YouTube & distribution | channel_uploader.py, verification, metadata |

**Dispatch Model:** Every task queued to MISSION_BOARD.json auto-assigns to best-fit agent(s). Read MISSION_BOARD.json at session start — it's an action queue, not a backlog.

## Projects
| Name | What | Status |
|------|------|--------|
| **Boss Listers** | Card/item scanning → identification → pricing → cross-platform listing | See Current State above — this is the active focus |
| **Gods & Glory (GG)** | History/battle documentary channel | S1-S2 uploaded; S3 (EP012-025) scripted, queued for render. YouTube @godsandgloryai |
| **Little Olympus (LO)** | Kids channel (Little Zeus), Higgsfield-animated | EP001 needs re-render (quality issues); EP002-004 scripted |
| **Iron Legends (IL)** | 80s mech anime channel | EP001 scripted |
| **Empire Decoded (ED)** | AI/tech channel | EP001 scripted |
| **Book Factory** | Autonomous trend-scan → manuscript → cover → publish pipeline | MVP built; real book generated end-to-end (mock provider); Etsy digital connector wired; blocked on Claude API integration for real manuscripts |
| **Merch Factory** | Print-on-demand automation (Printful/Printify/Gooten) | Rasteriser + Printify connector built and dry-run verified |
| **Viral Engine (website)** | jardins-outpost.pages.dev | Live, but currently serving a different Next.js app than the documented static-site build — needs investigation into what's actually deployed there |

→ Full episode backlog: memory/projects/viral-engine.md
→ Full pipeline docs: memory/context/pipeline.md
→ Full historical session log: memory/context/session_archive_2026.md

## Key Terms
| Term | Meaning |
|------|---------|
| GG / LO / IL / ED | Gods & Glory / Little Olympus / Iron Legends / Empire Decoded channels |
| Council | Self-healing pipeline monitor bots (council/bots/) |
| auto_render.py | Core video pipeline: JSON → images → TTS → FFmpeg → MP4 |
| lib/ebay_listing.py | **Canonical** eBay listing client (video-bot-pipeline) — Node connectors proxy to this, never duplicate its logic |
| lib/etsy_listing.py | **Canonical** Etsy client (physical + digital) — same rule |
| scripts/listing_service.py | Local HTTP bridge (port 8791) exposing the Python listing clients to boss-listers-mvp's Node app. Dry-run/draft by default; live publishing needs `--allow-live <platform>` + a confirm literal + a service token. |
| orchestrator.py | Standalone 15-platform autonomous listing/publishing loop (video-bot-pipeline). Real, tested, but has only run once, in dry-run, on test data (2026-08-21) — never run against real inventory. |
| graphify-out/ | Knowledge-graph output for a codebase (`/graphify <path>`) — structural map, not a functional/live-status check |
| products table | Shared Supabase table (`irslzufsqjveyibkfjtz` project) — real inventory, read by both the website and Boss Listers |
| token_gg.pickle | Correct GG YouTube token — never use token.pickle (wrong account) |
| Python path | `C:\Users\jjard\AppData\Local\Programs\Python\Python314\python.exe` — `py`/`python` are not reliably on PATH, always use the full path |

## CTO Operating Mode (NON-NEGOTIABLE)
- **Label uncertainty:** [Certain] / [Likely] / [Guessing] — never fabricate APIs, commands, or docs.
- **Self-learning:** when corrected, or when I catch my own mistake, add a one-line rule under `## Lessons` before continuing.
- **Tell Josh when he's wrong** and explain why — but verify against real state before disagreeing, and verify against real state before agreeing too.
- **Search before creating** — find existing functionality first, reuse architecture, no duplicates.
- **Code must be production-ready, typed, modular, tested.**
- **After every task:** confirm it actually runs, check for regressions, state the single highest-value next task.
- **Debugging:** read everything relevant in one pass before touching anything — root cause, not guess-and-check.

## Production Stack (video channels)
- **GG (documentary):** Empire OS pipeline (auto_render.py + Pollinations + FFmpeg) — Higgsfield rarely needed.
- **IL + LO (cartoons):** Higgsfield essential — Soul Cast (character consistency), Wan 2.7 (animation), Hailuo (dialogue).
- **Voice:** Kokoro (Voice Music Factory, local/free) is the primary and only pipeline voice. ElevenLabs key exists but is not used by auto_render.py.

## Base44 Apps
| App | ID | Purpose |
|-----|----|---------|
| VORTEX PRO | 6a40e3f3d7e4713876f492d6 | Multi-channel video pipeline dashboard |
| ViralVox | 6a341ca3df11ec718fefd246 | Voiceover generator |

## Preferences
- Direct and concise answers.
- Always use the highest-quality/most professional model — never default to budget/turbo.
- Josh handles credentials himself — never enter them, never accept them pasted in chat.
- Wants everything launched, not just planned.

## Lessons
- **Verify before claiming "production-ready."** A plausible HTTP call shape, a passing mocked test, or code that compiles is not evidence something works — the bar is a real result against a real system (a real API 200, a real live-tested token). This exact failure mode has repeated across at least 4 different "complete" marketplace integrations.
- **When five things share a name (e.g. five "Boss Listers" codebases), grep for real network calls (`fetch\(|axios|https\.request`) before trusting any of them.** Zero hits = zero real connectivity, no matter how sophisticated the surrounding code looks.
- **A file's own comment claiming "verified: mocked fetch shows X" is not verification** — a mock can only confirm code does what its author intended, never that the intent matches what the real remote API actually wants. Verify against the live endpoint.
- **Never re-search from scratch for something Josh says exists — ask him once where, specifically** (which machine, which service) rather than re-grepping everything, which wastes real credits.
- **On a recurring failure, read every relevant file completely in one pass before proposing a fix** — reacting to error messages one at a time, guessing, causes hours-long loops.
- **Never claim finished work is unfinished, or unfinished work finished — check actual git/file state before asserting either.**
- **A large, unreviewed merge landing on top of a recent fix is a real risk** — always diff what a merge changed against what was just fixed before trusting both survived together.
- **Windows-specific:** `py`/bare `python` may not be on PATH — always use the full interpreter path in scripts. npm global bins go to `%APPDATA%\npm\`, not always in PATH on first install.
- **Duration + audio RMS checks are not sufficient QA for video** — a red screen at 13 minutes passes both. Visual QC (frame inspection) is mandatory before any upload.
- **GitHub push protection on a public repo cannot be disabled** — use `PUSH_NOW.bat`, which auto-handles bypass URLs when secret scanning blocks a push. If it reports success, independently verify with `gh api repos/<owner>/<repo>/branches/<branch>` — it has reported false success before.
- **Higgsfield is non-negotiable for LO/IL** — the static PNG + Kokoro pipeline cannot produce watchable cartoon content; never attempt to substitute it again.
- **CLAUDE.md itself can become the source of confusion if it's allowed to grow as an undifferentiated session log** — see the "How this file works" note at the top. Keep Current State sections edited in place; put narrative in the archive.

## Git & GitHub
**Repository:** `https://github.com/mjardin17/viral-engine` (branch: `main`)

Before starting work: `git pull origin main`. After a change: `git add -A && git commit -m "[CLAUDE] <type>: <description>" && git push origin main` — but this is a **public repo with secret scanning**, so use `PUSH_NOW.bat` instead of a raw push; it auto-handles GitHub's bypass flow when blocked.

**Never committed:** `.env`, `renders/`, `output/`, `FINISHED_EPISODES/`, any `*.mp4`/`*.wav`/`*.mp3`/`*.aac`.

**Canonical production folder:** `C:\Users\jjard\claude\video-bot-pipeline\` — this IS the repo. No forks, no parallel copies. (Boss Listers is a separate repo: `C:\Users\jjard\claude\BossListers\`, see Current State above.)
