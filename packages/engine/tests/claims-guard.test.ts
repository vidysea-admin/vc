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
  assert.equal(supports({ text: "Germany has no tuition fees.", kind: "fact" }, "Public universities in Germany have no tuition fees."), true);
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
    [{ text: "Living costs in Germany are about 11,000 euros a year.", kind: "number", sourceIds: ["session:sess-sem-2"] }],
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
  const fact = await guardClaims([{ text: "Scholarships cover flights for every applicant.", kind: "fact", sourceIds: ["session:sess-sem-2"] }], ctx);
  assert.equal(fact.claims[0]!.status, "attributed");
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
