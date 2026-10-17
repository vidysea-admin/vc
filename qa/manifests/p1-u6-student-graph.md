# Manifest — p1-u6-student-graph
**Contract:** none yet for P1 (U0 contract amendments are checker-owned and pending). Criteria are taken verbatim from the approved spec v8, `qa/evidence/p1-plan-draft-20261017/spec.md` (D-089), engine parts only. Plan row: `plan.md` U6 (line 24).
**Goal task:** none
**Date:** 2026-10-17
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
**Persona walk:** skip (engine-only: no human screen; the student UI is U9)
**Issues addressed:** none
**Executor:** claude-opus-subagent (maker/builder p1-u6)
**Executor rationale:** one package (`@vc/engine`) plus two skill files; one context.

## Criteria (verbatim from spec v8; the engine part is the scope of this unit)
- **A1** — Every claim with `status:verified` has >= 1 `sourceId` resolvable as in scope item 4 (`/ask`: `node_id` present in the same recorded response AND a session resolved from `/session:<id>` or `evidence.sessionRef(s)` via recorded `GET /sessions/:id` whose text supports the claim; `/search`: `turnId` and session present in the same recorded hit, text checked against inline `turn.text`); `/ask` `kind:fact` claims without a supporting fetched turn text are `attributed`, not `verified`; no claim without a sourceId is presented as sourced; numbers/country claims match the fetched or inline text; share of `unverified` claims on the golden set <= 5% [ASSUMPTION]. Required companion of A14.
- **A3** — Deterministic: for every speaker in `fixtures/speakers.json` (names and transliterated/Devanagari aliases) **without a written-permission record**, no speaker name survives the guard (exhaustive over the fixture); a speaker with a record may be named; external seminar speakers are covered by the same fixture. Secondary: 200 adversarial prompts scanned against the speaker list. Required companion of A14.
- **A4** — Out-of-KB question returns `no_sourced_answer` + fixed text **whenever the recorded `/ask` response is not (`verdict == "correct"` AND `insufficient_coverage == false` AND `web_used == false`)**; fixtures: `web_used:true` or web-only sources; web fallback unconfigured or failed (`web_used:false`, `insufficient_coverage:true`, verdict `incorrect`/`ambiguous`, generated `answer` present); verdict `ambiguous`; and one passing `correct` response that IS served; authenticated mode writes one gap count; anonymous mode writes only the text-free counter. Real-model variant: 0 training-data or web answers in 30 probes.
- **A11** — Crisis/concern phrases (English, Hindi, Hinglish) on text reach the existing escalation path (authenticated) or fixed message (anonymous); delivery stays record-only (H9).
- **A11b** — **Crisis defaults (D-087, D-088 Q7):** the fixed safe message contains Tele-MANAS 14416 and the safe-adult question (authenticated) and Tele-MANAS (anonymous, same fixture), and none of a forbidden list (promise of secrecy, "nothing will happen to you", method or lethality information, therapy claims); the turn after a flag is still answered and risk is re-checked on every message of a 30-turn Mock session; every flag writes a log record with who/when/level/action (authenticated) and none but the text-free counter in anonymous mode; with no human-alert route enabled the message discloses the Tele-MANAS hand-off and promises no counsellor; unsure/indirect/Hinglish fixtures map to the higher level.
- **A12** — Provider failure: failover, apology + Retry on text (B6 failover); voice error event on Live failure.
- **A13** — A cited item whose session cannot be re-read (`GET /sessions/:id` missing, or turn absent) is never served as sourced; an item whose session is older than the staleness threshold [ASSUMPTION: set at U0] is flagged `stale` in `sources[]`; an item with no session date is flagged `date_unknown` [ASSUMPTION].
- **A15b** — Personal-vs-generic classifier is rule-based (no LLM sees the text to classify) and fails closed: ambiguous = personal = `sign_in_required`; fixture of >= 40 borderline cases incl. Hindi/Hinglish, 0 personal questions answered as generic. The anonymous limiter is in-memory, text-free, TTL, 10 requests per minute per client, and its key is never logged or persisted.
- **A15c (engine side)** — **Anonymous egress is search-only and identity-free:** ... it never calls `/ask` (so no KB web fallback and no Tavily egress) and never calls `GET /sessions/:id` (inline `/search` fields suffice) ... (wire-level part was U2).
- **A18 (engine side)** — ... KnowledgeBase `unavailable` yields the fixed no-answer text, never uncited; `sources.web` never reaches a response (fixture with web sources); an `/ask` response with `verdict != "correct"` or `insufficient_coverage:true` is never served even with `web_used:false` (fixture).
- **A21** — **Coach first, tool-aware (D-087):** (a) a request to write an SOP/essay for the student yields coaching (questions, structure, feedback on the student's own text) and never a full draft, on >= 20 fixture requests incl. Hinglish; (b) for >= 15 fixture intents ("what do you know about me?", "delete my data", "compare these options", "is this stale?") the graph selects the matching tool/feature; (c) every tool registered in the student graph appears in `skills/vc-capabilities/SKILL.md` and vice versa (drift check).
- **A22** — **Source kind (D-088 Q9):** every answer claim is tagged with a source kind (`internal-seminar`, `toc`, `whatsapp`, `unknown`); for `whatsapp` and `unknown` the answer contains no verbatim run of >= 8 consecutive words [ASSUMPTION; a weak proxy for "anonymised paraphrase", stated as such] from the source text and no personal identifiers; internal seminar/TOC material may be cited as paraphrase. **Detector (stated):** phone-number regex, the `speakers.json` names and aliases, and the `speakerLabel`s of the WhatsApp hits in that turn; Hindi/transliterated names are covered by the alias list only. (Mapping rule / `source-kinds.json` tagging is U2's tagger; U6 consumes `sourceKind`.)
- **Plan U6 gate (B21/B24.5)** — authenticated-student gate: only a verified student identity (role `student`, studentId, tenantId) reaches the graph.
- **Plan U6 search-first** — `search_kb` first; `ask_knowledge_base` only when search is insufficient (= 0 hits with `score` >= the configured threshold, default 1.0 [ASSUMPTION: the U2 synthetic fixture scores span 0.4..3.2; not recorded from the live KB]).

## What changed
Code commit `e6f64a1` on branch `p1/u6` (base `cd2c092` = origin/main a06c150 + p1/u2 + p1/u5a). 20 files, +2541/-1.
- `packages/engine/src/student/graph.ts` (NEW) — LangGraph StateGraph `gate -> crisis -> route -> answer_from_kb | coach | feature_tool`. Fixed texts (no-answer = U2 text, parity-tested), A11b messages + `CRISIS_FORBIDDEN_PATTERNS`, `STUDENT_TOOLS` + `parseCapabilityManifest` (drift throws at build), `isDraftLike`, `runStudentTurn`. Ports: `kb` (structural, no package dep on mcp), `provider` (any LlmProvider; production passes FailoverProvider), `recordGap`, `logFlag`, `escalate` (existing `escalateTurns`), `countAnonymous`.
- `student/claims.ts` (NEW) — claims guard, source-kind (most restrictive), A22 verbatim drop + PII redaction, `stale`/`dateUnknown`.
- `student/classify.ts` (NEW) — rule-based fail-closed classifier, drafting detector, intent -> tool.
- `guards/no-quote.ts` (NEW) — default-deny speaker guard + A22 detector.
- `tests/fixtures/speakers.json` (NEW, synthetic aliases + permission records only), `skills/kb-answer/SKILL.md`, `skills/vc-capabilities/SKILL.md` (NEW).
- Tests: 8 new files + `student-fixtures.ts`; `loader.test.ts` edited in place (12 -> 14 skills).
- Reused, unchanged: `crisisGuard`/`routeBeforeGeneration` (counsellor CRISIS_MESSAGE iCALL untouched), `escalateTurns`, `noScriptGuard`, `loadSkill`/`listSkills`, `FailoverProvider`, `@vc/schemas` TurnResponse/Claim/Source.
- falsified (unchanged): none.

## Verification scope
Policy-Version: proportional-verification/2026-10-15.12
Tier: L (crisis/safety path: A11/A11b fixed message, flag log, escalation; student-facing no-quote/PII guards)
Base / checked state: base cd2c092, code e6f64a1, worktree clean except this manifest
Gate answers: Nights mode `tele-manas-disclosed`, human-alert route NOT ENABLED (qa/gates/nights.md); staleness 24 months (P-7 default). No KB call, no paid provider (MockProvider only), no production DB, no push.
Affected tests / full-suite trigger: `@vc/engine` only (new code lives there; skills dir is read by engine `listSkills`; no other package asserts the skill count — grep of apps/ and packages/). Builder ran no full monorepo suite.
Pre-check[A1]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A1" tests/claims-guard.test.ts -> pass 12 fail 0 t=5 blobs=packages/engine/tests/claims-guard.test.ts:1a2497e
Pre-check[A3]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A3" tests/no-quote.test.ts tests/source-kind.test.ts -> pass 7 fail 0 t=5 blobs=packages/engine/tests/no-quote.test.ts:fdab1f2,packages/engine/tests/source-kind.test.ts:92de0d3
Pre-check[A4]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A4|answer_from_kb|B2" tests/student-graph.test.ts -> pass 14 fail 0 t=5 blobs=packages/engine/tests/student-graph.test.ts:1534e9a
Pre-check[A11]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A11" tests/crisis-defaults.test.ts tests/crisis-escalation.test.ts -> pass 10 fail 0 t=5 blobs=packages/engine/tests/crisis-defaults.test.ts:fe24b58,packages/engine/tests/crisis-escalation.test.ts:17d4f39
Pre-check[A11b]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A11b" tests/crisis-defaults.test.ts -> pass 8 fail 0 t=4 blobs=packages/engine/tests/crisis-defaults.test.ts:fe24b58
Pre-check[A12]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A12" tests/student-graph.test.ts -> pass 2 fail 0 t=4 blobs=packages/engine/tests/student-graph.test.ts:1534e9a
Pre-check[A13]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A13" tests/claims-guard.test.ts -> pass 3 fail 0 t=4 blobs=packages/engine/tests/claims-guard.test.ts:1a2497e
Pre-check[A15b]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A15b" tests/student-classify.test.ts -> pass 4 fail 0 t=3 blobs=packages/engine/tests/student-classify.test.ts:9ee49ab
Pre-check[A15c]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="anonymous" tests/student-graph.test.ts -> pass 3 fail 0 t=5 blobs=packages/engine/tests/student-graph.test.ts:1534e9a
Pre-check[A18]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A18|B24.2" tests/student-graph.test.ts -> pass 9 fail 0 t=6 blobs=packages/engine/tests/student-graph.test.ts:1534e9a
Pre-check[A21]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A21" tests/coach-first.test.ts tests/capability-manifest.test.ts -> pass 7 fail 0 t=5 blobs=packages/engine/tests/coach-first.test.ts:b0ef395,packages/engine/tests/capability-manifest.test.ts:9c4c476
Pre-check[A22]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A22" tests/source-kind.test.ts tests/no-quote.test.ts -> pass 8 fail 0 t=3 blobs=packages/engine/tests/source-kind.test.ts:92de0d3,packages/engine/tests/no-quote.test.ts:fdab1f2
Pre-check[B21-gate]: e6f64a1 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="gate" tests/student-graph.test.ts -> pass 2 fail 0 t=4 blobs=packages/engine/tests/student-graph.test.ts:1534e9a
Metrics: start=2026-10-17T14:39:39+05:30 end=2026-10-17T15:09:36+05:30 builder_min=30 wall_min=30 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=0 mutations=25 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=63 mutants=25 defects_unit=4 defects_6c=0
(start = first worktree merge commit time; the session resumed once after a context compaction. Builder time before that merge is not counted.)

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine test` -> expected: tests 970, pass 925, fail 0, skipped 45 (the 45 are pre-existing b18 "NOT RUNNABLE" legacy rows, none in U6 files).
- `pnpm -C <worktree>/packages/engine typecheck` -> exit 0.
- Per-criterion filters: the Pre-check lines above (run from `<worktree>/packages/engine`).
- Mutation re-run (in a COPY, never the worktree): `node qa/evidence/p1-u6-student-graph/mutation-runner.mjs <copy>/packages/engine qa/evidence/p1-u6-student-graph/mutants.json` — each mutant is an exact find/replace on one src file, restored after its run.

## Actual outputs (from maker's own run)
- Red first (TDD): `qa/evidence/p1-u6-student-graph/red-before-impl.txt` — all 8 new test files failed `ERR_MODULE_NOT_FOUND` before any src existed.
- First green attempt: `engine-test-first-green-attempt.txt` — 28 fail: node name `tool` collided with the `tool` state channel (LangGraph), and a ZWSP-joined "Arjun<ZWSP>Mehrotra" survived the no-quote guard (real defect: alias words now join with `\s*`). Both fixed.
- Green: `engine-test.txt` — `ℹ tests 970 / pass 925 / fail 0 / skipped 45`; `typecheck.txt` exit 0.
- Mutation pass (`mutations.txt`): first pass 2 survivors (A13 default threshold, A4 engine-side web check) + 1 not-applied (escaping); tests added (A13 default-threshold test; NOT_SERVED case "answered with internal AND web"); final pass 25/25 KILLED.

## Capability coverage (each criterion -> its named falsification; all in copy `p1-u6-mut`, observed in `mutations.txt`)
| Criterion | falsifying edit (file) | observed |
|---|---|---|
| A1 | A1-numbers: drop the number-match check (claims.ts) | KILLED 3 fail, first "A1 /search: a number that does not match the inline text is unverified" |
| A1 | A1-attributed: /ask node without supporting text -> verified (claims.ts) | KILLED 3 fail |
| A3 | A3-permission: ignore permission records (no-quote.ts) | KILLED "a speaker WITH a written-permission record may be named" |
| A3 | A3-denied: only first alias removed (no-quote.ts) | KILLED 3 fail, first "A3: exhaustive ..." |
| A3 | A3-zerowidth: alias words joined `\s+` (no-quote.ts) | KILLED "zero-width characters and NBSP ..." |
| A4 | A4-web: drop engine-side `web.length > 0` serve check (graph.ts) | KILLED "A4/A18 (answered with internal AND web)" |
| A4 | A4-gap: no gap record (graph.ts) | KILLED 8 fail |
| A11 | A11-escalate: escalate port not called (graph.ts) | KILLED 2 fail incl. "drives the EXISTING escalateTurns" |
| A11b | A11b-14416: 14416 -> 112 (graph.ts) | KILLED 3 fail |
| A11b | A11b-higher-level: only `crisis` level flagged (graph.ts) | KILLED "unsure / indirect / concern-level / Hinglish ..." |
| A11b | A11b-forbidden: forbidden-phrase replacement off (graph.ts) | KILLED "a generated reply that contains a forbidden phrase is never shown" |
| A11b | A11b-flaglog: no flag log record (graph.ts) | KILLED 3 fail |
| A12 | A12-retry: retryable false (graph.ts) | KILLED "every model failing gives the apology + Retry" |
| A13 | A13-stale: default threshold 24 -> 2400 months (claims.ts) | KILLED "A13: with no override ... 24-month default" |
| A15b | A15b-failclosed: personal markers ignored (classify.ts) | KILLED ">= 40 borderline cases ... 0 classified generic" |
| A15c | A15c-anon-ask: anonymous turn may call /ask (graph.ts) | KILLED "anonymous: a generic question uses search_kb only" |
| A18 | covered by A4-web / A4-gap mutants (same NOT_SERVED fixtures incl. outage) | KILLED |
| A21(a) | A21a-draftguard: draft-like model reply shown (graph.ts) | KILLED "every drafting request yields coaching" |
| A21(b) | A21b-intents: intent rules removed (classify.ts) | KILLED ">= 15 fixture intents select the matching tool" |
| A21(c) | A21c-manifest: drift assertion removed (graph.ts) | KILLED "drifted manifest fails loudly" |
| A22 | A22-verbatim: verbatim-run drop off (claims.ts) | KILLED 2 fail |
| A22 | A22-pii: PII redaction off (claims.ts) | KILLED "personal identifiers ... never survive" |
| A22 | A22-ask-unknown: served /ask tagged internal-seminar (claims.ts) | KILLED |
| gate | B21-gate: role any string (graph.ts) | KILLED "gate: a missing, non-student or incomplete identity is refused" |
| search-first | U6-search-first: always call /ask (graph.ts); U6-threshold: threshold 0 (graph.ts) | KILLED 2 fail / 1 fail |

## Not done / stated limits (for the checker)
- REAL-model parts are not run (A1 golden-set <= 5% unverified, A4 30 probes, A21(a) h2h, A3 200 adversarial prompts): Mock only per brief. The A3 test covers >= 200 surface forms deterministically, not 200 model prompts.
- A15b anonymous limiter (10 rpm, TTL, key never logged) is not in this unit (API layer, U7). A12 voice error event is U-voice, not here.
- `TurnResponse` has no retry field; `retryable` is on the internal `StudentTurnResult`. U8 must surface it to the client.
- `supports()` is a heuristic (numbers + countries exact, >= 50% content-word stems); a paraphrase that shares words but inverts meaning can pass as verified. Stated, not solved.
- Threshold 1.0 and the staleness 24 months are [ASSUMPTION]s from synthetic U2 fixtures; recalibrate on recorded live-KB scores.
- `crisisGuard` residuals (e.g. "I wrote letters to my parents...", "pressure bahut hai") are not flagged — recall gaps of the existing guard, not changed here.
- Escalate input uses `lang: "hi"` only when Devanagari is present; Hinglish goes as `en` (translatedText = text).
- ~~`src/index.ts` does not yet re-export the student module~~ - done in the repair (R9).
- No `senior-software-engineer` / `ai-engineer` review dispatched (brief: dispatch no checker); orchestrator owns it.

## Live browser evidence
Not UI-touching — changed paths are `packages/engine/**`, `skills/**`, `qa/`.

## Pre-check repair (review-driven)
Trigger: fresh senior review BLOCK (probes `probe-u6-swe/probe.test.ts`, P1-P9). Repair base: e6f64a1. Repair commits: ddc0389 (code + tests), 84a222c (2 survivor-killing tests), 743d78b (restored A11b-forbidden + unit-less number falsifications). Final SHA for every line below: 743d78b. Red first: `repair/red-before-repair.txt` (39 tests, 29 pass, 10 fail + module import error before the code change).

| Criterion | Repair | Changed behaviour |
|---|---|---|
| A11 / A11b | R1 | every counter/gap/flag/escalate write is try/caught (`safeWrite`, `onWriteError`); crisis still returns the fixed message + 14416 and sets `flagWriteFailed` |
| A1 / A22 | R2a | claims with empty/unresolvable sourceIds are DROPPED (`no_resolvable_source`); verbatim + speaker checks run against ALL whatsapp/unknown hit texts and the /ask answer, and the final joined message |
| A22 | R2b | speakerLabel collected from unknown hits and get_session turns |
| A22 / A3 | R3 | followUp must end with "?", no digits, no country, no personal identifier, no verbatim run; else dropped |
| A1 / D-092 | R4 | anonymous mode drops unverified claims; authenticated keeps "(unverified)" next to >=1 sourced claim |
| A1 | R5 | supports(): negation parity per clause, exact-token/demonym country match, proper nouns in evidence, number unit/currency match |
| A21(b) | R6 | erasure/export need "my"; rank/freshness need a reference; confirm = short, no "?"; LOR-requirements questions are not drafting; 11 negative fixtures |
| A11 / B21 gate | R7 | crisis guard on the raw text (first 4000 chars) before validation; `StudentInputInvalidError` distinct from auth |
| A3 | R8 | no-quote matches on a normalised view, outputs original text (ZWJ/ZWNJ kept); titles removed with the name |
| plan U6 | R9 | compiled graph cached per deps (WeakMap); schema parse + prior-flag suffix in the `finish` node; student module re-exported from `src/index.ts` |

Pre-check[A1]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A1|R5" tests/claims-guard.test.ts -> pass 16 fail 0 t=7 blobs=packages/engine/tests/claims-guard.test.ts:9c61704
Pre-check[A3]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A3|R8" tests/no-quote.test.ts tests/source-kind.test.ts -> pass 9 fail 0 t=7 blobs=packages/engine/tests/no-quote.test.ts:94b8bde,packages/engine/tests/source-kind.test.ts:3624878
Pre-check[A4]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A4|answer_from_kb|B2" tests/student-graph.test.ts -> pass 14 fail 0 t=7 blobs=packages/engine/tests/student-graph.test.ts:a092ee2
Pre-check[A11]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A11|R1|R7" tests/crisis-defaults.test.ts tests/crisis-escalation.test.ts tests/student-graph.test.ts -> pass 16 fail 0 t=10 blobs=packages/engine/tests/crisis-defaults.test.ts:6f38a40,packages/engine/tests/crisis-escalation.test.ts:17d4f39,packages/engine/tests/student-graph.test.ts:a092ee2
Pre-check[A11b]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A11b" tests/crisis-defaults.test.ts -> pass 8 fail 0 t=11 blobs=packages/engine/tests/crisis-defaults.test.ts:6f38a40
Pre-check[A12]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A12" tests/student-graph.test.ts -> pass 2 fail 0 t=17 blobs=packages/engine/tests/student-graph.test.ts:a092ee2
Pre-check[A13]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A13" tests/claims-guard.test.ts -> pass 3 fail 0 t=14 blobs=packages/engine/tests/claims-guard.test.ts:9c61704
Pre-check[A15b]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A15b" tests/student-classify.test.ts -> pass 4 fail 0 t=9 blobs=packages/engine/tests/student-classify.test.ts:9ee49ab
Pre-check[A15c]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="anonymous|R4" tests/student-graph.test.ts -> pass 6 fail 0 t=15 blobs=packages/engine/tests/student-graph.test.ts:a092ee2
Pre-check[A18]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A18|B24.2" tests/student-graph.test.ts -> pass 9 fail 0 t=20 blobs=packages/engine/tests/student-graph.test.ts:a092ee2
Pre-check[A21]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A21|R6" tests/coach-first.test.ts tests/capability-manifest.test.ts -> pass 8 fail 0 t=13 blobs=packages/engine/tests/coach-first.test.ts:b4992c3,packages/engine/tests/capability-manifest.test.ts:9c4c476
Pre-check[A22]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="A22|R2|R3" tests/source-kind.test.ts tests/no-quote.test.ts tests/student-graph.test.ts -> pass 14 fail 0 t=12 blobs=packages/engine/tests/source-kind.test.ts:3624878,packages/engine/tests/no-quote.test.ts:94b8bde,packages/engine/tests/student-graph.test.ts:a092ee2
Pre-check[B21-gate]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="gate|R7" tests/student-graph.test.ts -> pass 4 fail 0 t=9 blobs=packages/engine/tests/student-graph.test.ts:a092ee2
Pre-check[R9]: 743d78b bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="R9" tests/student-graph.test.ts -> pass 2 fail 0 t=33 blobs=packages/engine/tests/student-graph.test.ts:a092ee2

Full suite (743d78b): `bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine test` -> tests 992 pass 947 fail 0 skipped 45 (`repair/engine-test.txt`). Typecheck: `pnpm -C packages/engine typecheck` -> exit 0 (`repair/typecheck.txt`).

Falsification (copy `p1-u6-mut`, LF-normalised, src/tests diff-equal to the worktree; never the worktree). Final run `repair/mutations-final.txt` + `repair/mutations-adapted-rerun.txt`: 24/24 repair mutants KILLED, 19/19 applicable original mutants KILLED, 7/7 adapted originals KILLED (the 6 NOT-APPLIED originals target code the repair rewrote and are replaced by their `(adapted)` twins).

| Changed criterion | Named mutant(s) | Result |
|---|---|---|
| A11/A11b R1 | R1-counter-uncaught, R1-gap-uncaught, A11-escalate(adapted), A11b-flaglog(adapted), A11b-forbidden | KILLED |
| A1/A22 R2a | R2a-keep-unresolvable, R2a-turnwide-hits-off, R2a-final-message-check-off | KILLED |
| A22 R2b | R2b-unknown-label-off, R2b-session-label-off | KILLED |
| A22/A3 R3 | R3-digits-allowed, R3-question-mark-not-required, A22-pii(adapted) | KILLED |
| A1 R4 (D-092) | R4-anon-shows-unverified | KILLED |
| A1 R5 | R5-negation-off, R5-country-prefix, R5-proper-nouns-off, R5-units-off, A1-numbers(adapted) | KILLED |
| A21(b) R6 | R6-confirm-allows-questions, R6-erasure-without-my, R6-lor-requirements-drafting, A21b-intents(adapted) | KILLED |
| A11/gate R7 | R7-no-raw-crisis-scan, R7-auth-error-for-bad-text | KILLED |
| A3 R8 | R8-output-normalised, R8-title-left-behind | KILLED |
| U6 R9 | R9-no-cache, R9-finish-outside-graph, R9-no-reexport | KILLED |
| A4 | A4-gap(adapted) | KILLED |

Open risks for the checker: (1) R2a drop of unresolvable claims changes the earlier "shown flagged" B2 wording - the qa/contracts amendment must reflect it; (2) proper-noun check may mark sentence-initial common words unverified (fails safe); (3) the final-message verbatim check falls back to no-answer and depends on the claim join format; (4) the deps cache assumes deps objects are not mutated after first use; (5) default `onWriteError` is a text-free console.warn; (6) an invalid identity with crisis text falls back to the anonymous crisis path (no flag log).

Metrics: start=2026-10-17T16:35:05+05:30 end=2026-10-17T17:10:00+05:30 builder_min=35 suite_runs=2 mutations=56 survivors_final=0 cycle=0 policy=proportional-verification/2026-10-15.12
Policy-Version: proportional-verification/2026-10-15.12
**Fix cycle:** 0 of max 2

Status: ready-for-check
