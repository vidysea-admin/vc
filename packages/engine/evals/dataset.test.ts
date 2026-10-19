/** T-009: the golden-session dataset itself must satisfy the brief's stratification requirements, and
 *  every gold fact's quote must be verbatim in its cited turn — the same guarantee the generator
 *  script enforced at write time, re-checked here so a hand-edit of sessions.jsonl can't silently
 *  break it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadDataset, parseDataset, parseGoldenFile, parseKbFixture, stripBom } from "./dataset.js";
import { parseProbeSet } from "./probes.js";
import { parseCoverageFixture, parseKbGaps } from "./coverage.js";
import { collapseWhitespace } from "./citation.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");

test("the dataset has at least 20 sessions", () => {
  const sessions = loadDataset(DATASET_PATH);
  assert.ok(sessions.length >= 20, `expected >= 20 sessions, got ${sessions.length}`);
});

test("the dataset covers every required stratum from the T-009 brief", () => {
  const sessions = loadDataset(DATASET_PATH);
  const allStrata = new Set(sessions.flatMap((s) => s.strata));
  for (const required of [
    "pure-english",
    "romanised-hinglish",
    "devanagari",
    "code-mixed",
    "multi-turn",
    "concern",
    "crisis",
    "distractor-chatter",
  ]) {
    assert.ok(allStrata.has(required), `missing stratum "${required}"`);
  }
});

test("at least 3 sessions carry distractor chatter", () => {
  const sessions = loadDataset(DATASET_PATH);
  const distractorSessions = sessions.filter((s) => s.strata.includes("distractor-chatter"));
  assert.ok(distractorSessions.length >= 3, `expected >= 3 distractor sessions, got ${distractorSessions.length}`);
});

test("every session id is unique", () => {
  const sessions = loadDataset(DATASET_PATH);
  assert.equal(new Set(sessions.map((s) => s.id)).size, sessions.length);
});

test("every gold fact's quote is a verbatim substring (whitespace-collapsed) of its cited turn", () => {
  const sessions = loadDataset(DATASET_PATH);
  for (const session of sessions) {
    const turnsById = new Map(session.input.turns.map((t) => [t.turnId, t]));
    for (const gf of session.goldFacts) {
      const turn = turnsById.get(gf.turnId);
      assert.ok(turn, `${session.id}: gold fact "${gf.key}" cites unknown turn "${gf.turnId}"`);
      const quote = collapseWhitespace(gf.quote);
      const found = [turn!.text, turn!.translatedText].some((t) => collapseWhitespace(t).includes(quote));
      assert.ok(found, `${session.id}: gold fact "${gf.key}" quote is not verbatim in turn "${gf.turnId}"`);
    }
  }
});

test("a crisis/concern session names its expectedEscalationTurnId, and that turn exists", () => {
  const sessions = loadDataset(DATASET_PATH);
  for (const session of sessions) {
    if (session.expectedCrisisLevel === "none") continue;
    assert.ok(session.expectedEscalationTurnId, `${session.id}: missing expectedEscalationTurnId`);
    const turnIds = new Set(session.input.turns.map((t) => t.turnId));
    assert.ok(turnIds.has(session.expectedEscalationTurnId!), `${session.id}: expectedEscalationTurnId not in turns`);
  }
});

test("parseDataset refuses invalid JSON with a line number", () => {
  assert.throws(() => parseDataset("not json", "inline"), /inline:1/);
});

test("parseDataset refuses a duplicate session id", () => {
  const sessions = loadDataset(DATASET_PATH);
  const first = JSON.stringify(sessions[0]);
  assert.throws(() => parseDataset(`${first}\n${first}`, "inline"), /duplicate session id/);
});

// ISS-330: a Windows editor saves JSON/JSONL with a leading UTF-8 BOM; readFileSync("utf-8") keeps it
// as U+FEFF and JSON.parse refuses it. Every eval input parser strips one leading BOM.
const BOM = "\uFEFF";
const Q = JSON.stringify({ id: "q1", lang: "en", country: "IN", theme: "t", question: "why?", expectedTurnIds: ["t1"] });
const HEADER = JSON.stringify({ source: "synthetic" });

test("stripBom removes exactly one leading U+FEFF and nothing else", () => {
  assert.equal(stripBom(`${BOM}abc`), "abc");
  assert.equal(stripBom(`${BOM}${BOM}abc`), `${BOM}abc`);
  assert.equal(stripBom(`abc${BOM}`), `abc${BOM}`);
  assert.equal(stripBom("abc"), "abc");
});

test("parseGoldenFile: a header line with a leading BOM still parses as source=synthetic (ISS-330)", () => {
  const f = parseGoldenFile(`${BOM}${HEADER}\n${Q}\n`, "inline");
  assert.equal(f.source, "synthetic");
  assert.equal(f.questions.length, 1);
});

test("parseGoldenFile: BOM + CRLF line endings still parse as source=synthetic (ISS-330)", () => {
  const f = parseGoldenFile(`${BOM}${HEADER}\r\n${Q}\r\n`, "inline");
  assert.equal(f.source, "synthetic");
  assert.equal(f.questions.length, 1);
});

test("parseGoldenFile: a blank first line (with and without BOM) before the header still parses as source=synthetic (ISS-330)", () => {
  for (const raw of [`\n${HEADER}\n${Q}\n`, `${BOM}\n${HEADER}\n${Q}\n`, `${BOM}\r\n${HEADER}\r\n${Q}`]) {
    const f = parseGoldenFile(raw, "inline");
    assert.equal(f.source, "synthetic", JSON.stringify(raw.slice(0, 12)));
    assert.equal(f.questions.length, 1);
  }
});

test("parseGoldenFile: a BOM on a header-less file parses and declares no provenance (ISS-330)", () => {
  const f = parseGoldenFile(`${BOM}${Q}\n`, "inline");
  assert.equal(f.source, undefined);
  assert.equal(f.questions.length, 1);
});

test("parseGoldenFile: a BOM does not weaken the provenance check (bad source still refused)", () => {
  assert.throws(() => parseGoldenFile(`${BOM}${JSON.stringify({ source: "Synthetic" })}\n${Q}`, "inline"), /exactly "synthetic" or "recorded"/);
});

test("parseDataset: a BOM before the first session line is stripped (ISS-330)", () => {
  const sessions = loadDataset(DATASET_PATH);
  const parsed = parseDataset(`${BOM}${sessions.map((s) => JSON.stringify(s)).join("\n")}`, "inline");
  assert.equal(parsed.length, sessions.length);
});

test("parseKbFixture / parseProbeSet / parseCoverageFixture / parseKbGaps: a leading BOM is stripped (ISS-330)", () => {
  const kb = parseKbFixture(`${BOM}${JSON.stringify({ schemaVersion: 1, source: "synthetic", recordedAt: "2026-01-01", search: [] })}`, "inline");
  assert.equal(kb.source, "synthetic");
  const probes = parseProbeSet(`${BOM}${JSON.stringify({ schemaVersion: 1, source: "synthetic", cases: [] })}`, "inline");
  assert.equal(probes.source, "synthetic");
  const gaps = parseKbGaps(`${BOM}${JSON.stringify({ gaps: [] })}`, "inline");
  assert.equal(gaps.rows.length, 0);
  assert.throws(() => parseCoverageFixture(`${BOM}{"schemaVersion":2}`, "inline"), /unsupported schemaVersion 2/);
});
