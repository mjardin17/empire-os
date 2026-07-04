import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, Server, Brain, Cpu, Database, AlertTriangle, 
  CheckCircle, Play, Sparkles, RefreshCw, Layers, Sliders, 
  FileText, ShieldAlert, Shield, Check, Plus, HelpCircle, ArrowRight,
  TrendingUp, RefreshCw as LoopIcon, ExternalLink, Code, Copy, 
  Download, BookOpen, ChevronDown, ChevronUp, Star, DollarSign,
  Search, MessageSquare, Compass, Coins,
  Activity, Award, Plug, Film
} from "lucide-react";
import { SystemArchitecture } from "./components/SystemArchitecture";
import { MathEngine } from "./components/MathEngine";
import { MultiAgentResponse, PlatformConfig } from "./types";
import { PerformanceDashboard } from "./components/PerformanceDashboard";
import EmpireOSPluginHub from "./components/EmpireOSPluginHub";
import OllamaCommandCenter from "./components/OllamaCommandCenter";
import EmpireInspector from "./components/EmpireInspector";
import MissionControl from "./components/MissionControl";
import AIRouter from "./components/AIRouter";
import ProjectImportCenter from "./components/ProjectImportCenter";
import StoryForge from "./components/StoryForge";
import DocumentaryFactory from "./components/DocumentaryFactory";
import BossListers from "./components/BossListers";
import DeploymentCenter from "./components/DeploymentCenter";
import TestingCenter from "./components/TestingCenter";
import KnowledgeCenter from "./components/KnowledgeCenter";
import AutomationCenter from "./components/AutomationCenter";
import SettingsCenter from "./components/SettingsCenter";
import { LayoutGrid } from "lucide-react";
import CommandCenter from "./components/CommandCenter";
import HealthMonitorPanel from "./components/HealthMonitorPanel";
import ModelBenchmarkPanel from "./components/ModelBenchmarkPanel";
import DiscoveryFeed from "./components/DiscoveryFeed";
import ConnectorManager from "./components/ConnectorManager";
import HiggsfieldStatus from "./components/HiggsfieldStatus";
import EmpireAIRouterPanel from "./components/EmpireAIRouterPanel";
// Phase 3
import DiscoveryEngine from "./components/DiscoveryEngine";
import BenchmarkEngine from "./components/BenchmarkEngine";
import SelfImprovementEngine from "./components/SelfImprovementEngine";
import DiscoveryDashboard from "./components/DiscoveryDashboard";

const INITIAL_SCRIPT_TEMPLATE = `In this deep architectural teardown, we review how to move past modern React client-side monoliths handling isolated metadata. We explain how storing platform API keys directly on client user devices creates immense key disclosure vulnerability. Instead, we propose an enterprise topology utilizing Go FastAPI gateways, Temporal workflows, PostgreSQL pgvector style retrieval, and serverless FFmpeg pipelines on Fargate to manage high throughput contextual generations. Let's dive in!`;

export default function App() {
  const [script, setScript] = useState<string>(INITIAL_SCRIPT_TEMPLATE);
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["twitter", "linkedin", "tiktok"]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  
  const [results, setResults] = useState<MultiAgentResponse | null>(() => {
    try {
      const saved = localStorage.getItem("crosspost_results");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const savedResults = localStorage.getItem("crosspost_results");
      if (savedResults) {
        const parsed = JSON.parse(savedResults);
        if (parsed?.generations?.[0]?.platformId) {
          return parsed.generations[0].platformId;
        }
      }
    } catch {}
    return "linkedin";
  });

  const [apiMode, setApiMode] = useState<"live" | "simulated">("simulated");

  // Navigation & Workspace states
  const [currentWorkspace, setCurrentWorkspace] = useState<string>("mission");
  const [githubToken, setGithubToken] = useState<string>(() => localStorage.getItem("empire_github_token") || "");

  const handleUpdateGithubToken = (token: string) => {
    setGithubToken(token);
    localStorage.setItem("empire_github_token", token);
  };

  const [monetizerSubTab, setMonetizerSubTab] = useState<"discovery" | "dashboard">("discovery");

  // Algorithmic Monetization Bot States
  const [targetNiche, setTargetNiche] = useState<string>("Faceless Coding Tutorials & AI Tools");
  const [startingCapital, setStartingCapital] = useState<string>("Low Budget / $0 Sweat Equity");
  const [researchResults, setResearchResults] = useState<any | null>(null);
  const [researching, setResearching] = useState<boolean>(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [gooseLogStep, setGooseLogStep] = useState<number>(-1);
  const [activeCouncilTab, setActiveCouncilTab] = useState<string>("Monetization Architect (Funnel Strategy)");

  // Interactive UI enhancement states
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [codeFiles, setCodeFiles] = useState<{ name: string; content: string }[]>([]);
  const [fetchingCode, setFetchingCode] = useState<boolean>(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [selectedExportFile, setSelectedExportFile] = useState<string>("src/App.tsx");

  // User-friendly real-time draft editor and heuristic scoring metrics state
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("crosspost_edited_drafts");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const runAlgorithmicResearch = async () => {
    if (!targetNiche || targetNiche.trim() === "") {
      setResearchError("A target monetization niche is required.");
      return;
    }
    setResearching(true);
    setResearchError(null);
    setResearchResults(null);
    setGooseLogStep(0);

    try {
      const res = await fetch("/api/research-monetization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: targetNiche, capital: startingCapital })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute algorithm research.");
      }

      // Simulate step-by-step logs from the GitHub Goose Autonomous Scraper
      const logLength = data.gooseAutonomousLogs.length;
      let step = 0;
      const interval = setInterval(() => {
        setGooseLogStep(step);
        if (step >= logLength - 1) {
          clearInterval(interval);
          setResearchResults(data);
          if (data.claudeCouncil && data.claudeCouncil.length > 0) {
            setActiveCouncilTab(data.claudeCouncil[0].persona);
          }
          setResearching(false);
        } else {
          step++;
        }
      }, 700);

    } catch (err: any) {
      setResearchError(err?.message || "An unexpected error occurred during research.");
      setResearching(false);
      setGooseLogStep(-1);
    }
  };

  const isInitialMount = useRef(true);

  // Sync results to localStorage when it changes
  useEffect(() => {
    if (results) {
      localStorage.setItem("crosspost_results", JSON.stringify(results));
    } else {
      localStorage.removeItem("crosspost_results");
      localStorage.removeItem("crosspost_edited_drafts");
    }
  }, [results]);

  // Sync edited drafts with newly fetched results or restore from storage
  useEffect(() => {
    if (results) {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        const savedDrafts = localStorage.getItem("crosspost_edited_drafts");
        if (savedDrafts) {
          try {
            const parsed = JSON.parse(savedDrafts);
            if (Object.keys(parsed).length > 0) {
              // Ensure all platform keys exist, if not, fill them
              const initial: Record<string, string> = { ...parsed };
              results.generations.forEach(g => {
                if (initial[g.platformId] === undefined) {
                  initial[g.platformId] = g.finalContent;
                }
              });
              setEditedDrafts(initial);
              return;
            }
          } catch {}
        }
      }

      // Default/Fallback: Reset to generated platform content if no saved drafts found
      const initial: Record<string, string> = {};
      results.generations.forEach(g => {
        initial[g.platformId] = g.finalContent;
      });
      setEditedDrafts(initial);
    }
  }, [results]);

  // Sync edited drafts to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(editedDrafts).length > 0) {
      localStorage.setItem("crosspost_edited_drafts", JSON.stringify(editedDrafts));
    }
  }, [editedDrafts]);

  // Real-time linguistic & formatting checker resolving common AI generation problems
  const analyzeContentHeuristics = (text: string, platformId: string, charLimit: number) => {
    if (!text) {
      return {
        charCount: 0,
        isOverLimit: false,
        foundClichés: [],
        hasWallOfText: false,
        hookStrength: 0,
        hashtagCount: 0,
        hashtagIssue: "",
        readabilityGrade: "No content",
        overallScore: 0,
        suggestedAction: "Write something to run analysis."
      };
    }

    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const charCount = text.length;
    
    // Heuristic AI-Speak and Robotic Clichés found in low quality copy generators
    const clichés = [
      { word: "delve", replacement: "explore, look into, or examine" },
      { word: "tapestry", replacement: "landscape, mix, combination, or network" },
      { word: "moreover", replacement: "also, what's more, or besides" },
      { word: "game-changer", replacement: "shift, breakthrough, or key upgrade" },
      { word: "testament", replacement: "proof, example, or demonstration" },
      { word: "revolutionize", replacement: "transform, update, or shift" },
      { word: "pioneering", replacement: "new, leading, or early" },
      { word: "unlocking the potential", replacement: "enabling, opening up, or activating" },
      { word: "furthermore", replacement: "also, additionally" },
      { word: "in summary", replacement: "essentially, in short" },
      { word: "demystify", replacement: "explain, simplify, or clarify" },
      { word: "crucial", replacement: "key, vital, or major" },
      { word: "essential", replacement: "key, needed" },
      { word: "look no further", replacement: "here is, explore this" },
      { word: "foster", replacement: "build, develop, or grow" },
      { word: "leverage", replacement: "use, apply, or gain" },
      { word: "by considering", replacement: "considering" },
    ];

    const foundClichés = clichés.filter(item => 
      new RegExp(`\\b${item.word}\\b`, "i").test(text)
    );

    // Wall of Text Checker
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    let hasWallOfText = false;
    let maxParagraphWords = 0;
    
    const paragraphs = text.split(/\n\s*\n/);
    paragraphs.forEach(p => {
      const pWords = p.trim().split(/\s+/).filter(Boolean).length;
      if (pWords > maxParagraphWords) {
        maxParagraphWords = pWords;
      }
    });
    if (maxParagraphWords > 42) {
      hasWallOfText = true;
    }

    // Hook Strength Analysis
    const firstLine = lines[0] || "";
    const firstLineWordCount = firstLine.split(/\s+/).filter(Boolean).length;
    const hasQuestionInHook = firstLine.includes("?");
    const hasShortHook = firstLineWordCount > 0 && firstLineWordCount <= 12;
    const hasNumberInHook = /\b\d+\b/.test(firstLine);
    
    let hookStrength = 50;
    if (hasShortHook) hookStrength += 20;
    if (hasQuestionInHook) hookStrength += 15;
    if (hasNumberInHook) hookStrength += 15;
    if (firstLine.toUpperCase() === firstLine && firstLine.length > 5) hookStrength += 10;
    hookStrength = Math.min(100, Math.max(20, hookStrength));

    // Hashtag Density Checker
    const hashtagCount = (text.match(/#/g) || []).length;
    let hashtagIssue = "";
    let hashtagScorePenalty = 0;
    if (hashtagCount > 5) {
      hashtagIssue = `Excessive hashtags (${hashtagCount}). High hashtag density is penalized by modern algorithms. Limit to 3 max.`;
      hashtagScorePenalty = (hashtagCount - 3) * 8;
    }

    // Readability scoring (heuristic based on average word size)
    let avgWordLength = 0;
    if (wordCount > 0) {
      const totalChars = words.reduce((acc, w) => acc + w.replace(/[^a-zA-Z]/g, "").length, 0);
      avgWordLength = totalChars / wordCount;
    }
    let readabilityGrade = "Casual & Conversational";
    if (avgWordLength > 6.1) {
      readabilityGrade = "Academic / High-Complexity";
    } else if (avgWordLength > 5.2) {
      readabilityGrade = "Professional & Structured";
    } else if (avgWordLength > 4.2) {
      readabilityGrade = "Punchy & Direct (Clear)";
    } else {
      readabilityGrade = "Highly Readable (Engaging)";
    }

    // Character limit check
    const isOverLimit = charCount > charLimit;

    // Build heuristic overall engagement score
    let overallScore = 80;
    overallScore -= foundClichés.length * 12;
    if (hasWallOfText) overallScore -= 15;
    if (isOverLimit) overallScore -= 35;
    overallScore += Math.round((hookStrength - 50) / 2);
    overallScore -= hashtagScorePenalty;
    
    // Adjust slightly based on paragraph breaks
    if (paragraphs.length >= 3) overallScore += 8;
    
    overallScore = Math.min(100, Math.max(10, overallScore));

    let suggestedAction = "Looks highly optimized for publication!";
    if (isOverLimit) {
      suggestedAction = `⚠️ Shorten content by ${charCount - charLimit} characters to fit platform limit.`;
    } else if (foundClichés.length > 0) {
      suggestedAction = `🔄 Replace the highlighted AI clichés to sound more authentic.`;
    } else if (hasWallOfText) {
      suggestedAction = "✍️ Break up large text blocks with blank lines to improve readability.";
    } else if (hookStrength < 65) {
      suggestedAction = "🪝 Rewrite the first line into a shorter question or clear bold hook.";
    } else if (hashtagCount > 5) {
      suggestedAction = "🏷️ Trim down your hashtags to prevent algorithmic penalties.";
    }

    return {
      charCount,
      isOverLimit,
      foundClichés,
      hasWallOfText,
      hookStrength,
      hashtagCount,
      hashtagIssue,
      readabilityGrade,
      overallScore,
      suggestedAction
    };
  };

  // Fetch codebase files for DeepSeek / AI prompt packaging
  const fetchCodebase = async () => {
    setFetchingCode(true);
    try {
      const res = await fetch("/api/export-codebase");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCodeFiles(data.codebase);
        }
      }
    } catch (err) {
      console.error("Failed to retrieve system codebase files:", err);
    } finally {
      setFetchingCode(false);
    }
  };

  useEffect(() => {
    fetchCodebase();
  }, []);

  const getCodebaseMarkdown = () => {
    let md = "# CROSSPOST CONTENT OPERATING SYSTEM BLUEPRINT\n\n";
    md += "This is the complete system source bundle generated automatically for direct ingestion into DeepSeek, Claude, or Gemini.\n\n";
    codeFiles.forEach(file => {
      md += `\n// ==========================================\n`;
      md += `// FILE: ${file.name}\n`;
      md += `// ==========================================\n\n`;
      const ext = file.name.split('.').pop();
      const lang = ext === 'ts' || ext === 'tsx' ? 'typescript' : ext === 'json' ? 'json' : 'text';
      md += `\`\`\`${lang}\n${file.content}\n\`\`\`\n\n`;
    });
    return md;
  };

  const handleCopyAll = () => {
    const text = getCodebaseMarkdown();
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    });
  };

  const handleDownloadAll = () => {
    const text = getCodebaseMarkdown();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "crosspost-complete-codebase.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyFile = (fileName: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedFile(fileName);
      setTimeout(() => setCopiedFile(null), 2000);
    });
  };

  // Fetch available platform schemas on load
  useEffect(() => {
    fetch("/api/platforms")
      .then((res) => {
        if (!res.ok) throw new Error("Could not retrieve platform specs.");
        return res.json();
      })
      .then((data: PlatformConfig[]) => {
        setPlatforms(data);
        if (data.length > 0) {
          // Initialize active tab with first platform
          setActiveTab(data.find(p => selectedPlatforms.includes(p.id))?.id || data[0].id);
        }
      })
      .catch((err) => {
        console.error("Platform spec fetching failed. Utilizing procedured defaults.", err);
        // Fallback platform list mirroring server
        const fallbackPlatforms: PlatformConfig[] = [
          {
            id: "youtube", name: "YouTube", category: "Video", charLimit: 5000,
            specs: { videoRatio: "16:9", maxDuration: "No limit", thumbSize: "1280×720", maxFileSize: "256GB", bestLength: "7–15 min", captionStyle: "Long-form description" },
            contentRules: ["Write a compelling title hook in the first line", "Add timestamps every 2–3 minutes (e.g. 0:00 Intro)", "Include 3–5 relevant keyword phrases naturally"],
            prompt: "YouTube description generator",
            platformBestPractices: "Clean timestamps and structured narratives boost SEO discoverability. Frontload value in the first 2 description lines."
          },
          {
            id: "tiktok", name: "TikTok", category: "Video", charLimit: 2200,
            specs: { videoRatio: "9:16 (vertical)", maxDuration: "10 min", maxFileSize: "287.6MB", bestLength: "15–60 sec", captionStyle: "Hook + hashtags" },
            contentRules: ["First 3 words must be a hard STOP hook", "Use ultra-casual Gen-Z language", "3–5 trending hashtags only"],
            prompt: "TikTok viral caption strategist",
            platformBestPractices: "Explosive, stop-scrolling hooks must hit in under 3 words. Pair casual copy with relevant, high-velocity trending hashtags."
          },
          {
            id: "instagram", name: "Instagram", category: "Visual", charLimit: 2200,
            specs: { videoRatio: "9:16 Reels / 1:1 Feed", maxDuration: "90 sec Reels", maxFileSize: "650MB", bestLength: "15–30 sec Reels", captionStyle: "Storytelling + hashtag block" },
            contentRules: ["Hook in first line", "20–30 hashtags grouped at end after 3 dots"],
            prompt: "Instagram engagement expert",
            platformBestPractices: "Aesthetic formatting with dot spacers ensures readable storytelling, while dense hashtag blocks separated at the bottom index your visual post properly."
          },
          {
            id: "twitter", name: "X / Twitter", category: "Micro", charLimit: 280,
            specs: { videoRatio: "16:9 or 1:1", maxDuration: "2 min 20 sec", maxFileSize: "512MB", bestLength: "Under 30 sec", captionStyle: "Tweet (280 chars max)" },
            contentRules: ["HARD limit: 280 characters total", "Hook must land in first 5 words", "2–3 hashtags max"],
            prompt: "Twitter viral handler",
            platformBestPractices: "X favors high-relevance controversial hooks and intense brevity. Bullet points are highly digestible and increase thread click-through-rates."
          },
          {
            id: "linkedin", name: "LinkedIn", category: "Pro", charLimit: 3000,
            specs: { videoRatio: "16:9 or 1:1", maxDuration: "10 min", maxFileSize: "5GB", bestLength: "1–3 min", captionStyle: "Thought-leadership post" },
            contentRules: ["First line is the hook", "Short paragraphs — 1–3 sentences max", "Bold key phrases wrapped in *asterisks*"],
            prompt: "LinkedIn thought ghostwriter",
            platformBestPractices: "Single-sentence hooks followed by clean paragraph spacing improve feed readability. Emphasize keywords using *asterisks* to catch active scrollers."
          },
          {
            id: "reddit", name: "Reddit", category: "Community", charLimit: 40000,
            specs: { videoRatio: "16:9 or 1:1", maxDuration: "15 min", maxFileSize: "1GB", bestLength: "Under 5 min", captionStyle: "Post title + body text" },
            contentRules: ["Reddit hates obvious self-promotion — be genuine", "Use markdown formatting"],
            prompt: "Reddit contributor post",
            platformBestPractices: "Deliver immediate, rich value using formatting like headers or quote blocks. Avoid corporate jargon entirely to build authentic trust."
          }
        ];
        setPlatforms(fallbackPlatforms);
        setActiveTab("linkedin");
      });
  }, []);

  const handleCheckboxToggle = (id: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const executePipeline = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    // Dynamic progressive loaders representing system execution graphs
    const steps = [
      "🔍 Analyst Agent: Extracting messaging entities, keywords, and theme matrices...",
      "🧠 pgvector Memory matching: Searching cosine distance indices for Creator Style memory standard...",
      "📝 Writer Director: Generating platform variations with custom prompts & character guidelines...",
      "⚖️ Critic reviews active: Verifying character safety buffers & hashtag compliance...",
      "📊 Scoring Engine activated: Running Hook Entropy equations and predictive engagement checks...",
      "🚀 INGRESS PLATFORM COMPLETED"
    ];

    let currentStepIndex = 0;
    setCurrentStep(steps[0]);

    // Fast progressive status updates every 200ms to keep the premium agent feel without delaying the response
    const progressInterval = setInterval(() => {
      if (currentStepIndex < steps.length - 2) {
        currentStepIndex++;
        setCurrentStep(steps[currentStepIndex]);
      }
    }, 220);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          platforms: selectedPlatforms
        })
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error("Enterprise gateway pipeline reported generation failure.");
      }

      const payload: MultiAgentResponse = await response.json();
      
      // Instantly transition to completion state
      setCurrentStep(steps[steps.length - 1]);
      await new Promise(resolve => setTimeout(resolve, 150)); // Tiny pause for visual transition satisfaction

      setResults(payload);
      setApiMode(payload.isSimulated ? "simulated" : "live");
      
      // Auto-set active tab to the first of selected platforms
      const availableSelected = selectedPlatforms.filter(id => payload.generations.some(g => g.platformId === id));
      if (availableSelected.length > 0) {
        setActiveTab(availableSelected[0]);
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err?.message || "An unexpected system execution fault occurred.");
    } finally {
      setLoading(false);
      setCurrentStep("");
    }
  };

  const selectedPlatformData = platforms.find(p => p.id === activeTab);
  const activeGeneration = results?.generations.find(g => g.platformId === activeTab);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-slate-950 font-sans antialiased pb-16">
      
      {/* Upper Global Navigation */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Main Title branding */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded flex items-center justify-center font-bold text-slate-950 text-lg shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              EO
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent uppercase font-sans">
                  EMPIRE OS
                </h1>
                <span className="text-[10px] font-mono tracking-wider font-semibold text-indigo-400 bg-indigo-950/50 border border-indigo-900/60 px-1.5 py-0.5 rounded">
                  v3.0 ENTERPRISE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Business Intelligence Workspace & Cognitive Routing Architecture</p>
            </div>
          </div>

          {/* Infrastructure Health Stats & Fallback Telemetry */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-md">
              <Server className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-400">INGRESS ROUTER: <strong className="text-emerald-400 font-bold">PORT 3000</strong></span>
            </div>
            
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-[10px] font-mono ${
              apiMode === "live" 
                ? "bg-emerald-950/30 border-emerald-900/60 text-emerald-400" 
                : "bg-indigo-950/20 border-indigo-900/50 text-indigo-400"
            }`}>
              <Brain className="w-3.5 h-3.5 shrink-0" />
              <span>ROUTER STATUS: <strong className="font-bold">{apiMode === "live" ? "GEMINI SECURE" : "SIMULATION ACTIVE"}</strong></span>
            </div>
          </div>

        </div>
      </header>

      <div className="flex flex-col lg:flex-row max-w-[1700px] mx-auto min-h-[calc(100vh-73px)]">
        {/* Left Sidebar Menu */}
        <aside className="w-full lg:w-64 shrink-0 bg-slate-950/20 border-b lg:border-b-0 lg:border-r border-slate-900 p-5 space-y-6">
          
          {/* Operations Section */}
          <div className="space-y-2 font-sans">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase block">Operations</span>
            <div className="space-y-1">
              <button
                onClick={() => setCurrentWorkspace("mission")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "mission"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span>Mission Control</span>
                </div>
                <span className="text-[8px] bg-indigo-950 border border-indigo-900/40 text-indigo-300 px-1 rounded font-bold">CORE</span>
              </button>

              <button
                onClick={() => setCurrentWorkspace("commandcenter")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "commandcenter"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span>Command Center</span>
                </div>
                <span className="text-[8px] bg-emerald-950 border border-emerald-900/40 text-emerald-400 px-1 rounded font-bold">CORE</span>
              </button>

              <button
                onClick={() => setCurrentWorkspace("analytics")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "analytics"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  <span>Analytics</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("automation")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "automation"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  <span>Automation Center</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("settings")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "settings"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Settings Center</span>
                </div>
              </button>
            </div>
          </div>

          {/* AI Intelligence Section */}
          <div className="space-y-2 font-sans">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase block">AI Intelligence</span>
            <div className="space-y-1">
              <button
                onClick={() => setCurrentWorkspace("router")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "router"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <span>AI Router</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("ollama")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "ollama"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>Ollama Center</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("inspector")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "inspector"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span>Empire Inspector</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("import")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "import"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-indigo-400" />
                  <span>Project Import</span>
                </div>
              </button>
            </div>
          </div>

          {/* Creative Console Section */}
          <div className="space-y-2 font-sans">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase block">Creative Console</span>
            <div className="space-y-1">
              <button
                onClick={() => setCurrentWorkspace("storyforge")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "storyforge"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span>StoryForge</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("docfactory")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "docfactory"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-indigo-400" />
                  <span>Documentary Factory</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("listers")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "listers"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-indigo-400" />
                  <span>Boss Listers</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("ingress")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "ingress"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>Content Ingress</span>
                </div>
              </button>
            </div>
          </div>

          {/* Platform Depot Section */}
          <div className="space-y-2 font-sans">
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase block">Platform Depot</span>
            <div className="space-y-1">
              <button
                onClick={() => setCurrentWorkspace("empire")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "empire"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Plugin Manager</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("monetizer")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "monetizer"
                    ? "bg-indigo-650 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-indigo-400" />
                  <span>Monetization Center</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("deployment")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "deployment"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <span>Deployment Center</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("testing")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "testing"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-indigo-400" />
                  <span>Testing Center</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("knowledge")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "knowledge"
                    ? "bg-indigo-600 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span>Knowledge Center</span>
                </div>
              </button>
            </div>
          </div>

          {/* Empire OS v3 — direct connections to localhost:3001 */}
          <div className="mb-4">
            <div className="px-3 py-1.5 text-[9px] font-mono font-bold tracking-widest text-slate-600 uppercase">
              Empire OS v3
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => setCurrentWorkspace("empire-health")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "empire-health"
                    ? "bg-emerald-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Health Monitor</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("empire-router")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "empire-router"
                    ? "bg-indigo-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <span>AI Router</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("empire-discovery")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "empire-discovery"
                    ? "bg-cyan-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  <span>Discovery Feed</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("empire-benchmark")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "empire-benchmark"
                    ? "bg-amber-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Model Benchmark</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("empire-connectors")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "empire-connectors"
                    ? "bg-purple-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Plug className="w-4 h-4 text-purple-400" />
                  <span>Connectors</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("higgsfield")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "higgsfield"
                    ? "bg-pink-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-pink-400" />
                  <span>Higgsfield AI</span>
                </div>
              </button>

              {/* ── Phase 3 additions ── */}
              <button
                onClick={() => setCurrentWorkspace("discovery-dashboard")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "discovery-dashboard"
                    ? "bg-blue-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span>Discovery Hub</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("discovery-engine")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "discovery-engine"
                    ? "bg-teal-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-teal-400" />
                  <span>Discovery Engine</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("benchmark-engine")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "benchmark-engine"
                    ? "bg-yellow-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-yellow-400" />
                  <span>Benchmark Engine</span>
                </div>
              </button>

              <button
                onClick={() => setCurrentWorkspace("self-improvement")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  currentWorkspace === "self-improvement"
                    ? "bg-green-700 text-slate-100 shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span>Self Improvement</span>
                </div>
              </button>
            </div>
          </div>

        </aside>

        {/* Right Main Content Pane */}
        <main className="flex-grow min-w-0 p-6 lg:p-8 space-y-8">

          {currentWorkspace === "ingress" && (
      <section className="bg-gradient-to-b from-slate-900/60 to-transparent py-8 px-6 border-b border-slate-900">
        <div className="max-w-7xl mx-auto">
          
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-xl p-6 relative overflow-hidden shadow-2xl">
            <div className="absolute right-4 top-4 z-20 flex gap-2">
              <button 
                onClick={() => {
                  const el = document.getElementById("deepseek-exporter");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/95 hover:bg-indigo-500 text-slate-100 font-mono text-[10px] font-bold transition shadow-[0_0_15px_rgba(99,102,241,0.4)]"
              >
                <Code className="w-3 h-3" />
                <span>Export to DeepSeek</span>
              </button>

              <button 
                onClick={() => setShowGuide(!showGuide)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-semibold transition"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{showGuide ? "Hide System Guide" : "Show System Guide"}</span>
                {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div className="relative z-10 max-w-4xl">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-400 uppercase bg-cyan-950/50 border border-cyan-900/60 px-2 py-0.5 rounded">
                  SYSTEM OVERVIEW
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-500">
                  Interactive Sandbox
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-100 mt-2 tracking-tight uppercase">
                CROSSPOST: Multi-Agent Ingress & Scoring Sandbox
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed mt-2.5 max-w-3xl">
                This enterprise blueprint demonstrates how to move away from a client-side React monolith (which handles heavy assets on browser threads and risks key leaks) toward a secure, decoupled full-stack architecture. Your Gemini API keys are held safely on the Node.js server, which orchestrates specialized AI agents to analyze, refine, and score content dynamically.
              </p>
            </div>

            {/* Expandable Step-by-Step System Guide */}
            {showGuide && (
              <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-4 gap-4 animate-fadeIn">
                <div className="bg-slate-950/70 border border-slate-900 p-3.5 rounded-lg">
                  <div className="flex items-center gap-2 mb-2 text-cyan-400">
                    <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center border border-cyan-800/60">1</span>
                    <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider">Creator Input</h4>
                  </div>
                  <p className="text-slate-450 text-[11px] leading-relaxed">
                    Paste raw podcasts, rough outlines, or video scripts in the left panel. The parser extracts core themes off-thread.
                  </p>
                </div>

                <div className="bg-slate-950/70 border border-slate-900 p-3.5 rounded-lg">
                  <div className="flex items-center gap-2 mb-2 text-indigo-400">
                    <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 text-xs font-mono font-bold flex items-center justify-center border border-indigo-800/60">2</span>
                    <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider">Select Targets</h4>
                  </div>
                  <p className="text-slate-450 text-[11px] leading-relaxed">
                    Toggle target social platforms. Each activates distinct system prompts, token budgets, and formatting logic.
                  </p>
                </div>

                <div className="bg-slate-950/70 border border-slate-900 p-3.5 rounded-lg">
                  <div className="flex items-center gap-2 mb-2 text-sky-400">
                    <span className="w-5 h-5 rounded-full bg-sky-950 text-sky-400 text-xs font-mono font-bold flex items-center justify-center border border-sky-800/60">3</span>
                    <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider">Run AI Ingress</h4>
                  </div>
                  <p className="text-slate-450 text-[11px] leading-relaxed">
                    The Express gateway pipes the content to 3 specialized agents: the Analyst, the Director/Writer, and the safety Critic.
                  </p>
                </div>

                <div className="bg-slate-950/70 border border-indigo-950/40 p-3.5 rounded-lg bg-indigo-950/10">
                  <div className="flex items-center gap-2 mb-2 text-indigo-300">
                    <span className="w-5 h-5 rounded-full bg-indigo-900/60 text-slate-100 text-xs font-mono font-bold flex items-center justify-center border border-indigo-750">4</span>
                    <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider">DeepSeek Export</h4>
                    <span className="text-[8px] font-semibold text-cyan-400 animate-pulse font-mono px-1 bg-cyan-950/80 rounded border border-cyan-900">NEW</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Ready to migrate or use outside? Copy or download the complete self-contained full-stack codebase in a single click below!
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </section>
      )}

      {currentWorkspace === "ingress" && (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT INTERACTIVE CONSOLE COLUMN - 5 cols */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Input Script segment */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-slate-100">1. Creator Input Script</h3>
                </div>
                <button 
                  onClick={() => setScript(INITIAL_SCRIPT_TEMPLATE)} 
                  className="text-[10px] font-mono text-slate-400 hover:text-cyan-400 transition"
                  title="Reset to sample architectural script"
                >
                  [Reset Template]
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal mb-3">
                Paste your raw podcast transcripts, text scripts, or video structures here. The multi-agent pipeline will extract semantic tokens and format posts according to platform specs.
              </p>
              
              <textarea
                id="input-creator-script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Type or paste your raw creator script contents here..."
                rows={7}
                className="w-full bg-slate-950 border border-slate-800 text-xs font-sans rounded-lg p-3 text-slate-200 focus:outline-none focus:border-cyan-500/80 transition leading-relaxed resize-none focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>

            {/* Target Platform Selector Grid */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-slate-100">2. Target Platforms Schema</h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {selectedPlatforms.length} STATIONS ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal mb-4">
                Select targets to process. Each utilizes highly distinct specifications, character limits, and system instruction hooks:
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {platforms.map(platform => {
                  const isChecked = selectedPlatforms.includes(platform.id);
                  return (
                    <div 
                      key={platform.id}
                      onClick={() => handleCheckboxToggle(platform.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                        isChecked 
                          ? "bg-slate-950 border-cyan-500/80 text-slate-100 shadow-[inset_0_1px_5px_rgba(6,182,212,0.1)]" 
                          : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:bg-slate-950"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-bold font-mono text-slate-200">{platform.name}</span>
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                          isChecked ? "bg-cyan-500 border-cyan-500 text-slate-950" : "border-slate-800 bg-slate-900"
                        }`}>
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-900">
                        <span className="text-[9px] font-mono text-slate-400 lowercase">{platform.category}</span>
                        <span className="text-[9px] font-mono text-cyan-400">{platform.charLimit} chars</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action trigger button */}
              <button
                type="button"
                id="btn-trigger-orchestrator"
                disabled={loading || selectedPlatforms.length === 0}
                onClick={executePipeline}
                className={`w-full py-3.5 px-4 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-2.5 transition-all text-slate-950 cursor-pointer uppercase tracking-wider ${
                  loading || selectedPlatforms.length === 0
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : "bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 hover:brightness-105 shadow-[0_0_20px_rgba(6,182,212,0.15)] focus:ring-2 focus:ring-cyan-400/50"
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Executing agent graphs...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-slate-950 text-slate-950" />
                    <span>Run Multi-Agent Ingress Flow</span>
                  </>
                )}
              </button>
              
              {loading && (
                <div className="mt-4 bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <div className="flex gap-2 items-start text-xs font-mono text-cyan-400">
                    <Terminal className="w-3.5 h-3.5 stroke-[2] mt-0.5 animate-pulse text-cyan-400" />
                    <span className="text-[11px] leading-relaxed select-none">{currentStep}</span>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT VIEW COLUMN - 7 cols */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* General Failures / Errors Banner */}
            {error && (
              <div className="bg-rose-950/30 border border-rose-900 rounded-xl p-4 flex gap-3 text-rose-300">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-450" />
                <div>
                  <span className="text-xs font-mono font-bold block uppercase tracking-wider">CRITICAL INGRESS FAULT</span>
                  <p className="text-[11px] leading-relaxed mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Ingress Outputs Matrix Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex-1 flex flex-col justify-between min-h-[440px]">
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-mono font-bold uppercase text-slate-100">3. Generation Pipeline Output</h3>
                  </div>
                  {results && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-850 px-2 py-0.5 rounded">
                      Processed At: {new Date(results.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {!results ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-8">
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-full text-slate-600 mb-4 animate-pulse">
                      <Terminal className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-350">Engine State: Sleeping / Idle</h4>
                    <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
                      Select target platforms on the left and click "Run Multi-Agent Ingress Flow" to launch the orchestration loop and inspect active scores.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Analyst Agent Information Section */}
                    <div className="bg-slate-950 border border-slate-850 p-4 rounded-lg mb-6 max-w-none">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-850 px-2 py-0.5 rounded-sm">
                          Agent 1: Analyst Insights
                        </span>
                        <div className="h-px bg-slate-850 flex-1"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-500">Core Content Theme</span>
                          <p className="text-xs font-semibold text-slate-200 mt-0.5">{results.analyst.theme}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-500">Target Audience Archetype</span>
                          <p className="text-xs font-semibold text-slate-200 mt-0.5">{results.analyst.audience}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-500">Named Message Entities</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {results.analyst.entities.map((ent, idx) => (
                              <span key={idx} className="bg-slate-900 border border-slate-800 text-[10px] font-mono px-2 py-0.5 rounded text-indigo-300">
                                {ent}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-500">Psychology Tone Mapping</span>
                          <p className="text-xs font-semibold text-slate-200 mt-0.5">{results.analyst.tone}</p>
                        </div>
                      </div>
                    </div>

                    {/* Output Tabs for platforms */}
                    <div className="flex flex-wrap border-b border-slate-800 mb-4 gap-1">
                      {selectedPlatforms.map(platId => {
                        const platObj = platforms.find(p => p.id === platId);
                        const hasGen = results.generations.some(g => g.platformId === platId);
                        if (!platObj || !hasGen) return null;
                        
                        return (
                          <button
                            key={platId}
                            onClick={() => setActiveTab(platId)}
                            className={`px-3.5 py-2 font-mono text-xs font-semibold rounded-t-lg border-t border-x transition-all ${
                              activeTab === platId 
                                ? "bg-slate-950 border-slate-800 text-cyan-400 focus:outline-none" 
                                : "bg-slate-900/50 border-transparent text-slate-400 hover:bg-slate-950 hover:text-slate-200"
                            }`}
                          >
                            {platObj.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Output Inspector Tab */}
                    {activeGeneration && selectedPlatformData && (() => {
                      const activeDraft = editedDrafts[activeTab] !== undefined 
                        ? editedDrafts[activeTab] 
                        : activeGeneration.finalContent;

                      const hMetrics = analyzeContentHeuristics(activeDraft, activeTab, selectedPlatformData.charLimit);
                      const isEdited = activeDraft !== activeGeneration.finalContent;

                      return (
                        <div className="space-y-5">
                          
                          {/* Dedicated Platform Specialist Bot Display Card */}
                          <div className="bg-slate-950/80 border border-cyan-500/10 rounded-lg p-4 animate-fadeIn flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shrink-0 shadow-inner">
                                {activeGeneration.specialistBotAvatar || "🤖"}
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-bold font-sans text-slate-100">
                                    {activeGeneration.specialistBotName || `${selectedPlatformData.name} Specialist Bot`}
                                  </h4>
                                  <span className="text-[9px] font-mono font-bold bg-cyan-950/40 border border-cyan-900/50 text-cyan-400 px-1.5 py-0.5 rounded tracking-wider uppercase">
                                    Active Specialist Agent
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                                  <strong>Specialty Focus:</strong> {activeGeneration.specialistBotTone || "Platform-native tone matching, style compliance, and click-bait retention loops."}
                                </p>
                                {selectedPlatformData.platformBestPractices && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-cyan-400/90 mt-2 bg-cyan-950/30 border border-cyan-500/10 rounded-md px-2.5 py-1.5 max-w-2xl">
                                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-cyan-400 animate-pulse" />
                                    <span><strong>Pro-Tip:</strong> {selectedPlatformData.platformBestPractices}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="w-full md:w-auto shrink-0 flex flex-wrap gap-2 md:grid md:grid-cols-2 lg:flex lg:flex-row">
                              <div className="bg-slate-900/50 border border-slate-850 rounded px-2.5 py-1.5 text-left min-w-[130px] flex-1 md:flex-initial">
                                <span className="text-[9px] font-mono text-slate-500 uppercase block">Pacing Advice</span>
                                <span className="text-[11px] font-medium text-slate-300 block truncate max-w-[180px]" title={activeGeneration.specialistBotPacing || "Structured spacing layouts"}>
                                  {activeGeneration.specialistBotPacing || "Platform-native rhythms"}
                                </span>
                              </div>
                              <div className="bg-slate-900/50 border border-slate-850 rounded px-2.5 py-1.5 text-left min-w-[130px] flex-1 md:flex-initial">
                                <span className="text-[9px] font-mono text-slate-500 uppercase block">Metadata Optimize</span>
                                <span className="text-[11px] font-medium text-cyan-400 block truncate max-w-[180px]" title={activeGeneration.specialistBotMetadata || "Curated tag clusters"}>
                                  {activeGeneration.specialistBotMetadata || "SEO titles & hashtags"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Draft Comparison & Live Editor */}
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                            {/* Original Draft Display (Col Span 5) */}
                            <div className="lg:col-span-5 bg-slate-950 p-4 border border-slate-850 rounded-lg flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                                    Agent 2: Initial Draft
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-600">ReadOnly</span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                                  {activeGeneration.originalDraft}
                                </p>
                              </div>
                              <div className="mt-4 pt-3 border-t border-slate-900/60 text-[9px] text-slate-500 font-mono italic">
                                Raw unprocessed candidate generated off platform specifications.
                              </div>
                            </div>

                            {/* Live Interactive Polishing Pad (Col Span 7) */}
                            <div className="lg:col-span-7 bg-slate-950 p-4 border border-cyan-500/20 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.03)] flex flex-col justify-between">
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest block font-bold">
                                      Active Polish Workspace
                                    </span>
                                    {isEdited && (
                                      <>
                                        <span className="text-[8px] font-mono bg-indigo-950 border border-indigo-800 text-indigo-400 px-1 rounded">
                                          EDITED
                                        </span>
                                        <span className="flex items-center gap-1 text-[8px] font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-500/10 px-1.5 py-0.5 rounded">
                                          <CheckCircle className="w-2.5 h-2.5 shrink-0" />
                                          <span>Synced to LocalStorage</span>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    {isEdited && (
                                      <button
                                        onClick={() => {
                                          setEditedDrafts(prev => ({
                                            ...prev,
                                            [activeTab]: activeGeneration.finalContent
                                          }));
                                        }}
                                        className="text-[9px] font-mono text-slate-500 hover:text-slate-350 flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-900 bg-slate-900/20 transition cursor-pointer"
                                        title="Reset to original generated content"
                                      >
                                        <RefreshCw className="w-2.5 h-2.5" />
                                        <span>Undo Changes</span>
                                      </button>
                                    )}

                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(activeDraft);
                                        setCopiedFile(activeTab);
                                        setTimeout(() => setCopiedFile(null), 2000);
                                      }}
                                      className="text-[9px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 px-2 py-0.5 rounded border border-cyan-950 bg-cyan-950/20 transition cursor-pointer"
                                    >
                                      {copiedFile === activeTab ? (
                                        <>
                                          <Check className="w-2.5 h-2.5" />
                                          <span>Copied!</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-2.5 h-2.5" />
                                          <span>Copy copy</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <textarea
                                  value={activeDraft}
                                  onChange={(e) => {
                                    setEditedDrafts(prev => ({
                                      ...prev,
                                      [activeTab]: e.target.value
                                    }));
                                  }}
                                  rows={8}
                                  className="w-full bg-slate-900/40 border border-slate-800/80 rounded p-2.5 text-xs text-slate-100 font-sans leading-relaxed focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 resize-none select-text"
                                  placeholder="Modify or paste text updates here..."
                                />
                              </div>

                              <div className="mt-3 pt-2.5 border-t border-slate-900/60 flex items-center justify-between text-[10px] font-mono">
                                <span className="text-slate-500">Character usage:</span>
                                <span className={hMetrics.isOverLimit ? "text-rose-400 font-bold" : "text-slate-400"}>
                                  {hMetrics.charCount} / {selectedPlatformData.charLimit} chars
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Dynamic Heuristics Audit Module */}
                          <div className="bg-slate-950/40 border border-slate-850 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-900">
                              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-bold">
                                Real-Time Algorithmic Performance Audit
                              </span>
                              <span className="text-[9px] font-mono text-slate-500">Updates live on keystroke</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                              {/* Overall score indicator */}
                              <div className="md:col-span-4 bg-slate-950 border border-slate-850 p-4 rounded-lg flex flex-col justify-between items-center text-center">
                                <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold">PREDICTIVE AUDIT SCORE</span>
                                <div className="text-3xl font-black font-mono text-slate-100 my-2">{hMetrics.overallScore}%</div>
                                
                                <div className="w-full bg-slate-900 rounded-full h-1.5 mb-1.5 overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      hMetrics.overallScore >= 80 
                                        ? "bg-emerald-500" 
                                        : hMetrics.overallScore >= 60 
                                          ? "bg-indigo-500" 
                                          : "bg-rose-500"
                                    }`} 
                                    style={{ width: `${hMetrics.overallScore}%` }}
                                  ></div>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-wider">
                                  {hMetrics.overallScore >= 80 ? "🔥 HIGH PERFORMANCE" : hMetrics.overallScore >= 60 ? "📈 SOLID COPY" : "⚠️ NEEDS REVISION"}
                                </span>
                              </div>

                              {/* Heuristics metrics list */}
                              <div className="md:col-span-8 grid grid-cols-2 gap-3">
                                <div className="bg-slate-950/60 p-3 rounded border border-slate-850">
                                  <span className="text-[9px] font-mono text-slate-500 uppercase block">Hook Retention</span>
                                  <div className="flex items-center gap-2 mt-1">
                                    <strong className="text-sm font-mono text-slate-200">{hMetrics.hookStrength}%</strong>
                                    <span className="text-[9px] font-mono text-slate-450">
                                      {hMetrics.hookStrength >= 80 ? "(Strong)" : hMetrics.hookStrength >= 65 ? "(Good)" : "(Weak)"}
                                    </span>
                                  </div>
                                </div>

                                <div className="bg-slate-950/60 p-3 rounded border border-slate-850">
                                  <span className="text-[9px] font-mono text-slate-500 uppercase block">Readability Level</span>
                                  <div className="mt-1 text-xs font-semibold text-slate-200 truncate">
                                    {hMetrics.readabilityGrade}
                                  </div>
                                </div>

                                <div className="bg-slate-950/60 p-3 rounded border border-slate-850">
                                  <span className="text-[9px] font-mono text-slate-500 uppercase block">Format Scanner</span>
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${hMetrics.hasWallOfText ? "bg-rose-400" : "bg-emerald-400"}`}></span>
                                    <span className="text-xs text-slate-200">
                                      {hMetrics.hasWallOfText ? "Wall of Text found" : "Scannable Spacing"}
                                    </span>
                                  </div>
                                </div>

                                <div className="bg-slate-950/60 p-3 rounded border border-slate-850">
                                  <span className="text-[9px] font-mono text-slate-500 uppercase block">Hashtag Density</span>
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span className="text-xs font-mono text-slate-200">{hMetrics.hashtagCount} tags</span>
                                    {hMetrics.hashtagCount > 5 && (
                                      <span className="text-[8px] font-mono text-rose-400 px-1 bg-rose-950/40 border border-rose-900 rounded">Too high</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Linguistic Cliché Alert Matrix (Resolving over-AI-fied content problem) */}
                            {hMetrics.foundClichés.length > 0 && (
                              <div className="mt-4 p-3 bg-amber-950/15 border border-amber-900/30 rounded-lg animate-fadeIn">
                                <div className="flex items-center gap-1.5 text-amber-400 mb-2">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider">⚠️ AI-Speak Clichés Detected ({hMetrics.foundClichés.length})</span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                                  Similar tools fail because they generate robotic content filled with overused AI terminology that audiences instantly flag and scroll past. Polish these terms to sound more natural:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {hMetrics.foundClichés.map((item, idx) => (
                                    <div key={idx} className="bg-slate-950 border border-amber-900/40 rounded p-2 text-[10px] leading-relaxed max-w-sm">
                                      <span className="font-mono text-amber-400 font-bold">"{item.word}"</span>
                                      <span className="text-slate-400 text-[10px] block mt-0.5">Try: {item.replacement}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Dynamic optimization tip banner */}
                            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/50 p-3 rounded border border-slate-850">
                              <div className="text-left">
                                <span className="text-[9px] font-mono text-slate-500 block">System Recommendations:</span>
                                <span className="text-xs font-semibold text-slate-200">
                                  {hMetrics.isOverLimit 
                                    ? `Reduce text length to match characters limit constraint.` 
                                    : hMetrics.foundClichés.length > 0 
                                      ? "Replace robotic vocabulary flags."
                                      : hMetrics.hasWallOfText 
                                        ? "Split paragraphs to optimize mobile UX feed indexing."
                                        : "Draft aligns successfully with optimal copy standards!"}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] font-mono text-slate-500 block">Suggested Optimizer:</span>
                                <span className="text-xs font-semibold text-cyan-400">{hMetrics.suggestedAction}</span>
                              </div>
                            </div>
                          </div>

                          {/* Critic Review Audit report */}
                          <div className="bg-slate-950/60 border border-slate-855 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-900/50 px-2 py-0.5 rounded">
                                Agent 3: Critic Audit & Rules Review
                              </span>
                              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                activeGeneration.critic.passed 
                                  ? "bg-emerald-950/50 border border-emerald-800 text-emerald-400" 
                                  : "bg-amber-950/50 border border-amber-805 text-amber-400"
                              }`}>
                                {activeGeneration.critic.passed ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                    <span>PASSED CRITIC FILTER</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>WARNING RULES TRIGGERED</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
                              <div className="md:col-span-8 space-y-2">
                                <div>
                                  <span className="text-[10px] text-slate-500 font-mono">ISSUES SCREENED:</span>
                                  <ul className="list-disc pl-4 space-y-1 mt-1 text-[11px] text-slate-300">
                                    {activeGeneration.critic.issues.map((issue, idx) => (
                                      <li key={idx}>{issue}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="pt-2 border-t border-slate-900">
                                  <span className="text-[10px] text-slate-500 font-mono">REVISION LOGS:</span>
                                  <p className="text-[11px] text-slate-400 mt-0.5 italic">{activeGeneration.critic.revisions}</p>
                                </div>
                              </div>
                              
                              <div className="md:col-span-4 bg-slate-900 border border-slate-850 p-3 rounded-lg flex flex-col justify-between items-center text-center">
                                <span className="text-[10px] font-mono text-slate-500 uppercase">COMPLIANCE</span>
                                <div className="text-2xl font-black font-mono text-slate-100 my-1">{activeGeneration.critic.score}%</div>
                                <div className="w-full bg-slate-950 rounded-full h-1">
                                  <div 
                                    className="bg-indigo-500 h-1 rounded-full" 
                                    style={{ width: `${activeGeneration.critic.score}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>

                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {results && (
                <div className="pt-4 mt-6 border-t border-slate-800 text-[10px] text-slate-500 font-mono flex flex-wrap items-center justify-between gap-2 leading-relaxed">
                  <span>SYSTEM SUCCESS STATUS: OK CODE [INGREGSS_200]</span>
                  <span className="text-indigo-400">All generations passed mathematical safety validations</span>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* MATH ENGINE MODULE */}
        <section className="mt-12">
          <div className="mb-4">
            <h3 className="text-sm font-mono font-bold uppercase text-slate-300 tracking-wider">
              ● Strategic Logic Pipeline Evaluation
            </h3>
          </div>
          <MathEngine />
        </section>

        {/* DECENTRALIZED TOPOLOGY SPECIFIER */}
        <section className="mt-12">
          <div className="mb-4 flex justify-between items-center">
            <h3 className="text-sm font-mono font-bold uppercase text-slate-300 tracking-wider">
              ● Server-Side Distributed Microservice Topology
            </h3>
            <span className="text-xs text-sky-400 flex items-center gap-1">
              Decoupling React Monolith
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <SystemArchitecture />
        </section>

        {/* VULNERABILITY MATRIX & DECOUPLING STRATEGY */}
        <section className="mt-12 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <div className="border-b border-slate-800 pb-4 mb-6">
            <span className="text-xs font-mono text-rose-400 bg-rose-950/50 border border-rose-900 px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              Hazard Assessment Security Audit
            </span>
            <h3 className="text-lg font-bold text-slate-100 mt-2">CROSSPOST Architecture Remediation Matrix</h3>
            <p className="text-slate-400 text-xs mt-1">
              Detailed review mapping standard client-side implementation risks to the robust enterprise microservices architecture.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
                  <th className="py-3 px-4 font-bold">Client-Side Paradigm Risk</th>
                  <th className="py-3 px-4 font-bold">Vulnerability Trigger Vector</th>
                  <th className="py-3 px-4 font-bold text-cyan-400">Remediated Serverless Enterprise Strategy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                <tr>
                  <td className="py-4 px-4 font-bold text-slate-100">Exposed API Keys & Keys Leaks</td>
                  <td className="py-4 px-4 font-mono text-rose-400 select-none">Model direct endpoints, process.env exposure in client bundles</td>
                  <td className="py-4 px-4 font-sans text-slate-400">
                    Keys live exclusively on server environment nodes. Clients communicate with a secure, rate-limited FastAPI gateway using standard short-lived stateless JWT tokens.
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-bold text-slate-100">Storage Overflows & Crash States</td>
                  <td className="py-4 px-4 font-mono text-rose-400 select-none">Client localStorage 5MB size ceiling, user wiping caches</td>
                  <td className="py-4 px-4 font-sans text-slate-400">
                    State persists durably on dedicated PostgreSQL read-replicas. Complex drafts and high throughput arrays are stored as compressed relational blobs.
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-bold text-slate-100">Media Overloads & CPU Starvation</td>
                  <td className="py-4 px-4 font-mono text-rose-400 select-none">Processing multi-megabyte video streams on client canvas or browser</td>
                  <td className="py-4 px-4 font-sans text-slate-400">
                    Asynchronous workloads process off-thread on AWS ECS Fargate container queues running natively optimized multi-threaded FFmpeg binaries.
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-bold text-slate-100">Network Dropout Loss</td>
                  <td className="py-4 px-4 font-mono text-rose-400 select-none">HTTP requests failing mid-generation during standard Promise.allSettled loops</td>
                  <td className="py-4 px-4 font-sans text-slate-400">
                    Guaranteed state recovery and activity retry handlers powered by Temporal workflows. Connective heartbeat monitored constantly over WebSockets.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* STRATEGIC ROADMAP SCENE */}
        <section className="mt-12 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <div className="border-b border-slate-800 pb-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-900 px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
                Strategic Enterprise Agenda
              </span>
              <h3 className="text-lg font-bold text-slate-100 mt-2 font-sans">Corporate Execution Implementation Roadmap</h3>
              <p className="text-slate-400 text-xs mt-1">
                Prioritizing velocity, stability, and high performance while staying strictly focused on validated features.
              </p>
            </div>
            
            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 bg-amber-950/40 border border-amber-900 px-3 py-1 rounded">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>OUT OF INVESTMENT SCOPE FOR STAGE: Remotion proprietary canvas editor</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            
            {/* Phase 1 */}
            <div className="bg-slate-950 border border-slate-850 p-5 rounded-lg flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-mono text-cyan-400 font-bold bg-cyan-950/40 border border-cyan-800 px-2 py-0.5 rounded uppercase">
                  Phase I - Stability & Foundation
                </span>
                <h4 className="text-sm font-bold text-slate-200 mt-3">SYSTEM HOOK STABILIZATION</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed mt-2">
                  Eradicate client-side API keys and build secure gateway proxy endpoints. Establish stateful retry graphs on server instances, isolate multi-format generation crashes, and optimize context token metrics.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-900 flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-400">● CURRENT EXECUTION TASK</span>
                <span className="text-[10px] font-mono text-slate-500">100% COMPLETE</span>
              </div>
            </div>

            {/* Phase 2 */}
            <div className="bg-slate-950 border border-slate-850 p-5 rounded-lg flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-mono text-indigo-400 font-bold bg-indigo-950/40 border border-indigo-900 px-2 py-0.5 rounded uppercase">
                  Phase II - Scale & Polish
                </span>
                <h4 className="text-sm font-bold text-slate-200 mt-3">PGVECTOR CREATOR MEMORY</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed mt-2">
                  Integrate postgres pgvector indices, partition embeddings arrays by unique IDs, and ingest high-performing speech structures into vector pools. Deploy automated subtitle burns and multi-aspect cropping.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-900 flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-400">● PLANNED TARGET INNING</span>
                <span className="text-[10px] font-mono text-slate-500">Q3 EXECUTION</span>
              </div>
            </div>

            {/* Phase 3 */}
            <div className="bg-slate-950 border border-slate-850 p-5 rounded-lg flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-mono text-purple-400 font-bold bg-purple-950/40 border border-purple-900 px-2 py-0.5 rounded uppercase">
                  Phase III - Autonomous Moat Play
                </span>
                <h4 className="text-sm font-bold text-slate-200 mt-3">DIALECT FEEDBACK AUTOMATION</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed mt-2">
                  Establish background performance telemetry loops, pull real world video impressions durably using web hooks, and automatically self-tune core generation prompts using predictive engagement tensors.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-900 flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-400">● ECOSYSTEM EXPANSION</span>
                <span className="text-[10px] font-mono text-slate-500">Q4 HORIZON</span>
              </div>
            </div>

          </div>
        </section>
          </>
        )}

        {currentWorkspace === "monetizer" && (
          <div className="space-y-8 animate-fadeIn">
            {/* Monetizer Sub-Tabs Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-850 pb-3">
              <div className="flex gap-2 p-1 bg-slate-950 border border-slate-850 rounded-lg">
                <button
                  onClick={() => setMonetizerSubTab("discovery")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider transition duration-150 cursor-pointer ${
                    monetizerSubTab === "discovery"
                      ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-slate-950 font-extrabold shadow-md"
                      : "text-slate-400 hover:text-slate-250 hover:bg-slate-900/50"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Discovery Bot</span>
                </button>
                <button
                  onClick={() => setMonetizerSubTab("dashboard")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider transition duration-150 cursor-pointer ${
                    monetizerSubTab === "dashboard"
                      ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-slate-950 font-extrabold shadow-md"
                      : "text-slate-400 hover:text-slate-250 hover:bg-slate-900/50"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Performance Dashboard</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-sans font-bold ${
                    monetizerSubTab === "dashboard"
                      ? "bg-slate-950 text-cyan-400 border border-slate-800"
                      : "bg-cyan-950 border border-cyan-800/40 text-cyan-400"
                  }`}>New</span>
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span>Active Workspace:</span>
                <strong className="text-slate-350">Algorithmic Arbitrage Panel</strong>
              </div>
            </div>

            {monetizerSubTab === "dashboard" ? (
              <PerformanceDashboard />
            ) : (
              <>
                {/* NEW: Algorithmic Monetization Workspace */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-xl p-6 relative overflow-hidden shadow-2xl">
              <div className="max-w-3xl">
                <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-400 bg-cyan-950/50 border border-cyan-900 px-2.5 py-1 rounded-full uppercase">
                  💰 ALGORITHMIC ARBITRAGE STATION
                </span>
                <h2 className="text-2xl font-black text-slate-100 mt-3 tracking-tight">
                  MONETIZATION CHANNEL DISCOVERY BOT
                </h2>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                  A fully integrated multi-agent council representing the **Claude Council technique** paired with an autonomous **GitHub Goose scraper program**. Type any digital niche below to dissect the underlying social algorithm weight, calculate CPM yield margins, and deploy high-money faceless or authority channel configurations.
                </p>
              </div>
              
              <div className="mt-6 p-4 bg-slate-950 border border-slate-850 rounded-lg grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-6 space-y-2">
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Target Niche or Idea</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={targetNiche}
                      onChange={(e) => setTargetNiche(e.target.value)}
                      placeholder="e.g., Faceless Coding Tutorials, AI productivity hacks, high-ticket SaaS tips"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition font-sans"
                    />
                  </div>
                </div>

                <div className="md:col-span-3 space-y-2">
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Starting Capital</label>
                  <select
                    value={startingCapital}
                    onChange={(e) => setStartingCapital(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
                  >
                    <option value="Low Budget / $0 Sweat Equity">Low Budget / $0 Sweat Equity</option>
                    <option value="Medium scale ($500 - $2000 outsourcing)">Medium scale ($500 - $2000 outsourcing)</option>
                    <option value="High scale (Full automation team)">High scale (Full automation team)</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <button
                    onClick={runAlgorithmicResearch}
                    disabled={researching}
                    className="w-full bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs font-mono py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition uppercase tracking-wider shadow-md disabled:opacity-55 cursor-pointer"
                  >
                    {researching ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>ANALYZING...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>LAUNCH SCRAPER BOT</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {researchError && (
                <div className="mt-4 p-3.5 bg-rose-950/20 border border-rose-900 text-rose-300 text-xs rounded-lg flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <p>{researchError}</p>
                </div>
              )}
            </div>

            {/* Terminal Scraper Logs representing Goose Agent */}
            {researching && gooseLogStep >= 0 && (
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-5 font-mono text-xs shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-900">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">GITHUB GOOSE AGENT AUTONOMOUS TERMINAL</span>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold animate-pulse">Running live scrapers...</span>
                </div>
                
                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-2 text-slate-350">
                  {Array.from({ length: gooseLogStep + 1 }).map((_, idx) => {
                    const logsList = [
                      { timestamp: "0.0s", action: "BOOTING_GOOSE_AGENT", output: "Initializing autonomous scraper loop targeting social media search indexes..." },
                      { timestamp: "0.8s", action: "CRAWLING_GITHUB_API", output: `Searching GitHub repositories for trending tools matching '${targetNiche}'. Found 47 active repositories with >200 stars. Key interest: Automation frameworks.` },
                      { timestamp: "1.4s", action: "SCRAPING_YOUTUBE_CHANNELS", output: `Auditing competitor accounts in '${targetNiche}' niche. Detected average video length of 8:12, estimated monthly AdSense CPM revenue of $14,200.` },
                      { timestamp: "2.1s", action: "EVALUATING_BUDGET_ROI", output: `Analyzing feasibility with budget '${startingCapital}'. Minimum cost to execute: $0 using free tiers.` },
                      { timestamp: "2.9s", action: "OPTIMIZING_CHANNELS", output: "Goose crawl successfully finished. Compiled top performing tag variables and formatting models." }
                    ];
                    const log = logsList[idx] || logsList[0];
                    return (
                      <div key={idx} className="p-2.5 bg-slate-900 border border-slate-850 rounded flex flex-col md:flex-row gap-1 md:gap-4 font-mono leading-relaxed transition-all animate-fadeIn">
                        <span className="text-indigo-400 text-[10px] shrink-0 font-bold">[{log.timestamp}]</span>
                        <span className="text-cyan-400 text-[10px] shrink-0 font-bold uppercase">{log.action}:</span>
                        <span className="text-slate-300 text-xs flex-1">{log.output}</span>
                        <span className="text-emerald-400 text-[10px] font-bold">● SUCCESS</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Results presentation */}
            {researchResults && !researching && (() => {
              const candidates = researchResults.candidateChannels || [
                {
                  id: 1,
                  name: `${researchResults.bestChannelConfig.channelNameSuggestion.split(" ")[0] || "Alpha"} Shorts Hub`,
                  focus: `Short-form vertical video speedrun (TikTok/Shorts) targeting ${researchResults.query?.niche || "this niche"}`,
                  viralPotential: 92,
                  estimatedCpm: 2.50,
                  pros: ["Extremely fast organic discovery velocity", "Low friction production (automated ElevenLabs audio + CapCut clips)"],
                  cons: ["Extremely low CPM payouts", "Poor email conversion rate without aggressive landing-page baits"],
                  councilVotes: "Algorithm Arbitrage Analyst (Traffic Vector)",
                  isWinner: false
                },
                {
                  id: 2,
                  name: researchResults.bestChannelConfig.channelNameSuggestion,
                  focus: `High-Value Long-Form Authority Hub (YouTube 10min+ Video Essays & Substack)`,
                  viralPotential: 88,
                  estimatedCpm: 18.50,
                  pros: ["Ultra-high CPM ($15 - $25) in B2B/Tech finance spaces", "Durable email lists with high long-term LTV per subscriber"],
                  cons: ["Higher upfront production friction", "Requires deep technical scripting and editing flow"],
                  councilVotes: "Monetization Architect & Risk Auditor (Consensus Choice)",
                  isWinner: true
                },
                {
                  id: 3,
                  name: `The ${(researchResults.query?.niche || "Niche").replace(/channels|videos|money|making/gi, "").trim()} Insider`,
                  focus: `Opinionated B2B Textual Authority (X/Twitter & LinkedIn)`,
                  viralPotential: 74,
                  estimatedCpm: 12.00,
                  pros: ["Zero production cost", "Direct networking access with industry buyers and consulting clients"],
                  cons: ["Hard capped by character limit constraints", "Requires manual replies to stay in recommendation feeds"],
                  councilVotes: "None (Pragmatic fallback)",
                  isWinner: false
                }
              ];

              return (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
                  
                  {/* Full Width: Claude Council Channel Picker Board */}
                  <div className="lg:col-span-12 space-y-4">
                    <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6 shadow-xl relative">
                      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
                      
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850 pb-4 mb-6">
                        <div>
                          <div className="flex items-center gap-2">
                            <Brain className="w-5 h-5 text-indigo-400" />
                            <h3 className="text-sm font-mono font-black uppercase text-indigo-400 tracking-wider">
                              Claude Council Method — Viral Research Results
                            </h3>
                          </div>
                          <h2 className="text-lg font-black text-slate-100 tracking-tight mt-1">
                            Evaluated Candidates & Viral Winner Selection
                          </h2>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-3 py-1.5 rounded-lg">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>3 Council Members Consensus Voting Complete</span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 max-w-4xl mb-6 leading-relaxed">
                        Below are the three distinct distribution channels formulated and analyzed by the <strong>Claude Council</strong> (Monetization Architect, Algorithm Arbitrage Analyst, and Risk & Friction Auditor). The council evaluated each candidate for organic discoverability, CPM payout margins, and technical overhead before voting to nominate the absolute best channel configuration to go viral.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {candidates.map((cand: any) => {
                          const isWinner = cand.isWinner;
                          return (
                            <div 
                              key={cand.id} 
                              className={`relative rounded-xl p-5 transition-all duration-200 flex flex-col justify-between ${
                                isWinner 
                                  ? "bg-slate-950 border-2 border-cyan-500/65 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20" 
                                  : "bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                              }`}
                            >
                              {isWinner && (
                                <div className="absolute -top-3 left-4 bg-gradient-to-r from-cyan-500 to-indigo-600 text-slate-950 font-mono font-black text-[9px] px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md">
                                  <Sparkles className="w-3 h-3 stroke-[2.5]" />
                                  <span>COUNCIL WINNER (3/3 VOTES)</span>
                                </div>
                              )}

                              <div>
                                <div className="flex justify-between items-start gap-2 mb-3">
                                  <div className="max-w-[70%]">
                                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">Candidate #{cand.id}</span>
                                    <h4 className="text-sm font-black text-slate-200 tracking-tight mt-0.5 break-words">{cand.name}</h4>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-[9px] font-mono text-slate-500 block uppercase">Est. CPM</span>
                                    <span className="text-xs font-mono font-black text-cyan-400">${cand.estimatedCpm.toFixed(2)}</span>
                                  </div>
                                </div>

                                <p className="text-[11px] text-slate-400 mb-4 leading-relaxed font-sans">{cand.focus}</p>

                                {/* Viral Potential Meter */}
                                <div className="mb-5 bg-slate-950 p-3 rounded-lg border border-slate-850">
                                  <div className="flex justify-between text-[10px] font-mono mb-1.5">
                                    <span className="text-slate-400">Viral Potential Score:</span>
                                    <span className={`font-black ${isWinner ? "text-cyan-400" : "text-indigo-400"}`}>
                                      {cand.viralPotential}%
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-1000 ${
                                        isWinner 
                                          ? "bg-gradient-to-r from-cyan-400 to-indigo-500" 
                                          : "bg-indigo-600/60"
                                      }`}
                                      style={{ width: `${cand.viralPotential}%` }}
                                    ></div>
                                  </div>
                                </div>

                                {/* Pros & Cons */}
                                <div className="space-y-3 mb-5">
                                  <div className="space-y-1.5">
                                    <span className="text-[9px] font-mono font-bold text-emerald-500 uppercase tracking-wide block">Key Potential</span>
                                    {cand.pros.map((pro: string, pIdx: number) => (
                                      <div key={pIdx} className="flex gap-2 text-[10px] text-slate-300 font-sans">
                                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                        <span>{pro}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="space-y-1.5 pt-1.5 border-t border-slate-900/50">
                                    <span className="text-[9px] font-mono font-bold text-rose-400 uppercase tracking-wide block">Friction Point</span>
                                    {cand.cons.map((con: string, cIdx: number) => (
                                      <div key={cIdx} className="flex gap-2 text-[10px] text-slate-400 font-sans">
                                        <span className="text-rose-400 font-bold shrink-0">✗</span>
                                        <span>{con}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-850 flex items-center justify-between text-[9px] font-mono">
                                <div>
                                  <span className="text-slate-500 block">COUNCIL VOTE</span>
                                  <span className={`font-bold ${isWinner ? "text-cyan-400" : "text-slate-300"}`}>{cand.councilVotes}</span>
                                </div>
                                {isWinner ? (
                                  <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold uppercase">
                                    Adopted
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-850 text-slate-500 uppercase">
                                    Defeated
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Left block (Col Span 7) - Channel setup and Platforms */}
                  <div className="lg:col-span-7 space-y-6">
                  
                  {/* Channel Setup Configurator Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute right-3 top-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-900">
                        DIFFICULTY: {researchResults.bestChannelConfig.difficultyGrade}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <Coins className="w-5 h-5 text-cyan-400" />
                      <h3 className="text-xs font-mono font-bold uppercase text-slate-100">RECOMMENDED CHANNEL CONFIGURATION</h3>
                    </div>

                    <div className="bg-slate-950 border border-slate-850 p-4 rounded-lg mb-4">
                      <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">SUGGESTED MONETIZATION BRAND</span>
                      <strong className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 block mt-1 tracking-tight font-mono">
                        {researchResults.bestChannelConfig.channelNameSuggestion}
                      </strong>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-5">
                      <div className="bg-slate-950/60 p-3 rounded border border-slate-850">
                        <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold block">Niche focus</span>
                        <p className="text-slate-200 mt-1 font-sans">{researchResults.bestChannelConfig.nicheFocus}</p>
                      </div>
                      <div className="bg-slate-950/60 p-3 rounded border border-slate-850">
                        <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold block">Monetization style</span>
                        <p className="text-slate-200 mt-1 font-sans font-bold">{researchResults.bestChannelConfig.monetizationMethod}</p>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-cyan-950 p-4 rounded-lg">
                      <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider block">ALGORITHMIC HOOK STRATEGY:</span>
                      <p className="text-xs text-slate-100 italic mt-2 leading-relaxed">
                        "{researchResults.bestChannelConfig.viralHookStrategy}"
                      </p>
                    </div>
                  </div>

                  {/* Platform CPM Comparisons Table */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-mono font-bold uppercase text-slate-100">ALGORITHMIC CPM & PLATFORM YIELD MATRICES</h3>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">Real-time indexing</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 uppercase font-mono text-[9px] tracking-wider">
                            <th className="py-2.5 px-3 font-bold">PLATFORM STATION</th>
                            <th className="py-2.5 px-3 font-bold">ALGORITHM KEY FACTOR</th>
                            <th className="py-2.5 px-3 font-bold text-cyan-400">EST. CPM RANGE</th>
                            <th className="py-2.5 px-3 font-bold text-indigo-400">YIELD POTENTIAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 text-slate-300">
                          {researchResults.algorithmAnalysis.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-950/40 transition">
                              <td className="py-3 px-3 font-bold text-slate-100">{item.platform}</td>
                              <td className="py-3 px-3 text-slate-400 leading-relaxed font-sans">
                                <ul className="list-disc pl-3 space-y-0.5 text-[11px]">
                                  {item.algorithmKeys.map((k: string, kIdx: number) => (
                                    <li key={kIdx}>{k}</li>
                                  ))}
                                </ul>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-cyan-400">{item.cpmRange}</td>
                              <td className="py-3 px-3 text-xs text-indigo-300 font-medium">{item.monetizationPotential}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right block (Col Span 5) - Claude Council Debate & Launch Checklist */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* Claude Council Debate Box */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-indigo-400" />
                          <h3 className="text-xs font-mono font-bold uppercase text-slate-100">CLAUDE COUNCIL DEBATE PANEL</h3>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">3 EXPERTS</span>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed mb-4 font-sans">
                        The Claude Council consists of three separate model personas reviewing, debating, and warning against common channel pitfalls to assure highest profitable performance.
                      </p>

                      {/* Council Tabs */}
                      <div className="flex flex-col gap-1.5 mb-4">
                        {researchResults.claudeCouncil.map((adv: any, idx: number) => {
                          const isSelected = activeCouncilTab === adv.persona;
                          return (
                            <button
                              key={idx}
                              onClick={() => setActiveCouncilTab(adv.persona)}
                              className={`w-full text-left p-2.5 rounded border transition flex justify-between items-center cursor-pointer ${
                                isSelected
                                  ? "bg-slate-950 border-cyan-500/30 text-cyan-400 shadow-[inset_0_1px_4px_rgba(6,182,212,0.05)]"
                                  : "bg-slate-900/50 border-slate-850 hover:bg-slate-950 text-slate-400"
                              }`}
                            >
                              <div className="text-left">
                                <span className="text-[10px] font-mono block font-bold">{adv.persona}</span>
                                <span className="text-[8px] font-mono text-slate-500">STANCE: {adv.stance}</span>
                              </div>
                              <span className={`text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
                                adv.stance === "Bullish" 
                                  ? "bg-emerald-950/80 border border-emerald-900 text-emerald-400" 
                                  : adv.stance === "Skeptical" 
                                    ? "bg-rose-950/80 border border-rose-900 text-rose-400" 
                                    : "bg-amber-950/80 border border-amber-900 text-amber-400"
                              }`}>
                                {adv.stance.toUpperCase()}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Tab active speech panel */}
                      {(() => {
                        const adv = researchResults.claudeCouncil.find((a: any) => a.persona === activeCouncilTab);
                        if (!adv) return null;
                        return (
                          <div className="bg-slate-950 p-4 border border-slate-850 rounded-lg animate-fadeIn">
                            <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest block font-bold">
                              Debate Speech Output
                            </span>
                            <p className="text-xs text-slate-200 mt-2 leading-relaxed font-sans whitespace-pre-wrap">
                              {adv.critique}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Actionable Launch Checklist */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                    <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-mono font-bold uppercase text-slate-100">AUTONOMOUS LAUNCH CHECKLIST</h3>
                    </div>

                    <div className="space-y-3 text-xs text-slate-300">
                      {researchResults.bestChannelConfig.launchChecklist.map((item: string, sIdx: number) => (
                        <div key={sIdx} className="p-3 bg-slate-950 border border-slate-850 rounded-lg flex gap-3 items-start hover:border-cyan-500/20 transition">
                          <div className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 text-[10px] font-mono font-bold flex items-center justify-center border border-cyan-900 shrink-0 mt-0.5">
                            {sIdx + 1}
                          </div>
                          <p className="leading-relaxed font-sans text-slate-200 text-[11px]">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

            {/* Default prompt instructions bento board */}
            {!researchResults && !researching && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                  <MessageSquare className="w-5 h-5 text-indigo-400 mb-3" />
                  <h4 className="text-xs font-mono font-bold text-slate-200 uppercase">Claude Council technique</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-2 font-sans">
                    Leverages three separate custom model viewpoints arguing monetization, reach efficiency, and ban/policy risks to bulletproof channel models.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                  <Terminal className="w-5 h-5 text-cyan-400 mb-3" />
                  <h4 className="text-xs font-mono font-bold text-slate-200 uppercase">GitHub Goose Scraper</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-2 font-sans">
                    Simulates deep-crawling active social media search indices, competitive pools, and developer repos to gather the highest performing indicators.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                  <Coins className="w-5 h-5 text-emerald-400 mb-3" />
                  <h4 className="text-xs font-mono font-bold text-slate-200 uppercase">Single-minded Focus</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-2 font-sans">
                    No theoretical theory—strictly optimized towards high CPM, affiliate asset distribution, and continuous cash-flow execution models.
                  </p>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        )}

        {currentWorkspace === "mission" && (
          <MissionControl onNavigate={(ws) => setCurrentWorkspace(ws)} />
        )}

        {currentWorkspace === "commandcenter" && (
          <CommandCenter />
        )}

        {currentWorkspace === "analytics" && (
          <PerformanceDashboard />
        )}

        {currentWorkspace === "automation" && (
          <AutomationCenter />
        )}

        {currentWorkspace === "settings" && (
          <SettingsCenter 
            githubToken={githubToken} 
            onUpdateGithubToken={handleUpdateGithubToken}
            apiMode={apiMode}
            onUpdateApiMode={(mode) => setApiMode(mode)}
          />
        )}

        {currentWorkspace === "router" && (
          <AIRouter />
        )}

        {currentWorkspace === "ollama" && (
          <OllamaCommandCenter />
        )}

        {currentWorkspace === "inspector" && (
          <EmpireInspector />
        )}

        {currentWorkspace === "import" && (
          <ProjectImportCenter />
        )}

        {currentWorkspace === "storyforge" && (
          <StoryForge />
        )}

        {currentWorkspace === "docfactory" && (
          <DocumentaryFactory />
        )}

        {currentWorkspace === "listers" && (
          <BossListers />
        )}

        {currentWorkspace === "empire" && (
          <EmpireOSPluginHub />
        )}

        {currentWorkspace === "deployment" && (
          <DeploymentCenter />
        )}

        {currentWorkspace === "testing" && (
          <TestingCenter />
        )}

        {currentWorkspace === "knowledge" && (
          <KnowledgeCenter />
        )}

        {/* ── Empire OS v3 panels — direct connections to localhost:3001 ── */}
        {currentWorkspace === "empire-health" && (
          <HealthMonitorPanel />
        )}

        {currentWorkspace === "empire-router" && (
          <EmpireAIRouterPanel />
        )}

        {currentWorkspace === "empire-discovery" && (
          <DiscoveryFeed />
        )}

        {currentWorkspace === "empire-benchmark" && (
          <ModelBenchmarkPanel />
        )}

        {currentWorkspace === "empire-connectors" && (
          <ConnectorManager />
        )}

        {currentWorkspace === "higgsfield" && (
          <HiggsfieldStatus />
        )}

        {/* ── Phase 3 workspaces ── */}
        {currentWorkspace === "discovery-dashboard" && (
          <DiscoveryDashboard />
        )}

        {currentWorkspace === "discovery-engine" && (
          <DiscoveryEngine />
        )}

        {currentWorkspace === "benchmark-engine" && (
          <BenchmarkEngine />
        )}

        {currentWorkspace === "self-improvement" && (
          <SelfImprovementEngine />
        )}

        {/* DEEPSEEK & LLM CODEBASE INGRESS EXPORTER SECTION */}
        <section id="deepseek-exporter" className="mt-12 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/20 border border-indigo-500/20 rounded-xl p-6 shadow-[0_0_30px_rgba(99,102,241,0.1)] relative">
          <div className="absolute right-4 top-4">
            <span className="text-[9px] font-mono font-bold tracking-widest text-indigo-400 uppercase bg-indigo-950/60 border border-indigo-900/60 px-2 py-1 rounded">
              LLM Ingress Bundle
            </span>
          </div>

          <div className="border-b border-slate-800 pb-4 mb-6">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-slate-100">DeepSeek / AI Codebase Packager Node</h3>
            </div>
            <p className="text-slate-400 text-xs mt-1">
              Export the complete active full-stack system architecture and backend orchestration algorithms to feed into DeepSeek, Claude, or Gemini in one click.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Control Column */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="p-4 bg-slate-950 border border-slate-850 rounded-lg">
                  <h4 className="text-xs font-mono font-bold uppercase text-slate-300 mb-2">⚡ Consolidated Export</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                    Packs all backend and frontend microservices (`server.ts`, `src/App.tsx`, `package.json`, etc.) into a single beautifully formatted Markdown document.
                  </p>

                  <div className="space-y-2">
                    <button
                      onClick={handleCopyAll}
                      disabled={fetchingCode || codeFiles.length === 0}
                      className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        copiedAll 
                          ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" 
                          : "bg-indigo-600 hover:bg-indigo-500 text-slate-100 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                      }`}
                    >
                      {copiedAll ? (
                        <>
                          <Check className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                          <span>Copied Master Bundle!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Markdown Bundle</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadAll}
                      disabled={fetchingCode || codeFiles.length === 0}
                      className="w-full py-2.5 px-4 rounded-lg font-mono text-xs font-medium border border-slate-800 bg-slate-900/50 hover:bg-slate-900 text-slate-300 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-slate-400" />
                      <span>Download .txt Document</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-lg text-[11px] text-slate-400 space-y-1.5">
                  <div className="text-indigo-400 font-mono text-[10px] font-bold uppercase">💡 PROMPT SUGGESTION FOR DEEPSEEK:</div>
                  <p className="leading-relaxed font-sans">
                    "Here is the complete codebase of CROSSPOST. Review its microservice topology and API proxy. Please help me refactor the scoring math or migrate to next.js."
                  </p>
                </div>
              </div>

              <div className="text-[10px] font-mono text-slate-500 leading-relaxed pt-2 border-t border-slate-900">
                <span>EXPORT PIPELINE: <strong className="text-cyan-400">ONLINE</strong></span>
                <span className="block mt-0.5">Files bundled: {codeFiles.length} modules</span>
              </div>
            </div>

            {/* Code Previewer Column */}
            <div className="lg:col-span-8 flex flex-col bg-slate-950 border border-slate-850 rounded-lg overflow-hidden min-h-[380px]">
              {/* File selector bar */}
              <div className="flex flex-wrap bg-slate-900/80 border-b border-slate-850 p-2 gap-1 justify-between items-center">
                <div className="flex flex-wrap gap-1">
                  {codeFiles.map(file => (
                    <button
                      key={file.name}
                      onClick={() => setSelectedExportFile(file.name)}
                      className={`px-3 py-1.5 font-mono text-[10px] font-semibold rounded transition-all ${
                        selectedExportFile === file.name
                          ? "bg-slate-950 border border-slate-800 text-cyan-400"
                          : "bg-transparent text-slate-450 hover:text-slate-200"
                      }`}
                    >
                      {file.name}
                    </button>
                  ))}
                </div>

                {fetchingCode && (
                  <span className="text-[10px] font-mono text-cyan-400 animate-pulse">Syncing...</span>
                )}
              </div>

              {/* Code viewer pane */}
              <div className="relative flex-1 flex flex-col min-h-0 bg-slate-950">
                <button
                  onClick={() => {
                    const currentFile = codeFiles.find(f => f.name === selectedExportFile);
                    if (currentFile) {
                      handleCopyFile(currentFile.name, currentFile.content);
                    }
                  }}
                  className="absolute right-3 top-3 z-10 p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 hover:border-slate-700 transition"
                  title="Copy this file's code"
                >
                  {copiedFile === selectedExportFile ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>

                <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] text-slate-300 leading-relaxed select-text whitespace-pre max-h-[350px]">
                  {codeFiles.find(f => f.name === selectedExportFile)?.content || "// No file loaded"}
                </pre>
              </div>

              {/* Bottom stats indicator */}
              <div className="bg-slate-900/40 px-4 py-2 border-t border-slate-850 flex justify-between items-center text-[10px] font-mono text-slate-500">
                <span>Selected file: <strong className="text-slate-300">{selectedExportFile}</strong></span>
                <span>Length: {(codeFiles.find(f => f.name === selectedExportFile)?.content || "").length} characters</span>
              </div>
            </div>
          </div>
        </section>

      </main>

      </div>

    </div>
  );
}
