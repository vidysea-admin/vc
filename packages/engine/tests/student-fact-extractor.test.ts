/**
 * p1-lk6 (D-104, D-105; design row LK6): the student fact extractor. A student's chat or voice turn is read in its ORIGINAL language and
 * written into the English knowledge graph: `key` and `value` are English, `quote` is the verbatim original-language snippet. Extraction is
 * model-based through an injected provider (mocked here, no network, no key); a quote that is not a verbatim substring of the original text
 * drops the fact. Synthetic students only (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockProvider } from "@vc/providers";
import {
  createStudentFactExtractor,
  extractStudentTurnFacts,
  StudentFactExtractionError,
  verifyCandidateFact,
  type ScribeTurn,
} from "../src/index.js";
import { guardTurn } from "../src/guards/escalation.js";
import { SKILLS_DIR } from "./scribe-fixtures.js";

const NOW = new Date("2026-10-19T10:30:00.000Z");
const cand = (key: string, value: unknown, quote: string, turnId = "t-1") => ({
  key,
  value,
  source: { type: "transcript", quote, turnId },
  confidence: 0.8,
  purposeTags: ["profile_synthesis"],
  sensitivity: "low",
});
const provider = (facts: unknown[]) => new MockProvider({ responses: { "fact-extraction": { facts } } });
const run = (p: MockProvider, text: string, turnId = "t-1", lang?: string) =>
  extractStudentTurnFacts({ turnId, text, ...(lang !== undefined ? { lang } : {}), now: NOW }, { provider: p, skillsDir: SKILLS_DIR });

const HINDI = "मैं जर्मनी में एमबीए करना चाहता हूँ और मेरा बजट बीस लाख रुपये है";
const HINGLISH = "Mujhe Germany mein MBA karna hai, budget lagbhag 20 lakh hai";
const ENGLISH = "I want to study computer science in Canada and my budget is around 20 lakh rupees";

test("LK6: a Devanagari turn yields English key and value, with the Devanagari quote kept as the source", async () => {
  const p = provider([cand("target_country", "Germany", "जर्मनी में एमबीए"), cand("intended_degree", "MBA", "एमबीए करना चाहता हूँ")]);
  const r = await run(p, HINDI);
  assert.deepEqual(
    r.facts.map((f) => [f.key, f.value, f.quote]),
    [["target_country", "Germany", "जर्मनी में एमबीए"], ["intended_degree", "MBA", "एमबीए करना चाहता हूँ"]],
  );
  for (const f of r.facts) assert.ok(HINDI.includes(f.quote), "the quote is a verbatim substring of the original text");
  assert.ok(r.facts.every((f) => f.sourceLang === "hi"));
  assert.deepEqual(r.dropped, []);
});

test("LK6: a Hinglish turn yields English values, quotes verbatim from the Latin-script original", async () => {
  const p = provider([cand("target_country", "Germany", "Germany mein MBA"), cand("budget_inr", 2000000, "20 lakh")]);
  const r = await run(p, HINGLISH);
  assert.deepEqual(r.facts.map((f) => [f.key, f.value, f.quote]), [["target_country", "Germany", "Germany mein MBA"], ["budget_inr", "2000000", "20 lakh"]]);
  for (const f of r.facts) assert.ok(HINGLISH.includes(f.quote));
  assert.ok(r.facts.every((f) => !("sourceLang" in f)), "Latin script alone does not name a language, so none is guessed");
});

test("LK6: an English turn yields English facts", async () => {
  const r = await run(provider([cand("target_country", "Canada", "computer science in Canada")]), ENGLISH, "t-1", "en");
  assert.deepEqual(r.facts.map((f) => [f.key, f.value, f.quote, f.sourceLang]), [["target_country", "Canada", "computer science in Canada", "en"]]);
});

test("LK6: a quote that is not a verbatim substring of the original text drops the fact (a fabricated quote, an English translation of a Hindi turn, a case drift)", async () => {
  const p = provider([
    cand("target_country", "Germany", "I want to study in Germany"), // the model translated the quote: not in the original
    cand("budget_inr", 2000000, "बजट पच्चीस लाख"), // invented
    cand("intended_degree", "MBA", "एमबीए करना चाहता हूँ"), // real
  ]);
  const r = await run(p, HINDI);
  assert.deepEqual(r.facts.map((f) => f.key), ["intended_degree"]);
  assert.deepEqual(r.dropped.map((d) => d.key).sort(), ["budget_inr", "target_country"]);
  const drift = await run(provider([cand("target_country", "Germany", "GERMANY MEIN MBA")]), HINGLISH);
  assert.deepEqual(drift.facts, [], "a quote that matches only after case normalisation is not a verbatim substring, so it is dropped");
  assert.equal(drift.dropped.length, 1);
});

test("LK6: the model reads the ORIGINAL text, translatedText is empty, and the skill carries the English-KG rule", async () => {
  const p = provider([]);
  await run(p, HINDI, "t-9");
  assert.equal(p.calls.length, 1);
  const call = p.calls[0]!;
  assert.equal(call.skillName, "fact-extraction");
  const turns = (call.input as { turns: ScribeTurn[] }).turns;
  assert.equal(turns.length, 1);
  assert.deepEqual([turns[0]!.turnId, turns[0]!.speaker, turns[0]!.text, turns[0]!.translatedText], ["t-9", "student", HINDI, ""]);
  assert.match(call.skillPrompt, /English/, "the skill tells the model to write key and value in English");
  assert.match(call.skillPrompt, /original/i);
});

test("LK6: translatedText \"\" is safe in the citation check and in the escalation guard", async () => {
  const turnsById = new Map<string, ScribeTurn>([["t-1", { turnId: "t-1", speaker: "student", lang: "hi", text: HINDI, translatedText: "", ts: 1 }]]);
  const ok = verifyCandidateFact(cand("intended_degree", "MBA", "एमबीए करना"), turnsById, NOW.toISOString());
  assert.ok("fact" in ok);
  assert.equal("fact" in ok && ok.fact.citationMatch, "verbatim");
  for (const quote of ["", " ", "not in the turn"]) {
    const bad = verifyCandidateFact(cand("x", "y", quote), turnsById, NOW.toISOString());
    assert.ok("dropped" in bad, `an empty translatedText never makes ${JSON.stringify(quote)} a match`);
  }
  assert.deepEqual(guardTurn({ text: HINDI, translatedText: "" }).level, "none");
  assert.equal(guardTurn({ text: "I want to kill myself", translatedText: "" }).level, "crisis", "the guard still reads the original text when the translation is empty");
});

test("LK6: a value or key that is not English, or not a plain scalar, is dropped; the KG is English by construction", async () => {
  const p = provider([
    cand("target_country", "जर्मनी", "जर्मनी में एमबीए"), // value left in Devanagari
    cand("लक्ष्य_देश", "Germany", "जर्मनी में एमबीए"), // key not an English slug
    cand("budget", { amount: 1 }, "बजट बीस लाख"), // not a scalar
    cand("budget_inr", 2000000, "बजट बीस लाख"), // good
  ]);
  const r = await run(p, HINDI);
  assert.deepEqual(r.facts.map((f) => [f.key, f.value]), [["budget_inr", "2000000"]]);
  assert.equal(r.dropped.length, 3);
});

test("LK6: no provider call when there is no text to read", async () => {
  const p = provider([cand("x", "y", "z")]);
  for (const text of ["", "   ", "\n\t"]) {
    const r = await run(p, text);
    assert.deepEqual(r.facts, []);
  }
  assert.equal(p.calls.length, 0);
});

test("LK6: extraction failure surfaces as a text-free error (no student words, no quote), a schema-invalid model output is an empty result", async () => {
  const secret = "मेरा नाम अनीता है, फोन 9876543210";
  const boom = new MockProvider({ responses: { "fact-extraction": () => { throw new Error(`upstream said: ${secret}`); } } });
  await assert.rejects(run(boom, secret), (err: unknown) => {
    assert.ok(err instanceof StudentFactExtractionError);
    assert.ok(!String((err as Error).message).includes("अनीता"));
    assert.ok(!String((err as Error).message).includes("9876543210"));
    assert.ok(!JSON.stringify(err, Object.getOwnPropertyNames(err)).includes("9876543210"), "no student words in any own property of the error");
    return true;
  });
  const bad = new MockProvider({ responses: { "fact-extraction": { nonsense: true } } });
  const r = await run(bad, HINDI);
  assert.deepEqual(r.facts, []);
  assert.ok(r.failedReason);
});

test("LK6: createStudentFactExtractor returns the chat/voice port shape {key, value, quote, sourceLang} and keeps the sourceLang off a fact it cannot name", async () => {
  const p = provider([cand("target_country", "Germany", "जर्मनी में एमबीए")]);
  const extract = createStudentFactExtractor({ provider: p, skillsDir: SKILLS_DIR, now: () => NOW });
  const facts = await extract({ tenantId: "ten-1", studentId: "stu-1", threadId: "th-1", turnId: "t-1", text: HINDI });
  assert.deepEqual(facts, [{ key: "target_country", value: "Germany", quote: "जर्मनी में एमबीए", sourceLang: "hi" }]);
  assert.deepEqual(await extract({ tenantId: "ten-1", studentId: "stu-1", threadId: "th-1", turnId: "t-2", text: "" }), []);
});

test("LK6: the read-only audit proposal counts non-Latin fact values per tenant, prints ids only, and never calls a write method", async () => {
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const mod = (await import(pathToFileURL(resolve(SKILLS_DIR, "..", "qa", "evidence", "p1-lk6", "audit-fact-value-language.proposal.mjs")).href)) as {
    auditFactValueLanguage(db: unknown): Promise<{ collections: Record<string, { scanned: number; nonLatin: number; byTenant: Record<string, number>; ids: string[] }>; totalHits: number }>;
  };
  const rows: Record<string, unknown[]> = {
    profile_facts: [
      { _id: "a", tenantId: "t1", value: "Germany" },
      { _id: "b", tenantId: "t1", value: "जर्मनी" },
      { _id: "c", tenantId: "t2", value: "20 lakh" },
    ],
    facts: [{ _id: "d", tenantId: "t2", value: "தமிழ்" }, { _id: "e", tenantId: "t2", value: 2000000 }],
  };
  const touched: string[] = [];
  const db = {
    collection: (name: string) =>
      new Proxy(
        { find: async function* () { for (const r of rows[name] ?? []) yield r; } },
        { get: (target, prop) => (prop in target ? (target as never)[prop] : (touched.push(String(prop)), () => { throw new Error("write attempted"); })) },
      ),
  };
  const report = await mod.auditFactValueLanguage(db);
  assert.deepEqual([report.collections.profile_facts!.scanned, report.collections.profile_facts!.nonLatin, report.collections.profile_facts!.byTenant, report.collections.profile_facts!.ids], [3, 1, { t1: 1 }, ["b"]]);
  assert.deepEqual([report.collections.facts!.scanned, report.collections.facts!.nonLatin, report.collections.facts!.byTenant], [2, 1, { t2: 1 }]);
  assert.equal(report.totalHits, 2);
  assert.deepEqual(touched, [], "only find() is used");
  assert.ok(!JSON.stringify(report).includes("जर्मनी") && !JSON.stringify(report).includes("தமிழ்"), "no value in the report");
});
