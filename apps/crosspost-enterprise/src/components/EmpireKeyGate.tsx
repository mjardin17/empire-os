import React, { useCallback, useEffect, useState } from "react";
import { Lock, Unlock, KeyRound } from "lucide-react";
import {
  EMPIRE_OS, KEY_CHANGED_EVENT, LOCKED_EVENT, checkEmpireKey, clearEmpireKey, getEmpireKey, setEmpireKey, type KeyCheck,
} from "../lib/empireOs";

// The "Empire key" bar at the top of the dashboard. When the Empire OS server has EMPIRE_API_KEY set,
// it asks for the key once, keeps it in this browser, and every Empire OS request then carries it.
export default function EmpireKeyGate() {
  const [state, setState] = useState<KeyCheck | "checking">("checking");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const recheck = useCallback(async () => {
    setState(await checkEmpireKey());
  }, []);

  useEffect(() => {
    recheck();
    const onLocked = () => setState(getEmpireKey() ? "wrong-key" : "locked");
    window.addEventListener(LOCKED_EVENT, onLocked);
    window.addEventListener(KEY_CHANGED_EVENT, recheck);
    return () => {
      window.removeEventListener(LOCKED_EVENT, onLocked);
      window.removeEventListener(KEY_CHANGED_EVENT, recheck);
    };
  }, [recheck]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const result = await checkEmpireKey(fetch, EMPIRE_OS, draft.trim());
    if (result === "unlocked") {
      setEmpireKey(draft.trim());
      setDraft("");
      setEditing(false);
      setState("unlocked");
      // Panels loaded while locked show errors; reload so they fetch again with the key.
      window.location.reload();
    } else {
      setState(result === "locked" ? "wrong-key" : result);
    }
    setBusy(false);
  };

  const forget = () => {
    clearEmpireKey();
    setEditing(false);
  };

  // Server without a key, or not reachable (the panels show their own offline state): stay out of the way.
  if (state === "checking" || state === "open" || (state === "offline" && !editing)) return null;

  const locked = state === "locked" || state === "wrong-key";
  if (!locked && !editing) {
    return (
      <div className="flex items-center justify-end gap-2 text-[11px] font-mono text-emerald-300/80" data-testid="empire-key-status">
        <Unlock className="w-3.5 h-3.5" /> Empire OS unlocked
        <button onClick={() => setEditing(true)} className="underline text-slate-400 hover:text-slate-200">change key</button>
        <button onClick={forget} className="underline text-slate-400 hover:text-slate-200">forget key</button>
      </div>
    );
  }

  return (
    <form onSubmit={save} data-testid="empire-key-gate"
      className={`flex flex-col md:flex-row md:items-center gap-3 rounded-xl border p-4 font-mono ${locked ? "border-amber-800/60 bg-amber-950/30" : "border-zinc-800 bg-zinc-900"}`}>
      <div className="flex items-start gap-2 flex-1 text-xs">
        {locked ? <Lock className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" /> : <KeyRound className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
        <div>
          <div className={`font-bold ${locked ? "text-amber-200" : "text-slate-200"}`}>
            {state === "wrong-key" ? "That Empire key was not accepted" : locked ? "Empire OS is locked: enter your Empire key" : "Change your Empire key"}
          </div>
          <div className="text-slate-400">
            The server at {EMPIRE_OS} has EMPIRE_API_KEY set. Enter the same key once; this browser remembers it.
          </div>
        </div>
      </div>
      <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Empire key" autoComplete="current-password"
        className="md:w-72 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-600" />
      <button type="submit" disabled={busy || !draft.trim()}
        className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">
        {busy ? "Checking…" : "Unlock"}
      </button>
      {editing && !locked && (
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-400 underline">cancel</button>
      )}
    </form>
  );
}
