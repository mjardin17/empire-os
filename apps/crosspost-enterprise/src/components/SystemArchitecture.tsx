import React, { useState } from "react";
import { Server, Cpu, Database, Film, Radio, GitFork, ArrowRight, Layers, FileCode, CheckCircle2 } from "lucide-react";

interface NodeDetails {
  title: string;
  badge: string;
  icon: any;
  tech: string;
  description: string;
  schema: string;
  reliability: string;
}

const ARCHITECTURE_NODES: Record<string, NodeDetails> = {
  ingestion: {
    title: "Contextual Multi-Modal Ingestion Pipeline",
    badge: "S3 Ingress & Whisper Workers",
    icon: Film,
    tech: "AWS S3 / Whisper-large-v3 / PyTorch",
    description: "Accepts high-resolution video streams (.mp4) via S3 presigned POST URLs. Initiates decoupled Whisper diarization workers to generate synchronized VTT transcripts with automatic speaker labels. Programmatically extracts video frame vectors every 1 second using ResNet-50 / CLIP, pushing both transcript and visual embeddings into database indices.",
    schema: `{\n  "job_id": "ingest_88301_xpx",\n  "video_url": "s3://prod-crosspost-media/raw/4k_interview.mp4",\n  "extract_transcript": true,\n  "frame_vector_stride_sec": 1\n}`,
    reliability: "Dead Letter Queues (DLQ) for failed transcription segments + exponential backoff retry policies on spot instance pools."
  },
  gateway: {
    title: "Ingress Router & API Gateway",
    badge: "FastAPI / Go Router",
    icon: Server,
    tech: "Go (Gin) or Python (FastAPI) on AWS ECS",
    description: "Serves as the high-throughput gateway. Decouples incoming requests immediately by writing transaction states into database and dispatching execution tokens to Temporal workflows instead of completing operations in HTTP thread contexts. This keeps HTTP response latencies below 12ms under heavy load.",
    schema: `POST /api/v1/workflows/execute\nHeaders: Bearer JWT\nPayload: {\n  "creator_id": "creator_881",\n  "raw_script_text": "...",\n  "targets": ["youtube", "tiktok", "twitter"]\n}`,
    reliability: "Rate limiting via Redis Token Bucket algorithms (100req/sec per creator) and automatic circuit breakers on database clusters."
  },
  orchestrator: {
    title: "Temporal.io Stateful Workflow Orchestration",
    badge: "Temporal Engine",
    icon: GitFork,
    tech: "Temporal.io Clusters",
    description: "Manages stateful multi-agent execution graphs. Replaces client-side Promise.allSettled with durable execution threads. Enables long-running, multi-step actions (human-in-the-loop approvals, model retry loops, programmatic edits) with guaranteed state recovery across physical hardware failures.",
    schema: `WorkflowStatus {\n  "workflow_id": "wf_crosspost_82910",\n  "state": "WorkflowStateRunning",\n  "current_activity": "CriticReviewPlatform",\n  "retry_count": 0\n}`,
    reliability: "Durable workflow histories recorded in persistent stores. Automatically resumes running workflows in the identical code line on hardware power cycles."
  },
  database: {
    title: "Creator Style Memory & pgvector",
    badge: "Vector Store",
    icon: Database,
    tech: "PostgreSQL 16 + pgvector",
    description: "Stores historical content profiles and few-shot templates. Partitions the vector database by creator_id, enabling sub-millisecond retrieval of the creator's past high-performance posts using Cosine distance indices. This few-shot context injects highly specific speech patterns into the prompt context.",
    schema: `CREATE TABLE creator_style_embeddings (\n  id UUID PRIMARY KEY,\n  creator_id UUID JOIN creators(id),\n  content TEXT,\n  embedding vector(1536),\n  ctr_performance REAL\n);`,
    reliability: "Multi-AZ replication with active pg_auto_failover and daily vector index rebuild routines (HNSW)."
  },
  media: {
    title: "Serverless Programmatic Media Pipeline",
    badge: "FFmpeg Pipeline",
    icon: Cpu,
    tech: "AWS ECS Fargate / FFmpeg / Remotion",
    description: "Executes programmatic video mutations natively on specialized AWS instances. Bakes dynamic subtitles, stitches intro hooks, applies precise auto-cropping (from 16:9 widescreen source to 9:16 vertical TikTok canvas with face-detection centrations), and generates high-efficiency WebP poster previews.",
    schema: `FFmpegCommand {\n  "crop": "crop=ih*9/16:ih:iw/2-ih*9/32:0",\n  "audio_mix": "sidechaincompress=threshold=-15dB",\n  "subtitles": "subtitles=temp.vtt:force_style='FontSize=24'"\n}`,
    reliability: "Stateless container scale-out based on RabbitMQ Queue Deep Metrics. Over-allocated media tasks fall back to fallback CPU-limited micro-workers to prevent pipeline starvation."
  },
  websockets: {
    title: "WebSocket Connection Gateway Service",
    badge: "Live Telemetry",
    icon: Radio,
    tech: "Go / AWS API Gateway WebSockets",
    description: "Maintains lightweight persistent connections with client apps. Streams granular step-by-step progress reports during orchestrator execution (e.g. 'TikTok Critic revision complete'), avoiding HTTP pooling and maintaining instantaneous UI state feedback.",
    schema: `WS_Message {\n  "event": "agent_state_update",\n  "payload": {\n    "platform": "tiktok",\n    "agent": "critic_reviewer",\n    "compliance_rating": 94,\n    "estimated_remaining_s": 8.4\n  }\n}`,
    reliability: "Dynamically tracks peer states using Redis Pub/Sub, automatically reconnecting dropped sockets and pushing lost frames safely on resume."
  }
};

export function SystemArchitecture() {
  const [activeNode, setActiveNode] = useState<string>("orchestrator");
  const details = ARCHITECTURE_NODES[activeNode];

  return (
    <div id="system-architecture-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
      <div className="flex flex-col lg:flex-row gap-6 font-sans">
        
        {/* Visual Map Layout */}
        <div className="flex-1">
          <div className="mb-4">
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800 px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              Distributed Topology Mapping
            </span>
            <h3 className="text-xl font-bold text-slate-100 mt-2">CROSSPOST Decentralized Stack</h3>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              Select any system module below to inspect its technical structure, payload schemas, and fault-tolerance policies.
            </p>
          </div>

          <div className="relative bg-slate-950 border border-slate-850 p-5 rounded-lg min-h-[380px] flex flex-col justify-between">
            {/* Direct Line Flows as Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Box 1: Gateway */}
              <button
                type="button"
                id="arch-btn-gateway"
                onClick={() => setActiveNode("gateway")}
                className={`flex items-start gap-4 p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  activeNode === "gateway"
                    ? "bg-slate-900 border-cyan-500 text-slate-105 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className={`p-2.5 rounded bg-slate-850 border ${activeNode === "gateway" ? "border-cyan-500/50 text-cyan-400" : "border-slate-800 text-slate-400"}`}>
                  <Server className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">1. API Gateway</span>
                    <span className="text-[9px] font-mono text-cyan-400">REST</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal line-clamp-2">Decoupled FastAPI/Go gateway managing high concurrency ingress routing.</p>
                </div>
              </button>

              {/* Box 2: Ingestion */}
              <button
                type="button"
                id="arch-btn-ingestion"
                onClick={() => setActiveNode("ingestion")}
                className={`flex items-start gap-4 p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  activeNode === "ingestion"
                    ? "bg-slate-900 border-cyan-500 text-slate-105 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className={`p-2.5 rounded bg-slate-850 border ${activeNode === "ingestion" ? "border-cyan-500/50 text-cyan-400" : "border-slate-800 text-slate-400"}`}>
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">2. Ingestion Pipeline</span>
                    <span className="text-[9px] font-mono text-rose-400">Media</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal line-clamp-2">Whisper voice diarization, frame vectors, transcription sync loops.</p>
                </div>
              </button>

              {/* Box 3: Temporal Orchestrator */}
              <button
                type="button"
                id="arch-btn-orchestrator"
                onClick={() => setActiveNode("orchestrator")}
                className={`flex items-start gap-4 p-4 rounded-lg border text-left transition-all cursor-pointer md:col-span-2 ${
                  activeNode === "orchestrator"
                    ? "bg-slate-900 border-cyan-500 text-slate-105 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className={`p-2.5 rounded bg-slate-850 border ${activeNode === "orchestrator" ? "border-cyan-500/50 text-cyan-400" : "border-slate-800 text-slate-400"}`}>
                  <GitFork className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">3. Stateful Workflow Engine (Temporal.io)</span>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2 py-0.5 rounded-sm">CRITICAL HEART</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-normal">Durable multi-agent loops replacing client promise handlers. Controls failure-isolated code execution.</p>
                </div>
              </button>

              {/* Box 4: pgvector */}
              <button
                type="button"
                id="arch-btn-database"
                onClick={() => setActiveNode("database")}
                className={`flex items-start gap-4 p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  activeNode === "database"
                    ? "bg-slate-900 border-cyan-500 text-slate-105 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className={`p-2.5 rounded bg-slate-850 border ${activeNode === "database" ? "border-cyan-500/50 text-cyan-400" : "border-slate-800 text-slate-400"}`}>
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">4. postgres pgvector</span>
                    <span className="text-[9px] font-mono text-purple-400">Memory</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal line-clamp-2">Creator few-shot performance store matching high scoring text styles.</p>
                </div>
              </button>

              {/* Box 5: Media Pipeline */}
              <button
                type="button"
                id="arch-btn-media"
                onClick={() => setActiveNode("media")}
                className={`flex items-start gap-4 p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  activeNode === "media"
                    ? "bg-slate-900 border-cyan-500 text-slate-105 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className={`p-2.5 rounded bg-slate-850 border ${activeNode === "media" ? "border-cyan-500/50 text-cyan-400" : "border-slate-800 text-slate-400"}`}>
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">5. FFmpeg / Fargate</span>
                    <span className="text-[9px] font-mono text-orange-400">Stitching</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal line-clamp-2">Serverless caption baking, smart vertical cropper, WebP previews.</p>
                </div>
              </button>
            </div>

            {/* Box 6: WebSockets connecting client feedback */}
            <div className="mt-4 border-t border-slate-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                id="arch-btn-websockets"
                onClick={() => setActiveNode("websockets")}
                className={`flex items-center gap-3 px-3 py-2 rounded border transition-all text-left cursor-pointer ${
                  activeNode === "websockets"
                    ? "bg-slate-900 border-cyan-500 text-slate-100 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/40 border-slate-850 text-slate-400 hover:border-slate-800 hover:bg-slate-900"
                }`}
              >
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-xs font-semibold">6. WebSocket Status Broadcast Service</span>
              </button>
              
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span>React Client</span>
                <ArrowRight className="w-3.5 h-3.5" />
                <span className="text-cyan-400 font-bold">Stateful Microservices</span>
              </div>
            </div>

          </div>
        </div>

        {/* Detailed Inspector Panel */}
        <div className="w-full lg:w-[410px] bg-slate-950 border border-slate-850 p-5 rounded-lg flex flex-col justify-between font-sans">
          <div>
            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase bg-cyan-950/60 border border-cyan-900/50 px-2 py-0.5 rounded">
                  {details.tech}
                </span>
                <h4 className="text-sm font-bold text-slate-100 mt-2">{details.title}</h4>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 text-cyan-400">
                <details.icon className="w-4 h-4" />
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              {details.description}
            </p>

            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-mono mb-2">
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                <span>Payload Structure & Schema</span>
              </div>
              <pre className="bg-slate-900 border border-slate-850 text-[10px] text-cyan-300 font-mono p-3 rounded overflow-x-auto max-h-[160px] leading-relaxed">
                {details.schema}
              </pre>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-850">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-semibold text-slate-200">Fault & Network Isolation Policy</span>
                <p className="text-[10px] text-slate-405 leading-normal mt-0.5">
                  {details.reliability}
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
