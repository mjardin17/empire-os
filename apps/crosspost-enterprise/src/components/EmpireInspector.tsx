import React, { useState, useEffect, useRef } from "react";
import { 
  Shield, Cpu, Network, FileSearch, Trash2, GitFork, FolderOpen, Zap, 
  Layers, HardDrive, LineChart as ChartIcon, Terminal, Activity, CheckCircle, 
  AlertTriangle, RefreshCw, AlertCircle, Play, Sparkles, HelpCircle, ArrowRight, 
  Plus, Check, Flame, ChevronRight, Copy, Share2, Upload, FileText, Database,
  DollarSign, Clock, HelpCircle as HelpIcon, Search, Eye, ExternalLink, Lock, Settings
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";

// Interfaces
interface ProjectSpec {
  id: string;
  name: string;
  purpose: string;
  framework: string;
  language: "Python" | "TypeScript" | "Node.js" | "Go" | "Ruby" | "Other";
  dependencies: string[];
  database: string;
  envVars: string[];
  apis: string[];
  aiIntegrations: string[];
  deployment: string;
  buildSystem: string;
  status: "working" | "warning" | "broken";
  compatibilityScore: number;
  recommendation: "KEEP" | "MERGE" | "PLUGIN" | "ARCHIVE" | "DELETE";
  
  // Enterprise Scores
  scores: {
    architecture: number;
    maintainability: number;
    scalability: number;
    performance: number;
    security: number;
    techDebt: number; // lower is better (0-100)
  };
}

interface DuplicateItem {
  id: string;
  type: "API" | "Code" | "Prompt" | "Workflow" | "Agent";
  title: string;
  locationA: string;
  locationB: string;
  description: string;
  savingImpact: string;
}

interface AdvisoryRequest {
  task: string;
  workloadType: "coding" | "research" | "writing" | "ocr" | "video_prompt" | "image_prompt" | "marketing" | "translation";
}

export default function EmpireInspector() {
  // Navigation inside Inspector
  const [inspectorTab, setInspectorTab] = useState<"dashboard" | "projects" | "graph" | "advisor" | "duplicates" | "github">("dashboard");
  
  // GitHub Integration States
  const [githubToken, setGithubToken] = useState<string>(() => {
    return localStorage.getItem("empire_github_token") || "";
  });
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [fetchingRepos, setFetchingRepos] = useState<boolean>(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState<number>(-1);
  const [githubConfigured, setGithubConfigured] = useState<boolean>(true);
  const [githubConfigMsg, setGithubConfigMsg] = useState<string>("");
  const [customToken, setCustomToken] = useState<string>("");
  const [repoSearchQuery, setRepoSearchQuery] = useState<string>("");

  
  // In-memory Database of Inspected Projects
  const [projects, setProjects] = useState<ProjectSpec[]>([
    {
      id: "proj_crosspost",
      name: "CrossPost Enterprise",
      purpose: "Multi-Agent publishing orchestration & real-time scraper hub",
      framework: "Express v5, React + Vite, Tailwind CSS",
      language: "TypeScript",
      dependencies: ["@google/genai", "recharts", "motion", "lucide-react", "express", "ws"],
      database: "SQLite (Transient client-state fallback)",
      envVars: ["GEMINI_API_KEY", "PORT", "NODE_ENV"],
      apis: ["POST /api/multi-agent/orchestrate", "GET /api/scrapers/logs", "POST /api/scrapers/crawl"],
      aiIntegrations: ["Gemini 3.5 Flash", "Gemini 3.1 Pro Preview", "Local Ollama Core"],
      deployment: "Cloud Run Container",
      buildSystem: "Vite + esbuild CJS Bundle",
      status: "working",
      compatibilityScore: 98,
      recommendation: "KEEP",
      scores: {
        architecture: 96,
        maintainability: 94,
        scalability: 90,
        performance: 92,
        security: 88,
        techDebt: 8
      }
    },
    {
      id: "proj_storyforge",
      name: "StoryForge Engine",
      purpose: "Long-form narrative synthesis & scene sequencing pipeline",
      framework: "FastAPI, Vue.js v3, Tailwind CSS",
      language: "Python",
      dependencies: ["google-genai", "celery", "jinja2", "redis", "sqlalchemy"],
      database: "PostgreSQL (Supabase instance)",
      envVars: ["GEMINI_API_KEY", "DATABASE_URL", "REDIS_URL"],
      apis: ["POST /api/stories/generate", "GET /api/scenes/sequence", "POST /api/assets/export"],
      aiIntegrations: ["Gemini 3.1 Pro Preview", "Midjourney API Proxy"],
      deployment: "AWS ECS Fargate",
      buildSystem: "Docker Compose / Pipenv",
      status: "working",
      compatibilityScore: 94,
      recommendation: "KEEP",
      scores: {
        architecture: 92,
        maintainability: 88,
        scalability: 85,
        performance: 82,
        security: 90,
        techDebt: 12
      }
    },
    {
      id: "proj_documentary",
      name: "Documentary Factory",
      purpose: "Automated video generation & voiceover timing synchronizer",
      framework: "Flask, Celery, FFmpeg bindings",
      language: "Python",
      dependencies: ["ffmpeg-python", "openai-whisper", "gTTS", "pillow"],
      database: "SQLite local flat-file",
      envVars: ["FFMPEG_PATH", "WHISPER_MODEL_SIZE", "TEMP_STORAGE_DIR"],
      apis: ["POST /api/video/render", "GET /api/render/status/:id"],
      aiIntegrations: ["Whisper Speech-to-Text", "OpenAI TTS Proxy"],
      deployment: "Bare-metal dedicated instance",
      buildSystem: "Setuptools setup.py / requirements.txt",
      status: "warning",
      compatibilityScore: 72,
      recommendation: "MERGE",
      scores: {
        architecture: 75,
        maintainability: 70,
        scalability: 60,
        performance: 65,
        security: 72,
        techDebt: 45
      }
    },
    {
      id: "proj_ltx_video",
      name: "LTX Video Engine",
      purpose: "Cinematic frame interpolator and real-time canvas generator",
      framework: "Go (Golang), React 18, WebSockets",
      language: "Go",
      dependencies: ["github.com/gorilla/websocket", "github.com/redis/go-redis", "github.com/spf13/viper"],
      database: "Redis Cache + Cloud SQL postgres",
      envVars: ["VEO_API_ENDPOINT", "REDIS_CONN", "MAX_WORKERS"],
      apis: ["WS /ws/rendering", "POST /api/frames/interpolate", "GET /api/render/progress"],
      aiIntegrations: ["Veo Video Generation", "Stability AI API"],
      deployment: "GKE Kubernetes Pods",
      buildSystem: "Go Modules / Makefile",
      status: "working",
      compatibilityScore: 88,
      recommendation: "PLUGIN",
      scores: {
        architecture: 90,
        maintainability: 82,
        scalability: 95,
        performance: 96,
        security: 85,
        techDebt: 15
      }
    },
    {
      id: "proj_auto_poster",
      name: "Auto Poster Bot",
      purpose: "Headless cron post publisher with bypass bot detection",
      framework: "Node.js (Vanilla), Puppeteer",
      language: "Node.js",
      dependencies: ["puppeteer-extra", "cron", "axios", "cheerio"],
      database: "None (JSON files payload)",
      envVars: ["COOKIES_JSON_RAW", "HEADLESS_MODE", "PROXY_IP_LIST"],
      apis: ["POST /trigger-post-now", "GET /api/posting-log"],
      aiIntegrations: ["None (Hardcoded scraping patterns)"],
      deployment: "PM2 daemon processes on VPS",
      buildSystem: "Plain npm install package.json",
      status: "broken",
      compatibilityScore: 45,
      recommendation: "DELETE",
      scores: {
        architecture: 40,
        maintainability: 35,
        scalability: 30,
        performance: 45,
        security: 38,
        techDebt: 80
      }
    },
    {
      id: "proj_boss_listers",
      name: "Boss Listers",
      purpose: "Legacy classified lists parser and automatic lead validator",
      framework: "Ruby on Rails v6",
      language: "Ruby",
      dependencies: ["nokogiri", "sidekiq", "devise", "pg"],
      database: "PostgreSQL v12",
      envVars: ["RAILS_ENV", "SECRET_KEY_BASE", "SENDGRID_API_KEY"],
      apis: ["GET /leads/all", "POST /leads/validate", "GET /leads/export"],
      aiIntegrations: ["Legacy OpenAI GPT-3 Davinci"],
      deployment: "Heroku Dino Tier",
      buildSystem: "Webpacker / Bundler",
      status: "warning",
      compatibilityScore: 54,
      recommendation: "ARCHIVE",
      scores: {
        architecture: 65,
        maintainability: 50,
        scalability: 55,
        performance: 58,
        security: 48,
        techDebt: 62
      }
    }
  ]);

  // Selected Project for Deep Inspection Report
  const [selectedProjectId, setSelectedProjectId] = useState<string>("proj_crosspost");
  const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];

  // Drag & Drop Simulation
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(-1);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [importGitUrl, setImportGitUrl] = useState<string>("");
  const [importProjectName, setImportProjectName] = useState<string>("");

  // Duplication Registry
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([
    {
      id: "dup_001",
      type: "API",
      title: "Scrape & Extract Endpoints",
      locationA: "CrossPost (`POST /api/scrapers/crawl`)",
      locationB: "Auto Poster Bot (`/trigger-post-now` custom fetcher)",
      description: "Both projects implement separate headless crawling and HTML selectors to fetch raw blog post text.",
      savingImpact: "Save 30% API maintenance overhead & unify browser resources."
    },
    {
      id: "dup_002",
      type: "Prompt",
      title: "Narrative Tone Prompts",
      locationA: "StoryForge Engine (Script outline prompts)",
      locationB: "CrossPost Enterprise (Tone-matched critic prompts)",
      description: "Identical system-instructions for emotional, highly gripping dramatic storytelling parameters.",
      savingImpact: "Unify to Empire central prompt registry. Reduced token caching cost."
    },
    {
      id: "dup_003",
      type: "Workflow",
      title: "Post-Processing Video Interpolation",
      locationA: "Documentary Factory (Celery timed post-processing render)",
      locationB: "LTX Video Engine (Go Go-routine canvas interpolator)",
      description: "Separate routines that stitch individual frames into MP4/H.264 formats.",
      savingImpact: "Move processing solely to LTX Video Engine. Save ~$180/mo on redundant hosting cores."
    },
    {
      id: "dup_004",
      type: "Agent",
      title: "Persona Critics",
      locationA: "CrossPost Multi-Agent (Senior Brand Critic)",
      locationB: "Boss Listers (Legacy validator scripts)",
      description: "AI validators assessing generated content structure against strict checklist arrays.",
      savingImpact: "Replace with CrossPost's robust verification agent. Deprecate legacy validation scripts."
    }
  ]);

  // AI Advisor matching state
  const [advisorTask, setAdvisorTask] = useState<string>("Parse and summarize 500 PDF legal contract pages and extract key indemnification terms.");
  const [advisorWorkload, setAdvisorWorkload] = useState<"coding" | "research" | "writing" | "ocr" | "video_prompt" | "image_prompt" | "marketing" | "translation">("research");
  const [advisorReport, setAdvisorReport] = useState<any | null>(null);
  const [computingAdvisor, setComputingAdvisor] = useState<boolean>(false);

  // Search filter for projects & graph
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Graph states
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);

  // Overall ecosystem score calculation
  const calculateEcosystemScore = () => {
    if (projects.length === 0) return 0;
    
    // Weighted formula: architecture, maintainability, scalability, performance, security, tech debt
    const scoresSum = projects.reduce((acc, p) => {
      const pScore = (
        p.scores.architecture * 0.25 +
        p.scores.maintainability * 0.20 +
        p.scores.scalability * 0.15 +
        p.scores.performance * 0.15 +
        p.scores.security * 0.25 -
        (p.scores.techDebt * 0.1) // tech debt hurts score
      );
      return acc + pScore;
    }, 0);
    
    return Math.round(scoresSum / projects.length);
  };

  const ecosystemScore = calculateEcosystemScore();

  // Run initial advisory calculation
  useEffect(() => {
    handleRunAdvisor();
  }, []);

  // --- GITHUB INTEGRATION EFFECTS & FUNCTIONS ---
  useEffect(() => {
    // Check if GitHub is configured on the server
    fetch("/api/auth/github/url")
      .then(res => res.json())
      .then(data => {
        if (data.success === false && data.configured === false) {
          setGithubConfigured(false);
          setGithubConfigMsg(data.message);
        } else {
          setGithubConfigured(true);
        }
      })
      .catch(err => {
        console.error("Error checking GitHub config:", err);
      });

    // If we have a token, fetch repos
    if (githubToken) {
      handleFetchRepos(githubToken);
    }
  }, [githubToken]);

  // Handle postMessage communication from GitHub popup callback
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('0.0.0.0')) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'github') {
        const token = event.data.token;
        if (token) {
          setGithubToken(token);
          localStorage.setItem("empire_github_token", token);
          handleFetchRepos(token);
        }
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleFetchRepos = async (tokenToUse: string) => {
    setFetchingRepos(true);
    setGithubError(null);
    try {
      const res = await fetch(`/api/github/repos?token=${encodeURIComponent(tokenToUse)}`);
      if (!res.ok) {
        throw new Error(`Failed to load repositories (status ${res.status})`);
      }
      const data = await res.json();
      if (data.success) {
        setGithubRepos(data.repos || []);
      } else {
        throw new Error(data.error || "Unknown error fetching repositories.");
      }
    } catch (err: any) {
      setGithubError(err.message || "Failed to fetch repositories.");
      if (err.message?.includes("401") || err.message?.includes("Unauthorized")) {
        setGithubToken("");
        localStorage.removeItem("empire_github_token");
      }
    } finally {
      setFetchingRepos(false);
    }
  };

  const handleConnectGitHub = async () => {
    setGithubError(null);
    try {
      const redirectUri = `${window.location.origin}/auth/github/callback`;
      const res = await fetch(`/api/auth/github/url?redirectUri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || "Failed to initiate GitHub OAuth flow.");
      }

      const authWindow = window.open(
        data.url,
        "github_oauth_popup",
        "width=650,height=750,status=no,resizable=yes,scrollbars=yes"
      );

      if (!authWindow) {
        alert("Please allow popups to authenticate with GitHub.");
      }
    } catch (err: any) {
      setGithubError(err.message || "Failed to start GitHub connection.");
    }
  };

  const handleDisconnectGitHub = () => {
    setGithubToken("");
    setGithubRepos([]);
    localStorage.removeItem("empire_github_token");
  };

  const handlePlaygroundDemo = () => {
    const demoRepos = [
      {
        id: 9901,
        name: "agent-mesh-orchestrator",
        owner: { login: "empire-enterprise" },
        description: "Decentralized state machine and multi-agent coordination grid for LLM nodes.",
        stargazers_count: 142,
        language: "Go",
        updated_at: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        id: 9902,
        name: "realtime-cv-pipelines",
        owner: { login: "empire-enterprise" },
        description: "Low-latency frame processing & edge rendering using WebRTC and Python bindings.",
        stargazers_count: 89,
        language: "Python",
        updated_at: new Date(Date.now() - 3600000 * 24).toISOString()
      },
      {
        id: 9903,
        name: "monetizer-bot-dashboard",
        owner: { login: "empire-enterprise" },
        description: "Static single-page application displaying real-time ad placement arbitrage logs.",
        stargazers_count: 53,
        language: "TypeScript",
        updated_at: new Date(Date.now() - 3600000 * 72).toISOString()
      },
      {
        id: 9904,
        name: "legacy-rails-importer",
        owner: { login: "anonymous-dev" },
        description: "Monolithic, unmaintained list parser and active lead validator script.",
        stargazers_count: 12,
        language: "Ruby",
        updated_at: new Date(Date.now() - 3600000 * 400).toISOString()
      }
    ];
    setGithubRepos(demoRepos);
    setGithubToken("simulated_playground_token");
    localStorage.setItem("empire_github_token", "simulated_playground_token");
  };

  const handleAuditRepo = async (owner: string, repoName: string, id: number) => {
    setSyncingRepoId(String(id));
    setSyncProgress(0);
    setSyncLogs([]);

    const logs = [
      `[INFO] Target repository identified: ${owner}/${repoName}`,
      `[INFO] Initializing secure connection to GitHub APIs...`,
      `[INFO] Pulling source code repository contents...`,
      `[INFO] Scanning languages and size metrics...`,
      `[INFO] Inspecting dependency trees and configurations...`,
      `[INFO] Checking manifest files (package.json, requirements.txt, go.mod)...`,
      `[INFO] Evaluating structural architectural compatibility score...`,
      `[SUCCESS] Static code analysis finished. Enterprise metrics synthesized!`
    ];

    let logIndex = 0;
    const interval = setInterval(() => {
      if (logIndex < logs.length) {
        setSyncLogs(prev => [...prev, logs[logIndex]]);
        logIndex++;
      }
    }, 250);

    const progressInterval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      if (githubToken === "simulated_playground_token") {
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        let language: "Go" | "Python" | "TypeScript" | "Node.js" | "Ruby" | "Other" = "Other";
        let framework = "Generic Stack";
        let dependencies = ["std-lib"];
        let status: "working" | "warning" | "broken" = "working";
        let compatibilityScore = 85;
        let recommendation: "KEEP" | "MERGE" | "PLUGIN" | "ARCHIVE" | "DELETE" = "KEEP";

        if (repoName.includes("orchestrator")) {
          language = "Go";
          framework = "Go Modules / Gin Gonic";
          dependencies = ["github.com/gin-gonic/gin", "github.com/redis/go-redis"];
          compatibilityScore = 95;
          status = "working";
          recommendation = "KEEP";
        } else if (repoName.includes("pipelines")) {
          language = "Python";
          framework = "FastAPI Gateway";
          dependencies = ["fastapi", "uvicorn", "webrtc-python", "numpy"];
          compatibilityScore = 91;
          status = "working";
          recommendation = "KEEP";
        } else if (repoName.includes("dashboard")) {
          language = "TypeScript";
          framework = "React + Vite";
          dependencies = ["react", "lucide-react", "recharts", "tailwindcss"];
          compatibilityScore = 89;
          status = "working";
          recommendation = "PLUGIN";
        } else if (repoName.includes("rails")) {
          language = "Ruby";
          framework = "Ruby on Rails v5";
          dependencies = ["nokogiri", "sidekiq", "active_record"];
          compatibilityScore = 48;
          status = "broken";
          recommendation = "DELETE";
        }

        const scores = {
          architecture: Math.floor(65 + Math.random() * 30),
          maintainability: Math.floor(60 + Math.random() * 35),
          scalability: Math.floor(55 + Math.random() * 40),
          performance: Math.floor(70 + Math.random() * 25),
          security: Math.floor(65 + Math.random() * 30),
          techDebt: Math.floor(5 + Math.random() * 50)
        };

        const newProj: ProjectSpec = {
          id: `git_${id}`,
          name: repoName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          purpose: `Imported via GitHub Sync from ${owner}/${repoName}`,
          framework,
          language,
          dependencies,
          database: "PostgreSQL Candidate",
          envVars: ["PORT", "GITHUB_TOKEN_PROXY"],
          apis: ["GET /api/v1/health", "GET /api/v1/meta"],
          aiIntegrations: ["Local Ollama / Gemini Candidate"],
          deployment: "Cloud Run Ready",
          buildSystem: "NPM package.json",
          status,
          compatibilityScore,
          recommendation,
          scores
        };

        setProjects(prev => {
          if (prev.some(p => p.id === newProj.id)) return prev;
          return [newProj, ...prev];
        });
        setSelectedProjectId(newProj.id);

      } else {
        const res = await fetch(`/api/github/audit-repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}&token=${encodeURIComponent(githubToken)}`);
        if (!res.ok) {
          throw new Error(`Failed real-time static audit (status ${res.status})`);
        }
        const data = await res.json();
        if (data.success) {
          await new Promise(resolve => setTimeout(resolve, 2000));

          const newProj = data.projectSpec;
          setProjects(prev => {
            if (prev.some(p => p.id === newProj.id)) return prev;
            return [newProj, ...prev];
          });
          setSelectedProjectId(newProj.id);
        } else {
          throw new Error(data.error || "Failed to parse repository content.");
        }
      }

      clearInterval(progressInterval);
      setSyncProgress(100);
      setSyncLogs(prev => [...prev, `[SUCCESS] Saved project to local registry successfully.`]);
      
      setTimeout(() => {
        setSyncingRepoId(null);
        setInspectorTab("projects");
      }, 1200);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Error during repository audit:", err);
      setSyncLogs(prev => [...prev, `[ERROR] Audit failed: ${err.message || String(err)}`]);
      setSyncProgress(-1);
    }
  };

  // Advisor logic
  const handleRunAdvisor = () => {
    setComputingAdvisor(true);
    setAdvisorReport(null);
    
    setTimeout(() => {
      let localRec = "llama3:8b";
      let localSpeed = "35 tok/sec";
      let localVram = "5.4 GB";
      let cloudRec = "gemini-3.5-flash";
      let justification = "";
      let costEst = "";

      switch(advisorWorkload) {
        case "coding":
          localRec = "deepseek-coder:6.7b";
          localSpeed = "42 tok/sec";
          localVram = "4.8 GB";
          cloudRec = "gemini-3.1-pro-preview";
          justification = "DeepSeek-Coder is highly specialized for structural code reviews. If task has extremely massive multi-file dependencies, route to Gemini 3.1 Pro via local proxy.";
          costEst = "Local: $0.00 / Cloud: $0.0015 per 1k input tokens";
          break;
        case "ocr":
        case "research":
          localRec = "phi3:3.8b (Fast summary)";
          localSpeed = "58 tok/sec";
          localVram = "2.8 GB";
          cloudRec = "gemini-3.5-flash";
          justification = " phi3 is lightning fast for small document sweeps. However, high-volume PDF extraction requires multimodal context window. We advise routing large chunks to Gemini 3.5 Flash because of its unmatched 1M token context capacity.";
          costEst = "Local: $0.00 / Cloud: $0.000075 per 1k tokens";
          break;
        case "writing":
          localRec = "mistral:7b";
          localSpeed = "38 tok/sec";
          localVram = "5.1 GB";
          cloudRec = "gemini-3.5-flash";
          justification = "Mistral-7B provides highly eloquent creative copy. Route to local model first. Resort to Cloud Flash only if high concurrent throughput is required.";
          costEst = "Local: $0.00 / Cloud: $0.00015 per 1k tokens";
          break;
        case "translation":
          localRec = "qwen2.5:7b";
          localSpeed = "36 tok/sec";
          localVram = "5.8 GB";
          cloudRec = "gemini-3.5-flash";
          justification = "Qwen2.5-7B has excellent multilingual dictionary representations. Local-first deployment is highly secure for private translation.";
          costEst = "Local: $0.00 / Cloud: $0.000075 per 1k tokens";
          break;
        case "image_prompt":
        case "video_prompt":
          localRec = "llama3:8b";
          localSpeed = "34 tok/sec";
          localVram = "5.4 GB";
          cloudRec = "veo-3.1-lite-generate-preview";
          justification = "Generating precise scene descriptions matches the broad logical patterns of Llama3:8b. No cloud LLM required. However, the final physical rendering MUST be dispatched to cloud Veo as local consumer hardware lacks multi-GPU cluster capacity.";
          costEst = "Local: $0.00 / Cloud: $0.03 per generated video frame";
          break;
        default:
          localRec = "llama3:8b";
          justification = "Llama3 is our baseline local powerhouse. Highly capable across all standard prompt categories.";
          costEst = "Local: $0.00 / Cloud: negligible";
      }

      setAdvisorReport({
        localModel: localRec,
        localSpeed,
        localVram,
        cloudModel: cloudRec,
        justification,
        costEstimation: costEst,
        decisionRoute: advisorWorkload === "ocr" || advisorWorkload === "research" ? "HYBRID_CLOUD" : "LOCAL_FIRST",
        latencyLocal: "180ms",
        latencyCloud: "410ms",
        architectureSignature: `EMP-ADV-${Math.floor(1000 + Math.random() * 9000)}`
      });
      setComputingAdvisor(false);
    }, 850);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleAnalyzeFile(file.name);
    }
  };

  const handleAnalyzeFile = (fileName: string) => {
    setUploadProgress(0);
    setUploadLogs([]);
    
    const logs = [
      `[INFO] Target identified: ${fileName}`,
      `[INFO] Extracting payload contents...`,
      `[INFO] Deep parsing structural codebase manifests...`,
      `[INFO] Scanning for dependency vulnerabilities...`,
      `[INFO] Parsing API pathways and endpoints...`,
      `[INFO] Detecting hardcoded credentials...`,
      `[SUCCESS] Analysis finished. Enterprise Score compiled.`
    ];

    let currentLogIndex = 0;
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          // Add newly discovered project
          const isPython = fileName.endsWith(".py") || fileName.toLowerCase().includes("python");
          const cleanedName = fileName.replace(".zip", "").replace(".git", "");
          
          const newProj: ProjectSpec = {
            id: `proj_${Math.random().toString(36).substr(2, 9)}`,
            name: cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1),
            purpose: "Newly discovered automated repository scan",
            framework: isPython ? "FastAPI / Pytest" : "Next.js / TypeScript",
            language: isPython ? "Python" : "TypeScript",
            dependencies: isPython ? ["fastapi", "uvicorn", "pydantic"] : ["next", "react", "tailwindcss"],
            database: "SQLite (Auto-resolved)",
            envVars: ["API_KEY_SCAN", "PORT"],
            apis: ["GET /api/v1/health", "POST /api/v1/compute"],
            aiIntegrations: ["Local Ollama"],
            deployment: "Docker Container",
            buildSystem: "NPM / Pip",
            status: "working",
            compatibilityScore: Math.floor(75 + Math.random() * 23),
            recommendation: "KEEP",
            scores: {
              architecture: Math.floor(75 + Math.random() * 20),
              maintainability: Math.floor(70 + Math.random() * 25),
              scalability: Math.floor(65 + Math.random() * 30),
              performance: Math.floor(80 + Math.random() * 18),
              security: Math.floor(75 + Math.random() * 20),
              techDebt: Math.floor(5 + Math.random() * 30)
            }
          };

          setProjects(prevProjects => [newProj, ...prevProjects]);
          setSelectedProjectId(newProj.id);
          setInspectorTab("projects");
          return 100;
        }
        
        // Append logs
        if (currentLogIndex < logs.length && Math.random() > 0.4) {
          setUploadLogs(prevLogs => [...prevLogs, logs[currentLogIndex]]);
          currentLogIndex++;
        }
        
        return prev + 10;
      });
    }, 200);
  };

  const handleGitImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importGitUrl) return;
    const repoName = importProjectName || importGitUrl.split("/").pop() || "Git-Repository";
    handleAnalyzeFile(repoName);
  };

  // Modernization action execution
  const handleSetAction = (projectId: string, action: "KEEP" | "MERGE" | "PLUGIN" | "ARCHIVE" | "DELETE") => {
    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        return { ...p, recommendation: action };
      }
      return p;
    }));
  };

  // Filter projects based on search query
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.framework.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.language.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Recharts radar scoring metrics
  const radarData = [
    { subject: 'Architecture', value: selectedProject.scores.architecture, fullMark: 100 },
    { subject: 'Maintainability', value: selectedProject.scores.maintainability, fullMark: 100 },
    { subject: 'Scalability', value: selectedProject.scores.scalability, fullMark: 100 },
    { subject: 'Performance', value: selectedProject.scores.performance, fullMark: 100 },
    { subject: 'Security', value: selectedProject.scores.security, fullMark: 100 },
    { subject: 'Compatibility', value: selectedProject.compatibilityScore, fullMark: 100 },
  ];

  // Custom node mapping for the Knowledge Graph
  const graphNodes = [
    // Center Core
    { id: "core", label: "Empire Core Link", type: "system", color: "fill-purple-500 stroke-purple-400" },
    // Projects
    ...projects.map(p => ({
      id: p.id,
      label: p.name,
      type: "project",
      color: p.status === "working" 
        ? "fill-emerald-500 stroke-emerald-400" 
        : p.status === "warning" 
          ? "fill-amber-500 stroke-amber-400" 
          : "fill-red-500 stroke-red-400"
    })),
    // AI Models
    { id: "model_ollama", label: "Ollama (Llama3, DeepSeek)", type: "ai", color: "fill-cyan-500 stroke-cyan-400" },
    { id: "model_gemini", label: "Google Gemini Cloud", type: "ai", color: "fill-indigo-500 stroke-indigo-400" },
    // Databases
    { id: "db_postgres", label: "PostgreSQL Database", type: "db", color: "fill-blue-500 stroke-blue-400" },
    { id: "db_sqlite", label: "SQLite DB File", type: "db", color: "fill-slate-500 stroke-slate-400" }
  ];

  const graphLinks = [
    // CrossPost connections
    { source: "proj_crosspost", target: "core" },
    { source: "proj_crosspost", target: "model_ollama" },
    { source: "proj_crosspost", target: "model_gemini" },
    { source: "proj_crosspost", target: "db_sqlite" },
    // StoryForge connections
    { source: "proj_storyforge", target: "core" },
    { source: "proj_storyforge", target: "model_gemini" },
    { source: "proj_storyforge", target: "db_postgres" },
    // Documentary connections
    { source: "proj_documentary", target: "proj_storyforge" },
    { source: "proj_documentary", target: "db_sqlite" },
    // LTX Video connections
    { source: "proj_ltx_video", target: "core" },
    { source: "proj_ltx_video", target: "db_postgres" },
    // Auto poster legacy
    { source: "proj_auto_poster", target: "proj_crosspost" },
    // Boss listers archive
    { source: "proj_boss_listers", target: "db_postgres" }
  ];

  return (
    <div className="space-y-8 animate-fadeIn text-slate-100 font-sans">
      
      {/* Dynamic Header Dashboard */}
      <div className="bg-gradient-to-r from-slate-950 via-zinc-900 to-indigo-950 border-2 border-indigo-950/80 rounded-xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-indigo-950 text-indigo-400 border border-indigo-900 rounded-full">
                EMPIRE INSPECTOR v1.0
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-slate-900 text-slate-300 border border-zinc-800 rounded-full">
                <Shield className="w-3 h-3 text-emerald-400" />
                Active System Sentinel
              </span>
            </div>

            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <FileSearch className="w-8 h-8 text-indigo-400" />
              Empire OS Inspector
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              The permanent AI CTO & Technology Intelligence Platform. Automatically audit, evaluate, duplicate-scan, and map every software repository, cloud pipeline, and model registry inside the Empire OS ecosystem.
            </p>
          </div>

          {/* Core Score Circle display */}
          <div className="flex items-center gap-5 bg-slate-950/80 border border-zinc-850 rounded-xl p-4.5 shrink-0">
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-18 h-18 transform -rotate-90">
                <circle cx="36" cy="36" r="32" className="stroke-zinc-800 fill-none" strokeWidth="6" />
                <circle 
                  cx="36" 
                  cy="36" 
                  r="32" 
                  className="stroke-indigo-500 fill-none transition-all duration-1000" 
                  strokeWidth="6" 
                  strokeDasharray={`${2 * Math.PI * 32}`}
                  strokeDashoffset={`${2 * Math.PI * 32 * (1 - ecosystemScore / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xl font-mono font-black text-white">{ecosystemScore}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[9.5px] font-mono text-slate-500 uppercase tracking-widest block">EMPIRE HEALTH</span>
              <h2 className="text-sm font-bold text-slate-200">Ecosystem Grade</h2>
              <p className="text-[10px] text-emerald-400 font-mono">Optimized & Operational</p>
            </div>
          </div>
        </div>

        {/* Global Inspector Tab selector */}
        <div className="flex gap-2.5 border-t border-zinc-850/60 mt-6 pt-5">
          {[
            { id: "dashboard", label: "Core Telemetry", icon: ChartIcon, color: "text-indigo-400" },
            { id: "projects", label: "Registry & Audits", icon: Layers, color: "text-emerald-400" },
            { id: "graph", label: "Knowledge Graph", icon: Network, color: "text-cyan-400" },
            { id: "advisor", label: "AI Workload Router", icon: Zap, color: "text-amber-400" },
            { id: "duplicates", label: "Duplicate Scanner", icon: Shield, color: "text-red-400" },
            { id: "github", label: "GitHub Sync", icon: GitFork, color: "text-blue-400" }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = inspectorTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setInspectorTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                  active 
                    ? "bg-zinc-850 text-slate-100 border-zinc-700 shadow-md" 
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

      {/* View 1: Core Telemetry Dashboard */}
      {inspectorTab === "dashboard" && (
        <div className="space-y-6">
          
          {/* Main Grid statistics cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <Layers className="w-5 h-5 text-indigo-400 absolute right-4 top-4" />
              <span className="text-[10px] font-mono text-slate-500 uppercase block">Total Inspected</span>
              <h3 className="text-3xl font-mono font-black text-white">{projects.length}</h3>
              <p className="text-[10.5px] text-slate-400">Software repositories registered</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <CheckCircle className="w-5 h-5 text-emerald-400 absolute right-4 top-4" />
              <span className="text-[10px] font-mono text-slate-500 uppercase block">Active Working</span>
              <h3 className="text-3xl font-mono font-black text-white">
                {projects.filter(p => p.status === "working").length}
              </h3>
              <p className="text-[10.5px] text-emerald-400 font-mono">100% Core compatibility</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <AlertTriangle className="w-5 h-5 text-amber-500 absolute right-4 top-4" />
              <span className="text-[10px] font-mono text-slate-500 uppercase block">Audit Flags</span>
              <h3 className="text-3xl font-mono font-black text-white">
                {projects.filter(p => p.status !== "working").length}
              </h3>
              <p className="text-[10.5px] text-amber-500 font-mono">Requires modernization tasks</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <DollarSign className="w-5 h-5 text-cyan-400 absolute right-4 top-4" />
              <span className="text-[10px] font-mono text-slate-500 uppercase block">AI Cost Sweep</span>
              <h3 className="text-3xl font-mono font-black text-white">$24.80/day</h3>
              <p className="text-[10.5px] text-slate-400">92% saved via Ollama local-first</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Drag & Drop Import System */}
            <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
              <div className="border-b border-zinc-850 pb-3">
                <h3 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight">
                  Import & Scrape Repository
                </h3>
                <p className="text-[11px] text-slate-500">
                  Drop files, directories, or register external links to run automated CTO audits.
                </p>
              </div>

              {/* Drag Area */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center space-y-3 transition cursor-pointer ${
                  dragActive 
                    ? "border-indigo-500 bg-indigo-950/20" 
                    : uploadProgress >= 0 
                      ? "border-emerald-500/50 bg-slate-950/40"
                      : "border-zinc-800 hover:border-zinc-700 bg-slate-950/40"
                }`}
                onClick={() => {
                  if (uploadProgress === -1 || uploadProgress === 100) {
                    handleAnalyzeFile("project-archive.zip");
                  }
                }}
              >
                {uploadProgress === -1 ? (
                  <>
                    <Upload className="w-10 h-10 text-slate-500 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-300">Drag & Drop ZIP or Repository Folder here</p>
                      <p className="text-[10px] text-slate-500">or click to simulate scanning a local directory</p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Analyzing structures...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                      <div 
                        className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full transition-all duration-200" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Git import panel */}
              <form onSubmit={handleGitImport} className="space-y-3 bg-slate-950 border border-zinc-850 rounded-lg p-3.5">
                <span className="text-[9px] font-mono text-slate-400 uppercase font-bold tracking-wider block">
                  Git URI Repository Import
                </span>
                
                <div className="space-y-2">
                  <input
                    type="text"
                    value={importProjectName}
                    onChange={(e) => setImportProjectName(e.target.value)}
                    placeholder="Project Name (e.g. Documentary-Stitcher)"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 text-xs text-slate-200 font-mono focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={importGitUrl}
                      onChange={(e) => setImportGitUrl(e.target.value)}
                      placeholder="https://github.com/empire/repo.git"
                      className="bg-zinc-900 border border-zinc-800 rounded p-1.5 text-xs text-slate-200 font-mono grow focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-indigo-950 border border-indigo-800 hover:bg-indigo-900 text-indigo-300 px-3.5 rounded text-xs font-mono font-bold transition cursor-pointer"
                    >
                      CLONE
                    </button>
                  </div>
                </div>
              </form>

              {/* Simulated Logs Terminal */}
              {uploadLogs.length > 0 && (
                <div className="bg-slate-950 border border-zinc-850 rounded-lg p-3 space-y-1.5 max-h-[160px] overflow-y-auto font-mono text-[9px] text-slate-350 leading-relaxed">
                  <div className="text-slate-500 border-b border-zinc-900 pb-1 flex justify-between">
                    <span>SENTINEL TELEMETRY LOGS</span>
                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                  </div>
                  {uploadLogs.map((log, idx) => (
                    <div key={idx} className={log.includes("[SUCCESS]") ? "text-emerald-400" : ""}>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Technical Health & Recommendation Ledger */}
            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-zinc-850 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight">
                    CTO Action Ledger
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Enterprise status and modernization path for each software system.
                  </p>
                </div>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-950 border border-zinc-850 px-2 py-0.5 rounded">
                  {projects.length} Total Systems
                </span>
              </div>

              {/* Projects scroller */}
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {projects.map((proj) => {
                  const score = proj.compatibilityScore;
                  const scoreColor = score >= 90 ? "text-emerald-400 border-emerald-950 bg-emerald-950/20" : score >= 70 ? "text-amber-400 border-amber-950 bg-amber-950/20" : "text-red-400 border-red-950/20 bg-red-950/20";
                  
                  return (
                    <div 
                      key={proj.id} 
                      className="bg-slate-950 border border-zinc-850 rounded-lg p-4 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center hover:border-zinc-750 transition"
                    >
                      <div className="space-y-1 grow">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black text-white">{proj.name}</span>
                          <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${scoreColor}`}>
                            Empire: {score}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 max-w-md line-clamp-1">{proj.purpose}</p>
                        <div className="flex gap-2 text-[10px] font-mono text-slate-500">
                          <span>Framework: {proj.framework}</span>
                          <span>•</span>
                          <span className="text-slate-400 font-bold">{proj.language}</span>
                        </div>
                      </div>

                      {/* Action trigger dropdown/selectors */}
                      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-between md:justify-end border-t border-zinc-900 md:border-t-0 pt-2.5 md:pt-0">
                        <span className="text-[9.5px] font-mono text-slate-500 block md:hidden">Action Rule:</span>
                        <div className="flex gap-1">
                          {(["KEEP", "MERGE", "PLUGIN", "ARCHIVE", "DELETE"] as const).map((action) => {
                            const isSelected = proj.recommendation === action;
                            const colors = {
                              KEEP: isSelected ? "bg-emerald-950 text-emerald-400 border-emerald-800" : "text-slate-500 hover:text-slate-350 bg-transparent border-transparent",
                              MERGE: isSelected ? "bg-indigo-950 text-indigo-400 border-indigo-800" : "text-slate-500 hover:text-slate-350 bg-transparent border-transparent",
                              PLUGIN: isSelected ? "bg-cyan-950 text-cyan-400 border-cyan-800" : "text-slate-500 hover:text-slate-350 bg-transparent border-transparent",
                              ARCHIVE: isSelected ? "bg-amber-950 text-amber-400 border-amber-800" : "text-slate-500 hover:text-slate-350 bg-transparent border-transparent",
                              DELETE: isSelected ? "bg-red-950 text-red-400 border-red-800" : "text-slate-500 hover:text-slate-350 bg-transparent border-transparent",
                            };
                            return (
                              <button
                                key={action}
                                onClick={() => handleSetAction(proj.id, action)}
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border rounded-sm transition cursor-pointer ${colors[action]}`}
                              >
                                {action}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* View 2: Registry & Deep Audits */}
      {inspectorTab === "projects" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Projects panel list selector */}
          <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4.5 space-y-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-extrabold text-indigo-400 uppercase tracking-wider block">
                INSPECTED PROJECTS LIST
              </span>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by name, database, stack..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-zinc-850 rounded p-1.5 pl-8 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredProjects.map((proj) => {
                const isActive = proj.id === selectedProjectId;
                return (
                  <button
                    key={proj.id}
                    onClick={() => setSelectedProjectId(proj.id)}
                    className={`w-full text-left p-3.5 rounded-lg border transition-all duration-150 flex justify-between items-center cursor-pointer ${
                      isActive 
                        ? "bg-slate-950 border-indigo-500/50 shadow-md" 
                        : "bg-slate-950/40 border-zinc-850 hover:bg-slate-950 hover:border-zinc-800"
                    }`}
                  >
                    <div className="space-y-1 grow min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-black text-white truncate block">
                          {proj.name}
                        </span>
                        {proj.status === "broken" && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        {proj.status === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                      <span className="text-[9.5px] font-mono text-slate-500 block uppercase">
                        {proj.language} • {proj.framework.split(",")[0]}
                      </span>
                    </div>

                    <ChevronRight className={`w-4 h-4 transition ${isActive ? "text-indigo-400 translate-x-1" : "text-slate-600"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deep inspection audit metrics report */}
          <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-6">
            
            {/* Project summary header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-zinc-850 pb-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-mono font-black text-white">
                    {selectedProject.name}
                  </h2>
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                    selectedProject.status === "working" 
                      ? "text-emerald-400 bg-emerald-950/20 border-emerald-900/30" 
                      : selectedProject.status === "warning"
                        ? "text-amber-400 bg-amber-950/20 border-amber-900/30"
                        : "text-red-400 bg-red-950/20 border-red-900/30"
                  }`}>
                    {selectedProject.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {selectedProject.purpose}
                </p>
              </div>

              <div className="flex gap-2">
                <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2.5 py-1.5 rounded border border-zinc-850">
                  ACTION: <strong className="text-indigo-400 font-extrabold">{selectedProject.recommendation}</strong>
                </span>
              </div>
            </div>

            {/* Radar chart of technical metrics + list specifications side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Left specifications */}
              <div className="md:col-span-5 space-y-4">
                <span className="text-[9.5px] font-mono font-black text-indigo-400 uppercase tracking-wider block">
                  TECHNICAL SPEC REGISTRY
                </span>

                <div className="bg-slate-950 border border-zinc-850 rounded-lg p-3 space-y-3 font-mono text-xs text-slate-300">
                  <div>
                    <span className="text-slate-500 text-[9px] uppercase block">Language & Runtime</span>
                    <span className="font-bold text-slate-200">{selectedProject.language}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[9px] uppercase block">Database Layer</span>
                    <span className="font-bold text-slate-200">{selectedProject.database}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[9px] uppercase block">Build System</span>
                    <span className="font-bold text-slate-200">{selectedProject.buildSystem}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[9px] uppercase block">Deployment Topology</span>
                    <span className="font-bold text-slate-200">{selectedProject.deployment}</span>
                  </div>
                </div>
              </div>

              {/* Right Radar metrics chart */}
              <div className="md:col-span-7 bg-slate-950/40 border border-zinc-850/60 rounded-xl p-2.5 flex items-center justify-center min-h-[220px]">
                <ResponsiveContainer width="100%" height={210}>
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="subject" stroke="#9ca3af" fontSize={10} />
                    <PolarRadiusAxis stroke="#374151" angle={30} domain={[0, 100]} fontSize={8} />
                    <Radar name={selectedProject.name} dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

            </div>

            {/* In-depth Modernization and Architecture audit report tabs */}
            <div className="space-y-4 pt-2">
              <span className="text-[10px] font-mono font-black text-indigo-400 uppercase tracking-wider block border-b border-zinc-850 pb-2">
                CTO ENTERPRISE REPORT
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Architecture report card */}
                <div className="bg-slate-950 border border-zinc-850 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-white font-mono font-black text-xs">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Architecture & Scalability</span>
                  </div>
                  
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                    {selectedProject.status === "working" 
                      ? "Modern design compliant with modern modular patterns. Micro-components encapsulate individual processing workflows with minimum direct side-effects. Scaling capacity is highly elastic using stateless containers."
                      : "Monolithic, tightly-coupled legacy module with high system side-effects. High dependency locking impedes scalable distributed deployments. We highly recommend extracting database logic to shared Postgres clusters."
                    }
                  </p>
                </div>

                {/* AI integration advisor */}
                <div className="bg-slate-950 border border-zinc-850 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-white font-mono font-black text-xs">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>AI Integrations & Prompts</span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                    {selectedProject.aiIntegrations.length > 0 
                      ? `Integrates standard cloud APIs including [${selectedProject.aiIntegrations.join(", ")}]. For massive cost optimizations, run routine validations on local Ollama models (e.g. DeepSeek-coder/Mistral).`
                      : "Currently zero active AI integration structures detected inside the repository manifests. Adopting local LLM modules could automate lead validations or scraping checks."
                    }
                  </p>
                </div>

              </div>

              {/* Modernization Roadmap timeline */}
              <div className="bg-slate-950 border border-zinc-850 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                  <div className="flex items-center gap-1.5 text-white font-mono font-black text-xs">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span>Modernization Roadmap Actions</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase font-black">
                    RECOMMENDED DECISION: {selectedProject.recommendation}
                  </span>
                </div>

                <div className="space-y-2.5 font-sans text-xs text-slate-400">
                  <div className="flex gap-3">
                    <span className="font-mono font-black text-indigo-400 text-[10px] uppercase shrink-0 min-w-[50px]">Phase 1</span>
                    <p>
                      {selectedProject.recommendation === "KEEP" 
                        ? "Ensure environment variable safety. Migrate any direct client-side keys into secure backend process configurations." 
                        : selectedProject.recommendation === "MERGE"
                          ? "Consolidate render routines and directory structures into shared repository. Deprecate separate celery configs."
                          : "Extract specific scene interpolation endpoints and deploy as lightweight independent edge micro-workers."
                      }
                    </p>
                  </div>
                  <div className="flex gap-3 border-t border-zinc-900 pt-2">
                    <span className="font-mono font-black text-indigo-400 text-[10px] uppercase shrink-0 min-w-[50px]">Phase 2</span>
                    <p>
                      {selectedProject.recommendation === "KEEP" 
                        ? "Establish persistent heartbeat webhooks with Empire OS Core linker framework."
                        : "Migrate flat-file SQLite databases to secure PostgreSQL schemas to allow relational data querying."
                      }
                    </p>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* View 3: Empire Knowledge Graph */}
      {inspectorTab === "graph" && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
                Empire OS Knowledge Graph (Live Topology)
              </h3>
              <p className="text-xs text-slate-500">
                Visual relationships mapping software entities, shared micro-plugins, databases, and AI routing pathways. Click any node to review specs.
              </p>
            </div>

            {/* Visual SVG Network Representation */}
            <div className="bg-slate-950 border border-zinc-850 rounded-xl overflow-hidden relative h-[440px] flex items-center justify-center">
              
              {/* Dynamic Information HUD */}
              <div className="absolute top-4 left-4 bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-lg max-w-[280px] space-y-2 select-text shadow-lg">
                <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest block">
                  NETWORK HUD INSPECTOR
                </span>
                
                {selectedGraphNode ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono font-bold text-white uppercase">
                      {selectedGraphNode}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Connected successfully. Sub-systems communicate via stateless REST JSON / Websocket signals over private loopback tunnels.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    Click any node inside the structural graph canvas to audit active network couplings.
                  </p>
                )}
              </div>

              {/* Legend overlay */}
              <div className="absolute bottom-4 right-4 bg-zinc-900/95 border border-zinc-800 px-3 py-2 rounded font-mono text-[9px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Operational Projects</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  <span>Cloud API Infrastructure</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                  <span>Ollama Local Nodes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span>Ecosystem Databases</span>
                </div>
              </div>

              {/* SVG Link lines and Nodes */}
              <svg className="w-full h-full select-none" viewBox="0 0 800 400">
                {/* SVG Links */}
                <g stroke="#1e293b" strokeWidth="2" strokeDasharray="4 4">
                  <line x1="400" y1="200" x2="200" y2="100" />
                  <line x1="400" y1="200" x2="600" y2="100" />
                  <line x1="400" y1="200" x2="200" y2="300" />
                  <line x1="400" y1="200" x2="600" y2="300" />
                  <line x1="400" y1="200" x2="100" y2="200" />
                  <line x1="400" y1="200" x2="700" y2="200" />
                  <line x1="200" y1="100" x2="300" y2="60" />
                  <line x1="600" y1="100" x2="500" y2="60" />
                </g>

                {/* SVG Nodes group */}
                {/* Center Core */}
                <g transform="translate(400, 200)" className="cursor-pointer group" onClick={() => setSelectedGraphNode("Empire Core Bus")}>
                  <circle r="22" className="fill-purple-600 stroke-purple-400 stroke-2 hover:fill-purple-500 transition-all duration-150" />
                  <text dy="4" className="fill-white font-mono font-black text-[9.5px]" textAnchor="middle">CORE</text>
                </g>

                {/* Node 1: CrossPost */}
                <g transform="translate(200, 100)" className="cursor-pointer" onClick={() => setSelectedGraphNode("CrossPost Enterprise (operational)")}>
                  <circle r="16" className="fill-emerald-600 stroke-emerald-400 stroke-2" />
                  <text dy="-22" className="fill-slate-300 font-mono text-[9px]" textAnchor="middle">CrossPost</text>
                </g>

                {/* Node 2: StoryForge */}
                <g transform="translate(600, 100)" className="cursor-pointer" onClick={() => setSelectedGraphNode("StoryForge Engine (operational)")}>
                  <circle r="16" className="fill-emerald-600 stroke-emerald-400 stroke-2" />
                  <text dy="-22" className="fill-slate-300 font-mono text-[9px]" textAnchor="middle">StoryForge</text>
                </g>

                {/* Node 3: Documentary */}
                <g transform="translate(200, 300)" className="cursor-pointer" onClick={() => setSelectedGraphNode("Documentary Factory (merge pending)")}>
                  <circle r="16" className="fill-amber-600 stroke-amber-400 stroke-2" />
                  <text dy="26" className="fill-slate-300 font-mono text-[9px]" textAnchor="middle">Documentary</text>
                </g>

                {/* Node 4: LTX Video */}
                <g transform="translate(600, 300)" className="cursor-pointer" onClick={() => setSelectedGraphNode("LTX Video Engine (active plugin)")}>
                  <circle r="16" className="fill-emerald-600 stroke-emerald-400 stroke-2" />
                  <text dy="26" className="fill-slate-300 font-mono text-[9px]" textAnchor="middle">LTX Video</text>
                </g>

                {/* Node 5: Auto Poster legacy */}
                <g transform="translate(100, 200)" className="cursor-pointer" onClick={() => setSelectedGraphNode("Auto Poster Bot (broken - flagged for deletion)")}>
                  <circle r="16" className="fill-red-600 stroke-red-400 stroke-2" />
                  <text dy="26" className="fill-slate-300 font-mono text-[9px]" textAnchor="middle">Auto Poster</text>
                </g>

                {/* Node 6: Cloud Gemini */}
                <g transform="translate(300, 60)" className="cursor-pointer" onClick={() => setSelectedGraphNode("Google Gemini Pro / Flash Cloud APIs")}>
                  <circle r="14" className="fill-indigo-600 stroke-indigo-400 stroke-2" />
                  <text dy="-20" className="fill-indigo-300 font-mono text-[9px]" textAnchor="middle">Gemini Cloud</text>
                </g>

                {/* Node 7: Ollama */}
                <g transform="translate(500, 60)" className="cursor-pointer" onClick={() => setSelectedGraphNode("Ollama Local model workstation host")}>
                  <circle r="14" className="fill-cyan-600 stroke-cyan-400 stroke-2" />
                  <text dy="-20" className="fill-cyan-300 font-mono text-[9px]" textAnchor="middle">Ollama Host</text>
                </g>

                {/* Node 8: PostgreSQL */}
                <g transform="translate(700, 200)" className="cursor-pointer" onClick={() => setSelectedGraphNode("PostgreSQL (Drizzle schema migrations active)")}>
                  <circle r="14" className="fill-blue-600 stroke-blue-400 stroke-2" />
                  <text dy="-20" className="fill-blue-300 font-mono text-[9px]" textAnchor="middle">PostgreSQL</text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* View 4: AI Workload Router */}
      {inspectorTab === "advisor" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Workload definition form */}
          <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="border-b border-zinc-850 pb-3">
              <h3 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight">
                AI Cognitive Routing Advisor
              </h3>
              <p className="text-[11px] text-slate-500">
                Describe your development workflow task to calculate optimal local-first LLM pathways and cloud fallback bounds.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9.5px] font-mono text-slate-400 font-bold uppercase block">Workload Type</label>
                <select
                  value={advisorWorkload}
                  onChange={(e) => setAdvisorWorkload(e.target.value as any)}
                  className="w-full bg-slate-950 border border-zinc-800 text-xs font-mono rounded p-2.5 text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="coding">Coding & Code Reviews</option>
                  <option value="research">High Volume Document Summary</option>
                  <option value="writing">Creative Prose / Marketing Copy</option>
                  <option value="ocr">Text Extraction (OCR)</option>
                  <option value="video_prompt">Scene-to-Video Prompts</option>
                  <option value="image_prompt">Aesthetic Style Description</option>
                  <option value="marketing">SEO & Organic Strategy</option>
                  <option value="translation">Multilingual Translation</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9.5px] font-mono text-slate-400 font-bold uppercase block">Task Description</label>
                <textarea
                  value={advisorTask}
                  onChange={(e) => setAdvisorTask(e.target.value)}
                  rows={4}
                  placeholder="Review schema definitions..."
                  className="w-full bg-slate-950 border border-zinc-800 text-xs font-sans rounded p-3 text-slate-200 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                  required
                />
              </div>

              <button
                onClick={handleRunAdvisor}
                disabled={computingAdvisor || !advisorTask.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-slate-950 font-mono text-xs font-black uppercase tracking-wider py-3 rounded-lg transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {computingAdvisor ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>COMPUTING PATHWAYS...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current text-white" />
                    <span className="text-white">CALCULATE OPTIMAL ROUTE</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Advisory Report outcome */}
          <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <span className="text-xs font-mono font-black text-slate-200 uppercase">
                CTO Routing Recommendation
              </span>
              {advisorReport && (
                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950 px-2 rounded font-bold uppercase">
                  {advisorReport.decisionRoute}
                </span>
              )}
            </div>

            {computingAdvisor && (
              <div className="text-center py-20 text-slate-500 font-mono">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-400" />
                <span>Scanning local hardware capabilities & LLM latency matrices...</span>
              </div>
            )}

            {!computingAdvisor && advisorReport && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Advisor split local vs cloud */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Local route */}
                  <div className="bg-slate-950 border border-zinc-850 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                        LOCAL OFFLINE FIRST
                      </span>
                      <span className="text-[8.5px] bg-cyan-950 text-cyan-300 border border-cyan-900 px-1.5 py-0.5 rounded font-black">
                        COST: $0.00
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-mono font-black text-white">
                        {advisorReport.localModel}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Workstation evaluation pathway. Hardware requirement: {advisorReport.localVram} VRAM.
                      </p>
                    </div>

                    <div className="text-[9.5px] font-mono text-slate-500 flex justify-between">
                      <span>SPEED: {advisorReport.localSpeed}</span>
                      <span>LATENCY: {advisorReport.latencyLocal}</span>
                    </div>
                  </div>

                  {/* Cloud route */}
                  <div className="bg-slate-950 border border-zinc-850 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase">
                        CLOUD ENTERPRISE COG
                      </span>
                      <span className="text-[8.5px] bg-indigo-950 text-indigo-300 border border-indigo-900 px-1.5 py-0.5 rounded font-black">
                        SECURE HTTPS
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-mono font-black text-white">
                        {advisorReport.cloudModel}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Dispatched when local context limits or processing power bounds are exceeded.
                      </p>
                    </div>

                    <div className="text-[9.5px] font-mono text-slate-500 flex justify-between">
                      <span>ESTIMATED: {advisorReport.costEstimation.split("/")[1]}</span>
                      <span>LATENCY: {advisorReport.latencyCloud}</span>
                    </div>
                  </div>

                </div>

                {/* Justification summary text */}
                <div className="bg-slate-950 border border-zinc-850 rounded-lg p-4 space-y-2">
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">
                    ARCHITECTURAL JUSTIFICATION
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-slate-300">
                    "{advisorReport.justification}"
                  </p>
                </div>

                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-2 border-t border-zinc-900">
                  <span>SIGNATURE ID: {advisorReport.architectureSignature}</span>
                  <span>Evaluated against workstation RT Core statistics</span>
                </div>

              </div>
            )}
          </div>

        </div>
      )}

      {/* View 5: Duplicate Scanner Panel */}
      {inspectorTab === "duplicates" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
          <div className="border-b border-zinc-850 pb-3 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
                Duplicate Code & API Detector
              </h3>
              <p className="text-xs text-slate-500">
                Redundant components, overlapping scraper configurations, and repetitive logic blocks marked for consolidation.
              </p>
            </div>
            <span className="text-[9px] font-mono text-red-400 bg-red-950/20 border border-red-900/30 px-2.5 py-1 rounded font-black uppercase">
              4 Redundant Blocks Flagged
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {duplicates.map((dup) => (
              <div key={dup.id} className="bg-slate-950 border border-zinc-850 rounded-lg p-4 space-y-3 hover:border-red-900/30 transition">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950 px-1.5 py-0.5 rounded uppercase">
                      {dup.type}
                    </span>
                    <h4 className="text-xs font-mono font-black text-slate-200">
                      {dup.title}
                    </h4>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500">{dup.id}</span>
                </div>

                <div className="space-y-1.5 font-mono text-[10.5px]">
                  <div className="text-slate-400">
                    <span className="text-slate-650 block text-[9px] uppercase font-bold text-slate-600">Location A:</span>
                    {dup.locationA}
                  </div>
                  <div className="text-slate-400 border-t border-zinc-950 pt-1">
                    <span className="text-slate-650 block text-[9px] uppercase font-bold text-slate-600">Location B:</span>
                    {dup.locationB}
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  {dup.description}
                </p>

                <div className="bg-zinc-900/60 border border-zinc-850 p-2.5 rounded font-mono text-[9.5px] text-emerald-400 flex justify-between">
                  <span>CONSOLIDATION GAIN:</span>
                  <span className="font-bold">{dup.savingImpact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View 6: GitHub Sync Panel */}
      {inspectorTab === "github" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5 animate-fade-in">
          <div className="border-b border-zinc-850 pb-3 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-2">
                <GitFork className="w-4 h-4 text-blue-400" />
                VCS Enterprise Synchronizer
              </h3>
              <p className="text-xs text-slate-500">
                Securely authenticate with GitHub, pull repository configurations, and automatically audit project metadata.
              </p>
            </div>
            
            {githubToken && (
              <button
                onClick={handleDisconnectGitHub}
                className="text-[10px] font-mono font-bold text-red-400 hover:text-red-300 bg-red-950/20 border border-red-900/30 px-3 py-1 rounded cursor-pointer transition"
              >
                DISCONNECT CHANNEL
              </button>
            )}
          </div>

          {!githubToken ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Connection gateway */}
              <div className="lg:col-span-5 bg-slate-950/40 border border-zinc-850 rounded-lg p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-950/30 border border-blue-900/30 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-blue-400" />
                  </div>
                  <h4 className="text-xs font-mono font-black text-slate-200 uppercase">Connect to GitHub Channel</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Empire OS uses popup-based OAuth authorization to securely connect to your GitHub account and synchronize code repositories.
                  </p>
                  
                  {githubError && (
                    <div className="bg-red-950/20 border border-red-900/30 p-3 rounded text-[11px] text-red-400 font-mono flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{githubError}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 pt-4">
                  {githubConfigured ? (
                    <button
                      onClick={handleConnectGitHub}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-mono text-[10.5px] font-bold uppercase tracking-wider py-2.5 px-4 rounded-md cursor-pointer shadow transition"
                    >
                      <GitFork className="w-4 h-4" />
                      Authenticate via GitHub OAuth
                    </button>
                  ) : (
                    <div className="bg-amber-950/10 border border-amber-900/20 p-3 rounded text-[10.5px] text-amber-400 font-mono space-y-1">
                      <p className="font-bold uppercase flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        OAuth Keys Not Detected
                      </p>
                      <p className="text-slate-500 text-[10px]">
                        Server environment variables GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are missing. Using PAT or Sandbox mode is recommended.
                      </p>
                    </div>
                  )}

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-zinc-850"></div>
                    <span className="flex-shrink mx-4 text-slate-650 font-mono text-[9px] uppercase">Or</span>
                    <div className="flex-grow border-t border-zinc-850"></div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9.5px] font-mono font-bold text-slate-500 uppercase block">Connect with Personal Access Token</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="github_pat_..."
                        value={customToken}
                        onChange={(e) => setCustomToken(e.target.value)}
                        className="bg-zinc-950 border border-zinc-850 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-750 flex-grow focus:outline-none focus:border-zinc-700"
                      />
                      <button
                        onClick={() => {
                          if (customToken.trim()) {
                            setGithubToken(customToken.trim());
                            localStorage.setItem("empire_github_token", customToken.trim());
                            handleFetchRepos(customToken.trim());
                          }
                        }}
                        className="bg-zinc-800 hover:bg-zinc-750 text-slate-200 border border-zinc-700 font-mono text-[10px] font-bold uppercase tracking-wider px-3 rounded cursor-pointer transition"
                      >
                        Submit
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handlePlaygroundDemo}
                    className="w-full flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-850 text-slate-300 border border-zinc-800 font-mono text-[10px] font-bold uppercase tracking-wider py-2 px-4 rounded-md cursor-pointer transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Enter Playground Demo Mode (Sandbox)
                  </button>
                </div>
              </div>

              {/* Documentation / Guidance */}
              <div className="lg:col-span-7 bg-slate-950/20 border border-zinc-850 rounded-lg p-5 space-y-4 font-mono text-xs">
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-zinc-500" />
                  GitHub Integration Setup & Parameters
                </h4>
                
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  To activate real OAuth handshakes, register a standard OAuth application in your GitHub account and declare its credentials.
                </p>

                <div className="bg-slate-950 border border-zinc-900 rounded p-3 space-y-2.5 text-[10.5px]">
                  <div className="space-y-0.5">
                    <span className="text-slate-500 text-[9px] uppercase block font-bold">1. Homepage URL</span>
                    <div className="flex items-center justify-between gap-2 bg-zinc-900 px-2 py-1 rounded">
                      <span className="text-slate-300 select-all truncate">{window.location.origin}</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(window.location.origin)}
                        className="text-slate-500 hover:text-slate-300"
                        title="Copy"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-slate-500 text-[9px] uppercase block font-bold">2. Authorization Callback URL</span>
                    <div className="flex items-center justify-between gap-2 bg-zinc-900 px-2 py-1 rounded">
                      <span className="text-slate-300 select-all truncate">{`${window.location.origin}/auth/github/callback`}</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/auth/github/callback`)}
                        className="text-slate-500 hover:text-slate-300"
                        title="Copy"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-[11px]">
                  <p className="font-bold text-slate-300 uppercase text-[10px]">Setup Checklist:</p>
                  <ul className="space-y-1.5 text-slate-400 list-disc pl-4">
                    <li>Navigate to <span className="text-blue-400">GitHub Settings</span> &gt; <span className="text-blue-400">Developer Settings</span> &gt; <span className="text-blue-400">OAuth Apps</span></li>
                    <li>Click <span className="text-slate-200 font-bold">Register a new application</span></li>
                    <li>Paste the Homepage and Callback URLs displayed above</li>
                    <li>Generate a Client Secret and copy both values</li>
                    <li>Configure them in your AI Studio environment secrets or as environment variables</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Connected Banner */}
              <div className="bg-blue-950/10 border border-blue-900/30 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3 font-mono">
                  <div className="w-9 h-9 rounded bg-blue-950/40 border border-blue-800/40 flex items-center justify-center">
                    <GitFork className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-200 uppercase">CHANNEL OPERATIONAL</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Connected via {githubToken === "simulated_playground_token" ? "Playground Sandbox" : "Secure OAuth Link"}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 font-mono text-[10px]">
                  <div className="text-right">
                    <span className="text-slate-500 uppercase block text-[9px]">VCS NETWORK</span>
                    <span className="text-blue-400 font-bold">api.github.com</span>
                  </div>
                  <div className="border-l border-zinc-800 h-6"></div>
                  <div className="text-right">
                    <span className="text-slate-500 uppercase block text-[9px]">REGISTRY CAPACITY</span>
                    <span className="text-slate-300 font-bold">{githubRepos.length} Repositories</span>
                  </div>
                </div>
              </div>

              {/* Repositories display / sync console */}
              {syncingRepoId ? (
                <div className="bg-slate-950 border border-zinc-850 rounded-lg p-5 space-y-4">
                  <div className="flex justify-between items-center font-mono">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400 animate-pulse" />
                      <span className="text-xs font-bold text-slate-200">STATIC INGESTION & AUDITING TERMINAL</span>
                    </div>
                    <span className="text-xs text-indigo-400 font-bold">{syncProgress}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-850">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${Math.max(syncProgress, 0)}%` }}
                    />
                  </div>

                  {/* Logs */}
                  <div className="bg-zinc-950 border border-zinc-900 rounded p-4 h-48 font-mono text-[10.5px] text-zinc-400 overflow-y-auto space-y-1 select-text scrollbar-thin">
                    {syncLogs.map((log, i) => (
                      <div 
                        key={i} 
                        className={
                          log.startsWith("[ERROR]") ? "text-red-400" 
                          : log.startsWith("[SUCCESS]") ? "text-emerald-400" 
                          : log.startsWith("[INFO]") ? "text-slate-400" 
                          : "text-zinc-500"
                        }
                      >
                        {log}
                      </div>
                    ))}
                    <div className="animate-pulse inline-block w-2 h-3.5 bg-zinc-650 ml-1">_</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
                    <div className="relative w-full sm:max-w-xs">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search VCS repositories..."
                        value={repoSearchQuery}
                        onChange={(e) => setRepoSearchQuery(e.target.value)}
                        className="bg-zinc-950 border border-zinc-850 rounded-lg pl-9 pr-4 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-700 w-full focus:outline-none focus:border-zinc-700"
                      />
                    </div>
                    
                    <button
                      onClick={() => handleFetchRepos(githubToken)}
                      disabled={fetchingRepos}
                      className="text-[10px] font-mono font-bold text-slate-300 hover:text-slate-100 bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${fetchingRepos ? "animate-spin" : ""}`} />
                      SYNC REFRESH
                    </button>
                  </div>

                  {fetchingRepos ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                      <p className="text-xs font-mono text-slate-500">Querying repository catalogs from VCS network...</p>
                    </div>
                  ) : (
                    <>
                      {githubRepos.length === 0 ? (
                        <div className="bg-slate-950/40 border border-dashed border-zinc-850 rounded-lg p-8 text-center space-y-2">
                          <GitFork className="w-8 h-8 text-slate-650 mx-auto" />
                          <p className="text-xs font-mono text-slate-400">No repositories found in this account.</p>
                          <p className="text-[11px] text-slate-600">Create repositories on GitHub or join an organization to import.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {githubRepos
                            .filter(repo => repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()))
                            .map((repo) => (
                              <div 
                                key={repo.id} 
                                className="bg-zinc-950/60 border border-zinc-850 rounded-lg p-4 space-y-3 flex flex-col justify-between hover:border-zinc-750 transition"
                              >
                                <div className="space-y-1.5">
                                  <div className="flex justify-between items-start gap-2">
                                    <h4 className="text-xs font-mono font-black text-slate-200 truncate" title={repo.name}>
                                      {repo.name}
                                    </h4>
                                    <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-950/40 border border-blue-900/30 px-1.5 py-0.5 rounded shrink-0">
                                      {repo.language || "Config"}
                                    </span>
                                  </div>
                                  
                                  <p className="text-[11px] text-slate-400 line-clamp-2 h-8 leading-relaxed">
                                    {repo.description || "No description provided."}
                                  </p>
                                </div>

                                <div className="border-t border-zinc-900/80 pt-3 flex justify-between items-center font-mono text-[10px]">
                                  <div className="flex items-center gap-3 text-slate-500">
                                    <span className="flex items-center gap-1">
                                      <Sparkles className="w-3.5 h-3.5 text-amber-500/80" />
                                      {repo.stargazers_count || 0}
                                    </span>
                                    <span>•</span>
                                    <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                                  </div>

                                  <button
                                    onClick={() => handleAuditRepo(repo.owner?.login || "user", repo.name, repo.id)}
                                    className="bg-blue-650 hover:bg-blue-600 text-white border border-blue-500/40 text-[9.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded cursor-pointer transition flex items-center gap-1 animate-pulse-subtle"
                                  >
                                    <FileSearch className="w-3 h-3" />
                                    Audit & Sync
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
