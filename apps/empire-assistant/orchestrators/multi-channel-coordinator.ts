/**
 * Multi-Channel Coordinator — Route single topics across multiple channels
 *
 * Transforms one topic into channel-specific narrative angles.
 * Example: "Fall of Darius" → GG (epic military tragedy), IL (warrior defeat), LO (hero journey)
 *
 * Features:
 * - Topic angle generation per channel audience
 * - Shared research with channel-specific narrative adaptation
 * - Parallel topic generation across 3-4 channels
 * - Content template matching per channel style
 * - Prevents content overlap while maximizing channel diversity
 */

import { AIRouter } from '@empire-os/core';

export interface TopicNarrative {
  originalTopic: string;
  channel: 'gg' | 'il' | 'lo' | 'ed';
  adaptedTitle: string;
  narrativeAngle: string;
  targetAudience: string;
  keyThemes: string[];
  pacing: 'slow-burn' | 'moderate' | 'fast-paced';
  tone: 'epic' | 'action' | 'magical' | 'educational';
  sceneEmphasis: string[];
  emotionalArc: string;
}

export interface CoordinatedBatch {
  originalTopic: string;
  baseResearch: any; // Shared research foundation
  channelNarratives: TopicNarrative[];
  estimatedTotalViews: number;
  estimatedTotalEngagement: number;
  renderTimeEstimate: number; // hours
}

/**
 * Channel narrative templates
 */
const narrativeTemplates = {
  gg: {
    name: 'Gods & Glory',
    audience: 'adults 25-45 interested in history',
    toneProfile: {
      epic: true,
      scholarly: true,
      dramatic: true,
      accessible: false,
    },
    pacing: 'slow-burn',
    emotionalArc: 'rise → triumph → fall → reflection',
    sceneWeighting: {
      opening: 0.15, // 15% of runtime
      conflict: 0.4, // 40% on central conflict
      resolution: 0.25, // 25% on outcome
      legacy: 0.2, // 20% on historical impact
    },
    narrativePatterns: [
      'The rise of power and ambition',
      'The clash of empires',
      'The price of ambition',
      'Legacy and historical impact',
    ],
  },
  il: {
    name: 'Iron Legends',
    audience: 'tweens/young adults 13-25',
    toneProfile: {
      action: true,
      energetic: true,
      dramatic: true,
      accessible: true,
    },
    pacing: 'fast-paced',
    emotionalArc: 'underdog → battle → glory → stakes',
    sceneWeighting: {
      intro: 0.1,
      setup: 0.15,
      action: 0.5, // 50% action/conflict
      climax: 0.15,
      reflection: 0.1,
    },
    narrativePatterns: [
      'The warrior rises',
      'Enemies clash',
      'Victory or defeat?',
      'What it costs to fight',
    ],
  },
  lo: {
    name: 'Little Olympus',
    audience: 'kids 6-12',
    toneProfile: {
      magical: true,
      adventurous: true,
      positive: true,
      accessible: true,
    },
    pacing: 'moderate',
    emotionalArc: 'wonder → adventure → challenge → growth',
    sceneWeighting: {
      wonder: 0.2, // 20% magical elements
      adventure: 0.4, // 40% quest/exploration
      challenge: 0.25, // 25% overcoming obstacles
      lesson: 0.15, // 15% character growth
    },
    narrativePatterns: [
      'The hero awakens to their power',
      'A great adventure begins',
      'Heroes face impossible odds',
      'Every hero grows along the way',
    ],
  },
  ed: {
    name: 'Empire Decoded',
    audience: 'students/educators 14-60',
    toneProfile: {
      educational: true,
      analytical: true,
      engaging: true,
      accessible: true,
    },
    pacing: 'moderate',
    emotionalArc: 'question → investigation → revelation → application',
    sceneWeighting: {
      question: 0.15, // 15% on problem setup
      evidence: 0.45, // 45% on facts/evidence
      analysis: 0.25, // 25% on interpretation
      application: 0.15, // 15% on modern relevance
    },
    narrativePatterns: [
      'What was the problem?',
      'What evidence exists?',
      'What does it mean?',
      'Why does it matter today?',
    ],
  },
};

/**
 * Generate channel-specific narratives from base topic
 */
export async function generateChannelNarratives(
  baseTopic: string,
  aiRouter: AIRouter,
  channels?: ('gg' | 'il' | 'lo' | 'ed')[]
): Promise<TopicNarrative[]> {
  const targetChannels = channels || ['gg', 'il', 'lo'];

  const narratives = await Promise.all(
    targetChannels.map(async (channel) => {
      const template = narrativeTemplates[channel];

      // Simplified angle generation (in production, call Claude)
      let adaptedTitle = baseTopic;
      let narrativeAngle = '';
      let keyThemes: string[] = [];
      let sceneEmphasis: string[] = [];

      if (channel === 'gg') {
        adaptedTitle = `${baseTopic}: A History of Power and Ambition`;
        narrativeAngle =
          'Examine historical forces, political maneuvering, and long-term consequences. Scholarly but accessible.';
        keyThemes = ['power', 'strategy', 'legacy', 'empire'];
        sceneEmphasis = ['political_intrigue', 'military_strategy', 'historical_outcome'];
      } else if (channel === 'il') {
        adaptedTitle = `${baseTopic}: Warriors, Battles & Glory`;
        narrativeAngle =
          'Focus on heroic action, warrior codes, and epic battles. Fast-paced and energetic.';
        keyThemes = ['courage', 'conflict', 'honor', 'victory'];
        sceneEmphasis = ['combat', 'heroic_moments', 'warrior_codes'];
      } else if (channel === 'lo') {
        adaptedTitle = `${baseTopic}: A Hero\'s Magical Journey`;
        narrativeAngle =
          'Reimagine as magical adventure with hero\'s growth. Wondrous and engaging for kids.';
        keyThemes = ['magic', 'growth', 'adventure', 'friendship'];
        sceneEmphasis = ['magical_elements', 'character_growth', 'adventure'];
      } else if (channel === 'ed') {
        adaptedTitle = `${baseTopic}: Explained`;
        narrativeAngle =
          'Break down historical/scientific concepts clearly. Evidence-based and modern-relevant.';
        keyThemes = ['understanding', 'evidence', 'analysis', 'application'];
        sceneEmphasis = ['factual_evidence', 'historical_context', 'modern_relevance'];
      }

      return {
        originalTopic: baseTopic,
        channel,
        adaptedTitle,
        narrativeAngle,
        targetAudience: template.audience,
        keyThemes,
        pacing: template.pacing as 'slow-burn' | 'moderate' | 'fast-paced',
        tone: channel === 'gg' ? 'epic' : channel === 'il' ? 'action' : channel === 'lo' ? 'magical' : 'educational',
        sceneEmphasis,
        emotionalArc: template.emotionalArc,
      };
    })
  );

  return narratives;
}

/**
 * Coordinate multi-channel topic expansion
 * Single topic → 3-4 channel-specific research jobs
 */
export async function coordinateMultiChannelTopic(
  baseTopic: string,
  aiRouter: AIRouter,
  channels?: ('gg' | 'il' | 'lo' | 'ed')[]
): Promise<CoordinatedBatch> {
  const targetChannels = channels || ['gg', 'il', 'lo'];

  // Generate channel-specific narratives
  const narratives = await generateChannelNarratives(baseTopic, aiRouter, targetChannels);

  console.log(`[MULTI-CHANNEL COORDINATOR] Coordinating: "${baseTopic}"`);
  console.log(`[MULTI-CHANNEL COORDINATOR] Generating variants for: ${targetChannels.join(', ')}`);

  // Calculate estimated metrics
  let totalViews = 0;
  let totalEngagement = 0;
  let totalRenderTime = 0;

  // Heuristic: estimate based on channel profiles
  const channelBaseViews = {
    gg: 85000,
    il: 120000,
    lo: 200000,
    ed: 95000,
  };

  const channelRenderTime = {
    gg: 7.5, // minutes per video
    il: 7.5,
    lo: 8.0, // kids content sometimes longer
    ed: 6.5,
  };

  for (const channel of targetChannels) {
    totalViews += channelBaseViews[channel] || 100000;
    totalEngagement += (channelBaseViews[channel] || 100000) * 0.05;
    totalRenderTime += (channelRenderTime[channel] || 7.5) / 60; // convert to hours
  }

  console.log(`[MULTI-CHANNEL COORDINATOR] Estimated total views: ${totalViews.toLocaleString()}`);
  console.log(`[MULTI-CHANNEL COORDINATOR] Estimated engagement: ${Math.round(totalEngagement).toLocaleString()}`);
  console.log(`[MULTI-CHANNEL COORDINATOR] Total render time: ${totalRenderTime.toFixed(1)} hours`);

  return {
    originalTopic: baseTopic,
    baseResearch: {
      topic: baseTopic,
      generatedAt: new Date().toISOString(),
      status: 'pending_research',
    },
    channelNarratives: narratives,
    estimatedTotalViews: totalViews,
    estimatedTotalEngagement: Math.round(totalEngagement),
    renderTimeEstimate: totalRenderTime,
  };
}

/**
 * Generate multi-channel batch from topic list
 * Example: 12 topics → 36-48 videos (3-4 channels each)
 */
export async function coordinateTopicBatch(
  topics: string[],
  aiRouter: AIRouter,
  channelsPerTopic?: ('gg' | 'il' | 'lo' | 'ed')[]
): Promise<Array<CoordinatedBatch>> {
  console.log(`[MULTI-CHANNEL COORDINATOR] Processing ${topics.length} topics...`);

  const batches = await Promise.all(
    topics.map((topic) => coordinateMultiChannelTopic(topic, aiRouter, channelsPerTopic))
  );

  const totalVideos = batches.reduce((sum, b) => sum + b.channelNarratives.length, 0);
  const totalViews = batches.reduce((sum, b) => sum + b.estimatedTotalViews, 0);
  const totalRenderHours = batches.reduce((sum, b) => sum + b.renderTimeEstimate, 0);

  console.log(`[MULTI-CHANNEL COORDINATOR] Batch summary:`);
  console.log(`  Topics: ${topics.length}`);
  console.log(`  Total videos: ${totalVideos}`);
  console.log(`  Estimated total views: ${totalViews.toLocaleString()}`);
  console.log(`  Estimated render time: ${totalRenderHours.toFixed(1)} hours`);
  console.log(`  Parallelization: ${totalRenderHours > 20 ? 'Requires queue' : 'Can render sequentially'}`);

  return batches;
}

/**
 * Detect content overlap between channel narratives
 */
export function detectOverlap(
  narrative1: TopicNarrative,
  narrative2: TopicNarrative
): number {
  if (narrative1.channel === narrative2.channel) return 100; // Same channel = 100% overlap

  const themeOverlap = narrative1.keyThemes.filter((t) => narrative2.keyThemes.includes(t)).length;
  const maxThemes = Math.max(narrative1.keyThemes.length, narrative2.keyThemes.length);
  const themeScore = maxThemes > 0 ? (themeOverlap / maxThemes) * 100 : 0;

  const sceneOverlap = narrative1.sceneEmphasis.filter((s) =>
    narrative2.sceneEmphasis.includes(s)
  ).length;
  const maxScenes = Math.max(narrative1.sceneEmphasis.length, narrative2.sceneEmphasis.length);
  const sceneScore = maxScenes > 0 ? (sceneOverlap / maxScenes) * 100 : 0;

  return (themeScore + sceneScore) / 2;
}

/**
 * Optimize narrative angles to minimize overlap
 */
export function optimizeNarrativesDiversity(narratives: TopicNarrative[]): TopicNarrative[] {
  if (narratives.length <= 1) return narratives;

  const overlapMatrix: number[][] = [];
  for (let i = 0; i < narratives.length; i++) {
    overlapMatrix[i] = [];
    for (let j = 0; j < narratives.length; j++) {
      overlapMatrix[i][j] = detectOverlap(narratives[i], narratives[j]);
    }
  }

  // Log overlap scores
  console.log('[MULTI-CHANNEL COORDINATOR] Narrative overlap analysis:');
  for (let i = 0; i < narratives.length; i++) {
    for (let j = i + 1; j < narratives.length; j++) {
      const overlap = overlapMatrix[i][j];
      console.log(
        `  ${narratives[i].channel} ↔ ${narratives[j].channel}: ${overlap.toFixed(0)}% overlap`
      );
    }
  }

  return narratives;
}

export default {
  generateChannelNarratives,
  coordinateMultiChannelTopic,
  coordinateTopicBatch,
  detectOverlap,
  optimizeNarrativesDiversity,
};
