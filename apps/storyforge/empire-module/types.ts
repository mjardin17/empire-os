/**
 * StoryForge TypeScript types — mirrors of the Python dataclasses in storyforge-engine.
 * These are used by the Empire OS EmpireModule adapter only.
 * The Python engine is the source of truth; keep these in sync when Python types change.
 */

// ── Story Science ──────────────────────────────────────────────────────────────

export interface ReadabilityReport {
  fleschKincaidGrade: number
  fleschReadingEase: number
  avgSentenceLength: number
  avgWordLength: number
}

export interface EmotionReport {
  dominant: string
  scores: Record<string, number>
}

export interface ConflictReport {
  conflictDensity: number   // 0–1
  tensionPoints: number
}

export interface PacingReport {
  avgSceneLength: number
  varianceScore: number
  pacing: 'slow' | 'moderate' | 'fast'
}

export interface ScienceAnalysisResult {
  readability: ReadabilityReport
  emotion: EmotionReport
  conflict: ConflictReport
  pacing: PacingReport
  plotHoleFlags: string[]
  notes: string[]
}

// ── Character Memory ───────────────────────────────────────────────────────────

export interface Character {
  id: string
  projectId: string
  name: string
  attributes: Record<string, string>
}

export interface CharacterEvent {
  id: string
  characterId: string
  eventType: string
  description: string
  storyContext?: string
  createdAt: number
}

// ── World Engine ───────────────────────────────────────────────────────────────

export interface World {
  id: string
  projectId: string
  name: string
  createdAt: number
}

export interface Location {
  id: string
  worldId: string
  name: string
  locationType: string
  description: string
  parentLocationId?: string
  coordinates?: { x: number; y: number }
}

// ── Image Studio ───────────────────────────────────────────────────────────────

export type ImageType =
  | 'character_sheet'
  | 'expression_sheet'
  | 'turnaround'
  | 'scene_illustration'
  | 'background'
  | 'props'
  | 'book_cover'
  | 'coloring_page'
  | 'thumbnail'
  | 'merchandise_art'

export type ImageProvider = 'placeholder' | 'comfyui' | 'openai' | 'higgsfield'

export interface ImageAsset {
  id: string
  projectId: string
  imageType: ImageType
  prompt: string
  negativePrompt: string
  provider: ImageProvider
  model: string
  seed?: number
  width: number
  height: number
  status: 'pending' | 'generating' | 'completed' | 'failed'
  outputPath?: string
  errorMessage?: string
  characterId?: string
  sceneId?: string
  worldId?: string
  createdAt: number
}

// ── Publishing Studio ──────────────────────────────────────────────────────────

export type SellingPlatform = 'kdp' | 'etsy' | 'shopify' | 'gumroad' | 'payhip' | 'woocommerce'

export interface BookMetadata {
  id: string
  projectId: string
  title: string
  subtitle: string
  description: string
  author: string
  categories: string[]
  keywords: string[]
  marketingCopy: string
  price?: number
  pageCount?: number
  language: string
  createdAt: number
  updatedAt: number
}

// ── Module Gateway request/response shapes ─────────────────────────────────────

export interface StoryForgeRequest {
  capability: string
  payload: unknown
}

export interface StoryForgeResponse {
  success: boolean
  data?: unknown
  error?: string
}
