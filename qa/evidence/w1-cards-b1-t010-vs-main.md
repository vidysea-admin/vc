# w1-cards-b1 K1: T-010 (wave/t-010-live-cards) criteria vs main (da2faad)

Read-only comparison; nothing ported. T-010 side read with `git show wave/t-010-live-cards:<path>`
(manifest `qa/manifests/t-010-live-cards.md`, last verdict `qa/verdicts/t-010-live-cards.md` cycle 3).
The 13 criteria are the contract clauses the T-010 manifest lists (B1, B2, B5, B18 primary; B4, B6, B9,
B12, B13, B17, B19, B20, B21). The cycle-3 verdict scored B2 B4 B5 B6 B12 B13 B17 B19 B20 B21 met and
B1, B18, B9 not met (10/13).

Main already holds the engine half of T-010 (T-049 recovery patch, fe0937e / D-079: the cards graph,
verifier, relevance, planner skill, and the cards tests), hardened further by T049/T050. Main does NOT
hold the API routes, the web panel, the feedback writer, the scenario runner or the browser evidence.

| id | T-010 verdict | main status | evidence on main |
|---|---|---|---|
| B1 no-script | NOT MET (c3: 26/41 hostile rows leaked) | PARTIAL | Main carries the same cycle-3 rules: `packages/engine/src/cards/verifier.ts` `liveScriptReason` (Hinglish/Devanagari recital, `isImperativeMood`, `isInterrogativeForm`) plus `packages/schemas/src/guards.ts` `isScriptLike`; tests `cards-verifier.test.ts` "ISS-t-010-c0-1/c1-1/c2-1". The question-card leak (ISS-t-010-c0-1) is what K2 of this unit closes; statement-card leaks (homograph openers in `NON_VERB_OPENERS`, coordinated imperatives, plain Devanagari imperatives) remain open. |
| B2 cited facts | met | ON-MAIN | `verifier.ts` `resolveSource` (profile / transcript quote / kb id) and `verifyCards` uncited and unresolved_source drops; tests `cards-verifier.test.ts` "T-010 B2: every good, cited card...", "uncited or fabricated-source cards are dropped", "a kb source resolves only against THIS run's KB citations", "a transcript quote resolves against the turn text". |
| B4 consent first | met | ON-MAIN | `graph.ts` consent_gate node (`LIVE_CARDS_NODES.consent`, graph.ts:111) refuses before any read; `nodes.ts` `checkConsent` re-export; test `cards-graph.test.ts` "B4: no consent -> 'refused' before anything is read" plus T049/T050 consent and fence tests. |
| B5 typed boundaries | met | ON-MAIN | `packages/engine/src/cards/schemas.ts` `LiveCardsInputSchema` (:24), `CandidateCardSchema` (:52), `VerifierSkillOutputSchema` (:64), `VerifiedCardSchema` (:109); `verifier.ts` `verifyCards` parses every candidate (invalid_shape drop); tests `cards-graph.test.ts` "B5: a schema-invalid planner output...", "B5: invalid live-cards input is refused at the boundary", `cards-verifier.test.ts` "B5: a malformed planner item is dropped". |
| B6 portable core | met | ON-MAIN | `skills/exploration-planner/SKILL.md` (loaded by `nodes.ts` `planCards` via `loadSkill`, nodes.ts:196) and `skills/verifier/SKILL.md`; `loader.test.ts` lists `exploration-planner` (:27); test `cards-graph.test.ts` "B6: AI unavailable (rules provider has no planner)...". |
| B9 crisis | NOT MET (SC-019/SC-021 probe fail, owner T-012/T-035; held against crisis guard, not T-010) | PARTIAL | Graph-level gate present: `graph.ts` crisis node (`LIVE_CARDS_NODES.crisis`, :122) ends "escalated" before any provider/KB call; tests `cards-graph.test.ts` "B9: a crisis turn ends 'escalated'..." and "SC-019 / B9: a Hindi (Devanagari) self-harm phrase...". The crisis-guard recall itself is below the bar (QUEUE: crisis recall); that is outside the cards unit, same as in T-010. |
| B12 single DB | met | PARTIAL | Cards graph is read-only on main (no collection write anywhere under `packages/engine/src/cards/`); `graph.ts` `recordLiveCardFeedback` (:299) consent- and fence-checks, then throws `CardFeedbackUnavailableError` (T050 refuses persistence until a reviewed durable writer exists). T-010's feedback writer (`recordCardFeedback`, `decisions` collection `kind: card_feedback`) is MISSING: `git grep recordCardFeedback` has no hit on main. Tests `cards-graph.test.ts` "T050 scoped consented feedback reports unavailable without writing...". |
| B13 synthetic data | met | ON-MAIN | `packages/engine/tests/cards-fixtures.ts` (header: synthetic text only, in-memory fake db, mock provider, fake KB); every cards test is offline. |
| B17 persona usability | met (cycle-0 checker browser run) | MISSING | No web surface for cards on main: `apps/web/src/app` has only `api/`, `approvals/`, `sessions/new/`; no `CardsPanel`, no `/sessions/live`, no `api/cards` route. The T-010 browser evidence `qa/evidence/browser-t-010-live-cards-2026-09-27-checker/report.json` and persona rows (SC-003, SC-048..SC-051) are not on main. |
| B18 context relevance | NOT MET (ISS-t-010-c0-2, separate unit) | PARTIAL | `packages/engine/src/cards/relevance.ts` `relevanceDrop` (:299) and the default-suppressing clarify branch (:316 `already_known`) are on main; tests `cards-verifier.test.ts` "T-010 B18 ..." (incl. c2-2 carve-out attacks) and `cards-graph.test.ts` "B18 end to end". The cycle-3 B18 escapes (type exemption, citing the re-asked fact) are the later unit ISS-t-010-c0-2; not touched here. |
| B19 scenario matrix | met | MISSING | `qa/scenarios/counselling-engine.csv` exists on main but SC-025 and SC-053 still read `not-yet-built:T-010`; `qa/scenarios/run-scenarios.mjs` and `results-2026-09-27-t-010-c{1,2,3}.md` are not on main (`ls qa/scenarios` shows only the csv). |
| B20 concern continuation | met | ON-MAIN | `nodes.ts` `checkConcerns` (:98) and `CHECK_IN_PROMPT` (:89); `graph.ts` crisis node builds ONE cited check-in card shown first, kept even in quiet mode; test `cards-graph.test.ts` "T-022 / B20: a concern-level turn adds ONE cited check-in card...". |
| B21 API-first | met | PARTIAL | Engine entrypoints exist (`graph.ts` `runLiveCards` :275, `buildPreBriefFor` :287) and the KB-outage degrade is on main (`nodes.ts` `retrieveKnowledge` :149; tests "B2: KB unavailable / throwing / not configured", "KB 'ok' with no citations is treated as unavailable"). The `/v1` routes (`getPreBrief`, `liveCards`, `cardFeedback`), OpenAPI paths and `LiveCardsWiring` are MISSING: `apps/api/src/server.ts` has no cards route. |

## Tally

ON-MAIN 6 (B2, B4, B5, B6, B13, B20) · PARTIAL 5 (B1, B9, B12, B18, B21) · MISSING 2 (B17, B19).

## What the later queue row needs (not done here)

1. Port the API half: `apps/api/src/{server,openapi,index}.ts` cards routes + tests (B21).
2. Port the web half: `CardsPanel`, `/sessions/live`, `api/cards` routes, `cards-service`, runtime (B17), then a fresh persona walk and browser run.
3. Feedback durable writer (B12): reconcile T-010 `recordCardFeedback` with main's T050 "unavailable" contract; needs a decision, not a copy.
4. Scenario runner + results + the two csv markers (B19).
5. B18 leak unit (ISS-t-010-c0-2) and the remaining statement-card B1 leaks.
