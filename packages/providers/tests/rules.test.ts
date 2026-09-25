/**
 * T-019: RulesProvider — deterministic, no model. Proves the outcome (B14): the input contract is
 * "field: value" lines embedded in a transcript turn (a structured annotation / form field
 * rendered into the turn text), and the output is schema-valid, cited facts / a template summary,
 * with zero network calls anywhere in the path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { RulesProvider, RulesProviderUnsupportedSkillError } from "../src/index.js";

const ExtractionSkillOutputSchema = z.object({ facts: z.array(z.unknown()) });
const CandidateFactSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  source: z.object({ type: z.literal("transcript"), quote: z.string().min(1), turnId: z.string().min(1) }),
  confidence: z.number().min(0).max(1),
  sensitivity: z.enum(["low", "medium", "high"]),
});
const SummarySkillOutputSchema = z.object({ summary: z.string() });

test("fact-extraction: a 'key: value' annotation line in a turn's translatedText becomes a cited candidate fact", async () => {
  const provider = new RulesProvider();
  const out = await provider.generate({
    skillName: "fact-extraction",
    skillPrompt: "ignored — no model reads this",
    outputSchema: ExtractionSkillOutputSchema,
    input: {
      turns: [
        { turnId: "t1", speaker: "student", lang: "en", text: "targetCountry: Canada", translatedText: "targetCountry: Canada", ts: 1 },
        {
          turnId: "t2",
          speaker: "student",
          lang: "en",
          text: "budget_inr_per_year: 2000000",
          translatedText: "budget_inr_per_year: 2000000",
          ts: 2,
        },
      ],
    },
  });
  assert.equal(out.facts.length, 2);
  const parsed = out.facts.map((f) => CandidateFactSchema.parse(f));
  const country = parsed.find((f) => f.key === "targetCountry")!;
  assert.equal(country.value, "Canada");
  assert.equal(country.source.turnId, "t1");
  assert.equal(country.source.quote, "targetCountry: Canada", "the quote is the exact line, a real substring of the turn");
  assert.equal(country.confidence, 1);

  const budget = parsed.find((f) => f.key === "budget_inr_per_year")!;
  assert.equal(budget.value, 2000000, "a numeric-looking value is coerced to a number");
  assert.equal(typeof budget.value, "number");
});

test("fact-extraction: multiple annotation lines in one turn all become facts, each cited to that turn", async () => {
  const provider = new RulesProvider();
  const out = await provider.generate({
    skillName: "fact-extraction",
    skillPrompt: "",
    outputSchema: ExtractionSkillOutputSchema,
    input: {
      turns: [
        {
          turnId: "t1",
          speaker: "counsellor",
          lang: "en",
          text: "form",
          translatedText: "targetCountry: Germany\nbudget_inr_per_year: 1500000\nintake: Fall 2027",
          ts: 1,
        },
      ],
    },
  });
  assert.equal(out.facts.length, 3);
  const parsed = out.facts.map((f) => CandidateFactSchema.parse(f));
  assert.deepEqual(parsed.map((f) => f.key).sort(), ["budget_inr_per_year", "intake", "targetCountry"]);
  for (const f of parsed) assert.equal(f.source.turnId, "t1");
});

test("fact-extraction: a turn with no annotation lines produces no facts (never invents one)", async () => {
  const provider = new RulesProvider();
  const out = await provider.generate({
    skillName: "fact-extraction",
    skillPrompt: "",
    outputSchema: ExtractionSkillOutputSchema,
    input: { turns: [{ turnId: "t1", speaker: "student", lang: "en", text: "I want to study abroad.", translatedText: "I want to study abroad.", ts: 1 }] },
  });
  assert.deepEqual(out.facts, []);
});

test("fact-extraction: falls back to the original text when translatedText has no annotations", async () => {
  const provider = new RulesProvider();
  const out = await provider.generate({
    skillName: "fact-extraction",
    skillPrompt: "",
    outputSchema: ExtractionSkillOutputSchema,
    input: {
      turns: [{ turnId: "t1", speaker: "student", lang: "hi", text: "targetCountry: Canada", translatedText: "no annotations here", ts: 1 }],
    },
  });
  assert.equal(out.facts.length, 1);
  const fact = CandidateFactSchema.parse(out.facts[0]);
  assert.equal(fact.value, "Canada");
});

test("session-summary: a template summary cites every fact's key, value and turn — no model, no free text generation", async () => {
  const provider = new RulesProvider();
  const out = await provider.generate({
    skillName: "session-summary",
    skillPrompt: "",
    outputSchema: SummarySkillOutputSchema,
    input: {
      turns: [],
      facts: [
        { key: "targetCountry", value: "Canada", source: { type: "transcript", quote: "targetCountry: Canada", turnId: "t1" }, confidence: 1, validFrom: "2026-09-25T10:00:00.000Z", purposeTags: ["profile_synthesis"], sensitivity: "low" },
        { key: "budget_inr_per_year", value: 2000000, source: { type: "transcript", quote: "budget_inr_per_year: 2000000", turnId: "t2" }, confidence: 1, validFrom: "2026-09-25T10:00:00.000Z", purposeTags: ["profile_synthesis"], sensitivity: "low" },
      ],
    },
  });
  assert.match(out.summary, /targetCountry = Canada \(turn t1\)/);
  assert.match(out.summary, /budget_inr_per_year = 2000000 \(turn t2\)/);
});

test("session-summary: B1 — the template is a record, never an instruction to the counsellor (no recital verbs)", async () => {
  const provider = new RulesProvider();
  const out = await provider.generate({
    skillName: "session-summary",
    skillPrompt: "",
    outputSchema: SummarySkillOutputSchema,
    input: { turns: [], facts: [{ key: "targetCountry", value: "Canada", source: { type: "transcript", quote: "q", turnId: "t1" }, confidence: 1, validFrom: "2026-09-25T10:00:00.000Z", purposeTags: [], sensitivity: "low" }] },
  });
  assert.doesNotMatch(out.summary, /\btell (the student|them)\b/i);
  assert.doesNotMatch(out.summary, /^say\b/i);
});

test("session-summary: zero facts still produces a valid, non-crashing summary", async () => {
  const provider = new RulesProvider();
  const out = await provider.generate({
    skillName: "session-summary",
    skillPrompt: "",
    outputSchema: SummarySkillOutputSchema,
    input: { turns: [], facts: [] },
  });
  assert.equal(typeof out.summary, "string");
  assert.ok(out.summary.length > 0);
});

test("an unsupported skill name throws a typed RulesProviderUnsupportedSkillError", async () => {
  const provider = new RulesProvider();
  await assert.rejects(
    provider.generate({ skillName: "some-other-skill", skillPrompt: "", outputSchema: z.object({}), input: {} }),
    RulesProviderUnsupportedSkillError,
  );
});

test("kind is 'rules' and the model defaults to 'rules'", () => {
  const provider = new RulesProvider();
  assert.equal(provider.kind, "rules");
  assert.equal(provider.model, "rules");
});

test("no global fetch call is ever made by the rules provider (no model, B6/B8)", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  // @ts-expect-error -- test-only stub
  globalThis.fetch = async (...args: unknown[]) => {
    called = true;
    throw new Error("RulesProvider must never call fetch");
  };
  try {
    const provider = new RulesProvider();
    await provider.generate({
      skillName: "fact-extraction",
      skillPrompt: "",
      outputSchema: ExtractionSkillOutputSchema,
      input: { turns: [{ turnId: "t1", speaker: "student", lang: "en", text: "targetCountry: Canada", translatedText: "targetCountry: Canada", ts: 1 }] },
    });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
