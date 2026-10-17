/** P1 U4 / A1 harness: the claims-guard checker the eval runs over a student answer's claims[].
 *  Mirrors spec scope item 4 (verified needs a resolvable sourceId AND supporting text; /ask fact
 *  claims without fetched session text are `attributed`, never `verified`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkClaims, aggregateUnverified, UNVERIFIED_SHARE_MAX, type Claim, type ClaimContext } from "./claims-check.js";

const ctx: ClaimContext = {
  countryNames: ["Canada", "Germany"],
  searchHits: [
    { turnId: "t-1", sessionId: "s-1", score: 0.9, turn: { text: "Tuition in Canada is about 20,000 CAD per year for undergraduate programmes." }, session: {} },
  ],
  askSources: [
    { node_id: "session:s-2", sessionRefs: [] },
    { node_id: "topic:visa", sessionRefs: ["s-3"] },
    { node_id: "topic:orphan" },
  ],
  sessions: {
    "s-2": { turns: [{ turnId: "t-20", text: "Germany charges no tuition at public universities but requires a blocked account of 11,208 euros." }] },
    "s-3": { turns: [{ turnId: "t-30", text: "Student visa processing takes about 8 weeks." }] },
  },
};

const claim = (over: Partial<Claim>): Claim => ({ text: "x", kind: "fact", sourceIds: [], status: "verified", ...over });

test("a number claim verified from an inline /search hit passes when the number is in the turn text", () => {
  const r = checkClaims([claim({ text: "Tuition in Canada is about 20,000 CAD", kind: "number", sourceIds: ["t-1"] })], ctx);
  assert.deepEqual(r.violations, []);
});

test("a verified number claim whose number is NOT in the source text is a violation", () => {
  const r = checkClaims([claim({ text: "Tuition in Canada is about 25,000 CAD", kind: "number", sourceIds: ["t-1"] })], ctx);
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0]?.rule, "unsupported-number");
});

test("a verified country claim naming a country absent from the source text is a violation", () => {
  const r = checkClaims([claim({ text: "Germany also charges about 20,000 CAD", kind: "country", sourceIds: ["t-1"] })], ctx);
  assert.ok(r.violations.some((v) => v.rule === "unsupported-country"));
});

test("verified with no sourceId, or an id not in the same response, is a violation", () => {
  const none = checkClaims([claim({ sourceIds: [] })], ctx);
  assert.equal(none.violations[0]?.rule, "verified-without-source");
  const bogus = checkClaims([claim({ sourceIds: ["t-999"] })], ctx);
  assert.equal(bogus.violations[0]?.rule, "unresolvable-source");
});

test("/ask fact claim: verified requires the fetched session text to support it", () => {
  const supported = checkClaims([claim({ text: "Germany charges no tuition at public universities", sourceIds: ["session:s-2"] })], ctx);
  assert.deepEqual(supported.violations, []);
  const unsupported = checkClaims([claim({ text: "Germany guarantees every graduate a job offer", sourceIds: ["session:s-2"] })], ctx);
  assert.equal(unsupported.violations[0]?.rule, "unsupported-fact");
});

test("/ask fact claim resolved via evidence.sessionRefs works; an /ask node with no resolvable session cannot be verified, only attributed", () => {
  const viaRef = checkClaims([claim({ text: "Student visa processing takes about 8 weeks", sourceIds: ["topic:visa"] })], ctx);
  assert.deepEqual(viaRef.violations, []);
  const orphanVerified = checkClaims([claim({ text: "Visa takes 8 weeks", sourceIds: ["topic:orphan"] })], ctx);
  assert.equal(orphanVerified.violations[0]?.rule, "ask-fact-verified-without-text");
  const orphanAttributed = checkClaims([claim({ text: "Visa takes 8 weeks", sourceIds: ["topic:orphan"], status: "attributed" })], ctx);
  assert.deepEqual(orphanAttributed.violations, []);
});

test("attributed needs a resolvable source too; unverified needs none; sourced-looking claim with no source is a violation", () => {
  assert.equal(checkClaims([claim({ status: "attributed", sourceIds: ["nope"] })], ctx).violations[0]?.rule, "unresolvable-source");
  assert.equal(checkClaims([claim({ status: "attributed", sourceIds: [] })], ctx).violations[0]?.rule, "attributed-without-source");
  assert.deepEqual(checkClaims([claim({ status: "unverified", sourceIds: [] })], ctx).violations, []);
});

test("counts and unverifiedShare are reported; share on an empty claim list is 0, not NaN", () => {
  const r = checkClaims(
    [
      claim({ text: "Tuition in Canada is about 20,000 CAD", kind: "number", sourceIds: ["t-1"] }),
      claim({ status: "unverified" }),
      claim({ status: "attributed", sourceIds: ["topic:orphan"] }),
      claim({ status: "unverified" }),
    ],
    ctx,
  );
  assert.deepEqual(r.counts, { verified: 1, attributed: 1, unverified: 2 });
  assert.equal(r.unverifiedShare, 0.5);
  assert.equal(checkClaims([], ctx).unverifiedShare, 0);
});

test("aggregateUnverified enforces the <= 5% bar across answers (spec A1, ASSUMPTION)", () => {
  assert.equal(UNVERIFIED_SHARE_MAX, 0.05);
  const mk = (verified: number, unverified: number) => ({ violations: [], counts: { verified, attributed: 0, unverified }, unverifiedShare: unverified / Math.max(1, verified + unverified) });
  assert.equal(aggregateUnverified([mk(19, 1)]).pass, true); // 5% exactly
  assert.equal(aggregateUnverified([mk(18, 2)]).pass, false);
  assert.equal(aggregateUnverified([]).pass, false, "no claims at all is NOT a pass");
  assert.equal(aggregateUnverified([mk(19, 1), mk(19, 1)]).share, 0.05);
});
