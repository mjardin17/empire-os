import React, { useState, useEffect, useCallback } from "react";
import { Plug, CheckCircle, XCircle, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";

const EMPIRE_OS = "http://localhost:3001";

type ConnectorStatus = "online" | "offline" | "unknown" | "degraded";

type Connector = {
  id: string;
  name: string;
  icon: string;
  type: "module" | "adapter" | "external";
  description: string;
  status: ConnectorStatus;
  endpoint?: string;
  details?: string;
};

const STATIC_CONNECTORS: Connector[] = [
  { id: "ollama",           name: "Ollama",            icon: "🦙", type: "adapter",   description: "Local LLM inference engine",          status: "unknown", endpoint: "http://localhost:11434" },
  { id: "higgsfield",       name: "Higgsfield AI",     icon: "🎬", type: "external",  description: "Cloud video generation API",           status: "unknown" },
  { id: "anthropic",        name: "Anthropic Claude",  icon: "🟠", type: "adapter",   description: "Claude API — code, reasoning",         status: "unknown" },
  { id: "gemini",           name: "Google Gemini",     icon: "🔵", type: "adapter",   description: "Gemini API — long context, planning",  status: "unknown" },
  { id: "openai",           name: "OpenAI GPT",        icon: "🟢", type: "adapter",   description: "OpenAI API — GPT-4o, embeddings",      status: "unknown" },
  { id: "goose",            name: "Goose CLI",         icon: "🦆", type: "external",  description: "Agentic AI dev tool by Block",         status: "unknown" },
];

function statusBadge(status: ConnectorStatus) {
  const map: Record<ConnectorStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    online:   { icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />, label: "Online",   cls: "text-emerald-400" },
    offline:  { icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,         label: "Offline",  cls: "text-red-400" },
    degraded: { icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, label: "Degraded", cls: "text-amber-400" },
    unknown:  { icon: <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />, label: "Checking…", cls: "text-slate-500" },
  };
  const s = map[status];
  return (
    <div className={`flex items-center gap-1.5 text-[10px] font-mono font-bold ${s.cls}`}>
      {s.icon}
      {s.label}
    </div>
  );
}

export default function ConnectorManager() {
  const [empireOnline, setEmpireOnline] = useState(false);
  const [modules, setModules] = useState<Connector[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>(STATIC_CONNECTORS.map((c) => ({ ...c, status: "unknown" as ConnectorStatus })));
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const probe = useCallback(async () => {
    setLoading(true);

    // 1. Probe Empire OS
    let health: { status: string; modules: Record<string, { status: string }> } | null = null;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${EMPIRE_OS}/health`, { signal: ctrl.signal });
      if (res.ok) {
        health = await res.json();
        setEmpireOnline(true);
      }
    } catch {
      setEmpireOnline(false);
    }

    // 2. Build module connectors from health data
    if (health?.modules) {
      const mods: Connector[] = Object.entries(health.modules).map(([id, h]) => ({
        id,
        name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: moduleIcon(id),
        type: "module" as const,
        description: moduleDesc(id),
        status: (h.status === "healthy" ? "online" : h.status === "degraded" ? "degraded" : "offline") as ConnectorStatus,
        endpoint: `${EMPIRE_OS}/${id}/`,
      }));
      setModules(mods);
    } else {
      setModules([]);
    }

    // 3. Probe Ollama
    let ollamaStatus: ConnectorStatus = "offline";
    try {
      const ctrl2 = new AbortController();
      setTimeout(() => ctrl2.abort(), 2000);
      const res = await fetch("http://localhost:11434/api/tags", { signal: ctrl2.signal });
      ollamaStatus = res.ok ? "online" : "offline";
    } catch { ollamaStatus = "offline"; }

    // 4. Probe providers endpoint
    let providers: { goose?: { available: boolean } } | null = null;
    if (health) {
      try {
        const ctrl3 = new AbortController();
        setTimeout(() => ctrl3.abort(), 2000);
        const res = await fetch(`${EMPIRE_OS}/providers`, { signal: ctrl3.signal });
        if (res.ok) providers = await res.json();
      } catch { /* ignore */ }
    }

    // 5. Update static connectors
    setConnectors(STATIC_CONNECTORS.map((c) => {
      let s: ConnectorStatus = "unknown";
      if (c.id === "ollama") s = ollamaStatus;
      else if (["anthropic", "gemini", "openai"].includes(c.id)) {
        s = health ? "online" : "offline"; // infer from empire being up
      } else if (c.id === "goose") {
        s = providers?.goose?.available ? "online" : "offline";
      } else if (c.id === "higgsfield") {
        s = "unknown"; // requires API key check — show unknown
      }
      return { ...c, status: s };
    }));

    setLastCheck(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { probe(); }, [probe]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
            <Plug className="w-5 h-5 text-purple-400" />
            Connector Manager
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            All Empire OS modules and external adapters
            {lastCheck && ` — checked at ${lastCheck.toLocaleTimeString()}`}
          </p>
        </div>
        <button
          onClick={probe}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-semibold transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Probe All
        </button>
      </div>

      {/* Empire OS Status Banner */}
      <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${empireOnline ? "bg-emerald-950/30 border-emerald-800/50" : "bg-red-950/30 border-red-800/50"}`}>
        <div className="flex items-center gap-2">
          {empireOnline
            ? <CheckCircle className="w-4 h-4 text-emerald-400" />
            : <XCircle className="w-4 h-4 text-red-400" />}
          <span className="text-sm font-bold font-mono text-slate-200">Empire OS Server</span>
          <span className="text-[10px] font-mono text-slate-500">localhost:3001</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono font-bold uppercase ${empireOnline ? "text-emerald-400" : "text-red-400"}`}>
            {empireOnline ? "ONLINE" : "OFFLINE"}
          </span>
          {empireOnline && (
            <a href="http://localhost:3001/empire-dashboard/" target="_blank" rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 text-[10px] font-mono">
              Open ↗
            </a>
          )}
        </div>
      </div>

      {/* Empire OS Modules */}
      {modules.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-3">
            Empire OS Modules ({modules.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {modules.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2.5">
                <div>
                  <div className="text-xs font-mono font-bold text-slate-200">{m.name}</div>
                  <div className="text-[9px] font-mono text-slate-500">{m.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(m.status)}
                  {m.endpoint && (
                    <a href={m.endpoint} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 text-slate-600 hover:text-indigo-400 transition" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External Connectors */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-3">
          External Adapters & Services
        </div>
        <div className="space-y-2">
          {connectors.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-3">
              <div className="flex items-center gap-3">
                <span className="text-lg">{c.icon}</span>
                <div>
                  <div className="text-xs font-mono font-bold text-slate-200">{c.name}</div>
                  <div className="text-[9px] font-mono text-slate-500">{c.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {statusBadge(c.status)}
                {c.endpoint && (
                  <a href={c.endpoint} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-mono text-indigo-400 hover:text-indigo-300">
                    ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] font-mono text-slate-600 text-center">
        API keys configured in .env — never exposed here. Check Empire OS server logs for adapter errors.
      </div>
    </div>
  );
}

function moduleIcon(id: string): string {
  const map: Record<string, string> = {
    "empire-assistant": "🧠", "model-manager": "🦙", "discovery": "🔭",
    "health-monitor": "💚", "media-engine": "🎬", "knowledge-base": "📚",
    "store": "🏪", "installer": "⚙️", "empire-dashboard": "🌌",
  };
  return map[id] ?? "🔧";
}

function moduleDesc(id: string): string {
  const map: Record<string, string> = {
    "empire-assistant": "AI routing + agent chat",
    "model-manager": "Ollama model install/manage",
    "discovery": "AI catalog + benchmarks",
    "health-monitor": "System resource monitoring",
    "media-engine": "Video/image/audio routing",
    "knowledge-base": "RAG memory + embeddings",
    "store": "Software install catalog",
    "installer": "pip/npm/winget/ollama jobs",
    "empire-dashboard": "Glassmorphism control panel",
  };
  return map[id] ?? "Empire OS module";
}
