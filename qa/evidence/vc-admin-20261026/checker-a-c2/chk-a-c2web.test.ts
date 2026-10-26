/** Checker A cycle-2: R9 per-e-mail login guard must never fail closed (apps/web). Run in a throwaway copy. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginGuard, handleSessionLogin, type SessionDeps } from "../src/app/admin/_lib/session-handlers";

const login = (email: string) =>
  new Request("http://admin.test/api/admin-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "x" }) });
const mk = () => {
  let upstream = 0;
  const deps: SessionDeps = {
    upstreamBase: "http://api.test:9000",
    fetch: (async () => { upstream++; return new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 }); }) as typeof fetch,
    loginGuard: createLoginGuard(),
  };
  return { deps, ups: () => upstream };
};

test("C2-R9 (the cycle-1 probe, inverted): 10,000 fresh attacker e-mails, then a legit admin's first login reaches upstream (401, not 429)", async () => {
  const { deps, ups } = mk();
  const t0 = Date.now();
  for (let i = 0; i < 10_000; i++) await handleSessionLogin(login(`bot${i}@x.test`), deps);
  const before = ups();
  const legit = await handleSessionLogin(login("super@vc.test"), deps);
  console.log("R9c2 flood ms", Date.now() - t0, "legit status", legit.status, "upstream reached", ups() > before);
  assert.equal(legit.status, 401);
  assert.ok(ups() > before);
  for (let i = 0; i < 30_000; i++) await handleSessionLogin(login(`bot2-${i}@x.test`), deps);
  assert.equal((await handleSessionLogin(login("another-admin@vc.test"), deps)).status, 401);
});

test("C2-R9 per-key limit intact: a guessed-at e-mail locks at the 6th attempt, other keys unaffected; case/whitespace variants of the e-mail", async () => {
  const { deps } = mk();
  const st: number[] = [];
  for (let i = 0; i < 8; i++) st.push((await handleSessionLogin(login("victim@vc.test"), deps)).status);
  console.log("R9c2 victim statuses", st.join(","));
  assert.deepEqual(st, [401, 401, 401, 401, 401, 429, 429, 429]);
  assert.equal((await handleSessionLogin(login("other@vc.test"), deps)).status, 401);
  const variants = [] as number[];
  for (const e of ["VICTIM@vc.test", " victim@vc.test", "victim@vc.test "]) variants.push((await handleSessionLogin(login(e), deps)).status);
  console.log("R9c2 victim case/space variants", variants.join(","));
});

test("C2-R9 direct: LRU eviction when full evicts the least recently used, a locked key under maxKeys stays locked", () => {
  let t = 1_000_000;
  const g = createLoginGuard({ limit: 2, windowMs: 60_000, maxKeys: 3, now: () => t });
  assert.equal(g.check("a"), true); assert.equal(g.check("a"), true); assert.equal(g.check("a"), false);
  assert.equal(g.check("b"), true); assert.equal(g.check("c"), true);
  assert.equal(g.check("a"), false, "a still locked, now most recently used");
  assert.equal(g.check("d"), true, "full: evicts the LRU key (b), does not refuse d");
  assert.equal(g.check("a"), false, "a was touched last, kept");
  const g1 = createLoginGuard({ maxKeys: 0 });
  assert.equal(g1.check("z"), true);
});
