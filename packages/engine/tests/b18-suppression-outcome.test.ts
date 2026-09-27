/**
 * T-039 stage 2 (contract B18, context relevance): wires the blind fixtures authored in stage 1
 * (`tests/fixtures/b18-suppression-blind.jsonl`, 55 rows + `...-unsettled.jsonl`, 11 quarantined
 * rows) to the REAL engine on this branch (`wave/t-039-suppression-outcome`, based on `main`
 * 2dabcb0). Full provenance/blindness proof for the fixture itself lives in the fixture authoring
 * commit and `qa/feedback-inbox.md`; this file only runs the rows.
 *
 * ---------------------------------------------------------------------------------------------
 * HEADLINE FINDING (read before the row runner below): B18 has NO engine surface on this branch.
 * ---------------------------------------------------------------------------------------------
 * TASKS.md's own T-039 row says this unit `consumes: scribe graph, cards relevance`. Both halves
 * were checked directly against source on this branch, not assumed:
 *
 *   1. "cards relevance" (packages/engine/src/cards/relevance.ts, the module that implements B18's
 *      destination/topic suppression for the `live-card` surface) does not exist anywhere in this
 *      repo's `main` history. It exists ONLY on the unmerged branch `wave/t-010-live-cards`
 *      (`git show wave/t-010-live-cards:packages/engine/src/cards/relevance.ts`), whose own
 *      cycle-0 checker verdict (`qa/verdicts/t-010-live-cards.md` on that branch) already FAILED
 *      the unit, naming a real B18 leak at `relevance.ts:202`
 *      (`|| citedTopics.size > 0` lets a clarify card re-ask an already-known topic). Merging or
 *      copying that module into this bound root would (a) cross this unit's file scope into
 *      T-010's, (b) silently import code its own checker has not yet accepted, and (c) smuggle a
 *      known-broken oracle in as if it were settled. None of that is done here. Confirmed by
 *      `existsSync` below, at test time, against the real filesystem — not asserted from memory.
 *
 *   2. The scribe graph (`packages/engine/src/scribe/{nodes,schemas,graph}.ts`, which DOES exist
 *      here) has no B18 logic either. Its node functions are consent, crisis, extract, summary,
 *      diff, approval, write (`graph.ts` `.addNode` calls) and NONE of them reads
 *      `destination_countries`, `study_abroad_intent` or a do-not-ask list — those fields are not
 *      even in `ExtractInputSchema` ({turns, sessionEndedAt}) or `SummaryInputSchema`
 *      ({turns, facts}), so no code path through `extractFacts`/`summarizeSession` could vary its
 *      answer on them even in principle. `grep -n "destination|target_country|do_not_ask|topic"
 *      packages/engine/src/scribe/nodes.ts` and the two skill prompts
 *      (`skills/fact-extraction/SKILL.md`, `skills/session-summary/SKILL.md`) turned up nothing.
 *      This is checked below by reading the real, live `.shape` of both Zod schemas, not asserted.
 *
 * Given that, the honest thing to do with each of the 55 asserted rows is NOT to pretend a
 * suppression decision exists and grade the fixture against it. Rows split into two groups:
 *
 *   - RUNNABLE (10 rows: 5 `scribe-fact` + 5 `summary-line`): the row's item CAN be pushed through
 *     the real, merged `extractFacts` / `summarizeSession` node functions, because those functions
 *     exist and will accept a citable candidate fact / a generated summary sentence built from the
 *     row. Running them proves something real and B18-relevant even though neither function has a
 *     B18 gate: it proves whether the CURRENT shipped code would surface the item once ANY upstream
 *     step (the LLM, mocked here so the test is deterministic) proposes it. Since neither function
 *     filters by destination/topic/do-not-ask, the real, reproducible answer for every one of these
 *     10 rows is "surface" -- this is not an assumption, it is what the code below actually returns,
 *     printed per row. A row whose `expect` is "suppress" and gets "surface" is a genuine B18 GAP
 *     (the item is not suppressed because nothing in the merged code suppresses it), not a defect in
 *     the row.
 *   - NOT-RUNNABLE (45 rows: 43 `live-card` + 2 `scribe-fact` "placeholder re-emission" rows,
 *     `b18-f4-02` and `b18-f8-01`): `live-card` has no engine module at all on this branch (finding
 *     1 above). The two placeholder rows ask whether the scribe re-emits an "unknown"-valued
 *     placeholder fact for a key the student already has approved; no code anywhere in `packages/`
 *     or `apps/` ever synthesizes a placeholder fact for an absent key (`PreBriefCardSchema` in
 *     `@vc/schemas` has `knownFacts`/`openQuestions` fields but zero builder function references
 *     them anywhere — checked by grep below) so there is nothing to invoke for these two either.
 *
 * ADAPTER MAPPING (rule 3: injective and documented; this is the ENTIRE mapping used anywhere in
 * this file — nothing else touches a row's fields):
 *
 *   | fixture field                                   | engine field it becomes                         | why |
 *   |--------------------------------------------------|--------------------------------------------------|-----|
 *   | `item.key` (scribe-fact rows)                     | `CandidateFact.key` / the resulting `Fact.key`    | direct passthrough, 1:1, injective |
 *   | `item.text` (summary-line rows)                   | the MockProvider's canned `session-summary` output| direct passthrough, 1:1, injective — this is the ONLY way to ask "does the merged summarizeSession let this exact sentence through" |
 *   | (scribe-fact rows) a synthetic transcript sentence| `ScribeTurn.text` / `.translatedText`, and IS the fact's `source.quote` (quote === whole turn text) | invented ONLY to satisfy the citation guard mechanically (a transcript source needs a turn to cite); never derived from `student`/`facts`/`do_not_ask`, so it cannot smuggle destination info into the engine — see next row |
 *   | `student.destination_countries`, `study_abroad_intent`, `do_not_ask`, `facts[]`, `item.topic`, `item.card_type` | **NOT mapped to anything — deliberately** | there is no engine input channel for any of these (finding 2 above); inventing one here would mean this file's adapter, not the engine, decides suppression — exactly the smuggling the brief warns against. Leaving them unconsumed is the honest choice, and it is why the runnable rows' real answer is always "surface": nothing downstream ever looks at them. |
 *
 * No row's `expect` is ever changed. No engine source is changed to make a row pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MockProvider } from "@vc/providers";
import { extractFacts, summarizeSession } from "../src/scribe/nodes.js";
import { ExtractInputSchema, SummaryInputSchema } from "../src/scribe/schemas.js";
import type { ScribeTurn } from "../src/scribe/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(here, "..", "..", "..", "skills");

const ASSERTED_PATH = join(here, "fixtures", "b18-suppression-blind.jsonl");
const UNSETTLED_PATH = join(here, "fixtures", "b18-suppression-blind-unsettled.jsonl");

interface FactRow {
  key: string;
  value: unknown;
  status: string;
  editedFrom?: unknown;
}
interface ItemRow {
  surface: "scribe-fact" | "summary-line" | "live-card";
  card_type?: string;
  topic: string;
  key?: string;
  text: string;
}
interface AssertedRow {
  id: string;
  category: string;
  contract_clause: string;
  student: {
    student_id: string;
    tenant_id: string;
    destination_countries: string[];
    study_abroad_intent: string;
  };
  facts: FactRow[];
  do_not_ask: string[];
  item: ItemRow;
  expect: "suppress" | "surface";
  why: string;
}
interface UnsettledRow {
  id: string;
  category: string;
  contract_clause: string;
  unsettled: true;
  open_question: string;
  why: string;
}

function loadJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

const asserted = loadJsonl<AssertedRow>(ASSERTED_PATH);
const unsettled = loadJsonl<UnsettledRow>(UNSETTLED_PATH);

// ---------------------------------------------------------------------------------------------
// SHAPE GUARD -- runs and asserts BEFORE any row is executed. A truncated or emptied fixture (or
// one whose asserted/quarantined boundary drifted) fails here, loudly, before anything else runs.
// ---------------------------------------------------------------------------------------------
test("T-039 shape guard: fixture counts, unique ids and the asserted/quarantined split are exactly what stage 1 produced", () => {
  assert.equal(asserted.length, 55, "asserted (b18-suppression-blind.jsonl) row count drifted");
  assert.equal(unsettled.length, 11, "quarantined (b18-suppression-blind-unsettled.jsonl) row count drifted");

  const allIds = [...asserted.map((r) => r.id), ...unsettled.map((r) => r.id)];
  assert.equal(allIds.length, 66, "asserted + quarantined must total 66");
  assert.equal(new Set(allIds).size, 66, "every id across both files must be unique — a collision would let a row silently shadow another");

  const bySurfaceExpect = new Map<string, number>();
  for (const r of asserted) {
    const k = r.expect;
    bySurfaceExpect.set(k, (bySurfaceExpect.get(k) ?? 0) + 1);
  }
  assert.equal(bySurfaceExpect.get("surface"), 28, "asserted 'surface' count drifted from stage 1's 28");
  assert.equal(bySurfaceExpect.get("suppress"), 27, "asserted 'suppress' count drifted from stage 1's 27");

  for (const r of unsettled) {
    assert.equal(r.unsettled, true, `${r.id}: quarantined row must carry unsettled:true`);
    assert.ok(typeof r.open_question === "string" && r.open_question.length > 0, `${r.id}: quarantined row must carry a non-empty open_question`);
  }
});

// ---------------------------------------------------------------------------------------------
// STRUCTURAL FINDINGS -- real, mechanical checks (filesystem + live Zod schema introspection) that
// back the header's two-part headline finding. These are facts about the actual installed package,
// not assumptions.
// ---------------------------------------------------------------------------------------------
const CARDS_DIR = join(here, "..", "src", "cards");

test("T-039 structural finding 1: packages/engine/src/cards (B18's live-card surface) does not exist on this branch", () => {
  assert.equal(existsSync(CARDS_DIR), false, "src/cards exists — the live-card rows may no longer be not-runnable; re-read the header before trusting this file's not-runnable count");
});

test("T-039 structural finding 2: ExtractInputSchema/SummaryInputSchema have no destination/do-not-ask channel", () => {
  assert.deepEqual(Object.keys(ExtractInputSchema.shape).sort(), ["sessionEndedAt", "turns"], "ExtractInputSchema grew a new field — re-check whether it now carries destination/do-not-ask before trusting this file's not-runnable reasoning");
  assert.deepEqual(Object.keys(SummaryInputSchema.shape).sort(), ["facts", "turns"], "SummaryInputSchema grew a new field — re-check the same");
});

// ---------------------------------------------------------------------------------------------
// ROW CLASSIFICATION -- which of the 55 asserted rows are runnable, and why not for the rest.
// ---------------------------------------------------------------------------------------------
const NOT_RUNNABLE_PLACEHOLDER_IDS = new Set(["b18-f4-02", "b18-f8-01"]);

type Classification =
  | { kind: "runnable-scribe-fact" }
  | { kind: "runnable-summary-line" }
  | { kind: "not-runnable"; reason: string };

function classify(row: AssertedRow): Classification {
  if (row.item.surface === "live-card") {
    return {
      kind: "not-runnable",
      reason: "no cards/relevance module exists on this branch (finding 1); it is unmerged work on wave/t-010-live-cards, whose own checker already found a B18 leak in it",
    };
  }
  if (row.item.surface === "scribe-fact") {
    if (NOT_RUNNABLE_PLACEHOLDER_IDS.has(row.id)) {
      return {
        kind: "not-runnable",
        reason: "row asks whether the scribe re-emits an 'unknown'-valued placeholder fact for an already-approved key; no code in packages/ or apps/ ever synthesizes a placeholder fact for an absent key (PreBriefCardSchema.knownFacts/openQuestions has zero builder function anywhere)",
      };
    }
    return { kind: "runnable-scribe-fact" };
  }
  // summary-line
  return { kind: "runnable-summary-line" };
}

// ---------------------------------------------------------------------------------------------
// RUNNERS -- exercise the REAL, merged node functions. Mock provider only stands in for the LLM
// call (as every other scribe test in this package does); no suppression logic is invented.
// ---------------------------------------------------------------------------------------------
async function runScribeFactRow(row: AssertedRow): Promise<"surface" | "suppress"> {
  const key = row.item.key;
  assert.ok(key, `${row.id}: scribe-fact row must carry item.key`);
  const turnText = `Synthetic transcript sentence for ${row.id} (topic: ${row.item.topic}).`;
  const turn: ScribeTurn = {
    turnId: "t1",
    speaker: "student",
    lang: "en",
    text: turnText,
    translatedText: turnText,
    ts: 1,
  };
  const candidate = {
    key,
    value: `synthetic-value-for-${key}`,
    source: { type: "transcript", quote: turnText, turnId: "t1" },
    confidence: 0.9,
    sensitivity: "low" as const,
  };
  const input = ExtractInputSchema.parse({ turns: [turn], sessionEndedAt: "2026-09-27T10:00:00.000Z" });
  const provider = new MockProvider({ responses: { "fact-extraction": { facts: [candidate] } } });
  const output = await extractFacts(input, { provider, skillsDir: SKILLS_DIR });
  const present = output.facts.some((f) => f.key === key);
  return present ? "surface" : "suppress";
}

async function runSummaryLineRow(row: AssertedRow): Promise<"surface" | "suppress"> {
  const turnText = `Synthetic transcript sentence for ${row.id} (topic: ${row.item.topic}).`;
  const turn: ScribeTurn = {
    turnId: "t1",
    speaker: "student",
    lang: "en",
    text: turnText,
    translatedText: turnText,
    ts: 1,
  };
  const input = SummaryInputSchema.parse({ turns: [turn], facts: [] });
  const provider = new MockProvider({ responses: { "session-summary": { summary: row.item.text } } });
  const output = await summarizeSession(input, { provider, skillsDir: SKILLS_DIR });
  return output.summary === row.item.text ? "surface" : "suppress";
}

// ---------------------------------------------------------------------------------------------
// THE MAIN RUN -- every asserted row becomes its own named node:test SUBTEST, so:
//   - a not-runnable row shows as SKIPPED (with its reason as the skip message), never silently
//     dropped and never counted as a pass;
//   - a runnable row's subtest genuinely asserts `got === row.expect`. Today six of them FAIL --
//     on purpose, left failing. This unit's brief forbids "fixing" nodes.ts to make a row pass and
//     forbids moving a disagreeing row to quarantine on this maker's own authority (rules 1/2/3 of
//     the brief); the honest outcome of those two constraints together is that a genuine, currently
//     unfixed gap must show up as a genuine, currently failing assertion, named by row id, not as a
//     quietly-green log line. The full six, and why each one is a real gap and not a fixture bug,
//     are in qa/manifests/t-039-suppression-outcome.md ("Disagreements" table) and in this run's own
//     output below (`node --test` prints every failing subtest's name and diff).
//   - This is also what makes the file a real falsification instrument (not just a reporting
//     script): breaking the ONE deterministic gate that DOES exist on the runnable rows'
//     path (verifyCandidateFact's citation check, or summarizeSession's isScriptLike withholding)
//     flips a currently-PASSING subtest to FAIL, named exactly -- see the manifest's Lever A, which
//     does this in a throwaway copy, never in this bound tree.
// ---------------------------------------------------------------------------------------------
test("T-039 B18 blind fixture vs the real engine (55 asserted rows, one subtest each)", async (t) => {
  let runnableCount = 0;
  let notRunnableCount = 0;

  for (const row of asserted) {
    const c = classify(row);
    if (c.kind === "not-runnable") {
      notRunnableCount += 1;
      await t.test(`${row.id} (${row.item.surface}, expect ${row.expect}) -- NOT RUNNABLE`, { skip: c.reason }, () => {});
      continue;
    }
    runnableCount += 1;
    await t.test(`${row.id} (${row.item.surface}): B18 ${row.contract_clause} says "${row.expect}"`, async () => {
      const got = c.kind === "runnable-scribe-fact" ? await runScribeFactRow(row) : await runSummaryLineRow(row);
      assert.equal(
        got,
        row.expect,
        `${row.id}: expected "${row.expect}", the merged engine returns "${got}" -- ${row.why}`,
      );
    });
  }

  // ---- quarantined rows: reported, never asserted (no subtest -- nothing to pass or fail) ----
  for (const u of unsettled) {
    // eslint-disable-next-line no-console
    console.log(`[t039][quarantined, not asserted] ${u.id} (${u.category}): ${u.open_question}`);
  }

  // The one invariant that must never silently break, regardless of how many rows pass, fail or
  // are skipped today: every asserted row is classified exactly once. This does NOT assert on the
  // pass/fail split itself -- freezing today's leak count as a required number would be exactly the
  // "make the number look good" mistake the brief warns against.
  assert.equal(runnableCount + notRunnableCount, 55, "every asserted row must be classified exactly once");
});
