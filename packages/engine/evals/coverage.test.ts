/**
 * P1 U11 / A17: the coverage report. Country x theme probe of KB `/search` (hit, stale, date_unknown, unanswered), KB `/gaps`
 * rows, and the VC gap counts through an injected port. Everything runs on frozen fixtures: no network, no Mongo, no clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  buildCoverageReport,
  loadCoverageFixture,
  loadKbGaps,
  parseCoverageFixture,
  parseKbGaps,
  rosterOf,
  toCoverageMarkdown,
  type CoverageHit,
  type CoverageInput,
  type CoverageProbe,
  type GapCountsPort,
} from "./coverage.js";
import { DEFAULT_STALE_AFTER_MONTHS } from "../src/student/claims.js";
import { DEFAULT_SEARCH_SCORE_THRESHOLD } from "../src/student/graph.js";
import { runCoverage, parseCoverageArgs } from "./run-coverage.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE = join(here, "fixtures", "coverage-probes.sample.json");
const GAPS = join(here, "..", "..", "..", "mcp", "university-kb", "kb-fixture", "gaps.json");

const noGaps = { source: "none", rows: [] };
const noPort: GapCountsPort = async () => [];

function hit(score: number, date?: string): CoverageHit {
  return { score, session: date === undefined ? {} : { date } };
}
function probe(country: string, theme: string): CoverageProbe {
  return { id: `p-${country}-${theme}`, country, theme, query: `q ${country} ${theme}` };
}
function input(over: Partial<CoverageInput> & { searchTable?: Record<string, CoverageHit[]> }): CoverageInput {
  const table = over.searchTable ?? {};
  const base: CoverageInput = {
    fixtureSource: "synthetic",
    countries: ["A", "B"],
    themes: ["t1", "t2"],
    probes: [probe("A", "t1"), probe("A", "t2"), probe("B", "t1"), probe("B", "t2")],
    search: async (q) => table[q],
    asOf: "2026-10-17",
    kbGaps: noGaps,
    gapCounts: noPort,
    gapDates: [],
  };
  const { searchTable: _drop, ...rest } = over;
  return { ...base, ...rest };
}
const cellOf = (report: Awaited<ReturnType<typeof buildCoverageReport>>, country: string, theme: string) => {
  const row = report.probes.find((r) => r.country === country && r.theme === theme);
  assert.ok(row, `no row for ${country}/${theme}`);
  return row;
};

test("the staleness and score defaults are the engine's own (P-7 24 months, score 1.0), not a copy", () => {
  assert.equal(DEFAULT_STALE_AFTER_MONTHS, 24);
  assert.equal(DEFAULT_SEARCH_SCORE_THRESHOLD, 1.0);
});

// ---- C1: per probe hit / stale / date_unknown / unanswered ----------------------------------------

test("C1 a counsellor opens the report for a probe with fresh, stale, undated and below-threshold hits: each is counted in its own column", async () => {
  const report = await buildCoverageReport(
    input({
      searchTable: {
        "q A t1": [hit(1.5, "2026-09-01"), hit(1.2, "2020-01-01"), hit(1.1), hit(1.0, "not a date"), hit(0.99, "2026-09-01")],
      },
    }),
  );
  const row = cellOf(report, "A", "t1");
  assert.equal(row.status, "answered");
  assert.equal(row.unanswered, false);
  assert.equal(row.hitCount, 4, "score >= 1.0 counts (1.0 is the boundary), 0.99 does not");
  assert.equal(row.belowThresholdCount, 1);
  assert.equal(row.freshCount, 1);
  assert.equal(row.staleCount, 1);
  assert.equal(row.dateUnknownCount, 2, "a missing date and an unparseable date are date_unknown, never stale (A13)");
  assert.equal(row.hitCount, row.freshCount + row.staleCount + row.dateUnknownCount);
});

test("C1 only hits below the score threshold: the probe is unanswered although KB returned hits", async () => {
  const report = await buildCoverageReport(input({ searchTable: { "q A t1": [hit(0.4, "2026-09-01"), hit(0.2, "2026-09-02")] } }));
  const row = cellOf(report, "A", "t1");
  assert.equal(row.status, "unanswered");
  assert.equal(row.unanswered, true);
  assert.equal(row.hitCount, 0);
  assert.equal(row.belowThresholdCount, 2);
});

test("C1 staleness boundary follows asOf and the months threshold (24 months: exactly 24 is fresh, 25 is stale), and a custom threshold applies", async () => {
  const t = { "q A t1": [hit(2, "2024-10-17"), hit(2, "2024-10-16"), hit(2, "2024-09-18"), hit(2, "2024-09-17")] };
  const dflt = cellOf(await buildCoverageReport(input({ searchTable: t, asOf: "2026-10-17" })), "A", "t1");
  // months(2024-10-17 -> 2026-10-17) = 24 (fresh); 2024-10-16 = 24 (fresh); 2024-09-18 = 24 (fresh, day not reached); 2024-09-17 = 25 (stale)
  assert.equal(dflt.staleCount, 1);
  assert.equal(dflt.freshCount, 3);
  const strict = cellOf(await buildCoverageReport(input({ searchTable: t, asOf: "2026-10-17", staleAfterMonths: 12 })), "A", "t1");
  assert.equal(strict.staleCount, 4);
  const earlier = cellOf(await buildCoverageReport(input({ searchTable: t, asOf: "2026-09-17" })), "A", "t1");
  assert.equal(earlier.staleCount, 0, "an earlier asOf makes all four fresh (23 or 24 months)");
  const later = cellOf(await buildCoverageReport(input({ searchTable: t, asOf: "2027-10-17" })), "A", "t1");
  assert.equal(later.staleCount, 4, "a year later all four exceed 24 months");
});

test("C1 the report records the asOf, the staleness months and the score threshold it was computed with", async () => {
  const report = await buildCoverageReport(input({ asOf: "2026-10-17" }));
  assert.equal(report.asOf, "2026-10-17");
  assert.equal(report.staleAfterMonths, 24);
  assert.equal(report.scoreThreshold, 1.0);
  await assert.rejects(() => buildCoverageReport(input({ asOf: "yesterday" })), /asOf/);
});

// ---- C2: gap rows, never silently missing ---------------------------------------------------------

test("C2 a country whose probes return zero hits shows as a no-answer country with a gap row per theme", async () => {
  const report = await buildCoverageReport(
    input({ searchTable: { "q A t1": [hit(1.5, "2026-09-01")], "q A t2": [hit(1.5, "2026-09-01")], "q B t1": [], "q B t2": [] } }),
  );
  assert.equal(cellOf(report, "B", "t1").status, "unanswered");
  assert.equal(cellOf(report, "B", "t2").status, "unanswered");
  const b = report.countries.find((c) => c.country === "B");
  assert.equal(b?.noAnswer, true);
  assert.equal(report.countries.find((c) => c.country === "A")?.noAnswer, false);
  assert.deepEqual(report.totals.noAnswerCountries, ["B"]);
});

test("C2 a probe whose query was never recorded is an unrecorded gap row, not a missing row and not a zero-hit answer", async () => {
  const report = await buildCoverageReport(input({ searchTable: { "q A t1": [hit(1.5, "2026-09-01")] } }));
  assert.equal(cellOf(report, "A", "t2").status, "unrecorded");
  assert.equal(cellOf(report, "A", "t2").unanswered, true);
  assert.equal(report.totals.unrecorded, 3);
});

test("C2 a country in the roster with no probe for a theme still gets a row for that cell (no_probe), and a country with no probes at all is a no-answer country", async () => {
  const report = await buildCoverageReport(
    input({
      countries: ["A", "B", "C"],
      probes: [probe("A", "t1"), probe("A", "t2")],
      searchTable: { "q A t1": [hit(1.5, "2026-09-01")], "q A t2": [hit(1.5, "2026-09-01")] },
    }),
  );
  assert.equal(report.probes.length, 6, "3 countries x 2 themes: every cell has a row");
  assert.equal(cellOf(report, "B", "t1").status, "no_probe");
  assert.equal(cellOf(report, "C", "t2").status, "no_probe");
  assert.deepEqual(report.totals.noAnswerCountries, ["B", "C"]);
  assert.equal(report.totals.noProbe, 4);
});

test("C2 a probe naming a country or theme outside the roster is refused, never silently dropped", async () => {
  await assert.rejects(() => buildCoverageReport(input({ probes: [probe("Z", "t1")] })), /Z/);
  await assert.rejects(() => buildCoverageReport(input({ probes: [probe("A", "zz")] })), /zz/);
  await assert.rejects(() => buildCoverageReport(input({ probes: [probe("A", "t1"), probe("A", "t1")] })), /duplicate/);
});

test("C2 a search that throws fails the report (a broken KB is not read as an empty country)", async () => {
  await assert.rejects(
    () =>
      buildCoverageReport(
        input({
          search: async () => {
            throw new Error("kb down");
          },
        }),
      ),
    /kb down/,
  );
});

// ---- C3: KB /gaps rows -----------------------------------------------------------------------------

test("C3 KB /gaps rows from the recorded gaps.json are listed with id, kind, status and description, a row missing fields shows the gap in the field", () => {
  const gaps = loadKbGaps(GAPS, "mcp/university-kb/kb-fixture/gaps.json");
  assert.equal(gaps.rows.length, 3);
  assert.deepEqual(gaps.rows[0], { id: "gap-1", kind: "source-pending", status: "open", description: "Japan scholarship webinar recording not received" });
  assert.deepEqual(gaps.rows[1], { id: "gap-2", kind: "vector-pending", status: "open", description: null });
  assert.deepEqual(gaps.rows[2], { id: null, kind: "recording-pending", status: null, description: null });
  assert.throws(() => parseKbGaps("{}", "inline"), /gaps/);
  assert.throws(() => parseKbGaps(JSON.stringify({ gaps: [{ _id: "x" }] }), "inline"), /kind/);
});

test("C3 the report carries the KB gap rows next to the probes and the markdown lists them", async () => {
  const gaps = loadKbGaps(GAPS, "mcp/university-kb/kb-fixture/gaps.json");
  const report = await buildCoverageReport(input({ kbGaps: gaps }));
  assert.equal(report.kbGaps.rows.length, 3);
  assert.equal(report.kbGaps.source, "mcp/university-kb/kb-fixture/gaps.json");
  const md = toCoverageMarkdown(report);
  assert.match(md, /gap-1/);
  assert.match(md, /source-pending/);
  assert.match(md, /Japan scholarship webinar recording not received/);
  assert.match(md, /recording-pending/);
});

// ---- C4: VC gap counts through an injected port ----------------------------------------------------

test("C4 VC gap counts are read through the port once per requested date and shown as totals by kind and by date", async () => {
  const calls: string[] = [];
  const port: GapCountsPort = async ({ date }) => {
    calls.push(date);
    if (date === "2026-10-15") return [{ date, kind: "no_sourced_answer", count: 4 }, { date, kind: "unverified_claim", count: 1 }];
    if (date === "2026-10-16") return [{ date, kind: "no_sourced_answer", count: 7 }];
    return [];
  };
  const report = await buildCoverageReport(input({ gapCounts: port, gapDates: ["2026-10-16", "2026-10-15", "2026-10-17"] }));
  assert.deepEqual(calls, ["2026-10-15", "2026-10-16", "2026-10-17"], "dates are read in sorted order");
  assert.deepEqual(report.vcGaps.totalsByKind, { no_sourced_answer: 11, unverified_claim: 1 });
  assert.deepEqual(report.vcGaps.totalsByDate, { "2026-10-15": 5, "2026-10-16": 7, "2026-10-17": 0 }, "a date with no rows shows 0, not missing");
  assert.equal(report.vcGaps.grandTotal, 12);
  assert.equal(report.vcGaps.rows.length, 3);
  const md = toCoverageMarkdown(report);
  assert.match(md, /no_sourced_answer/);
  assert.match(md, /2026-10-16/);
});

test("C4 the VC gap store has no country or theme: the report says so and does not invent a per-probe VC count", async () => {
  const report = await buildCoverageReport(input({}));
  assert.match(report.vcGaps.note, /no country or theme/i);
  for (const row of report.probes) assert.equal("vcGapCount" in row, false);
  assert.match(toCoverageMarkdown(report), /ASSUMPTION/);
});

test("C4 a port that fails fails the report, and a malformed count is refused", async () => {
  await assert.rejects(
    () => buildCoverageReport(input({ gapDates: ["2026-10-15"], gapCounts: async () => { throw new Error("mongo down"); } })),
    /mongo down/,
  );
  for (const count of [-1, 1.5, Number.NaN]) {
    await assert.rejects(
      () => buildCoverageReport(input({ gapDates: ["2026-10-15"], gapCounts: async () => [{ date: "2026-10-15", kind: "no_sourced_answer", count }] })),
      /count/,
    );
  }
  await assert.rejects(() => buildCoverageReport(input({ gapDates: ["15 Oct"] })), /date/);
});

// ---- C5: reproducible --------------------------------------------------------------------------------

test("C5 two runs of the CLI on the same fixture write byte-identical report files, and the report holds no clock field", async () => {
  const a = mkdtempSync(join(tmpdir(), "cov-a-"));
  const b = mkdtempSync(join(tmpdir(), "cov-b-"));
  try {
    const argv = ["--as-of=2026-10-17"];
    const one = await runCoverage(parseCoverageArgs([...argv, `--out=${a}`]));
    await new Promise((r) => setTimeout(r, 25));
    const two = await runCoverage(parseCoverageArgs([...argv, `--out=${b}`]));
    assert.deepEqual(readdirSync(a).sort(), ["coverage-report.json", "coverage-report.md"]);
    for (const name of readdirSync(a)) assert.equal(readFileSync(join(a, name), "utf-8"), readFileSync(join(b, name), "utf-8"), `${name} differs between runs`);
    assert.equal(one.markdown, two.markdown);
    const json = readFileSync(join(a, "coverage-report.json"), "utf-8");
    assert.doesNotMatch(json, /generatedAt|timestamp|"now"/i);
    assert.doesNotMatch(json, new RegExp(String(new Date().getUTCFullYear()) + "-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d"), "no wall-clock instant appears in the report");
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test("C5 --as-of is an input: a different asOf changes the stale counts, and the default asOf is the fixture's recordedAt date, not today", async () => {
  const d = mkdtempSync(join(tmpdir(), "cov-d-"));
  const f = mkdtempSync(join(tmpdir(), "cov-f-"));
  try {
    const dflt = await runCoverage(parseCoverageArgs([`--out=${d}`]));
    const dfltReport = dflt.report as Awaited<ReturnType<typeof buildCoverageReport>>;
    assert.equal(dfltReport.asOf, "2026-10-17");
    const far = await runCoverage(parseCoverageArgs(["--as-of=2029-10-17", "--out", f]));
    const farReport = far.report as Awaited<ReturnType<typeof buildCoverageReport>>;
    assert.ok(farReport.totals.staleCount > dfltReport.totals.staleCount);
  } finally {
    rmSync(d, { recursive: true, force: true });
    rmSync(f, { recursive: true, force: true });
  }
});

// ---- the sample fixture and the A17 command --------------------------------------------------------

test("the synthetic sample fixture has at least 10 countries x 5 themes, is flagged synthetic, and parses", () => {
  const fx = loadCoverageFixture(FIXTURE);
  assert.equal(fx.source, "synthetic");
  const roster = rosterOf(fx);
  assert.ok(roster.countries.length >= 10);
  assert.ok(roster.themes.length >= 5);
  assert.ok(fx.probes.length >= 50);
  assert.throws(() => parseCoverageFixture(JSON.stringify({ schemaVersion: 2 }), "inline"), /schemaVersion/);
  assert.throws(() => parseCoverageFixture("nope", "inline"), /inline/);
});

test("A17 the coverage command on the sample fixture lists every country x theme, with a no-answer country, unrecorded and no_probe cells, stale and date_unknown counts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cov-s-"));
  try {
    const out = await runCoverage(parseCoverageArgs([`--out=${dir}`]));
    const report = out.report as Awaited<ReturnType<typeof buildCoverageReport>>;
    const fx = loadCoverageFixture(FIXTURE);
    const roster = rosterOf(fx);
    assert.equal(report.probes.length, roster.countries.length * roster.themes.length, "a row per country x theme cell");
    assert.deepEqual(report.totals.noAnswerCountries, ["Singapore"].concat(["Japan"]).sort(), "Singapore (zero hits) and Japan (only below-threshold hits) answer nothing");
    assert.ok(report.totals.unrecorded >= 1 && report.totals.noProbe >= 1);
    assert.ok(report.totals.staleCount >= 1 && report.totals.dateUnknownCount >= 1);
    assert.equal(report.kbGaps.rows.length, 3);
    assert.equal(report.vcGaps.grandTotal, 17);
    assert.deepEqual(report.vcGaps.totalsByKind, { no_sourced_answer: 13, unverified_claim: 4 });
    assert.match(out.markdown, /Singapore/);
    assert.equal(out.mode, "mock");
    assert.equal(out.status, "completed");
    assert.equal(out.files.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI refuses --real (no live mode: G-KB and the KB key are open) and an unknown flag", () => {
  assert.throws(() => parseCoverageArgs(["--real"]), /real/i);
  assert.throws(() => parseCoverageArgs(["--bogus"]), /unknown/i);
  assert.throws(() => parseCoverageArgs(["--stale-after-months=0"]), /stale-after-months/);
  assert.throws(() => parseCoverageArgs(["--score-threshold=abc"]), /score-threshold/);
});

// ---- C6: text-free -----------------------------------------------------------------------------------

test("C6 the sample fixture's hits carry turn text, and neither the JSON nor the markdown report contains any of it, nor any probe query", async () => {
  const raw = readFileSync(FIXTURE, "utf-8");
  assert.match(raw, /SYNTHETIC-TURN-TEXT-SENTINEL/, "the fixture really holds text that a leak would expose");
  const dir = mkdtempSync(join(tmpdir(), "cov-c6-"));
  try {
    const out = await runCoverage(parseCoverageArgs([`--out=${dir}`]));
    const json = readFileSync(join(dir, "coverage-report.json"), "utf-8");
    for (const text of [json, out.markdown, readFileSync(join(dir, "coverage-report.md"), "utf-8")]) {
      assert.doesNotMatch(text, /SENTINEL/);
      assert.doesNotMatch(text, /SYNTHETIC probe:/, "probe query text is not printed, only the probe id");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C6 a search hit that carries text or a port row that carries a student field leaks neither into the report", async () => {
  const leaky = { score: 1.5, turnId: "t", turn: { text: "LEAK-TURN-TEXT" }, session: { date: "2026-09-01", title: "LEAK-SESSION-TITLE" }, studentId: "LEAK-STUDENT" };
  const report = await buildCoverageReport(
    input({
      searchTable: { "q A t1": [leaky as unknown as CoverageHit] },
      gapDates: ["2026-10-15"],
      gapCounts: async ({ date }) => [{ date, kind: "no_sourced_answer", count: 2, text: "LEAK-QUESTION", threadId: "LEAK-THREAD" } as never],
    }),
  );
  const everything = JSON.stringify(report) + toCoverageMarkdown(report);
  assert.doesNotMatch(everything, /LEAK/);
  assert.equal(cellOf(report, "A", "t1").hitCount, 1);
  assert.equal(report.vcGaps.grandTotal, 2);
});
