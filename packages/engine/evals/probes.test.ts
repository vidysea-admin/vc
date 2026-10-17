/** P1 U4 / A4 harness: the /ask serve rule and the out-of-KB probe runner (frozen fixture, no network). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { isServable, decideAnswer, scoreProbes, parseProbeSet, NO_SOURCED_ANSWER_TEXT, type AskLike, type AnswerResult } from "./probes.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const SAMPLE = join(here, "fixtures", "probes.sample.json");

const ask = (over: Partial<AskLike>): AskLike => ({
  answer: "a",
  verdict: "correct",
  insufficient_coverage: false,
  web_used: false,
  sources: { internal: [{ node_id: "session:s-1" }], web: [] },
  ...over,
});

test("serve rule: ONLY verdict=correct AND insufficient_coverage=false AND web_used=false is servable", () => {
  assert.equal(isServable(ask({})), true);
  assert.equal(isServable(ask({ web_used: true })), false);
  assert.equal(isServable(ask({ insufficient_coverage: true })), false);
  assert.equal(isServable(ask({ verdict: "ambiguous" })), false);
  assert.equal(isServable(ask({ verdict: "incorrect" })), false);
  assert.equal(isServable(ask({ verdict: "CORRECT" })), false, "verdict match is exact");
});

test("web fallback failed: web_used=false + insufficient_coverage=true + a generated answer is still NOT served", () => {
  const r = decideAnswer(ask({ verdict: "incorrect", insufficient_coverage: true, web_used: false, answer: "a confident-sounding generated answer" }));
  assert.equal(r.status, "no_sourced_answer");
  assert.equal(r.text, NO_SOURCED_ANSWER_TEXT);
  assert.deepEqual(r.sourceIds, []);
});

test("a servable answer carries only internal node_ids; web sources never reach the result", () => {
  const r = decideAnswer(ask({ sources: { internal: [{ node_id: "session:s-9" }], web: [{ url: "https://example.invalid" }] } }));
  assert.equal(r.status, "answered");
  assert.deepEqual(r.sourceIds, ["session:s-9"]);
  assert.equal(r.webUsed, false);
});

test("a servable-looking answer with zero internal sources is not served (B2: no uncited answer)", () => {
  const r = decideAnswer(ask({ sources: { internal: [], web: [] } }));
  assert.equal(r.status, "no_sourced_answer");
});

test("KB unavailable yields the fixed no-answer text, never an uncited answer", () => {
  const r = decideAnswer("unavailable");
  assert.equal(r.status, "no_sourced_answer");
  assert.equal(r.text, NO_SOURCED_ANSWER_TEXT);
});

test("the 30-case sample: exactly one is served, 29 refuse, zero violations; the 30-probe bar is met", async () => {
  const set = parseProbeSet(readFileSync(SAMPLE, "utf-8"), SAMPLE);
  assert.equal(set.cases.length, 30);
  const report = await scoreProbes(set.cases, async (c) => decideAnswer(c.ask));
  assert.equal(report.total, 30);
  assert.equal(report.served, 1);
  assert.equal(report.refused, 29);
  assert.deepEqual(report.violations, []);
  assert.equal(report.verdict, "PASS");
  assert.equal(report.realBarMet, true);
});

test("falsification: an answerer that serves web answers or training-data answers is caught per case", async () => {
  const set = parseProbeSet(readFileSync(SAMPLE, "utf-8"), SAMPLE);
  const leaky = async (c: { ask: AskLike | "unavailable" }): Promise<AnswerResult> => {
    // ignores the serve rule: always answers, claims no sources (training-data style)
    void c;
    return { status: "answered", text: "From my general knowledge...", sourceIds: [], webUsed: false };
  };
  const report = await scoreProbes(set.cases, leaky);
  assert.equal(report.verdict, "FAIL");
  assert.ok(report.violations.length >= 29);
  assert.ok(report.violations.some((v) => v.rule === "answered-without-source"));
  const web = await scoreProbes(set.cases, async () => ({ status: "answered", text: "x", sourceIds: ["session:s-1"], webUsed: true }));
  assert.ok(web.violations.some((v) => v.rule === "web-answer-served"));
});

test("an unservable probe answered with text other than the fixed text is a violation; over-refusal of the servable one is also flagged", async () => {
  const set = parseProbeSet(readFileSync(SAMPLE, "utf-8"), SAMPLE);
  const paraphrase = await scoreProbes(set.cases, async () => ({ status: "no_sourced_answer", text: "Sorry, not sure!", sourceIds: [], webUsed: false }));
  assert.ok(paraphrase.violations.some((v) => v.rule === "refusal-text-not-fixed"));
  assert.ok(paraphrase.violations.some((v) => v.rule === "over-refusal"));
});

test("fewer than 30 probes can pass the plumbing but is NOT PROVEN for the real bar", async () => {
  const set = parseProbeSet(readFileSync(SAMPLE, "utf-8"), SAMPLE);
  const report = await scoreProbes(set.cases.slice(0, 10), async (c) => decideAnswer(c.ask));
  assert.equal(report.violations.length, 0);
  assert.equal(report.realBarMet, false);
  assert.equal(report.verdict, "NOT PROVEN");
});

test("parseProbeSet rejects bad JSON and an unknown schemaVersion", () => {
  assert.throws(() => parseProbeSet("nope", "inline"), /inline/);
  assert.throws(() => parseProbeSet(JSON.stringify({ schemaVersion: 9, source: "synthetic", cases: [] }), "inline"), /schemaVersion/);
});
