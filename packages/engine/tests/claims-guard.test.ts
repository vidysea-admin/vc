/**
 * P1 U6, spec A1 (MOCK guard part) / contract B2 student-surface claims: verified | attributed |
 * unverified, sourceIds resolvable only to this turn's /ask node_ids or /search turnIds, numbers and
 * countries checked against fetched or inline text, nothing unresolvable presented as sourced.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaimSchema, SourceSchema } from "@vc/schemas";
import { guardClaims, supports, type DraftClaim } from "../src/student/claims.js";
import { ASK_ANSWERED, HIT_SEMINAR, HIT_TOC_OLD, HIT_UNLISTED_RECORDING, HIT_WHATSAPP, NOW, SESSION_SEM_2, fakeKb } from "./student-fixtures.js";

const hits = [HIT_SEMINAR, HIT_WHATSAPP, HIT_UNLISTED_RECORDING, HIT_TOC_OLD];

async function guardSearch(drafts: DraftClaim[]) {
  return guardClaims(drafts, { hits, now: NOW });
}

test("A1 /search: a claim supported by the inline turn.text is verified, with no session fetch", async () => {
  const kb = fakeKb();
  const out = await guardClaims([{ text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] }], { hits, now: NOW, getSession: kb.getSession });
  assert.equal(out.claims[0]!.status, "verified");
  assert.deepEqual(out.claims[0]!.sourceIds, ["t-sem-1"]);
  assert.equal(kb.calls.length, 0, "no GET /sessions/:id for a /search source");
});

test("A1 /search: a number that does not match the inline text is unverified, never verified", async () => {
  const out = await guardSearch([{ text: "The semester contribution is about 900 euros.", kind: "number", sourceIds: ["t-sem-1"] }]);
  assert.equal(out.claims[0]!.status, "unverified");
  const ok = await guardSearch([{ text: "The semester contribution is about 300 euros.", kind: "number", sourceIds: ["t-sem-1"] }]);
  assert.equal(ok.claims[0]!.status, "verified");
});

test("A1: number formats are normalised (11,904 == 11904) but a different number is not", async () => {
  const same = await guardSearch([{ text: "A blocked account needs about 11904 euros.", kind: "number", sourceIds: ["t-rec-9"] }]);
  assert.equal(same.claims[0]!.status, "verified");
  const other = await guardSearch([{ text: "A blocked account needs about 11,905 euros.", kind: "number", sourceIds: ["t-rec-9"] }]);
  assert.equal(other.claims[0]!.status, "unverified");
});

test("A1: a country the source text does not name is unverified", async () => {
  const out = await guardSearch([{ text: "Universities in France charge no tuition for most programmes.", kind: "country", sourceIds: ["t-sem-1"] }]);
  assert.equal(out.claims[0]!.status, "unverified");
  const ok = await guardSearch([{ text: "Canada requires proof of funds for the study permit.", kind: "country", sourceIds: ["t-toc-1"] }]);
  assert.equal(ok.claims[0]!.status, "verified");
});

test("A1 (repair R2a): a sourceId not returned in THIS turn (invented, or another turn's id) is stripped; with none left the claim is DROPPED, never shown or sourced", async () => {
  const out = await guardSearch([
    { text: "Public universities charge no tuition.", kind: "fact", sourceIds: ["t-from-another-turn"] },
    { text: "Public universities charge no tuition.", kind: "fact", sourceIds: [] },
    { text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1", "t-from-another-turn"] },
  ]);
  assert.equal(out.claims.length, 1);
  assert.deepEqual(out.claims[0]!.sourceIds, ["t-sem-1"]);
  for (const c of out.claims) assert.ok(ClaimSchema.safeParse({ text: c.text, kind: c.kind, sourceIds: c.sourceIds, status: c.status }).success);
  assert.deepEqual(out.dropped.map((d) => d.reason), ["no_resolvable_source", "no_resolvable_source"]);
  assert.equal(out.unverifiedCount, 0);
});

test("R5 supports(): negation parity - 'no tuition' is not supported by 'tuition fees of 500 euros' (and vice versa)", () => {
  assert.equal(supports({ text: "Germany has no tuition fees.", kind: "fact" }, "Germany has tuition fees of 500 euros per semester."), false);
  assert.equal(supports({ text: "Germany has tuition fees.", kind: "fact" }, "Germany has no tuition fees at public universities."), false);
  assert.equal(supports({ text: "Germany ki public university mein fees nahi hai.", kind: "fact" }, "Germany public university fees hai."), false);
  // U6h fix1 H2a: a scope word the evidence carries (public) may not be dropped; carrying it verifies.
  assert.equal(supports({ text: "Germany has no tuition fees.", kind: "fact" }, "Public universities in Germany have no tuition fees."), false);
  assert.equal(supports({ text: "Public universities in Germany have no tuition fees.", kind: "fact" }, "Public universities in Germany have no tuition fees."), true);
});

test("R5 supports(): country match is exact token or demonym, never a prefix ('India' must not match 'individual')", () => {
  assert.equal(supports({ text: "India requires individual visa interviews.", kind: "fact" }, "Each individual needs visa interviews and appointments."), false);
  assert.equal(supports({ text: "Public universities in Germany charge no tuition.", kind: "country" }, "German public universities charge no tuition."), true);
  assert.equal(supports({ text: "Indian students need a visa interview.", kind: "country" }, "Students from India need a visa interview."), true);
});

test("R5 supports(): a capitalised proper noun in a fact/country claim must appear in the evidence (off-list countries like Turkey)", () => {
  assert.equal(supports({ text: "Turkey charges tuition fees per semester.", kind: "fact" }, "Germany charges tuition fees per semester."), false);
  assert.equal(supports({ text: "The DAAD scholarship covers living costs in Germany.", kind: "fact" }, "A scholarship covers living costs in Germany."), false);
  assert.equal(supports({ text: "The DAAD scholarship covers living costs in Germany.", kind: "fact" }, "The DAAD scholarship covers living costs in Germany."), true);
});

test("R5 supports(): numbers must match with the same currency/unit when one is present", () => {
  assert.equal(supports({ text: "The fee is about 300 dollars.", kind: "number" }, "The fee is about 300 euros."), false);
  assert.equal(supports({ text: "The fee is about €300.", kind: "number" }, "The fee is about 300 euros."), true);
  assert.equal(supports({ text: "It takes about 12 months.", kind: "number" }, "It takes about 12 weeks."), false);
  assert.equal(supports({ text: "A blocked account needs about 11904 euros.", kind: "number" }, "Blocked accounts of about 11,904 euros are required."), true);
  // A unit-less number that is absent from the evidence is never supported.
  assert.equal(supports({ text: "Applicants need 3 reference letters.", kind: "number" }, "Applicants need 2 reference letters."), false);
});

test("A1 /ask: verified only when the node_id is in this response AND get_session on evidence.sessionRef returns supporting text", async () => {
  const kb = fakeKb();
  const out = await guardClaims(
    [{ text: "Living costs in Germany are about 11,000 euros a year for most students.", kind: "number", sourceIds: ["session:sess-sem-2"] }],
    { hits: [], ask: ASK_ANSWERED, getSession: kb.getSession, now: NOW },
  );
  assert.equal(out.claims[0]!.status, "verified");
  assert.deepEqual(kb.calls, [{ tool: "get_session", arg: "sess-sem-2" }]);
});

test("A1 /ask: a session-level node_id (session:<id> or /session:<id>) resolves without evidence; a topic node without sessionRefs cannot be verified", async () => {
  const kb = fakeKb();
  const ask = { ...ASK_ANSWERED, citations: { internal: [{ node_id: "kb/session:sess-sem-2" }, { node_id: "topic:germany-costs" }], web: [] } };
  const viaPath = await guardClaims([{ text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["kb/session:sess-sem-2"] }], { hits: [], ask, getSession: kb.getSession, now: NOW });
  assert.equal(viaPath.claims[0]!.status, "verified");
  const topic = await guardClaims([{ text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["topic:germany-costs"] }], { hits: [], ask, getSession: kb.getSession, now: NOW });
  assert.equal(topic.claims[0]!.status, "attributed", "a fact with a present node but no fetched text is attributed, not verified");
});

test("A1 /ask: kind:fact whose fetched text does not support it is attributed; a number/country with no supporting text is unverified", async () => {
  const kb = fakeKb();
  const ctx = { hits: [], ask: ASK_ANSWERED, getSession: kb.getSession, now: NOW };
  // U6h H1: "attributed" now needs the served /ask answer itself to support the fact; this one is not in it.
  const fact = await guardClaims([{ text: "Scholarships cover flights for every applicant.", kind: "fact", sourceIds: ["session:sess-sem-2"] }], ctx);
  assert.equal(fact.claims[0]!.status, "unverified");
  const inAnswer = await guardClaims([{ text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["topic:germany-costs"] }], { ...ctx, getSession: undefined });
  assert.equal(inAnswer.claims[0]!.status, "attributed");
  const num = await guardClaims([{ text: "Living costs are about 15,000 euros a year.", kind: "number", sourceIds: ["session:sess-sem-2"] }], ctx);
  assert.equal(num.claims[0]!.status, "unverified");
});

test("A1/A13 /ask: a cited session that cannot be re-read (get_session unavailable) is never verified", async () => {
  const kb = fakeKb({ sessions: {} });
  const out = await guardClaims(
    [
      { text: "Living costs in Germany are about 11,000 euros a year.", kind: "number", sourceIds: ["session:sess-sem-2"] },
      { text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["session:sess-sem-2"] },
    ],
    { hits: [], ask: ASK_ANSWERED, getSession: kb.getSession, now: NOW },
  );
  assert.equal(out.claims[0]!.status, "unverified");
  assert.equal(out.claims[1]!.status, "attributed");
});

test("A1 /ask: a node_id not in this response's sources.internal is not a sourceId (web sources never count)", async () => {
  const kb = fakeKb();
  const out = await guardClaims([{ text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["session:sess-other"] }], { hits: [], ask: ASK_ANSWERED, getSession: kb.getSession, now: NOW });
  assert.deepEqual(out.claims, [], "with its only sourceId stripped the claim is dropped (repair R2a)");
  assert.deepEqual(out.dropped.map((d) => d.reason), ["no_resolvable_source"]);
  assert.equal(kb.calls.length, 0);
});

test("A1/A13: sources[] lists each cited source once, schema-valid, with stale (older than the threshold) and dateUnknown flags", async () => {
  const out = await guardClaims(
    [
      { text: "Canada requires proof of funds for the study permit.", kind: "country", sourceIds: ["t-toc-1"] },
      { text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1", "t-sem-1"] },
    ],
    { hits: [...hits, { ...HIT_SEMINAR, turnId: "t-nodate", sessionDate: "" }], now: NOW, staleAfterMonths: 24 },
  );
  for (const s of out.sources) assert.ok(SourceSchema.safeParse(s).success, JSON.stringify(s));
  const toc = out.sources.find((s) => s.id === "t-toc-1")!;
  assert.equal(toc.stale, true);
  assert.equal(toc.kind, "toc");
  const sem = out.sources.filter((s) => s.id === "t-sem-1");
  assert.equal(sem.length, 1);
  assert.equal(sem[0]!.stale, undefined);
  const nd = await guardClaims([{ text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-nodate"] }], { hits: [{ ...HIT_SEMINAR, turnId: "t-nodate", sessionDate: "" }], now: NOW });
  assert.equal(nd.sources[0]!.dateUnknown, true);
});

test("A13: with no override the staleness threshold is the 24-month default [ASSUMPTION P-7]: 45 months old is stale, 16 months is not", async () => {
  const out = await guardClaims(
    [
      { text: "Canada requires proof of funds for the study permit.", kind: "country", sourceIds: ["t-toc-1"] },
      { text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-recent"] },
    ],
    { hits: [HIT_TOC_OLD, { ...HIT_SEMINAR, turnId: "t-recent", sessionDate: "2025-06-17" }], now: NOW },
  );
  assert.equal(out.sources.find((s) => s.id === "t-toc-1")!.stale, true);
  assert.equal(out.sources.find((s) => s.id === "t-recent")!.stale, undefined);
});

// ---------------------------------------------------------------------------
// U6h (post-PASS hardening of U6; review findings H1, H2). Each test below was recorded RED first.
// ---------------------------------------------------------------------------

test("U6h H1 /ask: a fact whose fetched text AND the served /ask answer both fail to support it is unverified (never attributed-unmarked)", async () => {
  const ask = { ...ASK_ANSWERED, answer: "Germany is cheap.", citations: { internal: [{ node_id: "topic:germany-costs" }], web: [] } };
  const out = await guardClaims([{ text: "Germany guarantees a visa within two weeks.", kind: "fact", sourceIds: ["topic:germany-costs"] }], { hits: [], ask, now: NOW });
  assert.equal(out.claims[0]!.status, "unverified");
  assert.equal(out.unverifiedCount, 1);
  // The same claim stays attributed when the served answer itself carries it (spec A1: a present node, no fetched text).
  const same = await guardClaims([{ text: "Germany is cheap.", kind: "fact", sourceIds: ["topic:germany-costs"] }], { hits: [], ask, now: NOW });
  assert.equal(same.claims[0]!.status, "attributed");
});

test("U6h H1 /ask: attributed is only for kind:fact; a number or country backed only by the served answer is unverified", async () => {
  const out = await guardClaims([{ text: "Living costs are about 11,000 euros a year.", kind: "number", sourceIds: ["topic:germany-costs"] }], { hits: [], ask: ASK_ANSWERED, now: NOW });
  assert.equal(out.claims[0]!.status, "unverified");
});

test("U6h H1 /ask: a non-serveable ask (verdict not correct, or insufficient_coverage not false) contributes no node at all", async () => {
  for (const bad of [{ verdict: "ambiguous" }, { verdict: "incorrect" }, { insufficient_coverage: true }]) {
    const ask = { ...ASK_ANSWERED, ...bad };
    const out = await guardClaims([{ text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["topic:germany-costs"] }], { hits: [], ask, now: NOW });
    assert.deepEqual(out.claims, [], JSON.stringify(bad));
  }
});

const E_SEM = HIT_SEMINAR.text; // "German public universities charge no tuition for most programmes, but expect a semester contribution of about 300 euros."

test("U6h H2 supports(): positive controls still verify (paraphrase, number formats, order)", () => {
  assert.equal(supports({ text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact" }, E_SEM), true);
  assert.equal(supports({ text: "The semester contribution is about 300 euros.", kind: "number" }, E_SEM), true);
  // U6h fix1 H2a: the evidence says "for most students"; the claim must carry it (dropping it was verified before).
  assert.equal(supports({ text: "Living costs in Germany are about 11,000 euros a year for most students.", kind: "number" }, "Living costs in Germany come to about 11,000 euros a year for most students."), true);
  assert.equal(supports({ text: "Living costs in Germany are about 11,000 euros a year.", kind: "number" }, "Living costs in Germany come to about 11,000 euros a year for most students."), false);
  assert.equal(supports({ text: "A blocked account needs about 11904 euros.", kind: "number" }, "Blocked accounts of about 11,904 euros are required for the German student visa."), true);
  assert.equal(supports({ text: "The fee is 300 euros each semester.", kind: "number" }, "The fee is 300 euros per semester."), true);
});

test("U6h H2 supports(): an extra clause the evidence does not carry is rejected (no 50% overlap acceptance)", () => {
  for (const claim of [
    "German public universities charge no tuition for most programmes, and a visa is guaranteed within two weeks.",
    "German public universities charge no tuition for most programmes and hostel rooms are guaranteed.",
    "German public universities charge no tuition for most programmes; fees are low.",
    "Public universities charge no tuition and offer guaranteed hostel rooms to every applicant.",
    "A visa is guaranteed within two weeks and the semester contribution is about 300 euros.",
  ]) assert.equal(supports({ text: claim, kind: "fact" }, E_SEM), false, claim);
  // half of the words match, half do not: the old rule accepted this.
  assert.equal(supports({ text: "German public universities offer scholarships housing flights.", kind: "fact" }, E_SEM), false);
});

test("U6h H2 supports(): unit / rate swap is rejected (semester vs per month, per day, a year, monthly)", () => {
  assert.equal(supports({ text: "The semester contribution is about 300 euros per month.", kind: "number" }, E_SEM), false);
  assert.equal(supports({ text: "The fee is 300 euros per day.", kind: "number" }, "The fee is 300 euros."), false);
  assert.equal(supports({ text: "The fee is 300 euros.", kind: "number" }, "The fee is 300 euros per day."), false);
  assert.equal(supports({ text: "The fee is 300 euros per month.", kind: "number" }, "The fee is 300 euros per semester."), false);
  assert.equal(supports({ text: "The fee is 300 euros a month.", kind: "number" }, "The fee is 300 euros a year."), false);
  assert.equal(supports({ text: "The fee is 300 euros monthly.", kind: "number" }, "The fee is 300 euros yearly."), false);
  assert.equal(supports({ text: "The fee is 300 euros per month.", kind: "number" }, "The fee is 300 euros per month."), true);
  assert.equal(supports({ text: "The wait is 2 weeks.", kind: "number" }, "The wait is two weeks."), true, "number words equal digits");
  assert.equal(supports({ text: "A visa takes three weeks.", kind: "fact" }, "A visa takes two weeks."), false, "spelled-out numbers are checked too");
});

test("U6h H2 supports(): a scope or quantifier swap is rejected (public->private, most->all/every/only, domestic->international)", () => {
  for (const claim of [
    "In Germany, private universities charge no tuition for most programmes.",
    "In Germany, all public universities charge no tuition for most programmes.",
    "Every German public university charges no tuition for most programmes.",
    "German public universities charge no tuition for all programmes.",
    "German public universities charge no tuition for only a few programmes.",
  ]) assert.equal(supports({ text: claim, kind: "fact" }, E_SEM), false, claim);
  assert.equal(supports({ text: "International students pay a 300 euro contribution.", kind: "fact" }, "Domestic students pay a 300 euro contribution."), false);
  assert.equal(supports({ text: "Postgraduate programmes need an IELTS score.", kind: "fact" }, "Undergraduate programmes need an IELTS score."), false);
  // Known limit (open risk in the U6h manifest): dropping a scope word ("Public universities ..." -> "Germany has no tuition fees") is
  // still accepted - the R5 test above pins it. Swapping a scope word is what is rejected.
});

test("U6h H2 supports(): an antonym with no negation word is rejected (mandatory vs optional, higher vs lower, allowed vs banned)", () => {
  const pairs: [string, string][] = [
    ["IELTS is optional for the master's programme.", "IELTS is mandatory for the master's programme."],
    ["IELTS is mandatory for the master's programme.", "IELTS is optional for the master's programme."],
    ["Tuition is lower than in Austria.", "Tuition is higher than in Austria."],
    ["Part-time work is banned during the first semester.", "Part-time work is allowed during the first semester."],
    ["The application opens earlier than last year.", "The application opens later than last year."],
    ["The visa process is easy for Indian applicants.", "The visa process is difficult for Indian applicants."],
  ];
  for (const [claim, evidence] of pairs) assert.equal(supports({ text: claim, kind: "fact" }, evidence), false, `${claim} vs ${evidence}`);
  assert.equal(supports({ text: "IELTS is mandatory for the master's programme.", kind: "fact" }, "IELTS is mandatory for the master's programme."), true);
  assert.equal(supports({ text: "IELTS is required for the master's programme.", kind: "fact" }, "IELTS is mandatory for the master's programme."), true, "required ~ mandatory");
});

// ---------------------------------------------------------------------------
// U6h fix cycle 1 (checker verdict FAIL on M4; AI review items 1 and 2). Each test below was recorded RED first.
// Scenario: the model writes a /ask or /search claim that drops a qualifier the evidence carries, or binds a
// figure to the wrong country; the claim guard must leave it `unverified` (graph path: guardClaims).
// ---------------------------------------------------------------------------

const verifies = (claim: string, evidence: string, kind: "fact" | "number" = "fact") => supports({ text: claim, kind }, evidence);

test("U6h fix1 H2a hedges and modals: a claim that drops 'may' / 'usually', or swaps may for must, is rejected; the same hedge verifies", () => {
  const pairs: [string, string][] = [
    ["Universities charge a tuition fee.", "Universities may charge a tuition fee."],
    ["Applicants need an IELTS score.", "Applicants usually need an IELTS score."],
    ["Applicants must submit a portfolio.", "Applicants may submit a portfolio."],
    ["Applicants may submit a portfolio.", "Applicants must submit a portfolio."],
    ["Visa processing takes about two weeks.", "Visa processing typically takes about two weeks."],
    ["Students can work part time.", "Students can sometimes work part time."],
    ["Offers arrive within a month.", "Offers might arrive within a month."],
  ];
  for (const [claim, evidence] of pairs) assert.equal(verifies(claim, evidence), false, `${claim} <- ${evidence}`);
  assert.equal(verifies("Applicants may submit a portfolio.", "Applicants may submit a portfolio."), true);
  assert.equal(verifies("Applicants usually need an IELTS score.", "Applicants typically need an IELTS score."), true, "usually ~ typically");
});

test("U6h fix1 H2a quantifiers, both directions: dropping or adding some / most / only / all / few is rejected", () => {
  const pairs: [string, string][] = [
    ["Universities charge tuition fees.", "Some universities charge tuition fees."],
    ["Some universities charge tuition fees.", "Universities charge tuition fees."],
    ["German public universities charge no tuition.", "Most German public universities charge no tuition."],
    ["Students can apply.", "Only EU students can apply."],
    ["Only students can apply.", "Students can apply."],
    ["Programmes are taught in English.", "Few programmes are taught in English."],
    ["Programmes are taught in English.", "Many programmes are taught in English."],
    ["Most programmes are taught in English.", "All programmes are taught in English."],
  ];
  for (const [claim, evidence] of pairs) assert.equal(verifies(claim, evidence), false, `${claim} <- ${evidence}`);
  assert.equal(verifies("Most German public universities charge no tuition.", "Most German public universities charge no tuition."), true);
});

test("U6h fix1 H2a conditions: a claim that drops if / unless / only-if / provided is rejected; carrying the condition verifies", () => {
  const pairs: [string, string][] = [
    ["Fees are waived.", "Fees are waived if you hold a scholarship."],
    ["Fees are charged.", "Fees are charged unless you hold a scholarship."],
    ["Applicants get a visa.", "Applicants get a visa only if they show proof of funds."],
    ["The offer stands.", "The offer stands provided that the transcript arrives."],
    ["Fees are waived if you hold a scholarship.", "Fees are waived."],
  ];
  for (const [claim, evidence] of pairs) assert.equal(verifies(claim, evidence), false, `${claim} <- ${evidence}`);
  assert.equal(verifies("Fees are waived if you hold a scholarship.", "Fees are waived if you hold a scholarship."), true);
});

test("U6h fix1 H2a scope: a claim that drops public / private / international / postgraduate (scope) is rejected", () => {
  const pairs: [string, string][] = [
    ["Universities charge no tuition.", "Public universities charge no tuition."],
    ["Colleges charge fees.", "Private colleges charge fees."],
    ["Students pay a 300 euro contribution.", "International students pay a 300 euro contribution."],
    ["Programmes need an IELTS score.", "Postgraduate programmes need an IELTS score."],
  ];
  for (const [claim, evidence] of pairs) assert.equal(verifies(claim, evidence), false, `${claim} <- ${evidence}`);
  assert.equal(verifies("Public universities charge no tuition.", "Public universities charge no tuition."), true);
});

test("U6h fix1 H2a caveat sentence: a restrictor in the evidence sentence right after the matched one must be carried by the claim", () => {
  const ev = "German public universities charge no tuition. This applies only to EU citizens.";
  assert.equal(verifies("German public universities charge no tuition.", ev), false, "caveat dropped");
  assert.equal(verifies("German public universities charge no tuition for EU citizens only.", ev), true, "caveat carried");
  const ev2 = "Blocked accounts are required for the visa. Exceptions apply for scholarship holders.";
  assert.equal(verifies("Blocked accounts are required for the visa.", ev2), false);
  // A later, unrelated sentence is not a caveat of the first one.
  assert.equal(verifies("German public universities charge no tuition.", "German public universities charge no tuition. Applications close in July."), true);
});

test("U6h fix1 H2b number-country binding: a figure belongs to the country it sits next to", () => {
  const ev = "The contribution is 300 euros for Germany and 500 euros for France.";
  assert.equal(verifies("The contribution is 500 euros for Germany.", ev, "number"), false);
  assert.equal(verifies("The contribution is 300 euros for France.", ev, "number"), false);
  assert.equal(verifies("The contribution is 300 euros for Germany.", ev, "number"), true);
  assert.equal(verifies("The contribution is 500 euros for France.", ev, "number"), true);
  assert.equal(verifies("The contribution is 300 euros for Germany and 500 euros for France.", ev, "number"), true);
  assert.equal(verifies("The contribution is 500 euros for Germany and 300 euros for France.", ev, "number"), false);
  const ev2 = "Germany charges 300 euros, France charges 500 euros.";
  assert.equal(verifies("France charges 300 euros.", ev2, "number"), false);
  assert.equal(verifies("Germany charges 300 euros.", ev2, "number"), true);
  // Thousands separators are not clause breaks.
  assert.equal(verifies("Living costs in Germany are 11,000 euros a year.", "Living costs are 11,000 euros a year in Germany and 9,000 euros a year in Poland.", "number"), true);
  assert.equal(verifies("Living costs in Poland are 11,000 euros a year.", "Living costs are 11,000 euros a year in Germany and 9,000 euros a year in Poland.", "number"), false);
  // Honest single-country evidence still verifies.
  assert.equal(verifies("The fee in Germany is 300 euros.", "Germany has a fee of 300 euros.", "number"), true);
});

test("U6h fix1 M4 spelled-out numbers: numberMentions is exported and sees 'five thousand' / 'twenty thousand'", async () => {
  const mod = await import("../src/student/claims.js");
  assert.equal(typeof (mod as Record<string, unknown>).numberMentions, "function");
  const n = (s: string) => (mod as unknown as { numberMentions: (t: string) => unknown[] }).numberMentions(s).length;
  assert.ok(n("about five thousand euros a year") >= 1);
  assert.ok(n("You will pay twenty thousand euros") >= 1);
  assert.equal(n("Tell me about your own story and what you built"), 0);
  assert.equal(n("One thing is clear to me"), 0, "the pronoun 'one' is not a number");
});
