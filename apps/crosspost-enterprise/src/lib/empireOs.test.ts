// Run: pnpm --filter react-example test   (node:test via tsx; no browser needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_HEADER, KEY_STORAGE, checkEmpireKey, clearEmpireKey, getEmpireKey, isEmpireUrl, setEmpireKey, withEmpireKey } from "./empireOs.ts";

const BASE = "http://localhost:4000";
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
type Call = { url: string; headers: Headers };
const fakeFetch = (status = 200) => {
  const calls: Call[] = [];
  const f = (async (input: any, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response("{}", { status });
  }) as typeof fetch;
  return { f, calls };
};

test("key storage: save, read, forget, build-time fallback", () => {
  const s = memStore();
  assert.equal(getEmpireKey(s, undefined), "");
  setEmpireKey("  abc  ", s);
  assert.equal(s.m.get(KEY_STORAGE), "abc");
  assert.equal(getEmpireKey(s, "build"), "abc");
  clearEmpireKey(s);
  assert.equal(getEmpireKey(s, undefined), "");
  assert.equal(getEmpireKey(s, "build"), "build");
});

test("isEmpireUrl only matches the Empire OS server", () => {
  assert.ok(isEmpireUrl(`${BASE}/health`, BASE));
  assert.ok(isEmpireUrl(BASE, BASE));
  assert.ok(!isEmpireUrl("http://localhost:40001/x", BASE));
  assert.ok(!isEmpireUrl("http://localhost:3000/api/x", BASE));
  assert.ok(!isEmpireUrl("https://api.example.com/", BASE));
});

test("withEmpireKey adds the header to Empire OS calls only", async () => {
  const { f, calls } = fakeFetch();
  const wrapped = withEmpireKey(f, { base: BASE, getKey: () => "k1", onLocked: () => {} });
  await wrapped(`${BASE}/providers`, { headers: { "Content-Type": "application/json" } });
  await wrapped("http://localhost:3000/api/posts");
  assert.equal(calls[0].headers.get(KEY_HEADER), "k1");
  assert.equal(calls[0].headers.get("Content-Type"), "application/json");
  assert.equal(calls[1].headers.get(KEY_HEADER), null, "the key must never go to other servers");
});

test("withEmpireKey sends nothing when no key is saved, and keeps an explicit header", async () => {
  const { f, calls } = fakeFetch();
  const wrapped = withEmpireKey(f, { base: BASE, getKey: () => "", onLocked: () => {} });
  await wrapped(`${BASE}/providers`);
  await wrapped(`${BASE}/providers`, { headers: { [KEY_HEADER]: "explicit" } });
  assert.equal(calls[0].headers.get(KEY_HEADER), null);
  assert.equal(calls[1].headers.get(KEY_HEADER), "explicit");
});

test("withEmpireKey reports a 401 from Empire OS as locked", async () => {
  const locked: string[] = [];
  const { f } = fakeFetch(401);
  const wrapped = withEmpireKey(f, { base: BASE, getKey: () => "", onLocked: (u) => locked.push(u) });
  const res = await wrapped(`${BASE}/providers`);
  assert.equal(res.status, 401);
  assert.deepEqual(locked, [`${BASE}/providers`]);
  await wrapped("http://other.test/x");
  assert.equal(locked.length, 1, "401s from other servers are not Empire OS being locked");
});

test("checkEmpireKey reads the server's answer", async () => {
  assert.equal(await checkEmpireKey(fakeFetch(200).f, BASE, ""), "open");
  assert.equal(await checkEmpireKey(fakeFetch(200).f, BASE, "k"), "unlocked");
  assert.equal(await checkEmpireKey(fakeFetch(401).f, BASE, ""), "locked");
  assert.equal(await checkEmpireKey(fakeFetch(401).f, BASE, "k"), "wrong-key");
  assert.equal(await checkEmpireKey((async () => { throw new Error("down"); }) as any, BASE, "k"), "offline");
  const { f, calls } = fakeFetch(200);
  await checkEmpireKey(f, BASE, "k2");
  assert.equal(calls[0].url, `${BASE}/providers`);
  assert.equal(calls[0].headers.get(KEY_HEADER), "k2");
});
