import React, { useState } from "react";
import { Film, CheckCircle, AlertTriangle, Zap, Clock, ExternalLink, RefreshCw } from "lucide-react";

// Higgsfield AI — cloud video generation connector
// API key lives in .env (HIGGSFIELD_API_KEY) — never shown here.
// Empire OS logs Higgsfield events via the event bus.

type JobEntry = { id: string; prompt: string; duration: number; status: "completed" | "processing" | "failed"; createdAt: string };

const MOCK_JOBS: JobEntry[] = [
  { id: "hf_001", prompt: "Epic battle scene, Roman legions charging", duration: 5, status: "completed",  createdAt: "2026-07-04T10:12:00Z" },
  { id: "hf_002", prompt: "Pearl Harbor aerial view, dramatic sunrise",  duration: 5, status: "completed",  createdAt: "2026-07-04T09:44:00Z" },
  { id: "hf_003", prompt: "Medieval castle walls, knights marching",      duration: 5, status: "processing", createdAt: "2026-07-04T11:00:00Z" },
];

const CAPABILITIES = [
  { label: "Video Generation",    icon: "🎬", supported: true  },
  { label: "Image Animation",     icon: "📸", supported: true  },
  { label: "Character Consistency",icon: "👤", supported: true  },
  { label: "Motion Control",      icon: "🎮", supported: true  },
  { label: "Audio Sync",          icon: "🔊", supported: false },
  { label: "4K Output",           icon: "🖥️", supported: false },
];

function jobStatusBadge(status: JobEntry["status"]) {
  if (status === "completed")  return <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">✅ Done</span>;
  if (status === "processing") return <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5 animate-spin" />Processing</span>;
  return <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-red-950 border border-red-800 text-red-400">❌ Failed</span>;
}

export default function HiggsfieldStatus() {
  const [testPrompt, setTestPrompt] = useState("Epic Roman battle scene, cinematic 35mm");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const triggerTest = async () => {
    if (testing || !testPrompt.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8000);
      // Route through Empire Assistant → Higgsfield connector
      const res = await fetch("/api/empire/ai-router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `[HIGGSFIELD] Generate video: ${testPrompt}`,
          strategy: "quality",
          context: { connector: "higgsfield", type: "video_generation" },
        }),
        signal: ctrl.signal,
      });
      const json = await res.json() as { text?: string; response?: string };
      setTestResult(json.text ?? json.response ?? "Job queued — check Higgsfield dashboard for output.");
    } catch {
      setTestResult("Empire Assistant offline. Start the server and ensure HIGGSFIELD_API_KEY is set in .env");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
          <Film className="w-5 h-5 text-pink-400" />
          Higgsfield AI
        </h2>
        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
          Cloud video generation connector — routed through Empire Assistant
        </p>
      </div>

      {/* Status Banner */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎬</span>
          <div>
            <div className="text-sm font-bold text-slate-100">Higgsfield AI</div>
            <div className="text-[10px] font-mono text-slate-500">higgsfield.ai — cloud API</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            KEY REQUIRED
          </div>
          <a
            href="https://higgsfield.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-mono text-indigo-400 hover:text-indigo-300"
          >
            Dashboard <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* API Key Setup */}
      <div className="bg-slate-900/40 border border-amber-800/30 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-mono font-bold text-amber-300 mb-1">Setup Required</div>
            <p className="text-[11px] font-mono text-slate-400">
              Add <code className="text-amber-300 bg-slate-800 px-1 rounded">HIGGSFIELD_API_KEY=your_key</code> to your{" "}
              <code className="text-slate-300 bg-slate-800 px-1 rounded">.env</code> file in the Empire OS server directory.
              The key is never logged or displayed here.
            </p>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-3">Generation Capabilities</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CAPABILITIES.map((cap) => (
            <div key={cap.label} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2">
              <span className="text-sm">{cap.icon}</span>
              <div>
                <div className="text-[10px] font-mono text-slate-300">{cap.label}</div>
                {cap.supported
                  ? <div className="text-[9px] text-emerald-400 font-mono flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Supported</div>
                  : <div className="text-[9px] text-slate-600 font-mono">Coming soon</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Generation */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">Test Generation</div>
        <div className="flex gap-2">
          <input
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Describe your video scene…"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs focus:outline-none focus:border-pink-500"
          />
          <button
            onClick={triggerTest}
            disabled={testing || !testPrompt.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pink-600/90 hover:bg-pink-500 text-white font-mono text-xs font-bold transition disabled:opacity-50"
          >
            {testing ? <><RefreshCw className="w-3 h-3 animate-spin" /> Sending…</> : <><Zap className="w-3 h-3" /> Generate</>}
          </button>
        </div>
        {testResult && (
          <div className="bg-slate-800/60 rounded-lg p-3 text-xs font-mono text-slate-300 border border-slate-700">
            {testResult}
          </div>
        )}
        <p className="text-[9px] font-mono text-slate-600">
          Routes through Empire Assistant → Higgsfield connector. Requires HIGGSFIELD_API_KEY in .env
        </p>
      </div>

      {/* Recent Jobs (mock) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-3">
          Recent Jobs <span className="text-slate-600">(mock — connect API for live data)</span>
        </div>
        <div className="space-y-2">
          {MOCK_JOBS.map((job) => (
            <div key={job.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-[9px] font-mono text-slate-600">{job.id}</div>
                <div className="text-[10px] font-mono text-slate-300 truncate max-w-56">{job.prompt}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
                  <Clock className="w-2.5 h-2.5" />
                  {job.duration}s
                </div>
                {jobStatusBadge(job.status)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
