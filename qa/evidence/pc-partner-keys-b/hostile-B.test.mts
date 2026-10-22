/**
 * Checker B hostile variants for pc-partner-keys cycle 0. Lives OUTSIDE the bound tree; imports the worktree's src and fixtures by file URL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const W = "file:///D:/vc/.worktrees/pc-partner-keys/apps/api";
const P: any = await import(`${W}/src/partners.ts`);
const S: any = await import(`${W}/src/server.ts`);
const AF: any = await import(`${W}/tests/anonymous-fixtures.ts`);
const CF: any = await import(`${W}/tests/chat-fixtures.ts`);
const MAIN: any = await import(`${W}/src/main.ts`);
const DBT: any = await import("file:///D:/vc/.worktrees/pc-partner-keys/packages/db/src/testing.ts").catch(() => undefined);
const testing: any = DBT;
const ANONYMOUS_PATH = "/v1/public/chat/turns";
const { addPartner, createMongoPartnerStore, createPartnerRegistry, revokePartner, rotatePartner, withPartnerRoutes, runPartnerCli, listPartners } = P;
const { anonWorld, ask, anonRequest, nonEmptyCollections, gatesFixture, kbAnswerProvider, SKILLS_DIR, cleanupGates, captureOutput } = AF;
const { chatWorld, call, threadsPath, turnsPath, GERMANY_QUESTION, CRISIS_TEXT } = CF;

const PEPPER = "checker-b-pepper-".padEnd(40, "z");
const T0 = Date.parse("2026-11-01T10:00:00.000Z");

function pworld() {
  const { db, fakeDb } = testing.createFakeDb();
  const store = createMongoPartnerStore(db);
  const clock = { ms: T0 };
  const registry = createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => clock.ms });
  return {
    store, clock, registry, fakeDb,
    async add(name: string, origins: string[] = [], id?: string) {
      const r = await addPartner(store, { name, origins, ...(id ? { id } : {}) }, { pepper: PEPPER, now: () => new Date(clock.ms) });
      return { id: r.partner.partnerId as string, pub: r.keys.pub as string, srv: r.keys.srv as string };
    },
  };
}
const body = (r: any) => `${r.status} ${JSON.stringify(Object.entries(r.headers).sort())} ${r.body}`;
const sh = (id: string, extra: Record<string, any> = {}) => ({ "x-vc-student-id": id, "x-vc-student-age": "25", ...extra });

test("H1 malformed keys: one uniform 401 on the public route and on the student route, fast, nothing reached", async () => {
  const p = pworld();
  const a = await p.add("Alpha", ["https://alpha.example"], "alpha");
  const secret = a.pub.slice(-43);
  const A43 = "A".repeat(43);
  const bad: string[] = [
    `${a.pub}_extra`, `${a.pub}_`, `vck_pub_alpha__${secret}`, `vck_pub__alpha_${secret}`, `vck__pub_alpha_${secret}`, `vck_pub_alpha_${secret}_${secret}`,
    `vck_pub_alph\u0430_${secret}`, `vck_pub_alpha_${secret.slice(0, 42)}\u00e9`, `vck_pub_alpha_${secret.slice(0, 42)}\uff21`, `vck_pub_\uff41lpha_${secret}`,
    `${a.pub}\u0000`, `${a.pub}\u200b`, `\u200b${a.pub}`, `vck_pub_alpha_${secret.slice(0, 20)}\u200b${secret.slice(20, 42)}`, a.pub.toUpperCase(), a.pub.replace("vck_pub", "vck_Pub"),
    "vck_".repeat(2500), "A".repeat(10 * 1024), `vck_pub_alpha_${"A".repeat(10 * 1024)}`, `vck_pub_${"a".repeat(10 * 1024)}_${A43}`, "_".repeat(10 * 1024), "vck_pub_" + "-".repeat(10 * 1024),
    "\u{1F511}".repeat(200), "%76%63%6b_pub_alpha_" + secret, "null", "undefined", "{}", "[]", "0",
  ];
  const w = anonWorld({ deps: { partners: p.registry } });
  const c = chatWorld({ deps: { partners: p.registry } });
  try {
    const refRes = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": `vck_pub_nobody_${A43}` } });
    const seen = new Set<string>([body(refRes)]);
    const refChat = await call(c, "POST", threadsPath("stu-1"), { token: "not.a.jwt" });
    const seenChat = new Set<string>([body(refChat)]);
    let worst = 0;
    for (const k of bad) {
      const t0 = performance.now();
      const r = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": k } });
      worst = Math.max(worst, performance.now() - t0);
      assert.equal(r.status, 401, JSON.stringify(k.slice(0, 60)));
      seen.add(body(r));
      const rc = await call(c, "POST", threadsPath("stu-1"), { token: k.startsWith("vck_") ? k : `vck_${k}`, headers: sh("stu-1") });
      assert.equal(rc.status, 401, "chat " + JSON.stringify(k.slice(0, 60)));
      seenChat.add(body(rc));
    }
    assert.equal(seen.size, 1, "public route: one uniform 401");
    assert.equal(seenChat.size, 1, "student route: one uniform 401");
    assert.equal(w.kb.calls.length, 0);
    assert.equal(w.counterCalls.length, 0);
    assert.equal(c.provider.calls.length, 0);
    assert.ok(worst < 200, `worst single rejection ${worst} ms`);
    console.log(`H1 worst rejection ms=${worst.toFixed(2)} cases=${bad.length}`);
  } finally { w.cleanup(); c.cleanup(); }
});

test("H2 cross scope and cross partner: srv key A on partner B's student, pub key on student routes, srv key on the public route and in the wrong header", async () => {
  const p = pworld();
  const a = await p.add("Alpha", ["https://alpha.example"], "alpha");
  const b = await p.add("Bravo", ["https://bravo.example"], "bravo");
  const c = chatWorld({ deps: { partners: p.registry } });
  const w = anonWorld({ deps: { partners: p.registry } });
  const wreq = anonWorld({ deps: { partners: p.registry, partnerKeyRequired: true } });
  try {
    const th = await call(c, "POST", threadsPath("stu-b"), { token: b.srv, headers: sh("stu-b") });
    assert.equal(th.status, 201);
    const turn = await call(c, "POST", turnsPath("stu-b", th.json.threadId), { token: b.srv, headers: sh("stu-b"), body: { text: GERMANY_QUESTION, clientTurnId: "b-1" } });
    assert.equal(turn.status, 200);
    const calls = c.provider.calls.length;
    const docsBefore = JSON.stringify(c.fakeDb.collection("chat_turns").all()) + JSON.stringify(c.fakeDb.collection("chat_threads").all());
    // A tries every read/write at B's student and thread, with its own server key, claiming the same student id
    for (const [m, path, bd] of [["GET", `${threadsPath("stu-b")}/${th.json.threadId}`, undefined], ["POST", turnsPath("stu-b", th.json.threadId), { text: "hello", clientTurnId: "a-1" }], ["POST", `${threadsPath("stu-b")}/${th.json.threadId}/turns/b-1`, undefined]] as const) {
      const r = await call(c, m, path, { token: a.srv, headers: sh("stu-b"), ...(bd ? { body: bd } : {}) });
      assert.ok(r.status === 404 || r.status === 405, `${m} ${path} -> ${r.status}`);
      assert.notEqual(r.status, 200);
    }
    const docsAfter = JSON.stringify(c.fakeDb.collection("chat_turns").all()) + JSON.stringify(c.fakeDb.collection("chat_threads").all());
    assert.equal(docsAfter, docsBefore, "B's documents unchanged");
    assert.equal(c.provider.calls.length, calls, "no model call");
    // pub key variations on student routes
    const badRef = await call(c, "POST", threadsPath("stu-b"), { token: "not.a.jwt" });
    for (const hdrs of [{ authorization: `Bearer ${b.pub}` }, { authorization: `bearer ${b.pub}` }, { authorization: `Bearer  ${b.pub}` }]) {
      const r = await c.handler({ ...CF.chatRequest("POST", threadsPath("stu-b"), {}), headers: { ...hdrs, ...sh("stu-b") } });
      assert.equal(r.status, 401);
      assert.equal(body(r), body(badRef));
    }
    // server key in X-VC-Key on the student route (not a bearer) -> as if no credential
    const noBearer = await c.handler({ ...CF.chatRequest("POST", threadsPath("stu-b"), {}), headers: { "x-vc-key": b.srv, ...sh("stu-b") } });
    assert.equal(noBearer.status, 401);
    // srv key on the public route in X-VC-Key / Authorization
    const r1 = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": b.srv } });
    assert.equal(r1.status, 401);
    const r2 = await ask(wreq, GERMANY_QUESTION, { headers: { authorization: `Bearer ${b.srv}` } });
    assert.equal(r2.status, 401, "REQUIRED: a server key as Bearer is not a page key");
    const r3 = await ask(wreq, GERMANY_QUESTION, { headers: { authorization: `Bearer ${b.pub}` } });
    assert.equal(r3.status, 401, "REQUIRED: a page key only counts in X-VC-Key");
    // page key of A with B's origin -> 401 ; with A's origin -> 200
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub, origin: "https://bravo.example" } })).status, 401);
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub, origin: "https://alpha.example" } })).status, 200);
    // a mixed-case scope or a scope swap with a copied secret
    const swapped = `vck_srv_alpha_${a.pub.slice(-43)}`;
    assert.equal((await call(c, "POST", threadsPath("stu-a"), { token: swapped, headers: sh("stu-a") })).status, 401);
    const swapped2 = `vck_pub_alpha_${a.srv.slice(-43)}`;
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": swapped2 } })).status, 401);
  } finally { c.cleanup(); w.cleanup(); wreq.cleanup(); }
});

test("H3 cache bound: rotate/revoke exactly at the 60 s boundary, clock going backwards, store outage then recovery, coalesced reads", async () => {
  const p = pworld();
  const a = await p.add("Alpha", [], "alpha");
  assert.ok(await p.registry.authenticate(a.pub, "pub"));
  const t = p.clock.ms;
  const rot = await rotatePartner(p.store, "alpha", "pub", { pepper: PEPPER, now: () => new Date(p.clock.ms) });
  p.clock.ms = t + 59_999;
  assert.ok(await p.registry.authenticate(a.pub, "pub"), "inside the bound the old key may still work (default 1)");
  assert.equal(await p.registry.authenticate(rot.key, "pub"), undefined, "and the new one not yet on a running server");
  p.clock.ms = t + 60_000;
  assert.equal(await p.registry.authenticate(a.pub, "pub"), undefined, "at exactly 60 s the old key is dead");
  assert.ok(await p.registry.authenticate(rot.key, "pub"));
  // clock goes backwards: the snapshot must not be trusted
  await revokePartner(p.store, "alpha");
  p.clock.ms = t - 3_600_000;
  assert.equal(await p.registry.authenticate(rot.key, "pub"), undefined, "a clock that moved backwards forces a fresh read");
  // outage then recovery
  const p2 = pworld();
  const b = await p2.add("Bravo", [], "bravo");
  let fail = true; let reads = 0;
  const flaky = { ...p2.store, list: async () => { reads++; if (fail) throw new Error("mongodb://u:pw@h down"); return p2.store.list(); } };
  const reg = createPartnerRegistry({ store: flaky, pepper: PEPPER, nowMs: () => p2.clock.ms });
  await assert.rejects(() => reg.authenticate(b.pub, "pub"), P.PartnerRegistryUnavailableError);
  fail = false;
  assert.ok(await reg.authenticate(b.pub, "pub"), "recovers on the next call; no sticky failure");
  // concurrent callers share one read
  p2.clock.ms += 61_000; reads = 0;
  await Promise.all(Array.from({ length: 50 }, (_, i) => reg.authenticate(i % 2 ? b.pub : `vck_pub_x${i % 7}z_${"A".repeat(43)}`, "pub")));
  assert.equal(reads, 1);
});

test("H4 CORS lookalikes end to end (wrapper over the real anonymous handler)", async () => {
  const p = pworld();
  const a = await p.add("Vidysea", ["https://vidysea.com", "http://localhost:5173"], "vidysea");
  const w = anonWorld({ deps: { partners: p.registry } });
  const h = withPartnerRoutes(w.handler, p.registry);
  const send = (method: string, headers: Record<string, any>) => h({ ...anonRequest({ text: GERMANY_QUESTION }, { method, headers }) });
  try {
    const hostile = ["https://vidysea.com.evil.io", "https://evilvidysea.com", "https://vidysea.com.", "https://vidysea.com/", "http://vidysea.com", "https://vidysea.com:443", "https://vidysea.com:8443", "HTTPS://VIDYSEA.COM", "https://VIDYSEA.com", "https://sub.vidysea.com", "https://vidysea.com@evil.io", "https://vidysea.com%2f.evil.io", "http://localhost:5174", "http://localhost", "https://localhost:5173", "http://localhost:5173/", "null", "", " ", "*", "https://vidysea.com https://evil.io", "https://vidysea.com,https://evil.io", "https://vidysea\u2024com", "https://vidysea.com\u0000", "file://"];
    for (const origin of hostile) {
      const pre = await send("OPTIONS", { origin, "access-control-request-method": "POST" });
      assert.equal(pre.status, 204, origin);
      const acao = Object.keys(pre.headers).filter((k) => k.toLowerCase().startsWith("access-control-"));
      assert.deepEqual(acao, [], `preflight ${JSON.stringify(origin)}`);
      const real = await send("POST", { origin, "x-vc-key": a.pub });
      assert.equal(real.status, 401, `actual ${JSON.stringify(origin)}`);
      assert.equal(real.headers["access-control-allow-origin"], undefined, `actual ${JSON.stringify(origin)}`);
    }
    // repeated Origin header
    const rep = await send("OPTIONS", { origin: ["https://vidysea.com", "https://vidysea.com"] });
    assert.equal(rep.headers["access-control-allow-origin"], undefined);
    const rep2 = await send("POST", { origin: ["https://vidysea.com", "https://vidysea.com"], "x-vc-key": a.pub });
    assert.equal(rep2.status, 401);
    assert.equal(rep2.headers["access-control-allow-origin"], undefined);
    // good
    const ok = await send("POST", { origin: "https://vidysea.com", "x-vc-key": a.pub });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["access-control-allow-origin"], "https://vidysea.com");
    assert.match(ok.headers.vary, /Origin/);
    const okpre = await send("OPTIONS", { origin: "http://localhost:5173" });
    assert.equal(okpre.headers["access-control-allow-origin"], "http://localhost:5173");
    // srv key in X-VC-Key + good origin -> 401 and no ACAO
    const srv = await send("POST", { origin: "https://vidysea.com", "x-vc-key": a.srv });
    assert.equal(srv.status, 401);
    assert.equal(srv.headers["access-control-allow-origin"], undefined);
    // other methods on the eligible path: no widening
    for (const m of ["PUT", "DELETE", "PATCH", "HEAD", "GET"]) {
      const r = await send(m, { origin: "https://vidysea.com.evil.io", "x-vc-key": a.pub });
      assert.equal(r.headers["access-control-allow-origin"], undefined, m);
    }
    // after revoke + 60 s the partner's own origin loses CORS (preflight and actual)
    await revokePartner(p.store, "vidysea");
    p.clock.ms += 61_000;
    assert.equal((await send("OPTIONS", { origin: "https://vidysea.com" })).headers["access-control-allow-origin"], undefined);
    assert.equal((await send("POST", { origin: "https://vidysea.com", "x-vc-key": a.pub })).headers["access-control-allow-origin"], undefined);
  } finally { w.cleanup(); }
});

test("H4b CORS never reaches student, voice or any other route; openapi key-less gets no ACAO", async () => {
  const p = pworld();
  const a = await p.add("Vidysea", ["https://vidysea.com"], "vidysea");
  const seen: string[] = [];
  const inner = async (req: any) => { seen.push(req.url); return S.respond(200, { ok: true }); };
  const h = withPartnerRoutes(inner, p.registry);
  const mk = (method: string, url: string, headers: any) => ({ method, url, headers, remoteAddress: "203.0.113.9", readBody: async () => "" });
  for (const url of ["/v1/students/stu-1/chat/threads", "/v1/students/stu-1/chat/threads/t1/voice/sessions", "/v1/students/stu-1/chat/threads/t1/voice/stream", "/v1/public/chat/turns/", "/v1/public/chat/turns/../x", "//v1/public/chat/turns", "/v1/partner/openapi.json/", "/V1/PUBLIC/CHAT/TURNS", "/v1/public/chat/turns%2f", "/v1/partner/openapi.jsonx"]) {
    for (const key of [a.pub, a.srv]) {
      for (const hdr of [{ origin: "https://vidysea.com", "x-vc-key": key }, { origin: "https://vidysea.com", authorization: `Bearer ${key}` }]) {
        const r = await h(mk("POST", url, hdr));
        assert.equal(r.headers["access-control-allow-origin"], undefined, url);
        const pre = await h(mk("OPTIONS", url, { origin: "https://vidysea.com" }));
        assert.equal(pre.headers["access-control-allow-origin"], undefined, "preflight " + url);
      }
    }
  }
  // openapi: GET without key -> no ACAO; with page key and listed origin -> ACAO; with server key -> none
  assert.equal((await h(mk("GET", "/v1/partner/openapi.json", { origin: "https://vidysea.com" }))).headers["access-control-allow-origin"], undefined);
  assert.equal((await h(mk("GET", "/v1/partner/openapi.json", { origin: "https://vidysea.com", "x-vc-key": a.pub }))).headers["access-control-allow-origin"], "https://vidysea.com");
  assert.equal((await h(mk("GET", "/v1/partner/openapi.json", { origin: "https://vidysea.com", "x-vc-key": a.srv }))).headers["access-control-allow-origin"], undefined);
  assert.equal((await h(mk("GET", "/v1/partner/openapi.json", { origin: "https://vidysea.com.evil.io", "x-vc-key": a.pub }))).headers["access-control-allow-origin"], undefined);
});

test("H5 age / consent headers: missing, garbage, repeated, unicode -> minor and no model call; only exact 'true' consents", async () => {
  const p = pworld();
  const a = await p.add("Alpha", [], "alpha");
  const c = chatWorld({ deps: { partners: p.registry } });
  try {
    let n = 0;
    const turn = async (headers: Record<string, any>) => {
      const id = `stu-${++n}`;
      const th = await c.handler({ ...CF.chatRequest("POST", threadsPath(id), {}), headers: { authorization: `Bearer ${a.srv}`, "x-vc-student-id": id, ...headers } });
      assert.equal(th.status, 201);
      const tid = JSON.parse(th.body).threadId;
      return c.handler({ ...CF.chatRequest("POST", turnsPath(id, tid), { body: { text: GERMANY_QUESTION, clientTurnId: `c${n}` } }), headers: { authorization: `Bearer ${a.srv}`, "x-vc-student-id": id, "content-type": "application/json", ...headers }, readBody: async () => JSON.stringify({ text: GERMANY_QUESTION, clientTurnId: `c${n}` }) });
    };
    const cases: Record<string, any>[] = [{}, { "x-vc-student-age": ["25", "25"] }, { "x-vc-student-age": "\uff12\uff15" }, { "x-vc-student-age": "25 " }, { "x-vc-student-age": "+25" }, { "x-vc-student-age": "17" }, { "x-vc-student-age": "0" }, { "x-vc-student-age": "121" }, { "x-vc-student-age": "NaN" }, { "x-vc-student-age": "٢٥" }, { "x-vc-student-age": "17", "x-vc-guardian-consent": ["true", "true"] }, { "x-vc-student-age": "17", "x-vc-guardian-consent": " true" }, { "x-vc-student-age": "17", "x-vc-guardian-consent": "True" }, { "x-vc-student-age": "17", "x-vc-guardian-consent": "1" }];
    for (const hd of cases) {
      const before = c.provider.calls.length;
      const r = await turn(hd);
      assert.equal(r.status, 200, JSON.stringify(hd));
      assert.match(JSON.parse(r.body).message ?? "", /guardian/i, JSON.stringify(hd));
      assert.equal(c.provider.calls.length, before, "no model call " + JSON.stringify(hd));
    }
    const ok = await turn({ "x-vc-student-age": "18" });
    assert.equal(JSON.parse(ok.body).state, "ok");
    const ok2 = await turn({ "x-vc-student-age": "016", "x-vc-guardian-consent": "true" });
    assert.equal(JSON.parse(ok2.body).state, "ok");
  } finally { c.cleanup(); }
});

test("H6 a raw key / secret appears in no Mongo doc, log line, response body, listing or CLI output across a battery incl. failures", async () => {
  const p = pworld();
  const a = await p.add("Alpha", ["https://alpha.example"], "alpha");
  const keys = [a.pub, a.srv];
  const secrets = keys.map((k) => k.slice(-43));
  const leaked = (text: string) => keys.some((k) => text.includes(k)) || secrets.some((s) => text.includes(s)) || secrets.some((s) => text.includes(s.slice(0, 12)));
  const w = anonWorld({ deps: { partners: p.registry } });
  const c = chatWorld({ deps: { partners: p.registry } });
  const outs: string[] = [];
  const cap = await captureOutput(async () => {
    for (const k of [a.pub, `${a.pub}x`, a.srv]) outs.push(JSON.stringify(await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": k, origin: "https://alpha.example" } })));
    outs.push(JSON.stringify(await ask(w, CRISIS_TEXT, { headers: { "x-vc-key": a.pub } })));
    for (const t of [a.srv, a.pub]) outs.push(JSON.stringify(await call(c, "POST", threadsPath("stu-1"), { token: t, headers: sh("stu-1") })));
    // a crashing route behind a valid key logs a 500 line with the partner id
    const boom = createPartnerRegistry({ store: p.store, pepper: PEPPER, nowMs: () => p.clock.ms });
    const crash = anonWorld({ deps: { partners: boom }, counter: { increment: async () => { throw new Error(`boom ${a.pub}`); } } });
    try { outs.push(JSON.stringify(await ask(crash, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub } }))); outs.push(JSON.stringify(crash.logs)); } finally { crash.cleanup(); }
    // store outage with a raw key in the error text
    const down = createPartnerRegistry({ store: { ...p.store, list: async () => { throw new Error(`mongodb://u:p@h ${a.srv}`); } }, pepper: PEPPER, nowMs: () => p.clock.ms });
    const dw = anonWorld({ deps: { partners: down } });
    try { outs.push(JSON.stringify(await ask(dw, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub } }))); outs.push(JSON.stringify(dw.logs)); } finally { dw.cleanup(); }
    return 1;
  });
  outs.push(cap.output);
  outs.push(JSON.stringify(w.logs), JSON.stringify(c.logs ?? []));
  outs.push(JSON.stringify(p.fakeDb.collection("partners").all()));
  for (const name of ["anonymous_counters", "chat_turns", "chat_threads"]) outs.push(JSON.stringify(w.fakeDb.collection(name).all()), JSON.stringify(c.fakeDb.collection(name).all()));
  const deps = { store: p.store, pepper: PEPPER, now: () => new Date(p.clock.ms) };
  outs.push((await runPartnerCli(["list"], deps)).join("\n"));
  outs.push(JSON.stringify(await listPartners(p.store)));
  outs.push((await runPartnerCli(["revoke", "alpha"], deps)).join("\n"));
  const err = await runPartnerCli(["rotate", "alpha", "--scope", "pub"], deps).catch((e: Error) => e.message);
  // the rotate after revoke is refused with a message that must not hold a key
  outs.push(String(err));
  const printed = outs.join("\n");
  const offenders = outs.map((t, i) => [i, leaked(t)] as const).filter(([, l]) => l).map(([i]) => i);
  assert.deepEqual(offenders, [], "a raw key or secret leaked in output index(es) " + offenders.join(","));
  assert.ok(printed.length > 1000);
  w.cleanup(); c.cleanup();
});

test("H7 timing: unknown id vs wrong secret vs wrong scope vs revoked have equal cost (statistical, 6000 samples each)", async () => {
  const p = pworld();
  const a = await p.add("Alpha", [], "alpha");
  const g = await p.add("Gone", [], "gone");
  await revokePartner(p.store, "gone"); p.clock.ms += 61_000;
  await p.registry.authenticate(a.pub, "pub");
  const secret = a.pub.slice(-43);
  const variants: Record<string, string> = {
    valid: a.pub,
    unknown_id: `vck_pub_zzzzz_${secret}`,
    wrong_secret_firstchar: `vck_pub_alpha_${secret[0] === "A" ? "B" : "A"}${secret.slice(1)}`,
    wrong_secret_lastchar: `vck_pub_alpha_${secret.slice(0, 42)}${secret[42] === "A" ? "B" : "A"}`,
    revoked: g.pub,
  };
  const res: Record<string, number> = {};
  for (const [name, key] of Object.entries(variants)) {
    const samples: number[] = [];
    for (let i = 0; i < 6000; i++) { const t = performance.now(); await p.registry.authenticate(key, "pub"); samples.push(performance.now() - t); }
    samples.sort((x, y) => x - y);
    res[name] = samples[Math.floor(samples.length / 2)]!;
  }
  console.log("H7 median ms/call", JSON.stringify(res));
  const vals = Object.values(res);
  assert.ok(Math.max(...vals) / Math.min(...vals) < 2.0, "within 2x");
});

test("H8 real HTTP through launch(): a 10 KB X-VC-Key, a 10 KB Authorization, a 20 KB header; the server stays up and answers the next request", async () => {
  const fake = testing.createFakeMongoClient();
  const gates = gatesFixture();
  const env = { MONGODB_URL: "mongodb://fake-host/ignored", VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_ALGORITHMS: "HS256", VC_JWT_HS256_SECRET: "j".repeat(40), VC_ANONYMOUS_ENABLED: "true", VC_KB_BASE_URL: "http://127.0.0.1:1", VC_KB_ANON_API_KEY: "k", VC_PARTNER_KEY_PEPPER: PEPPER };
  const clock = { ms: Date.now() };
  const api = await MAIN.launch(env, { clientFactory: () => fake.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates }, partners: { nowMs: () => clock.ms } } });
  try {
    const store = createMongoPartnerStore(fake.dbFor("virtual_counsellor"));
    const { keys } = await addPartner(store, { name: "Vidysea Website", origins: ["https://vidysea.example"] }, { pepper: PEPPER });
    clock.ms += 61_000;
    const url = `http://127.0.0.1:${api.port}${ANONYMOUS_PATH}`;
    const post = (headers: Record<string, string>) => fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9", ...headers }, body: JSON.stringify({ text: GERMANY_QUESTION }) });
    const r1 = await post({ "x-vc-key": "k".repeat(10 * 1024) });
    assert.equal(r1.status, 401);
    const r2 = await post({ "x-vc-key": `vck_pub_vidysea-website_${"A".repeat(10 * 1024)}` });
    assert.equal(r2.status, 401);
    const r3 = await post({ authorization: `Bearer vck_${"A".repeat(10 * 1024)}`, "x-vc-key": keys.pub });
    assert.equal(r3.status, 200);
    let r4: any; try { r4 = await post({ "x-vc-key": "k".repeat(20 * 1024) }); } catch (e) { r4 = { status: "socket-error" }; }
    console.log("H8 20KB header ->", r4.status);
    const r5 = await post({ "x-vc-key": keys.pub, origin: "https://vidysea.example" });
    assert.equal(r5.status, 200, "server still serves after the oversized header");
    assert.equal(r5.headers.get("access-control-allow-origin"), "https://vidysea.example");
    const r6 = await post({ "x-vc-key": keys.pub, origin: "https://vidysea.example.evil.io" });
    assert.equal(r6.status, 401);
    assert.equal(r6.headers.get("access-control-allow-origin"), null);
    const r7 = await fetch(url, { method: "OPTIONS", headers: { origin: "https://vidysea.example.evil.io", "access-control-request-method": "POST" } });
    assert.equal(r7.status, 204); assert.equal(r7.headers.get("access-control-allow-origin"), null);
    // student route via real HTTP with a page key: 401 (chat may be disabled -> 404); never 200
    const r8 = await fetch(`http://127.0.0.1:${api.port}/v1/students/stu-1/chat/threads`, { method: "POST", headers: { authorization: `Bearer ${keys.pub}`, "x-vc-student-id": "stu-1" } });
    assert.ok(r8.status === 401 || r8.status === 404, "student route status " + r8.status);
    const r9 = await fetch(`http://127.0.0.1:${api.port}/v1/partner/openapi.json`);
    assert.equal(r9.status, 200);
  } finally { await api.stop(); cleanupGates(gates); }
});
