# Manifest — p1-u2-kb-tools
**Contract:** none yet for P1 (U0 contract amendments are checker-owned and pending). Criteria are taken from the approved spec v8, `qa/evidence/p1-plan-draft-20261017/spec.md` (D-089): **A4** (/ask serve-rule fixtures), **A15c** (anonymous egress is search-only and identity-free), **A18** (no web answer; outage = fixed no-answer text; no KB content copies), **A22 tagger part** (source-kind mapping). Plan row: `plan.md` U2.
**Goal task:** none
**Date:** 2026-10-17
**Fix cycle:** 1 of max 2
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

## Cycle-0 status (superseded by the Fix-cycle: 1 section below): ready-for-check

## Fix-cycle: 1
**Fix cycle:** 1 of max 2 (this section supersedes the cycle-0 header counts and the "67 tests" figures above; package now has 72 tests)
Repair base: ac67455
Repair SHA: 61dabdc (branch p1/u2; code and tests only under `mcp/university-kb/`; evidence added under `qa/evidence/p1-u2-kb-tools/*-cycle1.txt` in the manifest commit)
Policy-Version: proportional-verification/2026-10-15.12
Source: fresh ai-engineer review (Warning), six fixes. TDD: tests and fixtures were changed first and run red against the unchanged src (`red-before-impl-cycle1.txt`: 72 tests, 64 pass, 8 fail), then src was fixed (`package-test-cycle1.txt`: 72 tests, 72 pass, 0 fail; `typecheck-cycle1.txt`: exit 0).

### What changed
1. **No coverage is `no_sourced_answer`, not `unavailable`** (`src/kb-client.ts`, `ask()`): the zero-citation check now applies only when `verdict == "correct"` (a correct answer with zero internal and zero web sources is still withheld, as typed `unavailable`/`uncited`). Any other verdict with zero sources is returned `ok` and the serve rule maps it to `no_sourced_answer`. Outages (timeout, network, 5xx, 401/403, non-JSON, schema-invalid) are unchanged and stay `unavailable`. `kb-fixture/ask-fallback-failed.json` is now realistic (verdict incorrect, insufficient_coverage true, internal [], web []); its withheld list is now `verdict_not_correct, insufficient_coverage, no_internal_sources`. The T-026 test `uncited: ...` in `kb-client.test.ts` was changed on purpose to feed verdict `"correct"` (its fixture used verdict `"answered"`, which is now correctly a no-coverage case, not an outage).
2. **`speakerLabel` only for seminar or toc** (`src/index.ts`, `search_kb` and `get_session`, both profiles): the label is dropped (absent) unless the source kind is `internal-seminar` or `toc`; whatsapp and unknown never carry it. The old assertion at `kb-tools.test.ts` (WhatsApp label passes) was changed on purpose; fixtures gained labels on `t-sem-1` and `t-rec-9` (search) and `t-sem-1` (session) so the seminar-passes and unknown-drops cases are observable.
3. **Served `ask_knowledge_base` carries `sourceKind: "unknown"`** at the answer level (`applyServeRule` answered variant + tool `outputSchema`); withheld and unavailable results carry none.
4. **`ask_knowledge_base` `query` is `max(1000)`**, same as `search_kb` (test: 1001 chars rejected before the client is called; 1000 accepted).
5. **Search hit cross-check** (`src/kb-client.ts`, `search()`): a hit whose `turn._id != turnId`, whose `session._id != sessionId`, or which has no `turn._id` is dropped and counted in `dropped`, like a null hit.
6. **Deliberate strictness vs the spec (documentation):** the 4th serve clause (>= 1 *internal* source) is stricter than spec G6 on purpose. Spec G6 would serve a `correct`, full-coverage, no-web answer on any source; this unit also requires an internal source, so a `correct` answer backed only by `sources.web` (fixture `ask-web-only.json`) is withheld as `no_internal_sources`. Reason: A18 forbids a web answer reaching the student and web sources never leave this module, so an answer with no internal citation has nothing citable to serve. Stated in the `applyServeRule` docstring too. The checker may overrule this by amending the spec; the change would be one line in `applyServeRule` plus the `ask-web-only` expectation.

### Verification scope (cycle 1)
Tier: M (same as cycle 0). Affected tests: `@vc/mcp-university-kb` only (72 tests; the only other consumer is a comment in `packages/engine/src/cards/nodes.ts`, no import). No full-repo suite run by the builder. No KB call, no paid provider, no production DB, no push.
Pre-check[G6]: 61dabdc bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="G6" tests/kb-tools.test.ts -> pass 2 fail 0 t=19 blobs=mcp/university-kb/tests/kb-tools.test.ts:eebb882
Pre-check[G6-uncited]: 61dabdc bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="^uncited" tests/kb-client.test.ts -> pass 1 fail 0 t=2 blobs=mcp/university-kb/tests/kb-client.test.ts:f7d1148
Pre-check[A4]: 61dabdc bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="^A4" tests/kb-tools.test.ts -> pass 6 fail 0 t=3 blobs=mcp/university-kb/tests/kb-tools.test.ts:eebb882
Pre-check[U2-label]: 61dabdc bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="speakerLabel passes only|search_kb: GET /search" tests/kb-tools.test.ts -> pass 2 fail 0 t=3 blobs=mcp/university-kb/tests/kb-tools.test.ts:eebb882
Pre-check[U2-crosscheck]: 61dabdc bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="a search hit whose turn" tests/kb-tools.test.ts -> pass 1 fail 0 t=2 blobs=mcp/university-kb/tests/kb-tools.test.ts:eebb882
Pre-check[U2-askcap]: 61dabdc bash scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test --test-name-pattern="U2b fix 4" tests/kb-tools.test.ts -> pass 1 fail 0 t=3 blobs=mcp/university-kb/tests/kb-tools.test.ts:eebb882
Full package: `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/mcp/university-kb test` -> 72 pass, 0 fail; `... typecheck` -> exit 0.

### Falsification table (one named falsification per changed criterion; each run in a COPY of the package at `scratchpad/u2b-mut` with `node_modules` junctioned, the repair worktree never mutated; green before, red after, restored identical and green again). Run over `kb-tools`, `kb-client` and `index` test files (62 tests; baseline 62 pass 0 fail, restored 62 pass 0 fail). Full output: `qa/evidence/p1-u2-kb-tools/mutations-cycle1.txt`.
| Criterion | Falsifying edit (single, in the copy) | After: first failed node(s) |
|---|---|---|
| G6 no coverage | M1: drop `data.verdict === "correct" &&` so uncited applies to every verdict | 3 fail: `G6: a realistic no-coverage /ask ...`, `G6: verdict correct with zero ...`, `A4 ... ask-fallback-failed.json` |
| U2-label (search_kb) | M2a: pass `speakerLabel` for every source kind | 2 fail: `search_kb: GET /search ...`, `U2b: speakerLabel passes only for seminar/toc` |
| U2-label (get_session) | M2b: same in `get_session` | 1 fail: `U2b: speakerLabel passes only ...` |
| U2-label (whatsapp) | M2c: add `kind === "whatsapp"` to the allow list | 2 fail: same two as M2a |
| A4 / sourceKind | M3: served answer without `sourceKind` | 1 fail: `A4 serve rule ... ask-correct.json -> served` |
| U2-askcap | M4: remove `.max(1000)` from the ask `query` | 1 fail: `U2b fix 4: ask_knowledge_base query is capped ...` |
| U2-crosscheck (turn) | M5a: remove the `turn._id === turnId` clause | 1 fail: `U2b: a search hit whose turn._id != turnId ...` |
| U2-crosscheck (session) | M5b: remove the `session._id === sessionId` clause | 1 fail: same test |

Metrics: start=2026-10-17T14:28:56+05:30 end=2026-10-17T14:33:55+05:30 cycle=1 mutations=8 suite_runs=3 policy=proportional-verification/2026-10-15.12 lane=normal

## Status: ready-for-check
