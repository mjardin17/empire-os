/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PlatformSpecs {
  videoRatio?: string;
  maxDuration?: string;
  thumbSize?: string;
  maxFileSize?: string;
  bestLength?: string;
  captionStyle?: string;
}

export interface PlatformConfig {
  id: string;
  name: string;
  category: string;
  charLimit: number;
  specs: PlatformSpecs;
  contentRules: string[];
  prompt: string;
  platformBestPractices: string;
}

export interface AnalystInsights {
  theme: string;
  entities: string[];
  audience: string;
  tone: string;
}

export interface CriticReview {
  passed: boolean;
  score: number; // 0-100 style compliance
  issues: string[];
  revisions: string;
}

export interface HookScoreBreakdown {
  overallScore: number;
  lengthScore: number;
  sentimentScore: number;
  hookStrengthScore: number;
  relevanceScore: number;
  readabilityGrade: string;
  suggestedAction: string;
}

export interface PlatformGeneration {
  platformId: string;
  status: 'passed' | 'warning' | 'failed';
  originalDraft: string;
  finalContent: string;
  charCount: number;
  critic: CriticReview;
  scoring: HookScoreBreakdown;
  specialistBotName?: string;
  specialistBotAvatar?: string;
  specialistBotTone?: string;
  specialistBotPacing?: string;
  specialistBotMetadata?: string;
}

export interface MultiAgentResponse {
  success: boolean;
  rawScript: string;
  timestamp: string;
  analyst: AnalystInsights;
  generations: PlatformGeneration[];
  isSimulated?: boolean;
}
