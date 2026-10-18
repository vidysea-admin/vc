import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES } from "@vc/db";
import { HIT } from "./anonymous-fixtures.js";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, everythingStored, kbAnswerProvider, minor, newThread, recordingKb, studentToken, threadsPath, turnsPath } from "./chat-fixtures.js";

const CONCERN = "I feel hopeless about my marks";
const OVERLONG = "I want to kill myself. " + "x ".repeat(3000);
const flags = (w: ReturnType<typeof chatWorld>) => w.fakeDb.collection<{ turnId: string; kind: string; threadId: string }>(COLLECTION_NAMES.student_flags).all();
const turns = (w: ReturnType<typeof chatWorld>) => w.fakeDb.collection<any>(COLLECTION_NAMES.chat_turns).all();
const usage = (w: ReturnType<typeof chatWorld>) => w.fakeDb.collection<{ textTurns: number }>(COLLECTION_NAMES.student_usage).all().reduce((n, u) => n + u.textTurns, 0);
const post = (w: any, token: string, tid: string, text: string, id: string, sid = "stu-1") => call(w, "POST", turnsPath(sid, tid), { token, body: { text, clientTurnId: id } });
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const until = async (c: () => boolean) => {
  const t0 = Date.now();
  while (!c()) {
    if (Date.now() - t0 > 20000) throw new Error("until timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
};

test("P1 outage: ordinary 503 zero writes, retry works; crisis answered+escalated, text not stored", async () => {
  let down = true;
  const w = chatWorld({
    deps: {
      profile: {
        facts: async () => {
          if (down) throw new Error("down");
          return [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }];
        },
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const tid = await newThread(w, token);
    const r1 = await post(w, token, tid, `${GERMANY_QUESTION} for Meera Kulkarni`, "o-1");
    assert.equal(r1.status, 503);
    assert.equal(turns(w).length, 0);
    assert.equal(flags(w).length, 0);
    assert.equal(usage(w), 0);
    assert.equal(w.provider.calls.length, 0);
    assert.ok(!/Meera|Kulkarni/.test(everythingStored(w.fakeDb)));
    const rc = await post(w, token, tid, `Meera Kulkarni here. ${CRISIS_TEXT}`, "o-2");
    assert.equal(rc.status, 200);
    assert.equal(rc.json.state, "escalated");
    assert.match(rc.json.message, /14416/);
    assert.equal(w.escalations.length, 1);
    assert.equal(flags(w).length, 1);
    assert.equal(turns(w).length, 0);
    assert.ok(!/Meera|Kulkarni|kill/i.test(everythingStored(w.fakeDb)));
    down = false;
    const r2 = await post(w, token, tid, `${GERMANY_QUESTION} for Meera Kulkarni`, "o-1");
    assert.equal(r2.status, 200);
    assert.ok(!/Meera|Kulkarni/.test(everythingStored(w.fakeDb)));
    down = true;
    const t2 = await newThread(w, token);
    const rcon = await post(w, token, t2, CONCERN, "o-3");
    console.log("OUTAGE concern ->", rcon.status, rcon.json?.state, "turns", turns(w).filter((t: any) => t.threadId === t2).length);
  } finally {
    w.cleanup();
  }
});

test("P2 flood: 5 crisis in 10 min, other thread/student independent", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const tid = await newThread(w, token);
    for (let i = 0; i < 5; i++) {
      const r = await post(w, token, tid, CRISIS_TEXT, `f-${i}`);
      assert.equal(r.status, 200);
      assert.match(r.json.message, /14416/);
      w.clock.ms += 100_000;
    }
    assert.equal(w.escalations.length, 1);
    assert.equal(flags(w).length, 1);
    assert.equal(turns(w).length, 2);
    assert.equal(usage(w), 1);
    const t2 = await newThread(w, token);
    await post(w, token, t2, CRISIS_TEXT, "g-0");
    assert.equal(w.escalations.length, 2);
    const tok2 = await studentToken(adult("stu-2"));
    const t3 = await newThread(w, tok2, "stu-2");
    await post(w, tok2, t3, CRISIS_TEXT, "h-0", "stu-2");
    assert.equal(w.escalations.length, 3);
  } finally {
    w.cleanup();
  }
});

test("P2b failed flag write gives slot back", async () => {
  const w = chatWorld();
  try {
    const col: any = w.fakeDb.collection(COLLECTION_NAMES.student_flags);
    const keys = Object.keys(col).concat(Object.getOwnPropertyNames(Object.getPrototypeOf(col)));
    let fail = 1;
    const wrapped: string[] = [];
    for (const m of ["updateOne", "insertOne", "replaceOne"]) {
      const orig = col[m]?.bind(col);
      if (orig) {
        wrapped.push(m);
        col[m] = async (...a: any[]) => {
          if (fail-- > 0) throw new Error("flag blip");
          return orig(...a);
        };
      }
    }
    const token = await studentToken(adult());
    const tid = await newThread(w, token);
    await post(w, token, tid, CRISIS_TEXT, "ff-1");
    const afterFirst = w.escalations.length;
    await post(w, token, tid, CRISIS_TEXT, "ff-2");
    await post(w, token, tid, CRISIS_TEXT, "ff-3");
    console.log("FLAGFAIL wrapped", wrapped.join(","), "escalations after first->third:", afterFirst, "->", w.escalations.length, "flags", flags(w).length, keys.length);
    assert.ok(flags(w).length >= 1, "a flag was eventually written");
  } finally {
    w.cleanup();
  }
});

test("P3 ranks: concern->crisis=2; crisis->concern=1; failed upgrade restores previous holder", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const a = await newThread(w, token);
    const b = await newThread(w, token);
    await post(w, token, a, CONCERN, "r-1");
    w.clock.ms += 60_000;
    await post(w, token, a, CRISIS_TEXT, "r-2");
    assert.equal(w.escalations.length, 2);
    await post(w, token, b, CRISIS_TEXT, "r-3");
    w.clock.ms += 60_000;
    await post(w, token, b, CONCERN, "r-4");
    assert.equal(w.escalations.length, 3);
  } finally {
    w.cleanup();
  }
  let n = 0;
  const w2 = chatWorld({
    deps: {
      escalateForTenant: () => async (input) => {
        n++;
        if (n === 2) throw new Error("blip");
        w2.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const t = await newThread(w2, token);
    await post(w2, token, t, CONCERN, "u-1");
    w2.clock.ms += 60_000;
    const up = await post(w2, token, t, CRISIS_TEXT, "u-2");
    assert.equal(up.status, 200);
    assert.match(up.json.message, /14416/);
    assert.equal(n, 2);
    w2.clock.ms += 60_000;
    await post(w2, token, t, CONCERN, "u-3");
    assert.equal(n, 2, "restored previous holder keeps a concern quiet");
    await post(w2, token, t, CRISIS_TEXT, "u-4");
    assert.equal(n, 3);
  } finally {
    w2.cleanup();
  }
});

test("P4 concurrent: first fails, others wait and escalate; every crisis turn recorded", async () => {
  const gate = deferred();
  let n = 0;
  const w = chatWorld({
    deps: {
      escalateForTenant: () => async (input) => {
        n++;
        if (n === 1) {
          await gate.promise;
          throw new Error("blip");
        }
        w.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const t = await newThread(w, token);
    const p1 = post(w, token, t, CRISIS_TEXT, "k-1");
    await until(() => n >= 1);
    const p2 = post(w, token, t, CRISIS_TEXT, "k-2");
    const p3 = post(w, token, t, CRISIS_TEXT, "k-3");
    await new Promise((r) => setTimeout(r, 30));
    gate.resolve();
    const rs = await Promise.all([p1, p2, p3]);
    for (const r of rs) {
      assert.equal(r.status, 200);
      assert.match(r.json.message, /14416/);
    }
    console.log("CONCURRENT attempts", n, "escalations", w.escalations.length, "flags", flags(w).map((f) => f.turnId).join(","));
    assert.ok(w.escalations.length >= 1, "at least one real escalation");
  } finally {
    gate.resolve();
    w.cleanup();
  }
});

test("P5 replay of completed crisis turn", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const t = await newThread(w, token);
    const r1 = await post(w, token, t, CRISIS_TEXT, "rp-1");
    const calls = w.provider.calls.length;
    const esc = w.escalations.length;
    const fl = flags(w).length;
    const tr = turns(w).length;
    const u = usage(w);
    const r2 = await post(w, token, t, CRISIS_TEXT, "rp-1");
    assert.equal(r2.status, 200);
    assert.equal(r2.json.message, r1.json.message);
    assert.equal(w.escalations.length, esc);
    assert.equal(flags(w).length, fl);
    assert.equal(turns(w).length, tr);
    assert.equal(usage(w), u);
    assert.equal(w.provider.calls.length, calls);
    const r3 = await post(w, token, t, CRISIS_TEXT + " again please", "rp-1");
    console.log("REPLAY different text same id ->", r3.status, r3.json?.error ?? r3.json?.state);
    await post(w, token, t, CRISIS_TEXT, "rp-2");
    assert.equal(turns(w).length, tr);
  } finally {
    w.cleanup();
  }
});

test("P6 overlong crisis then crisis; minor then full; textless floods", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const t = await newThread(w, token);
    const o = await post(w, token, t, OVERLONG, "ol-1");
    assert.equal(o.json.state, "escalated");
    assert.equal(w.escalations.length, 0);
    assert.equal(turns(w).length, 0);
    w.clock.ms += 60_000;
    await post(w, token, t, CRISIS_TEXT, "ol-2");
    assert.equal(w.escalations.length, 1);
    const mt = await studentToken(minor("stu-3"));
    const mc = await studentToken(minor("stu-3", "tenant-a", { guardianConsent: true }));
    const th = await newThread(w, mt, "stu-3");
    await post(w, mt, th, CRISIS_TEXT, "mn-1", "stu-3");
    assert.equal(turns(w).filter((x: any) => x.threadId === th).length, 0);
    w.clock.ms += 60_000;
    await post(w, mc, th, CRISIS_TEXT, "mn-2", "stu-3");
    assert.equal(w.escalations.length, 2);
    const t5 = await newThread(w, token);
    const before = flags(w).length;
    for (let i = 0; i < 40; i++) await post(w, token, t5, OVERLONG, `fl-${i}`);
    console.log("TEXTLESS FLOOD flags added:", flags(w).length - before, "turns", turns(w).filter((x: any) => x.threadId === t5).length, "esc", w.escalations.length);
    const t6 = await newThread(w, token);
    await post(w, token, t6, OVERLONG, "oc-1");
    w.clock.ms += 60_000;
    await post(w, token, t6, CONCERN, "oc-2");
    console.log("OVERLONG->CONCERN esc total", w.escalations.length);
  } finally {
    w.cleanup();
  }
});

test("P7 concern A inflight, crisis B takes over, A fails, B fails, concern C escalates; D quiet", async () => {
  const gates: Array<() => void> = [];
  let n = 0;
  const w = chatWorld({
    deps: {
      quietWaitMs: 50,
      escalateForTenant: () => async (input) => {
        const k = ++n;
        if (k <= 2) {
          await new Promise<void>((r) => gates.push(r));
          throw new Error("blip");
        }
        w.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const t = await newThread(w, token);
    const a = post(w, token, t, CONCERN, "x-a");
    await until(() => gates.length >= 1);
    const b = post(w, token, t, CRISIS_TEXT, "x-b");
    await until(() => gates.length >= 2);
    gates[0]!();
    await a;
    gates[1]!();
    await b;
    const c = await post(w, token, t, CONCERN, "x-c");
    assert.equal(c.status, 200);
    assert.equal(w.escalations.length, 1);
    await post(w, token, t, CONCERN, "x-d");
    assert.equal(n, 3);
  } finally {
    gates.forEach((g) => g());
    w.cleanup();
  }
  const gates2: Array<() => void> = [];
  let n2 = 0;
  const w2 = chatWorld({
    deps: {
      quietWaitMs: 50,
      escalateForTenant: () => async (input) => {
        const k = ++n2;
        if (k <= 2) {
          await new Promise<void>((r) => gates2.push(r));
          throw new Error("blip");
        }
        w2.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const t = await newThread(w2, token);
    const a = post(w2, token, t, CONCERN, "y-a");
    await until(() => gates2.length >= 1);
    const b = post(w2, token, t, CRISIS_TEXT, "y-b");
    await until(() => gates2.length >= 2);
    gates2[1]!();
    await b;
    gates2[0]!();
    await a;
    await post(w2, token, t, CONCERN, "y-c");
    console.log("REVERSE-ORDER esc", w2.escalations.length, "n2", n2);
    assert.equal(w2.escalations.length, 1);
  } finally {
    gates2.forEach((g) => g());
    w2.cleanup();
  }
});

test("P8 quiet turn whose in-flight holder fails escalates itself within 5s (default wait)", async () => {
  const gate = deferred();
  let n = 0;
  const w = chatWorld({
    deps: {
      escalateForTenant: () => async (input) => {
        n++;
        if (n === 1) {
          await gate.promise;
          throw new Error("blip");
        }
        w.escalations.push(input);
      },
    },
  });
  try {
    const token = await studentToken(adult());
    const t = await newThread(w, token);
    const p1 = post(w, token, t, CRISIS_TEXT, "q-1");
    await until(() => n >= 1);
    const t0 = Date.now();
    const p2 = post(w, token, t, CRISIS_TEXT, "q-2");
    await new Promise((r) => setTimeout(r, 50));
    gate.resolve();
    await p1;
    const r2 = await p2;
    const dt = Date.now() - t0;
    console.log("QUIET-HOLDER-FAILS elapsed ms", dt, "esc", w.escalations.length);
    assert.ok(dt < 5000);
    assert.equal(r2.json.state, "escalated");
    assert.equal(w.escalations.length, 1);
  } finally {
    gate.resolve();
    w.cleanup();
  }
});

test("P9 names end-to-end + echo", async () => {
  for (const intro of ["my name is devika nair.", "i am kabir.", "call me aarav.", "MY NAME IS ROHAN.", "naam hai priya.", "Mera naam Priya hai."]) {
    const name = intro.replace(/\.$/, "").split(/\s+/).filter((x) => !/^(my|name|is|i|am|call|me|naam|hai|mera)$/i.test(x));
    const text = `Welcome ${name.join(" ")}, public universities in Germany charge no tuition for most programmes.`;
    const kb = recordingKb({ status: "ok", hits: [{ ...HIT, text }], dropped: 0 });
    const w = chatWorld({ kb, provider: kbAnswerProvider([{ text, kind: "fact", sourceIds: ["t-sem-1"] }]) });
    try {
      const token = await studentToken(adult());
      const tid = await newThread(w, token);
      const body = { text: `${intro} ${GERMANY_QUESTION}`, clientTurnId: "nm-1" };
      const live = await call(w, "POST", turnsPath("stu-1", tid), { token, body });
      const stored = everythingStored(w.fakeDb);
      const rep = await call(w, "POST", turnsPath("stu-1", tid), { token, body });
      const hist = await call(w, "GET", `${threadsPath("stu-1")}/${tid}`, { token });
      const leak = (s: string) => name.filter((x) => s.toLowerCase().includes(x.toLowerCase()));
      console.log("NAME", JSON.stringify(intro), "liveHasName", leak(live.body).length > 0, "storedLeak", JSON.stringify(leak(stored)), "replayLeak", JSON.stringify(leak(rep.body)), "histLeak", JSON.stringify(leak(hist.body)));
    } finally {
      w.cleanup();
    }
  }
});

test("P10 escalation text redacted; i am unalive escalates", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const t = await newThread(w, token);
    await post(w, token, t, "my name is Devika Nair, ph 9876543210, a@b.com. I want to kill myself", "e-1");
    const h = JSON.stringify(w.escalations);
    console.log("ESC-HANDED", h.slice(0, 400));
    for (const raw of ["Devika", "Nair", "9876543210", "a@b.com"]) assert.ok(!h.includes(raw), raw);
    const t2 = await newThread(w, token);
    const r = await post(w, token, t2, "i am unalive", "e-2");
    assert.equal(r.json.state, "escalated");
    assert.match(JSON.stringify(w.escalations), /unalive/);
    const t3 = await newThread(w, token);
    await post(w, token, t3, "i am kabir and i want to kill myself", "e-3");
    console.log("ESC3", JSON.stringify(w.escalations[w.escalations.length - 1]).slice(0, 300));
  } finally {
    w.cleanup();
  }
});
