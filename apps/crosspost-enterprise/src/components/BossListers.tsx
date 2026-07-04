import React, { useState } from "react";
import {
  Sparkles, Award, Star, ListChecks, DollarSign, RefreshCw, Send, ShieldCheck, Tag, Play, Settings
} from "lucide-react";

export default function BossListers() {
  const [productName, setProductName] = useState<string>("Empire OS - Custom Local Workspace Suite");
  const [targetPrice, setTargetPrice] = useState<string>("$9,850 one-off licensing fee");
  const [nicheCategory, setNicheCategory] = useState<string>("Enterprise SaaS Infrastructure");
  const [productFeatures, setProductFeatures] = useState<string>("Local offline model routing, GitHub multi-repo continuous tech debt analyzer, real-time yield optimizer dashboard.");
  const [copyTone, setCopyTone] = useState<string>("Authority & Trust");

  const [loading, setLoading] = useState<boolean>(false);
  const [optimizedListing, setOptimizedListing] = useState<any | null>(null);

  const handleOptimizeListing = () => {
    if (!productName.trim()) return;
    setLoading(true);
    setOptimizedListing(null);

    // Simulate sales copywriting AI logic
    setTimeout(() => {
      setOptimizedListing({
        headlines: [
          "Stop Paying Cloud Rents: Own Your Business Intelligence Layer with Empire OS",
          "The Self-Auditing Cognitive Operating System Built for High-Scale Founders"
        ],
        bossBullets: [
          { label: "LOCAL DISPATCH SPEED", text: "Zero network latency routing. Runs deepseek-r1 locally over standard hardware pools, slashing monthly cloud tokens bill by 85%." },
          { label: "AUTOMATED MODERNIZATION SWEEPS", text: "Empire Inspector runs continuously in background. Instantly flags tech-debt, pinpoints duplicate layers, and recommends code cleanup vectors." },
          { label: "MULTI-CHANNEL INGRESS PIPELINE", text: "Allows simultaneous deployment to X/Twitter, LinkedIn, and WordPress with zero staging. Keep social channels synced 24/7." }
        ],
        metaTags: {
          title: "Empire OS | Local Cognitive Infrastructure for High-Ticket Businesses",
          description: "Maximize operational throughput and reduce licensing costs. Audit codebases, optimize copywriting hooks, and leverage local LLMs locally with our all-in-one system.",
          keywords: "SaaS infrastructure, local LLM routing, technical debt optimizer, high-ticket copywriting tools, local AI models"
        },
        pricingModels: [
          { tier: "ENTERPRISE ONE-OFF", price: "$9,850", detail: "Permanent local license. Includes 12 months priority security patches and source-code integration access." },
          { tier: "MANAGED CLOUD NODE", price: "$1,450/mo", detail: "Zero hardware required. We host and manage your local Ollama clusters on isolated Cloud Run instances." }
        ],
        salesFunnel: [
          { step: "1. COGNITIVE HOOK (Ingress)", action: "Promote the 'Local Tech-Debt Audit Report' via automated LinkedIn post with real technical indicators." },
          { step: "2. INTERACTIVE DEMO (Value Delivery)", action: "Drop the leads into the Empire Inspector playground page to show them their repository's actual code duplications." },
          { step: "3. HIGH-TICKET CLOSE (Conversion)", action: "Present the One-Off licensing model with an instant cost-savings calculator compared to Claude API rents." }
        ]
      });
      setLoading(false);
    }, 1300);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Boss Listers Listing Optimizer
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded">
            CONVERSION COPYWRITER
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Generate premium headlines, dynamic benefit-focused bullet structures, optimized SEO meta tags, and high-ticket pricing models built on tested conversion methodologies.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Product Information */}
        <div className="lg:col-span-5 bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-zinc-500" />
              Listing Parameters
            </h4>
            <p className="text-[10px] text-slate-500 font-sans font-medium">Input your product details to fine-tune sales conversions.</p>
          </div>

          <div className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Product / Service Name</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono font-bold text-slate-400 uppercase">Target Price Tag</label>
                <input
                  type="text"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-mono font-bold text-slate-400 uppercase">Product Niche</label>
                <input
                  type="text"
                  value={nicheCategory}
                  onChange={(e) => setNicheCategory(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Core Features / Highlights</label>
              <textarea
                value={productFeatures}
                onChange={(e) => setProductFeatures(e.target.value)}
                placeholder="Identify features to rewrite..."
                className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-xs font-mono text-slate-200 placeholder-slate-750 min-h-[90px] focus:outline-none focus:border-zinc-700 leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono font-bold text-slate-400 uppercase">Output Tone Target</label>
              <select
                value={copyTone}
                onChange={(e) => setCopyTone(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
              >
                <option value="Authority & Trust">Authority & Trust</option>
                <option value="High Urgency & Punchy">High Urgency & Punchy</option>
                <option value="Scientific & Logical">Scientific & Logical</option>
                <option value="Indirect & Story-driven">Indirect & Story-driven</option>
              </select>
            </div>

            <button
              onClick={handleOptimizeListing}
              disabled={loading || !productName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase tracking-wider py-2.5 px-4 rounded-md cursor-pointer transition flex justify-center items-center gap-1.5 disabled:opacity-50 shadow-md"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  REWRITING SALES MATRIX...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  GENERATE HIGH-TICKET LISTING
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Col: Listing Outputs */}
        <div className="lg:col-span-7 space-y-4">
          
          {optimizedListing ? (
            <div className="space-y-4 animate-fade-in">
              
              {/* Headlines */}
              <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-2.5">
                <span className="text-[9px] font-mono text-emerald-400 uppercase block font-bold">Optimized Conversion Headlines</span>
                <div className="space-y-2">
                  {optimizedListing.headlines.map((headline: string, i: number) => (
                    <div key={i} className="bg-zinc-900 p-3 border border-zinc-850 rounded text-xs flex gap-2 items-start font-sans">
                      <Star className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <strong className="text-slate-200 leading-relaxed">{headline}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Boss Bullets */}
              <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-3">
                <span className="text-[9px] font-mono text-emerald-400 uppercase block font-bold">The "Boss Bullets" Copywriting Framework</span>
                <div className="space-y-2">
                  {optimizedListing.bossBullets.map((bullet: any, i: number) => (
                    <div key={i} className="bg-zinc-900 p-3 border border-zinc-850 rounded text-xs space-y-1 font-sans">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400">
                        <ListChecks className="w-3.5 h-3.5" />
                        <span>{bullet.label}</span>
                      </div>
                      <p className="text-slate-350 leading-relaxed pl-5">{bullet.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing & Funnel Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Pricing */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-2">
                  <span className="text-[9px] font-mono text-emerald-400 uppercase block font-bold">Structured Pricing Models</span>
                  <div className="space-y-2">
                    {optimizedListing.pricingModels.map((price: any, i: number) => (
                      <div key={i} className="bg-zinc-900 p-2.5 rounded border border-zinc-850 text-xs font-mono">
                        <div className="flex justify-between items-center text-slate-200 font-bold">
                          <span className="truncate max-w-[110px]">{price.tier}</span>
                          <span className="text-emerald-400">{price.price}</span>
                        </div>
                        <p className="text-slate-500 text-[10px] font-sans mt-1 leading-snug">{price.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Funnel */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-2">
                  <span className="text-[9px] font-mono text-emerald-400 uppercase block font-bold">3-Step Sales Funnel Blueprint</span>
                  <div className="space-y-2">
                    {optimizedListing.salesFunnel.map((funnel: any, i: number) => (
                      <div key={i} className="bg-zinc-900 p-2.5 rounded border border-zinc-850 text-xs font-sans">
                        <span className="font-mono text-[9px] font-bold text-indigo-400 block">{funnel.step}</span>
                        <p className="text-slate-350 text-[10.5px] mt-0.5 leading-relaxed">{funnel.action}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* SEO Meta Tags */}
              <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-4 space-y-2 text-xs font-mono">
                <span className="text-[9px] font-mono text-emerald-400 uppercase block font-bold">SEO & Metadata Headers</span>
                <div className="bg-zinc-900 p-2.5 rounded border border-zinc-850 space-y-1.5 text-slate-400">
                  <p>Title: <strong className="text-slate-300 font-sans">{optimizedListing.metaTags.title}</strong></p>
                  <p>Description: <span className="text-slate-350 text-[11px] font-sans block mt-0.5 leading-relaxed">{optimizedListing.metaTags.description}</span></p>
                  <p>Keywords: <span className="text-[10px] text-zinc-500 block mt-0.5">{optimizedListing.metaTags.keywords}</span></p>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-zinc-950/20 border border-dashed border-zinc-850 rounded-lg p-12 text-center space-y-3 min-h-[360px] flex flex-col justify-center items-center">
              <Award className="w-10 h-10 text-slate-700 animate-pulse" />
              <h4 className="text-xs font-mono font-bold text-slate-400 uppercase">Optimizer Frame Empty</h4>
              <p className="text-[11px] text-slate-500 max-w-sm font-sans">
                Type your high-ticket service parameters, specify features, and trigger the copy optimization parser to output fullheadlines, pricing, and funnels.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
