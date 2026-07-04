import React, { useState, useEffect, useRef } from "react";
import { 
  Cpu, Server, Activity, Zap, Play, RefreshCw, Plus, Check, Trash2, 
  Terminal, Code, ArrowRight, Clock, Flame, Sliders, AlertCircle, 
  Layers, HardDrive, Info, Share2, HelpCircle 
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from "recharts";

interface OllamaModel {
  name: string;
  size: string;
  parameterSize: string;
  quantFormat: string;
  specialization: string;
  averageSpeed: number; // tok/sec
  vramRequired: number; // GB
  benchmarkData?: {
    promptEvalSpeed: number;
    tokenGenSpeed: number;
    firstTokenMs: number;
  };
}

interface QueueJob {
  id: string;
  prompt: string;
  model: string;
  priority: "low" | "medium" | "high";
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  response?: string;
  metrics?: {
    latencyMs: number;
    tokensPerSecond: number;
    tokensGenerated: number;
  };
  submittedAt: string;
  completedAt?: string;
}

interface SystemMetrics {
  cpu: {
    loadPercentage: number;
    coresCount: number;
    model: string;
  };
  ram: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    percentage: number;
  };
  gpu: {
    loadPercentage: number;
    totalVramGb: number;
    usedVramGb: number;
    freeVramGb: number;
    modelName: string;
  };
}

export default function OllamaCommandCenter() {
  // Connection state
  const [hostUrl, setHostUrl] = useState<string>("http://127.0.0.1:11434");
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [updatingConfig, setUpdatingConfig] = useState<boolean>(false);

  // Models state
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState<boolean>(true);
  
  // Custom model registration state
  const [showRegisterForm, setShowRegisterForm] = useState<boolean>(false);
  const [newModelName, setNewModelName] = useState<string>("");
  const [newModelSize, setNewModelSize] = useState<string>("4.0 GB");
  const [newModelParams, setNewModelParams] = useState<string>("7B");
  const [newModelQuant, setNewModelQuant] = useState<string>("Q4_K_M");
  const [newModelSpecial, setNewModelSpecial] = useState<string>("General instruction, logical tasks");
  const [newModelSpeed, setNewModelSpeed] = useState<number>(35);
  const [newModelVram, setNewModelVram] = useState<number>(4.2);
  const [registeringModel, setRegisteringModel] = useState<boolean>(false);

  // System usage state
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);

  // Playground state
  const [prompt, setPrompt] = useState<string>("Write an optimized SQL query to fetch all posts from 'llama3' with an interaction rate higher than 85%.");
  const [taskType, setTaskType] = useState<string>("code");
  const [selectedModel, setSelectedModel] = useState<string>("auto");
  const [priority, setPriority] = useState<string>("medium");
  const [submittingJob, setSubmittingJob] = useState<boolean>(false);

  // Queue state
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [loadingQueue, setLoadingQueue] = useState<boolean>(false);
  const [clearingQueue, setClearingQueue] = useState<boolean>(false);

  // Benchmark state
  const [benchmarkingModel, setBenchmarkingModel] = useState<string | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);

  // Active viewing tab inside Ollama dashboard
  const [activeTab, setActiveTab] = useState<"laboratory" | "models" | "benchmarks" | "integrations">("laboratory");

  // Fetch models registry
  const fetchModels = async () => {
    try {
      const res = await fetch("/api/ollama/models");
      const data = await res.json();
      if (data.success) {
        setModels(data.models);
        setIsLiveConnected(data.isLiveOllamaConnected);
        setHostUrl(data.hostUrl);
      }
    } catch (err) {
      console.error("Failed to load local models:", err);
    } finally {
      setLoadingModels(false);
    }
  };

  // Fetch queue items
  const fetchQueue = async () => {
    try {
      const res = await fetch("/api/ollama/queue");
      const data = await res.json();
      if (data.success) {
        setQueue(data.queue.reverse()); // Newest first
      }
    } catch (err) {
      console.error("Failed to fetch queue:", err);
    }
  };

  // Fetch resource telemetry metrics
  const fetchSystemMetrics = async () => {
    try {
      const res = await fetch("/api/ollama/system-usage");
      const data = await res.json();
      if (data.success) {
        setSystemMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Failed to fetch system metrics:", err);
    }
  };

  // Config custom Ollama Host URL
  const handleUpdateHost = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingConfig(true);
    try {
      const res = await fetch("/api/ollama/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostUrl })
      });
      const data = await res.json();
      if (data.success) {
        await fetchModels();
      }
    } catch (err) {
      console.error("Failed to update host:", err);
    } finally {
      setUpdatingConfig(false);
    }
  };

  // Register Custom Model
  const handleRegisterModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelName.trim()) return;
    setRegisteringModel(true);
    try {
      const res = await fetch("/api/ollama/models/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newModelName,
          size: newModelSize,
          parameterSize: newModelParams,
          quantFormat: newModelQuant,
          specialization: newModelSpecial,
          averageSpeed: newModelSpeed,
          vramRequired: newModelVram
        })
      });
      const data = await res.json();
      if (data.success) {
        setModels(data.models);
        setShowRegisterForm(false);
        setNewModelName("");
      }
    } catch (err) {
      console.error("Failed to register custom model:", err);
    } finally {
      setRegisteringModel(false);
    }
  };

  // Queue a request to Ollama
  const handleQueueRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmittingJob(true);
    try {
      const res = await fetch("/api/ollama/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          taskType,
          model: selectedModel,
          priority
        })
      });
      const data = await res.json();
      if (data.success) {
        await fetchQueue();
        setPrompt("");
      }
    } catch (err) {
      console.error("Failed to queue prompt:", err);
    } finally {
      setSubmittingJob(false);
    }
  };

  // Clear Completed jobs
  const handleClearQueue = async () => {
    setClearingQueue(true);
    try {
      const res = await fetch("/api/ollama/queue/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await fetchQueue();
      }
    } catch (err) {
      console.error("Failed to clear queue:", err);
    } finally {
      setClearingQueue(false);
    }
  };

  // Run benchmark on specific model
  const handleRunBenchmark = async (modelName: string) => {
    setBenchmarkingModel(modelName);
    setBenchmarkResult(null);
    try {
      const res = await fetch("/api/ollama/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName })
      });
      const data = await res.json();
      if (data.success) {
        setBenchmarkResult(data.metrics);
        // Enrich specific model local state
        setModels(prev => prev.map(m => {
          if (m.name === modelName) {
            return {
              ...m,
              benchmarkData: {
                promptEvalSpeed: data.metrics.promptEvalSpeedTokensPerSec,
                tokenGenSpeed: data.metrics.tokenGenerationSpeedTokensPerSec,
                firstTokenMs: data.metrics.timeToFirstTokenMs
              }
            };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error("Benchmark failed:", err);
    } finally {
      setBenchmarkingModel(null);
    }
  };

  // Initialize and polling handlers
  useEffect(() => {
    fetchModels();
    fetchQueue();
    fetchSystemMetrics();

    const intervalStats = setInterval(fetchSystemMetrics, 3000);
    const intervalQueue = setInterval(fetchQueue, 1500); // Fast queue monitoring

    return () => {
      clearInterval(intervalStats);
      clearInterval(intervalQueue);
    };
  }, []);

  // Pre-prepare chart data for models comparison
  const chartData = models.map(m => ({
    name: m.name,
    "Gen Speed (t/s)": m.benchmarkData ? m.benchmarkData.tokenGenSpeed : m.averageSpeed,
    "Eval Speed (t/s)": m.benchmarkData ? m.benchmarkData.promptEvalSpeed : Math.round(250 * (10 / m.vramRequired)),
    "VRAM Needed (GB)": m.vramRequired,
    "First Token (ms)": m.benchmarkData ? m.benchmarkData.firstTokenMs : Math.round(140 + (m.vramRequired * 50))
  }));

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Hero Header panel */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-cyan-950/40 border-2 border-emerald-900/50 rounded-xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-emerald-900/40 text-emerald-300 border border-emerald-800 rounded-full">
                Ollama Command Center
              </span>
              
              {isLiveConnected ? (
                <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-900 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Connected to Local Ollama
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-blue-950/80 text-blue-300 border border-blue-900 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  Local Simulation Active
                </span>
              )}
            </div>

            <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2.5">
              <Cpu className="w-6 h-6 text-emerald-400" />
              Ollama Command Center
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Automated resource load balancing, request queuing, smart cognitive task routing, and hardware performance auditing for local LLMs. Connected seamlessly to your workstation daemon or sandboxed host container.
            </p>
          </div>

          {/* Quick Host URL config */}
          <form onSubmit={handleUpdateHost} className="bg-slate-950/95 border border-zinc-850 rounded-lg p-4 space-y-3 shrink-0 md:min-w-[340px]">
            <span className="text-[9.5px] font-mono font-extrabold text-slate-400 uppercase tracking-wider block">
              Ollama Daemon host override
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="bg-zinc-900 border border-zinc-800 rounded p-1.5 text-xs text-slate-200 font-mono grow focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={updatingConfig}
                className="bg-emerald-950 border border-emerald-800 text-emerald-400 px-3 rounded hover:bg-emerald-900 hover:text-emerald-300 transition duration-150 font-mono text-xs font-black shrink-0 cursor-pointer disabled:opacity-40"
              >
                {updatingConfig ? "SAVING..." : "UPDATE"}
              </button>
            </div>
            <div className="text-[9px] font-mono text-slate-500 flex items-center gap-1">
              <Info className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Defaults to loopback interface 11434 port.</span>
            </div>
          </form>
        </div>

        {/* Dynamic sub-tab switcher */}
        <div className="flex gap-2.5 border-t border-zinc-850/60 mt-6 pt-5">
          {[
            { id: "laboratory", label: "Prompt Laboratory", icon: Terminal, color: "text-emerald-400" },
            { id: "models", label: "Model Registry", icon: Layers, color: "text-cyan-400" },
            { id: "benchmarks", label: "Benchmark Suite", icon: Flame, color: "text-amber-500" },
            { id: "integrations", label: "Local API Hub", icon: Code, color: "text-indigo-400" }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                  active 
                    ? "bg-zinc-850 text-slate-100 border-zinc-700 shadow" 
                    : "text-slate-400 hover:text-slate-100 bg-transparent border-transparent hover:bg-zinc-900/30"
                }`}
              >
                <Icon className={`w-4 h-4 ${tab.color}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Real-time System resource monitors telemetry section */}
      {systemMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* CPU Load */}
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl space-y-3 shadow-md">
            <div className="flex justify-between items-center border-b border-zinc-850 pb-2">
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">CPU Core Load</span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-200">{systemMetrics.cpu.loadPercentage}%</span>
            </div>
            
            <div className="space-y-1.5">
              <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  style={{ width: `${systemMetrics.cpu.loadPercentage}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>Cores: {systemMetrics.cpu.coresCount}</span>
                <span className="truncate max-w-[160px]">{systemMetrics.cpu.model}</span>
              </div>
            </div>
          </div>

          {/* System RAM */}
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl space-y-3 shadow-md">
            <div className="flex justify-between items-center border-b border-zinc-850 pb-2">
              <div className="flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">System Memory</span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-200">{systemMetrics.ram.percentage}%</span>
            </div>

            <div className="space-y-1.5">
              <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-cyan-500 h-full transition-all duration-500" 
                  style={{ width: `${systemMetrics.ram.percentage}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>Used: {systemMetrics.ram.usedGb} GB</span>
                <span>Total: {systemMetrics.ram.totalGb} GB</span>
              </div>
            </div>
          </div>

          {/* GPU VRAM Allocations */}
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl space-y-3 shadow-md">
            <div className="flex justify-between items-center border-b border-zinc-850 pb-2">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">GPU VRAM Load</span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-200">
                {Math.round((systemMetrics.gpu.usedVramGb / systemMetrics.gpu.totalVramGb) * 100)}%
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-500 h-full transition-all duration-500" 
                  style={{ width: `${(systemMetrics.gpu.usedVramGb / systemMetrics.gpu.totalVramGb) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>VRAM allocated: {systemMetrics.gpu.usedVramGb} GB</span>
                <span>Max: {systemMetrics.gpu.totalVramGb} GB</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab content split */}
      <div className="grid grid-cols-1 gap-8">
        
        {/* Tab 1: Prompt Laboratory */}
        {activeTab === "laboratory" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Prompt submit form */}
            <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <span className="text-[10.5px] font-mono font-extrabold text-slate-200 uppercase">
                  Ollama dispatch laboratory
                </span>
                <span className="text-[8px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 rounded uppercase">
                  REST POST: /api/ollama/route
                </span>
              </div>

              <form onSubmit={handleQueueRequest} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9.5px] font-mono text-slate-400 font-bold uppercase block">Task Category</label>
                    <select
                      value={taskType}
                      onChange={(e) => setTaskType(e.target.value)}
                      className="w-full bg-slate-950 border border-zinc-800 text-xs font-mono rounded p-2.5 text-slate-300 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="code">Code / SQL Synthesis</option>
                      <option value="creative">Creative Copy / Writing</option>
                      <option value="translation">Multilingual Translation</option>
                      <option value="fast">Low-Latency Fast Summary</option>
                      <option value="general">General Instruction</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9.5px] font-mono text-slate-400 font-bold uppercase block">Priority weights</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full bg-slate-950 border border-zinc-800 text-xs font-mono rounded p-2.5 text-slate-300 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="low">Low (Standard/Batch)</option>
                      <option value="medium">Medium (Regular Prompt)</option>
                      <option value="high">High (Real-time Interactive)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[9.5px] font-mono text-slate-400 font-bold uppercase">Target local model</label>
                    <span className="text-[8px] font-mono text-slate-500 italic">Auto routing selects ideal weights</span>
                  </div>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-slate-950 border border-zinc-800 text-xs font-mono rounded p-2.5 text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="auto">🔥 Auto Model Routing (Cognitive Core)</option>
                    {models.map(m => (
                      <option key={m.name} value={m.name}>{m.name} ({m.size})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9.5px] font-mono text-slate-400 font-bold uppercase block">Prompt instruction</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="Enter local prompt instructions..."
                    className="w-full bg-slate-950 border border-zinc-800 text-xs font-sans rounded p-3 text-slate-200 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingJob || !prompt.trim()}
                  className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 text-slate-950 font-mono text-xs font-black uppercase tracking-wider py-3 rounded-lg transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submittingJob ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>QUEUING REQUEST...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>DISPATCH TO OLLAMA QUEUE</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Active Request queue ledger */}
            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4.5 h-4.5 text-emerald-400" />
                  <span className="text-[10.5px] font-mono font-extrabold text-slate-200 uppercase">
                    Execution Queue ledger
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-slate-500 bg-zinc-950 px-2 py-0.5 rounded">
                    QUEUE LENGTH: {queue.length}
                  </span>
                  <button
                    onClick={handleClearQueue}
                    disabled={clearingQueue || queue.length === 0}
                    className="text-[9px] font-mono text-red-400 hover:text-red-300 transition flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Archive</span>
                  </button>
                </div>
              </div>

              {/* Queue items cards list */}
              <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
                {queue.length === 0 ? (
                  <div className="text-center py-16 border border-zinc-850 rounded-lg text-xs font-mono text-slate-500 bg-slate-950/40 space-y-2">
                    <Clock className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                    <div>No active or archived Ollama jobs in local queue.</div>
                    <div className="text-[10px] text-slate-600 max-w-sm mx-auto">Submit a query from the laboratory to dispatch an automated local-LLM generation task.</div>
                  </div>
                ) : (
                  queue.map((job) => {
                    const isProcessing = job.status === "processing";
                    const isQueued = job.status === "queued";
                    const isCompleted = job.status === "completed";
                    
                    return (
                      <div 
                        key={job.id} 
                        className={`p-4 bg-slate-950 border rounded-lg space-y-3 transition-all duration-150 ${
                          isProcessing 
                            ? "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.05)]" 
                            : isQueued
                              ? "border-amber-500/30"
                              : "border-zinc-850"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-black text-slate-300">
                              {job.id}
                            </span>
                            <span className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                              job.priority === "high" 
                                ? "bg-red-950 text-red-400 border border-red-900/30" 
                                : job.priority === "medium"
                                  ? "bg-amber-950 text-amber-400 border border-amber-900/30"
                                  : "bg-zinc-850 text-slate-400"
                            }`}>
                              {job.priority} Prio
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 bg-zinc-900 px-2 rounded">
                              {job.model}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                              isCompleted 
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-900/40" 
                                : isProcessing
                                  ? "bg-cyan-950 text-cyan-400 border border-cyan-900/40 animate-pulse"
                                  : "bg-zinc-900 text-slate-500"
                            }`}>
                              {job.status.toUpperCase()}
                            </span>
                            <span className="text-[9px] font-mono text-slate-600">
                              {new Date(job.submittedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {/* Prompt and description block */}
                        <div className="text-xs text-slate-300 font-sans border-l-2 border-zinc-850 pl-3 leading-relaxed">
                          "{job.prompt}"
                        </div>

                        {/* Progress bar */}
                        {(isProcessing || isQueued) && (
                          <div className="space-y-1 bg-zinc-900/40 p-2 rounded border border-zinc-850/40">
                            <div className="flex justify-between text-[9px] font-mono text-slate-400">
                              <span>Local context loading...</span>
                              <span>{job.progress}%</span>
                            </div>
                            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full transition-all duration-300"
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Completed Response text block */}
                        {isCompleted && job.response && (
                          <div className="space-y-2.5 pt-1">
                            <div className="bg-zinc-900/80 rounded border border-zinc-850 p-3 text-[11.5px] font-mono leading-relaxed text-slate-300 whitespace-pre-wrap select-text">
                              {job.response}
                            </div>
                            
                            {/* Performance statistics */}
                            {job.metrics && (
                              <div className="bg-slate-950 border border-zinc-900 p-2.5 rounded grid grid-cols-3 gap-2 text-center font-mono text-[9.5px]">
                                <div>
                                  <span className="text-slate-500 block uppercase">QUEUE LATENCY</span>
                                  <span className="font-extrabold text-emerald-400">{job.metrics.latencyMs}ms</span>
                                </div>
                                <div className="border-x border-zinc-900">
                                  <span className="text-slate-500 block uppercase">TOKENS SPEED</span>
                                  <span className="font-extrabold text-cyan-400">{job.metrics.tokensPerSecond} tok/s</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block uppercase">TOKENS COUNT</span>
                                  <span className="font-extrabold text-indigo-400">~{job.metrics.tokensGenerated} tokens</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Models Explorer */}
        {activeTab === "models" && (
          <div className="space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
                  Auto-detected Local Ollama Models
                </h3>
                <p className="text-xs text-slate-500">
                  Select a local weights repository to run low-latency diagnostic benchmarks.
                </p>
              </div>

              <button
                onClick={() => setShowRegisterForm(!showRegisterForm)}
                className="bg-emerald-950 border border-emerald-800 text-emerald-400 px-4 py-2 rounded-lg hover:bg-emerald-900 transition font-mono text-[10.5px] font-bold uppercase tracking-wider flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Register Custom Model</span>
              </button>
            </div>

            {/* Custom Register form */}
            {showRegisterForm && (
              <form onSubmit={handleRegisterModel} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4 animate-fadeIn">
                <span className="text-xs font-mono font-black text-slate-300 uppercase tracking-wider block border-b border-zinc-850 pb-2">
                  Register custom weights manifest
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block">Model Name Tag</label>
                    <input
                      type="text"
                      placeholder="e.g. gemma2:9b"
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      className="w-full bg-slate-950 border border-zinc-800 rounded p-2 text-xs text-slate-250 font-mono focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block">Disk Size</label>
                    <input
                      type="text"
                      placeholder="e.g. 5.5 GB"
                      value={newModelSize}
                      onChange={(e) => setNewModelSize(e.target.value)}
                      className="w-full bg-slate-950 border border-zinc-800 rounded p-2 text-xs text-slate-250 font-mono focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block">Quant Level</label>
                    <input
                      type="text"
                      placeholder="e.g. Q4_K_M"
                      value={newModelQuant}
                      onChange={(e) => setNewModelQuant(e.target.value)}
                      className="w-full bg-slate-950 border border-zinc-800 rounded p-2 text-xs text-slate-250 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block">Parameter scale</label>
                    <input
                      type="text"
                      placeholder="e.g. 9.2B"
                      value={newModelParams}
                      onChange={(e) => setNewModelParams(e.target.value)}
                      className="w-full bg-slate-950 border border-zinc-800 rounded p-2 text-xs text-slate-250 font-mono focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block">VRAM usage (GB)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newModelVram}
                      onChange={(e) => setNewModelVram(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-zinc-800 rounded p-2 text-xs text-slate-250 font-mono focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block">Avg generation speed (t/s)</label>
                    <input
                      type="number"
                      value={newModelSpeed}
                      onChange={(e) => setNewModelSpeed(parseInt(e.target.value))}
                      className="w-full bg-slate-950 border border-zinc-800 rounded p-2 text-xs text-slate-250 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block">Capabilities specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. Code execution, text translation, dense reasoning"
                    value={newModelSpecial}
                    onChange={(e) => setNewModelSpecial(e.target.value)}
                    className="w-full bg-slate-950 border border-zinc-800 rounded p-2.5 text-xs text-slate-250 font-sans focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterForm(false)}
                    className="px-4 py-2 border border-zinc-800 text-slate-400 rounded-lg hover:bg-zinc-850 font-mono text-[10px] font-bold uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={registeringModel}
                    className="px-5 py-2 bg-emerald-500 text-slate-950 rounded-lg font-mono text-[10px] font-extrabold uppercase tracking-wider cursor-pointer hover:opacity-90 disabled:opacity-40"
                  >
                    {registeringModel ? "REGISTERING..." : "REGISTER MANIFEST"}
                  </button>
                </div>
              </form>
            )}

            {/* Models list grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {loadingModels ? (
                <div className="col-span-full text-center py-16 text-slate-500 font-mono">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-400" />
                  <span>Loading local model tags manifest...</span>
                </div>
              ) : (
                models.map((model) => {
                  const isBenchmarking = benchmarkingModel === model.name;
                  return (
                    <div 
                      key={model.name} 
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4.5 flex flex-col justify-between space-y-4 hover:border-zinc-750 transition"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs font-mono font-black text-slate-250 flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                              {model.name}
                            </span>
                            <span className="text-[9.5px] font-mono text-slate-500 block uppercase">
                              Quantization: {model.quantFormat}
                            </span>
                          </div>
                          
                          <span className="text-[9px] font-mono px-2 py-0.5 bg-slate-950 border border-zinc-850 text-slate-300 rounded font-black shrink-0">
                            {model.size}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                          {model.specialization}
                        </p>

                        <div className="bg-slate-950 border border-zinc-900 p-2.5 rounded grid grid-cols-2 gap-2 font-mono text-[9.5px]">
                          <div>
                            <span className="text-slate-500 block uppercase">Params</span>
                            <span className="text-slate-300 font-bold">{model.parameterSize}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block uppercase">Avg speed</span>
                            <span className="text-slate-300 font-bold">{model.averageSpeed} tok/s</span>
                          </div>
                        </div>

                        {/* Benchmark subtelemetry if loaded */}
                        {model.benchmarkData && (
                          <div className="bg-emerald-950/20 border border-emerald-900/40 p-2.5 rounded font-mono text-[9.5px] text-emerald-400 space-y-1 animate-fadeIn">
                            <div className="flex justify-between font-bold">
                              <span>PROMPT EVAL RATE:</span>
                              <span>{model.benchmarkData.promptEvalSpeed} tok/s</span>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span>GEN SPEED:</span>
                              <span>{model.benchmarkData.tokenGenSpeed} tok/s</span>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span>FIRST TOKEN LAG:</span>
                              <span>{model.benchmarkData.firstTokenMs}ms</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleRunBenchmark(model.name)}
                        disabled={isBenchmarking}
                        className="w-full bg-zinc-950 border border-zinc-800 hover:bg-zinc-850 text-slate-300 font-mono text-[9px] font-bold uppercase tracking-wider py-1.5 rounded cursor-pointer transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        {isBenchmarking ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                            <span>COMPUTING LLM BENCHMARK...</span>
                          </>
                        ) : (
                          <>
                            <Flame className="w-3 h-3 text-amber-500" />
                            <span>AUDIT HARDWARE BENCHMARK</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {/* Tab 3: Benchmark comparisons charts */}
        {activeTab === "benchmarks" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Chart comparatives */}
            <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-6">
              <div>
                <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
                  Ecosystem-wide speed comparatives (tokens/sec)
                </h3>
                <p className="text-xs text-slate-500">
                  Calculated against standard system weights mapping. Lower quantization increases speed but degrades reasoning bounds.
                </p>
              </div>

              <div className="h-[280px] w-full bg-slate-950/60 p-2 rounded-lg border border-zinc-850">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} label={{ value: 'Tokens / Sec', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: 10 } }} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Gen Speed (t/s)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Eval Speed (t/s)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="h-[280px] w-full bg-slate-950/60 p-2 rounded-lg border border-zinc-850">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: 10 } }} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="First Token (ms)" stroke="#f59e0b" strokeWidth={2.5} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed benchmark diagnostic cards */}
            <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
              <span className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider block border-b border-zinc-850 pb-2">
                Latency diagnostics manual
              </span>

              <div className="space-y-4 font-sans text-xs text-slate-400 leading-relaxed">
                <div className="p-3 bg-slate-950 border border-zinc-850 rounded space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-mono font-bold">
                    <Flame className="w-3.5 h-3.5 shrink-0" />
                    <span>Prompt Eval Speed</span>
                  </div>
                  <p className="text-[11px]">
                    Speed at which the daemon pre-loads the prompt tokens into GPU cache. Higher VRAM bandwidth directly accelerates this step.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-zinc-850 rounded space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold">
                    <Activity className="w-3.5 h-3.5 shrink-0" />
                    <span>Token Generation Speed</span>
                  </div>
                  <p className="text-[11px]">
                    Speed at which new cognitive content is generated. Strongly bound to parameter weights complexity (e.g. 70B runs vastly slower than 8B).
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-zinc-850 rounded space-y-1.5">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-mono font-bold">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Time To First Token</span>
                  </div>
                  <p className="text-[11px]">
                    Total startup latency before generation streams out. Involves loading the context window and initial tensor evaluation steps.
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab 4: Rest Integration Hub */}
        {activeTab === "integrations" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-6">
            <div>
              <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
                Unified Local REST API Hub documentation
              </h3>
              <p className="text-xs text-slate-500">
                Fully functional REST integration guide. Exposes standard endpoints that CrossPost, StoryForge, Documentary Factory, and external scripts can invoke asynchronously.
              </p>
            </div>

            <div className="space-y-5">
              
              {/* Endpoint 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-mono">
                  <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900 rounded font-black text-[10px]">
                    POST
                  </span>
                  <span className="text-xs text-slate-200 font-bold">
                    /api/ollama/route
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    - Queues and auto-routes local prompt instructions
                  </span>
                </div>

                <div className="bg-slate-950 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-slate-300 relative overflow-x-auto select-all">
                  <pre>{`curl -X POST http://localhost:3000/api/ollama/route \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Synthesize a robust Node.js backend middleware for CrossPost.",
    "taskType": "code",
    "model": "auto",
    "priority": "high"
  }'`}</pre>
                </div>
              </div>

              {/* Endpoint 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-mono">
                  <span className="px-1.5 py-0.5 bg-cyan-950 text-cyan-400 border border-cyan-900 rounded font-black text-[10px]">
                    GET
                  </span>
                  <span className="text-xs text-slate-200 font-bold">
                    /api/ollama/queue
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    - Fetch queue status ledger and output results
                  </span>
                </div>

                <div className="bg-slate-950 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-slate-300 relative overflow-x-auto select-all">
                  <pre>{`fetch("http://localhost:3000/api/ollama/queue")
  .then(res => res.json())
  .then(data => console.log("Ollama Execution Queue:", data.queue));`}</pre>
                </div>
              </div>

              {/* Javascript dynamic example code */}
              <div className="space-y-2 pt-4 border-t border-zinc-850">
                <span className="text-xs font-mono font-black text-slate-300 uppercase tracking-wider block">
                  Cross-Service Client Integration (TypeScript/ES6)
                </span>
                <p className="text-xs text-slate-400">
                  Use this client-side helper within CrossPost, StoryForge, or other workspace products to execute local completions:
                </p>

                <div className="bg-slate-950 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-slate-300 relative overflow-x-auto">
                  <pre>{`export async function dispatchToOllama(prompt: string, category: "code" | "creative" | "general" = "general") {
  // 1. Submit prompt to centralized Ollama Command Center queue
  const submitRes = await fetch("/api/ollama/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, taskType: category, priority: "high" })
  });
  const submitData = await submitRes.json();
  if (!submitData.success) throw new Error("Ollama Queue routing failed");

  const jobId = submitData.job.id;

  // 2. Poll queue endpoint until job transition is complete
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    
    const queueRes = await fetch("/api/ollama/queue");
    const queueData = await queueRes.json();
    const job = queueData.queue.find((j: any) => j.id === jobId);
    
    if (job && job.status === "completed") {
      return { response: job.response, metrics: job.metrics };
    }
    if (job && job.status === "failed") {
      throw new Error("Local Ollama execution failed inside queue runtime");
    }
  }
  throw new Error("Polling timeout waiting for Ollama processor.");
}`}</pre>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}
