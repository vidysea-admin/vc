# Manifest — p1-u6w-rank-wiring
**Contract:** C1..C5 (unit-local ids, below). Parent rows: spec v8 A16, A16b, B24.8 (wiring half of unit `p1-u6b-profile-ranking`, checked-PASS, `qa/verdicts/p1-u6b-profile-ranking.md`); gate answers D-093 4A/6A, D-097 item 3. Fixes ISS-163 (verdict FINDINGS 1) and carries ISS-167 into the response. Brief `qa/evidence/p1-briefs/p1-u6w-build.md`.
**Criteria:** C1 confirmed chat facts reach the ranker (ISS-163), C2 NOT PROVEN on every per-option number (ISS-167), C3 tenancy, C4 a ranking failure never breaks the turn, C5 anonymous mode never ranks
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Dual check:** required
dual-trigger: tenancy apps/api/src/chat.ts:512 (`withRanking` reads the student's stored profile facts through the tenant-scoped Db and the Pathlynks facts through the tenant+student port; the ranking must never see another tenant's or student's facts)
**Persona walk:** skip (no human screen: JSON API only; the counselling turn text is the only student-visible change)
**Issues addressed:** ISS-163 (fixed here), ISS-167 (label carried into the response; the real data source is still NOT PROVEN)
**Executor:** claude-sonnet-subagent (maker/builder p1-u6w-build)
**Executor rationale:** one coherent hook in one existing file (`apps/api/src/chat.ts`) plus one new test file; the ranker itself (`packages/engine/src/student/rank.ts`) is untouched.

## Criteria
- **C1 ISS-163 confirmed chat facts reach the ranker** — profile facts stored by the chat path carry `source: 'chat'` (the db label) and `rankOptions` ignored them unless mapped. `chat` plus `status: confirmed` is mapped to the ranker's `student-confirmed` in ONE place (`rankFactFromStored`, `apps/api/src/chat.ts`), and `profileView` uses the same function. A 'chat'-sourced confirmed fact must change the ranking (hostile H4 of the U6b verdict); an unconfirmed (proposed) fact or a 'chat-extracted' or unknown label must not.
- **C2 ISS-167 / D-097 item 3** — any per-option number (cost, scholarship chance, visa ease) that reaches the student carries a visible `NOT PROVEN` label (in the reply message, in every number claim, and in the stored thread). No number is presented as fact.
- **C3 tenancy** — ranking reads only this tenant's and this student's facts. Test with two tenants and the same student id: tenant B's facts never affect tenant A's ranking, and only tenant A's id reaches the Pathlynks profile port and the option-list callback.
- **C4 a ranking failure never breaks the chat turn** — the reply still returns (200, the graph's plain answer, no ranking), and a server log line `chat_rank_failed` names the error class. No raw profile text, student id or error message is logged (U8r redaction holds).
- **C5 anonymous mode (U7) never ranks** — an anonymous visitor asking to rank gets `sign_in_required`; no ranking, no profile facts, and the option-data port is never asked. `anonymous.ts` has no ranking, profile or student-store dependency.

## What changed
Code commit `fe47e01` on branch `p1/u6w` (base `ef0c3aa` = main). Evidence and this manifest in a second commit.
- `apps/api/src/chat.ts` (EDITED IN PLACE; no other source file touched):
  - new exports `NOT_PROVEN_LABEL`, `rankFactFromStored` (the single db-label to ranker-label mapping, l.189), `ChatRankingDeps` (`port`, `optionIds`, optional `weightsForTenant`), and `ChatApiDeps.ranking?`;
  - new `withRanking` inside `createChatApi` (l.508-545), called in `handleTurn` right after the retryable/quiet branches and before the store step, only when `result.selectedTool === "rank_options"`: lists this student's stored facts (tenant-scoped Db) and the Pathlynks facts, maps the stored rows with `rankFactFromStored`, calls `rankOptions`, then merges `claims` (number claims prefixed `NOT PROVEN: `), `sources`, `profileFactsUsed`, `rankingProfile` and appends the NOT PROVEN notice to the message. Any throw, or a refusal other than `no_options`, returns the plain reply and logs `chat_rank_failed` / `chat_rank_refused` with the error class or refusal reason only;
  - `profileView` now takes the `student-confirmed` label from `rankFactFromStored` (same value as before, one source of truth);
  - header comment extended.
- `apps/api/tests/chat-rank.test.ts` (NEW, 8 tests): per-criterion outcome tests through the real chat handler and the in-memory Db.
- `qa/evidence/p1-u6w/` (red run, pre-checks, falsify run), this manifest. Nothing deleted or renamed. `packages/**`, `anonymous.ts`, `graph.ts`, `.claude/**`, contracts: untouched. No database, network or provider call.

## Verification scope
Policy-Version: proportional-verification/2026-10-18.15
Tier: L (tenancy: the new read of the student's stored and Pathlynks facts feeds a student-facing answer)
Round: est 25 min — one hook in one file, 5 criteria, 12 single-edit falsifications in a scratch copy under D:/vc/.worktrees (lock waits dominate)
Base / checked state: base ef0c3aa, code fe47e01, worktree clean except `qa/evidence/p1-u6w/` and this manifest
Affected tests / full-suite trigger: `apps/api` (chat, chat-privacy, chat-profile, anonymous-route, anonymous-zero-persistence, student-openapi, student-auth, chat-rank) and the unchanged U6b `packages/engine/tests/rank.test.ts`; `pnpm -r typecheck`. The batch contains a tier L tenancy unit, so the 6c step runs the full sharded suite (.13-2 (a)); this unit does not run it itself.
Tests[C1]: tests/chat-rank.test.ts "U6w item 1" x3 — two students with different confirmed chat facts (stored as source 'chat') get different orders and `profileFactsUsed` carries `student-confirmed`; a proposed-only student gets every option insufficient_data and no fact used; the mapping turns exactly {chat, confirmed} into student-confirmed while {chat, proposed}, {chat-extracted, confirmed}, {chat, erased} and an unknown label stay unmapped and the ranker ignores and counts them.
Tests[C2]: "U6w item 2 ISS-167" — every number claim starts `NOT PROVEN: `, the reply message holds the notice, and the thread read back from the store carries the prefixed claims.
Tests[C3]: "U6w item 3 tenancy" — same student id in tenant A and B with opposite facts: A's claims and `profileFactsUsed` are byte-equal before and after B confirms its facts; the profile port and the option-list callback see only tenant-a; B gets its own different order.
Tests[C4]: "U6w item 4" x2 — a throwing option port, option-list callback and weights callback each still give 200 with the plain reply, no ranking, a `chat_rank_failed` log line with `error: "TypeError"`, and a log that holds none of the fact values, the student id or the exception message; an ordinary question never touches the port and a rank question with no ranking wired behaves as before.
Tests[C5]: "U6w item 5" — anonymous "rank my shortlist" gives `sign_in_required`, no claims, no `rankingProfile`, no `profileFactsUsed`, the port is never called, and the anonymous deps carry no ranking, profile or student-store port.
mutant-cap-raise: the brief asks for one falsification per criterion; C1 names three independent mapping behaviours (label, status, label allow-list), C3 two (the stored-facts read and the option-list callback) and C4 four (rethrow, no log, message leak, only rank_options), so 12 single-edit mutants ran in one lock hold; 0 survivors.
Pre-check[C1]: fe47e01 VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 141 passed, 0 failed t=9s blobs=apps/api/tests/chat-rank.test.ts:6aab785
Pre-check[C2]: fe47e01 same command as C1 -> green: 141 passed, 0 failed (includes the 8 chat-rank tests, 8 of 8) t=9s blobs=apps/api/tests/chat-rank.test.ts:6aab785
Pre-check[C3]: fe47e01 same command as C1 -> green: 141 passed, 0 failed t=9s blobs=apps/api/tests/chat-rank.test.ts:6aab785
Pre-check[C4]: fe47e01 same command as C1 -> green: 141 passed, 0 failed t=9s blobs=apps/api/tests/chat-rank.test.ts:6aab785
Pre-check[C5]: fe47e01 same command as C1 -> green: 141 passed, 0 failed (anonymous-route and anonymous-zero-persistence included) t=9s blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[u6b-ranking]: fe47e01 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test tests/rank.test.ts -> green: 33 passed, 0 failed t=2s blobs=packages/engine/tests/rank.test.ts:f65e783
Pre-check[typecheck]: fe47e01 bash scripts/vc-testlock.sh pnpm -C . -r typecheck -> exit 0 (all workspaces) t=19s
Red first: `qa/evidence/p1-u6w/red-before-impl.txt` (chat-rank.test.ts failed to import `rankFactFromStored` before the implementation existed; the ISS-163 half is shown red by falsification I1a below).
Metrics: start=2026-10-19T05:30:55+05:30 end=2026-10-19T05:42:00+05:30 builder_min=unavailable wall_min=11 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=12 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=unavailable mutants=12 defects_unit=unavailable defects_6c=0

## Capability coverage (each criterion -> falsifying edit, run in a scratch copy of `apps/api` and `packages/engine` under `D:/vc/.worktrees/p1-u6w-fals`, never the bound tree; runner and output `qa/evidence/p1-u6w/falsify-run.txt`)
Baseline of `tests/chat-rank.test.ts` in the scratch copy: 8/8. "after" is the run with exactly the stated single edit; the file was restored after each.
| id | falsifying edit | before | after | first failing test |
|---|---|---|---|---|
| I1a (C1) | `rankFactFromStored` passes the db label through (no mapping) | 8/8 | 6 fail of 8 | U6w item 1 ISS-163: facts the student confirmed in chat (db label source 'chat') change the ranking |
| I1b (C1) | the mapping ignores status (a proposed chat fact counts) | 8/8 | 1 fail of 8 | U6w item 1: the one mapping turns exactly {source 'chat', status 'confirmed'} ... |
| I1c (C1) | any confirmed row counts as student-confirmed, whatever its label | 8/8 | 1 fail of 8 | same mapping test |
| I2a (C2) | number claims lose the NOT PROVEN prefix | 8/8 | 1 fail of 8 | U6w item 2 ISS-167 |
| I2b (C2) | the reply message loses the NOT PROVEN notice | 8/8 | 1 fail of 8 | U6w item 2 ISS-167 |
| I3a (C3) | stored facts are read from another tenant's Db | 8/8 | 3 fail of 8 | U6w item 1 ISS-163 (and the tenancy test) |
| I3b (C3) | the option-list callback is asked with a fixed tenant id | 8/8 | 1 fail of 8 | U6w item 3 tenancy |
| I4a (C4) | a ranking failure is rethrown | 8/8 | 1 fail of 8 | U6w item 4: a throwing option port ... |
| I4b (C4) | the failure is not logged | 8/8 | 1 fail of 8 | U6w item 4: a throwing option port ... |
| I4c (C4) | the failure log carries the exception message | 8/8 | 1 fail of 8 | U6w item 4: a throwing option port ... |
| I4d (C4) | ranking runs for every turn, not only `rank_options` | 8/8 | 1 fail of 8 | U6w item 4: an ordinary question never touches the ranking port |
| I5a (C5) | the engine graph's anonymous refusal is removed (rank question reaches search) | 8/8 | 1 fail of 8 | U6w item 5: an anonymous visitor asking to rank gets sign_in_required |

Survivors: 0 of 12.

## Live browser evidence
Not applicable, no UI. The changed paths are `apps/api/src/chat.ts`, `apps/api/tests/chat-rank.test.ts` and `qa/`.

## Not done / stated limits (for the checker)
- **Real per-option numbers are NOT PROVEN (D-097 item 3, ISS-167).** `ChatRankingDeps.port` is typed and fixture-backed; no production adapter exists and none is wired in `startApi`. With `deps.ranking` absent (today's production state) a `rank_options` turn is answered exactly as before. The `NOT PROVEN` label is the guard for the day a port is supplied.
- **[ASSUMPTION, Q-U6b-2 still open]** the option list is the caller's: `ChatRankingDeps.optionIds(who)` is required and has no default (not a shortlist fact, not the question text). The fact keys that feed fit are U6b's synthetic `DEFAULT_FACT_KEY_MAP`.
- **[ASSUMPTION]** a refusal other than `no_options` (e.g. `invalid_weights`, `too_many_options`) returns the plain reply and logs `chat_rank_refused` with the reason; `no_options` is silent (normal when a student has no shortlist).
- The ranked claims keep U6b's `kind: number, status: attributed`; they have not passed `claims.ts`'s guard (the API layer's call, as the U6b manifest noted). The stored response keeps the `profileFactsUsed` values as given (db values are already redacted; Pathlynks values only for the fact-map keys).
- `startApi` (`apps/api/src/index.ts`) does not construct `ranking`; wiring a real port and a real option list is a later unit.
- No `senior-software-engineer` review dispatched by this builder (the orchestrator owns review).

## How to verify (commands + expected)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts` -> tests 141, pass 141, fail 0.
- `... pnpm -C <worktree>/packages/engine exec tsx --test tests/rank.test.ts` -> tests 33, pass 33, fail 0.
- `... pnpm -C <worktree> -r typecheck` -> exit 0.
- Evidence: `qa/evidence/p1-u6w/` (`red-before-impl.txt`, `precheck-*.txt`, `falsify-run.txt`).
