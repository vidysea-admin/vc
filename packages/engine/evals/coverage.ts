/**
 * P1 U11 / spec A17: the coverage report. For every (country, theme) cell it probes KB `/search` and counts hits, stale hits,
 * date_unknown hits and whether the probe went unanswered; it lists the KB `/gaps` rows beside them; and it shows the VC
 * gap counts (the text-free store from U8) as totals by kind and date, read through an injected port.
 *
 * Properties the criteria pin:
 *  - a pure builder: the only inputs are the roster, the probes, a search function, the KB gap rows, the gap-count port, `asOf`
 *    and two thresholds. There is no clock here, so two runs on the same inputs are byte-identical (C5).
 *  - text-free (C6): a hit is parsed down to `{score, session.date}` and a port row down to `{date, kind, count}`; turn text,
 *    session titles, student/thread ids and probe query text are never copied into the report.
 *  - a cell is never silently missing (C2): every roster country x theme gets a row, with status `answered`, `unanswered`
 *    (zero hits or only below-threshold hits), `unrecorded` (the fixture has no recording for the probe) or `no_probe`.
 *
 * [ASSUMPTION] Q-U11-1: the VC gap store is keyed by date and kind only (GapCountDoc), so per-probe `unanswered` comes from the
 * probe itself and the VC counts are overall totals. Adding a country/theme dimension would be a schema and privacy change in
 * packages/db and is not done here.
 * CORE-REQUEST: packages/engine/src/student/claims.ts export `dateFlags` so staleness is not re-implemented below.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { listGapCounts } from "@vc/db";
import { DEFAULT_STALE_AFTER_MONTHS } from "../src/student/claims.js";
import { DEFAULT_SEARCH_SCORE_THRESHOLD } from "../src/student/graph.js";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A KB `/search` hit reduced to what coverage may read. Anything else on the hit is stripped at parse time. */
const HitSchema = z.object({ score: z.number().finite(), session: z.object({ date: z.unknown().optional() }).optional() });
export interface CoverageHit {
  score: number;
  session?: { date?: unknown };
}

export interface CoverageProbe {
  id: string;
  country: string;
  theme: string;
  /** Counsellor-authored probe text (not a student question). Used to look up the search; never printed. */
  query: string;
}

/** `undefined` = the query was never recorded (a gap, not an empty answer). */
export type CoverageSearchFn = (query: string) => Promise<readonly CoverageHit[] | undefined>;

export type GapCountRow = Awaited<ReturnType<typeof listGapCounts>>[number];
/** Same shape as `(input) => listGapCounts(db, input)` from @vc/db; the report never opens a Mongo connection itself. */
export type GapCountsPort = (input: { date: string }) => Promise<readonly GapCountRow[]>;

export interface KbGapRow {
  id: string | null;
  kind: string;
  status: string | null;
  description: string | null;
}
export interface KbGapsSnapshot {
  source: string;
  rows: KbGapRow[];
}

export interface CoverageInput {
  fixtureSource: string;
  countries: readonly string[];
  themes: readonly string[];
  probes: readonly CoverageProbe[];
  search: CoverageSearchFn;
  /** YYYY-MM-DD(...) instant that "stale" is measured against. Required: the report has no clock. */
  asOf: string;
  staleAfterMonths?: number;
  scoreThreshold?: number;
  kbGaps: KbGapsSnapshot;
  gapCounts: GapCountsPort;
  gapDates: readonly string[];
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type ProbeStatus = "answered" | "unanswered" | "unrecorded" | "no_probe";

export interface ProbeRow {
  probeId: string | null;
  country: string;
  theme: string;
  status: ProbeStatus;
  /** True for every status except `answered`: the cell is a gap. */
  unanswered: boolean;
  /** Hits with score >= the threshold (the engine's own "a hit counts" rule). */
  hitCount: number;
  belowThresholdCount: number;
  freshCount: number;
  staleCount: number;
  dateUnknownCount: number;
}

export interface Rollup {
  cells: number;
  answered: number;
  unanswered: number;
  hitCount: number;
  staleCount: number;
  dateUnknownCount: number;
  /** No cell of this country/theme was answered. */
  noAnswer: boolean;
}

export interface CoverageReport {
  schemaVersion: 1;
  kind: "coverage-report";
  mode: "mock";
  fixtureSource: string;
  asOf: string;
  staleAfterMonths: number;
  scoreThreshold: number;
  probes: ProbeRow[];
  countries: Array<{ country: string } & Rollup>;
  themes: Array<{ theme: string } & Rollup>;
  totals: {
    cells: number;
    answered: number;
    unanswered: number;
    unrecorded: number;
    noProbe: number;
    hitCount: number;
    staleCount: number;
    dateUnknownCount: number;
    noAnswerCountries: string[];
    noAnswerThemes: string[];
  };
  kbGaps: KbGapsSnapshot;
  vcGaps: {
    dates: string[];
    rows: Array<{ date: string; kind: string; count: number }>;
    totalsByKind: Record<string, number>;
    totalsByDate: Record<string, number>;
    grandTotal: number;
    note: string;
  };
}

const VC_GAP_NOTE =
  "[ASSUMPTION] Q-U11-1: the VC gap store holds a count per date and kind only, with no country or theme, so these are overall totals and per-probe unanswered comes from the probe itself.";

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const uniqueSorted = (xs: readonly string[]): string[] => [...new Set(xs)].sort(byCode);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

function assertAsOf(asOf: string): Date {
  if (!DATE_PREFIX.test(asOf) || Number.isNaN(Date.parse(asOf))) throw new Error(`coverage: asOf "${asOf}" is not a YYYY-MM-DD date`);
  return new Date(asOf);
}

// Same arithmetic as src/student/claims.ts `monthsBetween` / `dateFlags` (not exported; see CORE-REQUEST above).
function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) - (to.getUTCDate() < from.getUTCDate() ? 1 : 0);
}
function dateKind(date: unknown, asOf: Date, staleAfterMonths: number): "fresh" | "stale" | "dateUnknown" {
  if (typeof date !== "string" || !DATE_PREFIX.test(date) || Number.isNaN(Date.parse(date))) return "dateUnknown";
  return monthsBetween(new Date(date), asOf) > staleAfterMonths ? "stale" : "fresh";
}

function emptyRollup(): Rollup {
  return { cells: 0, answered: 0, unanswered: 0, hitCount: 0, staleCount: 0, dateUnknownCount: 0, noAnswer: true };
}
function addToRollup(r: Rollup, row: ProbeRow): void {
  r.cells += 1;
  if (row.unanswered) r.unanswered += 1;
  else r.answered += 1;
  r.hitCount += row.hitCount;
  r.staleCount += row.staleCount;
  r.dateUnknownCount += row.dateUnknownCount;
  r.noAnswer = r.answered === 0;
}

export async function buildCoverageReport(input: CoverageInput): Promise<CoverageReport> {
  const staleAfterMonths = input.staleAfterMonths ?? DEFAULT_STALE_AFTER_MONTHS;
  const scoreThreshold = input.scoreThreshold ?? DEFAULT_SEARCH_SCORE_THRESHOLD;
  const asOfDate = assertAsOf(input.asOf);
  const countries = uniqueSorted(input.countries);
  const themes = uniqueSorted(input.themes);
  if (countries.length === 0 || themes.length === 0) throw new Error("coverage: the roster needs at least one country and one theme");

  const cell = new Map<string, CoverageProbe>();
  for (const p of input.probes) {
    if (!countries.includes(p.country)) throw new Error(`coverage: probe "${p.id}" names country "${p.country}" which is not in the roster`);
    if (!themes.includes(p.theme)) throw new Error(`coverage: probe "${p.id}" names theme "${p.theme}" which is not in the roster`);
    const key = JSON.stringify([p.country, p.theme]);
    if (cell.has(key)) throw new Error(`coverage: duplicate probe for ${p.country} / ${p.theme} ("${cell.get(key)?.id}" and "${p.id}")`);
    cell.set(key, p);
  }

  const rows: ProbeRow[] = [];
  for (const country of countries) {
    for (const theme of themes) {
      const p = cell.get(JSON.stringify([country, theme]));
      const base = { probeId: p?.id ?? null, country, theme, hitCount: 0, belowThresholdCount: 0, freshCount: 0, staleCount: 0, dateUnknownCount: 0 };
      if (!p) {
        rows.push({ ...base, status: "no_probe", unanswered: true });
        continue;
      }
      const raw = await input.search(p.query);
      if (raw === undefined) {
        rows.push({ ...base, status: "unrecorded", unanswered: true });
        continue;
      }
      const counted = { ...base };
      for (const h of raw) {
        const hit = HitSchema.parse(h);
        if (hit.score < scoreThreshold) {
          counted.belowThresholdCount += 1;
          continue;
        }
        counted.hitCount += 1;
        const kind = dateKind(hit.session?.date, asOfDate, staleAfterMonths);
        if (kind === "stale") counted.staleCount += 1;
        else if (kind === "dateUnknown") counted.dateUnknownCount += 1;
        else counted.freshCount += 1;
      }
      const answered = counted.hitCount > 0;
      rows.push({ ...counted, status: answered ? "answered" : "unanswered", unanswered: !answered });
    }
  }

  const byCountry = new Map(countries.map((c) => [c, emptyRollup()]));
  const byTheme = new Map(themes.map((t) => [t, emptyRollup()]));
  for (const row of rows) {
    addToRollup(byCountry.get(row.country)!, row);
    addToRollup(byTheme.get(row.theme)!, row);
  }
  const countryRows = countries.map((country) => ({ country, ...byCountry.get(country)! }));
  const themeRows = themes.map((theme) => ({ theme, ...byTheme.get(theme)! }));

  const totals = {
    cells: rows.length,
    answered: rows.filter((r) => r.status === "answered").length,
    unanswered: rows.filter((r) => r.status === "unanswered").length,
    unrecorded: rows.filter((r) => r.status === "unrecorded").length,
    noProbe: rows.filter((r) => r.status === "no_probe").length,
    hitCount: rows.reduce((n, r) => n + r.hitCount, 0),
    staleCount: rows.reduce((n, r) => n + r.staleCount, 0),
    dateUnknownCount: rows.reduce((n, r) => n + r.dateUnknownCount, 0),
    noAnswerCountries: countryRows.filter((c) => c.noAnswer).map((c) => c.country),
    noAnswerThemes: themeRows.filter((t) => t.noAnswer).map((t) => t.theme),
  };

  return {
    schemaVersion: 1,
    kind: "coverage-report",
    mode: "mock",
    fixtureSource: input.fixtureSource,
    asOf: input.asOf,
    staleAfterMonths,
    scoreThreshold,
    probes: rows,
    countries: countryRows,
    themes: themeRows,
    totals,
    kbGaps: { source: input.kbGaps.source, rows: input.kbGaps.rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, description: r.description })) },
    vcGaps: await readVcGaps(input.gapCounts, input.gapDates),
  };
}

async function readVcGaps(port: GapCountsPort, requested: readonly string[]): Promise<CoverageReport["vcGaps"]> {
  const dates = uniqueSorted(requested);
  for (const d of dates) {
    if (!DATE_ONLY.test(d) || Number.isNaN(Date.parse(d))) throw new Error(`coverage: gap date "${d}" is not a YYYY-MM-DD date`);
  }
  const rows: Array<{ date: string; kind: string; count: number }> = [];
  const totalsByKind: Record<string, number> = {};
  const totalsByDate: Record<string, number> = Object.fromEntries(dates.map((d) => [d, 0]));
  for (const date of dates) {
    for (const r of await port({ date })) {
      // Project to the three text-free fields: whatever else a port row carries is dropped here.
      const row = { date: r.date, kind: r.kind as string, count: r.count };
      if (typeof row.kind !== "string" || row.kind.length === 0) throw new Error(`coverage: gap row for ${date} has no kind`);
      if (!Number.isInteger(row.count) || row.count < 0) throw new Error(`coverage: gap count for ${date}/${row.kind} must be a non-negative integer (got ${String(row.count)})`);
      rows.push(row);
      totalsByKind[row.kind] = (totalsByKind[row.kind] ?? 0) + row.count;
      totalsByDate[date] = (totalsByDate[date] ?? 0) + row.count;
    }
  }
  rows.sort((a, b) => byCode(a.date, b.date) || byCode(a.kind, b.kind));
  const sortedKinds = Object.fromEntries(Object.entries(totalsByKind).sort(([a], [b]) => byCode(a, b)));
  return { dates, rows, totalsByKind: sortedKinds, totalsByDate, grandTotal: rows.reduce((n, r) => n + r.count, 0), note: VC_GAP_NOTE };
}

// ---------------------------------------------------------------------------
// Fixture + KB gaps loaders
// ---------------------------------------------------------------------------

export const CoverageFixtureSchema = z.object({
  schemaVersion: z.literal(1),
  /** "synthetic" proves the report only; "recorded" is a read-only capture of the live KB (not available yet: G-KB open). */
  source: z.enum(["synthetic", "recorded"]),
  recordedAt: z.string(),
  countries: z.array(z.string().min(1)).optional(),
  themes: z.array(z.string().min(1)).optional(),
  probes: z.array(z.object({ id: z.string().min(1), country: z.string().min(1), theme: z.string().min(1), query: z.string().min(1) })),
  /** Recorded hits are parsed down to {score, session.date}: turn text is stripped on load. */
  search: z.array(z.object({ query: z.string(), hits: z.array(HitSchema) })),
  /** Stand-in for the VC `chat_gap_counts` collection behind the injected port. */
  vcGapCounts: z.array(z.object({ date: z.string(), kind: z.string().min(1), count: z.number() })).default([]),
});
export type CoverageFixture = z.infer<typeof CoverageFixtureSchema>;

function issues(label: string, error: z.ZodError): string {
  return `${label}: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
}

export function parseCoverageFixture(raw: string, label: string): CoverageFixture {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: invalid JSON (${(err as Error).message})`);
  }
  if (typeof json === "object" && json !== null && (json as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error(`${label}: unsupported schemaVersion ${String((json as { schemaVersion?: unknown }).schemaVersion)} (expected 1)`);
  }
  const parsed = CoverageFixtureSchema.safeParse(json);
  if (!parsed.success) throw new Error(issues(label, parsed.error));
  return parsed.data;
}

export function loadCoverageFixture(path: string): CoverageFixture {
  return parseCoverageFixture(readFileSync(path, "utf-8"), path);
}

/** The roster: the fixture's explicit lists, else the countries/themes the probes name. */
export function rosterOf(fixture: CoverageFixture): { countries: string[]; themes: string[] } {
  return {
    countries: fixture.countries ?? uniqueSorted(fixture.probes.map((p) => p.country)),
    themes: fixture.themes ?? uniqueSorted(fixture.probes.map((p) => p.theme)),
  };
}

/** Frozen-fixture lookup: the recorded hits for an exact (trimmed) probe query, or undefined if never recorded. */
export function fixtureCoverageSearch(fixture: CoverageFixture): CoverageSearchFn {
  const table = new Map<string, CoverageHit[]>();
  for (const entry of fixture.search) {
    const key = entry.query.trim();
    if (table.has(key)) throw new Error(`coverage fixture: query recorded twice ("${key}")`);
    table.set(key, entry.hits);
  }
  return async (query) => table.get(query.trim());
}

/** The fixture-backed stand-in for `listGapCounts`: same rows, same date filter, same kind ordering. */
export function fixtureGapCounts(fixture: CoverageFixture): GapCountsPort {
  return async ({ date }) =>
    fixture.vcGapCounts
      .filter((r) => r.date === date)
      .map((r) => ({ date: r.date, kind: r.kind as GapCountRow["kind"], count: r.count }))
      .sort((x, y) => x.kind.localeCompare(y.kind));
}

const KbGapsFileSchema = z.object({
  gaps: z.array(
    z.object({
      _id: z.string().optional(),
      kind: z.string().min(1),
      status: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
});

/** KB `/gaps` rows (id, kind, status, description). A row missing a field keeps null there so the hole is visible. */
export function parseKbGaps(raw: string, label: string): KbGapsSnapshot {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: invalid JSON (${(err as Error).message})`);
  }
  const parsed = KbGapsFileSchema.safeParse(json);
  if (!parsed.success) throw new Error(issues(label, parsed.error));
  return { source: label, rows: parsed.data.gaps.map((g) => ({ id: g._id ?? null, kind: g.kind, status: g.status ?? null, description: g.description ?? null })) };
}

export function loadKbGaps(path: string, label: string): KbGapsSnapshot {
  return parseKbGaps(readFileSync(path, "utf-8"), label);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const cellText = (v: string | null): string => (v === null ? "(none)" : v.replace(/\|/g, "\\|").replace(/\r?\n/g, " "));

export function toCoverageMarkdown(report: CoverageReport): string {
  const t = report.totals;
  const lines: string[] = [];
  lines.push("# Coverage report (A17)");
  lines.push("");
  lines.push(
    `Mode: \`${report.mode}\` · Fixture source: \`${report.fixtureSource}\` · As of: ${report.asOf} · Stale after ${report.staleAfterMonths} months · A hit counts at score >= ${report.scoreThreshold}`,
  );
  if (report.fixtureSource === "synthetic") {
    lines.push("");
    lines.push("> Synthetic fixture: this proves the report only. Real breadth is NOT PROVEN until the counsellor team supplies the country x theme probe list (Q-U11-2) and a recorded KB capture exists (G-KB).");
  }
  lines.push("");
  lines.push(
    `Cells: ${t.cells} · answered ${t.answered} · unanswered ${t.unanswered} · unrecorded ${t.unrecorded} · no probe ${t.noProbe} · hits ${t.hitCount} (stale ${t.staleCount}, date_unknown ${t.dateUnknownCount})`,
  );
  lines.push("");
  lines.push(`No-answer countries: ${t.noAnswerCountries.length === 0 ? "none" : t.noAnswerCountries.join(", ")}`);
  lines.push("");
  lines.push(`No-answer themes: ${t.noAnswerThemes.length === 0 ? "none" : t.noAnswerThemes.join(", ")}`);
  lines.push("");
  lines.push("## Countries");
  lines.push("");
  lines.push("| Country | Cells | Answered | Gap cells | Hits | Stale | date_unknown | No answer |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const c of report.countries) {
    lines.push(`| ${cellText(c.country)} | ${c.cells} | ${c.answered} | ${c.unanswered} | ${c.hitCount} | ${c.staleCount} | ${c.dateUnknownCount} | ${c.noAnswer ? "**GAP**" : "no"} |`);
  }
  lines.push("");
  lines.push("## Themes");
  lines.push("");
  lines.push("| Theme | Cells | Answered | Gap cells | Hits | Stale | date_unknown | No answer |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const th of report.themes) {
    lines.push(`| ${cellText(th.theme)} | ${th.cells} | ${th.answered} | ${th.unanswered} | ${th.hitCount} | ${th.staleCount} | ${th.dateUnknownCount} | ${th.noAnswer ? "**GAP**" : "no"} |`);
  }
  lines.push("");
  lines.push("## Probes (country x theme)");
  lines.push("");
  lines.push("| Country | Theme | Probe | Status | Hits | Below threshold | Fresh | Stale | date_unknown | Unanswered |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of report.probes) {
    lines.push(
      `| ${cellText(r.country)} | ${cellText(r.theme)} | ${cellText(r.probeId)} | ${r.status} | ${r.hitCount} | ${r.belowThresholdCount} | ${r.freshCount} | ${r.staleCount} | ${r.dateUnknownCount} | ${r.unanswered ? "**yes**" : "no"} |`,
    );
  }
  lines.push("");
  lines.push(`## KB /gaps (knowledge-health gaps) · source \`${report.kbGaps.source}\``);
  lines.push("");
  if (report.kbGaps.rows.length === 0) lines.push("none");
  else {
    lines.push("| Id | Kind | Status | Description |");
    lines.push("|---|---|---|---|");
    for (const g of report.kbGaps.rows) lines.push(`| ${cellText(g.id)} | ${cellText(g.kind)} | ${cellText(g.status)} | ${cellText(g.description)} |`);
  }
  lines.push("");
  lines.push("## VC gap counts (authenticated mode, text-free)");
  lines.push("");
  lines.push(report.vcGaps.note);
  lines.push("");
  if (report.vcGaps.dates.length === 0) lines.push("No dates requested.");
  else {
    lines.push(`Dates: ${report.vcGaps.dates.join(", ")} · Total: ${report.vcGaps.grandTotal}`);
    lines.push("");
    lines.push("| Kind | Total |");
    lines.push("|---|---|");
    for (const [kind, n] of Object.entries(report.vcGaps.totalsByKind)) lines.push(`| ${cellText(kind)} | ${n} |`);
    lines.push("");
    lines.push("| Date | Total |");
    lines.push("|---|---|");
    for (const [date, n] of Object.entries(report.vcGaps.totalsByDate)) lines.push(`| ${date} | ${n} |`);
  }
  lines.push("");
  return lines.join("\n");
}
