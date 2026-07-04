import React, { useState, useEffect, useCallback } from "react";
import { Compass, Search, Download, RefreshCw, Star, Cpu } from "lucide-react";

const EMPIRE_OS = "http://localhost:3001";

type CatalogItem = {
  id: string;
  name: string;
  icon?: string;
  category: string;
  description: string;
  ramGB?: number;
  free?: boolean;
  local?: boolean;
  recommended?: boolean;
  method?: string;
  tags?: string[];
};

const MOCK_CATALOG: CatalogItem[] = [
  { id: "qwen2.5:7b",        name: "Qwen 2.5 7B",          icon: "🧠", category: "llm",       description: "Best-in-class 7B. Multilingual, strong coding, low RAM.", ramGB: 4.7,  free: true,  local: true,  recommended: true,  tags: ["chat","coding","multilingual"] },
  { id: "gemma3:4b",         name: "Gemma 3 4B",           icon: "⚡", category: "llm",       description: "Google's fast 4B. Ideal for quick tasks on 8GB laptops.",  ramGB: 3.1,  free: true,  local: true,  recommended: true,  tags: ["chat","fast"] },
  { id: "qwen2.5-coder:7b",  name: "Qwen 2.5 Coder 7B",   icon: "💻", category: "coding",    description: "Top open-source code model. Rivals GPT-4 on benchmarks.",   ramGB: 4.7,  free: true,  local: true,  recommended: true,  tags: ["coding","typescript","python"] },
  { id: "nomic-embed-text",  name: "Nomic Embed Text",     icon: "🔗", category: "embedding", description: "Best open embedding model. Needed for RAG pipelines.",       ramGB: 0.3,  free: true,  local: true,  recommended: true,  tags: ["embeddings","rag"] },
  { id: "llava:7b",          name: "LLaVA 7B Vision",      icon: "👁️",  category: "vision",    description: "Multimodal model — understands images + text.",             ramGB: 4.7,  free: true,  local: true,                      tags: ["vision","multimodal"] },
  { id: "mistral-nemo:12b",  name: "Mistral Nemo 12B",     icon: "🌟", category: "llm",       description: "Mistral's best small model. Strong reasoning.",             ramGB: 7.1,  free: true,  local: true,                      tags: ["chat","reasoning"] },
  { id: "whisper.cpp",       name: "Whisper.cpp",          icon: "🎙️", category: "audio",     description: "Fast local speech-to-text. Transcribes your recordings.",   free: true,  local: true,                                  tags: ["stt","audio","transcription"] },
  { id: "piper-tts",         name: "Piper TTS",            icon: "🔊", category: "audio",     description: "High-quality local text-to-speech. Used for narration.",    free: true,  local: true,                                  tags: ["tts","narration","audio"] },
  { id: "comfyui",           name: "ComfyUI",              icon: "🎨", category: "image",     description: "Stable Diffusion node-based UI. Local image generation.",   free: true,  local: true,                                  tags: ["image","stable-diffusion","art"] },
  { id: "open-webui",        name: "Open WebUI",           icon: "🖥️", category: "tools",     description: "Beautiful local UI for Ollama models. Chat interface.",     free: true,  local: true,  recommended: true,              tags: ["ui","chat","ollama"] },
  { id: "goose",             name: "Goose CLI",            icon: "🦆", category: "tools",     description: "Agentic AI dev tool by Block. Runs tasks in your shell.",   free: true,  local: true,                                  tags: ["agent","cli","coding"] },
  { id: "higgsfield-ai",     name: "Higgsfield AI",        icon: "🎬", category: "video",     description: "Cloud AI video generation. Cinema-quality output.",         free: false, local: false,                                 tags: ["video","generation","cloud"] },
];

const CATEGORIES = ["all", "llm", "coding", "embedding", "vision", "audio", "image", "video", "tools"];

function ramLabel(ramGB?: number) {
  if (ramGB === undefined) return null;
  if (ramGB <= 5.5) return <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">✅ {ramGB}GB</span>;
  if (ramGB <= 8)   return <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-400">⚠️ {ramGB}GB</span>;
  return               <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-950 border border-red-800 text-red-400">❌ {ramGB}GB</span>;
}

export default function DiscoveryFeed() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedMock, setUsedMock] = useState(false);
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${EMPIRE_OS}/discovery/catalog`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("non-ok");
      const json = await res.json() as { catalog?: CatalogItem[] } | CatalogItem[];
      const items: CatalogItem[] = Array.isArray(json) ? json : (json.catalog ?? []);
      if (items.length === 0) throw new Error("empty");
      setCatalog(items);
      setUsedMock(false);
    } catch {
      setCatalog(MOCK_CATALOG);
      setUsedMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const installItem = async (item: CatalogItem) => {
    if (installing) return;
    setInstalling(item.id);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      await fetch(`${EMPIRE_OS}/installer/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, method: item.method ?? "ollama", cmd: item.id }),
        signal: ctrl.signal,
      });
    } catch { /* fire-and-forget */ }
    setInstalling(null);
    alert(`Install triggered for ${item.name}. Check Empire OS Store or Installer at localhost:3001/installer/`);
  };

  const filtered = catalog.filter((item) => {
    const matchCat = cat === "all" || item.category === cat;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || (item.tags ?? []).some((t) => t.includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
            <Compass className="w-5 h-5 text-cyan-400" />
            Discovery Feed
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            AI tools, models & software — curated for 8GB laptops
            {usedMock && <span className="text-amber-400"> [mock data — Empire OS offline]</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 w-44"
            />
          </div>
          <button
            onClick={fetchCatalog}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-semibold transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Category Chips */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-2.5 py-1 rounded-full font-mono text-[10px] font-bold transition capitalize ${
              cat === c
                ? "bg-cyan-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-600 font-mono text-sm">Loading catalog…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-600 font-mono text-sm">No items match</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`bg-slate-900/60 border rounded-xl p-4 flex flex-col gap-3 transition ${
                item.recommended ? "border-cyan-800/60 shadow-[0_0_15px_rgba(6,182,212,0.05)]" : "border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{item.icon ?? "🔧"}</span>
                  <div>
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                      {item.name}
                      {item.recommended && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">{item.category}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {ramLabel(item.ramGB)}
                  {item.local && <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-400">Local</span>}
                  {!item.local && <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">Cloud</span>}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed flex-1">{item.description}</p>

              <div className="flex flex-wrap gap-1">
                {(item.tags ?? []).map((t) => (
                  <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">{t}</span>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className={`text-[9px] font-mono font-bold ${item.free ? "text-emerald-400" : "text-amber-400"}`}>
                  {item.free ? "Free" : "Paid"}
                </span>
                <button
                  onClick={() => installItem(item)}
                  disabled={installing === item.id}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-slate-100 font-mono text-[9px] font-bold transition disabled:opacity-50"
                >
                  {installing === item.id ? (
                    <><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Installing…</>
                  ) : (
                    <><Download className="w-2.5 h-2.5" /> Install</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center">
        <a
          href="http://localhost:3001/store/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-semibold transition"
        >
          <Cpu className="w-3.5 h-3.5" />
          Open Empire OS Store for full catalog ↗
        </a>
      </div>
    </div>
  );
}
