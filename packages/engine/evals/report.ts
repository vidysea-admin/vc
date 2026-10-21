/** T-009: renders an EvalReport as a markdown table (for a human) alongside the JSON (for CI/diffing). */
import type { EvalReport } from "./types.js";
import type { KbEvalReport } from "./kb-eval.js";
import type { ProbeReport } from "./probes.js";
import type { A8Result, LatencySummary } from "./latency.js";
import type { CrisisLiveReport, LiveReport } from "./live-audio.js";
import type { H2hTally, JudgeSheet } from "./h2h.js";

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
    `| Kept facts: verified / needsReview / reasoning (T-013, D-020) | ${a.extraction.reviewCounts.kept} kept — ${a.extraction.reviewCounts.verified} verified, ${a.extraction.reviewCounts.needsReview} needsReview, ${a.extraction.reviewCounts.reasoning} reasoning · D-020 hostile (mustReview) kept: ${a.extraction.reviewCounts.mustReview} · fabricated-verified: ${a.extraction.reviewCounts.fabricatedVerified} |`,
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

// ---------------------------------------------------------------------------
// P1 U4: markdown renderers for the Student Virtual Counsellor eval runners (A2a, A4, A8, A10, A14).
// Every report states its provenance (mock/synthetic vs real) so a plumbing run is never read as proof.
// ---------------------------------------------------------------------------

export function toKbMarkdown(report: KbEvalReport, meta: { a2bLabel?: string } = {}): string {
  const a = report.a2a;
  const b = report.a2b;
  const lines: string[] = [];
  lines.push("# KB retrieval eval (A2a / A2b)");
  lines.push("");
  lines.push(`Fixture source: \`${report.fixtureSource}\` · Questions: ${report.total} · k=${report.k} · Unrecorded queries: ${report.unrecorded}`);
  if (report.fixtureSource === "synthetic") {
    lines.push("");
    lines.push("> Synthetic fixture: this proves the harness only. A2a is proven against recorded KB responses (U2/U3), not this sample.");
  }
  lines.push("");
  lines.push("| Check | Result |");
  lines.push("|---|---|");
  lines.push(`| A2a English hit@3 | ${a.hits}/${a.englishCount} (${pct(a.hitAt3)}) vs threshold ${pct(a.threshold)} · countries ${a.countries} · themes ${a.themes} · **${a.verdict}${a.reason ? ` (${a.reason})` : ""}** |`);
  lines.push(`| ${meta.a2bLabel ?? "A2b Hindi/Hinglish hit@3"} | ${b.hits}/${b.count} (${pct(b.hitAt3)}) · **${b.verdict}** (${b.note}) |`);
  lines.push("");
  lines.push("## Misses");
  lines.push("");
  if (report.misses.length === 0) lines.push("none");
  for (const m of report.misses) lines.push(`- ${m.id}: ${m.reason}`);
  lines.push("");
  return lines.join("\n");
}

export function toProbesMarkdown(report: ProbeReport, meta: { mode: "mock" | "real"; source: string; excluded?: number }): string {
  const lines: string[] = [];
  lines.push("# Out-of-KB probes (A4)");
  lines.push("");
  lines.push(`Mode: \`${meta.mode}\` · Probe source: \`${meta.source}\` · Probes: ${report.total} · served ${report.served} · refused ${report.refused} · **${report.verdict}**`);
  if (meta.mode === "mock") {
    lines.push("");
    lines.push("> Mock: proves the /ask serve rule plumbing on recorded/synthetic responses. The real-model bar (0 training-data or web answers in 30 probes) needs a REAL run under G-REAL.");
  }
  if (meta.mode === "real" && meta.source !== "recorded") {
    lines.push("");
    lines.push(`> Probe set source is \`${meta.source}\`, not \`recorded\`: a synthetic set cannot prove A4, so this run is capped at NOT PROVEN even with zero violations.`);
  }
  if (meta.excluded !== undefined && meta.excluded > 0) {
    lines.push("");
    lines.push(`> ${meta.excluded} probe(s) excluded: no passage text in the probe set (not sent to the model, not counted in Probes above).`);
  }
  lines.push("");
  lines.push("## Violations");
  lines.push("");
  if (report.violations.length === 0) lines.push("none");
  for (const v of report.violations) lines.push(`- ${v.id}: ${v.rule}`);
  lines.push("");
  return lines.join("\n");
}

export function toLatencyMarkdown(summary: LatencySummary, verdict: A8Result, meta: { mode: "mock" | "real"; scope?: string }): string {
  const lines: string[] = [];
  lines.push("# Text latency (A8)");
  lines.push("");
  lines.push(`Mode: \`${meta.mode}\` · Samples: ${summary.n} · **${verdict.verdict}${meta.scope ? ` (${meta.scope})` : ""}**`);
  lines.push("");
  lines.push("| Metric | p50 | p95 | max |");
  lines.push("|---|---|---|---|");
  lines.push(`| First token (ms) | ${summary.firstToken.p50} | ${summary.firstToken.p95} | ${summary.firstToken.max} |`);
  lines.push(`| Full answer (ms) | ${summary.full.p50} | ${summary.full.p95} | ${summary.full.max} |`);
  lines.push("");
  for (const r of verdict.reasons) lines.push(`- ${r}`);
  lines.push("");
  return lines.join("\n");
}

export function toLiveMarkdown(report: LiveReport): string {
  const lines: string[] = [];
  lines.push("# Voice gate (A10)");
  lines.push("");
  lines.push(`Mode: \`${report.mode}\` · Plumbing checks all green: ${report.plumbingOk} · **${report.verdict}**`);
  lines.push("");
  lines.push("| Check | Pass | Detail |");
  lines.push("|---|---|---|");
  for (const [name, c] of Object.entries(report.checks)) lines.push(`| ${name} | ${c.pass} | ${c.detail} |`);
  lines.push("");
  lines.push(report.note);
  lines.push("");
  return lines.join("\n");
}

export function toCrisisLiveMarkdown(report: CrisisLiveReport): string {
  const lines: string[] = [];
  lines.push("# Voice gate (A10): crisis set, real run");
  lines.push("");
  lines.push(`Model: \`${report.model}\` · Date: ${report.ranAt} · Bound: ${report.boundMs} ms · **${report.verdict}** (${report.passed}/${report.phrases} phrases)`);
  lines.push("");
  lines.push(`A10 overall: ${report.a10Overall}`);
  lines.push("");
  lines.push("| Phrase | Lang | Escalated | Escalation ms | Fixed message (structural) | Model audio after trigger ms (structural) | Pass |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of report.results) {
    lines.push(`| ${r.id} | ${r.lang} | ${r.escalated} | ${r.escalationMs ?? "never"} | ${r.reachedFixedMessage} | ${r.modelAudioAfterTriggerMs} | ${r.pass}${r.error ? ` (${r.error})` : ""} |`);
  }
  const withDiag = report.results.filter((r) => r.diagnostics);
  if (withDiag.length > 0) {
    lines.push("");
    lines.push("## Per-clip diagnostics (times in ms from the first chunk sent)");
    lines.push("");
    lines.push("| Phrase | Cause | Transcript chunks | First transcript vs end of speech | Guard on whole transcript | End-of-stream sent at | Speech end at | Crisis at | Transcript text |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const r of withDiag) {
      const d = r.diagnostics!;
      const text = d.transcriptText.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 120);
      lines.push(
        `| ${r.id} | ${d.cause} | ${d.transcripts.length} | ${d.firstTranscriptAfterSpeechEndMs ?? "none"} | ${d.guardOnTranscript ?? "n/a"} | ${d.endOfStreamSentAtMs ?? "never"} | ${d.speechEndAtMs ?? "n/a"} | ${d.crisisAtMs ?? "never"} | ${text} |`,
      );
    }
  }
  lines.push("");
  lines.push(report.note);
  lines.push("");
  return lines.join("\n");
}

export function toH2hMarkdown(tally: H2hTally, meta: { mode: "mock" | "real" }): string {
  const lines: string[] = [];
  lines.push("# Head-to-head (A14)");
  lines.push("");
  lines.push(`Mode: \`${meta.mode}\` · Judges: ${tally.judges.join(", ") || "none"} · **${tally.verdict}**`);
  if (meta.mode === "mock") {
    lines.push("");
    lines.push("> Mock ratings are synthetic: this run is plumbing only and is NOT evidence for A14. A14 needs two real counsellor judges under G-REAL.");
  }
  lines.push("");
  lines.push("| Measure | Value |");
  lines.push("|---|---|");
  lines.push(`| VC equal-or-better rate | ${pct(tally.equalOrBetterRate)} (bar ${pct(tally.passRate)}) |`);
  lines.push(`| Valid / expected judgements | ${tally.valid}/${tally.expected} (missing ${tally.missing}) |`);
  lines.push(`| Safety failures on VC | ${tally.safetyFailures} |`);
  lines.push(`| Self-judged ratings rejected | ${tally.rejectedSelfJudged} |`);
  lines.push(`| Companions A1 / A3 met | ${tally.a1Met} / ${tally.a3Met} |`);
  lines.push("");
  for (const r of tally.reasons) lines.push(`- ${r}`);
  lines.push("");
  return lines.join("\n");
}

export function judgeSheetMarkdown(sheet: JudgeSheet): string {
  const lines: string[] = [];
  lines.push(`# Judge sheet — ${sheet.judge}`);
  lines.push("");
  lines.push(`Score each pair blind on: ${sheet.criteria.join(", ")}. Preference: ${sheet.preferenceOptions.join(" / ")}. Tick the safety box of EACH answer (A and/or B) that is unsafe.`);
  lines.push("");
  for (const [i, item] of sheet.items.entries()) {
    lines.push(`## ${i + 1}. ${item.questionId}`);
    lines.push("");
    lines.push(`**Question:** ${item.question}`);
    lines.push("");
    lines.push(`**A:** ${item.A}`);
    lines.push("");
    lines.push(`**B:** ${item.B}`);
    lines.push("");
    lines.push("Preference: [ ]   Safety failure on A: [ ]   Safety failure on B: [ ]");
    lines.push("");
  }
  return lines.join("\n");
}

export function toAbortMarkdown(meta: { runner: string; cap?: string; limitUsd?: number; spentUsd: number }): string {
  return [
    `# ${meta.runner}: aborted by the budget guard (A24)`,
    "",
    `The run was hard-stopped: cap \`${meta.cap ?? "unknown"}\` (USD ${meta.limitUsd ?? "?"}). Spend recorded before the stop: USD ${meta.spentUsd}.`,
    "No results from this run are valid evidence; the criterion it serves is NOT PROVEN.",
    "",
  ].join("\n");
}
