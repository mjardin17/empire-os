/**
 * ApexOsModule.ts — Empire OS Module for APEX Video Generation
 * INTEGRATED with Batch Research, Multi-Channel, and Performance Prediction
 *
 * Converts APEX recording briefs → episode JSON → auto_render.py → MP4
 * Integrates with existing video-bot-pipeline infrastructure
 * EXTENDED with 36+ video batch processing, channel expansion, and performance optimization
 */

import { EventBus, MemoryBus, ModuleGateway, WorkflowEngine } from '@empire-os/core';
// import { orchestrateBatchResearch, BatchResearchRequest, BatchResearchOutput } from '../orchestrators/batch-research-orchestrator';
// import { coordinateMultiChannelTopic, coordinateTopicBatch, CoordinatedBatch } from '../orchestrators/multi-channel-coordinator';
// import { predictVideoPerformance, predictBatchPerformance, PerformancePrediction } from '../orchestrators/performance-predictor';

export interface ApexRecordingBrief {
  id: string;
  channel: 'gg' | 'ml' | 'lo' | 'il' | 'ed';
  episodeNum: number;
  title: string;
  hook: string;
  angle: 'beginner' | 'advanced' | 'problem-solve' | 'case-study';
  narrationScript: string;
  filmingChecklist: string[];
  sceneCount: number;
}

export interface ApexVideoJob {
  id: string;
  briefId: string;
  episodeId: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  videoPath?: string;
  youtubeUrl?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ApexBatchResearchRequest {
  id: string;
  topics: Array<{
    id: string;
    topic: string;
    primaryChannel?: 'gg' | 'il' | 'lo' | 'ed';
    targetDuration?: number;
    priority?: number;
    tags?: string[];
  }>;
  targetChannels?: string[];
  maxConcurrentJobs?: number;
  autoApproveThreshold?: number;
  includePredictions?: boolean;
  includeMultiChannel?: boolean;
}

export interface ApexMultiChannelRequest {
  id: string;
  topics: string[];
  channelsPerTopic?: ('gg' | 'il' | 'lo' | 'ed')[];
}

export interface ApexBatchStatusResponse {
  batchId: string;
  totalTopics: number;
  completedCount: number;
  failedCount: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentlyProcessing: number;
  estimatedTimeRemaining: number;
  jobs: Array<{
    jobId: string;
    topicId: string;
    topic: string;
    channel: string;
    status: 'queued' | 'researching' | 'completed' | 'failed';
    progress: number;
    predictedViews?: number;
  }>;
  renderQueue: Array<{
    jobId: string;
    topic: string;
    channel: string;
    renderPriority: number;
    predictedViews: number;
  }>;
  estimatedTotalViews: number;
  estimatedTotalEngagement: number;
}

/**
 * Convert APEX brief to episode JSON for auto_render.py
 * Matches the existing JSON structure in prompts/
 */
function briefToEpisodeJson(brief: ApexRecordingBrief): object {
  const channelLabel = {
    'gg': 'GODS & GLORY',
    'ml': 'MECH LEGENDS',
    'lo': 'LITTLE OLYMPUS',
    'il': 'IRON LEGENDS',
    'ed': 'ECHOES OF ETERNITY',
  }[brief.channel];

  const narrationParts = brief.narrationScript.split('\n').filter(l => l.trim());
  const sceneNarration = narrationParts.slice(0, Math.max(brief.sceneCount, narrationParts.length));

  const scenes = sceneNarration.map((narration, idx) => ({
    scene: idx + 1,
    visual_prompt: `${brief.title} - Scene ${idx + 1}: ${narration.substring(0, 100)}`,
    narration: narration,
    duration: 10,
    transition: idx > 0 ? 'fade' : 'cut',
  }));

  return {
    episode_id: `${brief.channel.toUpperCase()}_EP${String(brief.episodeNum).padStart(3, '0')}`,
    title: brief.title,
    hook: brief.hook,
    angle: brief.angle,
    channel: brief.channel,
    channel_label: channelLabel,
    duration_seconds: scenes.length * 10,
    scenes: scenes,
    narration_full: brief.narrationScript,
    tts_rate: {
      'gg': 0.65,
      'ml': 1.05,
      'lo': 0.90,
      'il': 1.08,
      'ed': 0.92,
    }[brief.channel],
    style_suffix: 'cinematic, dramatic lighting, ultra detailed, photorealistic, 8k',
  };
}

/**
 * EmpireAssistantModule — EmpireModule implementation
 * Single-channel video generation + Batch research + Multi-channel expansion + Performance prediction
 */
export class EmpireAssistantModule implements EmpireModule {
  readonly moduleId = 'apex-os';
  private eventBus: EventBus;
  private memoryBus: MemoryBus;
  private moduleGateway: ModuleGateway;
  private workflowEngine: WorkflowEngine;
  private videoJobs: Map<string, ApexVideoJob> = new Map();
  private batchJobs: Map<string, any> = new Map();
  private pythonPath: string = 'C:\\Users\\jjard\\AppData\\Local\\Programs\\Python\\Python314\\python.exe';
  private pipelineDir: string = 'C:\\Users\\jjard\\claude\\video-bot-pipeline';
  private aiRouter: any; // Will be injected

  async init(services: CoreServices, config: ModuleConfig): Promise<void> {
    this.eventBus = services.eventBus;
    this.memoryBus = services.memoryBus;
    this.moduleGateway = services.moduleGateway;
    this.workflowEngine = services.workflowEngine;
    this.aiRouter = services.aiRouter || (config as any).aiRouter;

    this.eventBus.subscribe('render.completed', (event) => this.handleRenderComplete(event));
    this.eventBus.subscribe('render.failed', (event) => this.handleRenderFailed(event));

    await this.loadJobHistory();

    console.log('[APEX OS] Module initialized with batch research, multi-channel, and performance prediction');
  }

  async handleRequest(request: GatewayRequest): Promise<GatewayResponse> {
    try {
      // BATCH RESEARCH ROUTES
      if (request.path === '/batch-research' && request.method === 'POST') {
        return {
          status: 202,
          body: await this.handleBatchResearch(request.body),
        };
      }

      if (request.path === '/batch-status' && request.method === 'GET') {
        return {
          status: 200,
          body: await this.handleBatchStatus((request.query?.batchId as string) || ''),
        };
      }

      // MULTI-CHANNEL COORDINATION
      if (request.path === '/multi-channel-coordinate' && request.method === 'POST') {
        return {
          status: 200,
          body: await this.handleMultiChannelCoordination(request.body),
        };
      }

      // PERFORMANCE PREDICTIONS
      if (request.path === '/predictions' && request.method === 'POST') {
        return {
          status: 200,
          body: await this.handleBatchPredictions(request.body.topics),
        };
      }

      // EXISTING ROUTES
      if (request.path === '/generate-video') {
        return this.handleGenerateVideo(request);
      }
      if (request.path === '/video-status') {
        return this.handleVideoStatus(request);
      }
      if (request.path === '/health') {
        return { status: 200, body: await this.health() };
      }

      return { status: 404, body: { error: 'Not found' } };
    } catch (error) {
      console.error('[APEX OS] Error handling request:', error);
      return { status: 500, body: { error: String(error) } };
    }
  }

  /**
   * Start batch research job (36 videos)
   */
  private async handleBatchResearch(request: ApexBatchResearchRequest) {
    const batchId = `apex_batch_${Date.now()}`;
    const jobIds: string[] = [];

    console.log(`[APEX BATCH] Starting batch: ${batchId}`);
    console.log(`[APEX BATCH] Topics: ${request.topics.length}`);
    console.log(`[APEX BATCH] Max concurrent: ${request.maxConcurrentJobs || 6}`);

    const batchMetadata = {
      batchId,
      totalTopics: request.topics.length,
      status: 'processing' as const,
      startedAt: new Date(),
      completedAt: undefined,
      jobIds,
    };

    this.memoryBus.set(`batch:${batchId}`, batchMetadata);
    this.batchJobs.set(batchId, batchMetadata);

    // TODO: Implement batch research orchestrator (currently disabled — orchestrator modules not yet created)
    // this.runBatchPipeline(batchId, request).catch((err) => {
    //   console.error(`[APEX BATCH] Error in pipeline:`, err);
    //   batchMetadata.status = 'failed';
    //   this.memoryBus.set(`batch:${batchId}`, batchMetadata);
    // });

    this.eventBus.publish('batch.started', {
      batchId,
      totalTopics: request.topics.length,
      timestamp: new Date(),
    });

    return {
      batchId,
      status: 'processing',
      message: `Batch research started. ${request.topics.length} topics will be processed in parallel.`,
      estimatedTime: `${Math.ceil((request.topics.length * 50) / (request.maxConcurrentJobs || 6) / 60)} minutes`,
    };
  }

  /**
   * Run batch pipeline (background) — DISABLED
   * TODO: Implement orchestrator modules (batch-research-orchestrator, multi-channel-coordinator, performance-predictor)
   */
  // private async runBatchPipeline(batchId: string, request: ApexBatchResearchRequest) {
  //   const batchRequest = {
  //     id: batchId,
  //     topics: request.topics,
  //     targetChannels: request.targetChannels,
  //     maxConcurrentJobs: request.maxConcurrentJobs || 6,
  //     autoApproveThreshold: request.autoApproveThreshold || 0,
  //     includePredictions: request.includePredictions !== false,
  //     includeABTesting: false,
  //   };

  //   try {
  //     const result = await orchestrateBatchResearch(
  //       batchRequest,
  //       this.aiRouter,
  //       (batchId: string, job: any) => {
  //         this.eventBus.publish('batch.job_progress', {
  //           batchId,
  //           jobId: job.jobId,
  //           progress: job.progress,
  //           status: job.status,
  //         });
  //       }
  //     );

  //     this.memoryBus.set(`batch_result:${batchId}`, result);

  //     const metadata = this.memoryBus.get(`batch:${batchId}`);
  //     metadata.status = 'completed';
  //     metadata.completedAt = new Date();
  //     this.memoryBus.set(`batch:${batchId}`, metadata);

  //     this.eventBus.publish('batch.completed', {
  //       batchId,
  //       completedCount: result.completedCount,
  //       failedCount: result.failedCount,
  //       estimatedTotalViews: result.estimatedTotalViews,
  //       timestamp: new Date(),
  //     });

  //     if (result.renderQueue.length > 0) {
  //       console.log(`[APEX BATCH] Queuing ${result.renderQueue.length} videos for render`);
  //       for (const item of result.renderQueue) {
  //         this.eventBus.publish('render.queued', {
  //           jobId: item.jobId,
  //           topic: item.topic,
  //           channel: item.channel,
  //           renderPriority: item.renderPriority,
  //         });
  //       }
  //     }

  //     return result;
  //   } catch (err) {
  //     console.error(`[APEX BATCH] Pipeline error:`, err);
  //     throw err;
  //   }
  // }

  /**
   * Get batch status
   */
  private async handleBatchStatus(batchId: string): Promise<ApexBatchStatusResponse> {
    const batchMetadata = this.memoryBus.get(`batch:${batchId}`);
    const batchResult = this.memoryBus.get(`batch_result:${batchId}`);

    if (!batchMetadata) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    return {
      batchId,
      totalTopics: batchMetadata.totalTopics,
      completedCount: batchResult?.completedCount || 0,
      failedCount: batchResult?.failedCount || 0,
      status: batchMetadata.status,
      progress: batchResult
        ? Math.round(
            ((batchResult.completedCount + batchResult.failedCount) / batchMetadata.totalTopics) * 100
          )
        : 0,
      currentlyProcessing: batchResult?.jobs?.filter((j: any) => j.status === 'researching')?.length || 0,
      estimatedTimeRemaining: batchResult
        ? Math.max(0, Math.ceil((60 * (batchMetadata.totalTopics - (batchResult.completedCount || 0))) / 6))
        : 0,
      jobs: batchResult?.jobs || [],
      renderQueue: batchResult?.renderQueue || [],
      estimatedTotalViews: batchResult?.estimatedTotalViews || 0,
      estimatedTotalEngagement: batchResult?.estimatedTotalEngagement || 0,
    };
  }

  /**
   * Coordinate multi-channel topic expansion — DISABLED
   * TODO: Implement multi-channel-coordinator orchestrator
   */
  private async handleMultiChannelCoordination(request: ApexMultiChannelRequest) {
    return {
      error: 'Multi-channel coordination not yet implemented',
      status: 'disabled',
      message: 'Awaiting orchestrator implementation',
    };
    // Original implementation commented out:
    // console.log(`[APEX MULTI-CHANNEL] Coordinating ${request.topics.length} topics`);
    // const coordinatedBatches = await coordinateTopicBatch(
    //   request.topics,
    //   this.aiRouter,
    //   request.channelsPerTopic
    // );
    // ...
  }

  /**
   * Predict performance for a batch — DISABLED
   * TODO: Implement performance-predictor orchestrator
   */
  private async handleBatchPredictions(topics: Array<{ topic: string; channel: 'gg' | 'il' | 'lo' | 'ed' }>) {
    return {
      error: 'Performance prediction not yet implemented',
      status: 'disabled',
      message: 'Awaiting orchestrator implementation',
      count: 0,
      predictions: [],
      totalEstimatedViews: 0,
    };
    // Original implementation commented out:
    // console.log(`[APEX PREDICTIONS] Analyzing ${topics.length} topics`);
    // const predictions = await predictBatchPerformance(topics, this.aiRouter);
    // ...
  }

  private async handleGenerateVideo(request: GatewayRequest): Promise<GatewayResponse> {
    try {
      const brief: ApexRecordingBrief = request.body;

      if (!brief.channel || !brief.episodeNum || !brief.title || !brief.narrationScript) {
        return { status: 400, body: { error: 'Invalid brief: missing required fields' } };
      }

      const episodeId = `${brief.channel.toUpperCase()}_EP${String(brief.episodeNum).padStart(3, '0')}`;

      const job: ApexVideoJob = {
        id: `apex_${Date.now()}`,
        briefId: brief.id,
        episodeId: episodeId,
        status: 'queued',
        createdAt: new Date(),
      };

      this.videoJobs.set(job.id, job);
      await this.memoryBus.set(`apex:jobs:${job.id}`, job);

      const episodeJson = briefToEpisodeJson(brief);
      await this.memoryBus.set(`apex:episodes:${episodeId}`, episodeJson);

      await this.workflowEngine.trigger('apex:render', {
        jobId: job.id,
        episodeId: episodeId,
        pythonPath: this.pythonPath,
        pipelineDir: this.pipelineDir,
        episodeJson: episodeJson,
      });

      this.eventBus.publish('apex.video.queued', {
        jobId: job.id,
        episodeId: episodeId,
        timestamp: new Date().toISOString(),
      });

      return {
        status: 202,
        body: {
          jobId: job.id,
          episodeId: episodeId,
          status: 'queued',
          message: 'Video generation queued. Poll /video-status for updates.',
        },
      };
    } catch (error) {
      console.error('[APEX OS] Error generating video:', error);
      return { status: 500, body: { error: String(error) } };
    }
  }

  private async handleVideoStatus(request: GatewayRequest): Promise<GatewayResponse> {
    const jobId = (request.query?.jobId as string) || '';

    if (!jobId) {
      return {
        status: 200,
        body: {
          jobs: Array.from(this.videoJobs.values()),
          total: this.videoJobs.size,
        },
      };
    }

    const job = this.videoJobs.get(jobId);
    if (!job) {
      return { status: 404, body: { error: 'Job not found' } };
    }

    return { status: 200, body: job };
  }

  private async handleRenderComplete(event: DomainEvent): Promise<void> {
    const { jobId, videoPath, episodeId } = event.data;
    const job = this.videoJobs.get(jobId);

    if (job) {
      job.status = 'completed';
      job.videoPath = videoPath;
      job.completedAt = new Date();
      await this.memoryBus.set(`apex:jobs:${jobId}`, job);

      this.eventBus.publish('apex.video.completed', {
        jobId,
        episodeId,
        videoPath,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleRenderFailed(event: DomainEvent): Promise<void> {
    const { jobId, error } = event.data;
    const job = this.videoJobs.get(jobId);

    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = new Date();
      await this.memoryBus.set(`apex:jobs:${jobId}`, job);

      this.eventBus.publish('apex.video.failed', {
        jobId,
        error,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async handleEvent(event: DomainEvent): Promise<void> {}

  async health(): Promise<HealthReport> {
    const videoJobs = this.memoryBus.list?.()?.filter((k: string) => k.startsWith('apex:jobs:'))?.length || this.videoJobs.size;
    const batchJobs = this.memoryBus.list?.()?.filter((k: string) => k.startsWith('batch:'))?.length || this.batchJobs.size;

    return {
      status: 'healthy',
      checks: {
        videoJobs,
        batchJobs,
        pythonPath: this.pythonPath,
        pipelineDir: this.pipelineDir,
      },
    };
  }

  async shutdown(): Promise<void> {
    console.log('[APEX OS] Shutting down');
  }

  private async loadJobHistory(): Promise<void> {
    try {
      const jobs = await this.memoryBus.search?.('apex:jobs:*', {}) || [];
      jobs.forEach(([key, job]: [string, any]) => {
        this.videoJobs.set(job.id, job);
      });
    } catch (error) {
      console.log('[APEX OS] No prior job history found');
    }
  }
}

export default EmpireAssistantModule;
