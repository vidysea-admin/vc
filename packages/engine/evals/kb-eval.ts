/**
 * P1 U4 / A2a (and the A2b measurement): Hit@3 over a golden question set, scored on KB `/search`
 * turn hits (expected turn or session in the top 3). Runs against a frozen fixture of recorded KB
 * responses (no network); the live-KB smoke is a separate, later step.
 *
 * Verdict rules (spec A2a): hit@3 >= 0.95 on the English questions; with fewer than 45 English
 * questions, or fewer than 10 countries / 5 themes among them, a good rate is NOT PROVEN (the
 * achieved number is still reported). A2b (Hindi/Hinglish) depends on an engine query-rewrite a
 * frozen fixture cannot exercise, so it is always NOT PROVEN here and only measurable with --real.
 */
import type { GoldenQuestion, KbHit } from "./dataset.js";

export const A2A_THRESHOLD = 0.95;
export const A2A_MIN_ENGLISH = 45;
export const A2A_MIN_COUNTRIES = 10;
export const A2A_MIN_THEMES = 5;

export type KbSearchFn = (query: string) => Promise<KbHit[] | undefined>;

export interface KbMiss {
  id: string;
  reason: "miss" | "unrecorded";
}

export interface KbEvalReport {
  k: number;
  fixtureSource: string;
  total: number;
  unrecorded: number;
  misses: KbMiss[];
  a2a: {
    englishCount: number;
    hits: number;
    hitAt3: number;
    threshold: number;
    countries: number;
    themes: number;
    breadthProven: boolean;
    verdict: "PASS" | "FAIL" | "NOT PROVEN";
  };
  a2b: {
    count: number;
    hits: number;
    hitAt3: number;
    verdict: "NOT PROVEN";
    note: string;
  };
}

function isHit(q: GoldenQuestion, hits: KbHit[], k: number): boolean {
  const turns = new Set(q.expectedTurnIds);
  const sessions = new Set(q.expectedSessionIds);
  // rank by score (stable: array order breaks ties) rather than trusting array order
  const ranked = hits
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.score - a.h.score || a.i - b.i)
    .slice(0, k);
  return ranked.some(({ h }) => turns.has(h.turnId) || sessions.has(h.sessionId));
}

export async function scoreKbEval(
  questions: readonly GoldenQuestion[],
  search: KbSearchFn,
  options: { fixtureSource: string; k?: number },
): Promise<KbEvalReport> {
  const k = options.k ?? 3;
  const misses: KbMiss[] = [];
  let unrecorded = 0;
  const outcome = new Map<string, boolean>();
  for (const q of questions) {
    const hits = await search(q.question);
    if (hits === undefined) {
      unrecorded += 1;
      misses.push({ id: q.id, reason: "unrecorded" });
      outcome.set(q.id, false);
      continue;
    }
    const ok = isHit(q, hits, k);
    outcome.set(q.id, ok);
    if (!ok) misses.push({ id: q.id, reason: "miss" });
  }

  const english = questions.filter((q) => q.lang === "en");
  const other = questions.filter((q) => q.lang !== "en");
  const enHits = english.filter((q) => outcome.get(q.id)).length;
  const otherHits = other.filter((q) => outcome.get(q.id)).length;
  const countries = new Set(english.map((q) => q.country)).size;
  const themes = new Set(english.map((q) => q.theme)).size;
  const hitAt3 = english.length === 0 ? 0 : enHits / english.length;
  const breadthProven = countries >= A2A_MIN_COUNTRIES && themes >= A2A_MIN_THEMES;
  let verdict: KbEvalReport["a2a"]["verdict"];
  if (english.length === 0) verdict = "NOT PROVEN";
  else if (hitAt3 < A2A_THRESHOLD) verdict = "FAIL";
  else verdict = english.length >= A2A_MIN_ENGLISH && breadthProven ? "PASS" : "NOT PROVEN";

  return {
    k,
    fixtureSource: options.fixtureSource,
    total: questions.length,
    unrecorded,
    misses,
    a2a: { englishCount: english.length, hits: enHits, hitAt3, threshold: A2A_THRESHOLD, countries, themes, breadthProven, verdict },
    a2b: {
      count: other.length,
      hits: otherHits,
      hitAt3: other.length === 0 ? 0 : otherHits / other.length,
      verdict: "NOT PROVEN",
      note: "Hindi/Hinglish retrieval depends on an engine query-rewrite to English that a frozen fixture cannot exercise; A2b is REAL-only (G-REAL).",
    },
  };
}
