---
name: fact-extraction
description: Use when raw transcript turns need to become typed, sourced Fact records — goals, target country, budget, constraints — for the SignalExtractor node, before any card generation can start.
---

## Purpose

Turn a batch of transcript turns into typed `Fact[]` (SignalExtractor, docs/plan.md §3 step 4). This is
the first AI step after transcription — everything downstream (cards, summary, profile diff) depends on
these facts carrying a real, checkable source.

## Input shape

`TranscriptTurn[]` (see `TranscriptTurnSchema`): `{text, lang, translatedText, ts, speaker}[]` — the
English-translated text is what gets read for a counsellor-session transcript; `lang`/original `text`
are kept for audit, not re-translated here. A student chat or voice turn has no translation: its
`translatedText` is empty and the original `text` is what gets read (next section).

## Student chat and voice turns (English knowledge graph, D-104)

When `turns` holds a single student turn from chat or voice, `translatedText` is `""` (empty) on purpose: there is no translation step. Read the ORIGINAL `text`, whatever its language or script (Devanagari, Hinglish in Latin script, English, or another). Write the fact in English, quote it in the original:

- `key`: an English snake_case slug, reusing the existing vocabulary (`target_country`, `budget_inr`, `intended_degree`, `intended_major`, ...). Never a word in the student's script.
- `value`: in English. Translate the meaning ("जर्मनी" becomes "Germany", "bees lakh" becomes 2000000 or "20 lakh"), never copy the original-language words into `value`. Do not add anything the student did not say.
- `source.quote`: copied character for character from `text`, in its ORIGINAL language and script. Never translate the quote, never fix its spelling, never join two separate pieces of the turn. If you cannot copy a verbatim snippet that supports the fact, do not emit the fact; a fact whose quote is not a verbatim substring of `text` is dropped.
- `source.turnId`: the turn's `turnId`, as for any other turn.

Examples (the original is shown first):

- `text`: "मैं जर्मनी में एमबीए करना चाहता हूँ" gives `{key: "target_country", value: "Germany", source: {type: "transcript", quote: "जर्मनी में", turnId: ...}}` and `{key: "intended_degree", value: "MBA", source: {type: "transcript", quote: "एमबीए करना चाहता हूँ", turnId: ...}}`.
- `text`: "Mujhe Germany mein MBA karna hai, budget lagbhag 20 lakh hai" gives `{key: "budget_inr", value: 2000000, source: {type: "transcript", quote: "20 lakh", turnId: ...}}`.

## Output shape

`Fact[]` (see `FactSchema`): `{key, value, source: {type:"transcript", quote, turnId}, confidence,
validFrom, purposeTags, sensitivity}[]`. Every fact's `source.quote` must be a real substring of the
turn it's drawn from — never a paraphrase presented as a quote.

`kind` (optional, default "value"): set it to `"reasoning"` when the student states WHY a value
holds — not the value itself. A reasoning fact must also carry `explains`: the `key` of the value
fact it accounts for. Example: the student says "I want the UK because my sister lives there" — this
is TWO facts, not one: `{key: "targetCountry", value: "UK", ...}` (kind "value", the default) AND
`{key: "why_targetCountry", value: "sister lives there", kind: "reasoning", explains:
"targetCountry", source: {type:"transcript", quote: "because my sister lives there", turnId: ...},
...}`. Never fold the reasoning into the value fact's own `value`, and never invent a reasoning fact
the student didn't actually state — it needs its own real, verbatim quote like any other fact.

## Soft rules

- Extract only what the student (or counsellor, for context) actually said — do not infer a budget from
  "I want a good university", that is a guess, not a fact.
- One fact per distinct claim; don't merge "wants UK, budget $20k" into a single fact with two values.
- Carry `purposeTags` and `sensitivity` honestly (contract B4/DPDP) — a sensitive disclosure (health,
  family situation) is tagged `sensitivity: "high"`, not folded in as a routine fact.
- Low-confidence or ambiguous statements still get extracted, with a correspondingly low `confidence` —
  don't silently drop what you're unsure about; let the Verifier and counsellor judge it.
- Never write a `Fact` whose `source.quote` cannot be found verbatim in the turn text.
- Contract B2 (D-020, citation-guarantee-scope): only a typed number and a small fixed country/alias
  vocabulary auto-verify at full confidence; every other value is kept but flagged for the
  counsellor's review regardless of your stated `confidence` — so extract everything you're
  reasonably confident the student said, and let that downstream check (not your own judgment about
  whether it "seems reliable") decide what gets flagged.

## Examples

**Good:** `{key: "budget_usd", value: 20000, source: {type: "transcript", quote: "I think we can
manage around $20,000 a year", turnId: "t-14"}, confidence: 0.8, ...}` (real quote, honest confidence)

**Bad:** `{key: "budget_usd", value: 20000, source: {type: "transcript", quote: "budget is $20,000",
turnId: "t-14"}, confidence: 0.95, ...}` when the turn never says that figure — a fabricated quote,
which defeats the citation requirement even though the schema shape parses.

## Approved history boundary

`approvedContext` is server-loaded, consent/purpose/tenant/student-scoped persisted approval authority with durable fact IDs and original canonical sources. It is separate from this session's evidence. Never invent current transcript citations for historical values, treat an original retained quote as evidence an edited approved value was spoken, or emit unknown placeholders for facts already approved. Genuine changed values and historical discussion remain extractable with their actual current-session quotes and counsellor review; known keys are not a blacklist. Pending/rejected proposals are not history. No durable do-not-ask or destination policy is supplied by this context.
