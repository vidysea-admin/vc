# Manifest — p1-u2-kb-tools
**Contract:** none yet for P1 (U0 contract amendments are checker-owned and pending). Criteria are taken from the approved spec v8, `qa/evidence/p1-plan-draft-20261017/spec.md` (D-089): **A4** (/ask serve-rule fixtures), **A15c** (anonymous egress is search-only and identity-free), **A18** (no web answer; outage = fixed no-answer text; no KB content copies), **A22 tagger part** (source-kind mapping). Plan row: `plan.md` U2.
**Goal task:** none
**Date:** 2026-10-17
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
**Persona walk:** skip (api-only: no human screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** single-package build unit (mcp/university-kb), one context, no independent parallel parts.

## What changed
Code commit `4cef7de` on branch `p1/u2` (base `38e751d`). All paths under `mcp/university-kb/` unless noted.
- `src/kb-client.ts` — added read client (`search`, `getSession`, `gaps`, `sources`; typed `ok | unavailable`, new reason `not_found`), `applyServeRule` + `NO_SOURCED_ANSWER_TEXT` (serve only when verdict == "correct" AND insufficient_coverage == false AND web_used == false AND >=1 internal source; `sources.web` never leaves), `createAnonymousKbClient` (structurally only `search` + `sources`), `loadAnonymousKbConfigFromEnv` (own key `VC_KB_ANON_API_KEY`, never falls back). `createKnowledgeBaseClient`'s transport was extracted into `makeTransport` and `ask()` rebuilt on it with unchanged outcomes (T-026 `kb-client.test.ts` still green, untouched).
- `src/index.ts` — `ask_knowledge_base` now returns the serve-rule result; new tools `search_kb`, `get_session`, `kb_gaps`, `kb_sources` (each registered only when the client has the method); `profile: "anonymous"` registers only `search_kb` + `kb_sources` and needs no Db; the two course tools moved inside `if (profile === "full")` (re-indented, behaviour unchanged); `db` is now optional in deps but required for the full profile.
- `src/source-kind.ts` (NEW, plan-named "source-kind tagger") — `tagSourceKind`, strict `SourceKindConfigSchema`, `createSourceKindResolver` (fetches `/sources` once, keeps only `{id, kind}`, failure not cached).
- `kb-fixture/*.json` (NEW, plan-named) — 10 synthetic contract-shaped fixtures derived from `D:/KnowledgeBase` route code and generated types (read-only). Each carries a `_fixture` marker.
- `tests/kb-tools.test.ts`, `tests/source-kind.test.ts`, `tests/kb-fixture.ts` (NEW).
- `tests/index.test.ts` — three T-026 tests updated because A4/A18 change the behaviour they pinned: fixture verdict `"answered"` -> `"correct"` (serve rule needs the exact word), and the two outage tests now assert typed `unavailable` + fixed text instead of `isError` (A18).
- `README.md`, `.env.example` (adds the NAME `VC_KB_ANON_API_KEY`, no value) — docs/config names.
- Evidence: `qa/evidence/p1-u2-kb-tools/{red-before-impl,package-test,mutations}.txt`.
- falsified (unchanged): none (mutations were applied to changed files only and restored).

## Verification scope
Policy-Version: proportional-verification/2026-10-15.12
Tier: M (multi-file, one package; no auth/tenancy/production-write path; privacy-relevant anonymous egress is covered by A15c tests, not an L trigger)
Base / checked state: base 38e751d, code 4cef7de, clean worktree before the manifest commit (git status empty)
Gate answers: none. No KB call was made (the KB server was never started; fixtures are derived from route code), no paid provider, no production DB, no push.
Affected tests / full-suite trigger: `@vc/mcp-university-kb` only (67 tests: 29 pre-existing T-026/Mongo-tool tests incl. 3 updated + 38 new). The only other consumer is a comment in `packages/engine/src/cards/nodes.ts` (a structural mirror of the ask client, no import), so no other package test is affected. `.env.example` gained one name; the only test reading it (`apps/api/tests/auth.test.ts` T-025) asserts specific JWT names and is unaffected, but it was NOT run (apps/api deps not installed in this worktree). Builder ran no full suite. Safe-fallback / contract-line trigger: none.
Pre-check[A4]: 4cef7de bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="^A4" tests/kb-tools.test.ts -> pass 6 fail 0 t=16 blobs=mcp/university-kb/tests/kb-tools.test.ts:38de7df
Pre-check[A15c]: 4cef7de bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="^A15c" tests/kb-tools.test.ts -> pass 4 fail 0 t=5 blobs=mcp/university-kb/tests/kb-tools.test.ts:38de7df
Pre-check[A18]: 4cef7de bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="A18" tests/kb-tools.test.ts -> pass 3 fail 0 t=21 blobs=mcp/university-kb/tests/kb-tools.test.ts:38de7df,mcp/university-kb/tests/index.test.ts:88763c6
Pre-check[A22]: 4cef7de bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test tests/source-kind.test.ts -> pass 10 fail 0 t=16 blobs=mcp/university-kb/tests/source-kind.test.ts:c43797c
Metrics: start=2026-10-17T14:08:11+05:30 end=2026-10-17T14:22:40+05:30 wall_min=14 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=0 mutations=11 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=21 mutants=10 defects_unit=1 defects_6c=0

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/mcp/university-kb test` -> expected: 67 pass, 0 fail.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/mcp/university-kb typecheck` -> expected: exit 0.
- Per-criterion filters are the four Pre-check lines above.
- Mutation re-run: apply any single edit from the table below to the named src file; the named test must fail.

## Actual outputs (from maker's own run)
- Red first (TDD): `qa/evidence/p1-u2-kb-tools/red-before-impl.txt` — before any src change, `kb-tools.test.ts` and `source-kind.test.ts` failed with `ERR_MODULE_NOT_FOUND ... src/source-kind.js` and the updated `index.test.ts` serve-rule test failed with `Expected "actual" to be strictly unequal to: true`.
- Green: `qa/evidence/p1-u2-kb-tools/package-test.txt` — `ℹ tests 67 / ℹ pass 67 / ℹ fail 0`; `pnpm typecheck` exit 0.
- Honest note: the first full green run was 66/66; the mutation pass found one surviving mutant (M6, below), a test was added, giving 67.

## Capability coverage (each new claim -> its isolating falsification)
Observed column: PASS = the node in `package-test.txt` (67/67 green); FAIL = the first failed node reported by the mutant run in `mutations.txt` (the single edit applied to a src file, then restored).

| Criterion | capability (one line) | the check that covers it | the falsifying edit | observed |
|---|---|---|---|---|
| A4 | /ask served only when verdict == "correct" AND coverage ok AND no web | `kb-tools.test.ts` "A4 serve rule over the real client + MCP tool: ask-*.json" (5 fixtures incl. web_used, web-only, fallback-failed, ambiguous, one served) + "A4 applyServeRule matrix" | M1: delete `if (result.webUsed) withheld.push("web_used")` | FAIL: `A4 serve rule over the real client + MCP tool: ask-web-used.json -> no_sourced_answer`, `A4 applyServeRule matrix: only`. M2: delete the verdict check -> 4 fail, first `ask-web-used.json`/`ask-fallback-failed.json`. |
| A4/A18 | the generated answer and reason never leak when withheld; sources.web never reaches a served response | same tests (`JSON.stringify(result).includes(raw.answer) === false`), `A18: sources.web never reaches a served response` | M3: `citations: result.citations` instead of `{internal, web: []}` | FAIL: `A18: sources.web never reaches a served response` |
| A18 | outage = fixed no-answer text typed unavailable (not isError, no answer) | `A18: a KB outage yields the fixed no-answer text...`, updated T-026 outage tests in `index.test.ts` | covered by the matrix/fixed-text asserts (no dedicated mutant) | PASS in `package-test.txt`; NO ISOLATING FALSIFICATION run for this row (debt: none enumerated, verdict-level only) |
| A18 | no KB content copies in the repo | `A18: no KB content copies in the repo -- every file under kb-fixture/ is a declared synthetic fixture` | n/a (scan; scope is `kb-fixture/` only, not a whole-repo scan) | PASS; stated limit |
| A15c | anonymous client is structurally search-only | `A15c: anonymous profile exposes ONLY search_kb and kb_sources...` | M4: `createAnonymousKbClient` returns the full read client | FAIL: `A15c: anonymous profile exposes ONLY search_kb and kb_sources, needs no Db...` |
| A15c | anonymous profile guard holds even if handed a full client | `A15c: even handed a FULL client, the anonymous profile registers only...` | M6: drop `profile === "full" &&` from the get_session registration | FAIL: `A15c: even handed a FULL client...` (this test was added after M6 first survived) |
| A15c | wire-level: only `GET /search?q` and `GET /sources`, no identity headers, no /ask, no /sessions, nothing logged (12 hostile turns) | `A15c: 12 anonymous turns (hostile text included)...` | M5: network error detail echoes the underlying message | FAIL: `typed unavailable: timeout and network error on every read method; the network detail never echoes the query text` |
| A22 | WhatsApp wins over any listing; unlisted = unknown | `source-kind.test.ts` (A22 fixtures; hostile whatsapp-listed-as-seminar; both-lists; /sources down) | M7: delete the `whatsapp-batch` branch | FAIL: `A22 fixtures: whatsapp-batch -> whatsapp, ...`, `hostile: a WhatsApp source listed as seminar by mistake is STILL whatsapp` (4 fail) |
| A22 | default for unlisted is unknown, not seminar | same file | M8: unlisted falls through to `internal-seminar` | FAIL: `A22 fixtures: ...` (4 fail) |
| A22/G1 | `/sources` fetched once; only {id, kind} kept | `resolver fetches /sources ONCE...` | M10: remove the cache return | FAIL: `resolver fetches /sources ONCE across many tags and keeps only {id, kind}` |
| U2 drop rule | null-turn / null-session hits are dropped and counted, never served | `search_kb: GET /search?q&k with Bearer; hits with null turn/session are dropped and counted...` | M9: push the raw hit when parse fails | FAIL: that test + `search_kb: with /sources down, every hit is unknown` (3 fail) |

## Not done / stated limits (for the checker)
- Fixtures are **derived from route code and generated types, not recorded from the live KB**: the KB server was not started, no KB key exists yet (G4 is an ops action). The plan's "record contract fixtures from the live KB API" remains to be done once the scoped key is provisioned; the same tests should be re-pointed at those recordings.
- Out of this unit by plan: the claims guard and the "search insufficient" threshold (U6), A13 staleness flags (`session.date` is returned so U6 can compute them), A22 verbatim-run and detector checks (engine, U6).
- `src/bin.ts` is unchanged: the stdio entry still builds the full profile only. The anonymous student route (U7) is expected to use `createAnonymousKbClient` in-process.
- The old T-026 outage behaviour (MCP `isError`) was deliberately replaced by typed `unavailable` + fixed text per A18; contract B21's "degrades to knowledge unavailable" wording is consistent with it.
- No `senior-software-engineer` review was dispatched (instruction: do not dispatch a checker); the orchestrator owns that.

## Live browser evidence
Not UI-touching — no surface changed (changed paths: `mcp/university-kb/**`, `.env.example`, `qa/`).

## Status: ready-for-check
