/** P1 U4 / A2a: Hit@3 over a golden set against a frozen KB fixture (no network). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  loadGoldenSet,
  loadKbFixture,
  parseGoldenSet,
  parseKbFixture,
  fixtureSearch,
  type GoldenQuestion,
  type KbFixture,
  type KbHit,
} from "./dataset.js";
import { scoreKbEval, A2A_THRESHOLD, A2A_MIN_ENGLISH } from "./kb-eval.js";
import { toKbMarkdown } from "./report.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const GOLDEN = join(here, "fixtures", "golden.sample.jsonl");
const FIXTURE = join(here, "fixtures", "kb-fixture.sample.json");

function hit(turnId: string, score: number, sessionId = "s"): KbHit {
  return { turnId, sessionId, score, turn: { text: "x" }, session: {} };
}
function q(id: string, lang: GoldenQuestion["lang"], country: string, theme: string, expected: string): GoldenQuestion {
  return { id, lang, country, theme, question: `question ${id}`, expectedTurnIds: [expected], expectedSessionIds: [] };
}

test("golden set + fixture sample load, are consistent, and are flagged synthetic", () => {
  const golden = loadGoldenSet(GOLDEN);
  const fixture = loadKbFixture(FIXTURE);
  assert.equal(golden.length, 60);
  assert.equal(golden.filter((g) => g.lang === "en").length, 45);
  assert.equal(fixture.source, "synthetic");
  for (const g of golden) assert.ok(fixtureSearch(fixture, g.question), `fixture is missing "${g.id}"`);
});

test("parseGoldenSet rejects invalid JSON with a line number, a duplicate id, and a question with no expectation", () => {
  assert.throws(() => parseGoldenSet("nope", "inline"), /inline:1/);
  const ok = JSON.stringify(q("a", "en", "USA", "visa", "t1"));
  assert.throws(() => parseGoldenSet(`${ok}\n${ok}`, "inline"), /duplicate/);
  const none = JSON.stringify({ id: "z", lang: "en", country: "USA", theme: "visa", question: "?" });
  assert.throws(() => parseGoldenSet(none, "inline"), /expected/i);
  assert.throws(() => parseGoldenSet("", "inline"), /no questions/);
});

test("parseKbFixture rejects an unknown schemaVersion and a hit missing turn text", () => {
  assert.throws(() => parseKbFixture(JSON.stringify({ schemaVersion: 2, source: "synthetic", recordedAt: "x", search: [], ask: [], sessions: {} }), "inline"), /schemaVersion/);
  const bad = { schemaVersion: 1, source: "synthetic", recordedAt: "x", search: [{ query: "a", hits: [{ turnId: "t", sessionId: "s", score: 1 }] }], ask: [], sessions: {} };
  assert.throws(() => parseKbFixture(JSON.stringify(bad), "inline"), /turn/);
});

test("A2a on the synthetic sample: hit@3 = 44/45 English, breadth proven, but verdict NOT PROVEN (synthetic fixture), provenance synthetic", async () => {
  const golden = loadGoldenSet(GOLDEN);
  const fixture = loadKbFixture(FIXTURE);
  const report = await scoreKbEval(golden, async (query) => fixtureSearch(fixture, query), { fixtureSource: fixture.source });
  assert.equal(report.a2a.englishCount, 45);
  assert.equal(report.a2a.hits, 44);
  assert.ok(Math.abs(report.a2a.hitAt3 - 44 / 45) < 1e-9);
  assert.equal(report.a2a.verdict, "NOT PROVEN", "a synthetic fixture can never PROVE A2a");
  assert.match(report.a2a.reason ?? "", /synthetic fixture/);
  assert.ok(report.a2a.countries >= 10 && report.a2a.themes >= 5);
  assert.equal(report.fixtureSource, "synthetic");
  assert.deepEqual(report.misses.map((m) => m.id), ["g-008"]);
  assert.equal(report.misses[0]?.reason, "miss");
  assert.equal(report.a2b.verdict, "NOT PROVEN", "Hindi/Hinglish retrieval needs the REAL query-rewrite; a frozen fixture cannot prove it");
  assert.equal(report.a2b.count, 15);
});

test("the threshold is 0.95 and a drop below it is FAIL (falsification: rank-4 hits do not count)", async () => {
  assert.equal(A2A_THRESHOLD, 0.95);
  assert.equal(A2A_MIN_ENGLISH, 45);
  const golden: GoldenQuestion[] = [];
  const fixture: KbFixture = { schemaVersion: 1, source: "recorded", recordedAt: "x", search: [], ask: [], sessions: {} };
  for (let i = 0; i < 45; i++) {
    golden.push(q(`g${i}`, "en", `C${i % 10}`, `T${i % 5}`, `want${i}`));
    // 3 of 45 have the expected turn at rank 4 => 42/45 = 0.933 < 0.95
    const hits = [hit("a", 0.9), hit("b", 0.8), hit("c", 0.7), hit(`want${i}`, 0.6)];
    if (i >= 3) hits[2] = hit(`want${i}`, 0.7);
    fixture.search.push({ query: `question g${i}`, hits });
  }
  const report = await scoreKbEval(golden, async (query) => fixtureSearch(fixture, query), { fixtureSource: "recorded" });
  assert.equal(report.a2a.hits, 42);
  assert.equal(report.a2a.verdict, "FAIL");
});

test("hits are ranked by score, not by array order (a high-score hit listed last still counts)", async () => {
  const golden = Array.from({ length: 45 }, (_, i) => q(`g${i}`, "en", `C${i % 10}`, `T${i % 5}`, `want${i}`));
  const searchFn = async (query: string) => {
    const i = Number(query.replace("question g", ""));
    return [hit("a", 0.2), hit("b", 0.3), hit("c", 0.4), hit(`want${i}`, 0.99)];
  };
  const report = await scoreKbEval(golden, searchFn, { fixtureSource: "recorded" });
  assert.equal(report.a2a.hits, 45);
});

test("a session-id expectation also counts as a hit", async () => {
  const g: GoldenQuestion = { id: "g", lang: "en", country: "USA", theme: "visa", question: "q", expectedTurnIds: [], expectedSessionIds: ["s-want"] };
  const report = await scoreKbEval([g], async () => [hit("zzz", 0.9, "s-want")], { fixtureSource: "recorded" });
  assert.equal(report.a2a.hits, 1);
});

test("an unrecorded query is a miss with reason 'unrecorded' (frozen-fixture integrity), never silently skipped", async () => {
  const golden = [q("g1", "en", "USA", "visa", "t1")];
  const report = await scoreKbEval(golden, async () => undefined, { fixtureSource: "recorded" });
  assert.equal(report.a2a.hits, 0);
  assert.deepEqual(report.misses, [{ id: "g1", reason: "unrecorded" }]);
  assert.equal(report.unrecorded, 1);
});

test("rate >= 0.95 but fewer than 45 English questions or thin breadth is NOT PROVEN, not PASS", async () => {
  const few = Array.from({ length: 20 }, (_, i) => q(`g${i}`, "en", `C${i % 10}`, `T${i % 5}`, `want${i}`));
  const searchFn = async (query: string) => [hit(`want${query.replace("question g", "")}`, 0.9)];
  const r1 = await scoreKbEval(few, searchFn, { fixtureSource: "recorded" });
  assert.equal(r1.a2a.hitAt3, 1);
  assert.equal(r1.a2a.verdict, "NOT PROVEN");
  const narrow = Array.from({ length: 45 }, (_, i) => q(`g${i}`, "en", `C${i % 3}`, `T${i % 2}`, `want${i}`));
  const r2 = await scoreKbEval(narrow, searchFn, { fixtureSource: "recorded" });
  assert.equal(r2.a2a.verdict, "NOT PROVEN");
  assert.equal(r2.a2a.countries, 3);
  assert.equal(r2.a2a.breadthProven, false);
});

test("an empty English set is NOT PROVEN with no division by zero", async () => {
  const report = await scoreKbEval([], async () => [], { fixtureSource: "recorded" });
  assert.equal(report.a2a.verdict, "NOT PROVEN");
  assert.equal(report.a2a.hitAt3, 0);
});

test("toKbMarkdown reports the verdict, provenance and every miss", async () => {
  const golden = loadGoldenSet(GOLDEN);
  const fixture = loadKbFixture(FIXTURE);
  const report = await scoreKbEval(golden, async (query) => fixtureSearch(fixture, query), { fixtureSource: fixture.source });
  const md = toKbMarkdown(report);
  assert.match(md, /A2a/);
  assert.match(md, /A2a[^\n]*NOT PROVEN/);
  assert.match(md, /synthetic/);
  assert.match(md, /g-008/);
  assert.match(md, /A2b[^\n]*NOT PROVEN/);
});

test("fix5: the same hits on a RECORDED fixture are PASS; a synthetic fixture below the threshold still FAILs", async () => {
  const golden = loadGoldenSet(GOLDEN);
  const fixture = loadKbFixture(FIXTURE);
  const search = async (query: string) => fixtureSearch(fixture, query);
  const recorded = await scoreKbEval(golden, search, { fixtureSource: "recorded" });
  assert.equal(recorded.a2a.verdict, "PASS");
  const synthetic = await scoreKbEval(golden, search, { fixtureSource: "synthetic" });
  assert.equal(synthetic.a2a.verdict, "NOT PROVEN");
  const failing = await scoreKbEval(golden, async () => [], { fixtureSource: "synthetic" });
  assert.equal(failing.a2a.verdict, "FAIL", "a real shortfall is still reported as FAIL");
  assert.match(toKbMarkdown(synthetic), /A2a[^\n]*NOT PROVEN \(synthetic fixture\)/);
});
