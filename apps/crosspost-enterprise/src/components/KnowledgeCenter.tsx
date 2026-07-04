import React, { useState } from "react";
import {
  BookOpen, Search, Sparkles, Terminal, FileText, ChevronRight, Plus, Trash, Database, Globe, Download
} from "lucide-react";

export default function KnowledgeCenter() {
  const [searchQuery, setSearchQuery] = useState<string>("local model setup guidelines");
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  const handleExportAIContext = async () => {
    setExporting(true);
    setExportSuccess(false);
    try {
      const response = await fetch("/api/export-ai-context");
      if (!response.ok) {
        throw new Error("Failed to export AI context.");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "EmpireOS_AI_Context.zip");
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err) {
      console.error(err);
      alert("Failed to compile or package the AI Context ZIP archive.");
    } finally {
      setExporting(false);
    }
  };

  const [wikiArticles, setWikiArticles] = useState([
    { id: 1, title: "Ollama Port binding & local execution parameters", category: "AI INFRA", lastUpdated: "2 days ago", readTime: "4 mins" },
    { id: 2, title: "High-Ticket SaaS listing hooks & conversion pricing models", category: "MARKETING", lastUpdated: "Yesterday", readTime: "12 mins" },
    { id: 3, title: "Cloud Run container security audit procedures on port 3000", category: "DEV OPS", lastUpdated: "5 mins ago", readTime: "8 mins" },
    { id: 4, title: "StoryForge treatment structure guidelines & multi-act setup", category: "CREATIVE", lastUpdated: "3 weeks ago", readTime: "6 mins" }
  ]);

  const handleVectorSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);

    // Simulate semantic embedding / pgvector search logic
    setTimeout(() => {
      setSearchResults([
        {
          title: "Ollama Port binding & local execution parameters",
          similarity: 0.965,
          snippet: "Configure the local AI server daemon to listen on port 11434. To ensure cross-module calling, bind the host flag inside settings to 0.0.0.0. This allows StoryForge and CrossPost components to execute local prompts synchronously.",
          category: "AI INFRA"
        },
        {
          title: "StoryForge treatment structure guidelines & multi-act setup",
          similarity: 0.812,
          snippet: "Ensure all narrative templates follow the BBC-style investigative tone profile. Local LLM models are pre-weighted to output structured storyboard scene lists, suitable for direct video rendering cues.",
          category: "CREATIVE"
        }
      ]);
      setSearching(false);
    }, 900);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Shared Knowledge & Wiki Center
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/30 px-2 py-0.5 rounded">
            EMBEDDINGS ACTIVE
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Store corporate wikis, platform blueprints, and marketing playbooks. Use the vector database search to perform semantic queries across embedded document layers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Semantic search & results */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
            <span className="text-[9px] font-mono text-indigo-400 uppercase block font-bold">Semantic Vector Search (pgvector)</span>
            
            <form onSubmit={handleVectorSearch} className="flex gap-2">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Ask a natural language technical question..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded-lg pl-9 pr-4 py-2.5 text-xs font-mono text-slate-200 placeholder-slate-750 focus:outline-none"
                />
              </div>
              
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="bg-indigo-650 hover:bg-indigo-600 text-white font-mono text-[10.5px] font-bold uppercase px-4 rounded-lg cursor-pointer transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {searching ? "SCANNING..." : "SEARCH"}
              </button>
            </form>

            {searchResults && (
              <div className="space-y-3.5 pt-2 animate-fade-in">
                <span className="text-[9px] font-mono text-slate-500 uppercase block font-semibold">Matched Embeddings Index</span>
                
                <div className="space-y-3">
                  {searchResults.map((res, i) => (
                    <div key={i} className="bg-zinc-900 p-3.5 border border-zinc-800 rounded-lg space-y-2 text-xs">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="font-bold text-slate-200 uppercase">{res.title}</span>
                        <span className="text-indigo-400 bg-indigo-950/30 px-1.5 py-0.5 rounded border border-indigo-900/30">
                          {Math.round(res.similarity * 100)}% Match
                        </span>
                      </div>
                      <p className="text-slate-350 leading-relaxed font-sans">{res.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Shared Wiki catalog */}
        <div className="lg:col-span-5 space-y-4">
          <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-zinc-500" />
            Shared Wiki Catalog
          </h4>

          <div className="space-y-2.5 max-h-[320px] overflow-y-auto scrollbar-thin pr-1">
            {wikiArticles.map(art => (
              <div key={art.id} className="bg-zinc-950/60 border border-zinc-850 p-3.5 rounded-lg flex justify-between items-start hover:border-zinc-700 transition">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono font-bold text-slate-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 uppercase">
                      {art.category}
                    </span>
                    <span className="text-[9px] text-slate-600 font-mono">Updated {art.lastUpdated}</span>
                  </div>
                  <strong className="text-xs font-sans text-slate-200 block leading-snug">{art.title}</strong>
                </div>
                
                <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap ml-2">
                  {art.readTime}
                </span>
              </div>
            ))}
          </div>

          {/* AI Context Export Box */}
          <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-zinc-950 border border-indigo-900/30 rounded-lg p-4 space-y-3 shadow-md">
            <div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-widest">
                  AI Context Exporter
                </span>
                <span className="text-[8px] font-mono font-bold text-emerald-400 uppercase bg-emerald-950/30 border border-emerald-900/30 px-1.5 py-0.5 rounded">
                  11 FILES
                </span>
              </div>
              <h5 className="text-xs font-black text-slate-200 mt-1">EMPIRE_SYSTEM_MANUAL PACK</h5>
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-1">
                Packages the master system manual, JSON system map, local models, pipeline guides, API specifications, and automation rules into a single ZIP archive to feed any LLM.
              </p>
            </div>

            <button
              onClick={handleExportAIContext}
              disabled={exporting}
              className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-bold uppercase transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5 ${
                exportSuccess
                  ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              }`}
            >
              <Download className="w-4 h-4" />
              {exporting ? "PACKAGING ZIP..." : exportSuccess ? "CONTEXT DOWNLOADED!" : "EXPORT AI CONTEXT"}
            </button>
          </div>

          <button
            onClick={() => alert("Redirecting to knowledge base editor node.")}
            className="w-full text-center bg-zinc-850 hover:bg-zinc-800 text-slate-300 border border-zinc-750 py-2 rounded-lg text-xs font-mono font-bold uppercase cursor-pointer transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-zinc-400" />
            CREATE NEW KNOWLEDGE RECORD
          </button>
        </div>

      </div>

    </div>
  );
}
