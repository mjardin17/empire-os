// The Empire OS server every panel talks to, and its key.
//
// URL: default http://localhost:4000 (Boss Listers keeps 3001). Set VITE_EMPIRE_OS_URL in
// apps/crosspost-enterprise/.env to point somewhere else.
//
// Key: when the server has EMPIRE_API_KEY set, every call except /health needs the header
// X-Empire-Api-Key. The dashboard asks for the key once (the "Empire key" bar at the top) and keeps
// it in this browser's localStorage. installEmpireFetch() adds the header to every request to
// EMPIRE_OS, so no panel has to know about it, and reports a 401 as "locked".
// VITE_EMPIRE_API_KEY is an optional local-only fallback: Vite builds it into the page's JavaScript,
// so only use it on your own machine, never for a build anyone else can open.

const env = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;

export const EMPIRE_OS: string = env.VITE_EMPIRE_OS_URL?.trim().replace(/\/+$/, "") || "http://localhost:4000";

export const KEY_STORAGE = "empireOs.apiKey";
export const KEY_HEADER = "X-Empire-Api-Key";
export const LOCKED_EVENT = "empire-os:locked";
export const KEY_CHANGED_EVENT = "empire-os:key-changed";
/** What a panel shows when Empire OS answers 401. */
export const LOCKED_MESSAGE = "Empire OS is locked: enter your Empire key in the bar at the top of the page.";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The saved key, else the build-time VITE_EMPIRE_API_KEY, else "". */
export function getEmpireKey(store: Storage | null = storage(), buildKey: string | undefined = env.VITE_EMPIRE_API_KEY): string {
  return (store?.getItem(KEY_STORAGE) || buildKey || "").trim();
}

export function setEmpireKey(key: string, store: Storage | null = storage()): void {
  const k = key.trim();
  if (k) store?.setItem(KEY_STORAGE, k);
  else store?.removeItem(KEY_STORAGE);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
}

export const clearEmpireKey = (store: Storage | null = storage()) => setEmpireKey("", store);

/** Does this request go to the Empire OS server? (Only those get the key.) */
export function isEmpireUrl(url: string, base: string = EMPIRE_OS): boolean {
  return url === base || url.startsWith(base + "/") || url.startsWith(base + "?");
}

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

/**
 * Wraps a fetch so requests to Empire OS carry the key, and a 401 from Empire OS fires LOCKED_EVENT.
 * Other URLs pass through untouched (the key never goes anywhere else).
 */
export function withEmpireKey(
  baseFetch: typeof fetch,
  opts: { base?: string; getKey?: () => string; onLocked?: (url: string) => void } = {},
): typeof fetch {
  const base = opts.base ?? EMPIRE_OS;
  const getKey = opts.getKey ?? (() => getEmpireKey());
  const onLocked = opts.onLocked ?? ((url: string) => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LOCKED_EVENT, { detail: { url } }));
  });
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (!isEmpireUrl(url, base)) return baseFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const key = getKey();
    if (key && !headers.has(KEY_HEADER)) headers.set(KEY_HEADER, key);
    const res = await baseFetch(input, { ...init, headers });
    if (res.status === 401) onLocked(url);
    return res;
  };
}

let installed = false;
/** Call once at startup (main.tsx): every fetch to Empire OS then carries the key. */
export function installEmpireFetch(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.fetch = withEmpireKey(window.fetch.bind(window));
}

export type KeyCheck = "unlocked" | "locked" | "wrong-key" | "open" | "offline";

/**
 * Asks Empire OS whether the current key works. /providers is protected; /health is not.
 * "open" = the server has no key set (auth off).
 */
export async function checkEmpireKey(doFetch: typeof fetch = fetch, base: string = EMPIRE_OS, key: string = getEmpireKey()): Promise<KeyCheck> {
  try {
    const headers: Record<string, string> = key ? { [KEY_HEADER]: key } : {};
    const res = await doFetch(`${base}/providers`, { headers, signal: AbortSignal.timeout(5000) });
    if (res.status === 401) return key ? "wrong-key" : "locked";
    if (!res.ok) return "offline";
    return key ? "unlocked" : "open";
  } catch {
    return "offline";
  }
}
