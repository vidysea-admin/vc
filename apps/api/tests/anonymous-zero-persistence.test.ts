/**
 * P1 U7 (plan row U7; spec A15a, A15b, A15c; contract B24.6, B24.7, B2 anonymous D-092; B21 anonymous-route exception).
 * Outcome tests through the REAL anonymous route (createAnonymousApi -> the real compiled student graph -> MockProvider,
 * a recording KB, and the in-process @vc/db fake behind the production counter writer). Assertions read the RAW fake
 * collections and everything written to the console (B14: outcome, not construction). Synthetic data only (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { ANONYMOUS_COUNTER_KINDS, DEFAULT_LIMITS } from "@vc/schemas";
import { ANONYMOUS_COUNTER_FIELDS, COLLECTION_NAMES } from "@vc/db";
import { ANONYMOUS_CRISIS_MESSAGE, ANONYMOUS_NO_ANSWER_TEXT, ANONYMOUS_SIGN_IN_TEXT, TELE_MANAS_LINE } from "@vc/engine";
import {
  AnonymousForbiddenWriteError,
  AnonymousRateLimiter,
  buildAnonymousGraphDeps,
  normalizeClientAddress,
  MAX_ANONYMOUS_BODY_BYTES,
} from "../src/anonymous.js";
import { SEARCH_EMPTY, SPEAKERS, GOOD_CLAIM, SKILLS_DIR, anonWorld, ask, anonRequest, captureOutput, kbAnswerProvider, nonEmptyCollections, recordingKb, tooLargeBody } from "./anonymous-fixtures.js";

const GENERIC = "What are the tuition fees for public universities in Germany?";
const CRISIS_EN = "I want to kill myself";
const CRISIS_HINGLISH = "mujhe ab jeena nahi hai, main mar jaana chahta hoon";

// ---------------------------------------------------------------------------
// A15a: write boundary
// ---------------------------------------------------------------------------

function fiftyTurns(): { text: string; expect: "answered" | "sign_in_required" | "crisis" | "no_answer" }[] {
  const out: { text: string; expect: "answered" | "sign_in_required" | "crisis" | "no_answer" }[] = [];
  // 20 generic questions the KB can answer
  for (let i = 0; i < 20; i++) out.push({ text: `What is the semester contribution at German public university number ${i}?`, expect: "answered" });
  // 6 crisis phrases (English, Hinglish, Hindi)
  for (const t of [CRISIS_EN, CRISIS_HINGLISH, "I don't want to live anymore", "मैं जीना नहीं चाहती", "I want to end my life", "I want to end it all"]) out.push({ text: t, expect: "crisis" });
  // 8 PII turns: name, school, phone
  for (const t of [
    "My name is Priya Nair and I study at Delhi Public School, what are the fees in Germany?",
    "I am Rahul from Pune, my phone is 98765 43210, which university should I pick?",
    "Hi I'm Zainab, 12th class at St Mary's School Mumbai",
    "Mera naam Aman hai aur main Jaipur ke school mein padhta hoon",
    "my email is priya.nair@example.test can you send me the list",
    "मेरा नाम प्रिया है और मैं पुणे में पढ़ती हूँ",
    "We are three friends from Kota, can we all get admission?",
    "Can I get into TU Munich with 72 percent?",
  ]) out.push({ text: t, expect: "sign_in_required" });
  // 8 borderline personal/generic
  for (const t of ["Germany", "tell me", "which one is best for me", "Should I choose Canada or Australia?", "Am I eligible for a DAAD scholarship?", "UK?", "help", "kya mujhe milegi scholarship"]) out.push({ text: t, expect: "sign_in_required" });
  // 8 generic with an empty KB answer set (no sourced answer)
  for (let i = 0; i < 8; i++) out.push({ text: `What is the visa processing time for study permit variant ${i} in Canada?`, expect: "no_answer" });
  return out;
}

test("A15a: 50 text turns through the real route (crisis, PII, borderline, generic) write nothing but increments of the text-free counter", async () => {
  const turns = fiftyTurns();
  assert.equal(turns.length, 50);
  const noAnswerQs = new Set(turns.filter((t) => t.expect === "no_answer").map((t) => t.text));
  const w = anonWorld({ kb: recordingKb((q) => (noAnswerQs.has(q) ? SEARCH_EMPTY : { status: "ok", hits: [{ ...recordingKbHit(), turnId: "t-sem-1" }], dropped: 0 })) });
  try {
    const { result, output } = await captureOutput(async () => {
      const seen: string[] = [];
      for (const t of turns) {
        const res = await ask(w, t.text, { ip: `198.51.100.${seen.length + 1}` });
        assert.equal(res.status, 200, `${t.expect}: ${t.text}`);
        seen.push(res.json.state);
      }
      return seen;
    });
    // outcome: expected states
    const stateFor = { answered: "ok", sign_in_required: "sign_in_required", crisis: "escalated", no_answer: "no_sourced_answer" } as const;
    assert.deepEqual(result, turns.map((t) => stateFor[t.expect]));
    // the ONLY non-empty collection is the counter; its documents carry only date, kind, count
    assert.deepEqual(Object.keys(nonEmptyCollections(w.fakeDb)), [COLLECTION_NAMES.anonymous_counters]);
    const docs = w.fakeDb.collection<any>(COLLECTION_NAMES.anonymous_counters).all();
    for (const d of docs) assert.deepEqual(Object.keys(d).sort(), [...ANONYMOUS_COUNTER_FIELDS].sort(), "counter schema: no text, IP or identifier field");
    const byKind = Object.fromEntries(docs.map((d: any) => [d.kind, d.count]));
    const expected: Record<string, number> = {};
    for (const t of turns) expected[t.expect] = (expected[t.expect] ?? 0) + 1;
    assert.deepEqual(byKind, expected);
    assert.equal(docs.length, 4, "one document per (date, kind)");
    assert.ok(docs.every((d: any) => d.date === "2026-11-01" && (ANONYMOUS_COUNTER_KINDS as readonly string[]).includes(d.kind)));
    // no turn text, name, phone, email or IP anywhere: counter docs, logs, console
    const haystack = JSON.stringify(docs) + output + JSON.stringify(w.logs);
    for (const needle of ["Priya", "Rahul", "98765", "Zainab", "Aman", "example.test", "198.51.100", "203.0.113", "kill myself", "Delhi Public"]) {
      assert.equal(haystack.includes(needle), false, `leaked: ${needle}`);
    }
    // personal and crisis turns never reach the model or the KB (only generic questions do)
    assert.equal(w.provider.calls.length, 20, "the model sees generic answerable questions only");
    const modelSaw = JSON.stringify(w.provider.calls.map((c) => c.input));
    for (const needle of ["Priya", "98765", "kill myself", "Zainab"]) assert.equal(modelSaw.includes(needle), false, `model input leaked: ${needle}`);
    assert.deepEqual(w.logs, [], "a clean run logs nothing at all");
  } finally {
    w.cleanup();
  }
});

function recordingKbHit() {
  return {
    turnId: "t-sem-1",
    sessionId: "sess-sem-1",
    score: 3.2,
    text: "German public universities charge no tuition for most programmes, but expect a semester contribution of about 300 euros.",
    sessionDate: "2026-03-04",
    sessionTitle: "Study in Germany seminar",
    sourceId: "src-sem-1",
    sourceKind: "internal-seminar" as const,
  };
}

test("A15a: the handler is built with throwing proxies for gap log, flag log and escalation, no checkpointer, and the counter as its only writer", async () => {
  const forbidden: string[] = [];
  const deps = buildAnonymousGraphDeps(
    { kb: recordingKb(), provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, speakers: SPEAKERS, counter: { increment: async () => {} } },
    (what) => forbidden.push(what),
  );
  await assert.rejects(async () => deps.recordGap!({} as never), AnonymousForbiddenWriteError);
  await assert.rejects(async () => deps.logFlag!({} as never), AnonymousForbiddenWriteError);
  await assert.rejects(async () => deps.escalate!({} as never), AnonymousForbiddenWriteError);
  assert.deepEqual(forbidden, ["recordGap", "logFlag", "escalate"]);
  assert.equal(await deps.hasPriorFlag({ tenantId: "t", studentId: "s", threadId: "x" }), false, "stateless: anonymous has no thread to have flagged");
  assert.equal(typeof deps.countAnonymous, "function");
  // the dependency TYPE has no Db / checkpointer / outbox / tracer field at all
  const d = {
    kb: recordingKb(),
    provider: kbAnswerProvider(),
    skillsDir: SKILLS_DIR,
    speakers: SPEAKERS,
    counter: { increment: async () => {} },
    // @ts-expect-error a Db is not an accepted anonymous dependency
    db: {},
  };
  assert.ok(d);
});

test("A15a: the compiled anonymous graph has no checkpointer", async () => {
  const w = anonWorld();
  try {
    const { compileStudentGraph } = await import("@vc/engine");
    const g = compileStudentGraph(buildAnonymousGraphDeps(w.deps)) as unknown as { checkpointer?: unknown };
    assert.ok(!g.checkpointer, "no checkpointer: LangGraph persists no state for an anonymous turn");
  } finally {
    w.cleanup();
  }
});

test("A15a: the counter writer is atomic per (date, kind), uses the injected UTC date, and refuses an unknown kind", async () => {
  const w = anonWorld();
  try {
    const { createMongoAnonymousCounter } = await import("../src/anonymous.js");
    const { anonymousCountersCollection } = await import("@vc/db");
    const coll = anonymousCountersCollection(w.fakeDb as never);
    const c = createMongoAnonymousCounter(coll, () => new Date("2026-11-02T23:59:59.000Z"));
    await Promise.all(Array.from({ length: 20 }, () => c.increment("answered")));
    await c.increment("crisis");
    await assert.rejects(() => c.increment("free text here" as never), /kind/);
    const docs = coll.all().map((d: any) => ({ ...d }));
    assert.deepEqual(docs.map((d: any) => [d._id, d.date, d.kind, d.count]).sort(), [
      ["2026-11-02:answered", "2026-11-02", "answered", 20],
      ["2026-11-02:crisis", "2026-11-02", "crisis", 1],
    ]);
  } finally {
    w.cleanup();
  }
});

test("A15a: a counter outage never fails the turn and never writes elsewhere (crisis still gets the fixed message)", async () => {
  const w = anonWorld({ counter: { increment: async () => { throw new Error("db down, text was: SENTINEL-TEXT"); } } });
  try {
    const { output } = await captureOutput(async () => {
      const crisis = await ask(w, CRISIS_EN);
      assert.equal(crisis.status, 200);
      assert.equal(crisis.json.state, "escalated");
      const ok = await ask(w, GENERIC);
      assert.equal(ok.json.state, "ok");
    });
    assert.deepEqual(nonEmptyCollections(w.fakeDb), {});
    assert.equal((output + JSON.stringify(w.logs)).includes("SENTINEL-TEXT"), false, "an error message is never logged");
    assert.ok(w.logs.every((l: any) => l.event === "anonymous_counter_failed" && typeof l.kind === "string" && !("error" in l && String(l.error).includes("SENTINEL"))));
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// A15b: classifier fail-closed through the route + the limiter
// ---------------------------------------------------------------------------

const BORDERLINE_PERSONAL = [
  "Can I get into TU Munich with 72%?",
  "Should I study in Canada or Australia?",
  "What are my chances at ETH Zurich?",
  "Which university is best for me?",
  "I scored 80 percent, what can I do?",
  "my budget is 20 lakh, which country?",
  "Is it worth it for someone like me?",
  "How much will it cost me?",
  "mujhe Germany jaana hai, kya karu?",
  "mera percentage 65 hai, kahan jaun?",
  "main kaunsa course loon?",
  "mujhe scholarship milegi kya?",
  "mere liye kaunsa country sahi rahega",
  "hum teen dost hain, hamara admission ho jayega?",
  "मुझे जर्मनी में पढ़ना है, क्या करूँ?",
  "मेरे लिए कौन सा देश अच्छा है?",
  "मैं 12वीं में हूँ, क्या मैं कनाडा जा सकता हूँ?",
  "Am I eligible for the DAAD scholarship?",
  "Do you recommend Germany?",
  "Please suggest a course",
  "advise me on universities",
  "evaluate my profile",
  "review my SOP",
  "help me choose",
  "pick a country for my son",
  "Germany",
  "UK?",
  "tell me",
  "hello",
  "ok",
  "???",
  "study",
  "fees",
  "best country",
  "call me on +91 98765 43210",
  "9876543210",
  "kya",
  "my cousin wants to know about fees in Germany",
  "We want to apply this year, what documents do we need?",
  "I'm 17 and want to go abroad",
  "im in 11th grade, how do scholarships work?",
  "x".repeat(600),
];

test("A15b: >= 40 borderline cases (English, Hinglish, Hindi) through the route: 0 personal or ambiguous questions answered as generic", async () => {
  assert.ok(BORDERLINE_PERSONAL.length >= 40);
  const w = anonWorld();
  try {
    let n = 0;
    for (const text of BORDERLINE_PERSONAL) {
      const res = await ask(w, text, { ip: `192.0.2.${(n++ % 200) + 1}` });
      assert.equal(res.status, 200, text);
      assert.equal(res.json.state, "sign_in_required", text);
      assert.equal(res.json.message, ANONYMOUS_SIGN_IN_TEXT);
    }
    assert.equal(w.provider.calls.length, 0, "no model call decides or answers a personal question");
    assert.equal(w.kb.calls.length, 0, "no KB call for a personal question");
    assert.deepEqual(w.counterCalls, BORDERLINE_PERSONAL.map(() => "sign_in_required"));
  } finally {
    w.cleanup();
  }
});

test("A15b: a clear generic question (English, Hinglish, Hindi) is answered, with sources", async () => {
  const w = anonWorld();
  try {
    for (const q of [GENERIC, "Germany mein tuition fees kitni hoti hai?", "जर्मनी में सार्वजनिक विश्वविद्यालयों की फीस क्या है?"]) {
      const res = await ask(w, q, { ip: "192.0.2.50" });
      assert.equal(res.json.state, "ok", q);
      assert.ok(res.json.claims.length >= 1 && res.json.sources.length >= 1);
    }
  } finally {
    w.cleanup();
  }
});

test("A15b: the limiter allows 10 requests per minute per client, the 11th is 429 with Retry-After, other clients are unaffected, the window then reopens", async () => {
  assert.equal(DEFAULT_LIMITS.anonymousRequestsPerMinute, 10);
  const w = anonWorld();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await ask(w, GENERIC, { ip: "198.51.100.9" })).status, 200, `request ${i + 1}`);
    const limited = await ask(w, GENERIC, { ip: "198.51.100.9" });
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.json, { error: "rate_limited", helpline: TELE_MANAS_LINE });
    assert.ok(Number(limited.headers["retry-after"]) >= 1 && Number(limited.headers["retry-after"]) <= 60);
    assert.equal((await ask(w, GENERIC, { ip: "198.51.100.10" })).status, 200, "another client has its own budget");
    const callsBefore = w.provider.calls.length;
    await ask(w, GENERIC, { ip: "198.51.100.9" });
    assert.equal(w.provider.calls.length, callsBefore, "a limited request does no work");
    w.clock.ms += 61_000;
    assert.equal((await ask(w, GENERIC, { ip: "198.51.100.9" })).status, 200, "after the minute the client is served again");
  } finally {
    w.cleanup();
  }
});

test("A15b: the limiter is in-memory and text-free: its key is hashed, never logged, never persisted; expired keys are purged; a full table fails closed", async () => {
  const clockRef = { ms: Date.parse("2026-11-01T10:00:00.000Z") };
  const limiter = new AnonymousRateLimiter({ limit: 10, windowMs: 60_000, maxKeys: 50_000, nowMs: () => clockRef.ms });
  const w = anonWorld({ deps: { limiter, nowMs: () => clockRef.ms } });
  try {
    const RAW = "203.0.113.77";
    const { output } = await captureOutput(async () => {
      for (let i = 0; i < 12; i++) await ask(w, GENERIC, { ip: RAW });
    });
    const limiterDump = inspect(limiter, { depth: 8, showHidden: true });
    assert.equal(limiterDump.includes(RAW), false, "the raw client key is not held");
    assert.equal(limiterDump.includes("203.0.113"), false);
    assert.equal(output.includes(RAW), false);
    assert.equal(JSON.stringify(w.logs).includes(RAW), false);
    assert.equal(JSON.stringify(w.fakeDb.collection(COLLECTION_NAMES.anonymous_counters).all()).includes(RAW), false);
    assert.equal(limiter.size(), 1);
    clockRef.ms += 61_000;
    limiter.sweep();
    assert.equal(limiter.size(), 0, "TTL: an idle key is gone");
  } finally {
    w.cleanup();
  }
  let t = 1_000_000;
  const small = new AnonymousRateLimiter({ limit: 10, windowMs: 60_000, maxKeys: 3, nowMs: () => t });
  assert.equal(small.check("a").allowed, true);
  assert.equal(small.check("b").allowed, true);
  assert.equal(small.check("c").allowed, true);
  assert.equal(small.check("d").allowed, false, "table full of live keys: a new client is refused, never an existing one evicted");
  assert.equal(small.check("a").allowed, true);
  t += 61_000;
  assert.equal(small.check("d").allowed, true, "after the window the expired keys are purged and the table accepts new ones");
  assert.equal(small.check(undefined).allowed, true);
});

// ---------------------------------------------------------------------------
// A15c: egress is search-only and identity-free
// ---------------------------------------------------------------------------

test("A15c: the KB sees exactly one search call carrying only q; never /ask, never get_session; no identifier or header reaches it", async () => {
  const w = anonWorld();
  try {
    const res = await ask(w, GENERIC, {
      ip: "198.51.100.5",
      headers: { authorization: "Bearer SYNTH.TOKEN.HERE", cookie: "sid=abc", "x-tenant-id": "tenant-a", "x-forwarded-for": "10.9.8.7" },
    });
    assert.equal(res.json.state, "ok");
    assert.deepEqual(w.kb.calls, [{ tool: "search_kb", arg: [GENERIC] }], "one search call whose only argument is q");
    assert.equal(JSON.stringify(w.kb.calls).includes("tenant"), false);
    assert.equal(JSON.stringify(w.provider.calls.map((c) => c.input)).includes("SYNTH.TOKEN"), false);
  } finally {
    w.cleanup();
  }
});

test("A15c: when search finds nothing the route answers no_sourced_answer and STILL never falls back to /ask or get_session", async () => {
  const w = anonWorld({ kb: recordingKb(SEARCH_EMPTY) });
  try {
    const res = await ask(w, GENERIC);
    assert.equal(res.json.state, "no_sourced_answer");
    assert.equal(res.json.message, ANONYMOUS_NO_ANSWER_TEXT);
    assert.deepEqual(w.kb.calls.map((c) => c.tool), ["search_kb"]);
    assert.deepEqual(w.counterCalls, ["no_answer"]);
  } finally {
    w.cleanup();
  }
});

test("A15c: a KB outage is the fixed no-answer, not an error and not an uncited answer", async () => {
  const kb = recordingKb();
  kb.searchKb = async () => { throw new Error("KB down"); };
  const w = anonWorld({ kb });
  try {
    const res = await ask(w, GENERIC);
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "no_sourced_answer");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// B2 anonymous (D-092): unverified claims are dropped, never shown
// ---------------------------------------------------------------------------

test("D-092: an unverified claim is dropped in anonymous mode and never shown with a flag; only-unverified is the fixed no-answer", async () => {
  const unverified = { text: "Germany has 400 free scholarships every year.", kind: "fact", sourceIds: [] };
  const w1 = anonWorld({ provider: kbAnswerProvider([GOOD_CLAIM, unverified]) });
  try {
    const res = await ask(w1, GENERIC);
    assert.equal(res.json.state, "ok");
    assert.equal(res.body.includes("unverified"), false, "no (unverified) flag reaches an anonymous user");
    assert.equal(res.body.includes("400 free scholarships"), false);
    assert.ok(res.json.claims.every((c: any) => c.status !== "unverified"));
    assert.equal(res.json.claims.length, 1);
  } finally {
    w1.cleanup();
  }
  const w2 = anonWorld({ provider: kbAnswerProvider([unverified]) });
  try {
    const res = await ask(w2, GENERIC);
    assert.equal(res.json.state, "no_sourced_answer");
    assert.equal(res.json.message, ANONYMOUS_NO_ANSWER_TEXT);
    assert.deepEqual(res.json.claims, []);
    assert.deepEqual(w2.counterCalls, ["no_answer"]);
  } finally {
    w2.cleanup();
  }
});

// ---------------------------------------------------------------------------
// B24.7 crisis in anonymous mode
// ---------------------------------------------------------------------------

test("crisis (B24.7): English and Hinglish get the fixed message with Tele-MANAS 14416, no model, no KB, only the crisis counter, nothing logged", async () => {
  const w = anonWorld();
  try {
    const { output } = await captureOutput(async () => {
      for (const t of [CRISIS_EN, CRISIS_HINGLISH]) {
        const res = await ask(w, t, { ip: "192.0.2.77" });
        assert.equal(res.status, 200);
        assert.equal(res.json.state, "escalated");
        assert.equal(res.json.message, ANONYMOUS_CRISIS_MESSAGE);
        assert.match(res.json.message, /14416/);
        assert.deepEqual(res.json.claims, []);
      }
    });
    assert.equal(w.provider.calls.length, 0);
    assert.equal(w.kb.calls.length, 0);
    assert.deepEqual(w.counterCalls, ["crisis", "crisis"]);
    assert.equal(output.includes("kill myself") || output.includes("jeena"), false);
    assert.deepEqual(Object.keys(nonEmptyCollections(w.fakeDb)), [COLLECTION_NAMES.anonymous_counters]);
  } finally {
    w.cleanup();
  }
});

test("crisis (B24.7, U6h L5): a crisis phrase beyond the 4000-character limit is still the fixed message, not a 400", async () => {
  const w = anonWorld();
  try {
    const text = `${"I am writing a very long message about my exams. ".repeat(120)} I want to kill myself. ${"Thank you for reading. ".repeat(20)}`;
    assert.ok(text.length > 4000 && text.length < MAX_ANONYMOUS_BODY_BYTES);
    const res = await ask(w, text);
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Request validation and error hygiene
// ---------------------------------------------------------------------------

test("validation: malformed bodies are a bare 400, over-long non-crisis text is 400, an oversized body is 413; no input is echoed", async () => {
  const w = anonWorld();
  try {
    const bad: [string, string | object][] = [
      ["not json", "{not json SENTINEL-X"],
      ["array", ["SENTINEL-X"] as unknown as object],
      ["string body", '"SENTINEL-X"'],
      ["null", "null"],
      ["missing text", { other: "SENTINEL-X" }],
      ["extra field", { text: GENERIC, tenantId: "SENTINEL-X" }],
      ["numeric text", { text: 12345 }],
      ["empty text", { text: "" }],
      ["over-long non-crisis text", { text: `SENTINEL-X ${"a ".repeat(2500)}` }],
    ];
    let n = 0;
    for (const [label, body] of bad) {
      const res = await w.handler(anonRequest(body, { ip: `192.0.2.${100 + n++}` }));
      assert.equal(res.status, 400, label);
      assert.equal(res.body.includes("SENTINEL-X"), false, `${label}: input echoed`);
      assert.equal(JSON.parse(res.body).error, "invalid_request");
      assert.equal(JSON.parse(res.body).helpline, TELE_MANAS_LINE, `${label}: every non-200 body carries the helpline`);
    }
    const big = await w.handler(anonRequest("", { readBody: tooLargeBody, ip: "192.0.2.250" }));
    assert.equal(big.status, 413);
    assert.equal(JSON.parse(big.body).helpline, TELE_MANAS_LINE);
    assert.equal(w.provider.calls.length, 0);
    assert.deepEqual(w.counterCalls, []);
  } finally {
    w.cleanup();
  }
});

test("validation: a near-cap body (about 48 KB of text) is scanned for crisis in bounded time and then refused as over-long", async () => {
  const w = anonWorld();
  try {
    const text = "lorem ipsum dolor sit amet ".repeat(1800);
    assert.ok(text.length > 40_000 && Buffer.byteLength(JSON.stringify({ text })) < MAX_ANONYMOUS_BODY_BYTES);
    const t0 = Date.now();
    const res = await ask(w, text);
    assert.equal(res.status, 400);
    assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
  } finally {
    w.cleanup();
  }
});

// ISS-135 (D-101): the crisis scan runs before the limiter (B24.7), so it is unlimited per client; its CPU is bounded by a byte cap.
test("ISS-135: the body cap is 64 KiB, and a body over it is a 413 with the helpline, never scanned, never limited, no model, no counter", async () => {
  assert.equal(MAX_ANONYMOUS_BODY_BYTES, 64 * 1024);
  const w = anonWorld();
  try {
    for (const [i, kib] of [100, 300].entries()) {
      // The crisis phrase sits at the END of the over-cap body: had it been scanned, the answer would be an escalated 200 plus a crisis counter write.
      const text = `${"I am writing a very long message about my exams. ".repeat(Math.ceil((kib * 1024) / 50))} I want to kill myself.`;
      assert.ok(Buffer.byteLength(JSON.stringify({ text })) > MAX_ANONYMOUS_BODY_BYTES);
      const res = await ask(w, text, { ip: `192.0.2.${10 + i}` });
      assert.equal(res.status, 413, `${kib} KiB`);
      assert.equal(res.json.error, "body_too_large");
      assert.equal(res.json.helpline, TELE_MANAS_LINE, `${kib} KiB: a 413 still carries the helpline`);
      assert.match(res.json.helpline, /14416/);
    }
    assert.equal(w.provider.calls.length, 0);
    assert.equal(w.kb.calls.length, 0);
    assert.deepEqual(w.counterCalls, [], "an unscanned body writes no crisis counter");
  } finally {
    w.cleanup();
  }
});

test("ISS-135: a crisis message within the cap still escalates, and still does so before the limiter for a client already rate limited", async () => {
  const limiter = new AnonymousRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 100, nowMs: () => 5_000 });
  const w = anonWorld({ deps: { limiter } });
  try {
    const text = `${"I am writing a very long message about my exams. ".repeat(1000)} I want to kill myself.`;
    assert.ok(Buffer.byteLength(JSON.stringify({ text })) > 40_000 && Buffer.byteLength(JSON.stringify({ text })) < MAX_ANONYMOUS_BODY_BYTES);
    const ip = "198.51.100.77";
    assert.equal((await ask(w, GENERIC, { ip })).status, 200);
    assert.equal((await ask(w, GENERIC, { ip })).status, 429, "the client is now limited");
    const res = await ask(w, text, { ip });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
  } finally {
    w.cleanup();
  }
});

test("errors: an unexpected failure is a bare 500 {error: internal}; the log line carries the error NAME only, never its message or the text", async () => {
  const w = anonWorld({
    deps: {
      clientKey: () => {
        const e = new TypeError("boom with SENTINEL-TEXT-Y inside");
        throw e;
      },
    },
  });
  try {
    const { output } = await captureOutput(async () => {
      const res = await ask(w, `${GENERIC} SENTINEL-TEXT-Y`);
      assert.equal(res.status, 500);
      assert.deepEqual(res.json, { error: "internal", helpline: TELE_MANAS_LINE });
    });
    const everything = output + JSON.stringify(w.logs);
    assert.equal(everything.includes("SENTINEL-TEXT-Y"), false);
    assert.equal(w.logs.length, 1);
    assert.deepEqual(Object.keys(w.logs[0] as object).sort(), ["error", "event", "level", "status", "ts"]);
    assert.equal((w.logs[0] as { error: string }).error, "TypeError");
  } finally {
    w.cleanup();
  }
});

test("provider failure is the apology text (A12), not an error and not an unsourced answer", async () => {
  const provider = kbAnswerProvider();
  provider.generate = async () => { throw new Error("provider down"); };
  const w = anonWorld({ provider });
  try {
    const res = await ask(w, GENERIC);
    assert.equal(res.status, 200);
    assert.match(res.json.message, /try again/i);
    assert.deepEqual(res.json.claims, []);
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// U7 pre-ready review repair (senior review 1-4; AI review A, B)
// ---------------------------------------------------------------------------

const NEVER = { increment: () => new Promise<void>(() => {}) };

test("U7 repair 1/B: a counter that never answers does not delay any reply - crisis, sign-in and answered turns all return within the deadline", async () => {
  const w = anonWorld({ counter: NEVER, deps: { counterDeadlineMs: 50 } });
  try {
    for (const [text, state] of [[CRISIS_EN, "escalated"], [CRISIS_HINGLISH, "escalated"], ["Should I choose Canada or Australia?", "sign_in_required"], [GENERIC, "ok"]] as const) {
      const t0 = Date.now();
      const res = await ask(w, text, { ip: "198.51.100.77" });
      assert.ok(Date.now() - t0 < 1500, `${state}: took ${Date.now() - t0}ms`);
      assert.equal(res.status, 200);
      assert.equal(res.json.state, state);
    }
    const reported = w.logs.filter((l) => (l as { event?: string }).event === "anonymous_counter_failed");
    assert.ok(reported.length >= 4, "a timed-out counter write is reported (text-free) as a failed write");
  } finally {
    w.cleanup();
  }
});

test("U7 repair 1: the default counter deadline is under one second, so a hung database delays the crisis message by less than that, not by the driver's 30 s", async () => {
  const w = anonWorld({ counter: NEVER });
  try {
    const t0 = Date.now();
    const res = await ask(w, CRISIS_EN, { ip: "198.51.100.78" });
    const took = Date.now() - t0;
    assert.equal(res.json.state, "escalated");
    assert.match(res.json.message, /14416/);
    assert.ok(took >= 500 && took < 2500, `default deadline ${took}ms`);
  } finally {
    w.cleanup();
  }
});

test("U7 repair A: a crisis message is answered with the fixed message and Tele-MANAS even at request 11 (rate limited) and with a full limiter table", async () => {
  const w = anonWorld();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await ask(w, GENERIC, { ip: "198.51.100.30" })).status, 200);
    assert.equal((await ask(w, GENERIC, { ip: "198.51.100.30" })).status, 429, "the 11th generic request is limited");
    for (const text of [CRISIS_EN, CRISIS_HINGLISH]) {
      const res = await ask(w, text, { ip: "198.51.100.30" });
      assert.equal(res.status, 200, text);
      assert.equal(res.json.state, "escalated");
      assert.equal(res.json.message, ANONYMOUS_CRISIS_MESSAGE);
      assert.match(res.json.message, /14416/);
    }
    assert.equal(w.provider.calls.length, 10, "crisis turns call no model");
    assert.equal(w.counterCalls.filter((k) => k === "crisis").length, 2);
  } finally {
    w.cleanup();
  }
  const full = anonWorld({
    deps: { limiter: new AnonymousRateLimiter({ limit: 10, windowMs: 60_000, maxKeys: 1, nowMs: () => 1_000 }) },
  });
  try {
    assert.equal((await ask(full, GENERIC, { ip: "198.51.100.40" })).status, 200);
    const refused = await ask(full, GENERIC, { ip: "198.51.100.41" });
    assert.equal(refused.status, 429, "a new key on a full table is refused");
    const crisis = await ask(full, CRISIS_EN, { ip: "198.51.100.42" });
    assert.equal(crisis.status, 200);
    assert.equal(crisis.json.state, "escalated");
  } finally {
    full.cleanup();
  }
});

test("U7 repair A: every non-200 anonymous body (400, 405, 413, 429, 500) carries the static Tele-MANAS helpline", async () => {
  const w = anonWorld({ deps: { limiter: new AnonymousRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 100, nowMs: () => 5_000 }) } });
  try {
    await ask(w, GENERIC, { ip: "203.0.113.50" });
    const limited = await ask(w, GENERIC, { ip: "203.0.113.50" });
    const bad = await w.handler(anonRequest("{nope", { ip: "203.0.113.51" }));
    const big = await w.handler(anonRequest("", { readBody: tooLargeBody, ip: "203.0.113.52" }));
    const wrongMethod = await w.handler(anonRequest({ text: GENERIC }, { method: "GET", ip: "203.0.113.53" }));
    for (const [label, res, status] of [["429", limited, 429], ["400", bad, 400], ["413", big, 413], ["405", wrongMethod, 405]] as const) {
      assert.equal(res.status, status, label);
      assert.equal(JSON.parse(res.body).helpline, TELE_MANAS_LINE, label);
    }
  } finally {
    w.cleanup();
  }
  const boom = anonWorld({ deps: { clientKey: () => { throw new TypeError("x"); } } });
  try {
    const res = await ask(boom, GENERIC);
    assert.equal(res.status, 500);
    assert.equal(res.json.helpline, TELE_MANAS_LINE);
  } finally {
    boom.cleanup();
  }
});

test("U7 repair D (API): the sign-in and no-answer replies over the real route carry the helpline line too", async () => {
  const w = anonWorld({ kb: recordingKb(SEARCH_EMPTY) });
  try {
    const signIn = await ask(w, "I am thinking about my future, what should I study?", { ip: "198.51.100.60" }); // D-093 2A: "thinking about ending things" is now a crisis phrase (engine crisis-defaults.test.ts); this test is about the personal-question sign-in reply
    assert.equal(signIn.json.state, "sign_in_required");
    assert.equal(signIn.json.message, ANONYMOUS_SIGN_IN_TEXT);
    const none = await ask(w, GENERIC, { ip: "198.51.100.61" });
    assert.equal(none.json.state, "no_sourced_answer");
    assert.equal(none.json.message, ANONYMOUS_NO_ANSWER_TEXT);
  } finally {
    w.cleanup();
  }
});

test("U7 repair C/E/F over the route: no follow-up question, opaque source ids and an email address is sign-in-required", async () => {
  const w = anonWorld({ provider: kbAnswerProvider([GOOD_CLAIM], "Which marks did you score and which school do you attend? http://collect.example.test") });
  try {
    const res = await ask(w, GENERIC, { ip: "198.51.100.70" });
    assert.equal(res.json.state, "ok");
    assert.doesNotMatch(res.json.message, /marks|school|http|\?/);
    assert.deepEqual(res.json.sources.map((s: { id: string }) => s.id), ["s1"]);
    assert.deepEqual(res.json.claims[0].sourceIds, ["s1"]);
    assert.ok(!JSON.stringify(res.json).includes("t-sem-1"));
    const mail = await ask(w, "What are the fees in Germany? mail me at priya.nair@example.test", { ip: "198.51.100.71" });
    assert.equal(mail.json.state, "sign_in_required");
  } finally {
    w.cleanup();
  }
});

test("U7 repair 3: client addresses are normalised before hashing - IPv4-mapped IPv6 shares the IPv4 bucket and every address in one IPv6 /64 shares one bucket", async () => {
  assert.equal(normalizeClientAddress("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeClientAddress("::ffff:cb00:7107"), "203.0.113.7");
  assert.equal(normalizeClientAddress("203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeClientAddress("2001:db8:abcd:12::1"), normalizeClientAddress("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff"));
  assert.notEqual(normalizeClientAddress("2001:db8:abcd:12::1"), normalizeClientAddress("2001:db8:abcd:13::1"));
  assert.equal(normalizeClientAddress("fe80::1%eth0"), normalizeClientAddress("fe80::2"));
  assert.equal(normalizeClientAddress(undefined), undefined);
  assert.equal(normalizeClientAddress("not an address"), "not an address", "an unparseable value is kept verbatim (one shared bucket, never throws)");
  const w = anonWorld();
  try {
    // rotating the low 64 bits of one IPv6 address does not buy a fresh budget
    for (let i = 0; i < 10; i++) assert.equal((await ask(w, GENERIC, { ip: `2001:db8:abcd:12::${i + 1}` })).status, 200, `request ${i + 1}`);
    assert.equal((await ask(w, GENERIC, { ip: "2001:db8:abcd:12:aaaa:bbbb:cccc:dddd" })).status, 429);
    assert.equal((await ask(w, GENERIC, { ip: "2001:db8:abcd:99::1" })).status, 200, "a different /64 has its own budget");
    // the IPv4-mapped form of a client shares the plain IPv4 client's bucket
    for (let i = 0; i < 5; i++) await ask(w, GENERIC, { ip: "203.0.113.200" });
    for (let i = 0; i < 5; i++) assert.equal((await ask(w, GENERIC, { ip: "::ffff:203.0.113.200" })).status, 200);
    assert.equal((await ask(w, GENERIC, { ip: "203.0.113.200" })).status, 429);
  } finally {
    w.cleanup();
  }
});

test("U7 repair 4: with a full table the O(n) sweep runs at most once a second, however many new keys arrive", () => {
  class Spy extends AnonymousRateLimiter {
    sweeps = 0;
    override sweep(): void {
      this.sweeps += 1;
      super.sweep();
    }
  }
  let now = 1_000_000;
  const lim = new Spy({ limit: 10, windowMs: 60_000, maxKeys: 3, nowMs: () => now });
  for (const k of ["a", "b", "c"]) assert.equal(lim.check(k).allowed, true);
  for (let i = 0; i < 1000; i++) assert.equal(lim.check(`new-${i}`).allowed, false, "a full table of live keys refuses a new key");
  assert.ok(lim.sweeps <= 1, `${lim.sweeps} sweeps in one instant`);
  now += 1_100;
  for (let i = 0; i < 1000; i++) lim.check(`later-${i}`);
  assert.ok(lim.sweeps <= 2, `${lim.sweeps} sweeps after 1.1 s`);
  now += 61_000;
  assert.equal(lim.check("fresh").allowed, true, "expired keys are purged by a later sweep and the table reopens");
});
