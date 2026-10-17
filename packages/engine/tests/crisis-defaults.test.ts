/**
 * P1 U6, spec A11 + A11b / contract B24.7 (crisis defaults for students with no connected counsellor;
 * D-087 Q11, D-088 Q7; Nights mode `tele-manas-disclosed` per qa/gates/nights.md). The existing
 * counsellor-path behaviour (routeBeforeGeneration's iCALL card, escalateTurns) is NOT changed; the
 * student surface gets its own fixed message and reaches the existing escalation path for
 * authenticated students.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "@vc/db/testing";
import { tenantScopedDb } from "@vc/db";
import { MockProvider } from "@vc/providers";
import {
  CONCERN_CLASSIFIER_SKILL,
  ESCALATION_NOTIFICATIONS_COLLECTION,
  escalateTurns,
  loadSkill,
  routeBeforeGeneration,
} from "../src/index.js";
import {
  CRISIS_FORBIDDEN_PATTERNS,
  STUDENT_CRISIS_MESSAGE,
  ANONYMOUS_CRISIS_MESSAGE,
  runStudentTurn,
  type CrisisFlagRecord,
  type StudentGraphDeps,
} from "../src/student/graph.js";
import { NOW, SKILLS_DIR, SPEAKERS, fakeKb, studentProvider } from "./student-fixtures.js";

const AUTH = { role: "student" as const, studentId: "syn-stu-1", tenantId: "sandbox" };

function deps(over: Partial<StudentGraphDeps> = {}): StudentGraphDeps & { flags: CrisisFlagRecord[]; counter: string[]; escalations: unknown[] } {
  const flags: CrisisFlagRecord[] = [];
  const counter: string[] = [];
  const escalations: unknown[] = [];
  return {
    kb: fakeKb(),
    provider: studentProvider(),
    skillsDir: SKILLS_DIR,
    speakers: SPEAKERS,
    now: () => NOW,
    logFlag: async (r) => void flags.push(r),
    countAnonymous: async (k) => void counter.push(k),
    escalate: async (i) => void escalations.push(i),
    ...over,
    flags,
    counter,
    escalations,
  };
}

const CRISIS_EN = "I just want to kill myself, nothing matters anymore.";
const CRISIS_HINGLISH = "ab jeene ka mann nahi karta, sab khatam kar dena chahta hoon";
const CRISIS_HINDI = "मैं आत्महत्या करना चाहता हूँ";
const CONCERN_EN = "Honestly, so much pressure I can't cope, everything feels like too much right now.";
const INDIRECT = "I wrote letters to my parents in case I'm not here next week.";

test("A11b: the authenticated fixed message has Tele-MANAS 14416, the safe-adult question, discloses the hand-off and promises no counsellor", () => {
  assert.match(STUDENT_CRISIS_MESSAGE, /14416/);
  assert.match(STUDENT_CRISIS_MESSAGE, /Tele-MANAS/);
  assert.match(STUDENT_CRISIS_MESSAGE, /safe adult/i);
  assert.match(STUDENT_CRISIS_MESSAGE, /\?/);
  assert.match(STUDENT_CRISIS_MESSAGE, /not a counsellor/i, "discloses it is not a human counsellor");
  assert.match(STUDENT_CRISIS_MESSAGE, /no counsellor .* (connected|joining)/i, "says plainly no counsellor is being connected");
  assert.match(ANONYMOUS_CRISIS_MESSAGE, /14416/);
  assert.match(ANONYMOUS_CRISIS_MESSAGE, /Tele-MANAS/);
});

test("A11b: neither fixed message contains anything on the forbidden list (secrecy, 'nothing will happen to you', method/lethality, therapy claims, a counsellor promise)", () => {
  assert.ok(CRISIS_FORBIDDEN_PATTERNS.length >= 6);
  for (const msg of [STUDENT_CRISIS_MESSAGE, ANONYMOUS_CRISIS_MESSAGE]) {
    for (const p of CRISIS_FORBIDDEN_PATTERNS) assert.doesNotMatch(msg, p, `${p} in fixed message`);
  }
  // The forbidden list itself catches what it must.
  const bad = [
    "I promise I won't tell anyone.",
    "This stays between us.",
    "Nothing will happen to you.",
    "As your therapist I think",
    "A counsellor will call you tonight.",
    "the lethal dose is",
    "Keep it secret.",
  ];
  for (const b of bad) assert.ok(CRISIS_FORBIDDEN_PATTERNS.some((p) => p.test(b)), `forbidden list misses: ${b}`);
});

test("A11/A11b: crisis phrases (English, Hinglish, Hindi) on an authenticated turn get the fixed message, no model/KB call, a flag log record and the existing escalation path", async () => {
  for (const [i, text] of [CRISIS_EN, CRISIS_HINGLISH, CRISIS_HINDI].entries()) {
    const d = deps();
    const provider = d.provider as MockProvider;
    const out = await runStudentTurn(d, { mode: "authenticated", auth: AUTH, threadId: "th-1", turnId: `tu-${i}`, text });
    assert.equal(out.response.state, "escalated", text);
    assert.equal(out.response.message, STUDENT_CRISIS_MESSAGE);
    assert.deepEqual(out.response.claims, []);
    assert.equal(provider.calls.length, 0);
    assert.equal((d.kb as ReturnType<typeof fakeKb>).calls.length, 0);
    assert.equal(d.flags.length, 1);
    const flag = d.flags[0]!;
    assert.deepEqual(Object.keys(flag).sort(), ["action", "at", "level", "studentId", "tenantId", "threadId", "turnId"]);
    assert.equal(flag.studentId, AUTH.studentId);
    assert.equal(flag.at, NOW.toISOString());
    assert.equal(flag.level, "crisis");
    assert.equal(flag.action, "fixed_message_tele_manas_disclosed");
    assert.ok(!JSON.stringify(flag).includes(text.slice(0, 10)), "flag log carries no transcript text");
    assert.equal(d.escalations.length, 1);
  }
});

test("A11: the authenticated escalate port drives the EXISTING escalateTurns (notifications written for admin + counsellor)", async () => {
  const { fakeDb, db: raw } = createFakeDb();
  const db = tenantScopedDb(raw, "tenant-a");
  const escDeps = {
    recipients: async () => ({ adminIds: ["admin-1"], counsellorIds: ["counsellor-7"] }),
    classifier: {
      provider: new MockProvider({ model: "flash-lite", responses: { [CONCERN_CLASSIFIER_SKILL]: { severity: "high", likelyBenign: false, rationale: "synthetic" } } }),
      skillPrompt: loadSkill(SKILLS_DIR, CONCERN_CLASSIFIER_SKILL),
      config: { model: "flash-lite", timeoutMs: 50, sampleRates: { latin: 0, devanagari: 0, other: 0 } },
    },
    now: () => NOW,
    alert: () => {},
  };
  const d = deps({ escalate: async (input) => { await escalateTurns(db, input, escDeps); } });
  const out = await runStudentTurn(d, { mode: "authenticated", auth: { ...AUTH, tenantId: "tenant-a" }, threadId: "th-esc", turnId: "tu-esc", text: CRISIS_EN });
  assert.equal(out.response.state, "escalated");
  const docs = fakeDb.collection<Record<string, unknown>>(ESCALATION_NOTIFICATIONS_COLLECTION).all();
  assert.ok(docs.length >= 1, "existing escalation path wrote its notifications");
});

test("A11b: the existing counsellor-path crisis card is unchanged (routeBeforeGeneration still returns its own message)", () => {
  const r = routeBeforeGeneration(CRISIS_EN);
  assert.equal(r.route, "escalate");
  if (r.route === "escalate") {
    assert.notEqual(r.card.message, STUDENT_CRISIS_MESSAGE);
    assert.match(r.card.message, /9152987821/);
  }
});

test("A11b: unsure / indirect / concern-level / Hinglish cases map to the higher level", async () => {
  for (const text of [CONCERN_EN, INDIRECT, CRISIS_HINGLISH, "pressure bahut hai, ab aur nahi hota"]) {
    const d = deps();
    const out = await runStudentTurn(d, { mode: "authenticated", auth: AUTH, threadId: "th-1", turnId: "tu-x", text });
    if (out.response.state === "escalated") {
      assert.equal(d.flags[0]!.level, "crisis", text);
    } else {
      // Not every indirect phrase is caught by the recall-only keyword guard (accepted residual, B16):
      // what must never happen is a caught case being logged below crisis.
      assert.equal(d.flags.length, 0, text);
    }
  }
  const d = deps();
  const out = await runStudentTurn(d, { mode: "authenticated", auth: AUTH, threadId: "th-1", turnId: "tu-c", text: CONCERN_EN });
  assert.equal(out.response.state, "escalated", "a concern-level (unsure) English turn is treated as the higher level");
  assert.equal(d.flags[0]!.level, "crisis");
});

test("A11/A11b anonymous: fixed anonymous message, only the text-free counter, no flag log, no escalation, no KB/model call", async () => {
  const d = deps({ kb: fakeKb({ anonymous: true }) });
  const out = await runStudentTurn(d, { mode: "anonymous", text: CRISIS_EN });
  assert.equal(out.response.state, "escalated");
  assert.equal(out.response.message, ANONYMOUS_CRISIS_MESSAGE);
  assert.deepEqual(d.counter, ["crisis"]);
  assert.equal(d.flags.length, 0);
  assert.equal(d.escalations.length, 0);
  assert.equal((d.provider as MockProvider).calls.length, 0);
});

test("A11b keep talking: over a 30-turn Mock session risk is re-checked on every message; the turn after a flag is still answered", async () => {
  const d = deps();
  const script: string[] = [];
  for (let i = 0; i < 30; i++) script.push(i % 5 === 2 ? CRISIS_EN : "What is the tuition at German public universities?");
  let escalated = 0;
  let answered = 0;
  let priorFlag = false;
  for (const [i, text] of script.entries()) {
    const out = await runStudentTurn(d, { mode: "authenticated", auth: AUTH, threadId: "th-30", turnId: `tu-${i}`, text, priorFlagInThread: priorFlag });
    if (text === CRISIS_EN) {
      assert.equal(out.response.state, "escalated", `turn ${i}`);
      escalated++;
      priorFlag = true;
    } else {
      assert.equal(out.response.state, "ok", `turn ${i} after a flag must still be answered`);
      if (priorFlag) assert.match(out.response.message ?? "", /14416/, `turn ${i}: helpline stays visible after a flag`);
      answered++;
    }
  }
  assert.equal(escalated, 6);
  assert.equal(answered, 24);
  assert.equal(d.flags.length, 6, "every flag is logged");
});

test("A11b: a generated reply that contains a forbidden phrase is never shown; the fixed safe message replaces it", async () => {
  const provider = studentProvider({
    kbAnswer: {
      claims: [{ text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] }],
      // A follow-up that passes the repair-R3 follow-up rules (a plain question) but makes a secrecy promise.
      followUp: "Can we keep this a secret between us?",
    },
  });
  const d = deps({ provider });
  const out = await runStudentTurn(d, { mode: "authenticated", auth: AUTH, threadId: "th-1", turnId: "tu-f", text: "What is the tuition at German public universities?", priorFlagInThread: true });
  assert.doesNotMatch(out.response.message ?? "", /secret|between us/);
  assert.match(out.response.message ?? "", /safe adult/, "the fixed safe message replaced the reply");
  assert.match(out.response.message ?? "", /14416/);
});
