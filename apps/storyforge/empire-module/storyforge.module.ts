/**
 * StoryForge EmpireModule — Empire OS adapter for the StoryForge Engine (Phase 5).
 *
 * Phases 1-5: story science, character memory, world engine, image studio,
 * publishing intelligence, empire automation studio (campaigns, formats,
 * workflows, scheduler, event bus).
 *
 * Architecture: the book studio (Bookmaker, port 3010 by default) runs as its own process.
 * Set STORYFORGE_BASE_URL to point somewhere else (e.g. the Python StoryForge engine).
 * This module is the Empire OS "face" — registration, health, events, workflows.
 * All business logic lives in the book studio.
 */

import { RemoteAppModule } from '@empire-os/core'
import type { RemoteAppOptions } from '@empire-os/core'
import { HIGGSFIELD_PLUGIN } from './higgsfield.plugin.js'
import { STORY_PIPELINE_WORKFLOW } from './workflows/story-pipeline.js'

const DEFAULT_STORYFORGE_URL = 'http://localhost:3010'
const MODULE_ID = 'storyforge'

/** Remote-app options: registered with the Module Gateway as the StoryForge descriptor */
const STORYFORGE_OPTIONS: RemoteAppOptions = {
  moduleId: MODULE_ID,
  name: 'StoryForge Engine',
  version: '5.0.0',
  description:
    'Narrative synthesis + publishing + automation engine. ' +
    'Phases 1-5: story science, character memory, world engine, image studio, ' +
    'publishing intelligence, empire automation studio.',
  capabilities: [
    // Bookmaker book studio
    'book-list', 'book-start',
    // Phase 1
    'story-science', 'character-memory', 'character-get', 'council-review', 'book-export',
    // Phase 2
    'world-engine', 'world-search', 'continuity-validate',
    // Phase 3
    'image-generate', 'image-list',
    // Phase 4
    'publishing-studio', 'market-research', 'design-brief', 'book-metadata',
    'listing-copy', 'marketing-generate', 'platform-export', 'approve-publish',
    // Phase 5
    'automation-ready', 'automation-status', 'format-generate', 'format-generate-all',
    'campaign-create', 'campaign-start', 'campaign-improve', 'analytics-record',
    'analytics-summary', 'workflow-run', 'schedule-job', 'event-poll',
  ],
  endpoints: [
    // Phase 1
    { path: '/science/analyze',                method: 'POST' as const, description: 'Analyze manuscript' },
    { path: '/characters',                      method: 'POST' as const, description: 'Create character' },
    { path: '/council/review',                  method: 'POST' as const, description: 'Creative Council review (14 specialists)' },
    { path: '/book/export/epub',                method: 'POST' as const, description: 'Export EPUB 3' },
    // Phase 2
    { path: '/worlds',                          method: 'POST' as const, description: 'Create world' },
    { path: '/worlds/{id}/encyclopedia/search', method: 'GET'  as const, description: 'Search world encyclopedia (FTS5)' },
    { path: '/worlds/{id}/continuity/validate', method: 'GET'  as const, description: 'Run 5 continuity checks' },
    // Phase 3
    { path: '/images/generate',                 method: 'POST' as const, description: 'Generate image (Higgsfield/OpenAI/ComfyUI/Placeholder)' },
    { path: '/images',                          method: 'GET'  as const, description: 'List images with filters' },
    // Phase 4
    { path: '/publishing/research/analyze',     method: 'POST' as const, description: 'Aggregate market research' },
    { path: '/publishing/approve',              method: 'POST' as const, description: 'Approve book → package all platforms' },
    // Phase 5
    { path: '/automation/projects/{id}/ready',       method: 'POST' as const, description: 'Mark project ready for automation' },
    { path: '/automation/projects/{id}/status',      method: 'GET'  as const, description: 'Get automation status' },
    { path: '/automation/format-packages/generate',  method: 'POST' as const, description: 'Generate one format package' },
    { path: '/automation/format-packages/generate-all', method: 'POST' as const, description: 'Generate all format packages' },
    { path: '/automation/campaigns',                 method: 'POST' as const, description: 'Create campaign' },
    { path: '/automation/campaigns/{id}/start',      method: 'POST' as const, description: 'Start campaign' },
    { path: '/automation/campaigns/{id}/improve',    method: 'POST' as const, description: 'Run improvement engine' },
    { path: '/automation/analytics/metrics',         method: 'POST' as const, description: 'Record analytics metric' },
    { path: '/automation/workflows',                 method: 'POST' as const, description: 'Create automation workflow' },
    { path: '/automation/workflows/{id}/run',        method: 'POST' as const, description: 'Run automation workflow' },
    { path: '/automation/schedule',                  method: 'POST' as const, description: 'Schedule a job' },
    { path: '/automation/scheduler/run-due',         method: 'POST' as const, description: 'Execute all due scheduled jobs' },
    { path: '/automation/events',                    method: 'GET'  as const, description: 'Poll Phase 5 event log' },
    { path: '/empire/health',                        method: 'GET'  as const, description: 'Health check', auth: false },
    // Bookmaker book studio
    { path: '/empire/books',                         method: 'GET'  as const, description: 'List finished books and Book Factory runs' },
    { path: '/empire/books/start',                   method: 'POST' as const, description: 'Start a book (creates a DRY_RUN Book Factory run)' },
  ],
  healthPath: '/empire/health',
  baseUrlEnv: 'STORYFORGE_BASE_URL',
  defaultBaseUrl: DEFAULT_STORYFORGE_URL,
  // Empire OS events forwarded to the book studio's /empire/event (fire-and-forget)
  forwardTopics: ['render.completed', 'render.failed', 'workflow.step.completed', 'system.alert'],
  // The StoryForge engine has more routes than are declared here, so pass every path through.
  restrictToEndpoints: false,
  priority: 20,
}

export class StoryForgeModule extends RemoteAppModule {
  constructor() {
    super(STORYFORGE_OPTIONS)
  }

  protected override async onInit(): Promise<void> {
    const { pluginRegistry, workflowEngine } = this.services

    // Register Higgsfield as cinematic connector
    await pluginRegistry.register(HIGGSFIELD_PLUGIN)

    // Register story-to-render workflow (includes Phase 5 automation steps)
    await workflowEngine.define(STORY_PIPELINE_WORKFLOW)

    // Register with the Module Gateway, subscribe the forwarded topics, announce the module
    await super.onInit()
  }
}

export default StoryForgeModule
