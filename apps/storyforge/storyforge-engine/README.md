# StoryForge Engine -- Phase 1 (Real, Working Core)

This phase replaces every placeholder in the original scaffold with real,
tested logic. Nothing existing was removed; `core/council/base.py` and the
root `/` route are untouched.

## What's real right now

- **`core/science/engine.py`** -- Flesch-Kincaid readability, lexicon-based
  emotion scoring, conflict/pacing analysis, and rule-based plot-hole
  tripwires, all computed directly from manuscript text. No network calls.
- **`core/memory/character_memory.py`** -- SQLite-backed character store.
  Persists attributes and event history, and actively blocks silent
  contradictions on guarded traits (eye color, species, voice, etc.) with a
  409-style Conflict unless you explicitly force the change.
- **`core/ai/provider.py`** -- swappable adapters (OpenRouter, direct
  Anthropic, local Ollama) behind one `AIProvider` interface. Add a new
  provider by subclassing and registering it -- nothing else changes.
- **`core/council/specialists.py`** -- 14 named specialists (Story
  Architect, Character Designer, Continuity Inspector, Franchise Planner,
  etc.), each with a distinct prompt, orchestrated by `CreativeCouncil`
  which actually calls the provider layer and returns structured feedback.
- **`core/book/exporter.py`** -- generates a real, spec-valid EPUB 3 file
  using only the standard library (verified: correct mimetype/OCF
  structure, valid content.opf, working nav/table of contents).
- **`main.py`** -- FastAPI endpoints wiring all of the above together:
  `/science/analyze`, `/characters*`, `/council/review`, `/book/export/epub`.

## Run it

```bash
pip install -r requirements.txt
export OPENROUTER_API_KEY=sk-...      # only needed for /council/review
uvicorn main:app --reload
```

## Phase 2: World Engine (added)

`core/world/` -- persistent, provider-agnostic world memory. Nothing in
Phase 1 was changed; this is purely additive.

- **`models.py`** -- dataclasses for Location, TimelineEvent, Culture,
  Government, Species, MagicSystem, TechLevel, CharacterRelationship,
  LoreEntry, ContinuityIssue.
- **`world_engine.py`** -- SQLite-backed persistence (same pattern as
  CharacterMemory) with full CRUD for every entity type above, plus:
  - `get_map(world_id)` -- every location with coordinates + parent
    nesting, ready for map rendering.
  - A generalized guarded-attribute system (`world_attributes` table)
    that blocks silent canon contradictions on ANY entity type, not
    just characters -- e.g. changing a government's type without
    `force=True` returns a 409 with the old/new values.
  - `search_encyclopedia(world_id, query)` -- real SQLite FTS5 full-text
    search across every entity type at once, with snippet highlighting.
    Falls back to a LIKE-based scan automatically if FTS5 isn't
    compiled into the local SQLite build.
  - `WorldMemorySync` -- an abstract interface called on every write.
    `NullMemorySync` is the default (no-op). This is the integration
    seam for Empire OS Memory: implement one `EmpireMemorySync(WorldMemorySync)`
    class later and every write in the World Engine will forward to it
    automatically -- no other code changes needed.
- **`continuity.py`** -- `ContinuityValidator.run_full_validation(world_id)`
  runs five real, rule-based checks against actual stored data:
  1. Location hierarchy cycles (a location can't be its own ancestor)
  2. Dangling references (government/species pointing at a location
     that doesn't exist)
  3. Timeline conflicts (same character in two different locations at
     the same timeline position)
  4. Guarded-attribute contradictions (live, on every write)
  5. Magic-system contradictions (two systems sharing a source but
     using directly opposing rule language, e.g. "unlimited" vs "limited")

  All five were verified with deliberately-broken test data before
  shipping -- every check fires on the exact condition it claims to
  catch, and stays silent otherwise.

- **New endpoints in `main.py`**: `/worlds`, `/worlds/{id}/locations`,
  `/worlds/{id}/map`, `/worlds/{id}/timeline`, `/worlds/{id}/cultures`,
  `/worlds/{id}/governments`, `/worlds/{id}/species`,
  `/worlds/{id}/magic-systems`, `/worlds/{id}/tech-levels`,
  `/worlds/{id}/relationships`, `/worlds/{id}/lore`,
  `/worlds/{id}/encyclopedia/search`, `/worlds/{id}/continuity/validate`,
  `/world-attributes`.

Every other module can now depend on World Engine as the shared
substrate: Character Memory relationships live here, the Council can
pull world context into its reviews, and the future Franchise Engine
can query the encyclopedia + timeline to keep spin-offs canon-consistent.

## Phase 3: Image Studio (added)

`core/image/` -- provider-agnostic image generation. Nothing in Phase 1
or the World Engine was changed; this is purely additive, same pattern
as everything above (SQLite persistence class + swappable adapter
layer + new `main.py` routes).

- **`providers.py`** -- one `ImageProvider` interface, four adapters
  registered out of the box:
  - `placeholder` -- no network, no API key. Uses Pillow if installed
    for a labeled test image, otherwise hand-builds a tiny valid PNG
    with stdlib `zlib` alone. This is what the smoke tests run against.
  - `comfyui` -- talks to a self-hosted ComfyUI server (`COMFYUI_BASE_URL`,
    `COMFYUI_CHECKPOINT`). Submits a standard txt2image node graph,
    polls `/history`, downloads the result via `/view`.
  - `openai` -- OpenAI Images API (`OPENAI_API_KEY`), handles both
    base64 and URL response shapes, maps requested dimensions to the
    nearest supported size.
  - `higgsfield` -- scaffolded and selectable now; activates the moment
    `HIGGSFIELD_API_KEY` and `HIGGSFIELD_API_URL` are set. Kept
    configurable rather than hardcoded since Higgsfield's public API
    shape isn't vendored into this repo.
  - Add a fifth provider by subclassing `ImageProvider` and registering
    it in `_IMAGE_PROVIDERS` -- nothing else changes.
- **`models.py`** -- `ImageAsset` (full provenance: prompt, negative
  prompt, provider, model, seed, width/height, status, output path,
  error message) and `IMAGE_TYPES`, the ten supported categories:
  character sheets, expression sheets, turnarounds, scene
  illustrations, backgrounds, props, book covers, coloring pages,
  thumbnails, merchandise art.
- **`image_studio.py`** -- SQLite-backed `ImageStudio` (same pattern as
  `CharacterMemory`/`WorldEngine`). Every generation attempt is
  recorded *before* the provider is called, so a crash mid-generation
  still leaves an auditable `failed` row instead of silently losing the
  request. Every image can link to a `character_id`, `scene_id`,
  `world_id`, and always a `project_id`, so images are queryable by any
  of those axes.
- **New endpoints in `main.py`**: `POST /images/generate`,
  `GET /images/{id}`, `GET /images` (filterable by project/character/
  scene/world/image_type/provider/status), `DELETE /images/{id}`,
  `GET /image-types`, `GET /image-providers`.
- **Smoke tests in `tests/`** -- `test_image_studio.py` covers the
  provider registry, every declared image type end-to-end, character/
  scene/world linking, filtering, deletion, and that failed generations
  are still persisted -- all offline via the placeholder provider.
  `test_image_studio_api.py` covers the same through the real FastAPI
  app via `TestClient`, and asserts every Phase 1 / World Engine route
  is still present. Run with `pytest tests/` from `storyforge-engine/`.

## Phase 4: Publishing Intelligence Studio (added)

`core/publishing/` -- helps authors position an original book to sell,
then packages it for the platforms that sell it. Nothing in Phase 1,
2, or 3 was changed; this is purely additive, same pattern as
everything above (dataclass models + SQLite persistence class +
swappable provider/connector seams + new `main.py` routes).

- **`models.py`** -- dataclasses for `TrendListing`, `MarketResearchReport`,
  `DesignBrief`, `BookMetadata`, `PlatformPackage`, `MarketingAsset`,
  `PublishingChecklistItem`, `ApprovalRecord`, plus the `BOOK_CATEGORIES`,
  `SELLING_PLATFORMS`, and `MARKETING_CHANNELS` taxonomies.
- **`research.py`** -- real, deterministic aggregation (keyword/color/
  page-count frequency, price stats, review sentiment via the same
  lexicon `core/science/engine.py` already uses) over `TrendListing`
  rows you feed in. **What this deliberately does not do:** scrape
  Amazon/Kindle/Etsy live. Automated scraping of Amazon's Best Sellers,
  New Releases, or Kindle rankings is against Amazon's Conditions of
  Use, and this sandbox has no outbound network access regardless. The
  `MarketDataSource` interface is the seam: `ManualDataSource` (real,
  working today) accepts listing facts gathered by a human researcher,
  a licensed data provider, or Amazon's own Product Advertising
  API/SP-API once you hold credentials for it. Register a new source
  with `register_data_source()` -- nothing else changes.
- **`design_brief.py`** -- generates an **original** creative brief
  (cover concept, palette, typography/layout/illustration direction)
  from a `MarketResearchReport`'s *aggregate* signals only -- there is
  no single source in a brief to copy from in the first place. Runs
  fully rule-based/offline by default; optionally accepts an
  `AIProvider` (see below) to write a richer cover-concept paragraph,
  and falls back to the rule-based text rather than failing if that
  call errors.
- **`optimizer.py`** -- `suggest_keywords()`/`suggest_categories()` are
  deterministic (derived straight from the research report, no AI, no
  key needed). `BookOptimizer.generate_listing_copy()` is AI-assisted:
  title, subtitle, description, A+ Content, and marketing copy, via the
  exact same swappable `AIProvider` interface the Creative Council uses
  (`core/ai/provider.py`) -- add a provider once, every module that
  needs AI text generation can use it.
- **`marketing.py`** -- `MarketingGenerator` produces channel-specific
  copy (TikTok/Shorts scripts, Instagram posts, Pinterest pins,
  Facebook ads, email campaigns) via the same provider seam, one call
  per requested channel, same orchestration pattern as
  `CreativeCouncil`. A single channel's provider failure is recorded on
  that `MarketingAsset` (`status="failed"`) rather than aborting the
  whole batch.
- **`platform_export.py`** -- `PlatformExporter` builds a listing
  package per platform (KDP, Etsy, Shopify, Gumroad, Payhip,
  WooCommerce): metadata reshaped to that platform's commonly-documented
  field names/limits (advisory `constraint_warnings`, e.g. "10 keywords
  supplied, KDP's limit is 7"), plus an organized folder of copied
  asset files and a `listing.json`. **This never auto-publishes
  anything.** `PublishingConnector`/`NullConnector` is the seam for
  future direct-API integration (Amazon SP-API, Etsy Open API v3,
  Shopify Admin API, etc.) -- until a real, credentialed connector is
  registered for a platform, every package is prepared to disk for
  human review, exactly as required. Add one with
  `register_connector()`.
- **`studio.py`** -- SQLite-backed `PublishingStudio` (same pattern as
  `CharacterMemory`/`WorldEngine`/`ImageStudio`) persisting every
  artifact above. `approve_book()` is the automation entry point: on
  approval it exports a platform package for every requested platform,
  saves every package as a draft, and generates a real publishing
  checklist computed from what was actually produced (title/description
  present, keywords/categories present, price set, per-platform package
  prepared, constraint warnings clear, cover asset attached, marketing
  assets attached) -- not a fixed static list.
- **New endpoints in `main.py`**: `/publishing/book-categories`,
  `/publishing/platforms`, `/publishing/marketing-channels`,
  `/publishing/research/analyze`, `/publishing/research/{id}`,
  `/publishing/projects/{id}/research`, `/publishing/design-briefs*`,
  `/publishing/book-metadata*`, `/publishing/marketing/generate`,
  `/publishing/projects/{id}/marketing-assets`,
  `/publishing/platform-export`,
  `/publishing/projects/{id}/platform-packages`, `/publishing/approve`,
  `/publishing/approvals*`.
- **Tests in `tests/test_publishing_studio.py`** -- fully offline: a
  `FakeAIProvider`/`BoomAIProvider` test double implements the same
  `AIProvider` contract every real adapter does, so market research
  aggregation, design-brief generation (rule-based and AI-assisted with
  fallback), listing-copy generation, marketing-copy generation,
  platform export packaging (including constraint trimming and asset
  copying), and the full research -> brief -> metadata -> export ->
  approve workflow are all covered with no network call or API key
  required. Run with `pytest tests/` from `storyforge-engine/`.

## What's next (not yet built -- say the word and I'll build the next one)

- Video Studio (Higgsfield integration, scene timing, render queue)
- Voice/Audio Studio (TTS providers, audiobook assembly)
- Franchise Engine (sequel/spin-off/merch generation on top of Character
  Memory + World Engine)
- Real direct-publish connectors for Publishing Intelligence Studio
  (Amazon SP-API, Etsy Open API v3, Shopify Admin API, etc.) once you
  hold credentials for them -- `core/publishing/platform_export.py`'s
  `PublishingConnector` seam is ready for this
- A licensed/real `MarketDataSource` for Publishing Intelligence Studio
  (Keepa, Jungle Scout export, Amazon PA-API) -- `core/publishing/research.py`'s
  `MarketDataSource` seam is ready for this
- Empire OS event bus + plugin registry wiring (World Engine's
  `WorldMemorySync` seam is ready for this)

## Phase 5: Empire Automation Studio (added)

`core/automation/` -- purely additive. Nothing in Phases 1-4 was changed
(`main.py` only gained new routes at the bottom; every existing route,
model, and module is byte-for-byte untouched). Takes a "Ready" StoryForge
project and automatically creates, organizes, publishes, markets, tracks,
and improves it, orchestrating Phase 4's Publishing Intelligence Studio
rather than duplicating it.

- **`core/automation/models.py`** -- plain dataclasses for everything
  this phase produces: `ProjectReadiness`, `FormatPackage`, `Campaign`,
  `AnalyticsMetric`, `Recommendation`, `WorkflowStepDef`/
  `WorkflowDefinition`/`WorkflowRun`, `ScheduledJob`, `EventRecord`.
- **`core/automation/events.py`** -- a dependency-free `EventBus`
  (in-process pub/sub + persisted log) covering the full requested
  vocabulary: `story.approved`, `book.exported`, `images.finished`,
  `video.finished`, `published`, `campaign.started`,
  `campaign.completed`, `sales.milestone`, `analytics.updated`, plus a
  handful of internal lifecycle events (workflow/job state changes).
  Every event is available to Empire Assistant either by subscribing
  in-process or polling `GET /automation/events`.
- **`core/automation/providers.py`** -- swappable provider abstraction
  for publishing, marketing, analytics, and storage
  (`PublishingProvider`, `MarketingProvider`, `AnalyticsProvider`,
  `StorageProvider`), each with a `get_*`/`register_*` registry --
  exactly the same seam pattern as Phase 4's `AIProvider` and
  `ImageProvider`. Default implementations are honest about what's
  real: publishing/marketing wrap Phase 4's real `PlatformExporter`/
  `MarketingGenerator`; analytics/storage default to manual/local until
  a real connector is registered.
- **`core/automation/formats.py`** -- `FormatPackageGenerator` produces
  every requested format: `kdp`, `epub`, `pdf`, `hardcover`,
  `paperback`, `large_print`, `coloring_book`, `activity_book`,
  `audiobook`, `marketing_package`. EPUB reuses Phase 4's real,
  spec-valid `EpubExporter` when chapter HTML is supplied; print formats
  get real, checkable production specs (trim size, bleed, DPI) rather
  than a fabricated binary -- same "prepare it, don't fake it" ethic as
  `platform_export.NullConnector`. The audiobook format produces a real
  chapter-by-chapter narration script; the marketing package aggregates
  real generated copy plus deterministic SEO metadata.
- **`core/automation/campaign_manager.py`** -- `CampaignManager`: one
  `Campaign` per published project, tracking publishing status,
  platforms, scheduled posts, artwork, videos, thumbnails, keywords,
  analytics, and a full revision history that's only ever appended to.
- **`core/automation/analytics.py`** -- `AnalyticsEngine`: real
  aggregation (never fabricated) over views, downloads, sales,
  conversion rate, CTR, keyword rankings, platform performance, and
  marketing performance, computed strictly from whatever's actually
  been recorded.
- **`core/automation/improvement_engine.py`** -- `ImprovementEngine`:
  weekly (or on-demand) rule-based recommendations across cover, title,
  subtitle, keywords, pricing, category, and marketing angle. Every
  recommendation is versioned and inserted, never overwriting the
  original or a prior recommendation.
- **`core/automation/workflow.py`** -- `WorkflowEngine`: a small
  drag-and-drop-ready step graph (`on_success`/`on_failure` pointers)
  with a swappable step-type handler registry. Both example pipelines
  from the spec (`Story -> Images -> Voice -> Video -> Publish ->
  Marketing` and `Story -> KDP -> Etsy -> Pinterest -> Ads`) run
  end-to-end in the test suite.
- **`core/automation/scheduler.py`** -- `Scheduler`: schedules
  publishing/marketing/workflow jobs with exponential-backoff retries
  and explicit failed-job recovery. No background daemon assumed --
  `run_due()` is called from a real cron job, background task, or the
  `POST /automation/scheduler/run-due` endpoint.
- **`core/automation/studio.py`** -- `AutomationStudio`: SQLite
  persistence for every artifact above, same pattern as
  `PublishingStudio`/`WorldEngine`/`CharacterMemory`/`ImageStudio`.
  Format packages and recommendations are insert-only and versioned, so
  "never overwrite originals" is enforced at the persistence layer, not
  just by convention.
- **`main.py`** -- new routes under `/automation/*`: project readiness
  (`/automation/projects/{id}/ready`, `/status`), format packages
  (`/automation/format-packages/generate[-all]`,
  `/automation/projects/{id}/format-packages`), campaigns
  (`/automation/campaigns*`), analytics
  (`/automation/analytics/metrics`, `*/analytics/summary`),
  improvement engine (`/automation/campaigns/{id}/improve`,
  `/recommendations`), workflow designer (`/automation/workflows*`,
  `/automation/workflow-runs/{id}`), scheduler
  (`/automation/schedule`, `/automation/scheduler/run-due`,
  `/automation/scheduled-jobs/{id}/recover`), provider introspection
  (`/automation/providers`), and event polling (`/automation/events`).
- **Tests in `tests/test_automation_studio.py`** -- 31 tests, fully
  offline: `FakePublishingProvider`/`FakeMarketingProvider`/
  `BoomPublishingProvider` test doubles implement the same provider
  contracts real adapters do. Covers format generation (including a
  real, zip-verified EPUB) and versioning, the full campaign lifecycle,
  analytics math (CTR/conversion computed only when both sides of the
  ratio are present), recommendation versioning, both example
  workflows plus a broken-context failure path, scheduler retry/
  backoff/recovery/unknown-job-type handling, and event bus fan-out
  (including a misbehaving subscriber not breaking the publisher). All
  20 of Phase 4's existing `test_publishing_studio.py` tests still pass
  unmodified. Run with `pytest tests/` from `storyforge-engine/`.

## What's next after Phase 5

- Real TTS/video providers registered into the `voice`/`video` workflow
  step seams (`core/automation/workflow.py`) to fully automate the
  `Story -> Images -> Voice -> Video -> Publish -> Marketing` pipeline
- A real Ads provider (Meta/Google/TikTok Ads API) registered into the
  `ads` workflow step seam
- A layout/rendering engine wired into `FormatPackageGenerator._print_format`
  to go from print spec to an actual rendered interior PDF
- Real analytics connectors (KDP/Etsy/Shopify dashboards, YouTube
  Analytics, TikTok/Meta insights) registered via
  `core/automation/providers.register_analytics_provider`

