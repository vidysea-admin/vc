#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:h2h [--golden=<jsonl>] [--fixture=<json>] [--seed=<s>] [--out=<dir>] [--real]`
 * (spec A14 plumbing). Mock mode: VC answers come from the frozen KB fixture, expert answers and
 * judge ratings are SYNTHETIC, so the tally is plumbing only. It writes the blind pairs (no origin),
 * the secret key, one judge sheet per judge and the report. `--real` refuses without VC_G_REAL=1 and
 * runs under the A24 budget guard.
 */
import { fileURLToPath } from "node:url";
import { DEFAULT_GOLDEN_SET, DEFAULT_KB_FIXTURE, p1Main, runRealPath, writeP1File, writeP1Report, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
import { fixtureSearch, loadGoldenSet, loadKbFixture } from "./dataset.js";
import { buildBlindPairs, buildJudgeSheets, buildKeyFile, resolveH2hSeed, tallyH2h, type ExpertAnswer, type H2hRating } from "./h2h.js";
import { judgeSheetMarkdown, toH2hMarkdown } from "./report.js";

const MOCK_AUTHORS = ["author-1", "author-2"];
const MOCK_JUDGES = ["judge-1", "judge-2"];

export async function runH2h(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-h2h", "h2h", args, deps);
  const golden = loadGoldenSet(args.golden ?? DEFAULT_GOLDEN_SET);
  const fixture = loadKbFixture(args.fixture ?? DEFAULT_KB_FIXTURE);
  const questions = golden.map((g) => ({ id: g.id, question: g.question }));
  const vcAnswers: Record<string, string> = {};
  for (const g of golden) {
    const top = [...(fixtureSearch(fixture, g.question) ?? [])].sort((a, b) => b.score - a.score)[0];
    vcAnswers[g.id] = top ? `[mock answer] ${top.turn.text}` : "[mock answer] no sourced answer yet";
  }
  const experts: ExpertAnswer[] = golden.map((g, i) => ({ questionId: g.id, text: `[mock answer] reference for ${g.id}`, author: MOCK_AUTHORS[i % MOCK_AUTHORS.length]! }));
  const resolved = resolveH2hSeed({ real: false, ...(args.seed !== undefined ? { seed: args.seed } : {}) });
  const { pairs, key } = buildBlindPairs(questions, vcAnswers, experts, resolved.seed);
  const sheets = buildJudgeSheets(pairs, experts, MOCK_JUDGES, resolved.seed);

  const files: string[] = [];
  files.push(writeP1File(args.outDir, "h2h-pairs.json", `${JSON.stringify(pairs, null, 2)}\n`));
  files.push(writeP1File(args.outDir, "h2h-key.json", `${JSON.stringify(buildKeyFile(resolved, key), null, 2)}\n`));
  for (const sheet of sheets) {
    files.push(writeP1File(args.outDir, `h2h-judge-sheet-${sheet.judge}.json`, `${JSON.stringify(sheet, null, 2)}\n`));
    files.push(writeP1File(args.outDir, `h2h-judge-sheet-${sheet.judge}.md`, judgeSheetMarkdown(sheet)));
  }

  // SYNTHETIC ratings: every judge prefers VC on 13 of every 20 questions. Plumbing only.
  const ratings: H2hRating[] = [];
  for (const judge of MOCK_JUDGES) {
    for (const [i, k] of key.entries()) {
      const prefersVc = i % 20 < 13;
      ratings.push({ judge, questionId: k.questionId, preference: prefersVc ? k.vcSide : k.vcSide === "A" ? "B" : "A", safetyA: false, safetyB: false });
    }
  }
  const tally = tallyH2h(key, ratings, {
    judges: MOCK_JUDGES,
    a1Met: true, // mock assumption; a real run reads the A1/A3 REAL reports
    a3Met: true,
    authorsByQuestion: Object.fromEntries(experts.map((e) => [e.questionId, e.author])),
  });
  const markdown = toH2hMarkdown(tally, { mode: "mock" });
  files.push(...writeP1Report(args.outDir, "h2h", { mode: "mock", note: "synthetic ratings, plumbing only", tally }, markdown));
  return { runner: "run-h2h", mode: "mock", status: "completed", report: tally, markdown, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runH2h);
