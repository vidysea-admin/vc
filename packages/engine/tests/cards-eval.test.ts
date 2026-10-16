/**
 * T-010: the offline cards eval (qa/evals/cards-eval.jsonl). Each row is one planner candidate and
 * the Verifier outcome it must get in a fixed synthetic context:
 *   - hostile_script (B1): lines to recite, in English and Hinglish — must be dropped "script_like";
 *   - uncited_or_fabricated (B2): no source, or a source that does not resolve in this run;
 *   - known_fact_repeat / india_only_visa / do_not_ask / urgency_mismatch (B18);
 *   - control_keep: good cards that MUST survive (so a Verifier that drops everything fails too).
 * Prints the per-category pass numbers for the evidence manifest and asserts 100% on every category.
 * Same-author caveat (as crisis-eval): the rows were written by the author of the rules they probe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildEvidenceIndex, buildRelevanceContext, verifyCards, type KnownFact } from "../src/cards/index.js";
import type { ScribeTurn } from "../src/scribe/schemas.js";
import { NOW, SESSION_ID, UK_FACTS, UK_TURNS, factDoc, turn } from "./cards-fixtures.js";

const DATASET = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "qa", "evals", "cards-eval.jsonl");

interface Row {
  id: string;
  category: string;
  context: "uk" | "india" | "long";
  card: unknown;
  expected: string;
  note?: string;
}

const asKnown = (docs: ReturnType<typeof factDoc>[]): KnownFact[] =>
  docs.map(({ _id, studentId: _s, active: _a, ...f }) => ({ ...f, id: _id }) as KnownFact);

const CONTEXTS: Record<Row["context"], { facts: KnownFact[]; turns: ScribeTurn[] }> = {
  uk: { facts: asKnown([...UK_FACTS, factDoc("f-dna", "do_not_ask", ["father's job"])]), turns: UK_TURNS },
  india: {
    facts: asKnown([factDoc("f-dest", "targetCountry", "India"), UK_FACTS[1]!]),
    turns: [turn("t1", "student", "I only want to study in India, maybe Pune or Delhi.")],
  },
  long: { facts: asKnown([...UK_FACTS, factDoc("f-intake", "intake_year", "2029")]), turns: UK_TURNS },
};
const KB_IDS = ["kb-node-1", "https://example.edu/fees"];

function outcome(row: Row): string {
  const ctx = CONTEXTS[row.context];
  const out = verifyCards({
    sessionId: SESSION_ID,
    candidates: [row.card],
    evidence: buildEvidenceIndex(ctx.facts, ctx.turns, KB_IDS),
    relevance: buildRelevanceContext(ctx.facts, ctx.turns, NOW()),
  });
  return out.kept.length === 1 ? "kept" : (out.dropped[0]?.reason ?? "missing");
}

test("T-010 cards eval: every row gets its expected Verifier outcome (per-category pass numbers)", () => {
  const rows: Row[] = readFileSync(DATASET, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Row);
  assert.ok(rows.length >= 60, `dataset too small: ${rows.length}`);
  const byCat = new Map<string, { pass: number; total: number }>();
  const failures: string[] = [];
  for (const row of rows) {
    const got = outcome(row);
    const c = byCat.get(row.category) ?? { pass: 0, total: 0 };
    c.total += 1;
    if (got === row.expected) c.pass += 1;
    else failures.push(`${row.id} [${row.category}] expected ${row.expected}, got ${got}`);
    byCat.set(row.category, c);
  }
  const lines = [...byCat].map(([cat, c]) => `  ${cat}: ${c.pass}/${c.total}`);
  const pass = [...byCat.values()].reduce((a, c) => a + c.pass, 0);
  console.log(`CARDS-EVAL ${pass}/${rows.length}\n${lines.join("\n")}`);
  assert.deepEqual(failures, []);
});
