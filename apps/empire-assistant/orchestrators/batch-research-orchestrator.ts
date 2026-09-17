/**
 * Batch Research Orchestrator — Manage 36-video research batches
 *
 * Orchestrates parallel research execution across multiple topics/channels
 * with intelligent queue management and performance prediction integration.
 *
 * Features:
 * - Process up to 36 topics in parallel (6 agents × 6 concurrent jobs)
 * - Route topics across GG/IL/LO channels based on audience fit
 * - Predict performance before render (prevent wasted render budget)
 * - Optimize render queue by predicted performance (highest ROI first)
 * - Track batch progress with real-time status updates
 */

import { AIRouter } from '@empire-os/core';
import { orchestrateResearchToVideo, ResearchToVideoInput } from './research-orchestrator';
import { predictVideoPerformance } from './performance-predictor';

export interface BatchTopic {
  id: string;
  topic: string;
  primaryChannel?: 'gg' | 'il' | 'lo' | 'ed'; // If unset, coordinator picks optimal
  targetDuration?: number; // minutes (default: channel-specific)
  priority?: number; // 1-10 (default: 5)
  tags?: string[]; // For analytics grouping
}

export interface BatchResearchJob {
  batchId: string;
  topicId: string;
  topic: string;
  assignedChannel: 'gg' | 'il' | 'lo' | 'ed';
  episodeNum: number;
  jobId: string;
  status: 'queued' | 'researching' | 'completed' | 'failed';
  progress: number; // 0-100
  estimatedViews?: number;
  estimatedEngagement?: number;
  predictedRetention?: number;
  renderPriority?: number; // 1-36 (1 = render first)
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface BatchResearchRequest {
  id: string; // batch_1726158000000
  topics: BatchTopic[]; // 12-36 topics
  targetChannels?: string[]; // e.g., ['gg', 'il', 'lo']
  maxConcurrentJobs?: number; // default: 6 (limited by API rate limits)
  autoApproveThreshold?: number; // 0-100 (skip render if predicted views < threshold)
  includePredictions?: boolean; // default: true
  includeABTesting?: boolean; // Generate 2 variants per topic
}

export interface BatchResearchOutput {
  batchId: string;
  totalTopics: number;
  completedCount: number;
  failedCount: number;
  jobs: BatchResearchJob[];
  renderQueue: Array<{
    jobId: string;
    topic: string;
    channel: string;
    renderPriority: number;
    predictedViews: number;
    predictedEngagement: number;
  }>;
  estimatedTotalViews: number;
  estimatedTotalEngagement: number;
  totalRenderTimeHours: number;
  timestamp: Date;
}

/**
 * Main batch orchestrator
 * Processes multiple topics in parallel with intelligent routing and prediction
 */
export async function orchestrateBatchResearch(
  request: BatchResearchRequest,
  aiRouter: AIRouter,
  onProgress?: (batchId: string, job: BatchResearchJob) => void
): Promise<BatchResearchOutput> {
  const batchId = request.id;
  const jobs: BatchResearchJob[] = [];
  const maxConcurrent = request.maxConcurrentJobs || 6;

  console.log(`[BATCH ORCHESTRATOR] Starting batch: ${batchId}`);
  console.log(`[BATCH ORCHESTRATOR] Topics: ${request.topics.length}`);
  console.log(`[BATCH ORCHESTRATOR] Max concurrent: ${maxConcurrent}`);

  // Step 1: Route topics to optimal channels
  const routedTopics = await routeTopicsToChannels(request.topics, aiRouter);

  // Step 2: Queue jobs with rate limiting
  let jobIndex = 0;
  const jobQueue: Promise<BatchResearchJob>[] = [];

  for (const routed of routedTopics) {
    const jobId = `apex_batch_${batchId}_${routed.channel}_${routed.episodeNum}`;

    const job: BatchResearchJob = {
      batchId,
      topicId: routed.id,
      topic: routed.topic,
      assignedChannel: routed.channel,
      episodeNum: routed.episodeNum,
      jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
    };

    jobs.push(job);

    // Add to concurrent queue
    if (jobQueue.length < maxConcurrent) {
      jobQueue.push(
        executeResearchJob(job, request, aiRouter, onProgress)
      );
    }

    // Process queue in batches
    if (jobQueue.length >= maxConcurrent || jobIndex === routedTopics.length - 1) {
      const results = await Promise.allSettled(jobQueue);
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const completedJob = result.value;
          const originalIndex = jobs.findIndex(j => j.jobId === completedJob.jobId);
          if (originalIndex >= 0) {
            jobs[originalIndex] = completedJob;
          }
        }
      });
      jobQueue.length = 0;
    }

    jobIndex++;
  }

  // Step 3: Predict performance for each completed job
  console.log(`[BATCH ORCHESTRATOR] Running performance predictions...`);
  const predictionsPromises = jobs
    .filter(j => j.status === 'completed')
    .map(async (job) => {
      const prediction = await predictVideoPerformance(
        job.topic,
        job.assignedChannel,
        aiRouter
      );
      return { jobId: job.jobId, prediction };
    });

  const predictions = await Promise.all(predictionsPromises);
  predictions.forEach(({ jobId, prediction }) => {
    const job = jobs.find(j => j.jobId === jobId);
    if (job) {
      job.estimatedViews = prediction.estimatedViews;
      job.estimatedEngagement = prediction.estimatedEngagement;
      job.predictedRetention = prediction.predictedRetention;
    }
  });

  // Step 4: Build render queue (highest predicted performance first)
  const renderableJobs = jobs
    .filter(j => j.status === 'completed' && (j.estimatedViews || 0) > (request.autoApproveThreshold || 0))
    .sort((a, b) => (b.estimatedViews || 0) - (a.estimatedViews || 0));

  const renderQueue = renderableJobs.map((job, idx) => ({
    jobId: job.jobId,
    topic: job.topic,
    channel: job.assignedChannel,
    renderPriority: idx + 1,
    predictedViews: job.estimatedViews || 0,
    predictedEngagement: job.estimatedEngagement || 0,
  }));

  // Update priority in jobs array
  renderQueue.forEach(item => {
    const job = jobs.find(j => j.jobId === item.jobId);
    if (job) job.renderPriority = item.renderPriority;
  });

  const completedCount = jobs.filter(j => j.status === 'completed').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const totalViews = renderQueue.reduce((sum, r) => sum + r.predictedViews, 0);
  const totalEngagement = renderQueue.reduce((sum, r) => sum + r.predictedEngagement, 0);
  const totalRenderHours = (renderableJobs.length * 7.5) / 60; // ~7.5 min per video, max 2 concurrent

  console.log(`[BATCH ORCHESTRATOR] Batch ${batchId} complete`);
  console.log(`[BATCH ORCHESTRATOR] Completed: ${completedCount}, Failed: ${failedCount}`);
  console.log(`[BATCH ORCHESTRATOR] Predicted total views: ${totalViews.toLocaleString()}`);

  return {
    batchId,
    totalTopics: request.topics.length,
    completedCount,
    failedCount,
    jobs,
    renderQueue,
    estimatedTotalViews: totalViews,
    estimatedTotalEngagement: totalEngagement,
    totalRenderTimeHours: totalRenderHours,
    timestamp: new Date(),
  };
}

/**
 * Route topics to optimal channels based on audience fit and content type
 */
async function routeTopicsToChannels(
  topics: BatchTopic[],
  aiRouter: AIRouter
): Promise<Array<BatchTopic & { channel: 'gg' | 'il' | 'lo' | 'ed'; episodeNum: number }>> {
  const channels = {
    gg: { name: 'Gods & Glory', audience: 'adults', episodeCount: 0 },
    il: { name: 'Iron Legends', audience: 'tweens/young adults', episodeCount: 0 },
    lo: { name: 'Little Olympus', audience: 'kids', episodeCount: 0 },
    ed: { name: 'Empire Decoded', audience: 'educational', episodeCount: 0 },
  };

  // Simple heuristic routing (can be enhanced with ML)
  const routed: Array<BatchTopic & { channel: 'gg' | 'il' | 'lo' | 'ed'; episodeNum: number }> = [];

  for (const topic of topics) {
    let assignedChannel: 'gg' | 'il' | 'lo' | 'ed';

    if (topic.primaryChannel) {
      assignedChannel = topic.primaryChannel;
    } else {
      // Heuristic: route based on topic keywords
      const topicLower = topic.topic.toLowerCase();

      if (topicLower.includes('child') || topicLower.includes('kid') || topicLower.includes('princess')) {
        assignedChannel = 'lo';
      } else if (topicLower.includes('battle') || topicLower.includes('warrior') || topicLower.includes('sword')) {
        assignedChannel = 'il';
      } else if (topicLower.includes('god') || topicLower.includes('myth') || topicLower.includes('ancient')) {
        assignedChannel = 'gg';
      } else {
        assignedChannel = 'ed'; // Default to educational
      }
    }

    channels[assignedChannel].episodeCount++;

    routed.push({
      ...topic,
      channel: assignedChannel,
      episodeNum: channels[assignedChannel].episodeCount,
    });
  }

  console.log(`[BATCH ORCHESTRATOR] Topic routing complete:`);
  Object.entries(channels).forEach(([ch, data]) => {
    if (data.episodeCount > 0) {
      console.log(`  ${ch}: ${data.episodeCount} topics`);
    }
  });

  return routed;
}

/**
 * Execute single research job with error handling
 */
async function executeResearchJob(
  job: BatchResearchJob,
  request: BatchResearchRequest,
  aiRouter: AIRouter,
  onProgress?: (batchId: string, job: BatchResearchJob) => void
): Promise<BatchResearchJob> {
  const updatedJob = { ...job, status: 'researching' as const, startedAt: new Date() };
  onProgress?.(request.id, updatedJob);

  try {
    const researchInput: ResearchToVideoInput = {
      topic: job.topic,
      channelType: 'documentary',
      targetDuration: 45,
      targetAudience: 'general',
      channel: job.assignedChannel,
      episodeNum: job.episodeNum,
      aiRouter,
      onProgress: (stage) => {
        updatedJob.progress = Math.min(updatedJob.progress + 10, 95);
        onProgress?.(request.id, updatedJob);
      },
    };

    const result = await orchestrateResearchToVideo(researchInput);

    if (result.success) {
      updatedJob.status = 'completed';
      updatedJob.progress = 100;
      updatedJob.completedAt = new Date();
      console.log(`[BATCH ORCHESTRATOR] ✅ ${job.jobId}`);
    } else {
      updatedJob.status = 'failed';
      updatedJob.error = result.error;
      console.error(`[BATCH ORCHESTRATOR] ❌ ${job.jobId}: ${result.error}`);
    }
  } catch (error) {
    updatedJob.status = 'failed';
    updatedJob.error = error instanceof Error ? error.message : String(error);
    console.error(`[BATCH ORCHESTRATOR] Exception in ${job.jobId}:`, error);
  }

  onProgress?.(request.id, updatedJob);
  return updatedJob;
}

/**
 * Get current batch status
 */
export async function getBatchStatus(
  batchId: string,
  memoryBus: any
): Promise<BatchResearchOutput | null> {
  const batch = memoryBus.get(`batch:${batchId}`);
  if (!batch) return null;

  return batch;
}

/**
 * Cancel batch and cleanup
 */
export async function cancelBatch(
  batchId: string,
  memoryBus: any
): Promise<void> {
  const batch = memoryBus.get(`batch:${batchId}`);
  if (batch) {
    batch.jobs.forEach((job: BatchResearchJob) => {
      if (job.status === 'queued' || job.status === 'researching') {
        job.status = 'failed';
        job.error = 'Batch cancelled by user';
      }
    });
    memoryBus.set(`batch:${batchId}`, batch);
    console.log(`[BATCH ORCHESTRATOR] Batch ${batchId} cancelled`);
  }
}

export default {
  orchestrateBatchResearch,
  getBatchStatus,
  cancelBatch,
};
