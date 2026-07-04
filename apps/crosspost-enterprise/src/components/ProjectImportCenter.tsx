import React, { useState, useRef } from "react";
import {
  FolderOpen, GitFork, FileArchive, Upload, Sparkles, Terminal, ShieldAlert, CheckCircle,
  FileText, ArrowRight, RefreshCw, Layers, HardDrive, Trash
} from "lucide-react";

export default function ProjectImportCenter() {
  const [activeImportTab, setActiveImportTab] = useState<"github" | "zip" | "folder">("github");
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importedProjects, setImportedProjects] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("empire_imported_projects");
      return saved ? JSON.parse(saved) : [
        { id: 101, name: "legacy-payment-microservice", type: "GitHub", path: "github.com/corp/legacy-payment", filesCount: 142, size: "4.8 MB", tech: "Node.js v14 (Obsolete)", auditScore: 68, debt: "$1,450" }
      ];
    } catch {
      return [];
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto save imported projects to localStorage
  const saveProjects = (updated: any[]) => {
    setImportedProjects(updated);
    localStorage.setItem("empire_imported_projects", JSON.stringify(updated));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const startAnalysisSequence = (name: string, type: string, size: string, tech: string) => {
    setAnalyzing(true);
    setImportLogs([]);
    const logs = [
      `[INFO] Starting ingestion stream for asset: ${name}`,
      `[INFO] Unpacking file streams into volatile memory core...`,
      `[INFO] Running static analysis engine...`,
      `[WARN] Located outdated core packages inside package.json/pom.xml`,
      `[WARN] Obsolete package detected: node-sass-loader`,
      `[INFO] Searching for system architectural anomalies...`,
      `[SUCCESS] Dependency graph built successfully (${Math.floor(Math.random() * 50 + 40)} nodes).`,
      `[SUCCESS] Auto-analysis complete! Generated optimization blueprint.`
    ];

    let i = 0;
    const interval = setInterval(() => {
      setImportLogs(prev => [...prev, logs[i]]);
      if (i >= logs.length - 1) {
        clearInterval(interval);
        setAnalyzing(false);
        const newProj = {
          id: Date.now(),
          name,
          type,
          path: type === "GitHub" ? `github.com/imported/${name}` : `local_fs/imports/${name}`,
          filesCount: Math.floor(Math.random() * 200 + 30),
          size,
          tech,
          auditScore: Math.floor(Math.random() * 25 + 70),
          debt: `$${(Math.floor(Math.random() * 10 + 2) * 150).toLocaleString()}`
        };
        saveProjects([newProj, ...importedProjects]);
      } else {
        i++;
      }
    }, 400);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      startAnalysisSequence(file.name, "ZIP Archive", `${(file.size / (1024 * 1024)).toFixed(2)} MB`, "React SPA (Legacy Web)");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      startAnalysisSequence(file.name, "ZIP Archive", `${(file.size / (1024 * 1024)).toFixed(2)} MB`, "TypeScript Package");
    }
  };

  const handleDeleteProject = (id: number) => {
    const updated = importedProjects.filter(p => p.id !== id);
    saveProjects(updated);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Project Ingestion & Analysis Center
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-950/40 border border-blue-900/30 px-2 py-0.5 rounded">
            MULTIMODAL INGESTION
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Import and map external repositories, zip catalogs, or local folder structures. Once loaded, Empire OS automatically scans files to identify outdated layers, duplicate logic, and tech-debt metrics.
        </p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-zinc-850/60 pb-1 gap-2 text-xs font-mono">
        {[
          { id: "github", label: "GitHub Repositories", icon: GitFork },
          { id: "zip", label: "ZIP Archive", icon: FileArchive },
          { id: "folder", label: "Local Folders", icon: HardDrive }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeImportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveImportTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 py-2 border-b-2 font-bold uppercase transition-all cursor-pointer ${
                active 
                  ? "border-blue-500 text-blue-400" 
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Upload / Connect Ingest zone */}
        <div className="lg:col-span-6 space-y-4">
          
          {activeImportTab === "github" && (
            <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase">Connect to GitHub Sync</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Access your synced repos quickly by linking credentials inside the <strong className="text-slate-300 font-mono text-[10px]">GitHub Sync</strong> panel under the Empire Inspector tab.
              </p>
              
              <div className="space-y-2 pt-1">
                <input
                  type="text"
                  placeholder="https://github.com/owner/repository"
                  className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-xs font-mono text-slate-200 placeholder-slate-750 focus:outline-none"
                  id="github-import-url"
                />
                
                <button
                  onClick={() => {
                    const el = document.getElementById("github-import-url") as HTMLInputElement;
                    if (el && el.value) {
                      const name = el.value.split("/").pop() || "imported-repo";
                      startAnalysisSequence(name, "GitHub", "12.4 MB", "React SPA (Vite/Tailwind)");
                      el.value = "";
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-mono text-[10.5px] font-bold uppercase tracking-wider py-2 rounded-md cursor-pointer transition"
                >
                  AUDIT & IMPORT GITHUB REPOSITORY
                </button>
              </div>
            </div>
          )}

          {activeImportTab === "zip" && (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`bg-zinc-950/40 border border-dashed rounded-lg p-8 text-center space-y-4 cursor-pointer transition flex flex-col items-center justify-center min-h-[220px] ${
                dragActive ? "border-blue-500 bg-blue-950/10" : "border-zinc-800 hover:border-zinc-700"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInput}
                className="hidden"
                accept=".zip,.rar,.tar,.gz"
              />
              
              <div className="p-4 bg-zinc-900 border border-zinc-850 text-blue-400 rounded-full">
                <Upload className="w-6 h-6 animate-pulse" />
              </div>

              <div>
                <p className="text-xs font-mono font-bold text-slate-200 uppercase">Drag and drop ZIP archive here</p>
                <p className="text-[10px] text-slate-500 mt-1 font-sans">or click to choose files from device</p>
              </div>
              <span className="text-[9px] font-mono text-slate-650 bg-zinc-900 px-2 py-0.5 rounded">
                MAX FILE LIMIT: 250MB
              </span>
            </div>
          )}

          {activeImportTab === "folder" && (
            <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase">Scan Local System Folders</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Point the automated system parser to any local directory inside your file tree directory.
              </p>
              
              <div className="space-y-2 pt-1">
                <input
                  type="text"
                  placeholder="./legacy-app-v3"
                  className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-xs font-mono text-slate-200 placeholder-slate-750 focus:outline-none"
                  id="folder-import-path"
                />
                
                <button
                  onClick={() => {
                    const el = document.getElementById("folder-import-path") as HTMLInputElement;
                    if (el && el.value) {
                      const name = el.value.split("/").pop() || "imported-folder";
                      startAnalysisSequence(name, "Local Folder", "1.1 MB", "Node.js (CJS Framework)");
                      el.value = "";
                    }
                  }}
                  className="w-full bg-blue-650 hover:bg-blue-600 text-white font-mono text-[10.5px] font-bold uppercase tracking-wider py-2 rounded-md cursor-pointer transition"
                >
                  START DEEP LOCAL DIR ANALYSIS
                </button>
              </div>
            </div>
          )}

          {/* Analysis Logs Console */}
          {analyzing && (
            <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-3 font-mono">
              <div className="flex justify-between items-center text-[10px] border-b border-zinc-900 pb-1.5">
                <span className="text-slate-400 font-bold flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  ANALYSIS PIPELINE RUNNING
                </span>
                <span className="text-blue-400 animate-pulse">Scanning...</span>
              </div>
              <div className="h-40 overflow-y-auto text-[10.5px] text-zinc-400 space-y-1 select-text scrollbar-thin">
                {importLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className={
                      log.startsWith("[ERROR]") ? "text-red-400" :
                      log.startsWith("[SUCCESS]") ? "text-emerald-400" :
                      log.startsWith("[WARN]") ? "text-amber-400" : "text-zinc-500"
                    }
                  >
                    {log}
                  </div>
                ))}
                <div className="inline-block w-1.5 h-3.5 bg-zinc-650 animate-pulse">_</div>
              </div>
            </div>
          )}

        </div>

        {/* Right Col: List of Imported Projects & Actions */}
        <div className="lg:col-span-6 space-y-4">
          <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-zinc-500" />
            Imported Projects & Tech Stack Matrix
          </h4>

          {importedProjects.length === 0 ? (
            <div className="bg-zinc-950/40 border border-dashed border-zinc-850 rounded-lg p-10 text-center space-y-2">
              <FolderOpen className="w-8 h-8 text-slate-700 mx-auto" />
              <p className="text-xs font-mono text-slate-400">No projects imported yet.</p>
              <p className="text-[10px] text-slate-650 font-sans">Use the left options to load software assets into Empire OS.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-thin pr-1">
              {importedProjects.map((proj) => (
                <div key={proj.id} className="bg-zinc-950/60 border border-zinc-850 rounded-lg p-4 space-y-3 flex flex-col justify-between hover:border-zinc-750 transition">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-mono font-black text-slate-200 truncate max-w-[200px]" title={proj.name}>
                          {proj.name}
                        </h5>
                        <span className="text-[8px] font-mono font-semibold px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-slate-400 rounded-sm uppercase">
                          {proj.type}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-600 block">{proj.path}</span>
                    </div>

                    <button
                      onClick={() => handleDeleteProject(proj.id)}
                      className="text-zinc-600 hover:text-red-400 p-1.5 rounded transition hover:bg-red-950/20"
                      title="Remove import history"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Audit parameters */}
                  <div className="grid grid-cols-3 gap-2 text-center font-mono text-[9px] bg-zinc-950 border border-zinc-900 p-2 rounded">
                    <div>
                      <span className="text-slate-600 block uppercase">Tech Stack</span>
                      <strong className="text-slate-300 truncate max-w-[100px] block mt-0.5">{proj.tech}</strong>
                    </div>
                    <div>
                      <span className="text-slate-600 block uppercase">Audit Score</span>
                      <strong className={`block mt-0.5 ${proj.auditScore >= 80 ? "text-emerald-400" : proj.auditScore >= 60 ? "text-amber-400" : "text-red-400"}`}>
                        {proj.auditScore}/100
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-600 block uppercase">Est. Debt</span>
                      <strong className="text-red-400 block mt-0.5">{proj.debt}</strong>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-mono">{proj.filesCount} files • {proj.size}</span>
                    
                    <button
                      onClick={() => alert(`Redirecting legacy system profile of ${proj.name} into automated modernizer advisor.`)}
                      className="text-[9px] font-mono font-bold bg-zinc-800 hover:bg-zinc-750 text-slate-200 border border-zinc-700 px-2.5 py-1 rounded cursor-pointer transition flex items-center gap-1"
                    >
                      Audit Reports
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
