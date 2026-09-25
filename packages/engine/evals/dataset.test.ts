/** T-009: the golden-session dataset itself must satisfy the brief's stratification requirements, and
 *  every gold fact's quote must be verbatim in its cited turn — the same guarantee the generator
 *  script enforced at write time, re-checked here so a hand-edit of sessions.jsonl can't silently
 *  break it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadDataset, parseDataset } from "./dataset.js";
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
