import React, { useState, useEffect, useCallback } from "react";
import { Brain, Send, RefreshCw, Zap, Clock, DollarSign, Server } from "lucide-react";

const EMPIRE_OS = "http://localhost:3001";
const CROSSPOST  = ""; // relative — CrossPost's own /api/empire/ai-router

type Provider = { id: string; capabilities: string[]; contextWindow?: number; costPerMToken?: number };
type ProviderMap = Record<string, Provider[]>;

const MOCK_PROVIDERS: ProviderMap = {
  ollama:    [{ id: "qwen2.5:7b", capabilities: ["text"], costPerMToken: 0 }, { id: "gemma3:4b", capabilities: ["text"], costPerMToken: 0 }],
  anthropic: [{ id: "claude-sonnet-4-6", capabilities: ["text", "code"], contextWindow: 200000, costPerMToken: 3 }],
  gemini:    [{ id: "gemini-2.0-flash", capabilities: ["text", "code", "vision"], contextWindow: 1000000, costPerMToken: 0.1 }],
  openai:    [{ id: "gpt-4o", capabilities: ["text", "code", "vision"], contextWindow: 128000, costPerMToken: 5 }],
};

const STRATEGIES = ["cost", "quality", "local-only", "speed"] as const;
type Strategy = typeof STRATEGIES[number];

const STRATEGY_DESC: Record<Strategy, string> = {
  "cost":       "Ollama wins — local, free, handles routine tasks",
  "quality":    "Claude/Gemini — largest context, best reasoning",
  "local-only": "Ollama exclusively — no cloud fallback",
  "speed":      "Cheapest available model",
};

type CompletionResult = { text?: string; response?: string; model?: string; latencyMs?: number; provider?: string; estimatedCostUsd?: number };

export default function EmpireAIRouterPanel() {
  const [providers, setProviders] = useState<ProviderMap>({});
  const [usedMock, setUsedMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState<Strategy>("cost");
  const [prompt, setPrompt] = useState("Explain the Fall of Rome in 2 sentences.");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CompletionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${EMPIRE_OS}/providers`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("non-ok");
      const json = await res.json() as { providers?: ProviderMap };
      if (!json.providers || Object.keys(json.providers).length === 0) throw new Error("empty");
      setProviders(json.providers);
      setUsedMock(false);
    } catch {
      setProviders(MOCK_PROVIDERS);
      setUsedMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const sendPrompt = async () => {
    if (sending || !prompt.trim()) return;
    setSending(true);
    setError(null);
    setResult(null);
    const t0 = Date.now();

    // Try Empire OS directly first, fall back to CrossPost's proxy
    const endpoints = [
      { url: `${EMPIRE_OS}/empire-assistant/ai/complete`, body: { prompt, strategy } },
      { url: `${CROSSPOST}/api/empire/ai-router`, body: { prompt, strategy, context: {} } },
    ];

    for (const ep of endpoints) {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 20_000);
        const res = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ep.body),
          signal: ctrl.signal,
        });
        if (!res.ok) continue;
        const json = await res.json() as CompletionResult;
        setResult({ ...json, latencyMs: json.latencyMs ?? Date.now() - t0 });
        setSending(false);
        return;
      } catch { continue; }
    }

    setError("Both Empire OS (3001) and CrossPost (3000) endpoints failed. Ensure at least one server is running.");
    setSending(false);
  };

  const totalModels = Object.values(providers).reduce((acc, arr) => acc + arr.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-400" />
            AI Router
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Empire OS intelligent model routing — {totalModels} models across {Object.keys(providers).length} providers
            {usedMock && <span className="text-amber-400"> [mock — Empire OS offline]</span>}
          </p>
        </div>
        <button
          onClick={fetchProviders}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-semibold transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Provider Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(providers).map(([name, models]) => (
          <div key={name} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">{name}</span>
            </div>
            <div className="space-y-1">
              {models.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-28">{m.id}</span>
                  {m.costPerMToken === 0
                    ? <span className="text-[8px] font-mono font-bold text-emerald-400 bg-emerald-950 px-1 rounded">FREE</span>
                    : <span className="text-[8px] font-mono text-slate-500">${m.costPerMToken}/M</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Strategy + Routing Rules */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">Routing Strategy</div>
        <div className="flex flex-wrap gap-2">
          {STRATEGIES.map((s) => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold transition ${
                strategy === s
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="text-[11px] font-mono text-slate-400 flex items-start gap-2">
          <Zap className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
          {STRATEGY_DESC[strategy]}
        </div>
      </div>

      {/* Test Prompt */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">Test Prompt</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 resize-none"
          placeholder="Enter a prompt to test the AI router…"
        />
        <button
          onClick={sendPrompt}
          disabled={sending || !prompt.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-slate-100 font-mono text-xs font-bold transition disabled:opacity-50"
        >
          {sending ? <><RefreshCw className="w-3 h-3 animate-spin" /> Routing…</> : <><Send className="w-3 h-3" /> Send</>}
        </button>
      </div>

      {/* Result */}
      {error && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 text-xs font-mono text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">Response</div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
              {result.model && <span className="text-cyan-400">{result.model}</span>}
              {result.latencyMs && (
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{result.latencyMs}ms</span>
              )}
              {result.estimatedCostUsd !== undefined && (
                <span className="flex items-center gap-1 text-amber-400">
                  <DollarSign className="w-3 h-3" />${result.estimatedCostUsd.toFixed(4)}
                </span>
              )}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap border border-slate-700">
            {result.text ?? result.response ?? "No text in response"}
          </div>
        </div>
      )}
    </div>
  );
}
