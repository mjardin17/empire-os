import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area
} from "recharts";
import {
  TrendingUp,
  Users,
  DollarSign,
  Award,
  Calendar,
  Layers,
  ArrowUpRight,
  Info,
  CheckCircle,
  Sparkles,
  BarChart3
} from "lucide-react";

// Mock historical growth data over 6 months
const AUDIENCE_GROWTH_DATA_6M = [
  { month: "Jan", YouTube: 12000, TikTok: 25000, Instagram: 18000, Twitter: 8000, LinkedIn: 5000, Reddit: 2000 },
  { month: "Feb", YouTube: 15000, TikTok: 38000, Instagram: 22000, Twitter: 11000, LinkedIn: 7200, Reddit: 3500 },
  { month: "Mar", YouTube: 21000, TikTok: 62000, Instagram: 31000, Twitter: 16000, LinkedIn: 11500, Reddit: 6000 },
  { month: "Apr", YouTube: 28000, TikTok: 98000, Instagram: 45000, Twitter: 23000, LinkedIn: 18000, Reddit: 9200 },
  { month: "May", YouTube: 39000, TikTok: 145000, Instagram: 62000, Twitter: 31000, LinkedIn: 27000, Reddit: 14000 },
  { month: "Jun", YouTube: 55000, TikTok: 210000, Instagram: 85000, Twitter: 44000, LinkedIn: 39000, Reddit: 21000 }
];

// Mock historical growth data over 30 days (weekly intervals)
const AUDIENCE_GROWTH_DATA_30D = [
  { month: "Week 1", YouTube: 42000, TikTok: 155000, Instagram: 68000, Twitter: 34000, LinkedIn: 29000, Reddit: 15000 },
  { month: "Week 2", YouTube: 46000, TikTok: 172000, Instagram: 72000, Twitter: 37000, LinkedIn: 32000, Reddit: 16800 },
  { month: "Week 3", YouTube: 51000, TikTok: 191000, Instagram: 79000, Twitter: 41000, LinkedIn: 35500, Reddit: 18900 },
  { month: "Week 4", YouTube: 55000, TikTok: 210000, Instagram: 85000, Twitter: 44000, LinkedIn: 39000, Reddit: 21000 }
];

// CPM across platforms (custom corporate target CPM)
const PLATFORM_CPM_DATA = [
  { name: "LinkedIn", cpm: 45.0, color: "#06B6D4", keyMetric: "B2B Decision Makers" },
  { name: "YouTube", cpm: 32.5, color: "#EF4444", keyMetric: "High Search Intent" },
  { name: "Reddit", cpm: 15.5, color: "#F97316", keyMetric: "Niche Subreddits" },
  { name: "Instagram", cpm: 12.4, color: "#EC4899", keyMetric: "Visual Brand Recall" },
  { name: "TikTok", cpm: 8.2, color: "#10B981", keyMetric: "Viral Mass Retention" },
  { name: "Twitter/X", cpm: 6.8, color: "#6366F1", keyMetric: "Brevity Impressions" }
];

// High performing niches list for context in dashboard
const RECENT_CONVERSIONS = [
  { id: 1, channel: "Hyperion Code", niche: "Faceless Python Guides", platform: "YouTube", status: "Active", growth: "+24.8%" },
  { id: 2, channel: "SaaS Blueprint", niche: "Micro-SaaS Pitch Decks", platform: "LinkedIn", status: "Verified", growth: "+42.1%" },
  { id: 3, channel: "CodeHacks", niche: "Fast Dev Hacks", platform: "TikTok", status: "Active", growth: "+114.5%" },
  { id: 4, channel: "CloudMoat", niche: "Kubernetes SecOps", platform: "Twitter/X", status: "Simulated", growth: "+12.2%" }
];

export function PerformanceDashboard() {
  const [timeRange, setTimeRange] = useState<"30d" | "6m">("6m");
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<string>("All");

  const currentGrowthData = timeRange === "6m" ? AUDIENCE_GROWTH_DATA_6M : AUDIENCE_GROWTH_DATA_30D;

  // Calculate high-level stats for visual representation
  const latestGrowthPoint = currentGrowthData[currentGrowthData.length - 1];
  const totalAudience = 
    latestGrowthPoint.YouTube + 
    latestGrowthPoint.TikTok + 
    latestGrowthPoint.Instagram + 
    latestGrowthPoint.Twitter + 
    latestGrowthPoint.LinkedIn + 
    latestGrowthPoint.Reddit;

  const previousGrowthPoint = currentGrowthData[0];
  const prevTotalAudience = 
    previousGrowthPoint.YouTube + 
    previousGrowthPoint.TikTok + 
    previousGrowthPoint.Instagram + 
    previousGrowthPoint.Twitter + 
    previousGrowthPoint.LinkedIn + 
    previousGrowthPoint.Reddit;

  const percentageGrowth = Math.round(((totalAudience - prevTotalAudience) / prevTotalAudience) * 100);
  const averageCPM = Math.round((PLATFORM_CPM_DATA.reduce((sum, item) => sum + item.cpm, 0) / PLATFORM_CPM_DATA.length) * 10) / 10;

  // Render Custom Tooltip to align with applet theme
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-lg shadow-2xl font-mono text-xs text-slate-300">
          <p className="font-bold text-slate-100 border-b border-slate-900 pb-1.5 mb-1.5">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.color || entry.fill }} />
                  {entry.name}:
                </span>
                <span className="font-bold text-slate-100">
                  {entry.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomCPMTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-lg shadow-2xl font-mono text-xs text-slate-300">
          <p className="font-bold text-slate-100 border-b border-slate-900 pb-1.5 mb-1.5">{label}</p>
          <p className="flex items-center gap-2 mb-1">
            <span className="text-cyan-400">Est. CPM:</span>
            <span className="font-bold text-slate-100">${payload[0].value.toFixed(2)}</span>
          </p>
          <p className="text-[10px] text-slate-500">
            Target Focus: <strong className="text-slate-300">{dataPoint.keyMetric}</strong>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Filters and Controls */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-black text-slate-100 tracking-tight font-sans">
              PERFORMANCE & ARBITRAGE ANALYTICS
            </h3>
          </div>
          <p className="text-[11px] text-slate-400">
            Real-time analytics showing predicted audience distribution and high-yield platform margins.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono text-slate-500 font-bold uppercase mr-1">Time Horizon</span>
          <div className="flex bg-slate-950 border border-slate-850 p-0.5 rounded-lg text-xs font-mono">
            <button
              onClick={() => setTimeRange("30d")}
              className={`px-3 py-1 rounded transition-all cursor-pointer ${
                timeRange === "30d"
                  ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange("6m")}
              className={`px-3 py-1 rounded transition-all cursor-pointer ${
                timeRange === "6m"
                  ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              6 Months
            </button>
          </div>
        </div>
      </div>

      {/* High-Level Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Audience */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow relative overflow-hidden">
          <div className="space-y-1.5 z-10">
            <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">Estimated Total Reach</span>
            <strong className="text-xl font-black text-slate-100 block font-mono">
              {totalAudience.toLocaleString()}
            </strong>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
              <ArrowUpRight className="w-3.5 h-3.5" />
              +{percentageGrowth}% vs launch interval
            </span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg text-indigo-400 shadow-inner">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Average Yield CPM */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow relative overflow-hidden">
          <div className="space-y-1.5 z-10">
            <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">Average System CPM</span>
            <strong className="text-xl font-black text-cyan-400 block font-mono">
              ${averageCPM.toFixed(2)}
            </strong>
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              High corporate valuation
            </span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg text-cyan-400 shadow-inner">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Highest Multiplier */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow relative overflow-hidden">
          <div className="space-y-1.5 z-10">
            <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">Highest Value Stream</span>
            <strong className="text-xl font-black text-slate-100 block font-sans">
              LinkedIn B2B
            </strong>
            <span className="text-[10px] text-cyan-400 flex items-center gap-1 font-mono">
              $45.00 Average CPM
            </span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg text-amber-500 shadow-inner">
            <Award className="w-5 h-5" />
          </div>
        </div>

        {/* Target Optimization Advice */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow relative overflow-hidden">
          <div className="space-y-1.5 z-10">
            <span className="text-[9px] font-mono text-slate-500 uppercase block font-bold tracking-wider">Ecosystem Yield Grade</span>
            <strong className="text-xl font-black text-indigo-400 block font-mono">
              TIER 1 ARBITRAGE
            </strong>
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              Highly profitable content matrix
            </span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg text-indigo-400 shadow-inner">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Recharts Core Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Audience Growth Trend Line Chart */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-3">
            <div className="space-y-0.5">
              <h4 className="text-xs font-mono font-bold uppercase text-slate-100">
                Audience Scale Projection ({timeRange === "6m" ? "6-Month Growth Trajectory" : "30-Day Weekly Progress"})
              </h4>
              <p className="text-[10px] text-slate-500">
                Simulated subscriber & impression growth pacing matching active specialist bot parameters.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>Multi-Platform Scale</span>
            </div>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentGrowthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="youtubeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="tiktokGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="linkedinGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  stroke="#64748B" 
                  fontSize={10} 
                  fontFamily="monospace"
                  tickLine={false} 
                />
                <YAxis 
                  stroke="#64748B" 
                  fontSize={10} 
                  fontFamily="monospace"
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => val >= 1000 ? `${val / 1000}k` : val}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', paddingTop: '15px' }} 
                  iconSize={8}
                  iconType="circle"
                />
                {/* Standard platforms lines / areas */}
                <Area type="monotone" dataKey="TikTok" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#tiktokGrad)" />
                <Area type="monotone" dataKey="Instagram" stroke="#EC4899" strokeWidth={1.5} fill="none" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="YouTube" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#youtubeGrad)" />
                <Area type="monotone" dataKey="LinkedIn" stroke="#06B6D4" strokeWidth={2.5} fillOpacity={1} fill="url(#linkedinGrad)" />
                <Area type="monotone" dataKey="Twitter" name="Twitter/X" stroke="#6366F1" strokeWidth={1.5} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Platform CPM Comparison Bar Chart */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-3">
            <div className="space-y-0.5">
              <h4 className="text-xs font-mono font-bold uppercase text-slate-100">
                Industry-Specific CPM Yield Benchmarks
              </h4>
              <p className="text-[10px] text-slate-500">
                Predicted payout yields ($) per 1,000 views across monetization niches.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
              <DollarSign className="w-3.5 h-3.5" />
              <span>CPM Yield Range</span>
            </div>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PLATFORM_CPM_DATA} layout="vertical" margin={{ top: 5, right: 15, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                <XAxis 
                  type="number" 
                  stroke="#64748B" 
                  fontSize={10} 
                  fontFamily="monospace"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#64748B" 
                  fontSize={10} 
                  fontFamily="monospace"
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={<CustomCPMTooltip />} cursor={{ fill: 'rgba(30, 41, 59, 0.4)' }} />
                <Bar dataKey="cpm" radius={[0, 4, 4, 0]} barSize={14}>
                  {PLATFORM_CPM_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom informational metrics / recent campaigns */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-mono font-bold uppercase text-slate-100">
            RECENT SUCCESSFUL HIGH-TICKET ARBITRAGE CHANNELS
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {RECENT_CONVERSIONS.map((campaign) => (
            <div key={campaign.id} className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-100 truncate max-w-[130px]">
                    {campaign.channel}
                  </span>
                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase bg-slate-900 text-slate-400 border border-slate-800">
                    {campaign.platform}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-slate-500 uppercase block font-semibold">Niche Focus</span>
                <p className="text-xs text-slate-300 font-sans mt-0.5">{campaign.niche}</p>
              </div>

              <div className="pt-2 border-t border-slate-900 flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase">{campaign.status}</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-cyan-400">
                  {campaign.growth}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
