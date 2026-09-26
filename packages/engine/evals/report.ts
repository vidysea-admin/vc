/** T-009: renders an EvalReport as a markdown table (for a human) alongside the JSON (for CI/diffing). */
import type { EvalReport } from "./types.js";

function pct(n: number | null): string {
  return n === null ? "n/a" : `${(n * 100).toFixed(1)}%`;
}

export function toMarkdown(report: EvalReport): string {
  const a = report.aggregate;
  const lines: string[] = [];
  lines.push(`# Scribe eval report`);
  lines.push("");
  lines.push(`Provider mode: \`${report.providerMode}\` · Dataset: \`${report.datasetPath}\` · Sessions: ${a.sessionCount} · Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Crisis/concern routing accuracy | ${a.crisisRouting.correct}/${a.crisisRouting.total} (${pct(a.crisisRouting.accuracy)}) |`);
  lines.push(`| Citation precision (non-fabricated / claimed) | ${pct(a.extraction.citationPrecision)} |`);
  lines.push(`| Extraction recall (gold facts found) | ${a.extraction.recalledTotal}/${a.extraction.goldFactTotal} (${pct(a.extraction.recall)}) |`);
  lines.push(
    `| False drops (true quote, wrongly dropped) | case: ${a.extraction.falseDropCounts.caseMismatch} · punctuation: ${a.extraction.falseDropCounts.punctuationMismatch} · both: ${a.extraction.falseDropCounts.caseAndPunctuationMismatch} |`,
  );
  lines.push(`| Multi-turn-span recall | ${a.extraction.multiTurn.recalledCount}/${a.extraction.multiTurn.goldCount} (${pct(a.extraction.multiTurn.recall)}) |`);
  lines.push(`| Summary script-like leakage (B1) | ${a.summary.scriptLikeLeaks}/${a.summary.scored} sessions |`);
  lines.push(`| Summary checklist coverage | ${pct(a.summary.checklistCoverage)} |`);
  lines.push(
    `| Kept facts: verified / needsReview / reasoning (T-013, D-020) | ${a.extraction.reviewCounts.kept} kept — ${a.extraction.reviewCounts.verified} verified, ${a.extraction.reviewCounts.needsReview} needsReview, ${a.extraction.reviewCounts.reasoning} reasoning · fabricated-verified: ${a.extraction.reviewCounts.fabricatedVerified} |`,
  );
  lines.push("");
  lines.push(`## Citation classification (raw candidates)`);
  lines.push("");
  lines.push(`| verbatim | case-mismatch | punctuation-mismatch | case-and-punct-mismatch | fabricated | malformed |`);
  lines.push(`|---|---|---|---|---|---|`);
  const c = a.extraction.citationCounts;
  lines.push(`| ${c.verbatim} | ${c["case-mismatch"]} | ${c["punctuation-mismatch"]} | ${c["case-and-punctuation-mismatch"]} | ${c.fabricated} | ${c.malformed} |`);
  lines.push("");
  lines.push(`## Per-session`);
  lines.push("");
  lines.push(`| Session | Strata | Crisis: exp/act | Recall | False drops | Script leak |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const s of report.sessions) {
    const recall = s.extraction ? `${s.extraction.recalledCount}/${s.extraction.goldFactCount}` : "n/a (escalated)";
    const falseDrops = s.extraction ? String(s.extraction.falseDrops.length) : "n/a";
    const scriptLeak = s.summary ? String(s.summary.scriptLike) : "n/a";
    lines.push(`| ${s.sessionId} | ${s.strata.join(", ")} | ${s.crisis.expected}/${s.crisis.actual} | ${recall} | ${falseDrops} | ${scriptLeak} |`);
  }
  lines.push("");
  return lines.join("\n");
}
