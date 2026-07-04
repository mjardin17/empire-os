import React, { useState, useEffect } from "react";
import { 
  Video, Sparkles, RefreshCw, Layers, FileText, Play, Mic, Film, Cpu, 
  MessageSquare, Image as ImageIcon, Globe, CheckCircle, AlertTriangle, 
  ArrowRight, PlayCircle, Download, Copy, Check, ChevronRight, CornerDownRight, 
  RotateCcw, Sliders, Volume2, Trash2, Edit3, Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PipelineStep {
  id: string;
  name: string;
  description: string;
  status: "idle" | "running" | "completed" | "failed";
  outputFile?: string;
  duration?: string;
  error?: string;
  category: "research" | "script" | "media" | "assembly" | "publishing";
}

interface VideoProject {
  id: string;
  topic: string;
  status: "idle" | "running" | "completed" | "failed";
  currentStepIndex: number;
  steps: PipelineStep[];
  assets: {
    research?: string;
    outline?: { title: string; acts: { title: string; focus: string }[] };
    script?: string;
    scenePrompts?: { scene: number; visual: string; audio: string; prompt: string }[];
    narrationText?: string;
    narrationDuration?: number;
    videoClips?: { id: number; path: string; status: string; prompt: string }[];
    subtitles?: string;
    thumbnailUrl?: string;
    title?: string;
    description?: string;
    tags?: string[];
  };
}

interface VideoCreatorProps {
  onHandToCrossPost: (script: string, metadata: { title: string; desc: string; tags: string[] }) => void;
}

export default function VideoCreator({ onHandToCrossPost }: VideoCreatorProps) {
  const [topic, setTopic] = useState<string>("The Secret Web: How private darknet micro-nodes coordinate global shipping logistics.");
  const [activeProject, setActiveProject] = useState<VideoProject | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [activeAssetTab, setActiveAssetTab] = useState<string>("script");
  const [copiedAsset, setCopiedAsset] = useState<string | null>(null);
  
  // Editorial state to let users fine-tune generated script & description
  const [editableScript, setEditableScript] = useState<string>("");
  const [editableTitle, setEditableTitle] = useState<string>("");
  const [editableDescription, setEditableDescription] = useState<string>("");
  const [editableTags, setEditableTags] = useState<string>("");

  const stepsDefinition: PipelineStep[] = [
    { id: "research", name: "Deep Niche Research", description: "Querying Gemini API for comprehensive facts, background insights, and tech definitions.", status: "idle", outputFile: "research.md", category: "research" },
    { id: "outline", name: "Documentary Outline", description: "Formulating a structured multi-act narrative curve based on researched vectors.", status: "idle", outputFile: "outline.md", category: "research" },
    { id: "script", name: "Narration Screenplay", description: "Drafting voiceover dialogue paired with precise cinematic scene directions.", status: "idle", outputFile: "script.md", category: "script" },
    { id: "prompts", name: "Higgsfield Prompt Synthesis", description: "Engineering 4K camera directions and motion guidance instructions for generative clip servers.", status: "idle", outputFile: "scene_prompts.json", category: "media" },
    { id: "narration", name: "Voiceover Synthesis", description: "Generating voice track wave file with custom cadence and BBC narrator dialect.", status: "idle", outputFile: "narration.wav", category: "media" },
    { id: "video", name: "Generative Video Composites", description: "Rendering scene clips using Higgsfield physical models matching prompt parameters.", status: "idle", outputFile: "clips_manifest.json", category: "media" },
    { id: "ffmpeg", name: "FFmpeg Media Compositor", description: "Triggering background timeline shell to combine soundscapes, overlays, and video clips.", status: "idle", outputFile: "final_video.mp4", category: "assembly" },
    { id: "subtitles", name: "SRT Subtitle Burn-In", description: "Computing word-level sound alignment variables and outputting subtitle cues.", status: "idle", outputFile: "subtitles.srt", category: "assembly" },
    { id: "thumbnail", name: "Cover Image Render", description: "Synthesizing professional display cover poster featuring high contrast typography.", status: "idle", outputFile: "thumbnail.png", category: "publishing" },
    { id: "metadata", name: "SEO Optimization Node", description: "Extracting metadata.json, searchable titles, tags list, and high CPM tag blocks.", status: "idle", outputFile: "metadata.json", category: "publishing" }
  ];

  // Load active project from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("active_video_project");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setActiveProject(parsed);
        if (parsed.assets?.script) setEditableScript(parsed.assets.script);
        if (parsed.assets?.title) setEditableTitle(parsed.assets.title);
        if (parsed.assets?.description) setEditableDescription(parsed.assets.description);
        if (parsed.assets?.tags) setEditableTags(parsed.assets.tags.join(", "));
      } catch (e) {
        console.error("Failed to parse saved video project:", e);
      }
    }
  }, []);

  // Save active project changes
  const saveProjectState = (proj: VideoProject | null) => {
    setActiveProject(proj);
    if (proj) {
      localStorage.setItem("active_video_project", JSON.stringify(proj));
    } else {
      localStorage.removeItem("active_video_project");
    }
  };

  const handleCreateProject = async () => {
    if (!topic.trim()) return;
    setIsInitializing(true);
    
    try {
      const response = await fetch("/api/video-pipeline/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });
      const data = await response.json();
      if (data.success && data.project) {
        saveProjectState(data.project);
        setEditableScript(data.project.assets.script || "");
        setEditableTitle(data.project.assets.title || "");
        setEditableDescription(data.project.assets.description || "");
        setEditableTags(data.project.assets.tags ? data.project.assets.tags.join(", ") : "");
      }
    } catch (e) {
      console.error("Failed to create project:", e);
    } finally {
      setIsInitializing(false);
    }
  };

  // Run the next pending step of the pipeline
  const executePipelineStep = async (stepId: string) => {
    if (!activeProject) return;

    // Update state to running
    const updatedSteps = activeProject.steps.map(s => 
      s.id === stepId ? { ...s, status: "running" as const } : s
    );
    const updatedProject = {
      ...activeProject,
      status: "running" as const,
      steps: updatedSteps
    };
    saveProjectState(updatedProject);

    try {
      const response = await fetch(`/api/video-pipeline/execute-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProject.id, stepId })
      });
      const resData = await response.json();
      
      if (resData.success && resData.project) {
        saveProjectState(resData.project);
        if (resData.project.assets?.script) setEditableScript(resData.project.assets.script);
        if (resData.project.assets?.title) setEditableTitle(resData.project.assets.title);
        if (resData.project.assets?.description) setEditableDescription(resData.project.assets.description);
        if (resData.project.assets?.tags) setEditableTags(resData.project.assets.tags.join(", "));
        
        // Auto select tab based on output
        if (stepId === "research") setActiveAssetTab("research");
        if (stepId === "outline") setActiveAssetTab("outline");
        if (stepId === "script") setActiveAssetTab("script");
        if (stepId === "prompts") setActiveAssetTab("prompts");
        if (stepId === "subtitles") setActiveAssetTab("subtitles");
        if (stepId === "metadata") setActiveAssetTab("seo");
      } else {
        throw new Error(resData.error || "Step failed");
      }
    } catch (err: any) {
      console.error(`Error in step ${stepId}:`, err);
      const failedSteps = activeProject.steps.map(s => 
        s.id === stepId ? { ...s, status: "failed" as const, error: err.message || "Execution exception occurred." } : s
      );
      saveProjectState({
        ...activeProject,
        status: "failed" as const,
        steps: failedSteps
      });
    }
  };

  const handleResetProject = () => {
    if (confirm("Are you sure you want to completely erase the current video project and start over?")) {
      saveProjectState(null);
      setEditableScript("");
      setEditableTitle("");
      setEditableDescription("");
      setEditableTags("");
    }
  };

  const handleCopyToClipboard = (text: string, tabName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAsset(tabName);
    setTimeout(() => setCopiedAsset(null), 2000);
  };

  const triggerHandOff = () => {
    if (!activeProject) return;
    const finalScript = editableScript || activeProject.assets.script || "";
    const parsedTags = editableTags 
      ? editableTags.split(",").map(t => t.trim()).filter(Boolean) 
      : (activeProject.assets.tags || []);
    
    onHandToCrossPost(finalScript, {
      title: editableTitle || activeProject.assets.title || "Untitled Episode",
      desc: editableDescription || activeProject.assets.description || "",
      tags: parsedTags
    });
  };

  // Helper colors for step indicators
  const getStepColorClasses = (status: string) => {
    switch (status) {
      case "completed":
        return {
          bg: "bg-emerald-950/40 border-emerald-900/60 text-emerald-400",
          bullet: "bg-emerald-500 border-emerald-400 text-slate-950"
        };
      case "running":
        return {
          bg: "bg-cyan-950/40 border-cyan-850 text-cyan-400 animate-pulse",
          bullet: "bg-cyan-500 border-cyan-400 text-slate-950 animate-spin"
        };
      case "failed":
        return {
          bg: "bg-rose-950/40 border-rose-900/40 text-rose-400",
          bullet: "bg-rose-500 border-rose-400 text-slate-950"
        };
      default:
        return {
          bg: "bg-slate-900/30 border-slate-850 text-slate-400",
          bullet: "bg-slate-950 border-slate-800 text-slate-500"
        };
    }
  };

  const isStageComplete = (stepId: string) => {
    return activeProject?.steps.find(s => s.id === stepId)?.status === "completed";
  };

  const allDone = activeProject?.steps.every(s => s.status === "completed");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 font-sans">
      
      {/* Header Panel */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-950/50 border border-rose-800/40 rounded-xl flex items-center justify-center shadow-inner">
              <Video className="w-5 h-5 text-rose-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
                  Autonomous AI Video Creator
                </h3>
                <span className="text-[9px] font-mono font-black text-rose-400 bg-rose-950/40 border border-rose-900/30 px-2 py-0.5 rounded tracking-widest">
                  STAGE-GATE PIPELINE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-normal max-w-xl font-sans">
                Research, write scripts, compile narration, render clips, and assemble final HD videos. Hand the complete pack off to CrossPost seamlessly.
              </p>
            </div>
          </div>
          
          {activeProject && (
            <div className="flex items-center gap-2 shrink-0 font-mono">
              <button
                onClick={handleResetProject}
                className="px-3 py-1.5 rounded bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-[10px] uppercase font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Pipeline</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {!activeProject ? (
        /* Topic Input Screen (Empty State) */
        <div className="max-w-2xl mx-auto py-12 px-6 bg-slate-950/40 border border-slate-850 rounded-2xl text-center space-y-6 animate-fadeIn">
          <div className="p-4 bg-slate-950 border border-slate-850 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-rose-400 shadow-lg">
            <Video className="w-7 h-7" />
          </div>
          
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-200 uppercase font-mono tracking-wide">Configure New Episode</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Input any topic or headline. The Empire AI engine will automatically orchestrate research, scripting, scene creation, and multi-track assembly.
            </p>
          </div>

          <div className="space-y-3 pt-3">
            <div className="text-left space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Documentary Topic / Seed Idea</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex: The Silicon Arbitrage: How private server hubs located millimeter away from stock exchange routers capture billions..."
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-700 min-h-[100px] focus:outline-none focus:border-slate-700 leading-relaxed focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <button
              onClick={handleCreateProject}
              disabled={isInitializing || !topic.trim()}
              className="w-full bg-rose-600 hover:bg-rose-500 text-slate-100 font-mono text-xs font-black uppercase tracking-wider py-3 px-4 rounded-xl cursor-pointer transition flex justify-center items-center gap-2 disabled:opacity-50 shadow-lg"
            >
              {isInitializing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Booting Multi-Agent Workspace...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-100" />
                  <span>Initialize Video Project Folder</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Active Pipeline Dashboard */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Vertical Pipeline (Col Span 5) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3.5">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <span className="text-[10px] font-mono text-rose-400 uppercase font-black block">Pipeline Stage Progress</span>
                <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">Independent Gates</span>
              </div>

              {/* Steps List */}
              <div className="space-y-2 max-h-[460px] overflow-y-auto scrollbar-thin pr-1.5">
                {activeProject.steps.map((step, idx) => {
                  const ui = getStepColorClasses(step.status);
                  const isCurrent = activeProject.steps.findIndex(s => s.status === "running") === idx || 
                                    (activeProject.steps.every(s => s.status !== "running") && activeProject.steps.findIndex(s => s.status === "idle") === idx);
                  
                  return (
                    <div 
                      key={step.id}
                      className={`border rounded-lg p-3 transition-all ${ui.bg} ${
                        isCurrent ? "ring-1 ring-rose-500/10 border-slate-700" : "border-slate-850"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-full border text-[10px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${ui.bullet}`}>
                          {step.status === "completed" ? (
                            "✓"
                          ) : step.status === "running" ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : step.status === "failed" ? (
                            "✗"
                          ) : (
                            idx + 1
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center gap-2">
                            <h4 className="text-xs font-bold font-mono tracking-tight text-slate-200">{step.name}</h4>
                            {step.duration && (
                              <span className="text-[9px] font-mono text-slate-500">{step.duration}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-450 leading-relaxed font-sans mt-0.5">{step.description}</p>
                          
                          {step.error && (
                            <div className="mt-2 p-2 bg-rose-950/30 border border-rose-900/20 rounded text-[9px] font-mono text-rose-400 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span className="break-words">{step.error}</span>
                            </div>
                          )}

                          {/* Action Button Trigger */}
                          {step.status === "idle" && isCurrent && (
                            <button
                              onClick={() => executePipelineStep(step.id)}
                              className="mt-2.5 py-1 px-2.5 rounded bg-rose-600 hover:bg-rose-500 text-slate-100 font-mono text-[9px] font-bold uppercase transition flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-2.5 h-2.5" />
                              <span>Execute Step</span>
                            </button>
                          )}

                          {step.status === "failed" && (
                            <button
                              onClick={() => executePipelineStep(step.id)}
                              className="mt-2.5 py-1 px-2.5 rounded bg-rose-700 hover:bg-rose-600 text-slate-100 font-mono text-[9px] font-bold uppercase transition flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>Retry Step</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status checklist metrics requested by Joshua */}
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-1.5 font-mono text-[10px]">
                <div className="flex justify-between items-center text-slate-400 font-bold uppercase tracking-wider border-b border-slate-900 pb-1.5 mb-1.5">
                  <span>Joshua Checklist</span>
                  <span className="text-[9px] text-slate-500">Requirements Status</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-slate-450">
                  <div className="flex items-center gap-1.5">
                    <span className={isStageComplete("research") ? "text-emerald-400 font-bold" : "text-slate-650"}>
                      {isStageComplete("research") ? "✔" : "○"}
                    </span>
                    <span className={isStageComplete("research") ? "text-slate-200" : ""}>Research Complete</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={isStageComplete("script") ? "text-emerald-400 font-bold" : "text-slate-650"}>
                      {isStageComplete("script") ? "✔" : "○"}
                    </span>
                    <span className={isStageComplete("script") ? "text-slate-200" : ""}>Script Complete</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={isStageComplete("narration") ? "text-emerald-400 font-bold" : "text-slate-650"}>
                      {isStageComplete("narration") ? "✔" : "○"}
                    </span>
                    <span className={isStageComplete("narration") ? "text-slate-200" : ""}>Narration Complete</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={isStageComplete("video") ? "text-emerald-400 font-bold" : "text-slate-650"}>
                      {isStageComplete("video") ? "✔" : "○"}
                    </span>
                    <span className={isStageComplete("video") ? "text-slate-200" : ""}>Video Complete</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={isStageComplete("thumbnail") ? "text-emerald-400 font-bold" : "text-slate-650"}>
                      {isStageComplete("thumbnail") ? "✔" : "○"}
                    </span>
                    <span className={isStageComplete("thumbnail") ? "text-slate-200" : ""}>Thumbnail Complete</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={isStageComplete("metadata") ? "text-emerald-400 font-bold" : "text-slate-650"}>
                      {isStageComplete("metadata") ? "✔" : "○"}
                    </span>
                    <span className={isStageComplete("metadata") ? "text-slate-200" : ""}>SEO Complete</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-900 mt-2 flex items-center justify-between font-bold">
                  <span className="text-slate-400">CrossPost Hand-off:</span>
                  <span className={allDone ? "text-emerald-400 bg-emerald-950/30 border border-emerald-900 px-2 py-0.5 rounded" : "text-slate-600"}>
                    {allDone ? "✔ READY FOR CROSSPOST" : "○ WAITING ON STAGES"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Asset Inspector & Live fine-tuning (Col Span 7) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 flex flex-col justify-between min-h-[460px]">
              <div>
                {/* Topic Banner */}
                <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg mb-4">
                  <span className="text-[9px] font-mono text-slate-500 uppercase block font-semibold">Active Topic Seed</span>
                  <p className="text-[11px] font-mono text-slate-200 mt-0.5 leading-relaxed font-semibold break-words">
                    "{activeProject.topic}"
                  </p>
                </div>

                {/* File Assets generated checklist banner */}
                <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-lg mb-4 space-y-1.5 font-mono text-[9px] text-slate-400">
                  <div className="text-[10px] font-bold uppercase text-slate-300">Workspace Files Produced:</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("ffmpeg") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("ffmpeg") ? "text-slate-200" : ""}>final_video.mp4</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("thumbnail") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("thumbnail") ? "text-slate-200" : ""}>thumbnail.png</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("narration") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("narration") ? "text-slate-200" : ""}>narration.wav</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("subtitles") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("subtitles") ? "text-slate-200" : ""}>subtitles.srt</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("script") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("script") ? "text-slate-200" : ""}>script.md</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("prompts") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("prompts") ? "text-slate-200" : ""}>scene_prompts.json</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("metadata") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("metadata") ? "text-slate-200" : ""}>metadata.json</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("metadata") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("metadata") ? "text-slate-200" : ""}>description.txt</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={isStageComplete("metadata") ? "text-emerald-400" : "text-slate-650"}>●</span>
                      <span className={isStageComplete("metadata") ? "text-slate-200" : ""}>tags.txt</span>
                    </div>
                  </div>
                </div>

                {/* Asset Display Tabs */}
                <div className="flex flex-wrap border-b border-slate-900 mb-4 gap-1">
                  <button
                    onClick={() => setActiveAssetTab("script")}
                    disabled={!isStageComplete("script")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("script") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "script" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    Script.md
                  </button>
                  <button
                    onClick={() => setActiveAssetTab("research")}
                    disabled={!isStageComplete("research")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("research") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "research" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    Research
                  </button>
                  <button
                    onClick={() => setActiveAssetTab("outline")}
                    disabled={!isStageComplete("outline")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("outline") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "outline" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    Outline
                  </button>
                  <button
                    onClick={() => setActiveAssetTab("prompts")}
                    disabled={!isStageComplete("prompts")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("prompts") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "prompts" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    Scene Prompts
                  </button>
                  <button
                    onClick={() => setActiveAssetTab("narration")}
                    disabled={!isStageComplete("narration")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("narration") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "narration" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    Narration Audio
                  </button>
                  <button
                    onClick={() => setActiveAssetTab("video")}
                    disabled={!isStageComplete("video")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("video") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "video" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    Video Clip Render
                  </button>
                  <button
                    onClick={() => setActiveAssetTab("subtitles")}
                    disabled={!isStageComplete("subtitles")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("subtitles") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "subtitles" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    Subtitles.srt
                  </button>
                  <button
                    onClick={() => setActiveAssetTab("seo")}
                    disabled={!isStageComplete("metadata")}
                    className={`px-2.5 py-1.5 font-mono text-[10px] font-semibold rounded-t border-t border-x transition-all ${
                      !isStageComplete("metadata") ? "opacity-30 cursor-not-allowed" : ""
                    } ${
                      activeAssetTab === "seo" 
                        ? "bg-slate-950 border-slate-900 text-rose-400" 
                        : "bg-transparent border-transparent text-slate-450 hover:text-slate-250"
                    }`}
                  >
                    SEO Pack
                  </button>
                </div>

                {/* Active Tab Pane */}
                <div className="bg-slate-950 p-4 border border-slate-850 rounded-lg max-h-[300px] overflow-y-auto scrollbar-thin">
                  
                  {/* Script Pane (with Live Edit) */}
                  {activeAssetTab === "script" && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                        <span>LIVELY EDITABLE SCRIPT SCREENPLAY</span>
                        <button
                          onClick={() => handleCopyToClipboard(editableScript, "script")}
                          className="flex items-center gap-1 hover:text-slate-350 cursor-pointer text-rose-400"
                        >
                          {copiedAsset === "script" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedAsset === "script" ? "Copied!" : "Copy code"}</span>
                        </button>
                      </div>
                      <textarea
                        value={editableScript}
                        onChange={(e) => setEditableScript(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-850 rounded p-2.5 text-xs font-mono text-slate-200 leading-relaxed min-h-[160px] focus:outline-none focus:border-slate-700"
                        placeholder="Wait for script to generate..."
                      />
                    </div>
                  )}

                  {/* Research Pane */}
                  {activeAssetTab === "research" && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                        <span>CRAWLED INTEL (GEMINI RESEARCH)</span>
                        <button
                          onClick={() => handleCopyToClipboard(activeProject.assets.research || "", "research")}
                          className="flex items-center gap-1 hover:text-slate-350 text-rose-400"
                        >
                          {copiedAsset === "research" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                      <div className="text-xs text-slate-300 font-sans whitespace-pre-wrap leading-relaxed max-w-none">
                        {activeProject.assets.research}
                      </div>
                    </div>
                  )}

                  {/* Outline Pane */}
                  {activeAssetTab === "outline" && (
                    <div className="space-y-3">
                      <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                        {activeProject.assets.outline?.title || "Documentary Layout Outline"}
                      </div>
                      <div className="space-y-3">
                        {activeProject.assets.outline?.acts.map((act, i) => (
                          <div key={i} className="bg-slate-900/60 border border-slate-850 rounded p-3 text-xs">
                            <span className="text-[9px] font-mono text-rose-400 uppercase font-black">ACT 0{i+1}: {act.title}</span>
                            <p className="text-slate-300 font-sans mt-1 leading-relaxed">{act.focus}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scene Prompts Pane */}
                  {activeAssetTab === "prompts" && (
                    <div className="space-y-3">
                      <div className="text-[9px] font-mono text-slate-500 uppercase">SYNTHESIZED HIGGSFIELD PROMPTING TIMELINE</div>
                      <div className="space-y-2.5">
                        {activeProject.assets.scenePrompts?.map((scene, i) => (
                          <div key={i} className="bg-slate-900/40 p-3 border border-slate-850 rounded-lg space-y-1.5 text-xs font-mono">
                            <div className="flex justify-between text-slate-450 text-[9px]">
                              <span>SCENE 0{scene.scene}</span>
                              <span className="text-rose-400 bg-rose-950/20 border border-rose-900/30 px-1.5 rounded">HIGGSFIELD</span>
                            </div>
                            <div className="text-slate-200">
                              <strong className="text-slate-400 text-[10px] block font-bold">Narration Dialogue:</strong>
                              <p className="italic font-serif text-[11px] mt-0.5 text-slate-300">"{scene.audio}"</p>
                            </div>
                            <div className="pt-1.5 border-t border-slate-900 text-slate-400 text-[10px] font-sans">
                              <strong className="text-slate-500 font-mono text-[9px] block">Clip generation prompt:</strong>
                              <span className="text-cyan-400">{scene.prompt}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audio Narration Wave Player Mockup */}
                  {activeAssetTab === "narration" && (
                    <div className="py-6 text-center space-y-4 animate-fadeIn">
                      <div className="flex justify-center items-center gap-2">
                        <Mic className="w-6 h-6 text-rose-400" />
                        <span className="font-mono text-xs text-slate-350">narration.wav (Synthesized Narrator File)</span>
                      </div>
                      
                      {/* Interactive pseudo waveform */}
                      <div className="flex justify-center items-end gap-1.5 h-16 bg-slate-950 max-w-sm mx-auto border border-slate-900 rounded p-2">
                        {[4, 10, 15, 2, 8, 22, 14, 3, 7, 28, 32, 19, 5, 11, 24, 16, 8, 4, 12, 15, 2, 7, 18, 9, 3, 22, 11, 5].map((val, idx) => (
                          <div 
                            key={idx} 
                            className="bg-rose-500/80 rounded-t w-2 cursor-pointer hover:bg-rose-400 transition"
                            style={{ height: `${val * 2}%` }}
                          ></div>
                        ))}
                      </div>

                      <div className="text-xs font-mono text-slate-450">
                        <span>Estimated Duration: {activeProject.assets.narrationDuration || 45} seconds</span>
                        <span className="block mt-1 text-[9px] text-slate-500">FORMAT: 48kHz Stereo WAV, BBC Investigative Accent</span>
                      </div>
                    </div>
                  )}

                  {/* Video Clip render */}
                  {activeAssetTab === "video" && (
                    <div className="space-y-3">
                      <span className="text-[9px] font-mono text-slate-500 uppercase block">RENDERED SCENES GALLERY (HIGGSFIELD PHYSICAL NODES)</span>
                      <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                        {activeProject.assets.videoClips?.map((clip, idx) => (
                          <div key={idx} className="bg-slate-900 border border-slate-850 rounded p-3 space-y-2">
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="text-slate-400">CLIP 0{clip.id}</span>
                              <span className="text-emerald-400">READY</span>
                            </div>
                            <div className="h-20 bg-slate-950 border border-slate-850 rounded flex flex-col justify-center items-center text-center p-2 relative overflow-hidden">
                              <Film className="w-5 h-5 text-slate-700 mb-1" />
                              <span className="text-[8px] text-slate-500 truncate w-full">{clip.path}</span>
                              {/* Pulse border overlay to seem live */}
                              <div className="absolute inset-0 border border-emerald-500/20 rounded"></div>
                            </div>
                            <p className="text-[9px] text-slate-450 truncate" title={clip.prompt}>{clip.prompt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subtitles SRT */}
                  {activeAssetTab === "subtitles" && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                        <span>GENERATED SRT SUBTITLES FILE</span>
                        <button
                          onClick={() => handleCopyToClipboard(activeProject.assets.subtitles || "", "subtitles")}
                          className="flex items-center gap-1 hover:text-slate-350 text-rose-400"
                        >
                          {copiedAsset === "subtitles" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="text-xs text-slate-400 font-mono leading-relaxed bg-slate-900/60 p-3 rounded border border-slate-850 whitespace-pre">
                        {activeProject.assets.subtitles}
                      </pre>
                    </div>
                  )}

                  {/* SEO Tab (with Live Edit) */}
                  {activeAssetTab === "seo" && (
                    <div className="space-y-4">
                      <span className="text-[9px] font-mono text-slate-500 uppercase block">LIVELY EDITABLE SEO METADATA PACK</span>
                      
                      <div className="space-y-3 font-mono text-xs">
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-500 font-bold block uppercase">YouTube Optimized Title</label>
                          <input
                            type="text"
                            value={editableTitle}
                            onChange={(e) => setEditableTitle(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-850 rounded p-2 text-slate-200"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-500 font-bold block uppercase">Detailed Video Description</label>
                          <textarea
                            value={editableDescription}
                            onChange={(e) => setEditableDescription(e.target.value)}
                            rows={5}
                            className="w-full bg-slate-900 border border-slate-850 rounded p-2 text-slate-250 leading-relaxed font-sans"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-500 font-bold block uppercase">Keyword Tags (Comma Separated)</label>
                          <input
                            type="text"
                            value={editableTags}
                            onChange={(e) => setEditableTags(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-850 rounded p-2 text-slate-200"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Action Hand-off Footer */}
              <div className="pt-4 border-t border-slate-900 mt-4">
                <button
                  onClick={triggerHandOff}
                  disabled={!allDone}
                  className="w-full bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-slate-100 font-mono text-xs font-black uppercase tracking-widest py-3 px-4 rounded-xl flex justify-center items-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-md transition-all"
                >
                  <Send className="w-4 h-4 text-slate-100" />
                  <span>Hand Package to CrossPost Terminal</span>
                  <ArrowRight className="w-4 h-4 text-slate-100" />
                </button>
                <p className="text-[10px] text-slate-500 text-center font-sans mt-2">
                  {allDone 
                    ? "Passes final_video.mp4, description, tags, and screenplay script straight into CrossPost multi-agent channels."
                    : "Complete all stage-gates in the left panel to unlock automatic publishing hand-off."
                  }
                </p>
              </div>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
