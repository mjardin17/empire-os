import React, { useState, useEffect } from "react";
import {
  Terminal, FolderSync, Mail, Calendar, Play, Sliders, Server, Cpu, Database, Brain, Sparkles,
  RefreshCw, Send, Plus, Trash2, Check, X, LayoutGrid, Monitor, FileText, CheckCircle2,
  AlertTriangle, Copy, Trash, ExternalLink, Shield, HelpCircle, ArrowRight, User, Eye, Flag, BookOpen
} from "lucide-react";

// Types for Command Center
interface WindowsApp {
  id: string;
  name: string;
  pid: number;
  cpu: number;
  ram: string;
  status: "RUNNING" | "IDLE" | "STOPPED";
  path: string;
}

interface WorkspaceFile {
  id: string;
  name: string;
  size: string;
  type: "text" | "code" | "log" | "pdf" | "image";
  folder: string;
}

interface Workflow {
  id: string;
  name: string;
  stagesCount: number;
  currentStage: number;
  status: "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";
  logs: string[];
}

interface EmailItem {
  id: string;
  sender: string;
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  flagged: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  time: string;
  date: string;
  category: "WORKFLOW" | "MEETING" | "CREATIVE" | "SYSTEM";
}

export default function CommandCenter() {
  // 1. --- STATE FOR WINDOWS APP CONTROLLER ---
  const [windowsApps, setWindowsApps] = useState<WindowsApp[]>([
    { id: "photoshop", name: "Adobe Photoshop CC", pid: 14208, cpu: 0.8, ram: "1.8 GB", status: "RUNNING", path: "C:\\Program Files\\Adobe\\Photoshop.exe" },
    { id: "premiere", name: "Premiere Pro Video Engine", pid: 9012, cpu: 2.4, ram: "3.4 GB", status: "RUNNING", path: "C:\\Program Files\\Adobe\\Premiere.exe" },
    { id: "resolve", name: "DaVinci Resolve Studio", pid: 3381, cpu: 0.0, ram: "0 MB", status: "STOPPED", path: "C:\\Program Files\\Blackmagic\\Resolve.exe" },
    { id: "chrome", name: "Chrome (StoryForge Panel)", pid: 2841, cpu: 1.1, ram: "520 MB", status: "RUNNING", path: "C:\\Program Files\\Google\\Chrome.exe" },
    { id: "obsidian", name: "Obsidian Workspace Node", pid: 1104, cpu: 0.2, ram: "220 MB", status: "IDLE", path: "C:\\Users\\User\\AppData\\Local\\Obsidian\\Obsidian.exe" },
    { id: "gitbash", name: "Git Bash Terminal Console", pid: 8840, cpu: 0.0, ram: "15 MB", status: "RUNNING", path: "C:\\Program Files\\Git\\git-bash.exe" }
  ]);

  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "System Initialized. Accessing local workstation cluster...",
    "Localhost interface mounted. Standard port mapping: [OLLAMA:11434, GATEWAY:3000].",
    "Windows integration agent running in background (VCS simulation active)."
  ]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const handleAppStatusChange = (id: string, action: "START" | "KILL") => {
    setWindowsApps(prev => prev.map(app => {
      if (app.id === id) {
        if (action === "START") {
          addLog(`Launched Windows App: ${app.name} (${app.path})`);
          return { ...app, status: "RUNNING", cpu: 0.5, pid: Math.floor(Math.random() * 20000) + 1000 };
        } else {
          addLog(`Terminated process PID ${app.pid} for ${app.name}`);
          return { ...app, status: "STOPPED", cpu: 0, ram: "0 MB", pid: 0 };
        }
      }
      return app;
    }));
  };

  const handleSendParam = (appName: string) => {
    const params = ["--optimize-memory", "--silent-mode", "--purge-caches", "--sync-ipc", "--export-raw"];
    const randomParam = params[Math.floor(Math.random() * params.length)];
    addLog(`Sent parameters '${randomParam}' to Windows Application: ${appName}`);
    alert(`Success: Sent parameter '${randomParam}' to ${appName}`);
  };

  // 2. --- STATE FOR FILE ORGANIZER & FILE CLEANER ---
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([
    { id: "f1", name: "draft_v1_old.txt", size: "12 KB", type: "text", folder: "Downloads" },
    { id: "f2", name: "redundant_helper_copy(2).js", size: "45 KB", type: "code", folder: "Downloads" },
    { id: "f3", name: "temp_cache_02.log", size: "2.4 MB", type: "log", folder: "Downloads" },
    { id: "f4", name: "invoice_unorganized.pdf", size: "320 KB", type: "pdf", folder: "Desktop" },
    { id: "f5", name: "photo_highres.png", size: "14.2 MB", type: "image", folder: "Desktop" },
    { id: "f6", name: "duplicated_validator_module.ts", size: "8 KB", type: "code", folder: "Workspace" },
    { id: "f7", name: "storyforge_outline_draft_new.txt", size: "4 KB", type: "text", folder: "Desktop" }
  ]);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizeLog, setOrganizeLog] = useState<string[]>([]);

  const handleOrganizeNow = () => {
    setIsOrganizing(true);
    setOrganizeLog(["Initializing System Directory Scanning...", "Target folders identified: Downloads/, Desktop/"]);
    
    setTimeout(() => {
      setOrganizeLog(prev => [...prev, "Found 3 misallocated documents and 2 redundant logs."]);
    }, 600);

    setTimeout(() => {
      setOrganizeLog(prev => [...prev, "Executing intelligent triage algorithms..."]);
    }, 1200);

    setTimeout(() => {
      // Physically update folders in our state!
      setWorkspaceFiles(prev => prev.map(f => {
        if (f.name.endsWith(".txt")) return { ...f, folder: "Documents/Storyforge" };
        if (f.name.endsWith(".pdf")) return { ...f, folder: "Documents/Invoices" };
        if (f.name.endsWith(".png")) return { ...f, folder: "Media/Images" };
        return f;
      }));
      setOrganizeLog(prev => [...prev, "✓ Cleaned Downloads/. Grouped documents by schema type successfully.", "✓ Directories consolidated safely."]);
      setIsOrganizing(false);
      addLog("File Organization routine completed on standard directories.");
    }, 2000);
  };

  const handlePurgeTempFiles = () => {
    setWorkspaceFiles(prev => prev.filter(f => f.type !== "log" && !f.name.includes("copy(2)")));
    addLog("File Cleaner Node triggered: Purged obsolete logs & copy(2) duplicates.");
    alert("Purged obsolete logs and redundant duplicate code copies!");
  };

  // 3. --- STATE FOR WORKFLOW LAUNCHER ---
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>({
    id: "doc-creator",
    name: "Documentary Production Chain (11-Stage Workflow)",
    stagesCount: 11,
    currentStage: 0,
    status: "IDLE",
    logs: []
  });

  const handleTriggerWorkflow = () => {
    if (activeWorkflow.status === "RUNNING") return;
    
    setActiveWorkflow(prev => ({
      ...prev,
      status: "RUNNING",
      currentStage: 1,
      logs: ["Workflow initialized. Spawning cognitive agents..."]
    }));
    addLog("Triggered multi-agent autonomous video creation loop (11 stages).");

    const runStage = (stage: number) => {
      const stagesLogs = [
        "Stage 1: Analysing historical performance vectors.",
        "Stage 2: Aligning script theme weights with local Ollama cores.",
        "Stage 3: Building character matrices via StoryForge gateway.",
        "Stage 4: Synthesizing voiceovers through offline TTS API.",
        "Stage 5: Rendering graphical overlay elements dynamically.",
        "Stage 6: Binding audio frames with aspect-ratio corrections.",
        "Stage 7: Triggering deep validation tests & checking character limits.",
        "Stage 8: Generating promotional copywriting via Boss Listers.",
        "Stage 9: Composing draft metadata clusters.",
        "Stage 10: Compiling final bundle for CrossPost synchronization.",
        "Stage 11: Workflow completed successfully. Assets stored in /dist/."
      ];

      setTimeout(() => {
        setActiveWorkflow(prev => {
          const nextStage = stage + 1;
          const updatedLogs = [...prev.logs, stagesLogs[stage]];
          if (nextStage > 11) {
            addLog("Autonomous Documentary Video Creator Pipeline completed.");
            return {
              ...prev,
              status: "COMPLETED",
              currentStage: 11,
              logs: updatedLogs
            };
          } else {
            return {
              ...prev,
              currentStage: nextStage,
              logs: updatedLogs
            };
          }
        });
        if (stage < 10) {
          runStage(stage + 1);
        }
      }, 900);
    };

    runStage(0);
  };

  // 4. --- STATE FOR EMAIL CLIENT (WORKSPACE INTEGRATION) ---
  const [emails, setEmails] = useState<EmailItem[]>([
    { id: "e1", sender: "notifications@partners.io", subject: "SaaS Affiliate Program Approved", body: "Congratulations Marcus! Your custom affiliate link has been approved and registered in our database. Commissions tier: 35% monthly recurring.", timestamp: "10:30 AM", read: false, flagged: true },
    { id: "e2", sender: "producer@independentfilm.co", subject: "Urgent StoryForge Script Polish Request", body: "Hey, we looked at the science fiction mainframe outline. It's fantastic! Can we expand Scene 3 to include more tension and an interactive prompt trigger? Let us know ASAP.", timestamp: "Yesterday", read: true, flagged: false },
    { id: "e3", sender: "trends-bot@socialsyndicate.org", subject: "TikTok SEO Weight Shift Detected", body: "Automated alert: Search volume for local AI pipelines and offline coding automation is up 420% this week. Adjust hooks immediately to match standard formats.", timestamp: "Yesterday", read: false, flagged: false },
    { id: "e4", sender: "billing@listersmarketplace.com", subject: "Marketplace Sync Complete", body: "Your optimized high-ticket product descriptions have been successfully verified and posted to all local indices.", timestamp: "2 days ago", read: true, flagged: false }
  ]);

  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [aiResponseDraft, setAiResponseDraft] = useState<string>("");
  const [generatingDraft, setGeneratingDraft] = useState<boolean>(false);

  const handleMarkRead = (id: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, read: true } : e));
  };

  const handleToggleFlag = (id: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, flagged: !e.flagged } : e));
    addLog(`Toggled urgent flag status on email ID: ${id}`);
  };

  const handleAutoReply = (email: EmailItem) => {
    setGeneratingDraft(true);
    setAiResponseDraft("");
    
    setTimeout(() => {
      let responseText = "";
      if (email.id === "e1") {
        responseText = `Hi Partner Team,\n\nThank you for the approval. I have integrated our affiliate tokens inside the Boss Listers automated template layout and will launch campaigns within the hour.\n\nBest,\nMarcus (Empire OS Command Center)`;
      } else if (email.id === "e2") {
        responseText = `Hi Producer Team,\n\nI've routed this request straight to our StoryForge Publishing Engine tab. I am updating the character matrices and expanding Scene 3 with deep neural suspense. It'll be ready to review shortly.\n\nBest,\nMarcus`;
      } else {
        responseText = `Hi Team,\n\nGot it. Adjusting our multi-channel syndicates within the CrossPost posting center immediately to capitalize on these metrics.\n\nBest,\nMarcus`;
      }
      setAiResponseDraft(responseText);
      setGeneratingDraft(false);
      addLog(`AI Agent auto-drafted reply response for: ${email.sender}`);
    }, 1200);
  };

  // 5. --- STATE FOR CALENDAR PLANNER (WORKSPACE INTEGRATION WITH LOCALSTORAGE) ---
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem("empire_calendar_events");
      return saved ? JSON.parse(saved) : [
        { id: "ev1", title: "StoryForge Narrative Architecture Sync", time: "14:00 - 14:45", date: "2026-07-04", category: "CREATIVE" },
        { id: "ev2", title: "TikTok Queue CrossPost Trigger", time: "17:00 - 17:15", date: "2026-07-04", category: "WORKFLOW" },
        { id: "ev3", title: "Ollama Local Benchmark Test Run", time: "10:00 - 11:00", date: "2026-07-05", category: "SYSTEM" },
        { id: "ev4", title: "Review Boss Listers Conversion Copy", time: "11:30 - 12:30", date: "2026-07-05", category: "MEETING" }
      ];
    } catch {
      return [];
    }
  });

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventTime, setNewEventTime] = useState("12:00 - 13:00");
  const [newEventDate, setNewEventDate] = useState("2026-07-04");
  const [newEventCat, setNewEventCat] = useState<"WORKFLOW" | "MEETING" | "CREATIVE" | "SYSTEM">("CREATIVE");

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const newEvent: CalendarEvent = {
      id: "ev_" + Math.random().toString(36).substring(2, 9),
      title: newEventTitle,
      time: newEventTime,
      date: newEventDate,
      category: newEventCat
    };

    const updated = [...calendarEvents, newEvent];
    setCalendarEvents(updated);
    localStorage.setItem("empire_calendar_events", JSON.stringify(updated));
    setNewEventTitle("");
    addLog(`Calendar Event added: ${newEvent.title}`);
  };

  const handleDeleteEvent = (id: string) => {
    const updated = calendarEvents.filter(ev => ev.id !== id);
    setCalendarEvents(updated);
    localStorage.setItem("empire_calendar_events", JSON.stringify(updated));
    addLog(`Deleted calendar event ID: ${id}`);
  };

  // 6. --- STORYFORGE DIRECT INTEGRATION BOARD ---
  const [storyGenre, setStoryGenre] = useState("Tech Thriller / Mainframe Noir");
  const [characterCount, setCharacterCount] = useState(3);
  const [copilotTemp, setCopilotTemp] = useState(0.75);

  const handlePushStoryforgeSettings = () => {
    addLog(`Injected parameter override to StoryForge module: [Genre: ${storyGenre}, Characters: ${characterCount}, Temp: ${copilotTemp}]`);
    alert("Configurations synchronized with local StoryForge engine pipeline successfully!");
  };

  // 7. --- CROSSPOST DIRECT INTEGRATION BOARD ---
  const [targetPlatforms, setTargetPlatforms] = useState({
    youtube: true,
    tiktok: true,
    twitter: true,
    linkedin: false
  });
  const [draftPostText, setDraftPostText] = useState("Uncoupling client-side API monoliths leads to robust enterprise safety grids!");
  const [clicheAlerts, setClicheAlerts] = useState<string[]>([]);

  useEffect(() => {
    const cliches = ["robust", "leverage", "monolith", "catalyst", "dive in"];
    const found = cliches.filter(c => draftPostText.toLowerCase().includes(c));
    setClicheAlerts(found);
  }, [draftPostText]);

  // 8. --- BOSS LISTERS DIRECT INTEGRATION BOARD ---
  const [bossProduct, setBossProduct] = useState("Sovereign Node Offline Workstation");
  const [generatedHooks, setGeneratedHooks] = useState<string[]>([]);
  const [optimizingHook, setOptimizingHook] = useState(false);

  const handleOptimizeHook = () => {
    setOptimizingHook(true);
    setTimeout(() => {
      setGeneratedHooks([
        `🔥 STOP renting computing power. Run sovereign, offline AI models locally with 12ms latency. No subscription. No key leaks.`,
        `💡 Built for high-velocity builders. Convert raw scripts to localized documentary video folders in 90 seconds flat.`,
        `🔒 Lock down your credentials. The local AI routing panel keeps API secrets strictly server-side. Enterprise topology ready.`
      ]);
      setOptimizingHook(false);
      addLog(`Boss Listers optimization ran for: ${bossProduct}`);
    }, 1000);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Operating Header Banner */}
      <div className="border-b border-zinc-850 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-indigo-400 animate-pulse" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Sovereign Command Center
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            The master execution hub of Empire OS. Control local Windows applications, organize workspace files, route drafts across syndicates, monitor email feeds, schedule creative calendars, and orchestrate StoryForge, CrossPost, Boss Listers, and Cleaner modules.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/30 px-2.5 py-1 rounded flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
            STATION ONLINE
          </span>
          <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-900/30 px-2.5 py-1 rounded">
            WINDOWS INTEGRATOR V3
          </span>
        </div>
      </div>

      {/* Bento Grid Top Layer: Windows Controller, Directory Organizer, & Workflow Launcher */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Module 1: Windows App Controller (Col Span 5) */}
        <div className="lg:col-span-5 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-indigo-400" />
                Windows Apps Controller
              </h4>
              <span className="text-[9px] font-mono text-slate-500">SYSTEM INTERFACE</span>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Monitor, launch, or force-terminate operational applications on your Windows host. Direct process piping handles automated parameters.
            </p>

            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {windowsApps.map((app) => (
                <div key={app.id} className="p-2.5 bg-zinc-900 border border-zinc-850 rounded-lg flex items-center justify-between gap-3 hover:border-slate-700/60 transition-all">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${app.status === "RUNNING" ? "bg-emerald-400" : app.status === "IDLE" ? "bg-amber-400" : "bg-rose-500"}`}></span>
                      <span className="text-xs font-bold text-slate-200 truncate block">{app.name}</span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 block truncate mt-0.5">{app.path}</span>
                    {app.status === "RUNNING" && (
                      <span className="text-[8px] font-mono text-indigo-450 uppercase tracking-widest block mt-0.5">
                        PID: {app.pid} | CPU: {app.cpu}% | RAM: {app.ram}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleSendParam(app.name)}
                      className="p-1 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono font-bold hover:text-cyan-400 hover:border-cyan-900/40 transition cursor-pointer"
                      title="Send IPC Parameter"
                    >
                      PARAM
                    </button>
                    {app.status === "STOPPED" ? (
                      <button
                        onClick={() => handleAppStatusChange(app.id, "START")}
                        className="px-2 py-1 rounded bg-emerald-950/50 border border-emerald-900/50 hover:bg-emerald-900 text-emerald-400 hover:text-white font-mono text-[10px] font-bold uppercase cursor-pointer transition"
                      >
                        RUN
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAppStatusChange(app.id, "KILL")}
                        className="px-2 py-1 rounded bg-rose-950/50 border border-rose-900/50 hover:bg-rose-900 text-rose-400 hover:text-white font-mono text-[10px] font-bold uppercase cursor-pointer transition"
                      >
                        KILL
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 p-2 rounded-lg text-[10px] text-indigo-300 font-mono flex items-center justify-between">
            <span>ACTIVE PROCESSES: {windowsApps.filter(a => a.status === "RUNNING").length}</span>
            <span>IPC PORT: 11434 HOST</span>
          </div>
        </div>

        {/* Module 2: File Organizer & Cleaner Node (Col Span 4) */}
        <div className="lg:col-span-4 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <FolderSync className="w-4 h-4 text-indigo-400" />
                Workspace File Organizer & Cleaner
              </h4>
              <span className="text-[9px] font-mono text-slate-500">CLEANER CORE</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3.5">
              Intelligent directory consolidation. Scan unclean downloaded documents, empty trash directories, and delete redundant function backups.
            </p>

            <div className="bg-zinc-900 border border-zinc-850/80 rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-center text-[10px] font-mono border-b border-zinc-850 pb-1.5">
                <span className="text-slate-400 font-bold">RAW / UNORGANIZED DIR</span>
                <span className="text-amber-400 font-semibold">{workspaceFiles.length} files detected</span>
              </div>

              <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                {workspaceFiles.map((file) => (
                  <div key={file.id} className="flex justify-between items-center text-[10px] font-mono hover:text-slate-200 transition">
                    <span className="text-slate-350 truncate max-w-[140px]" title={file.name}>📄 {file.name}</span>
                    <span className="text-slate-500 shrink-0 uppercase bg-zinc-950 px-1 py-0.5 rounded text-[8px] border border-zinc-850">
                      {file.folder}
                    </span>
                  </div>
                ))}
              </div>

              {organizeLog.length > 0 && (
                <div className="bg-zinc-950 border border-zinc-850 rounded p-2 text-[9px] font-mono text-emerald-400 max-h-[110px] overflow-y-auto leading-normal space-y-1 mt-2">
                  {organizeLog.map((log, index) => (
                    <div key={index}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={handleOrganizeNow}
              disabled={isOrganizing}
              className="py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold uppercase transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isOrganizing ? "animate-spin" : ""}`} />
              {isOrganizing ? "Triaging..." : "Organize Now"}
            </button>
            <button
              onClick={handlePurgeTempFiles}
              className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-slate-200 border border-zinc-700 font-mono text-[10px] font-bold uppercase transition cursor-pointer"
            >
              Purge Redundant
            </button>
          </div>
        </div>

        {/* Module 3: Active Workflow Launcher (Col Span 3) */}
        <div className="lg:col-span-3 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Play className="w-4 h-4 text-indigo-400" />
                Workflow Launcher
              </h4>
              <span className="text-[9px] font-mono text-slate-500">STAGE INTEGRATION</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Trigger autonomous background pipeline procedures straight into local output channels.
            </p>

            <div className="bg-zinc-900 border border-zinc-850 p-3 rounded-lg space-y-3.5">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-indigo-400 block font-bold truncate" title={activeWorkflow.name}>
                  {activeWorkflow.name}
                </span>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-0.5">
                  <span>Progress Stage:</span>
                  <span className="font-bold text-slate-300">{activeWorkflow.currentStage} / 11</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300 rounded-full"
                  style={{ width: `${(activeWorkflow.currentStage / 11) * 100}%` }}
                ></div>
              </div>

              {/* Mini Terminal Stage Display */}
              <div className="bg-zinc-950 border border-zinc-850 rounded p-2 text-[9px] font-mono text-cyan-400 min-h-[110px] max-h-[110px] overflow-y-auto leading-normal select-text space-y-1">
                {activeWorkflow.logs.length === 0 ? (
                  <div className="text-zinc-650 italic text-center py-8">No active workspace workflow currently running. Click Launch.</div>
                ) : (
                  activeWorkflow.logs.map((log, index) => (
                    <div key={index} className="flex gap-1">
                      <span className="text-indigo-400 shrink-0">●</span>
                      <span>{log}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleTriggerWorkflow}
            disabled={activeWorkflow.status === "RUNNING"}
            className={`w-full py-2.5 rounded-lg font-mono text-[10px] font-bold uppercase transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeWorkflow.status === "RUNNING"
                ? "bg-zinc-800 text-indigo-400 border border-zinc-700 animate-pulse cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/20"
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            {activeWorkflow.status === "RUNNING" ? `WORKFLOW ACTIVE (STG ${activeWorkflow.currentStage})` : "LAUNCH 11-STAGE PIPELINE"}
          </button>
        </div>

      </div>

      {/* Middle Grid Layer: Integrated Email Feeds & Scheduling Planner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Module 4: Integrated Workspace Email Reader (Col Span 7) */}
        <div className="lg:col-span-7 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-indigo-400" />
                Sovereign Workspace Email Client
              </h4>
              <span className="text-[9px] font-mono text-slate-500">INBOX SYNCED</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3.5">
              Securely synchronized inbox parsing. Auto-generate professional contextual response drafts powered by local model templates with one click.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              
              {/* Inbox List (Col Span 5) */}
              <div className="md:col-span-5 space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                {emails.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setSelectedEmail(e);
                      handleMarkRead(e.id);
                    }}
                    className={`w-full p-2 rounded-lg border text-left transition-all duration-150 flex flex-col gap-1 cursor-pointer ${
                      selectedEmail?.id === e.id
                        ? "bg-indigo-950/30 border-indigo-500/30 text-slate-100"
                        : "bg-zinc-900 border-zinc-850 hover:bg-zinc-900/60 text-slate-400 hover:border-slate-700/60"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-bold ${!e.read ? "text-cyan-400" : "text-slate-300"}`}>
                        {e.sender.split("@")[0]}
                      </span>
                      <span className="text-[8px] font-mono text-slate-500">{e.timestamp}</span>
                    </div>
                    <div className="text-[11px] font-sans font-semibold truncate block w-full text-slate-200">
                      {e.subject}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] font-sans text-slate-500 truncate max-w-[120px]">{e.body}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {e.flagged && <Flag className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        {!e.read && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Reading Pane & AI responder (Col Span 7) */}
              <div className="md:col-span-7 bg-zinc-900 border border-zinc-850 rounded-lg p-3 flex flex-col justify-between min-h-[260px]">
                {selectedEmail ? (
                  <div className="space-y-3 flex-grow flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start border-b border-zinc-850 pb-2">
                        <div>
                          <div className="text-[10px] font-mono text-slate-500">FROM: <strong className="text-slate-350">{selectedEmail.sender}</strong></div>
                          <h5 className="text-xs font-bold text-slate-100 mt-1">{selectedEmail.subject}</h5>
                        </div>
                        <button
                          onClick={() => handleToggleFlag(selectedEmail.id)}
                          className="p-1 rounded hover:bg-zinc-800 transition"
                        >
                          <Flag className={`w-3.5 h-3.5 ${selectedEmail.flagged ? "text-amber-500 fill-amber-500" : "text-slate-500"}`} />
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans whitespace-pre-wrap max-h-[110px] overflow-y-auto">
                        {selectedEmail.body}
                      </p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-zinc-850">
                      <div className="flex justify-between items-center text-[9px] font-mono">
                        <span className="text-indigo-400 font-bold uppercase">🧠 local AI Auto-Reply Draft:</span>
                        <div className="flex gap-1.5">
                          {aiResponseDraft && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(aiResponseDraft);
                                alert("Response draft copied to clipboard!");
                              }}
                              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                            >
                              <Copy className="w-2.5 h-2.5" /> Copy
                            </button>
                          )}
                          <button
                            onClick={() => handleAutoReply(selectedEmail)}
                            disabled={generatingDraft}
                            className="text-slate-300 hover:text-white"
                          >
                            {generatingDraft ? "Drafting..." : "Generate Draft"}
                          </button>
                        </div>
                      </div>

                      {aiResponseDraft ? (
                        <textarea
                          readOnly
                          value={aiResponseDraft}
                          className="w-full bg-zinc-950 border border-zinc-850 text-[10px] font-mono text-slate-350 rounded p-2 focus:outline-none h-[80px] overflow-y-auto resize-none"
                        />
                      ) : (
                        <div className="text-[9px] font-mono text-slate-600 italic text-center py-4 bg-zinc-950 rounded border border-zinc-850">
                          {generatingDraft ? "Analyzing email content & compiling context response..." : "Click 'Generate Draft' to construct automated response."}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-center py-10">
                    <Mail className="w-8 h-8 text-zinc-700 mb-2" />
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase">No email active</span>
                    <p className="text-[10px] text-slate-500 max-w-xs mt-1">
                      Select an incoming email notification from the left list to read content and auto-reply.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 p-2 rounded-lg flex justify-between items-center text-[10px] font-mono">
            <span>UNREAD EMAILS: {emails.filter(e => !e.read).length} FEED</span>
            <span className="text-emerald-400">SYNC INTERVAL: REALTIME</span>
          </div>
        </div>

        {/* Module 5: Sovereign Workspace Calendar Planner (Col Span 5) */}
        <div className="lg:col-span-5 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-400" />
                Operational Schedule Calendar
              </h4>
              <span className="text-[9px] font-mono text-slate-500">PLANNER HUB</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Track creative milestones, multi-agent debriefs, and scheduled publishing loops. Events remain active across browser reboots.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              
              {/* Event Adding Form (Col Span 5) */}
              <form onSubmit={handleAddEvent} className="md:col-span-5 space-y-2 bg-zinc-900 border border-zinc-850 rounded-lg p-2.5">
                <span className="text-[9px] font-mono text-indigo-400 font-bold uppercase block">Add System Action</span>
                
                <input
                  type="text"
                  placeholder="Task title..."
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 text-[10px] text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 font-sans"
                />

                <input
                  type="text"
                  placeholder="Time (e.g. 14:00 - 15:00)"
                  value={newEventTime}
                  onChange={(e) => setNewEventTime(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 text-[10px] text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 font-mono"
                />

                <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 text-[10px] text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 font-mono"
                />

                <select
                  value={newEventCat}
                  onChange={(e: any) => setNewEventCat(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 text-[10px] text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 font-mono"
                >
                  <option value="CREATIVE">CREATIVE</option>
                  <option value="WORKFLOW">WORKFLOW</option>
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="MEETING">MEETING</option>
                </select>

                <button
                  type="submit"
                  className="w-full py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[9px] font-bold uppercase transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Event
                </button>
              </form>

              {/* Active Agenda List (Col Span 7) */}
              <div className="md:col-span-7 space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {calendarEvents.length === 0 ? (
                  <div className="text-zinc-650 italic text-center py-10 text-[10px] font-mono">No events scheduled. Use the form to plan one.</div>
                ) : (
                  calendarEvents.map((ev) => (
                    <div key={ev.id} className="p-2 bg-zinc-900 border border-zinc-850 rounded-lg flex items-center justify-between gap-2 group hover:border-slate-700/60 transition">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            ev.category === "CREATIVE" ? "bg-purple-400" :
                            ev.category === "WORKFLOW" ? "bg-cyan-400" :
                            ev.category === "SYSTEM" ? "bg-rose-400" : "bg-emerald-400"
                          }`}></span>
                          <span className="text-[10px] font-sans font-bold text-slate-200 block truncate" title={ev.title}>{ev.title}</span>
                        </div>
                        <span className="text-[8px] font-mono text-slate-500 block mt-0.5 uppercase">
                          {ev.date} | {ev.time} | {ev.category}
                        </span>
                      </div>

                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 transition hover:bg-zinc-950 shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Delete Event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 p-2 rounded-lg text-[10px] text-slate-500 font-mono text-right">
            PERSISTED MEMORY STANDARD REGISTERED
          </div>
        </div>

      </div>

      {/* Bottom Grid Layer: Quick Modules Control Board (StoryForge, CrossPost, Boss Listers) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2 border-t border-zinc-850/60">
        
        {/* Sub-Module A: StoryForge Direct Control Node (Col Span 4) */}
        <div className="lg:col-span-4 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-400 animate-pulse" />
                StoryForge Control Board
              </h4>
              <span className="text-[9px] font-mono text-emerald-400 uppercase bg-emerald-950/30 border border-emerald-900/30 px-1 rounded">CONNECTED</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Override and sync core configurations straight to the StoryForge narrative generator without switching views.
            </p>

            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase block font-bold">Story Theme / Genre Override</label>
                <input
                  type="text"
                  value={storyGenre}
                  onChange={(e) => setStoryGenre(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-850 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-slate-500 uppercase block font-bold">Character Seed Count</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={characterCount}
                    onChange={(e) => setCharacterCount(parseInt(e.target.value) || 2)}
                    className="w-full bg-zinc-900 border border-zinc-850 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-slate-500 uppercase block font-bold">Model Co-Pilot Temp</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.5"
                    value={copilotTemp}
                    onChange={(e) => setCopilotTemp(parseFloat(e.target.value) || 0.7)}
                    className="w-full bg-zinc-900 border border-zinc-850 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handlePushStoryforgeSettings}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold uppercase rounded-lg transition cursor-pointer"
          >
            PUSH PARAMETERS TO STORYFORGE
          </button>
        </div>

        {/* Sub-Module B: CrossPost Direct Control Node (Col Span 4) */}
        <div className="lg:col-span-4 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-4 h-4 text-indigo-400" />
                CrossPost Syndicate Controls
              </h4>
              <span className="text-[9px] font-mono text-emerald-400 uppercase bg-emerald-950/30 border border-emerald-900/30 px-1 rounded">CONNECTED</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Track multi-channel posting targets, calculate characters limits constraints, and scan text for robotic AI clichés.
            </p>

            <div className="space-y-3.5 pt-1">
              <div className="flex flex-wrap gap-2.5 bg-zinc-900 border border-zinc-850 p-2 rounded-lg">
                <span className="text-[9px] font-mono text-slate-500 uppercase font-bold w-full block">Publishing Targets:</span>
                {Object.entries(targetPlatforms).map(([key, val]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTargetPlatforms(prev => ({ ...prev, [key]: !val }))}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase font-bold transition-all ${
                      val 
                        ? "bg-cyan-950 text-cyan-400 border border-cyan-800" 
                        : "bg-zinc-950 text-slate-500 border border-zinc-850"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-slate-500 uppercase font-bold">Linguistic Cliché Reviewer</span>
                  <span className={`${draftPostText.length > 280 ? "text-rose-400" : "text-slate-550"} font-bold`}>
                    {draftPostText.length} Chars
                  </span>
                </div>
                <textarea
                  value={draftPostText}
                  onChange={(e) => setDraftPostText(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-850 text-[10px] text-slate-300 rounded p-2 focus:outline-none focus:border-indigo-500 font-sans h-[60px] resize-none"
                />
                {clicheAlerts.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[8px] font-mono text-amber-400 bg-amber-950/30 border border-amber-900/30 p-1 rounded">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Robotic flags detected: {clicheAlerts.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              alert(`Draft pushed to syndicated queue of active platforms: [${Object.entries(targetPlatforms).filter(([k,v])=>v).map(([k,v])=>k).join(", ")}]`);
              addLog("Pushed draft text post to active CrossPost publishing queue.");
            }}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold uppercase rounded-lg transition cursor-pointer"
          >
            DEPLOY SYNDICATED POST QUEUE
          </button>
        </div>

        {/* Sub-Module C: Boss Listers Direct Control Node (Col Span 4) */}
        <div className="lg:col-span-4 bg-zinc-950/40 border border-zinc-850/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2 mb-3">
              <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Boss Listers Optimizer Panel
              </h4>
              <span className="text-[9px] font-mono text-emerald-400 uppercase bg-emerald-950/30 border border-emerald-900/30 px-1 rounded">CONNECTED</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Optimize conversion copy, marketplace tags, and launch high-ticket headlines for high CPM monetization.
            </p>

            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase block font-bold">Target High-Ticket Product</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={bossProduct}
                    onChange={(e) => setBossProduct(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-850 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-sans"
                  />
                  <button
                    onClick={handleOptimizeHook}
                    disabled={optimizingHook}
                    className="px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-slate-200 text-[10px] font-mono font-bold uppercase border border-zinc-700 transition cursor-pointer shrink-0"
                  >
                    {optimizingHook ? "Sync..." : "Optimize"}
                  </button>
                </div>
              </div>

              {generatedHooks.length > 0 && (
                <div className="space-y-1 max-h-[85px] overflow-y-auto pr-1">
                  {generatedHooks.map((h, idx) => (
                    <div key={idx} className="p-2 bg-zinc-900 border border-zinc-850 rounded text-[9px] font-sans leading-relaxed text-slate-350 relative group">
                      <p>{h}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(h);
                          alert("Hook copied to clipboard!");
                        }}
                        className="absolute right-1 top-1 bg-zinc-950 p-1 rounded opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-cyan-400 border border-zinc-850 cursor-pointer"
                        title="Copy Hook"
                      >
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 p-2 rounded-lg text-[9px] text-slate-500 font-mono flex justify-between items-center">
            <span>YIELD TARGET: MULTI-CHANNEL AD REVENUE</span>
            <span className="text-cyan-400">HIGH CPM</span>
          </div>
        </div>

      </div>

      {/* Embedded Central Terminal Activity Log Logs Section */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
          <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-indigo-400" />
            Central Command Terminal Logging Node
          </h4>
          <span className="text-[9px] font-mono text-slate-500">REAL-TIME TELEMETRY</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-850 rounded-lg p-3 font-mono text-[10px] text-slate-300 min-h-[120px] max-h-[120px] overflow-y-auto leading-relaxed select-text space-y-1">
          {terminalLogs.map((log, index) => (
            <div key={index} className="flex gap-2 text-slate-400 hover:text-slate-100 transition">
              <span className="text-indigo-400 shrink-0">&gt;</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
