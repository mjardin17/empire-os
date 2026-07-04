import React, { useState, useEffect } from "react";
import {
  Settings, Key, Server, Sliders, Save, CheckCircle2, ShieldCheck, Terminal, HelpCircle
} from "lucide-react";

interface SettingsCenterProps {
  githubToken?: string;
  onUpdateGithubToken?: (token: string) => void;
  apiMode?: "live" | "simulated";
  onUpdateApiMode?: (mode: "live" | "simulated") => void;
}

export default function SettingsCenter({
  githubToken = "",
  onUpdateGithubToken,
  apiMode = "simulated",
  onUpdateApiMode
}: SettingsCenterProps) {
  const [localToken, setLocalToken] = useState<string>(githubToken);
  const [ollamaEndpoint, setOllamaEndpoint] = useState<string>("http://localhost:11434");
  const [cacheExpiry, setCacheExpiry] = useState<number>(24);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    setLocalToken(githubToken);
  }, [githubToken]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateGithubToken) {
      onUpdateGithubToken(localToken);
    }
    localStorage.setItem("empire_ollama_endpoint", ollamaEndpoint);
    localStorage.setItem("empire_cache_expiry", cacheExpiry.toString());
    localStorage.setItem("empire_temperature", temperature.toString());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Save Success Banner */}
      {saveSuccess && (
        <div className="bg-emerald-950/40 border border-emerald-900 text-emerald-400 p-3.5 rounded-lg flex items-center gap-2 text-xs font-mono animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>SYSTEM CALIBRATION COMMITTED: Secure tokens and weights updated in the corporate cache.</span>
        </div>
      )}
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Empire OS System Properties
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/30 px-2 py-0.5 rounded">
            SYS CONSOLE
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Calibrate secure credential variables, tune offline artificial neuron temperature thresholds, monitor environment keys, and hook local port parameters.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Credentials & Gateways */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-4 h-4 text-zinc-500" />
              Secure Credential Bindings
            </h4>

            {/* Gemini API state indicator */}
            <div className="bg-zinc-900 p-3 rounded border border-zinc-850 space-y-1">
              <span className="text-[8px] font-mono text-slate-500 uppercase block font-bold">Google Gemini API Key Status</span>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300">process.env.GEMINI_API_KEY</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SECURED BY PLATFORM
                </span>
              </div>
            </div>

            {/* GitHub Personal Access Token */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase flex items-center gap-1">
                GitHub Sync Access Token
                <HelpCircle className="w-3 h-3 text-zinc-600" title="Token remains fully localized in secure client-state variables." />
              </label>
              <input
                type="password"
                placeholder="ghp_********************************"
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-xs font-mono text-slate-200 placeholder-slate-750 focus:outline-none"
              />
            </div>

            {/* API Mode */}
            {onUpdateApiMode && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Gateway API Mode</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateApiMode("simulated")}
                    className={`flex-1 py-2 rounded text-xs font-mono font-bold transition ${
                      apiMode === "simulated" 
                        ? "bg-indigo-600 text-white border border-indigo-550" 
                        : "bg-zinc-950 text-slate-400 border border-zinc-850"
                    }`}
                  >
                    SIMULATED SANDBOX
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateApiMode("live")}
                    className={`flex-1 py-2 rounded text-xs font-mono font-bold transition ${
                      apiMode === "live" 
                        ? "bg-emerald-600 text-white border border-emerald-550" 
                        : "bg-zinc-950 text-slate-400 border border-zinc-850"
                    }`}
                  >
                    LIVE GEMINI API
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Calibration & Calibration */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-4 h-4 text-zinc-500" />
              Ollama Daemon Local Ports
            </h4>

            {/* Ollama API port */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Local Ollama URI Gateway</label>
              <input
                type="text"
                value={ollamaEndpoint}
                onChange={(e) => setOllamaEndpoint(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-xs font-mono text-slate-200 focus:outline-none"
              />
            </div>

            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5 pt-2 border-t border-zinc-900">
              <Sliders className="w-4 h-4 text-zinc-500" />
              Cognitive Fine-Tuning Weights
            </h4>

            {/* Temperature Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>MODEL TEMPERATURE ENTROPY</span>
                <span className="font-bold text-slate-200">{temperature}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.5"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-[9px] text-zinc-600 block leading-snug">Higher value results in creative story treating; lower results in precise code audit blocks.</span>
            </div>

            {/* Cache Expiry */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>TEMPORARY FILE CACHE RETENTION</span>
                <span className="font-bold text-slate-200">{cacheExpiry} Hours</span>
              </div>
              <input
                type="range"
                min="1"
                max="168"
                step="1"
                value={cacheExpiry}
                onChange={(e) => setCacheExpiry(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-650 hover:bg-indigo-600 text-white font-mono text-xs font-bold uppercase tracking-wider py-2.5 rounded-lg cursor-pointer transition flex items-center justify-center gap-1.5 shadow-md"
          >
            <Save className="w-4 h-4" />
            COMMIT SYSTEM CHANGES
          </button>
        </div>

      </form>

      {/* Universal Empire_Context Package */}
      <div className="bg-zinc-950/40 border border-indigo-900/40 rounded-lg p-5 space-y-4 font-sans mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-xs font-mono font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-indigo-400" />
              Universal Empire_Context Package
            </h4>
            <p className="text-xs text-slate-300 max-w-xl">
              Consolidate this entire project and ecosystem into a universal single-source-of-truth workspace package. Generates 10 specialized architecture markdown/JSON files detailing projects, APIs, AI routing matrices, MCP services, workflows, and clean code paths.
            </p>
          </div>
          <a
            href="/api/download-for-claude"
            download="Empire_Context.zip"
            className="sm:shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-lg text-center transition flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-950/50"
          >
            <Save className="w-4 h-4 animate-pulse" />
            DOWNLOAD EMPIRE_CONTEXT ZIP
          </a>
        </div>
      </div>

    </div>
  );
}
