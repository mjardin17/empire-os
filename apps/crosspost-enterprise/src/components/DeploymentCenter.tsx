import React, { useState } from "react";
import {
  Cloud, Terminal, Server, Play, Shield, RefreshCw, CheckCircle2, AlertCircle, Cpu, GitBranch
} from "lucide-react";

export default function DeploymentCenter() {
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([
    "[SYSTEM] Continuous Integration (CI) link established with Cloud Run.",
    "[SYSTEM] Ingress gateway: listening exclusively on external port 3000.",
    "[SYSTEM] Active pipeline hook: git branch (main) -> build container."
  ]);

  const [containers, setContainers] = useState([
    { name: "empire-os-main", status: "ACTIVE", revision: "v1.4.2", cpu: "0.2 Core", ram: "340 MB", url: "https://os.empire-corp.internal" },
    { name: "ollama-gpu-node", status: "STANDBY", revision: "v2.0.1", cpu: "1.4 Cores", ram: "1.2 GB", url: "https://ollama.gpu.internal" },
    { name: "documentary-render-host", status: "IDLE", revision: "v0.8.5", cpu: "0.0 Core", ram: "84 MB", url: "https://renderer.internal" }
  ]);

  const triggerDeploySequence = () => {
    setLoading(true);
    const newLogs = [
      `[PIPELINE] Initializing build parameters for main trunk branch...`,
      `[PIPELINE] Executing docker container compilation layers...`,
      `[PIPELINE] Layer 1: Node.js 20 base environment verified.`,
      `[PIPELINE] Layer 2: Compiling TypeScript into bundled JS...`,
      `[PIPELINE] Layer 3: Optimizing static CSS files and tailwind templates...`,
      `[PIPELINE] Directing output container to private Google Artifact Registry...`,
      `[PIPELINE] Triggering Cloud Run container transition handshake...`,
      `[PIPELINE] Ingress validation checks: PORT 3000 verified.`,
      `[SUCCESS] Deployed successfully. New revision hash: c2ed6f27`
    ];

    let i = 0;
    const interval = setInterval(() => {
      setLogs(prev => [...prev, newLogs[i]]);
      if (i >= newLogs.length - 1) {
        clearInterval(interval);
        setLoading(false);
      } else {
        i++;
      }
    }, 350);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Deployment & VCS Pipeline Center
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/30 px-2 py-0.5 rounded">
            CLOUD CONFIG
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Monitor your continuous deployment pipelines, track active Cloud Run virtual container revisions, inspect ingress routing ports, and trigger automated repository deployments.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Active Containers & Metrics */}
        <div className="lg:col-span-6 space-y-4">
          <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
            <Server className="w-4 h-4 text-zinc-500" />
            Virtual Container Pods
          </h4>

          <div className="space-y-3">
            {containers.map((container, i) => (
              <div key={i} className="bg-zinc-950/60 border border-zinc-850 p-4 rounded-lg space-y-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <strong className="text-xs font-mono text-slate-200">{container.name}</strong>
                      <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        container.status === "ACTIVE" ? "bg-emerald-950/40 border border-emerald-900/30 text-emerald-400" :
                        container.status === "STANDBY" ? "bg-indigo-950/40 border border-indigo-900/30 text-indigo-400" :
                        "bg-zinc-900 border border-zinc-850 text-slate-500"
                      }`}>
                        {container.status}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-600 block">{container.url}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{container.revision}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono bg-zinc-950 p-2 rounded border border-zinc-900">
                  <div className="flex justify-between text-slate-450">
                    <span>CPU Allocation:</span>
                    <strong className="text-slate-200">{container.cpu}</strong>
                  </div>
                  <div className="flex justify-between text-slate-450">
                    <span>RAM Utilization:</span>
                    <strong className="text-slate-200">{container.ram}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Console logs & Control Hooks */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-zinc-500" />
              Build & Handshake Deployment Logs
            </h4>
            
            <button
              onClick={triggerDeploySequence}
              disabled={loading}
              className="text-[9px] font-mono font-bold bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-550 px-3 py-1 rounded cursor-pointer transition flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              RE-TRIGGER DEPLOY
            </button>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-3 font-mono">
            <div className="flex justify-between items-center text-[10px] border-b border-zinc-900 pb-2 text-slate-500">
              <span className="flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5" />
                VCS: main branch
              </span>
              <span>GATEWAY PORT: 3000</span>
            </div>

            <div className="h-60 overflow-y-auto text-[10.5px] text-zinc-400 space-y-1 select-text scrollbar-thin">
              {logs.map((log, index) => (
                <div 
                  key={index} 
                  className={
                    log.startsWith("[SUCCESS]") ? "text-emerald-400" :
                    log.startsWith("[SYSTEM]") ? "text-indigo-400" : "text-zinc-500"
                  }
                >
                  {log}
                </div>
              ))}
              {loading && <div className="inline-block w-1.5 h-3.5 bg-zinc-650 animate-pulse">_</div>}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
