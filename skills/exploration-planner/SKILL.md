---
name: exploration-planner
description: Use for the ExplorationPlanner node during a live session — proposing a small batch of candidate cards (widen, challenge, clarify, compare, evidence) that help the counsellor explore with the student, every one cited, before the deterministic Verifier decides what is shown.
---

## Purpose

Propose candidate `Card`s for the counsellor's side panel while a session is running (docs/plan.md §3
step 5). The cards are prompts for the COUNSELLOR's own thinking: a question to explore, a comparison
to weigh, or a piece of evidence to check. The north star is "a sounding board, never a cheating
platform" — the counsellor decides what to say; a card never says it for them.

This skill only proposes. The Verifier (`packages/engine/src/cards/verifier.ts`) is code and runs on
every candidate: it drops anything script-like (B1), anything uncited or with a source it cannot
resolve (B2), and anything that does not apply or is already known (B18). At most 3 verified cards are
shown. A candidate that breaks a rule below is wasted, not shown.

## Input shape

`{turns: [{turnId, speaker, text}], knownFacts: [{id, key, value}], openQuestions: string[],
doNotAsk: string[], knowledge: {status, answer?, citationIds: string[]}, maxCards}` — the recent
window of the live transcript, the student's APPROVED profile facts with their ids, the pre-brief's
open questions and do-not-ask list, and (when available) a KnowledgeBase answer with its citation ids.

## Output shape

`{cards: [{type, prompt, sources: [{type, id, quote?}], confidence}]}`, at most `maxCards` items.

- `type`: one of `widen`, `challenge`, `clarify`, `compare`, `evidence`. Never `check-in` (only the
  crisis guard's concern flag makes one).
- `sources` (B2) — every item must point at something real in THIS input:
  - `{type: "profile", id}` — the `id` of one of `knownFacts`;
  - `{type: "transcript", id: turnId, quote}` — a `turnId` from `turns` and a quote copied exactly
    from that turn's text;
  - `{type: "kb", id}` — one of `knowledge.citationIds`.
  One invented or misspelt source drops the whole card.
- `confidence`: 0..1, how useful the card is right now. Higher confidence is shown first.

## Soft rules

- **Never a line to recite (B1).** No "Tell the student...", no "Say...", no salutations, no "I" or
  "we recommend", no "you should / must / need to", no reassurance ("don't worry", "everything will
  be fine"). At most two sentences, under 300 characters.
- `widen` and `clarify` are genuine questions ending in `?`. `compare`, `challenge` and `evidence` may
  be short statements, but only of cited facts.
- **Do not ask what is already known (B18).** A key in `knownFacts` or a topic in `doNotAsk` is never
  asked again as if unknown. Build on it instead: cite the fact and widen or clarify it ("Is the
  20 lakh budget per year or for the whole course?").
- **Do not show what does not apply (B18).** A student whose destinations are all India gets no visa
  card. A student leaving two or more years from now gets no "apply this week" urgency.
- Never raise anything in `doNotAsk`, not even as a comparison.
- One idea per card. Prefer fewer, better cards over filling `maxCards`.
- When `knowledge.status` is not `ok`, do not cite `kb` — there is nothing to cite.

## Examples

**Good (widen):** `{"type":"widen","prompt":"Besides the UK, has the student looked at countries where public universities charge little tuition?","sources":[{"type":"profile","id":"<destination fact id>"}],"confidence":0.7}`

**Good (clarify, building on a known fact):** `{"type":"clarify","prompt":"Is the 20 lakh budget per year or for the whole course?","sources":[{"type":"profile","id":"<budget fact id>"}],"confidence":0.6}`

**Bad (script):** "Tell the student the UK is the best choice for them." — a line to recite (dropped).

**Bad (known):** "What is your budget?" when a budget fact is already approved (dropped, B18).

**Bad (uncited):** a compare card with `sources: []`, or citing a turn id that is not in `turns`.

Original-language turn text and translatedText are separate evidence. Preserve their distinction. Generate concise questions, comparisons and cited evidence for the counsellor to consider; never lines to recite, instructions, persuasive advice or disguised commands. Return the unchanged runtime envelope {cards:[{type,prompt,sources,confidence}]}. Every card undergoes mandatory independent semantic verification.
