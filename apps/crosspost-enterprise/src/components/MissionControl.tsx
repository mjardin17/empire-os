import React, { useState, useEffect } from "react";
import {
  Shield, Server, Cpu, GitFork, Cloud, DollarSign, Bell, ListTodo, Play, ArrowRight,
  TrendingUp, Activity, CheckCircle2, AlertCircle, RefreshCw, Zap, Sparkles, Terminal
} from "lucide-react";

interface MissionControlProps {
  onNavigate: (module: string) => void;
  githubToken?: string;
  apiMode?: "live" | "simulated";
}

export default function MissionControl({ onNavigate, githubToken, apiMode }: MissionControlProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [healthScore, setHealthScore] = useState<number>(98);
  const [activeJobs, setActiveJobs] = useState<number>(3);
  
  // Simulated stats that pulse slightly for operational aesthetic
  const [cpuUsage, setCpuUsage] = useState<number>(24);
  const [ramUsage, setRamUsage] = useState<number>(4.2);
  const [apiCalls, setApiCalls] = useState<number>(1429);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuUsage(prev => Math.min(95, Math.max(10, prev + (Math.random() * 8 - 4))));
      setRamUsage(prev => Math.min(16, Math.max(2, prev + (Math.random() * 0.2 - 0.1))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleManualReRun = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setHealthScore(99);
      setApiCalls(prev => prev + 5);
    }, 1200);
  };

  const tasks = [
    { id: 1, title: "Modernization audit: StoryForge Engine", status: "In Progress", priority: "HIGH" },
    { id: 2, title: "Download local deepseek-r1:7b model", status: "Scheduled", priority: "MEDIUM" },
    { id: 3, title: "Sync content queue to X/Twitter", status: "Pending approval", priority: "HIGH" },
    { id: 4, title: "Verify Cloud Run container ingress limits", status: "Idle", priority: "LOW" },
  ];

  const suggestedActions = [
    { text: "modernize legacy structures", detail: "Empire Inspector detected 3 duplicate functions in StoryForge.", target: "inspector" },
    { text: "benchmark local Ollama models", detail: "Evaluate deepseek-r1 CPU vs GPU parsing latency.", target: "ollama" },
    { text: "optimize high-ticket service listing", detail: "Generate optimized copywriting hooks using Boss Listers.", target: "listers" },
    { text: "execute pipeline security sweep", detail: "Verify SSL, secret files containment, and token variables.", target: "testing" }
  ];

  const notifications = [
    { id: 1, text: "GitHub VCS sync completed successfully", time: "5 mins ago", type: "success" },
    { id: 2, text: "Ollama offline cores loaded: llama3:latest detected", time: "12 mins ago", type: "info" },
    { id: 3, text: "Critical security warnings resolved in ingress router", time: "1 hour ago", type: "success" },
    { id: 4, text: "Weekly revenue arbitrage cap crossed: $4,850 MRR", time: "2 hours ago", type: "warning" }
  ];

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Top Banner Greeting */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-400 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
              EMPIRE OS CENTRAL STATION
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Authorized session active. All business pipelines, local artificial neural structures, and multi-channel publishing channels are online.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualReRun}
              disabled={loading}
              className="text-[10px] font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-lg cursor-pointer transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              RE-RUN INTEGRATED CHECKS
            </button>
            <button
              onClick={() => onNavigate("settings")}
              className="text-[10px] font-mono font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg border border-indigo-500/40 px-3.5 py-2 rounded-lg cursor-pointer transition"
            >
              OS SETTINGS
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Core Health Status indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Empire Health */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">Empire OS Health</span>
              <span className="text-xl font-black font-mono text-emerald-400">{healthScore}% Stability</span>
            </div>
            <div className="p-2 bg-emerald-950/30 border border-emerald-900/40 text-emerald-400 rounded-lg">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="border-t border-zinc-850/80 pt-2 flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>Ping: <strong className="text-slate-200">12ms</strong></span>
            <span>Uptime: <strong className="text-slate-200">99.98%</strong></span>
          </div>
        </div>

        {/* Card 2: AI Routing & Usage */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">AI Workload Routing</span>
              <span className="text-xl font-black font-mono text-indigo-400">{apiCalls} Queries</span>
            </div>
            <div className="p-2 bg-indigo-950/30 border border-indigo-900/40 text-indigo-400 rounded-lg">
              <Zap className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div className="border-t border-zinc-850/80 pt-2 flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>Core: <strong className="text-slate-200">{apiMode === "live" ? "Gemini 3.5" : "Simulated"}</strong></span>
            <span>Local: <strong className="text-emerald-400">Ollama Priority</strong></span>
          </div>
        </div>

        {/* Card 3: VCS / GitHub Link */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">GitHub VCS Gateway</span>
              <span className={`text-xl font-black font-mono ${githubToken ? "text-blue-400" : "text-amber-500"}`}>
                {githubToken ? "OPERATIONAL" : "SANDBOX MODE"}
              </span>
            </div>
            <div className="p-2 bg-blue-950/30 border border-blue-900/40 text-blue-400 rounded-lg">
              <GitFork className="w-4 h-4" />
            </div>
          </div>
          <div className="border-t border-zinc-850/80 pt-2 flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>Mode: <strong className="text-slate-200">{githubToken ? "Token Active" : "Playground"}</strong></span>
            <span>Webhooks: <strong className="text-emerald-400">Listening</strong></span>
          </div>
        </div>

        {/* Card 4: Global Revenue Stream */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">Estimated Monthly Revenue</span>
              <span className="text-xl font-black font-mono text-slate-100">$4,850.00 MRR</span>
            </div>
            <div className="p-2 bg-emerald-950/30 border border-emerald-900/40 text-emerald-400 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="border-t border-zinc-850/80 pt-2 flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>Yield multiplier: <strong className="text-cyan-400">4.5x</strong></span>
            <span>Ad Arbitrage: <strong className="text-emerald-400">Active</strong></span>
          </div>
        </div>

      </div>

      {/* Main split sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Suggested Actions & Task Queue */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Suggested Next Actions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Suggested Next Actions (Automation Driven)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestedActions.map((act, index) => (
                <button
                  key={index}
                  onClick={() => onNavigate(act.target)}
                  className="bg-zinc-950 border border-zinc-850/80 hover:border-zinc-700/80 hover:bg-zinc-900 p-4 rounded-lg text-left transition space-y-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 cursor-pointer group"
                >
                  <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wider block group-hover:text-indigo-300">
                    ACTION RECOMMENDATION 0{index + 1}
                  </span>
                  <h4 className="text-xs font-bold text-slate-200 uppercase flex items-center gap-1">
                    {act.text}
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-slate-300 group-hover:translate-x-1 transition" />
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{act.detail}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Task Queue Dashboard */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-850 pb-3">
              <h3 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-blue-400" />
                Active Task Queue ({tasks.length})
              </h3>
              <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded uppercase">
                Workers: Active ({activeJobs})
              </span>
            </div>

            <div className="space-y-2.5">
              {tasks.map(task => (
                <div key={task.id} className="bg-zinc-950 border border-zinc-850 p-3 rounded-lg flex justify-between items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-xs font-mono text-slate-200">{task.title}</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      task.priority === "HIGH" ? "bg-red-950/40 border border-red-900/30 text-red-400" :
                      task.priority === "MEDIUM" ? "bg-amber-950/40 border border-amber-900/30 text-amber-400" :
                      "bg-zinc-900 border border-zinc-800 text-slate-400"
                    }`}>
                      {task.priority}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{task.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Platform Metrics & Notifications */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Infrastructure Health Stats Panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 font-mono text-xs">
            <h3 className="text-[11px] font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-4 h-4 text-emerald-400" />
              OS Resource Telemetry
            </h3>
            
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>CPU INTRUSION MATRIX</span>
                  <span className="font-bold text-slate-200">{cpuUsage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-zinc-950 h-1.5 rounded overflow-hidden">
                  <div className="bg-emerald-500 h-full transition-all duration-350" style={{ width: `${cpuUsage}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>RAM ALLOCATION POOL</span>
                  <span className="font-bold text-slate-200">{ramUsage.toFixed(2)} GB / 16GB</span>
                </div>
                <div className="w-full bg-zinc-950 h-1.5 rounded overflow-hidden">
                  <div className="bg-indigo-500 h-full transition-all duration-350" style={{ width: `${(ramUsage / 16) * 100}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>DOCKER CONTAINERS STATUS</span>
                  <span className="font-bold text-slate-200">VIRTUALIZED / ONLINE</span>
                </div>
                <div className="flex gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="w-2 h-2 rounded-full bg-zinc-700" />
                </div>
              </div>
            </div>
          </div>

          {/* Live Notification Center */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Notifications & Security Audits
            </h3>
            
            <div className="space-y-3">
              {notifications.map(notif => (
                <div key={notif.id} className="bg-zinc-950/60 border border-zinc-850/80 p-3 rounded-lg flex gap-2.5 items-start">
                  <div className="mt-0.5">
                    {notif.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {notif.type === "info" && <Server className="w-3.5 h-3.5 text-blue-500" />}
                    {notif.type === "warning" && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-slate-300 font-sans leading-snug">{notif.text}</p>
                    <span className="text-[9px] font-mono text-slate-650">{notif.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
