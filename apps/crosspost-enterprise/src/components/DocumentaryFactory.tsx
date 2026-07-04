import React, { useState } from "react";
import {
  Video, Sparkles, Volume2, Music, Mic, Clock, Plus, Trash, Play, Layers, AlertCircle, FileAudio, RefreshCw
} from "lucide-react";

export default function DocumentaryFactory() {
  const [topic, setTopic] = useState<string>("The Shadow Servers: How dark infrastructure runs the modern financial arbitrage markets.");
  const [narrationStyle, setNarrationStyle] = useState<string>("Investigative & Dramatic (BBC-style)");
  const [voiceCloning, setVoiceCloning] = useState<string>("British Historian (AI Voice #4)");
  const [backgroundTrack, setBackgroundTrack] = useState<string>("Subtle Retro Sub-bass Synth");
  
  const [loading, setLoading] = useState<boolean>(false);
  const [productionTimeline, setProductionTimeline] = useState<any | null>(null);

  const handleAssembleFactory = () => {
    if (!topic.trim()) return;
    setLoading(true);
    setProductionTimeline(null);

    // Simulate assembling deep narrative acts & visual audio cue timeline
    setTimeout(() => {
      setProductionTimeline({
        title: "SHADOW SERVERS: ARBITRAGE DEPTHS",
        acts: [
          { name: "ACT I: THE UNSEEN DISPATCH", duration: "2m 30s", description: "Establishes the hidden scale of localized physical datacenters placed millimetres away from exchange hubs." },
          { name: "ACT II: THE MICROSECOND WAR", duration: "5m 15s", description: "Peels back technical layers. Analyzes automated router loops and fiber optic pathways." },
          { name: "ACT III: INTEGRATED EXITS", duration: "3m 45s", description: "The philosophical outcome. Machine learning models taking complete control of micro-second wealth allocations." }
        ],
        cues: [
          { timestamp: "00:00 - 00:30", audio: "Narration over low sub-bass rumble.", narration: "Beneath the asphalt of New Jersey, light travels through glass at 200,000 kilometers per second. But for the algorithms of Wall Street, that speed is tragically slow.", visual: "Close-up macro lens of fiber optic cables glowing. Stroboscopic orange lights." },
          { timestamp: "00:30 - 01:45", audio: "Music swells into structured retro drums.", narration: "In this documentary, we unveil the architectures of Empire OS: the quiet platforms that audit and orchestrate everything.", visual: "Drone shot moving over concrete financial datacenters during rain. Transition to high-tech server map diagrams." },
          { timestamp: "01:45 - 03:00", audio: "Narration fades. Ambient drone holds.", narration: "If the systems governing our data are offline, who is truly inspecting the machine? Marcus pulls the mainframe power cord...", visual: "Flickering terminal close up. A finger hovers over a heavy manual power breaker switch." }
        ]
      });
      setLoading(false);
    }, 1400);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-rose-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Documentary Factory Pipeline
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-rose-400 bg-rose-950/40 border border-rose-900/30 px-2 py-0.5 rounded">
            PRODUCTION CONSOLE
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Generate professional act structures, voiceover scripts, visual prompt directions, and sound queues for high-yield investigative documentaries.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Setup Form */}
        <div className="lg:col-span-5 bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-zinc-500" />
              Documentary Configurator
            </h4>
            <p className="text-[10px] text-slate-500 font-sans">Structure audio accents, narration voice files, and synth tracks.</p>
          </div>

          <div className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Documentary Title / Theme Topic</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe the documentary focus..."
                className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-xs font-mono text-slate-200 placeholder-slate-750 min-h-[90px] focus:outline-none focus:border-zinc-700 leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Narration Cadence & Tone</label>
              <input
                type="text"
                value={narrationStyle}
                onChange={(e) => setNarrationStyle(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono font-bold text-slate-400 uppercase flex items-center gap-1">
                  <Mic className="w-3 h-3 text-rose-400" />
                  Voice Synthesizer
                </label>
                <select
                  value={voiceCloning}
                  onChange={(e) => setVoiceCloning(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
                >
                  <option value="British Historian (AI Voice #4)">British (BBC Dialect)</option>
                  <option value="Deep Cinematic Baritone">Deep Baritone</option>
                  <option value="Scientific Investigator">Whispering Investigator</option>
                  <option value="Calm Tech Curator">Calm Tech Curator</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-mono font-bold text-slate-400 uppercase flex items-center gap-1">
                  <Music className="w-3 h-3 text-indigo-400" />
                  Background Synth
                </label>
                <select
                  value={backgroundTrack}
                  onChange={(e) => setBackgroundTrack(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
                >
                  <option value="Subtle Retro Sub-bass Synth">Retro Sub-bass Synth</option>
                  <option value="Ambient Orchestral drone">Ambient Drone</option>
                  <option value="Suspenseful Clock tick beats">Suspenseful Ticking</option>
                  <option value="Industrial Drone Noise">Industrial Cyber Drone</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleAssembleFactory}
              disabled={loading || !topic.trim()}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold uppercase tracking-wider py-2.5 px-4 rounded-md cursor-pointer transition flex justify-center items-center gap-1.5 disabled:opacity-50 shadow-md"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  ASSEMBLING ACTS & CUE TIMELINE...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-white" />
                  ASSEMBLE PRODUCTION ASSETS
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Col: Timeline & Cue sheets */}
        <div className="lg:col-span-7 space-y-4">
          
          {productionTimeline ? (
            <div className="space-y-4 animate-fade-in">
              
              {/* Acts Summary */}
              <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-3">
                <span className="text-[9px] font-mono text-rose-400 uppercase block font-bold">ACT MATRIX BREAKDOWN</span>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {productionTimeline.acts.map((act: any, i: number) => (
                    <div key={i} className="bg-zinc-900 p-2.5 border border-zinc-850 rounded text-xs">
                      <div className="flex justify-between items-center text-[10px] font-mono font-bold text-rose-300">
                        <span>ACT 0{i+1}</span>
                        <span>{act.duration}</span>
                      </div>
                      <strong className="text-[11px] block text-slate-200 mt-1 truncate">{act.name}</strong>
                      <p className="text-slate-400 text-[10px] font-sans mt-0.5 leading-snug">{act.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timestamped Cue Sheet */}
              <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                  <span className="text-[9px] font-mono text-rose-400 uppercase block font-bold">TIMESTAMPTED CUE SHEET DIRECTIVE</span>
                  <span className="text-[10px] font-mono text-slate-500">Audio Format: 48kHz WAV</span>
                </div>

                <div className="space-y-3.5 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
                  {productionTimeline.cues.map((cue: any, i: number) => (
                    <div key={i} className="bg-zinc-900 p-4 border border-zinc-850 rounded-lg space-y-2.5 text-xs">
                      <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-400">
                        <span className="flex items-center gap-1 text-rose-400 bg-rose-950/20 border border-rose-900/30 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          {cue.timestamp}
                        </span>
                        <span className="flex items-center gap-1 text-indigo-400">
                          <FileAudio className="w-3.5 h-3.5" />
                          {cue.audio}
                        </span>
                      </div>
                      
                      <div className="space-y-1 pl-1">
                        <span className="text-[9px] font-mono text-slate-500 uppercase block font-semibold">Narrator Cue Script</span>
                        <p className="text-slate-200 font-serif italic leading-relaxed text-[11.5px]">"{cue.narration}"</p>
                      </div>

                      <div className="pt-2 border-t border-zinc-850/60 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                        <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold">Visual Direction:</span>
                        <span className="font-sans text-slate-300">{cue.visual}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-zinc-950/20 border border-dashed border-zinc-850 rounded-lg p-12 text-center space-y-3 min-h-[360px] flex flex-col justify-center items-center">
              <Video className="w-10 h-10 text-slate-700 animate-pulse" />
              <h4 className="text-xs font-mono font-bold text-slate-400 uppercase">Director Timeline Empty</h4>
              <p className="text-[11px] text-slate-500 max-w-sm font-sans">
                Structure your documentary concept, configure deep vocal inflections, and trigger the production director to assemble acts and visual timeline prompt logs.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
