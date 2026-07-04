import React, { useState } from "react";
import { Sparkles, Percent, Database, TrendingUp, Sliders, CheckCircle, Flame } from "lucide-react";

export function MathEngine() {
  const [similarity, setSimilarity] = useState<number>(0.84);
  const [readability, setReadability] = useState<number>(78);
  const [hookEntropy, setHookEntropy] = useState<number>(92);
  const [proximity, setProximity] = useState<number>(98);

  // Compute overall score mathematically based on actual weights:
  // Score = 0.3 * similarity * 100 + 0.2 * readability + 0.35 * hookEntropy + 0.15 * proximity
  const calculatedOverall = Math.round(
    0.3 * (similarity * 100) +
    0.2 * readability +
    0.35 * hookEntropy +
    0.15 * proximity
  );

  return (
    <div id="math-engine-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
      <div className="flex flex-col lg:flex-row gap-6 font-sans">
        
        {/* Metric Engine & Sliders */}
        <div className="flex-1">
          <div className="mb-4">
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-900 px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              REAL-TIME HOOK SCORING EQUATION PIPELINE
            </span>
            <h3 className="text-xl font-bold text-slate-100 mt-2">Active Multi-Metric Scoring Model</h3>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              Prior to creator delivery, drafts are scored using key NLP metrics. Adjust the indicators below to recalculate the performance probability:
            </p>
          </div>

          <div className="space-y-4 bg-slate-950 p-5 rounded-lg border border-slate-850">
            
            {/* Slider 1: Semantic Style Cosine Similarity */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-200">Cosine Similarity Index (Sim_style)</span>
                <span className="text-xs font-mono text-indigo-400 font-bold">{(similarity * 100).toFixed(0)}%</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">Measures similarity distance to the creator's past highest-converting posts in postgres vector space.</p>
              <input
                id="slider-similarity"
                type="range"
                min="0.30"
                max="1.00"
                step="0.01"
                value={similarity}
                onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Slider 2: Linguistic Sentiment Alignment */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-200">Linguistic Sentiment Alignment</span>
                <span className="text-xs font-mono text-indigo-400 font-bold">{readability}%</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">Evaluates semantic formatting, readability levels, and paragraph spacing compliance.</p>
              <input
                id="slider-readability"
                type="range"
                min="10"
                max="100"
                value={readability}
                onChange={(e) => setReadability(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Slider 3: Stop-Hook Entropy Index */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-200">Attention Stop Hook Entropy</span>
                <span className="text-xs font-mono text-indigo-400 font-bold">{hookEntropy}%</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">Estimates scroll-stopping authority of the initial 3 words based on database retention models.</p>
              <input
                id="slider-hook-entropy"
                type="range"
                min="0"
                max="100"
                value={hookEntropy}
                onChange={(e) => setHookEntropy(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Slider 4: Specification Boundaries Proximity */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-200">Specification Boundary Proximity</span>
                <span className="text-xs font-mono text-indigo-400 font-bold">{proximity}%</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">Ensures safe buffering from platform strict parameters (such as the Twitter 280 character limit).</p>
              <input
                id="slider-proximity"
                type="range"
                min="20"
                max="100"
                value={proximity}
                onChange={(e) => setProximity(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

          </div>
        </div>

        {/* Dynamic Formula & Technical Breakdown */}
        <div className="w-full lg:w-[410px] flex flex-col justify-between gap-4">
          
          {/* Active Mathematical Score Output */}
          <div className="bg-slate-950 border border-slate-850 rounded-lg p-5 flex items-center justify-between shadow-inner">
            <div>
              <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-bold">COMPUTING OUTCOME</span>
              <h4 className="text-3xl font-extrabold text-white mt-1 font-mono tracking-tight">{calculatedOverall}/100</h4>
              <p className="text-[9px] text-emerald-400 mt-1 font-semibold flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" />
                {calculatedOverall >= 85 ? "HIGH RETENTION VIRAL POTENTIAL" : calculatedOverall >= 60 ? "ADEQUATE PLATFORM COMPLIANCE" : "NEEDS AGENT RE-DRAFT"}
              </p>
            </div>
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-2 border-slate-800 flex items-center justify-center font-mono text-xs font-bold text-indigo-400 bg-slate-900 border-t-indigo-500">
                <Percent className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Theoretical Core Concepts */}
          <div className="bg-slate-950/60 border border-slate-850 p-5 rounded-lg flex-1">
            <h4 className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Style Memory Vector Alignment</span>
            </h4>
            
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              Our postgres database indexes historic high-performing titles grouped by creator. A cosine similarity algorithm determines the stylistic proximity of seed inputs:
            </p>

            <div className="bg-slate-900/80 border border-indigo-950 px-3 py-2.5 rounded my-2.5 text-[10px] font-mono leading-relaxed">
              <span className="text-indigo-400 font-bold">Cosine Formula:</span> Score = (V_text · V_creator) / (||V_text|| × ||V_creator||)
            </div>

            <h4 className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase mt-3">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span>Production Telemetry Loop</span>
            </h4>
            <p className="text-xs text-slate-400 leading-normal mt-1.5">
              Real world CTR, view completion, and engagement percentages feed back directly into our vector indices, auto-tuning platform generation weight distributions natively.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
