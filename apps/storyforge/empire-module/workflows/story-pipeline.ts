/**
 * story-to-render — StoryForge WorkflowDefinition for Empire OS Workflow Engine.
 *
 * Full pipeline (Phases 1-5):
 *   premise → science analysis → character matrix → world build
 *   → council review → image generation (Higgsfield) → EPUB export
 *   → automation ready → format packages → campaign → publish approval
 */

import type { WorkflowDefinition } from '@empire-os/core'

export const STORY_PIPELINE_WORKFLOW: WorkflowDefinition = {
  id: 'story-to-render',
  name: 'Story → Render → Publish Pipeline',
  version: '2.0.0',
  description:
    'Full StoryForge pipeline (Phases 1-5): ' +
    'premise analysis → characters → world → council review → ' +
    'image generation → EPUB export → format packages → campaign → publish approval.',
  initialStep: 'science-analyze',
  tags: ['storyforge', 'creative', 'publishing', 'automation'],
  triggers: [
    {
      type: 'api',
      inputSchema: {
        type: 'object',
        required: ['projectId', 'manuscriptText'],
        properties: {
          projectId:     { type: 'string' },
          manuscriptText: { type: 'string' },
          author:        { type: 'string' },
          worldName:     { type: 'string' },
          targetPlatforms: {
            type: 'array',
            items: { type: 'string', enum: ['kdp', 'etsy', 'shopify', 'gumroad', 'payhip'] },
          },
        },
      },
    },
    { type: 'manual' },
  ],
  steps: [

    // ── Phase 1: Story Science ─────────────────────────────────────────────────
    {
      id: 'science-analyze',
      type: 'action',
      name: 'Analyze Manuscript',
      description: 'Readability, emotion, conflict, pacing, plot-hole detection',
      moduleId: 'storyforge',
      action: 'POST /science/analyze',
      inputMapping: { text: 'manuscriptText' },
      outputMapping: {
        readability:   'analysis.readability',
        emotion:       'analysis.emotion',
        plotHoleFlags: 'analysis.plotHoleFlags',
      },
      onSuccess: 'create-characters',
      onFailure: null,
      timeoutMs: 30_000,
    },

    // ── Phase 1: Character Matrix ──────────────────────────────────────────────
    {
      id: 'create-characters',
      type: 'action',
      name: 'Build Character Matrix',
      description: 'Create SQLite-backed characters with guarded attributes',
      moduleId: 'storyforge',
      action: 'POST /characters',
      inputMapping: { project_id: 'projectId' },
      outputMapping: { id: 'characterId' },
      onSuccess: 'build-world',
      onFailure: null,
      timeoutMs: 15_000,
    },

    // ── Phase 2: World Engine ──────────────────────────────────────────────────
    {
      id: 'build-world',
      type: 'action',
      name: 'Build World Memory',
      description: 'Persistent world with locations, timeline, lore — EmpireMemorySync active',
      moduleId: 'storyforge',
      action: 'POST /worlds',
      inputMapping: { project_id: 'projectId', name: 'worldName' },
      outputMapping: { id: 'worldId' },
      onSuccess: 'council-review',
      onFailure: null,
      timeoutMs: 15_000,
    },

    // ── Phase 1: Creative Council ──────────────────────────────────────────────
    {
      id: 'council-review',
      type: 'action',
      name: 'Creative Council Review',
      description: '14 specialists (Story Architect, Character Designer, Continuity Inspector, etc.)',
      moduleId: 'storyforge',
      action: 'POST /council/review',
      inputMapping: { project_context: 'manuscriptText' },
      outputMapping: { feedback: 'councilFeedback' },
      onSuccess: 'generate-cover',
      onFailure: null,
      timeoutMs: 120_000,
      retryPolicy: { maxAttempts: 2, backoffMs: 5_000 },
    },

    // ── Phase 3: Image Studio — Cover (Higgsfield) ─────────────────────────────
    {
      id: 'generate-cover',
      type: 'action',
      name: 'Generate Book Cover',
      description: 'Cover image via Image Studio — Higgsfield provider (book_cover type)',
      moduleId: 'storyforge',
      action: 'POST /images/generate',
      inputMapping: {
        project_id: 'projectId',
        image_type:  '"book_cover"',
        provider:    '"higgsfield"',
      },
      outputMapping: { id: 'coverImageId', output_path: 'coverImagePath' },
      onSuccess: 'export-epub',
      onFailure: 'export-epub',   // non-fatal
      timeoutMs: 90_000,
    },

    // ── Phase 1: Book Export ───────────────────────────────────────────────────
    {
      id: 'export-epub',
      type: 'action',
      name: 'Export EPUB 3',
      description: 'Generate spec-valid EPUB 3 (stdlib only, no external dep)',
      moduleId: 'storyforge',
      action: 'POST /book/export/epub',
      inputMapping: { author: 'author' },
      outputMapping: { path: 'epubPath' },
      onSuccess: 'automation-ready',
      onFailure: null,
      timeoutMs: 60_000,
    },

    // ── Phase 5: Mark Ready → Automation Studio ────────────────────────────────
    {
      id: 'automation-ready',
      type: 'action',
      name: 'Mark Project Ready',
      description: 'Signal to Automation Studio — triggers format generation + campaign creation',
      moduleId: 'storyforge',
      action: 'POST /automation/projects/{projectId}/ready',
      inputMapping: { book_metadata_id: 'bookMetadataId' },
      outputMapping: { status: 'automationStatus' },
      onSuccess: 'generate-formats',
      onFailure: null,
      timeoutMs: 10_000,
    },

    // ── Phase 5: Generate All Format Packages ─────────────────────────────────
    {
      id: 'generate-formats',
      type: 'action',
      name: 'Generate Format Packages',
      description: 'KDP, EPUB, PDF, hardcover, paperback, audiobook, marketing_package',
      moduleId: 'storyforge',
      action: 'POST /automation/format-packages/generate-all',
      inputMapping: { project_id: 'projectId', book_metadata_id: 'bookMetadataId' },
      outputMapping: { format_packages: 'formatPackages' },
      onSuccess: 'create-campaign',
      onFailure: 'create-campaign',  // non-fatal
      timeoutMs: 120_000,
    },

    // ── Phase 5: Campaign ──────────────────────────────────────────────────────
    {
      id: 'create-campaign',
      type: 'action',
      name: 'Create Marketing Campaign',
      description: 'Campaign across KDP, Etsy, Shopify, Gumroad with scheduled posts',
      moduleId: 'storyforge',
      action: 'POST /automation/campaigns',
      inputMapping: {
        project_id: 'projectId',
        book_metadata_id: 'bookMetadataId',
        platforms: 'targetPlatforms',
      },
      outputMapping: { id: 'campaignId' },
      onSuccess: 'approve-publish',
      onFailure: 'approve-publish',  // non-fatal
      timeoutMs: 30_000,
    },

    // ── Human Approval: Publish ────────────────────────────────────────────────
    {
      id: 'approve-publish',
      type: 'human-approval',
      name: 'Approve for Publishing',
      description: 'Josh reviews format packages + campaign before platform export runs',
      moduleId: 'storyforge',
      action: 'POST /publishing/approve',
      approvers: ['josh'],
      approvalTimeoutMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
      onSuccess: null,   // workflow complete
      onFailure: null,
    },

  ],
}
