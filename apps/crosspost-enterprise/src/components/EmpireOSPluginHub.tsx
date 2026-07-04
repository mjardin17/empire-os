import React, { useState, useEffect, useRef } from "react";
import { 
  Server, Cpu, Database, Brain, Play, RefreshCw, Send, Terminal, 
  CheckCircle, AlertTriangle, ShieldAlert, Zap, Activity, Info, 
  Globe, Code, ChevronRight, Share2, CornerDownRight, CheckCircle2 
} from "lucide-react";

interface EndpointInfo {
  method: string;
  path: string;
  description: string;
}

interface PluginMetadata {
  success: boolean;
  pluginId: string;
  name: string;
  version: string;
  status: string;
  developer: string;
  architecture: {
    framework: string;
    hostPort: number;
    protocol: string;
  };
  capabilities: string[];
  dependencies: {
    aiEngine: string;
    executionRuntime: string;
    styling: string;
  };
  endpoints: EndpointInfo[];
  orchestraKeyConfigured: boolean;
  timestamp: string;
}

interface EventLog {
  id: string;
  timestamp: string;
  source: string;
  type: string;
  payload: any;
}

interface RouterMetrics {
  latencyMs: number;
  modelUsed: string;
  tokensCount: number;
  estimatedCostUsd: number;
  gateway: string;
  isSimulated: boolean;
}

export default function EmpireOSPluginHub() {
  // Plugin info state
  const [pluginInfo, setPluginInfo] = useState<PluginMetadata | null>(null);
  const [loadingRegister, setLoadingRegister] = useState<boolean>(true);

  // Event bus state
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
  const [eventEmitSource, setEventEmitSource] = useState<string>("empire.plugin.crosspost");
  const [eventEmitType, setEventEmitType] = useState<string>("content.generated");
  const [eventEmitPayload, setEventEmitPayload] = useState<string>(
    JSON.stringify({ platform: "twitter", charCount: 242, qualityScore: 94 }, null, 2)
  );
  const [emittingEvent, setEmittingEvent] = useState<boolean>(false);

  // AI Router state
  const [routerPrompt, setRouterPrompt] = useState<string>("Analyze the engagement pattern of B2B SaaS builders and suggest a post theme.");
  const [routerInstruction, setRouterInstruction] = useState<string>("You are an expert LinkedIn growth consultant. Output a professional viral recommendation.");
  const [routerPlatform, setRouterPlatform] = useState<string>("linkedin");
  const [routerModel, setRouterModel] = useState<string>("gemini-3.5-flash");
  const [routerResponse, setRouterResponse] = useState<string>("");
  const [routerMetrics, setRouterMetrics] = useState<RouterMetrics | null>(null);
  const [routerLoading, setRouterLoading] = useState<boolean>(false);

  // Goose Runtime state
  const [gooseCommand, setGooseCommand] = useState<string>("scrape-social-density");
  const [gooseNicheInput, setGooseNicheInput] = useState<string>("AI Agents for Solo Hackers");
  const [gooseTargetPlatform, setGooseTargetPlatform] = useState<string>("twitter,linkedin");
  const [gooseLogs, setGooseLogs] = useState<any[]>([]);
  const [gooseExecuting, setGooseExecuting] = useState<boolean>(false);
  const [gooseRunId, setGooseRunId] = useState<string | null>(null);

  // Fetch plugin registration data
  const fetchRegistration = async () => {
    setLoadingRegister(true);
    try {
      const res = await fetch("/api/empire/register");
      const data = await res.json();
      if (data.success) {
        setPluginInfo(data);
      }
    } catch (err) {
      console.error("Failed to load registration:", err);
    } finally {
      setLoadingRegister(false);
    }
  };

  // Fetch event bus logs
  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/empire/event-bus");
      const data = await res.json();
      if (data.success) {
        setEvents(data.events.reverse()); // Show newest first
      }
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchRegistration();
    fetchEvents();
    // Poll events every 10 seconds
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, []);

  // Post new event to the bus
  const handleEmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmittingEvent(true);
    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(eventEmitPayload);
      } catch {
        parsedPayload = { rawText: eventEmitPayload };
      }

      const res = await fetch("/api/empire/event-bus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: eventEmitSource,
          type: eventEmitType,
          payload: parsedPayload
        })
      });
      const data = await res.json();
      if (data.success) {
        setEventEmitPayload(JSON.stringify({ platform: "twitter", charCount: Math.floor(Math.random() * 100) + 120, qualityScore: Math.floor(Math.random() * 10) + 90 }, null, 2));
        await fetchEvents();
      }
    } catch (err) {
      console.error("Failed to emit event:", err);
    } finally {
      setEmittingEvent(false);
    }
  };

  // Run central AI router query
  const handleRouteAI = async () => {
    if (!routerPrompt.trim()) return;
    setRouterLoading(true);
    setRouterResponse("");
    setRouterMetrics(null);
    try {
      const res = await fetch("/api/empire/ai-router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: routerPrompt,
          systemInstruction: routerInstruction,
          platformId: routerPlatform,
          useModel: routerModel
        })
      });
      const data = await res.json();
      if (data.success) {
        setRouterResponse(data.text);
        setRouterMetrics(data.metrics);
        await fetchEvents(); // Update event log since AI Router emits an event
      }
    } catch (err) {
      console.error("AI Router failure:", err);
      setRouterResponse("Error: Failed to route query to the Empire AI Router.");
    } finally {
      setRouterLoading(false);
    }
  };

  // Run Goose Runtime Command
  const handleExecuteGoose = async () => {
    setGooseExecuting(true);
    setGooseLogs([]);
    setGooseRunId(null);
    try {
      const args = gooseCommand === "scrape-social-density" 
        ? { niche: gooseNicheInput } 
        : { platforms: gooseTargetPlatform.split(",") };

      const res = await fetch("/api/empire/goose-runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: gooseCommand,
          args
        })
      });
      const data = await res.json();
      if (data.success) {
        setGooseRunId(data.runId);
        // Play an interactive staggered terminal log display
        let currentLogs: any[] = [];
        for (let i = 0; i < data.logs.length; i++) {
          await new Promise(r => setTimeout(r, 650));
          currentLogs.push(data.logs[i]);
          setGooseLogs([...currentLogs]);
        }
        await fetchEvents(); // Update event logs
      }
    } catch (err) {
      console.error("Goose runtime failure:", err);
      setGooseLogs([{ timestamp: "0.0s", action: "ERROR", output: "Goose runtime failed to initialize CLI." }]);
    } finally {
      setGooseExecuting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Top Header Panel indicating Core Registration */}
      <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border-2 border-purple-900/60 rounded-xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-purple-900/50 text-purple-300 border border-purple-800 rounded-full">
                Empire OS Plug-In Architecture
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-950/50 text-emerald-400 border border-emerald-900 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Registered & Live
              </span>
            </div>
            
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              CrossPost System Plugin Gateway
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Standardized modular distribution module connected securely to the <strong>Empire Core Node</strong>. Exposes real-time analytical and content synthesis utilities to the host operating system, subscribing to events via the system-wide Event Bus.
            </p>
          </div>

          <div className="bg-slate-950/95 border border-purple-900/40 rounded-lg p-4 font-mono text-[11px] text-slate-300 space-y-2 shrink-0 md:min-w-[280px]">
            <div className="flex justify-between border-b border-slate-900 pb-1.5">
              <span className="text-slate-500">PLUGIN NAME:</span>
              <span className="font-bold text-slate-200">crosspost-content-os</span>
            </div>
            <div className="flex justify-between border-b border-slate-900 pb-1.5">
              <span className="text-slate-500">CORE INTERACTION:</span>
              <span className="text-purple-400 font-bold">EMPIRE CORE (v3.5)</span>
            </div>
            <div className="flex justify-between border-b border-slate-900 pb-1.5">
              <span className="text-slate-500">API GATEWAY PORT:</span>
              <span className="text-emerald-400 font-bold">3000 (HTTPS Ingress)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">STATUS MAPPING:</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-extrabold text-[9px]">ACTIVE_OK</span>
            </div>
          </div>
        </div>

        {/* Plugin capabilities bento tags */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-850">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 flex items-center gap-3">
            <Activity className="w-5 h-5 text-purple-400 shrink-0" />
            <div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase">Protocol Mode</span>
              <span className="text-[11px] font-bold text-slate-300">REST + Event Bus</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 flex items-center gap-3">
            <Brain className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase">AI Engine Gateway</span>
              <span className="text-[11px] font-bold text-slate-300">Gemini 3.5 Flash</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 flex items-center gap-3">
            <Terminal className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase">Runtime Context</span>
              <span className="text-[11px] font-bold text-slate-300">Goose CLI Executor</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 flex items-center gap-3">
            <Globe className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase">Host Environment</span>
              <span className="text-[11px] font-bold text-slate-300">Cloud Run Sandboxed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left column (AI Router + Goose Exec), Right Column (Event Bus + API Explorer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: 7 cols */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Section 1: Empire AI Router (Standardized Gateway API) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-cyan-400 animate-pulse" />
                <h3 className="text-sm font-mono font-black uppercase text-slate-100 tracking-tight">
                  Empire AI Router Playground
                </h3>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-950/50 text-cyan-400 border border-cyan-900/30">
                Gateway Ingress: POST /api/empire/ai-router
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              Test queries routed through the <strong>Empire AI Router</strong>. The router acts as a cognitive load balancer, parsing instructions, tracking token volumes, auditing estimated cost in USD, and applying fallback algorithms when necessary.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 font-bold uppercase">System Instruction Override</label>
                <input
                  type="text"
                  value={routerInstruction}
                  onChange={(e) => setRouterInstruction(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 font-bold uppercase">Platform Target</label>
                  <select
                    value={routerPlatform}
                    onChange={(e) => setRouterPlatform(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="linkedin">LinkedIn (Professional)</option>
                    <option value="twitter">X / Twitter (Brevity)</option>
                    <option value="tiktok">TikTok (Casual)</option>
                    <option value="reddit">Reddit (Community)</option>
                    <option value="youtube">YouTube (SEO Essay)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 font-bold uppercase">LLM Core Model</label>
                  <select
                    value={routerModel}
                    onChange={(e) => setRouterModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 font-bold uppercase">User prompt</label>
              <textarea
                value={routerPrompt}
                onChange={(e) => setRouterPrompt(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 text-xs font-sans rounded-lg p-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition leading-relaxed resize-none"
              />
            </div>

            <button
              onClick={handleRouteAI}
              disabled={routerLoading || !routerPrompt.trim()}
              className="w-full bg-gradient-to-r from-cyan-500 to-indigo-600 hover:opacity-90 text-slate-950 hover:text-slate-950 font-mono text-xs font-black uppercase tracking-wider py-2.5 rounded-lg transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {routerLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>ROUTING AND BALANCING REQUEST...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>ROUTE COGNITIVE REQUEST</span>
                </>
              )}
            </button>

            {/* AI Router response and telemetry stats */}
            {(routerResponse || routerMetrics) && (
              <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Router Reply Output</span>
                  <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/40 border border-emerald-900 px-2 py-0.5 rounded">
                    <CheckCircle className="w-3 h-3" />
                    <span>Response Decoded</span>
                  </span>
                </div>

                <div className="text-xs font-sans text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                  {routerResponse}
                </div>

                {routerMetrics && (
                  <div className="bg-slate-900 border border-slate-850 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-mono">
                    <div className="p-2 border-r border-slate-850 md:border-r">
                      <span className="text-[9px] text-slate-500 block uppercase">LATENCY</span>
                      <span className="text-xs font-bold text-cyan-400">{routerMetrics.latencyMs}ms</span>
                    </div>
                    <div className="p-2 border-r border-slate-850 md:border-r">
                      <span className="text-[9px] text-slate-500 block uppercase">ENGINE</span>
                      <span className="text-[10px] font-bold text-slate-300 break-all">{routerMetrics.modelUsed}</span>
                    </div>
                    <div className="p-2 border-r border-slate-850 md:border-r">
                      <span className="text-[9px] text-slate-500 block uppercase">TOKEN VOL</span>
                      <span className="text-xs font-bold text-indigo-400">~{routerMetrics.tokensCount} tokens</span>
                    </div>
                    <div className="p-2">
                      <span className="text-[9px] text-slate-500 block uppercase">EST. COST</span>
                      <span className="text-xs font-bold text-emerald-400">${routerMetrics.estimatedCostUsd.toFixed(6)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Goose Execution Runtime CLI */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-mono font-black uppercase text-slate-100 tracking-tight">
                  Goose Execution Runtime Terminal
                </h3>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-900/30">
                Gateway Ingress: POST /api/empire/goose-runtime
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              Dispatch autonomous scraper crawls, keyword indexings, or deployment tasks straight to the <strong>Goose Execution Runtime CLI</strong>. The CLI automates social search queries and publishes post payload outputs directly to external gateways.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 font-bold uppercase">Goose Command</label>
                <select
                  value={gooseCommand}
                  onChange={(e) => setGooseCommand(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="scrape-social-density">scrape-social-density</option>
                  <option value="deploy-winning-posts">deploy-winning-posts</option>
                </select>
              </div>

              {gooseCommand === "scrape-social-density" ? (
                <div className="md:col-span-5 space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 font-bold uppercase">Niche Filter Arg</label>
                  <input
                    type="text"
                    value={gooseNicheInput}
                    onChange={(e) => setGooseNicheInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-sans"
                  />
                </div>
              ) : (
                <div className="md:col-span-5 space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 font-bold uppercase">Platforms Target Arg</label>
                  <input
                    type="text"
                    value={gooseTargetPlatform}
                    onChange={(e) => setGooseTargetPlatform(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-sans"
                  />
                </div>
              )}

              <div className="md:col-span-3">
                <button
                  onClick={handleExecuteGoose}
                  disabled={gooseExecuting}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 text-slate-950 font-mono text-xs font-black uppercase tracking-wider py-2.5 rounded-lg transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {gooseExecuting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>SPAWNING...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>SPAWN GOOSE</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Goose terminal logging logs */}
            {(gooseExecuting || gooseLogs.length > 0) && (
              <div className="bg-slate-950 border border-slate-850 rounded-lg overflow-hidden flex flex-col shadow-inner">
                <div className="bg-slate-900 px-4 py-2 border-b border-slate-850 flex justify-between items-center text-[10px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span className="text-slate-200 font-black">GOOSE RUNTIME TERMINAL</span>
                  </div>
                  <span className="text-slate-500">{gooseRunId || "PENDING_ID"}</span>
                </div>

                <div className="p-4 bg-slate-950 font-mono text-[11px] leading-relaxed text-slate-300 min-h-[140px] space-y-2 select-text max-h-[250px] overflow-auto">
                  {gooseLogs.map((log: any, idx: number) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                      <span className="text-amber-400 font-bold shrink-0">{log.action}:</span>
                      <span className="text-slate-200">{log.output}</span>
                    </div>
                  ))}
                  {gooseExecuting && (
                    <div className="flex gap-1.5 items-center text-slate-400 text-[10px] italic mt-1 bg-slate-900/30 p-1 rounded max-w-[200px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                      <span>Goose crawling social clusters...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Side: 5 cols */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Section 3: Empire Event Bus Real-Time Ledger */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-mono font-black uppercase text-slate-100 tracking-tight">
                  Empire Event Bus Ledger
                </h3>
              </div>
              <button 
                onClick={fetchEvents}
                disabled={loadingEvents}
                className="text-[10px] font-mono text-purple-400 hover:text-purple-300 transition flex items-center gap-1 cursor-pointer disabled:opacity-45"
              >
                <RefreshCw className={`w-3 h-3 ${loadingEvents ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              Monitor standard ecosystem triggers published across the <strong>Empire Event Bus</strong>. Any system actions (saving drafts, dispatching AI queries, running Goose tasks) automatically broadcast a persistent schema log.
            </p>

            {/* Event ledger flow */}
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="text-center py-6 border border-slate-850 rounded-lg text-xs font-mono text-slate-500 bg-slate-950/40">
                  No Event Bus entries logged.
                </div>
              ) : (
                events.map((evt: EventLog) => {
                  const isCore = evt.source.includes("core");
                  const isGoose = evt.source.includes("goose");
                  
                  return (
                    <div 
                      key={evt.id} 
                      className={`p-3 rounded-lg border text-xs font-mono transition-all duration-150 hover:bg-slate-950 ${
                        isCore 
                          ? "bg-slate-950/50 border-cyan-900/30" 
                          : isGoose
                            ? "bg-slate-950/50 border-amber-900/30"
                            : "bg-purple-950/10 border-purple-900/30"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold ${
                          isCore ? "text-cyan-400" : isGoose ? "text-amber-400" : "text-purple-300"
                        }`}>
                          {evt.type}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      <div className="text-[10px] text-slate-400 break-words font-sans space-y-1">
                        <div>
                          <span className="font-mono text-slate-500 uppercase text-[9px]">Source:</span>{" "}
                          <span className="font-mono text-slate-300">{evt.source}</span>
                        </div>
                        <div>
                          <span className="font-mono text-slate-500 uppercase text-[9px]">Payload:</span>{" "}
                          <code className="text-slate-350 bg-slate-950/80 px-1 py-0.5 rounded break-all text-[9px]">
                            {JSON.stringify(evt.payload)}
                          </code>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Emit Mock Event Form */}
            <form onSubmit={handleEmitEvent} className="bg-slate-950 border border-slate-850 rounded-lg p-3.5 space-y-3">
              <span className="text-[9.5px] font-mono font-bold text-purple-400 uppercase tracking-wider block">
                Emit Custom Testing Event on Event Bus
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-slate-500 uppercase font-bold block">Event Source</label>
                  <input
                    type="text"
                    value={eventEmitSource}
                    onChange={(e) => setEventEmitSource(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-[10px] text-slate-200 font-mono focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-slate-500 uppercase font-bold block">Event Type</label>
                  <input
                    type="text"
                    value={eventEmitType}
                    onChange={(e) => setEventEmitType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-[10px] text-slate-200 font-mono focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase font-bold block">JSON Payload</label>
                <textarea
                  value={eventEmitPayload}
                  onChange={(e) => setEventEmitPayload(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-800 text-[10px] font-mono rounded p-2 text-slate-300 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={emittingEvent}
                className="w-full bg-purple-900/40 border border-purple-700/60 hover:bg-purple-900/70 text-purple-200 font-mono text-[10px] font-bold uppercase tracking-wider py-1.5 rounded cursor-pointer transition disabled:opacity-40"
              >
                {emittingEvent ? "Broadcasting..." : "Broadcast Event message"}
              </button>
            </form>
          </div>

          {/* Section 4: REST API Gateway Directory */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
              <Globe className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-mono font-black uppercase text-slate-100 tracking-tight">
                Standard REST API Gateway
              </h3>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              The CrossPost plugin registers and maps the following REST endpoints within the central Empire OS Core network:
            </p>

            <div className="space-y-2 font-mono">
              {pluginInfo?.endpoints.map((ep: EndpointInfo, idx: number) => {
                const isGet = ep.method === "GET";
                const isEmpire = ep.path.includes("empire");
                return (
                  <div key={idx} className="p-2 bg-slate-950 border border-slate-850 rounded flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${
                          isGet ? "bg-cyan-950 text-cyan-400 border border-cyan-900/40" : "bg-emerald-950 text-emerald-400 border border-emerald-900/40"
                        }`}>
                          {ep.method}
                        </span>
                        <span className={`text-[10px] font-bold truncate ${isEmpire ? "text-purple-300" : "text-slate-300"}`}>
                          {ep.path}
                        </span>
                      </div>
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest bg-slate-900 px-1 rounded">
                        {isEmpire ? "CORE_SYS" : "PLUGIN"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-sans leading-relaxed">
                      {ep.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
