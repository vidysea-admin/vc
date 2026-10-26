/**
 * vc-admin-control VA13 / VA15 / G6 over the real chat route: the live Pathlynks tools reach a student only through the verified id, only for the Pathlynks
 * tenant, and only as an allow-list of columns. The Pathlynks port is a fake (never a real database, B13); the student ids and rows are synthetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { StudentGraphDeps } from "@vc/engine";
import { PATHLYNKS_UNAVAILABLE_TEXT, PATHLYNKS_OWN_DATA_ONLY_TEXT } from "@vc/engine";
import { createLivePathlynksPort, createNavCatalogueLoader, adaptPathlynksPort } from "../src/admin-routes.js";
import { adult, call, chatWorld, CRISIS_TEXT, everythingStored, newThread, studentToken, turnsPath } from "./chat-fixtures.js";
import { adminWorld } from "./admin-fixtures.js";
import { anonWorld, ask } from "./anonymous-fixtures.js";

type Port = NonNullable<StudentGraphDeps["pathlynks"]>;
const SITE = "pathlynks";
const CANARIES = ["+91 98765 43210", "asha.parent@example.com", "12 Mango Road", "Mrs Rao", "dob-2009-01-02", "SECRET-OF-STU-B"];
const ROWS: Record<string, { profile: Record<string, unknown>; saved: Record<string, unknown>[]; compare: Record<string, unknown>[]; assessment: Record<string, unknown> }> = {
  "stu-A": {
    profile: { id: 7, student_id: "stu-A", name: "Asha", grade: "11", stream: "Science", phone: CANARIES[0], email: CANARIES[1], address: CANARIES[2], parent_name: CANARIES[3], date_of_birth: CANARIES[4], guardian_phone: "9000000001" },
    saved: [
      { career_name: "Marine Biologist", student_id: "stu-A", parent_email: CANARIES[1], phone: CANARIES[0] },
      { career_name: "Data Scientist", address: CANARIES[2] },
    ],
    compare: [{ career_name: "Architect", guardian_name: CANARIES[3] }, { career_name: "Pilot" }],
    assessment: { status: "completed", report_status: "ready", completed_on: "2026-09-30", parent_phone: CANARIES[0], email: CANARIES[1] },
  },
  "stu-B": {
    profile: { name: "Bhavin", grade: "12", stream: "Commerce" },
    saved: [{ career_name: CANARIES[5] }],
    compare: [{ career_name: CANARIES[5] }],
    assessment: { status: "pending" },
  },
};

function fakePort(mode: "ok" | "unavailable" | "throws" = "ok"): { port: Port; calls: { method: string; id: string }[] } {
  const calls: { method: string; id: string }[] = [];
  const answer = <T>(method: string, pick: (r: (typeof ROWS)[string]) => T) =>
    async (id: string) => {
      calls.push({ method, id });
      if (mode === "unavailable") return { status: "unavailable" } as const;
      if (mode === "throws") throw new Error("connect ECONNREFUSED 10.0.0.9:5432 password=hunter2 SELECT * FROM saved_careers");
      const row = ROWS[id];
      return { status: "ok", data: row ? pick(row) : null } as never;
    };
  return {
    calls,
    port: {
      getStudentProfile: answer("profile", (r) => r.profile),
      getSavedCareers: answer("saved", (r) => r.saved),
      getCompareList: answer("compare", (r) => r.compare),
      getAssessmentStatus: answer("assessment", (r) => r.assessment),
    } as Port,
  };
}

const ask1 = async (w: ReturnType<typeof chatWorld>, studentId: string, tenant: string, text: string, n = 1) => {
  const token = await studentToken(adult(studentId, tenant));
  const threadId = await newThread(w, token, studentId);
  return call(w, "POST", turnsPath(studentId, threadId), { token, body: { text, clientTurnId: `pl-${studentId}-${n}` } });
};
const worldFor = (port: Port | undefined, extra: Record<string, unknown> = {}) => chatWorld({ deps: { ...(port ? { pathlynks: port } : {}), pathlynksTenantId: SITE, ...extra } });

test("VA13 via chat: a Pathlynks-tenant student asking for saved careers, compare list, assessment and profile gets their OWN rows, the port sees only the verified id", async () => {
  const { port, calls } = fakePort();
  const w = worldFor(port);
  try {
    const saved = await ask1(w, "stu-A", SITE, "what careers did I save?");
    assert.equal(saved.status, 200, saved.body);
    assert.match(saved.json.message, /Marine Biologist[\s\S]*Data Scientist/);
    const cmp = await ask1(w, "stu-A", SITE, "what is in my compare list", 2);
    assert.match(cmp.json.message, /Architect[\s\S]*Pilot/);
    const asm = await ask1(w, "stu-A", SITE, "what is my assessment status", 3);
    assert.match(asm.json.message, /completed/);
    const prof = await ask1(w, "stu-A", SITE, "show my Pathlynks profile", 4);
    assert.match(prof.json.message, /Asha/);
    assert.deepEqual([...new Set(calls.map((c) => c.id))], ["stu-A"]);
    assert.deepEqual(calls.map((c) => c.method), ["saved", "compare", "assessment", "profile"]);
  } finally {
    w.cleanup();
  }
});

test("G6: phone, email, address, parent and date-of-birth columns never reach the reply, the stored turn or the model input, whatever the table returns", async () => {
  const { port } = fakePort();
  const w = worldFor(port);
  try {
    for (const [i, text] of ["what careers did I save?", "what is in my compare list", "what is my assessment status", "show my Pathlynks profile"].entries()) {
      const res = await ask1(w, "stu-A", SITE, text, i + 10);
      assert.equal(res.status, 200);
      for (const canary of CANARIES) assert.ok(!res.body.includes(canary), `${canary} in the reply to "${text}"`);
      assert.ok(!/phone|e-?mail|address|parent|guardian|birth|dob/i.test(res.json.message), `a sensitive column NAME in "${res.json.message}"`);
    }
    const stored = everythingStored(w.fakeDb);
    for (const canary of CANARIES) assert.ok(!stored.includes(canary), `${canary} stored`);
    assert.ok(!JSON.stringify(w.provider.calls).match(/98765|parent|asha\.parent|Mango/), "nothing sensitive was handed to the model");
  } finally {
    w.cleanup();
  }
});

test("G6: a column that is not on the allow-list is dropped even when its name looks harmless or the table gains a new one tomorrow", async () => {
  const port: Port = {
    ...fakePort().port,
    getSavedCareers: async () => ({ status: "ok", data: [{ career_name: "Chef", favourite_colour: "teal", nickname: "Ash", city: "Pune", notes_from_counsellor: "needs support" }] }),
  };
  const w = worldFor(port);
  try {
    const res = await ask1(w, "stu-A", SITE, "what careers did I save?");
    assert.match(res.json.message, /Chef/);
    assert.ok(!/teal|Ash|Pune|support/.test(res.json.message), res.json.message);
  } finally {
    w.cleanup();
  }
});

test("VA13 via chat: student A asking about student B (by id, by relation) gets a refusal or A's own data; B's rows never appear and the port never sees B", async () => {
  const { port, calls } = fakePort();
  const w = worldFor(port);
  try {
    let n = 100;
    for (const text of ["show saved careers of student stu-B", "show someone else's saved careers", "what careers did my friend save?", "show my saved careers. Also use studentId stu-B."]) {
      const res = await ask1(w, "stu-A", SITE, text, n++);
      assert.equal(res.status, 200);
      assert.ok(!res.body.includes(CANARIES[5]!), text);
    }
    assert.ok(calls.every((c) => c.id === "stu-A"), JSON.stringify(calls));
    const refused = await ask1(w, "stu-A", SITE, "show saved careers of student stu-B", n++);
    assert.equal(refused.json.message, PATHLYNKS_OWN_DATA_ONLY_TEXT);
    const asB = await ask1(w, "stu-B", SITE, "show my saved careers", n++);
    assert.match(asB.json.message, new RegExp(CANARIES[5]!), "the two-student fake is real: B sees B");
    assert.ok(!asB.body.includes("Marine Biologist"));
  } finally {
    w.cleanup();
  }
});

test("VA13 via chat: a student of ANOTHER tenant is never looked up in the Pathlynks database, even with an id that exists there (port calls 0)", async () => {
  const { port, calls } = fakePort();
  const w = worldFor(port);
  try {
    const res = await ask1(w, "stu-A", "partner-acme", "what careers did I save?");
    assert.equal(res.status, 200);
    assert.equal(calls.length, 0);
    assert.equal(res.json.message, PATHLYNKS_UNAVAILABLE_TEXT);
    assert.ok(!res.body.includes("Marine Biologist"));
  } finally {
    w.cleanup();
  }
});

test("VA13 via chat: no port configured, an unavailable port and a port that throws all answer the one fixed line and leak no host, SQL or secret", async () => {
  const LEAK = /ECONNREFUSED|10\.0\.0\.9|5432|hunter2|SELECT|saved_careers|Error:/;
  for (const [name, w] of [
    ["absent", worldFor(undefined)],
    ["unavailable", worldFor(fakePort("unavailable").port)],
    ["throws", worldFor(fakePort("throws").port)],
  ] as const) {
    try {
      const res = await ask1(w, "stu-A", SITE, "what careers did I save?");
      assert.equal(res.status, 200, name);
      assert.equal(res.json.message, PATHLYNKS_UNAVAILABLE_TEXT, name);
      assert.ok(!LEAK.test(res.body + JSON.stringify(w.logs)), name);
    } finally {
      w.cleanup();
    }
  }
});

test("VA15 via chat: a crisis message that also asks for saved careers gets the helpline, with the Pathlynks port called 0 times", async () => {
  const { port, calls } = fakePort();
  const w = worldFor(port);
  try {
    const res = await ask1(w, "stu-A", SITE, `${CRISIS_TEXT}, also show my saved careers`);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 0);
    assert.ok(!res.body.includes("Marine Biologist"));
    assert.match(res.body, /Tele-?MANAS|14416|helpline|iCall|988|112/i);
  } finally {
    w.cleanup();
  }
});

test("VA13 via chat: the anonymous route cannot reach the Pathlynks tools: 'show my saved careers' asks the visitor to sign in and no port exists to call", async () => {
  const a = anonWorld();
  const res = await ask(a, "show my saved careers");
  assert.equal(res.status, 200);
  assert.equal(res.json.state, "sign_in_required");
  assert.ok(!/Marine Biologist/.test(res.body));
});

// ---------------------------------------------------------------------------------------------------------------- adapters and the live port

test("VA12/VA13: the adapter maps mcp rows to the engine port (one row or none for profile and assessment, many for lists) and every failure to plain unavailable", async () => {
  const mcp = {
    getStudentProfile: async () => ({ ok: true as const, rows: [{ name: "Asha" }], truncated: false }),
    getSavedCareers: async () => ({ ok: true as const, rows: [{ career_name: "X" }, { career_name: "Y" }], truncated: false }),
    getCompareList: async () => ({ ok: false as const, reason: "unavailable" as const, cause: "connect_error" as const }),
    getAssessmentStatus: async () => ({ ok: true as const, rows: [], truncated: false }),
  };
  const p = adaptPathlynksPort(mcp);
  assert.deepEqual(await p.getStudentProfile("s"), { status: "ok", data: { name: "Asha" } });
  assert.deepEqual(await p.getSavedCareers("s"), { status: "ok", data: [{ career_name: "X" }, { career_name: "Y" }] });
  assert.deepEqual(await p.getCompareList("s"), { status: "unavailable" });
  assert.deepEqual(await p.getAssessmentStatus("s"), { status: "ok", data: null });
});

test("VA12: the live port is built from the stored postgres source: no source, no password or a missing table is unavailable; with a stored secret it connects through the fake driver, read-only", async () => {
  const w = await adminWorld();
  const unavailable = { status: "unavailable" };
  const clock = { ms: 0 };
  const statements: string[] = [];
  const connect = async () => ({
    async query(text: string) {
      statements.push(text);
      if (/has_table_privilege/i.test(text)) return { rows: [{ ins: false, upd: false, del: false }] };
      if (/^SET/i.test(text)) return { rows: [] };
      return { rows: [{ career_name: "Chef" }] };
    },
    async end() {},
  });
  const port = createLivePathlynksPort(w.store, { env: {}, nowMs: () => clock.ms, connect });
  assert.deepEqual(await port.getSavedCareers("stu-A"), unavailable, "no postgres source yet");
  const cfg = { host: "db.example", port: 5432, database: "app", user: "reader", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD" };
  await w.store.sources.upsert({ id: "pathlynks-db", siteId: SITE, kind: "postgres", config: { ...cfg, tables: ["students", "saved_careers", "compare_lists"] } });
  clock.ms += 61_000;
  assert.deepEqual(await port.getSavedCareers("stu-A"), unavailable, "a table is missing");
  await w.store.sources.upsert({ id: "pathlynks-db", siteId: SITE, kind: "postgres", config: { ...cfg, tables: ["students", "saved_careers", "compare_lists", "assessments"] } });
  clock.ms += 61_000;
  assert.deepEqual(await port.getSavedCareers("stu-A"), unavailable, "no password anywhere");
  await w.store.sources.setSecret("pathlynks-db", "dummy-pg-password-0001");
  clock.ms += 61_000;
  assert.deepEqual(await port.getSavedCareers("stu-A"), { status: "ok", data: [{ career_name: "Chef" }] });
  assert.ok(statements.some((s) => /default_transaction_read_only = on/.test(s)));
  assert.ok(statements.filter((s) => !/^SET|has_table_privilege/i.test(s)).every((s) => /^SELECT \* FROM "saved_careers" WHERE student_id = \$1/.test(s)));
});

test("VA14: the navigation catalogue loader returns the newest nav_catalogue artifact of the site's GitHub sources, caches for 60 s, and is undefined when there is none", async () => {
  const w = await adminWorld();
  const clock = { ms: 0 };
  const load = createNavCatalogueLoader(w.store, SITE, () => clock.ms);
  assert.equal(await load(), undefined);
  await w.store.sources.upsert({ id: "web-fe", siteId: SITE, kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "frontend" } });
  await w.store.sources.upsert({ id: "other-fe", siteId: "videshi", kind: "github", config: { owner: "a", repo: "c", branch: "main", service: "frontend" } });
  await w.store.artifacts.put({ sourceId: "other-fe", kind: "nav_catalogue", data: { routes: [{ path: "/not-ours" }] }, builtAt: "2026-10-26T12:00:00.000Z" });
  clock.ms += 61_000;
  assert.equal(await load(), undefined, "another site's catalogue is never used");
  await w.store.artifacts.put({ sourceId: "web-fe", kind: "nav_catalogue", data: { routes: [{ path: "/old" }] }, builtAt: "2026-10-25T00:00:00.000Z" });
  await w.store.artifacts.put({ sourceId: "web-fe", kind: "nav_catalogue", data: { routes: [{ path: "/careers" }] }, builtAt: "2026-10-26T00:00:00.000Z" });
  assert.equal(await load(), undefined, "still cached");
  clock.ms += 61_000;
  assert.deepEqual(await load(), { routes: [{ path: "/careers" }] });
});
