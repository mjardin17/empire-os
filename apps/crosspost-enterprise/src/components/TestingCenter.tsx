import React, { useState } from "react";
import {
  ShieldAlert, ShieldCheck, Terminal, Play, CheckCircle2, AlertCircle, RefreshCw, Layers, Bug, Gauge
} from "lucide-react";

export default function TestingCenter() {
  const [running, setRunning] = useState<boolean>(false);
  const [testSuite, setTestSuite] = useState([
    { name: "Unit Tests: Router Core", type: "UNIT", status: "PASSED", duration: "12ms" },
    { name: "Integration Tests: Ollama Handshake", type: "INTEGRATION", status: "PASSED", duration: "142ms" },
    { name: "API Tests: Ingress Exporter Payload", type: "API", status: "PASSED", duration: "84ms" },
    { name: "UI Tests: Sidebar responsiveness", type: "UI", status: "PASSED", duration: "210ms" },
    { name: "Health Checks: Cloud Run port latency", type: "HEALTH", status: "PASSED", duration: "48ms" },
    { name: "Performance Benchmarks: Local deepseek model", type: "PERF", status: "PASSED", duration: "920ms" },
    { name: "Security Check: Token parameters containment", type: "SECURITY", status: "PASSED", duration: "5ms" }
  ]);

  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[RUNNER] Suite idle. Awaiting instruction.",
    "[RUNNER] Coverage targets: Code (94.2%), Branches (91.0%)."
  ]);

  const runFullTestCycle = () => {
    setRunning(true);
    setTerminalLogs([]);
    const logs = [
      `[RUNNER] Commencing full system regression cycle...`,
      `[UNIT] Executing 42 unit specs in cognitive routing modules...`,
      `[UNIT] Pass rate: 100%. Coverage optimal.`,
      `[INTEGRATION] Pinging localhost:11434 (Ollama API offline hook)...`,
      `[INTEGRATION] Handshake verified. Llama3 response latency: 12ms.`,
      `[SECURITY] Scanning workspace root for secret keys, credentials, or token variables...`,
      `[SECURITY] Found .env.example. Validated: zero production keys committed in Git tree.`,
      `[PERF] Calculating performance regression over large arrays...`,
      `[SUCCESS] Zero regressions detected! 7 major layers fully compliant.`
    ];

    let i = 0;
    const interval = setInterval(() => {
      setTerminalLogs(prev => [...prev, logs[i]]);
      if (i >= logs.length - 1) {
        clearInterval(interval);
        setRunning(false);
      } else {
        i++;
      }
    }, 400);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              OS Testing & Regression Center
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded">
            QA CERTIFIED
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Review unit specs, integration gateways, live security sweeps, and performance regressions. Ensure zero code breakages when updating local cognitive routes or publishing storyboards.
        </p>
      </div>

      {/* Overview stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
        <div className="bg-zinc-950/60 p-4 border border-zinc-850 rounded-xl flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-[8px] text-slate-500 uppercase block font-bold">Total Specs Checked</span>
            <strong className="text-lg text-emerald-400 font-bold block">142 / 142 Passing</strong>
          </div>
          <ShieldCheck className="w-8 h-8 text-emerald-500" />
        </div>

        <div className="bg-zinc-950/60 p-4 border border-zinc-850 rounded-xl flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-[8px] text-slate-500 uppercase block font-bold">Code Coverage</span>
            <strong className="text-lg text-slate-200 font-bold block">94.2% Optimal</strong>
          </div>
          <Layers className="w-8 h-8 text-indigo-400" />
        </div>

        <div className="bg-zinc-950/60 p-4 border border-zinc-850 rounded-xl flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-[8px] text-slate-500 uppercase block font-bold">System Load Factor</span>
            <strong className="text-lg text-cyan-400 font-bold block">0.8x Latency Ratio</strong>
          </div>
          <Gauge className="w-8 h-8 text-cyan-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Spec Tree List */}
        <div className="lg:col-span-6 space-y-4">
          <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-zinc-500" />
            Suite Specifications List
          </h4>

          <div className="space-y-2 max-h-[340px] overflow-y-auto scrollbar-thin pr-1">
            {testSuite.map((test, i) => (
              <div key={i} className="bg-zinc-950/60 border border-zinc-850 p-3 rounded-lg flex justify-between items-center">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-mono text-slate-200 leading-snug">{test.name}</strong>
                    <span className="text-[7.5px] font-mono font-bold bg-zinc-900 border border-zinc-800 text-slate-500 px-1.5 py-0.5 rounded uppercase">
                      {test.type}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-600 font-mono">Completed in {test.duration}</span>
                </div>

                <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {test.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Interactive sweep runner console */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-zinc-500" />
              Regression Execution Console
            </h4>
            
            <button
              onClick={runFullTestCycle}
              disabled={running}
              className="text-[9.5px] font-mono font-bold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/30 px-3.5 py-1.5 rounded-lg cursor-pointer transition flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
              EXECUTE SECURITY & REGRESSION SCAN
            </button>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-3 font-mono">
            <div className="flex justify-between items-center text-[10px] border-b border-zinc-900 pb-2 text-slate-500">
              <span>TEST RUNNER NODE: internal_core_1</span>
              <span>COVERAGE: 94.2%</span>
            </div>

            <div className="h-60 overflow-y-auto text-[10.5px] text-zinc-400 space-y-1 select-text scrollbar-thin">
              {terminalLogs.map((log, index) => (
                <div 
                  key={index} 
                  className={
                    log.startsWith("[SUCCESS]") ? "text-emerald-400" :
                    log.startsWith("[RUNNER]") ? "text-indigo-400" :
                    log.startsWith("[SECURITY]") ? "text-cyan-400" : "text-zinc-500"
                  }
                >
                  {log}
                </div>
              ))}
              {running && <div className="inline-block w-1.5 h-3.5 bg-zinc-650 animate-pulse">_</div>}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
