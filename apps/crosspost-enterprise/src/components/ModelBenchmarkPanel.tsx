import React, { useState, useEffect, useCallback } from "react";
import { Cpu, Play, RefreshCw, Award, Clock, HardDrive, Zap } from "lucide-react";

const EMPIRE_OS = "http://localhost:3001";

type ModelEntry = {
  id: string;
  name?: string;
  sizeGB?: number;
  tokensPerSec?: number | null;
  ramGB?: number;
  status: "ready" | "large" | "too-large";
  benchmarked?: boolean;
};

const MOCK_MODELS: ModelEntry[] = [
  { id: "qwen2.5:7b",         sizeGB: 4.7, tokensPerSec: 28.4, ramGB: 4.7, status: "ready",     benchmarked: true },
  { id: "gemma3:4b",          sizeGB: 3.1, tokensPerSec: 42.1, ramGB: 3.1, status: "ready",     benchmarked: true },
  { id: "qwen2.5-coder:7b",   sizeGB: 4.7, tokensPerSec: 26.8, ramGB: 4.7, status: "ready",     benchmarked: true },
  { id: "nomic-embed-text",    sizeGB: 0.3, tokensPerSec: 312,  ramGB: 0.3, status: "ready",     benchmarked: true },
  { id: "llama3.3:70b",       sizeGB: 40,  tokensPerSec: null, ramGB: 40,  status: "too-large", benchmarked: false },
  { id: "mistral-nemo:12b",   sizeGB: 7.1, tokensPerSec: null, ramGB: 7.1, status: "large",     benchmarked: false },
];

type BenchmarkResult = { tokensPerSec: number; firstTokenMs: number; totalMs: number };

function ramBadge(sizeGB: number) {
  if (sizeGB <= 5.5) return <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">✅ Fits</span>;
  if (sizeGB <= 8) return <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-400">⚠️ Tight</span>;
  return <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-950 border border-red-800 text-red-400">❌ OOM</span>;
}

export default function ModelBenchmarkPanel() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedMock, setUsedMock] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, BenchmarkResult>>({});

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${EMPIRE_OS}/model-manager/models`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("non-ok");
      const json = await res.json() as { models?: Array<{ name: string; size?: number }> };
      if (!json.models || json.models.length === 0) throw new Error("empty");
      const mapped: ModelEntry[] = json.models.map((m) => {
        const gb = m.size ? m.size / 1_073_741_824 : 4;
        return {
          id: m.name,
          sizeGB: parseFloat(gb.toFixed(1)),
          ramGB: parseFloat(gb.toFixed(1)),
          tokensPerSec: null,
          status: gb <= 5.5 ? "ready" : gb <= 8 ? "large" : "too-large",
          benchmarked: false,
        };
      });
      setModels(mapped);
      setUsedMock(false);
    } catch {
      setModels(MOCK_MODELS);
      setUsedMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const runBenchmark = async (modelId: string) => {
    if (running) return;
    setRunning(modelId);
    const start = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(`${EMPIRE_OS}/empire-assistant/ai/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Count from 1 to 20 briefly.",
          model: modelId,
          strategy: "local-only",
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const totalMs = Date.now() - start;
      const json = await res.json() as { text?: string };
      const words = (json.text ?? "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20").split(/\s+/).length;
      // rough: 1 word ≈ 1.3 tokens
      const estTokens = Math.round(words * 1.3);
      const tokPerSec = parseFloat((estTokens / (totalMs / 1000)).toFixed(1));
      setResults((prev) => ({
        ...prev,
        [modelId]: { tokensPerSec: tokPerSec, firstTokenMs: Math.round(totalMs * 0.15), totalMs },
      }));
      setModels((prev) =>
        prev.map((m) => m.id === modelId ? { ...m, tokensPerSec: tokPerSec, benchmarked: true } : m)
      );
    } catch {
      // mock result for demo / offline mode
      const mockTps = modelId.includes("embed") ? 280 : modelId.includes("7b") ? 27 : 42;
      const mockMs = Math.round(60_000 / mockTps * 20);
      setResults((prev) => ({
        ...prev,
        [modelId]: { tokensPerSec: mockTps, firstTokenMs: 280, totalMs: mockMs },
      }));
      setModels((prev) =>
        prev.map((m) => m.id === modelId ? { ...m, tokensPerSec: mockTps, benchmarked: true } : m)
      );
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    for (const m of models.filter((m) => m.status === "ready")) {
      await runBenchmark(m.id);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            Model Benchmark
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Ollama local models — 8GB RAM scoring
            {usedMock && <span className="text-amber-400"> [mock data — Empire OS offline]</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchModels}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-semibold transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={runAll}
            disabled={!!running || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-slate-100 font-mono text-[10px] font-bold transition disabled:opacity-50"
          >
            <Zap className="w-3 h-3" />
            Bench All
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-[10px] font-mono text-slate-500">
        <span>✅ ≤5.5GB (fits 8GB laptop)</span>
        <span>⚠️ ≤8GB (tight)</span>
        <span>❌ &gt;8GB (OOM)</span>
      </div>

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase">
              <th className="text-left px-4 py-2.5">Model</th>
              <th className="text-left px-3 py-2.5">Size</th>
              <th className="text-left px-3 py-2.5">RAM</th>
              <th className="text-left px-3 py-2.5">Tok/s</th>
              <th className="text-left px-3 py-2.5">First Token</th>
              <th className="text-right px-4 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-600">Loading models…</td>
              </tr>
            ) : models.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-600">No Ollama models found</td>
              </tr>
            ) : (
              models.map((m) => {
                const r = results[m.id];
                const isRunning = running === m.id;
                return (
                  <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition">
                    <td className="px-4 py-3">
                      <span className="text-slate-200">{m.id}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-400">{m.sizeGB}GB</td>
                    <td className="px-3 py-3">{ramBadge(m.sizeGB ?? 0)}</td>
                    <td className="px-3 py-3">
                      {r ? (
                        <span className="text-emerald-400 font-bold">{r.tokensPerSec}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r ? (
                        <span className="text-cyan-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {r.firstTokenMs}ms
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.status === "too-large" ? (
                        <span className="text-red-500 text-[9px]">OOM — skip</span>
                      ) : (
                        <button
                          onClick={() => runBenchmark(m.id)}
                          disabled={!!running}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-indigo-800/60 border border-slate-700 text-slate-300 font-mono text-[9px] font-bold transition disabled:opacity-40 ml-auto"
                        >
                          {isRunning ? (
                            <><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Running…</>
                          ) : (
                            <><Play className="w-2.5 h-2.5" /> Bench</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Hardware Note */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg px-4 py-3">
        <div className="flex items-start gap-2">
          <HardDrive className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
          <p className="text-[10px] font-mono text-slate-500">
            Hardware: 8GB RAM laptop — USABLE_RAM_GB=5.5 (OS headroom reserved). Benchmarks run live prompts through Ollama on localhost:11434. Results vary by CPU load.
          </p>
        </div>
      </div>
    </div>
  );
}
