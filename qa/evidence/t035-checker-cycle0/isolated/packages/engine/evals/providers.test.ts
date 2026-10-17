/** T-009: the scripted-provider factories themselves — the shared source of truth `score.ts` also
 *  reads from (candidatesForMode), so a bug here would silently corrupt every scorer test. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "./dataset.js";
import { candidatesForMode, buildScribeProvider } from "./providers.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");

test("lazy mode proposes zero candidates for every session, regardless of gold facts", () => {
  const sessions = loadDataset(DATASET_PATH);
  for (const s of sessions) {
    assert.deepEqual(candidatesForMode(s, "lazy"), []);
  }
});

test("perfect mode proposes exactly one candidate per gold fact, with the gold quote untouched", () => {
  const sessions = loadDataset(DATASET_PATH);
  const withFacts = sessions.find((s) => s.goldFacts.length > 0)!;
  const candidates = candidatesForMode(withFacts, "perfect");
  assert.equal(candidates.length, withFacts.goldFacts.length);
  for (const [i, gf] of withFacts.goldFacts.entries()) {
    const c = candidates[i] as { key: string; value: unknown; source: { quote: string; turnId: string } };
    assert.equal(c.key, gf.key);
    assert.deepEqual(c.value, gf.value);
    assert.equal(c.source.quote, gf.quote);
    assert.equal(c.source.turnId, gf.turnId);
  }
});

test("fabricator mode never reproduces the gold quote verbatim, for every gold fact in the dataset", () => {
  const sessions = loadDataset(DATASET_PATH);
  for (const s of sessions) {
    const candidates = candidatesForMode(s, "fabricator") as { source: { quote: string } }[];
    for (const [i, gf] of s.goldFacts.entries()) {
      const quote = candidates[i]!.source.quote;
      assert.notEqual(quote, gf.quote, `${s.id}/${gf.key}: fabricated quote must differ from the gold quote`);
      assert.match(quote, /roughly speaking/);
    }
  }
});

test("case-drift mode upper-cases the quote text", () => {
  const sessions = loadDataset(DATASET_PATH);
  const withFacts = sessions.find((s) => s.goldFacts.length > 0)!;
  const gf = withFacts.goldFacts[0]!;
  const candidate = candidatesForMode(withFacts, "case-drift")[0] as { source: { quote: string } };
  assert.equal(candidate.source.quote, gf.quote.toUpperCase());
});

test("buildScribeProvider wires the exact candidatesForMode() output into the fact-extraction skill", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const withFacts = sessions.find((s) => s.goldFacts.length > 0)!;
  const provider = buildScribeProvider(withFacts, "perfect");
  const { z } = await import("zod");
  const out = await provider.generate({
    skillName: "fact-extraction",
    skillPrompt: "irrelevant for a mock",
    outputSchema: z.object({ facts: z.array(z.unknown()) }),
    input: {},
  });
  assert.deepEqual(out.facts, candidatesForMode(withFacts, "perfect"));
});
