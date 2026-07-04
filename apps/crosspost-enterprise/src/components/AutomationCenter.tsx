import React, { useState } from "react";
import {
  Activity, Clock, Play, AlertCircle, CheckCircle, RefreshCw, Layers, BellRing, Settings, Plus, Trash
} from "lucide-react";

export default function AutomationCenter() {
  const [loading, setLoading] = useState<boolean>(false);
  const [crons, setCrons] = useState([
    { id: 1, trigger: "Daily technical modernization audit", schedule: "0 0 * * *", status: "ENABLED", lastRun: "12 hours ago" },
    { id: 2, trigger: "Sync CrossPost queues to Twitter/LinkedIn", schedule: "*/15 * * * *", status: "ENABLED", lastRun: "12 mins ago" },
    { id: 3, trigger: "Prune system temporary vector embeddings", schedule: "0 0 1 * *", status: "DISABLED", lastRun: "2 weeks ago" }
  ]);

  const [activeJobs, setActiveJobs] = useState([
    { id: "job_1429", action: "Re-generate narrative brief in StoryForge", status: "SUCCESS", retries: "0/3", time: "1 min ago" },
    { id: "job_1430", action: "Import github.com/corp/payment repo", status: "PROCESSING", retries: "1/3", time: "Active" },
    { id: "job_1431", action: "Optimize High-Ticket Consulting Copy", status: "QUEUED", retries: "0/3", time: "Pending" }
  ]);

  const [cronLogs, setCronLogs] = useState<string[]>([
    "[CRON_DAEMON] Automation worker threads listening.",
    "[CRON_DAEMON] Last sync heartbeat successful: 0 failures."
  ]);

  const triggerCronTask = () => {
    setLoading(true);
    const logs = [
      `[CRON_DAEMON] Manually triggering worker thread: job_1430...`,
      `[CRON_DAEMON] Allocating thread lock pool...`,
      `[CRON_DAEMON] Dispatching sync target parameters...`,
      `[CRON_DAEMON] [SUCCESS] job_1430 processing resolved cleanly.`
    ];

    let i = 0;
    const interval = setInterval(() => {
      setCronLogs(prev => [...prev, logs[i]]);
      if (i >= logs.length - 1) {
        clearInterval(interval);
        setLoading(false);
        setActiveJobs(prev => prev.map(job => {
          if (job.id === "job_1430") {
            return { ...job, status: "SUCCESS" };
          }
          return job;
        }));
      } else {
        i++;
      }
    }, 400);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans">
      
      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              Automation & Background Cron Center
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/30 px-2 py-0.5 rounded">
            SCHEDULER ONLINE
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Coordinate background operations, manage recurring cron logs, inspect thread retry status arrays, and monitor high-volume operational task queues.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Recurring crons */}
        <div className="lg:col-span-6 space-y-4">
          <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-zinc-500" />
            Active Cron Schedules
          </h4>

          <div className="space-y-3">
            {crons.map((cron) => (
              <div key={cron.id} className="bg-zinc-950/60 border border-zinc-850 p-4 rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <strong className="text-xs font-mono text-slate-200">{cron.trigger}</strong>
                  <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    cron.status === "ENABLED" ? "bg-emerald-950/40 border-emerald-900/30 text-emerald-400" :
                    "bg-zinc-900 border-zinc-850 text-slate-500"
                  }`}>
                    {cron.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono bg-zinc-950 p-2 rounded border border-zinc-900">
                  <div className="flex justify-between text-slate-450">
                    <span>Cron Pattern:</span>
                    <strong className="text-slate-300">{cron.schedule}</strong>
                  </div>
                  <div className="flex justify-between text-slate-450">
                    <span>Last Fired:</span>
                    <strong className="text-slate-300">{cron.lastRun}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Active Queue Thread Monitor */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-tight flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-zinc-500" />
              Active Task Queue Monitor
            </h4>
            
            <button
              onClick={triggerCronTask}
              disabled={loading}
              className="text-[9.5px] font-mono font-bold bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-500/30 px-3 py-1 rounded cursor-pointer transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              MANUAL WORKER SYNC
            </button>
          </div>

          <div className="space-y-2.5 max-h-[160px] overflow-y-auto scrollbar-thin pr-1">
            {activeJobs.map((job) => (
              <div key={job.id} className="bg-zinc-950/60 border border-zinc-850 p-3 rounded-lg flex justify-between items-center gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-mono text-slate-200 leading-none">{job.action}</strong>
                    <span className="text-[8px] font-mono font-semibold bg-zinc-900 text-slate-500 px-1 py-0.5 rounded uppercase">
                      {job.id}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-600 font-mono">Retries: {job.retries} • Created {job.time}</span>
                </div>

                <span className={`text-[9px] font-mono font-bold flex items-center gap-1 ${
                  job.status === "SUCCESS" ? "text-emerald-400" :
                  job.status === "PROCESSING" ? "text-amber-400 animate-pulse" :
                  "text-slate-500"
                }`}>
                  {job.status === "PROCESSING" && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {job.status}
                </span>
              </div>
            ))}
          </div>

          {/* Cron Logs console */}
          <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 space-y-2 font-mono">
            <span className="text-[9px] font-mono text-slate-500 uppercase block font-semibold">Cron Execution Streams</span>
            <div className="h-28 overflow-y-auto text-[10px] text-zinc-400 space-y-1 select-text scrollbar-thin">
              {cronLogs.map((log, index) => (
                <div key={index} className="text-zinc-500">
                  {log}
                </div>
              ))}
              {loading && <div className="inline-block w-1.5 h-3.5 bg-zinc-650 animate-pulse">_</div>}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
