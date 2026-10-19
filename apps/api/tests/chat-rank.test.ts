/**
 * P1 U6w (CORE-REQUEST of p1-u6b; fixes ISS-163; D-097 item 3 / ISS-167): the chat path uses the U6b ranking on the student's confirmed profile
 * facts when the graph picks `rank_options`. Outcome tests through the real chat handler, the fake Db and the shared per-tenant store; synthetic
 * students, facts and option numbers only (B13). The option numbers are the U6b fixture: invented, so every number the student sees is NOT PROVEN.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rankOptions, type OptionData, type OptionDataPort } from "@vc/engine";
import { TurnResponseSchema } from "@vc/schemas";
import { createChatApi, rankFactFromStored, type ChatApiDeps } from "../src/chat.js";
import { anonWorld, ask } from "./anonymous-fixtures.js";
import { GERMANY_QUESTION, adult, call, chatWorld, everythingStored, minor, newThread, profilePath, studentToken, threadsPath, turnsPath, type ChatWorld } from "./chat-fixtures.js";

const FIX = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/engine/tests/fixtures/ranking-profiles.json", import.meta.url)), "utf8")) as {
  optionIds: string[];
  options: Record<string, OptionData>;
};
const RANK_TEXT = "Please rank my shortlist for me";

function spyPort(over: Partial<OptionDataPort> = {}): OptionDataPort & { calls: string[] } {
  const calls: string[] = [];
  return { calls, get: (id) => (calls.push(id), FIX.options[id]), ...over } as OptionDataPort & { calls: string[] };
}

type Fact = { key: string; value: string };
const GERMANY_ENG: Fact[] = [
  { key: "target-country", value: "Germany" },
  { key: "field-of-study", value: "engineering" },
];
const CANADA_BIZ: Fact[] = [
  { key: "target-country", value: "Canada" },
  { key: "field-of-study", value: "Business" },
];

/** A chat world with ranking wired; `proposals` is what the (stubbed) fact extractor hears for a given tenant + student on the next stored turn. */
function rankWorld(over: { port?: OptionDataPort; deps?: Partial<ChatApiDeps>; optionIds?: NonNullable<ChatApiDeps["ranking"]>["optionIds"] } = {}) {
  const proposals = new Map<string, Fact[]>();
  const port = over.port ?? spyPort();
  const w = chatWorld({
    deps: {
      ranking: { port, optionIds: over.optionIds ?? (() => FIX.optionIds) },
      extractFacts: async (t) => {
        const key = `${t.tenantId}|${t.studentId}`;
        const out = proposals.get(key) ?? [];
        proposals.delete(key);
        return out;
      },
      ...over.deps,
    },
  });
  return { w, port, proposals };
}

/** The student says the facts in chat (proposed), then confirms each one through the decision route. */
async function sayAndConfirm(ctx: { w: ChatWorld; proposals: Map<string, Fact[]> }, tenant: string, studentId: string, facts: Fact[], confirm = true): Promise<string> {
  const token = await studentToken(adult(studentId, tenant));
  const threadId = await newThread(ctx.w, token, studentId);
  ctx.proposals.set(`${tenant}|${studentId}`, facts);
  const said = await call(ctx.w, "POST", turnsPath(studentId, threadId), { token, body: { text: GERMANY_QUESTION } });
  assert.equal(said.status, 200);
  if (confirm) {
    const prof = await call(ctx.w, "GET", profilePath(studentId), { token });
    for (const p of prof.json.proposed) {
      const done = await call(ctx.w, "POST", `/v1/students/${studentId}/chat/profile/facts/${p.factId}/decision`, { token, body: { action: "confirm" } });
      assert.equal(done.status, 200);
    }
  }
  return threadId;
}

async function rankTurn(w: ChatWorld, tenant: string, studentId: string, threadId: string) {
  const token = await studentToken(adult(studentId, tenant));
  const res = await call(w, "POST", turnsPath(studentId, threadId), { token, body: { text: RANK_TEXT } });
  assert.equal(res.status, 200, res.body);
  return res;
}

const rankedIds = (json: { claims: { text: string }[] }): string[] =>
  json.claims.map((c) => c.text.replace(/^NOT PROVEN: /, "")).filter((t) => t.startsWith("#")).map((t) => /^#\d+ (.*?):/.exec(t)![1]!);

// ---------------------------------------------------------------------------------------------------------
// Item 1 (ISS-163): a confirmed chat fact is stored as source "chat"; the ranker accepts it as student-confirmed, and only that
// ---------------------------------------------------------------------------------------------------------
test("U6w item 1 ISS-163: facts the student confirmed in chat (db label source 'chat') change the ranking, and two students with different facts get different orders", async () => {
  const ctx = rankWorld();
  try {
    const ta = await sayAndConfirm(ctx, "tenant-a", "syn-a", GERMANY_ENG);
    const tb = await sayAndConfirm(ctx, "tenant-a", "syn-b", CANADA_BIZ);
    const a = await rankTurn(ctx.w, "tenant-a", "syn-a", ta);
    const b = await rankTurn(ctx.w, "tenant-a", "syn-b", tb);
    TurnResponseSchema.parse(a.json);
    assert.equal(a.json.rankingProfile, "student-success");
    assert.equal(rankedIds(a.json)[0], "Munich engineering (synthetic)");
    assert.equal(rankedIds(b.json)[0], "Toronto business (synthetic)");
    assert.notDeepEqual(rankedIds(a.json), rankedIds(b.json));
    assert.deepEqual(
      a.json.profileFactsUsed.map((f: { key: string; source: string }) => [f.key, f.source]).sort(),
      [["field-of-study", "student-confirmed"], ["target-country", "student-confirmed"]],
      "the facts that moved the ranking are listed with the exact label",
    );
    // The stored row really carries the db label 'chat' (this is the mismatch ISS-163 names).
    assert.ok(ctx.w.fakeDb.collection<{ source: string }>("profile_facts").all().every((r) => r.source === "chat"));
  } finally {
    ctx.w.cleanup();
  }
});

test("U6w item 1: a fact the student has NOT confirmed (still proposed) never changes the ranking: every option is insufficient_data and no profile fact is reported as used", async () => {
  const ctx = rankWorld();
  try {
    const t = await sayAndConfirm(ctx, "tenant-a", "syn-p", GERMANY_ENG, false);
    const res = await rankTurn(ctx.w, "tenant-a", "syn-p", t);
    assert.equal(rankedIds(res.json).length, 0);
    assert.ok(res.json.claims.every((c: { text: string }) => /not ranked/.test(c.text)));
    assert.deepEqual(res.json.profileFactsUsed, []);
  } finally {
    ctx.w.cleanup();
  }
});

test("U6w item 1: the one mapping turns exactly {source 'chat', status 'confirmed'} into student-confirmed; a proposed row, a 'chat-extracted' label or an unknown label stay unmapped and the ranker ignores them", () => {
  const row = (source: string, status: string) => ({ key: "target-country", value: "Germany", source, status }) as never;
  assert.equal(rankFactFromStored(row("chat", "confirmed")).source, "student-confirmed");
  for (const [source, status] of [["chat", "proposed"], ["chat-extracted", "confirmed"], ["chat", "erased"], ["pathlynks-fake", "confirmed"]] as const) {
    const mapped = rankFactFromStored(row(source, status));
    assert.notEqual(mapped.source, "student-confirmed", `${source}/${status}`);
    const r = rankOptions({ studentId: "syn-x", optionIds: FIX.optionIds, facts: [mapped] }, spyPort());
    assert.equal(r.status, "ranked");
    if (r.status === "ranked") {
      assert.equal(r.ignoredFactCount, 1, `${source}/${status}`);
      assert.deepEqual(r.profileFactsUsed, []);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------
// Item 2: per-option numbers carry NOT PROVEN (D-097 item 3, ISS-167)
// ---------------------------------------------------------------------------------------------------------
test("U6w item 2 ISS-167: every number the student is shown carries a visible NOT PROVEN label, in the reply, in each number claim, and in the stored thread", async () => {
  const ctx = rankWorld();
  try {
    const t = await sayAndConfirm(ctx, "tenant-a", "syn-a", GERMANY_ENG);
    const res = await rankTurn(ctx.w, "tenant-a", "syn-a", t);
    const numbers = res.json.claims.filter((c: { kind: string }) => c.kind === "number");
    assert.ok(numbers.length >= 1);
    for (const c of numbers) assert.match(c.text, /^NOT PROVEN: /);
    assert.match(res.json.message, /NOT PROVEN/);
    const token = await studentToken(adult("syn-a", "tenant-a"));
    const thread = await call(ctx.w, "GET", `${threadsPath("syn-a")}/${t}`, { token });
    const stored = thread.json.turns.find((x: { role: string; claims?: unknown[] }) => x.role === "assistant" && (x.claims ?? []).some((c) => (c as { kind: string }).kind === "number"));
    assert.ok(stored, "the ranked turn is in the thread");
    for (const c of stored.claims.filter((c: { kind: string }) => c.kind === "number")) assert.match(c.text, /^NOT PROVEN: /);
  } finally {
    ctx.w.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------
// Item 3: tenancy
// ---------------------------------------------------------------------------------------------------------
test("U6w item 3 tenancy: the same student id in tenant B with other facts never moves tenant A's ranking, and only tenant A's id reaches the profile and option-list ports", async () => {
  const askedProfile: string[] = [];
  const askedOptions: string[] = [];
  const askedProfileStudents: string[] = [];
  const askedOptionStudents: string[] = [];
  const ctx = rankWorld({
    optionIds: (who) => (askedOptions.push(who.tenantId), askedOptionStudents.push(who.studentId), FIX.optionIds),
    deps: { profile: { facts: async (who) => (askedProfile.push(who.tenantId), askedProfileStudents.push(who.studentId), []) } },
  });
  try {
    const baseThread = await sayAndConfirm(ctx, "tenant-a", "syn-same", GERMANY_ENG);
    const alone = await rankTurn(ctx.w, "tenant-a", "syn-same", baseThread);
    // Tenant B's student has the SAME student id and the opposite facts.
    await sayAndConfirm(ctx, "tenant-b", "syn-same", CANADA_BIZ);
    askedProfile.length = 0;
    askedOptions.length = 0;
    const withB = await rankTurn(ctx.w, "tenant-a", "syn-same", baseThread);
    assert.equal(withB.json.claims.length, alone.json.claims.length);
    assert.deepEqual(withB.json.claims, alone.json.claims, "tenant B's facts did not change one claim of tenant A's ranking");
    assert.deepEqual(withB.json.profileFactsUsed, alone.json.profileFactsUsed);
    assert.ok(askedProfile.length >= 1 && askedProfile.every((t) => t === "tenant-a"), `profile port saw ${askedProfile}`);
    assert.ok(askedOptions.length === 1 && askedOptions.every((t) => t === "tenant-a"), `option-list port saw ${askedOptions}`);
    // And tenant B gets its own, different order.
    const tbToken = await studentToken(adult("syn-same", "tenant-b"));
    const tbThread = await newThread(ctx.w, tbToken, "syn-same");
    const b = await call(ctx.w, "POST", turnsPath("syn-same", tbThread), { token: tbToken, body: { text: RANK_TEXT } });
    assert.equal(rankedIds(b.json)[0], "Toronto business (synthetic)");

    // Cycle 1 (checker B P1): a DIFFERENT student of the same tenant, with opposite confirmed facts, never moves syn-same's ranking, and the
    // student id that reaches the profile port and the option-list callback is the asking student's, never the other one's.
    await sayAndConfirm(ctx, "tenant-a", "syn-other", CANADA_BIZ);
    askedProfile.length = 0;
    askedOptions.length = 0;
    askedProfileStudents.length = 0;
    askedOptionStudents.length = 0;
    const withOther = await rankTurn(ctx.w, "tenant-a", "syn-same", baseThread);
    assert.deepEqual(withOther.json.claims, alone.json.claims, "another student's facts did not change one claim");
    assert.deepEqual(withOther.json.profileFactsUsed, alone.json.profileFactsUsed);
    assert.ok(askedProfileStudents.length >= 1 && askedProfileStudents.every((s) => s === "syn-same"), `profile port saw students ${askedProfileStudents}`);
    assert.ok(askedOptionStudents.length === 1 && askedOptionStudents.every((s) => s === "syn-same"), `option-list callback saw students ${askedOptionStudents}`);
  } finally {
    ctx.w.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------
// Item 4: a ranking failure never breaks the turn
// ---------------------------------------------------------------------------------------------------------
test("U6w item 4: a throwing option port, option-list callback or weights callback still returns the reply (200), names the failure in the server log, and logs no profile text", async () => {
  const boom = (): never => {
    throw new TypeError("port exploded for Germany engineering syn-secret");
  };
  const variants: Array<[string, Parameters<typeof rankWorld>[0]]> = [
    ["port", { port: { get: boom } }],
    ["optionIds", { optionIds: boom }],
    ["weights", { deps: { ranking: { port: spyPort(), optionIds: () => FIX.optionIds, weightsForTenant: boom } } }],
  ];
  for (const [name, over] of variants) {
    const ctx = rankWorld(over);
    try {
      const t = await sayAndConfirm(ctx, "tenant-a", "syn-a", GERMANY_ENG);
      ctx.w.logs.length = 0;
      const res = await rankTurn(ctx.w, "tenant-a", "syn-a", t);
      assert.equal(res.json.state, "ok", name);
      assert.match(res.json.message, /compare those options/, `${name}: the reply is still there`);
      assert.equal(res.json.rankingProfile, undefined, name);
      assert.deepEqual(res.json.claims, [], name);
      const line = ctx.w.logs.find((l) => (l as { event?: string }).event === "chat_rank_failed") as { error?: string } | undefined;
      assert.ok(line, `${name}: a log line names the failure`);
      assert.equal(line!.error, "TypeError");
      const all = JSON.stringify(ctx.w.logs);
      for (const secret of ["Germany", "engineering", "syn-secret", "exploded", "syn-a"]) assert.ok(!all.includes(secret), `${name}: log holds no profile text (${secret})`);
    } finally {
      ctx.w.cleanup();
    }
  }
});

test("U6w item 4: an ordinary (non-ranking) question never touches the ranking port, and a rank question with no ranking wired behaves as before", async () => {
  const ctx = rankWorld();
  const plain = chatWorld();
  try {
    const t = await sayAndConfirm(ctx, "tenant-a", "syn-a", GERMANY_ENG);
    (ctx.port as ReturnType<typeof spyPort>).calls.length = 0;
    const token = await studentToken(adult("syn-a", "tenant-a"));
    const res = await call(ctx.w, "POST", turnsPath("syn-a", t), { token, body: { text: GERMANY_QUESTION } });
    assert.equal(res.status, 200);
    assert.equal((ctx.port as ReturnType<typeof spyPort>).calls.length, 0);

    const pt = await studentToken(adult("syn-a", "tenant-a"));
    const th = await newThread(plain, pt, "syn-a");
    const r = await call(plain, "POST", turnsPath("syn-a", th), { token: pt, body: { text: RANK_TEXT } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.claims, []);
    assert.equal(r.json.rankingProfile, undefined);
  } finally {
    ctx.w.cleanup();
    plain.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------
// Item 5: anonymous mode (U7) never ranks
// ---------------------------------------------------------------------------------------------------------
test("U6w item 5: an anonymous visitor asking to rank gets sign_in_required with no ranking, and the option-data port is never asked", async () => {
  const port = spyPort();
  const a = anonWorld();
  try {
    const res = await ask(a, RANK_TEXT);
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "sign_in_required");
    assert.equal(res.json.rankingProfile, undefined);
    assert.deepEqual(res.json.claims, []);
    assert.equal(res.json.profileFactsUsed, undefined);
    assert.equal(port.calls.length, 0);
    // The anonymous dependency surface carries no ranking, profile or student-store port at all.
    for (const k of ["ranking", "profile", "dbForTenant"]) assert.ok(!(k in a.deps), k);
    assert.equal(typeof createChatApi, "function");
  } finally {
    a.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------
// Cycle 1 repair items (C6..C11)
// ---------------------------------------------------------------------------------------------------------
test("U6w cycle 1 C6 (senior review MEDIUM): a NOT PROVEN number never carries an attributed status: every ranked claim is unverified, live and stored, and keeps the label", async () => {
  const ctx = rankWorld();
  try {
    const t = await sayAndConfirm(ctx, "tenant-a", "syn-a", GERMANY_ENG);
    const res = await rankTurn(ctx.w, "tenant-a", "syn-a", t);
    const numbers = res.json.claims.filter((c: { kind: string }) => c.kind === "number");
    assert.ok(numbers.length >= 1, "the fixture ranks at least one option");
    assert.ok(res.json.claims.every((c: { status: string }) => c.status === "unverified"), JSON.stringify(res.json.claims.map((c: { status: string }) => c.status)));
    for (const c of numbers) assert.match(c.text, /^NOT PROVEN: /);
    const token = await studentToken(adult("syn-a", "tenant-a"));
    const thread = await call(ctx.w, "GET", `${threadsPath("syn-a")}/${t}`, { token });
    const stored = thread.json.turns.find((x: { role: string; claims?: unknown[] }) => x.role === "assistant" && (x.claims ?? []).some((c) => (c as { kind: string }).kind === "number"));
    assert.ok(stored, "the ranked turn is in the thread");
    assert.ok(stored.claims.every((c: { status: string }) => c.status === "unverified"), "stored claims are all unverified");
    for (const c of stored.claims.filter((c: { kind: string }) => c.kind === "number")) assert.match(c.text, /^NOT PROVEN: /);
    // The reply still works (200 above); the unverified claims are counted as a gap, not rejected.
    assert.ok(everythingStored(ctx.w.fakeDb).includes("unverified_claim"), "the unverified_claim gap counter was incremented");
  } finally {
    ctx.w.cleanup();
  }
});

test("U6w cycle 1 C7 (checker A P1): a turn that stores no text (an unconsented minor) never reaches the ranking port, the option list or the weights callback", async () => {
  const port = spyPort();
  let optionListCalls = 0;
  let weightsCalls = 0;
  const ctx = rankWorld({
    port,
    deps: { ranking: { port, optionIds: () => (optionListCalls++, FIX.optionIds), weightsForTenant: () => (weightsCalls++, undefined) } },
  });
  try {
    const token = await studentToken(minor("syn-min", "tenant-a")); // guardianConsent absent: the turn is textless
    const th = await newThread(ctx.w, token, "syn-min");
    const res = await call(ctx.w, "POST", turnsPath("syn-min", th), { token, body: { text: RANK_TEXT } });
    assert.equal(res.status, 200, res.body);
    assert.equal(port.calls.length, 0, "the option port was asked on a textless turn");
    assert.equal(optionListCalls, 0);
    assert.equal(weightsCalls, 0);
    assert.deepEqual(res.json.claims, []);
    assert.equal(res.json.rankingProfile, undefined);
    // Control: the same wiring does rank for an adult (so the zero above is not a dead spy).
    const ta = await sayAndConfirm(ctx, "tenant-a", "syn-a", GERMANY_ENG);
    await rankTurn(ctx.w, "tenant-a", "syn-a", ta);
    assert.ok(port.calls.length > 0, "control: the spy records calls for an adult");
    assert.ok(optionListCalls > 0 && weightsCalls > 0, "control: the callbacks are live");
  } finally {
    ctx.w.cleanup();
  }
});

test("U6w cycle 1 C8 (checker A P4): a profile fact value holding a phone number never reaches the stored thread through profileFactsUsed", async () => {
  const ctx = rankWorld({ deps: { profile: { facts: async () => [{ key: "target-country", value: "Germany call me on 98765 43210", source: "pathlynks" }] } } });
  try {
    const token = await studentToken(adult("syn-a", "tenant-a"));
    const th = await newThread(ctx.w, token, "syn-a");
    const res = await call(ctx.w, "POST", turnsPath("syn-a", th), { token, body: { text: RANK_TEXT } });
    assert.equal(res.status, 200, res.body);
    // The ranker used the fact (so the test is not vacuous): the stored ranked turn carries a profileFactsUsed row for it.
    const stored = ctx.w.fakeDb
      .collection<{ response?: { profileFactsUsed?: { key: string; value: string }[] } }>("chat_turns")
      .all()
      .find((r) => (r.response?.profileFactsUsed ?? []).length > 0);
    assert.ok(stored, "the stored ranked turn carries profileFactsUsed");
    assert.ok(stored!.response!.profileFactsUsed!.some((f) => f.key === "target-country"));
    const everything = everythingStored(ctx.w.fakeDb);
    assert.ok(!everything.includes("98765"), "no part of the phone number is stored anywhere");
    assert.ok(!everything.includes("43210"));
  } finally {
    ctx.w.cleanup();
  }
});

test("U6w cycle 1 C10 (checker B P2): weightsForTenant receives the asking tenant's id, and tenant A's weights never apply to tenant B", async () => {
  const seen: string[] = [];
  const COST_ONLY = { fit: 0, cost: 1, scholarshipChance: 0, visaEase: 0 };
  const ctx = rankWorld({ deps: { ranking: { port: spyPort(), optionIds: () => FIX.optionIds, weightsForTenant: (t) => (seen.push(t), t === "tenant-a" ? COST_ONLY : undefined) } } });
  const base = rankWorld();
  try {
    const ta = await sayAndConfirm(ctx, "tenant-a", "syn-w", GERMANY_ENG);
    const tb = await sayAndConfirm(ctx, "tenant-b", "syn-w", GERMANY_ENG);
    const bt = await sayAndConfirm(base, "tenant-b", "syn-w", GERMANY_ENG);
    seen.length = 0;
    const a = await rankTurn(ctx.w, "tenant-a", "syn-w", ta);
    assert.deepEqual(seen, ["tenant-a"], "the callback got tenant A's id");
    seen.length = 0;
    const b = await rankTurn(ctx.w, "tenant-b", "syn-w", tb);
    assert.deepEqual(seen, ["tenant-b"], "the callback got tenant B's id");
    const bBase = await rankTurn(base.w, "tenant-b", "syn-w", bt);
    assert.match(a.json.rankingProfile, /^custom-/, "tenant A's weights apply to tenant A");
    assert.equal(b.json.rankingProfile, "student-success", "tenant B is ranked with the default weights");
    assert.deepEqual(b.json.claims, bBase.json.claims, "tenant B's ranking is byte-equal to a world where tenant A's weights do not exist");
    assert.notDeepEqual(a.json.claims, b.json.claims);
  } finally {
    ctx.w.cleanup();
    base.w.cleanup();
  }
});

test("U6w cycle 1 C11 (checker B P3 / A note): non-vacuous C5: an anonymous route handed live ranking, profile and Db spies never calls them, and the same spy wiring is called by the authenticated route", async () => {
  const port = spyPort();
  let optionListCalls = 0;
  let profileCalls = 0;
  let dbCalls = 0;
  const optionIds = () => (optionListCalls++, FIX.optionIds);
  const profile = { facts: async () => (profileCalls++, []) };
  const dbForTenant = (): never => {
    dbCalls++;
    throw new Error("anonymous mode must never open a tenant Db");
  };
  const a = anonWorld({ deps: { ranking: { port, optionIds }, profile, dbForTenant } as never });
  const auth = rankWorld({ port, optionIds });
  try {
    const res = await ask(a, RANK_TEXT);
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "sign_in_required");
    assert.equal(port.calls.length, 0, "anonymous: the option port was asked");
    assert.equal(optionListCalls, 0);
    assert.equal(profileCalls, 0);
    assert.equal(dbCalls, 0);
    // Control: the authenticated route with the very same spies does ask them.
    const t = await sayAndConfirm(auth, "tenant-a", "syn-a", GERMANY_ENG);
    await rankTurn(auth.w, "tenant-a", "syn-a", t);
    assert.ok(port.calls.length > 0, "control: the option port spy is live");
    assert.ok(optionListCalls > 0, "control: the option-list spy is live");
  } finally {
    a.cleanup();
    auth.w.cleanup();
  }
});
