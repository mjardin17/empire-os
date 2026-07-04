import React, { useState } from "react";
import {
  Brain, Zap, Sparkles, Terminal, ChevronRight, Settings, Plus, Trash, AlertCircle, RefreshCw,
  Play, Cpu, Database, Eye, CheckCircle
} from "lucide-react";

export default function AIRouter() {
  const [query, setQuery] = useState<string>("Write an optimized SQL query to fetch active projects from the registry and check for duplicate files.");
  const [loading, setLoading] = useState<boolean>(false);
  const [resultTrace, setResultTrace] = useState<any | null>(null);

  // Dynamic Routing Policies state
  const [policies, setPolicies] = useState([
    { id: 1, trigger: "SQL / database structure query", model: "Ollama (llama3)", priority: 1, active: true },
    { id: 2, trigger: "Real-time search or grounding needed", model: "Gemini 3.5 Flash", priority: 2, active: true },
    { id: 3, trigger: "Multi-file systems architecture / deep reasoning", model: "Claude 3.5 Sonnet", priority: 3, active: true },
    { id: 4, trigger: "Standard text summarization / draft curation", model: "Ollama (gemma2)", priority: 4, active: true }
  ]);

  const [newTrigger, setNewTrigger] = useState("");
  const [newModel, setNewModel] = useState("Ollama (llama3)");

  const handleAddPolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrigger.trim()) return;
    setPolicies([
      ...policies,
      {
        id: Date.now(),
        trigger: newTrigger,
        model: newModel,
        priority: policies.length + 1,
        active: true
      }
    ]);
    setNewTrigger("");
  };

  const handleDeletePolicy = (id: number) => {
    setPolicies(policies.filter(p => p.id !== id));
  };

  const handleRouteQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResultTrace(null);

    // Simulate real or cognitive routing handshake
    setTimeout(() => {
      let routedTo = "Ollama (llama3)";
      let confidence = 0.94;
      let latency = "240ms";
      let reason = "Localized query matching database syntax logic - resolved offline to preserve credit thresholds.";
      let content = "SELECT p.id, p.name, COUNT(f.id) FROM projects p JOIN files f ON f.project_id = p.id GROUP BY p.id HAVING COUNT(f.id) > 1;";

      const lowerQuery = query.toLowerCase();
      if (lowerQuery.includes("research") || lowerQuery.includes("grounding") || lowerQuery.includes("latest") || lowerQuery.includes("news")) {
        routedTo = "Gemini 3.5 Flash";
        confidence = 0.98;
        latency = "580ms";
        reason = "Context requires search grounding or live external retrieval.";
        content = "Under dynamic Google Search parameters, the requested context is analyzed under real-time indexing models...";
      } else if (lowerQuery.includes("architecture") || lowerQuery.includes("system") || lowerQuery.includes("modernization") || lowerQuery.includes("heavy")) {
        routedTo = "Claude 3.5 Sonnet";
        confidence = 0.96;
        latency = "1200ms";
        reason = "System requires highly structured multi-file reasoning / semantic dependency trees.";
        content = "[Systems Architecture Report Blueprint]\n- Gateway Node: Node.js/Express (Port 3000)\n- Worker Pipeline: Temporal.io\n- Retrieval Cluster: pgvector/Postgres";
      }

      setResultTrace({
        query,
        routedTo,
        confidence,
        latency,
        reason,
        content,
        steps: [
          { name: "Parser Hook Activated", status: "COMPLETE", detail: "Scanned text for language markers & intent keys." },
          { name: "Active Routing Policies Evaluated", status: "COMPLETE", detail: `Matched query against ${policies.length} pipeline rules.` },
          { name: "Performance/Telemetry Cost Check", status: "COMPLETE", detail: "Determined local model viability vs cloud API token expenditure." },
          { name: "Cognitive Router Dispatch", status: "SUCCESS", detail: `Channeled query to ${routedTo} endpoint.` }
        ]
      });
      setLoading(false);
    }, 1200);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header and description */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Enterprise AI Routing Node
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
            ACTIVE GATEWAY LAYER
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Every request made by workspace components flows through this central cognitive router. This ensures offline security (Ollama), real-time accuracy (Gemini), and complex system architectures (Claude) are automatically balanced.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Playground / Execution Area */}
        <div className="lg:col-span-7 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Input Cognitive Prompt</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Input your query or instructions..."
              className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-3 text-xs font-mono text-slate-200 placeholder-slate-700 min-h-[110px] focus:outline-none focus:border-zinc-700 leading-relaxed"
            />
          </div>

          <button
            onClick={handleRouteQuery}
            disabled={loading || !query.trim()}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-lg cursor-pointer transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                ORCHESTRATING ROUTE...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-slate-950 fill-slate-950" />
                EXECUTE COGNITIVE DISPATCH
              </>
            )}
          </button>

          {/* Trace Results */}
          {resultTrace && (
            <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-center font-mono text-[10px] border-b border-zinc-900 pb-2">
                <span className="text-slate-500 uppercase">Route Trace Results</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  ROUTED SUCCESSFULLY
                </span>
              </div>

              {/* High level stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/60 p-2 border border-zinc-850/40 rounded">
                  <span className="text-[8px] font-mono text-slate-500 block uppercase">Selected Provider</span>
                  <span className="text-xs font-bold text-amber-400 font-mono mt-0.5 block">{resultTrace.routedTo}</span>
                </div>
                <div className="bg-zinc-900/60 p-2 border border-zinc-850/40 rounded">
                  <span className="text-[8px] font-mono text-slate-500 block uppercase">Trace Confidence</span>
                  <span className="text-xs font-bold text-slate-200 font-mono mt-0.5 block">{Math.round(resultTrace.confidence * 100)}%</span>
                </div>
                <div className="bg-zinc-900/60 p-2 border border-zinc-850/40 rounded">
                  <span className="text-[8px] font-mono text-slate-500 block uppercase">Execution Latency</span>
                  <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5 block">{resultTrace.latency}</span>
                </div>
              </div>

              <div className="text-[11px] font-mono bg-zinc-900 p-2.5 rounded border border-zinc-850 text-slate-400">
                <span className="text-slate-500 uppercase text-[9px] block font-bold mb-0.5">ROUTING EXPLANATION</span>
                {resultTrace.reason}
              </div>

              {/* Progress Steps */}
              <div className="space-y-2">
                <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold">Execution trace blocks</span>
                <div className="space-y-1.5">
                  {resultTrace.steps.map((step: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-[10.5px] font-mono text-slate-400 pl-2 border-l border-zinc-800">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight className="w-3 h-3 text-amber-500" />
                        <span>{step.name}</span>
                      </div>
                      <span className="text-[9.5px] text-zinc-500">{step.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Content Preview */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold">Provider Output Stream</span>
                <pre className="bg-zinc-900 p-3 rounded text-[11px] font-mono text-slate-300 overflow-x-auto border border-zinc-850">
                  {resultTrace.content}
                </pre>
              </div>
            </div>
          )}

        </div>

        {/* Right: Dynamic Rule-book / Future Provider Configuration */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Policy manager */}
          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-4 space-y-4">
            <h4 className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-zinc-500" />
              Dynamic Routing Policies
            </h4>

            {/* List of active triggers */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin">
              {policies.map(policy => (
                <div key={policy.id} className="bg-zinc-950 border border-zinc-900 p-2.5 rounded flex justify-between items-start gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-200 font-medium leading-relaxed">{policy.trigger}</p>
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-950/25 px-1.5 py-0.5 rounded uppercase">
                      Target: {policy.model}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeletePolicy(policy.id)}
                    className="text-zinc-600 hover:text-red-400 p-1 rounded hover:bg-red-950/20"
                    title="Delete trigger rule"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Form to add a custom triggers */}
            <form onSubmit={handleAddPolicy} className="space-y-3 pt-3 border-t border-zinc-900">
              <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold">Add Custom Routing Rule</span>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="e.g. Code translation, user sentiment audit..."
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
                />
                
                <div className="flex gap-2">
                  <select
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    className="bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 flex-grow focus:outline-none"
                  >
                    <option value="Ollama (llama3)">Ollama (llama3)</option>
                    <option value="Gemini 3.5 Flash">Gemini 3.5 Flash</option>
                    <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
                    <option value="Ollama (gemma2)">Ollama (gemma2)</option>
                    <option value="DeepSeek R1 (Custom Endpoint)">DeepSeek R1 (Future Endpoint)</option>
                  </select>
                  
                  <button
                    type="submit"
                    className="bg-zinc-800 hover:bg-zinc-700 text-slate-200 border border-zinc-700 px-3 rounded text-[10px] font-mono font-bold uppercase transition"
                  >
                    ADD
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Future Provider Capability declaration card */}
          <div className="bg-slate-950/10 border border-dashed border-zinc-850 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-indigo-400 font-mono text-[10px] font-bold uppercase">
              <Plus className="w-4 h-4" />
              Future Proof Provider Grid
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              To plug in future endpoints (e.g. Groq, local Custom APIs, deepseek API), simply update your dynamic rule triggers above or write a simple custom integration module under the <strong className="text-slate-300 font-mono text-[10px]">OS Settings</strong> dashboard.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
