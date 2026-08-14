# Changelog

All notable changes to StoryForge Engine are documented here. Every
phase has been strictly additive -- nothing from an earlier phase has
been removed, redesigned, or broken by a later one.

## Phase 5 -- Empire Automation Studio

Added `core/automation/` end-to-end: watches StoryForge projects for
"Ready" status and automatically generates format packages, platform
listings, marketing content, campaigns, schedules, analytics, and
improvement recommendations on top of Phase 4's Publishing Intelligence
Studio.

**Added**
- `core/automation/models.py` -- `ProjectReadiness`, `FormatPackage`,
  `Campaign`, `AnalyticsMetric`, `Recommendation`, `WorkflowStepDef`,
  `WorkflowDefinition`, `WorkflowRun`, `ScheduledJob`, `EventRecord`.
- `core/automation/events.py` -- `EventBus` with the full event
  vocabulary (`story.approved`, `book.exported`, `images.finished`,
  `video.finished`, `published`, `campaign.started`,
  `campaign.completed`, `sales.milestone`, `analytics.updated`, plus
  internal workflow/job lifecycle events).
- `core/automation/providers.py` -- swappable `PublishingProvider`,
  `MarketingProvider`, `AnalyticsProvider`, `StorageProvider`
  abstractions with registries.
- `core/automation/formats.py` -- `FormatPackageGenerator` for `kdp`,
  `epub`, `pdf`, `hardcover`, `paperback`, `large_print`,
  `coloring_book`, `activity_book`, `audiobook`, `marketing_package`.
- `core/automation/campaign_manager.py` -- `CampaignManager` (one
  campaign per published project; tracks platforms, scheduled posts,
  artwork, videos, thumbnails, keywords, revisions).
- `core/automation/analytics.py` -- `AnalyticsEngine` (views,
  downloads, sales, conversion rate, CTR, keyword rankings, platform
  performance, marketing performance).
- `core/automation/improvement_engine.py` -- `ImprovementEngine`
  (versioned, rule-based recommendations across cover, title,
  subtitle, keywords, pricing, category, marketing angle).
- `core/automation/workflow.py` -- `WorkflowEngine`, a drag-and-drop-
  ready step graph with a swappable step-handler registry; ships both
  spec example pipelines (`Story -> Images -> Voice -> Video ->
  Publish -> Marketing` and `Story -> KDP -> Etsy -> Pinterest -> Ads`).
- `core/automation/scheduler.py` -- `Scheduler` with exponential-
  backoff retries and explicit failed-job recovery.
- `core/automation/studio.py` -- `AutomationStudio`, SQLite persistence
  for every artifact above; format packages and recommendations are
  insert-only and versioned (originals are never overwritten).
- `main.py` -- new routes under `/automation/*` (project readiness,
  format packages, campaigns, analytics, improvement engine, workflow
  designer, scheduler, provider introspection, event polling). Every
  existing route from Phases 1-4 is unchanged.
- `tests/test_automation_studio.py` -- 31 offline tests covering every
  module above.

**Changed**
- Nothing. Every Phase 1-4 file is byte-for-byte identical to before
  this phase; `main.py` only received additions (verified: 0 lines
  removed, 557 lines added).

**Notes on scope / honest seams** (consistent with Phase 4's own
`NullConnector` philosophy -- prepare real artifacts, never fabricate
ones this repo can't actually produce):
- Print formats (`pdf`, `hardcover`, `paperback`, `large_print`,
  `coloring_book`, `activity_book`) produce real, checkable production
  specs (trim size, bleed, DPI) plus a human-readable brief -- not a
  rendered interior PDF. Wiring a layout/rendering engine into
  `FormatPackageGenerator._print_format` is the next step for that.
- `audiobook` produces a real narration script and timing spec; no
  audio is synthesized (register a TTS provider to automate that).
- The `voice`, `video`, and `ads` workflow steps are documented seams --
  they record intent and return a clear "manual or provider required"
  status rather than pretending to do work this repo has no
  credentials or synthesis capability for.
- Direct marketplace publishing still goes through Phase 4's
  `NullConnector`: listings are packaged to disk for manual review
  unless a real, credentialed `PublishingConnector` is registered.

---

## Phase 4 -- Publishing Intelligence Studio

Added `core/publishing/`: market research aggregation, original
design-brief generation, AI-assisted listing copy, platform export
packaging (KDP/Etsy/Shopify/Gumroad/Payhip/WooCommerce), a marketing-copy
generator, and an approval/checklist automation workflow. New routes
under `/publishing/*`. Fully covered by `tests/test_publishing_studio.py`.

## Phase 3 -- Image Studio

Added `core/image/`: provider-agnostic image generation (character
sheets, expression sheets, turnarounds, scene illustrations,
backgrounds, props, book covers, coloring pages, thumbnails, merch art),
persisted with full prompt/provider/model/seed metadata. New routes
under `/images*`, `/image-types`, `/image-providers`. Covered by
`tests/test_image_studio.py` and `tests/test_image_studio_api.py`.

## Phase 2 -- World Engine

Added `core/world/`: persistent, provider-agnostic world memory --
maps, locations, timeline, cultures, governments, species, magic
systems, tech levels, character relationships, lore, encyclopedia
search, and continuity validation. New routes under `/worlds*`.

## Phase 1 -- Real, Working Core

Replaced every placeholder in the original scaffold with real, tested
logic: Story Science (readability/emotion/conflict/pacing analysis),
Character Memory (SQLite-backed, contradiction-blocking), a swappable
AI provider layer (OpenRouter/Anthropic/Ollama), a 14-specialist
Creative Council, and a real, spec-valid EPUB exporter. The original
root `/` route was preserved unchanged.
