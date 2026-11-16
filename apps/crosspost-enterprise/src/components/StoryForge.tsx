import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen, Play, RefreshCw, AlertTriangle, CheckCircle2, FileText, Download, PlugZap, Factory,
} from "lucide-react";
import { EMPIRE_OS, LOCKED_MESSAGE } from "../lib/empireOs";

// The panel talks to the Empire OS server, which proxies /storyforge/* to the Bookmaker
// book studio (STORYFORGE_BASE_URL on the server, default http://localhost:3010).

type Connection =
  | { state: "checking" }
  | { state: "empire-offline"; detail: string }
  | { state: "bookmaker-down"; url?: string; detail: string }
  | { state: "connected"; url: string };

interface BookFiles { epub?: string; pdf?: string; manuscript?: string; cover?: string }
interface Book { id: string; title: string; files: BookFiles; kdpPackages?: number; updatedAt: string | null }
interface FactoryRun {
  id: string; projectId: string; title: string; niche: string; mode: string;
  status: string; waitingGate: string | null; createdAt: string;
}

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

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export default function StoryForge() {
  const [connection, setConnection] = useState<Connection>({ state: "checking" });
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [runs, setRuns] = useState<FactoryRun[]>([]);

  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("");
  const [validateOnly, setValidateOnly] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setListError(null);

    // 1. Is Empire OS up, and does it see Bookmaker?
    let bookmakerUrl: string | undefined;
    try {
      const { status, body } = await fetchJson(`${EMPIRE_OS}/health`);
      if (status !== 200 || !body) throw new Error(`Empire OS answered HTTP ${status}`);
      const sf = body.modules?.storyforge;
      if (!sf) {
        setConnection({ state: "bookmaker-down", detail: "This Empire OS server has no storyforge module loaded. Update and restart it." });
        setLoadingList(false);
        return;
      }
      bookmakerUrl = sf.details?.url;
      if (sf.status !== "healthy") {
        setConnection({ state: "bookmaker-down", url: bookmakerUrl, detail: sf.details?.reason || `Bookmaker reported ${sf.status}` });
        setBooks([]);
        setRuns([]);
        setLoadingList(false);
        return;
      }
    } catch (err: any) {
      setConnection({ state: "empire-offline", detail: err?.name === "AbortError" ? "timed out" : String(err?.message || err) });
      setBooks([]);
      setRuns([]);
      setLoadingList(false);
      return;
    }

    // 2. List books and factory runs through Empire OS.
    try {
      const { status, body } = await fetchJson(`${EMPIRE_OS}/storyforge/empire/books`);
      if (status === 401) {
        setConnection({ state: "connected", url: bookmakerUrl || "" });
        setListError(LOCKED_MESSAGE);
      } else if (status === 502) {
        setConnection({ state: "bookmaker-down", url: bookmakerUrl, detail: body?.detail || "Bookmaker did not answer" });
      } else if (status !== 200 || !body?.success) {
        setConnection({ state: "connected", url: bookmakerUrl || "" });
        setListError(body?.error || `Bookmaker answered HTTP ${status}${status === 404 ? " (is Bookmaker on a version with /empire/books?)" : ""}`);
      } else {
        setConnection({ state: "connected", url: bookmakerUrl || "" });
        setBooks(body.books || []);
        setRuns(body.runs || []);
      }
    } catch (err: any) {
      setListError(err?.name === "AbortError" ? "Listing books timed out" : String(err?.message || err));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleStart = async () => {
    if (!title.trim()) return;
    setStarting(true);
    setStartResult(null);
    try {
      const { status, body } = await fetchJson(`${EMPIRE_OS}/storyforge/empire/books/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), niche: niche.trim() || undefined, dryRun: validateOnly }),
      }, 15000);
      if (status === 401) {
        setStartResult({ ok: false, message: LOCKED_MESSAGE });
      } else if (status === 502) {
        setStartResult({ ok: false, message: "Bookmaker is not running, so the book was not started." });
        setConnection({ state: "bookmaker-down", detail: body?.detail || "Bookmaker did not answer" });
      } else if (!body?.success) {
        setStartResult({ ok: false, message: body?.error || `Bookmaker answered HTTP ${status}` });
      } else if (body.dryRun) {
        setStartResult({ ok: true, message: `Bookmaker accepted "${body.wouldCreate.title}" (project ${body.wouldCreate.projectId}). Validate only, so nothing was created.` });
      } else {
        setStartResult({ ok: true, message: `Book Factory run ${body.run.id} created for "${body.run.title}" (${body.run.mode}). Run its stages from Bookmaker's Book Factory.` });
        setTitle("");
        refresh();
      }
    } catch (err: any) {
      setStartResult({ ok: false, message: `Could not reach Empire OS at ${EMPIRE_OS}: ${err?.message || err}` });
    } finally {
      setStarting(false);
    }
  };

  const bookmakerUrl = connection.state === "connected" ? connection.url : "";
  const fileLink = (rel?: string) => (rel && bookmakerUrl ? `${bookmakerUrl}${rel}` : undefined);
  const canStart = connection.state === "connected" && !starting && !!title.trim();

  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-5 space-y-6 animate-fade-in font-sans" data-testid="storyforge-panel">

      {/* Header */}
      <div className="border-b border-zinc-850 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-mono font-black text-slate-200 uppercase tracking-tight">
              StoryForge · Bookmaker
            </h3>
          </div>
          <button
            onClick={refresh}
            disabled={loadingList}
            className="text-[10px] font-mono font-bold text-slate-300 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded flex items-center gap-1 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loadingList ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Your Bookmaker book studio, through Empire OS. Lists your finished books and Book Factory runs, and starts new books.
        </p>
      </div>

      {/* Connection status */}
      <div data-testid="bookmaker-status">
        {connection.state === "checking" && (
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-zinc-950/50 border border-zinc-850 rounded p-3">
            <RefreshCw className="w-4 h-4 animate-spin" /> Checking Empire OS at {EMPIRE_OS}…
          </div>
        )}
        {connection.state === "empire-offline" && (
          <div className="flex items-start gap-2 text-xs font-mono text-amber-300 bg-amber-950/30 border border-amber-900/40 rounded p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold">Empire OS is not reachable at {EMPIRE_OS}</div>
              <div className="text-amber-200/70">Start it with <code>pnpm start</code> in empire-os ({connection.detail}).</div>
            </div>
          </div>
        )}
        {connection.state === "bookmaker-down" && (
          <div className="flex items-start gap-2 text-xs font-mono text-amber-300 bg-amber-950/30 border border-amber-900/40 rounded p-3">
            <PlugZap className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold">Bookmaker is not running{connection.url ? ` at ${connection.url}` : ""}</div>
              <div className="text-amber-200/70">Start it with <code>npm run dev</code> in the bookmaker folder, then press Refresh. ({connection.detail})</div>
            </div>
          </div>
        )}
        {connection.state === "connected" && (
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-300 bg-emerald-950/30 border border-emerald-900/40 rounded p-3">
            <CheckCircle2 className="w-4 h-4" /> Bookmaker connected at {connection.url} via Empire OS {EMPIRE_OS}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Start a book */}
        <div className="lg:col-span-5 bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Factory className="w-4 h-4 text-zinc-500" /> Start a book
            </h4>
            <p className="text-[10px] text-slate-500">
              Creates a Book Factory run in Bookmaker (dry-run mode, no AI calls yet). You run and approve its stages in Bookmaker.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Book title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Little Zeus and the Storm Giant"
              className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase">Niche (optional)</label>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. kids-mythology"
              className="w-full bg-zinc-950 border border-zinc-850 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <input type="checkbox" checked={validateOnly} onChange={(e) => setValidateOnly(e.target.checked)} />
            Validate only (don't create the run)
          </label>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full bg-indigo-650 hover:bg-indigo-600 text-white font-mono text-xs font-bold uppercase tracking-wider py-2.5 px-4 rounded-md transition flex justify-center items-center gap-1.5 disabled:opacity-50"
          >
            {starting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending to Bookmaker…</> : <><Play className="w-4 h-4" /> {validateOnly ? "Validate book" : "Start book"}</>}
          </button>
          {connection.state !== "connected" && connection.state !== "checking" && (
            <p className="text-[10px] font-mono text-amber-400/80">Starting a book needs Bookmaker running.</p>
          )}
          {startResult && (
            <div
              data-testid="start-result"
              className={`text-[11px] font-mono rounded p-2 border ${startResult.ok ? "text-emerald-300 bg-emerald-950/30 border-emerald-900/40" : "text-red-300 bg-red-950/30 border-red-900/40"}`}
            >
              {startResult.message}
            </div>
          )}
        </div>

        {/* Books and runs */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-3">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-zinc-500" /> Your books {connection.state === "connected" && `(${books.length})`}
            </h4>
            {loadingList && <div className="text-xs font-mono text-slate-500 flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> Loading books…</div>}
            {listError && <div className="text-xs font-mono text-red-300 bg-red-950/30 border border-red-900/40 rounded p-2">Could not list books: {listError}</div>}
            {!loadingList && !listError && connection.state === "connected" && books.length === 0 && (
              <div className="text-xs font-mono text-slate-500">No finished books in Bookmaker's output_books folder yet.</div>
            )}
            <ul className="space-y-2" data-testid="book-list">
              {books.map((b) => (
                <li key={b.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-850 rounded p-2.5">
                  {fileLink(b.files.cover)
                    ? <img src={fileLink(b.files.cover)} alt="" className="w-9 h-12 object-cover rounded border border-zinc-800" />
                    : <div className="w-9 h-12 rounded border border-zinc-800 bg-zinc-950 flex items-center justify-center"><FileText className="w-4 h-4 text-zinc-600" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">{b.title}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      Updated {formatDate(b.updatedAt)}{b.kdpPackages ? ` · ${b.kdpPackages} KDP package${b.kdpPackages === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {(["epub", "pdf", "manuscript"] as const).map((k) => fileLink(b.files[k]) && (
                      <a key={k} href={fileLink(b.files[k])} target="_blank" rel="noreferrer"
                        className="text-[9px] font-mono font-bold uppercase text-indigo-300 bg-indigo-950/40 border border-indigo-900/40 px-1.5 py-0.5 rounded flex items-center gap-0.5 hover:bg-indigo-900/40">
                        <Download className="w-3 h-3" />{k === "manuscript" ? "text" : k}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-zinc-950/50 border border-zinc-850 rounded-lg p-5 space-y-3">
            <h4 className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Factory className="w-4 h-4 text-zinc-500" /> Book Factory runs {connection.state === "connected" && `(${runs.length})`}
            </h4>
            {connection.state === "connected" && !loadingList && runs.length === 0 && (
              <div className="text-xs font-mono text-slate-500">No factory runs yet.</div>
            )}
            <ul className="space-y-1.5 max-h-64 overflow-auto" data-testid="run-list">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-[11px] font-mono bg-zinc-900 border border-zinc-850 rounded px-2.5 py-1.5">
                  <span className="text-slate-200 truncate">{r.title} <span className="text-slate-500">· {r.niche}</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-500">{formatDate(r.createdAt)}</span>
                    <span className={`px-1.5 py-0.5 rounded border ${r.status === "completed" ? "text-emerald-300 border-emerald-900/50" : r.status === "failed" ? "text-red-300 border-red-900/50" : "text-slate-300 border-zinc-700"}`}>
                      {r.waitingGate ? `waiting: ${r.waitingGate}` : r.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
