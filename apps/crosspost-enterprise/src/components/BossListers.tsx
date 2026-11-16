import React, { useCallback, useEffect, useState } from "react";
import {
  Award, RefreshCw, AlertTriangle, CheckCircle2, PlugZap, Package, Store, PlusCircle, KeyRound,
} from "lucide-react";
import { EMPIRE_OS, LOCKED_MESSAGE } from "../lib/empireOs";

// The panel talks to the Empire OS server, which proxies /bosslisters/* to the Boss Listers app
// (BOSSLISTERS_BASE_URL on the server, default http://localhost:3001). Posting to selling sites
// stays in Boss Listers: from here you can only read the stock list and add an unlisted draft.

type Connection =
  | { state: "checking" }
  | { state: "empire-offline"; detail: string }
  | { state: "app-down"; url?: string; detail: string }
  | { state: "connected"; url: string; problems: string[] };

interface StageInfo { id: string; label: string }
interface Listing {
  sku: string; title: string; price: number | null; quantity: number | null; condition: string | null;
  status: string; source: string; image_url: string | null; updated_at: string | null; stage: string; missing: string[];
}
interface Platform { marketplace: string; credsPresent: boolean; missing: string[] }

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<{ status: number; body: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

const money = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const STAGE_STYLE: Record<string, string> = {
  intake: "text-amber-300 border-amber-900/50",
  needs_review: "text-sky-300 border-sky-900/50",
  ready: "text-emerald-300 border-emerald-900/50",
  listed: "text-violet-300 border-violet-900/50",
  sold: "text-slate-400 border-zinc-700",
  archived: "text-slate-500 border-zinc-800",
};

export default function BossListers() {
  const [connection, setConnection] = useState<Connection>({ state: "checking" });
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [summary, setSummary] = useState<Record<string, { items: number; units: number }>>({});
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Listing[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState("");
  const [checkOnly, setCheckOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);

    // 1. Is Empire OS up, and does it see Boss Listers?
    let appUrl = "";
    let problems: string[] = [];
    try {
      const { status, body } = await fetchJson(`${EMPIRE_OS}/health`);
      if (status !== 200 || !body) throw new Error(`Empire OS answered HTTP ${status}`);
      const bl = body.modules?.bosslisters;
      if (!bl) {
        setConnection({ state: "app-down", detail: "This Empire OS server has no bosslisters module loaded. Update and restart it." });
        setLoading(false);
        return;
      }
      appUrl = bl.details?.url || "";
      if (bl.status === "unhealthy" || bl.details?.httpStatus) {
        setConnection({ state: "app-down", url: appUrl, detail: bl.details?.reason || `Boss Listers reported ${bl.status}` });
        setItems([]); setPlatforms([]); setSummary({}); setTotal(0);
        setLoading(false);
        return;
      }
      problems = bl.details?.app?.details?.problems || [];
    } catch (err: any) {
      setConnection({ state: "empire-offline", detail: err?.name === "AbortError" ? "timed out" : String(err?.message || err) });
      setItems([]); setPlatforms([]); setSummary({}); setTotal(0);
      setLoading(false);
      return;
    }
    setConnection({ state: "connected", url: appUrl, problems });

    // 2. Stock list and selling-site setup, through Empire OS.
    try {
      const [listings, plats] = await Promise.all([
        fetchJson(`${EMPIRE_OS}/bosslisters/empire/listings?limit=12`),
        fetchJson(`${EMPIRE_OS}/bosslisters/empire/platforms`),
      ]);
      if (listings.status === 502) {
        setConnection({ state: "app-down", url: appUrl, detail: listings.body?.detail || "Boss Listers did not answer" });
        return;
      }
      if (listings.status === 401) {
        setListError(LOCKED_MESSAGE);
        setItems([]); setSummary({}); setTotal(0);
      } else if (listings.status !== 200 || !listings.body?.ok) {
        setListError(listings.body?.error || `Boss Listers answered HTTP ${listings.status}`);
        setItems([]); setSummary({}); setTotal(0);
      } else {
        setStages(listings.body.stages || []);
        setSummary(listings.body.summary || {});
        setTotal(listings.body.total || 0);
        setItems(listings.body.items || []);
      }
      setPlatforms(plats.status === 200 && plats.body?.ok ? plats.body.platforms || [] : []);
    } catch (err: any) {
      setListError(err?.name === "AbortError" ? "Loading the stock list timed out" : String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setAdding(true);
    setAddResult(null);
    try {
      const { status, body } = await fetchJson(`${EMPIRE_OS}/bosslisters/empire/stock/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), price: price === "" ? undefined : Number(price), quantity: Number(quantity || 1), condition: condition.trim() || undefined, dryRun: checkOnly }),
      }, 15000);
      if (status === 401) {
        setAddResult({ ok: false, message: LOCKED_MESSAGE });
      } else if (status === 502) {
        setAddResult({ ok: false, message: "Boss Listers is not running, so nothing was added." });
      } else if (!body?.ok) {
        setAddResult({ ok: false, message: body?.error || `Boss Listers answered HTTP ${status}` });
      } else if (body.dryRun) {
        setAddResult({ ok: true, message: `Looks good: "${body.wouldCreate.title}" would be saved as an unlisted draft (stage: ${body.wouldCreate.stage}). Check only, so nothing was saved.` });
      } else {
        setAddResult({ ok: true, message: `Added "${body.item.title}" (${body.item.sku}) to your stock list as an unlisted draft. Nothing was posted to any selling site.` });
        setTitle(""); setPrice(""); setQuantity("1"); setCondition("");
        refresh();
      }
    } catch (err: any) {
      setAddResult({ ok: false, message: `Could not reach Empire OS at ${EMPIRE_OS}: ${err?.message || err}` });
    } finally {
      setAdding(false);
    }
  };

  const connected = connection.state === "connected";
  const input = "w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-700";

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-5 animate-fade-in font-sans" data-testid="bosslisters-panel">
      <div className="flex justify-between items-center border-b border-zinc-850 pb-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">Boss Listers</h3>
          <span className="text-[10px] font-mono text-slate-500">stock list · selling sites</span>
        </div>
        <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded border border-zinc-800 text-slate-300 hover:bg-zinc-800 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Connection */}
      <div data-testid="bosslisters-connection">
        {connection.state === "checking" && (
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400"><RefreshCw className="w-4 h-4 animate-spin" /> Checking Empire OS at {EMPIRE_OS}…</div>
        )}
        {connection.state === "empire-offline" && (
          <div className="flex gap-2 text-xs font-mono text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div>
              <div className="font-bold">Empire OS is not reachable at {EMPIRE_OS}</div>
              <div className="text-red-300/80">{connection.detail}. Start it with <code>pnpm start</code> (port 4000), or set VITE_EMPIRE_OS_URL.</div>
            </div>
          </div>
        )}
        {connection.state === "app-down" && (
          <div className="flex gap-2 text-xs font-mono text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg p-3">
            <PlugZap className="w-4 h-4 shrink-0" />
            <div>
              <div className="font-bold">Boss Listers is not connected{connection.url ? ` (${connection.url})` : ""}</div>
              <div className="text-amber-300/80">{connection.detail}. Start Boss Listers (<code>npm run dev</code>, port 3001) or set BOSSLISTERS_BASE_URL on the Empire OS server.</div>
            </div>
          </div>
        )}
        {connected && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
              <CheckCircle2 className="w-4 h-4" /> Boss Listers connected at {connection.url} via Empire OS {EMPIRE_OS}
            </div>
            {connection.problems.length > 0 && (
              <div className="flex gap-2 text-[11px] font-mono text-amber-300/90 bg-amber-950/20 border border-amber-900/40 rounded p-2">
                <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>Not fully set up: {connection.problems.join("; ")}. Set the same value as EMPIRE_SHARED_KEY (Boss Listers) and BOSSLISTERS_EMPIRE_KEY (Empire OS).</div>
              </div>
            )}
          </div>
        )}
      </div>

      {connected && listError && (
        <div className="text-xs font-mono text-red-300 bg-red-950/30 border border-red-900/50 rounded p-2.5">Stock list: {listError}</div>
      )}

      {/* Stage totals */}
      {connected && !listError && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2" data-testid="bosslisters-stages">
          {(stages.length ? stages : Object.keys(summary).map((id) => ({ id, label: id }))).map((s) => (
            <div key={s.id} className={`bg-zinc-950/60 border rounded-lg p-2.5 ${STAGE_STYLE[s.id] || "border-zinc-800 text-slate-300"}`}>
              <div className="text-[10px] font-mono uppercase tracking-wider opacity-80">{s.label}</div>
              <div className="text-lg font-mono font-black">{summary[s.id]?.items ?? 0}</div>
              <div className="text-[10px] font-mono opacity-70">{summary[s.id]?.units ?? 0} units</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Newest items */}
        <div className="lg:col-span-2 bg-zinc-950/50 border border-zinc-850 rounded-lg p-4 space-y-2">
          <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Package className="w-4 h-4 text-zinc-500" /> Newest items {connected && !listError && `(${items.length} of ${total})`}
          </h4>
          {connected && !loading && !listError && items.length === 0 && <div className="text-xs font-mono text-slate-500">Your stock list is empty.</div>}
          <ul className="space-y-1.5 max-h-80 overflow-auto" data-testid="bosslisters-items">
            {items.map((i) => (
              <li key={i.sku} className="flex items-center gap-2.5 text-[11px] font-mono bg-zinc-900 border border-zinc-850 rounded px-2.5 py-1.5">
                {i.image_url ? <img src={i.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" /> : <div className="w-8 h-8 rounded bg-zinc-800 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-slate-200 truncate">{i.title}</div>
                  <div className="text-slate-500 truncate">{i.sku} · {i.source} · {formatDate(i.updated_at)}{i.stage === "intake" && i.missing?.length ? ` · needs ${i.missing.join(", ")}` : ""}</div>
                </div>
                <span className="text-slate-300 shrink-0">{money(i.price)} × {i.quantity ?? 0}</span>
                <span className={`px-1.5 py-0.5 rounded border shrink-0 ${STAGE_STYLE[i.stage] || "border-zinc-700 text-slate-300"}`}>{i.stage.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          {/* Selling sites */}
          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-4 space-y-2">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Store className="w-4 h-4 text-zinc-500" /> Selling sites
            </h4>
            {connected && platforms.length === 0 && <div className="text-[11px] font-mono text-slate-500">Not available.</div>}
            <div className="flex flex-wrap gap-1.5" data-testid="bosslisters-platforms">
              {platforms.map((p) => (
                <span key={p.marketplace} title={p.credsPresent ? "Credentials set" : `Missing: ${(p.missing || []).join(", ")}`}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${p.credsPresent ? "text-emerald-300 border-emerald-900/50" : "text-slate-500 border-zinc-800"}`}>
                  {p.credsPresent ? "●" : "○"} {p.marketplace.replace("_", " ")}
                </span>
              ))}
            </div>
            <div className="text-[10px] font-mono text-slate-600">Credentials set or not. No live calls; posting happens in Boss Listers.</div>
          </div>

          {/* Add a draft */}
          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-4 space-y-2">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-zinc-500" /> Add to stock list
            </h4>
            <input className={input} placeholder="Item name" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!connected} />
            <div className="grid grid-cols-3 gap-2">
              <input className={input} placeholder="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!connected} />
              <input className={input} placeholder="Qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!connected} />
              <input className={input} placeholder="Condition" value={condition} onChange={(e) => setCondition(e.target.value)} disabled={!connected} />
            </div>
            <label className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <input type="checkbox" checked={checkOnly} onChange={(e) => setCheckOnly(e.target.checked)} /> Check only (save nothing)
            </label>
            <button onClick={handleAdd} disabled={!connected || adding || !title.trim()}
              className="w-full text-xs font-mono font-bold px-3 py-1.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white disabled:opacity-40">
              {adding ? "Working…" : checkOnly ? "Check item" : "Add as unlisted draft"}
            </button>
            <div className="text-[10px] font-mono text-slate-600">Saved as a draft in Boss Listers' stock list. Never posted to a selling site.</div>
            {addResult && (
              <div className={`text-[11px] font-mono rounded p-2 border ${addResult.ok ? "text-emerald-300 border-emerald-900/50 bg-emerald-950/20" : "text-red-300 border-red-900/50 bg-red-950/20"}`}>{addResult.message}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
