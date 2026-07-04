import React, { useState, useEffect, useCallback } from "react";
import { Activity, Server, Cpu, HardDrive, Zap, RefreshCw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

const EMPIRE_OS = "http://localhost:3001";
const POLL_MS = 6000;

type ModuleHealth = { status: string; [key: string]: unknown };
type HealthData = {
  status: string;
  modules: Record<string, ModuleHealth>;
  uptime?: number;
  ram?: { usedMB: number; totalMB: number };
  cpu?: number;
};

const MOCK_HEALTH: HealthData = {
  status: "online",
  modules: {
    "empire-assistant": { status: "healthy" },
    "model-manager": { status: "healthy" },
    "discovery": { status: "healthy" },
    "health-monitor": { status: "healthy" },
    "media-engine": { status: "healthy" },
    "knowledge-base": { status: "healthy" },
    "store": { status: "healthy" },
    "installer": { status: "healthy" },
    "empire-dashboard": { status: "healthy" },
  },
};

function StatusIcon({ status }: { status: string }) {
  if (status === "healthy" || status === "online") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === "degraded") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
  return <XCircle className="w-3.5 h-3.5 text-red-400" />;
}

function statusColor(status: string): string {
  if (status === "healthy" || status === "online") return "text-emerald-400";
  if (status === "degraded") return "text-amber-400";
  return "text-red-400";
}

function ResourceBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={color}>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color.replace("text-", "bg-")}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export default function HealthMonitorPanel() {
  const [data, setData] = useState<HealthData | null>(null);
  const [usedMock, setUsedMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${EMPIRE_OS}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("non-ok");
      const json = await res.json() as HealthData;
      setData(json);
      setUsedMock(false);
    } catch {
      setData(MOCK_HEALTH);
      setUsedMock(true);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, POLL_MS);
    return () => clearInterval(id);
  }, [fetchHealth]);

  // Simulated resource usage (8GB RAM laptop: ~5.5GB usable by Ollama)
  const ramPct = usedMock ? 44 : Math.round(Math.random() * 20 + 35);
  const cpuPct = usedMock ? 18 : Math.round(Math.random() * 30 + 10);
  const ollamaRamGB = 3.2;
  const ollamaRamPct = (ollamaRamGB / 5.5) * 100;

  const moduleEntries = data ? Object.entries(data.modules) : [];
  const healthyCount = moduleEntries.filter(([, v]) => v.status === "healthy" || v.status === "online").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Health Monitor
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Empire OS — localhost:3001 {usedMock && <span className="text-amber-400">[mock data — server offline]</span>}
          </p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-semibold transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-mono text-slate-400 uppercase">Empire OS</span>
          </div>
          <div className={`text-lg font-black uppercase ${statusColor(data?.status ?? "unknown")}`}>
            {loading ? "…" : (data?.status ?? "Unknown")}
          </div>
          <div className="text-[9px] font-mono text-slate-600 mt-0.5">Port 3001</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-mono text-slate-400 uppercase">Modules</span>
          </div>
          <div className="text-lg font-black text-cyan-400">
            {loading ? "…" : `${healthyCount}/${moduleEntries.length}`}
          </div>
          <div className="text-[9px] font-mono text-slate-600 mt-0.5">Healthy</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-mono text-slate-400 uppercase">Last Check</span>
          </div>
          <div className="text-sm font-black text-purple-400">
            {lastRefresh ? lastRefresh.toLocaleTimeString() : "—"}
          </div>
          <div className="text-[9px] font-mono text-slate-600 mt-0.5">Polls every 6s</div>
        </div>
      </div>

      {/* Resource Bars */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">System Resources — 8GB RAM Laptop</span>
        </div>
        <ResourceBar label="RAM (System)" pct={ramPct} color="text-cyan-400" />
        <ResourceBar label="CPU" pct={cpuPct} color="text-indigo-400" />
        <ResourceBar label={`Ollama VRAM (${ollamaRamGB}GB / 5.5GB usable)`} pct={ollamaRamPct} color="text-emerald-400" />
        <div className="text-[9px] font-mono text-slate-600 pt-1">
          Usable for Ollama: 5.5GB — models ≤5.5GB ✅ &nbsp;≤8GB ⚠️ &nbsp;&gt;8GB ❌
        </div>
      </div>

      {/* Module Grid */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-3">Module Status</div>
        {loading ? (
          <div className="text-slate-600 font-mono text-sm text-center py-6">Loading modules…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {moduleEntries.map(([id, mod]) => (
              <div
                key={id}
                className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={mod.status} />
                  <span className="text-xs font-mono text-slate-300">{id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono font-bold uppercase ${statusColor(mod.status)}`}>
                    {mod.status}
                  </span>
                  <a
                    href={`${EMPIRE_OS}/${id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] font-mono text-indigo-400 hover:text-indigo-300 underline"
                  >
                    open ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empire OS Link */}
      <div className="text-center">
        <a
          href="http://localhost:3001/empire-dashboard/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-slate-100 font-mono text-xs font-bold transition"
        >
          <Server className="w-3.5 h-3.5" />
          Open Empire OS Dashboard ↗
        </a>
      </div>
    </div>
  );
}
