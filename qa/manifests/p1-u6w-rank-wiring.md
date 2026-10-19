# Manifest — p1-u6w-rank-wiring
**Contract:** C1..C5 (unit-local ids, below). Parent rows: spec v8 A16, A16b, B24.8 (wiring half of unit `p1-u6b-profile-ranking`, checked-PASS, `qa/verdicts/p1-u6b-profile-ranking.md`); gate answers D-093 4A/6A, D-097 item 3. Fixes ISS-163 (verdict FINDINGS 1) and carries ISS-167 into the response. Brief `qa/evidence/p1-briefs/p1-u6w-build.md`.
**Criteria:** C1 confirmed chat facts reach the ranker (ISS-163), C2 NOT PROVEN on every per-option number (ISS-167), C3 tenancy, C4 a ranking failure never breaks the turn, C5 anonymous mode never ranks; cycle-1 repair items C6 ranked numbers are `unverified`, C7 no ranking on textless turns, C8 `profileFactsUsed` redacted before storing, C9 tenancy test asserts the student id, C10 `weightsForTenant` tenant isolation, C11 non-vacuous anonymous spy
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 1 of max 2
**Repair base:** 1dd12d1
**Dual check:** required
dual-trigger: tenancy apps/api/src/chat.ts:508 (`withRanking` reads the student's stored profile facts through the tenant-scoped Db and the Pathlynks facts through the tenant+student port; the ranking must never see another tenant's or student's facts)
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

### Cycle 1 repair criteria (restated from the repair brief `qa/evidence/p1-briefs/p1-u6w-repair1.md`; gate answer D-097 item 3: real per-option numbers are NOT PROVEN (ISS-167), no number is presented as fact)
- **C6 (senior review MEDIUM)** `withRanking` (`apps/api/src/chat.ts`, the ranked-claims map) builds number claims from `rankOptions` that U6b marks `status: "attributed"`. A NOT PROVEN number must not carry an attributed status: every ranked number claim is now `status: "unverified"` (and keeps the `NOT PROVEN: ` prefix). The resulting `unverified_claim` gap counter is accepted; the reply still returns 200.
- **C7 (checker A P1, LOW)** ranking ran on textless / unconsented-minor turns, so the option port was called. `handleTurn` now calls `withRanking` only when `persistText` is true (the turn stores text). A turn with no student text cannot select `rank_options` (the graph needs the rank wording), so no separate empty-text gate exists.
- **C8 (checker A P4, LOW)** `profileFactsUsed` values were stored unredacted. The stored copy now runs each value through the same `redact` (U8r) as the message and claims.
- **C9 (checker B P1, LOW)** the tenancy test also asserts the student id seen by the profile port and the option-list callback (a second student of the same tenant with opposite facts; assertions ADDED, none removed).
- **C10 (checker B P2, LOW)** `weightsForTenant` receives the asking tenant's id (`ranking.weightsForTenant?.(ctx.tenantId)`, unchanged code, now pinned); tenant A's weights never apply to tenant B.
- **C11 (checker B P3 / A note, LOW)** the old C5 anonymous test's port spy was never wired to the anonymous route (vacuous). New test: the anonymous API is built with live ranking, profile and `dbForTenant` spies in its deps (cast), asked to rank, and none is called; the same spies, wired to the authenticated route, ARE called (control). The old C5 test is kept.
- Out of scope, untouched: no deadline on ranking callbacks, double Pathlynks fetch, the "X vs Y" trigger, `OptionDataPort` tenant argument, `index.ts` wiring owner.

## What changed
Cycle 0: code commit `fe47e01` on branch `p1/u6w` (base `ef0c3aa` = main). Cycle 1 repair (base `1dd12d1`): code commits `6f4173a` and `cb1ad5b` (net: `apps/api/src/chat.ts` +4 lines in three places, `apps/api/tests/chat-rank.test.ts` +5 tests and +assertions in the tenancy test); evidence `qa/evidence/p1-u6w-c1/` and this manifest in a later commit.
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
Round: 2 files, 6 criteria, est 25 min — three small edits in one existing file (`chat.ts`), six tests in one existing test file, 7 single-edit falsifications in a scratch copy under D:/vc/.worktrees (lock waits dominate); the suite runs are 12 s + 4 s + 22 s
Base / checked state: repair base 1dd12d1 (cycle 0 checked fe47e01, both checkers PASS), cycle-1 code cb1ad5b, worktree clean except `qa/evidence/p1-u6w-c1/` and this manifest
Affected tests / full-suite trigger: `apps/api` (chat-rank, chat, chat-privacy, chat-profile, anonymous-route, anonymous-zero-persistence, student-openapi, student-auth) and the unchanged U6b `packages/engine/tests/rank.test.ts`; `pnpm -r typecheck`. Repair diff touches only `apps/api/src/chat.ts` and `apps/api/tests/chat-rank.test.ts`. The unit stays in a batch with a tier L tenancy unit, so the 6c step runs the full sharded suite (.13-2 (a)); this unit does not run it itself.
Tests[C1]: tests/chat-rank.test.ts "U6w item 1" x3 — two students with different confirmed chat facts (stored as source 'chat') get different orders and `profileFactsUsed` carries `student-confirmed`; a proposed-only student gets every option insufficient_data and no fact used; the mapping turns exactly {chat, confirmed} into student-confirmed while {chat, proposed}, {chat-extracted, confirmed}, {chat, erased} and an unknown label stay unmapped and the ranker ignores and counts them.
Tests[C2]: "U6w item 2 ISS-167" — every number claim starts `NOT PROVEN: `, the reply message holds the notice, and the thread read back from the store carries the prefixed claims.
Tests[C3]: "U6w item 3 tenancy" — same student id in tenant A and B with opposite facts: A's claims and `profileFactsUsed` are byte-equal before and after B confirms its facts; the profile port and the option-list callback see only tenant-a; B gets its own different order.
Tests[C4]: "U6w item 4" x2 — a throwing option port, option-list callback and weights callback each still give 200 with the plain reply, no ranking, a `chat_rank_failed` log line with `error: "TypeError"`, and a log that holds none of the fact values, the student id or the exception message; an ordinary question never touches the port and a rank question with no ranking wired behaves as before.
Tests[C5]: "U6w item 5" — anonymous "rank my shortlist" gives `sign_in_required`, no claims, no `rankingProfile`, no `profileFactsUsed`, the port is never called, and the anonymous deps carry no ranking, profile or student-store port.
mutant-cap-raise: the brief asks for one falsification per criterion; C1 names three independent mapping behaviours (label, status, label allow-list), C3 two (the stored-facts read and the option-list callback) and C4 four (rethrow, no log, message leak, only rank_options), so 12 single-edit mutants ran in one lock hold; 0 survivors.
Tests[C6]: tests/chat-rank.test.ts "U6w cycle 1 C6" — every claim of a ranked turn (live and read back from the stored thread) has status unverified, number claims keep `NOT PROVEN: `, and the `unverified_claim` gap counter was incremented.
Tests[C7]: "U6w cycle 1 C7" — an unconsented minor's rank turn gives 200, no claims, and 0 calls on the option-port spy, the option-list callback and the weights callback; control: the same wiring calls all three for an adult.
Tests[C8]: "U6w cycle 1 C8" — a Pathlynks fact value with a phone number is used by the ranker (stored `profileFactsUsed` row exists) and no part of the number appears anywhere in the stored Db.
Tests[C9]: "U6w item 3 tenancy" (extended, no assertion removed) — a second student of tenant A with opposite confirmed facts leaves syn-same's claims and `profileFactsUsed` unchanged, and the profile port and option-list callback see only `syn-same`.
Tests[C10]: "U6w cycle 1 C10" — the callback sees exactly ["tenant-a"] then ["tenant-b"]; tenant A (cost-only weights) gets a `custom-` profile, tenant B gets `student-success` and claims byte-equal to a world without tenant A's weights.
Tests[C11]: "U6w cycle 1 C11" — anonymous API with live ranking, profile and Db spies: `sign_in_required`, all four spies at 0; control: the same spies on the authenticated route are called. The old C5 test is kept.
Pre-check[C1]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 146 passed, 0 failed (cycle-0 criterion, regression run on the repaired sha) t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C2]: cb1ad5b same command as C1 -> green: 146 passed, 0 failed (cycle-0 criterion, regression run on the repaired sha) t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C3]: cb1ad5b same command as C1 -> green: 146 passed, 0 failed (cycle-0 criterion, regression run on the repaired sha) t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C4]: cb1ad5b same command as C1 -> green: 146 passed, 0 failed (cycle-0 criterion, regression run on the repaired sha) t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C5]: cb1ad5b same command as C1 -> green: 146 passed, 0 failed (cycle-0 criterion, regression run on the repaired sha) (anonymous-route and anonymous-zero-persistence included) t=12s blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[C6]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 146 passed, 0 failed t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C7]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 146 passed, 0 failed t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C8]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 146 passed, 0 failed t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C9]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 146 passed, 0 failed t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C10]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 146 passed, 0 failed t=12s blobs=apps/api/tests/chat-rank.test.ts:cd22afb
Pre-check[C11]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts -> green: 146 passed, 0 failed (anonymous-route and anonymous-zero-persistence included) t=12s blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[u6b-ranking]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test tests/rank.test.ts -> green: 33 passed, 0 failed t=4s blobs=packages/engine/tests/rank.test.ts:f65e783
Pre-check[typecheck]: cb1ad5b VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh pnpm -C . -r typecheck -> exit 0 (all workspaces) t=22s
Red first: `qa/evidence/p1-u6w-c1/red-before-fix.txt` (13 tests: 10 pass, 3 fail before the fix: C6, C7, C8; C9, C10, C11 are strengthenings of tests whose behaviour was already right, so they are pinned by falsification F9a/F9b/F10a/F11a below, not by a red run). Green after: `green-chat-rank.txt` (13 of 13, before the trim-gate cleanup).
Metrics: start=unavailable end=2026-10-19T07:57:26+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=7 survivors_final=0 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=unavailable mutants=7 defects_unit=unavailable defects_6c=0

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

### Cycle 1 falsifications (one per changed criterion; scratch copy `D:/vc/.worktrees/p1-u6w-fals-c1`, never the bound tree; runner output `qa/evidence/p1-u6w-c1/falsify-run.txt`; baseline 13/13 in the copy)
| id | falsifying edit | before | after | first failing test |
|---|---|---|---|---|
| F6a (C6) | ranked number claims keep U6b's `attributed` status (the `status: "unverified"` override removed) | 13/13 | 1 fail of 13 | U6w cycle 1 C6 |
| F7a (C7) | the `persistText` gate removed from the `withRanking` call | 13/13 | 1 fail of 13 | U6w cycle 1 C7 |
| F8a (C8) | `profileFactsUsed` stored without `redact` | 13/13 | 1 fail of 13 | U6w cycle 1 C8 |
| F9a (C9) | option-list callback asked with another student id | 13/13 | 1 fail of 13 | U6w item 3 tenancy |
| F9b (C9) | Pathlynks profile port asked with another student id | 13/13 | 1 fail of 13 | U6w item 3 tenancy |
| F10a (C10) | `weightsForTenant` called with a fixed `"tenant-a"` | 13/13 | 1 fail of 13 | U6w cycle 1 C10 |
| F11a (C11) | `anonymous.ts` handler calls ranking, profile and `dbForTenant` deps | 13/13 | 1 fail of 13 | U6w cycle 1 C11 |

Survivors (cycle 1): 0 of 7.

## Live browser evidence
Not applicable, no UI. The changed paths are `apps/api/src/chat.ts`, `apps/api/tests/chat-rank.test.ts` and `qa/`.

## Not done / stated limits (for the checker)
- **Real per-option numbers are NOT PROVEN (D-097 item 3, ISS-167).** `ChatRankingDeps.port` is typed and fixture-backed; no production adapter exists and none is wired in `startApi`. With `deps.ranking` absent (today's production state) a `rank_options` turn is answered exactly as before. The `NOT PROVEN` label is the guard for the day a port is supplied.
- **[ASSUMPTION, Q-U6b-2 still open]** the option list is the caller's: `ChatRankingDeps.optionIds(who)` is required and has no default (not a shortlist fact, not the question text). The fact keys that feed fit are U6b's synthetic `DEFAULT_FACT_KEY_MAP`.
- **[ASSUMPTION]** a refusal other than `no_options` (e.g. `invalid_weights`, `too_many_options`) returns the plain reply and logs `chat_rank_refused` with the reason; `no_options` is silent (normal when a student has no shortlist).
- Cycle 1: the ranked claims are now `kind: number, status: unverified` (C6) with the `NOT PROVEN: ` label, so each ranked turn increments the `unverified_claim` gap counter (accepted per the repair brief). They still have not passed `claims.ts`'s guard. The STORED `profileFactsUsed` values are redacted (C8); the live reply keeps them as the ranker returned them (the student's own facts).
- Cycle 1 limit: C8 redacts with the turn's `redact` (pattern + known-name heuristic), so a fact value that holds a name the student never stated and Pathlynks did not supply can still be stored; over-redaction is accepted, as everywhere in U8r.
- `startApi` (`apps/api/src/index.ts`) does not construct `ranking`; wiring a real port and a real option list is a later unit.
- No `senior-software-engineer` review dispatched by this builder (the orchestrator owns review).

## How to verify (commands + expected)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts` -> tests 141, pass 141, fail 0.
- `... pnpm -C <worktree>/packages/engine exec tsx --test tests/rank.test.ts` -> tests 33, pass 33, fail 0.
- `... pnpm -C <worktree> -r typecheck` -> exit 0.
- Evidence: `qa/evidence/p1-u6w/` (`red-before-impl.txt`, `precheck-*.txt`, `falsify-run.txt`).
