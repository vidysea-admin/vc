# Manifest — p1-iss303-authcap
**Contract:** none yet for this unit (checker-owned). Criteria come from the source brief `qa/evidence/p1-briefs/p1-iss303-authcap.md`, issue ISS-303 and ISS-300 (`qa/issues.jsonl`), decision D-103 item 3, contract `qa/contracts/counselling-engine.md` B24.7 (crisis scan before the limiter), and the precedent unit `p1-iss135-anon-crisis-budget` (D-101).
**Date:** 2026-10-19
**Fix cycle:** 0
**Dual check:** no
**Persona walk:** skip (API-only, no screen)
**Issues addressed:** ISS-303
**Executor:** claude-sonnet-subagent (maker/builder p1-iss303)

Status: ready-for-check

## Criteria
- **CAP** — the authenticated chat body cap `MAX_CHAT_BODY_BYTES` is 64 KiB (was 256 KiB), the same scan budget as the anonymous route (ISS-135/ISS-300).
- **HELPLINE** — a turn body over the cap (100 KiB and 300 KiB, crisis phrase at the start, middle and end, and a body rejected while streaming) is a 413 `body_too_large` that carries the Tele-MANAS helpline, with zero model calls, zero stored turns, zero flags. It is never scanned (same as the anonymous route).
- **CRISIS** — a crisis phrase at the start, middle or end of a body inside the cap (about 50 KiB, far over the 4000-character turn limit) still gets the fixed crisis answer (`escalated`, 14416); the same size without a crisis phrase is still a 400.
- **RATE** — a student already at 429 who sends a long (50 KiB, start/middle/end) or short crisis message still gets `escalated`; a plain message is 429 (crisis scan before the limiter, A23, unchanged).
- **REG** — no regression: the chat, chat-privacy, chat-profile, chat-rank, student-openapi and anonymous-route test files stay green; `pnpm -r typecheck` exits 0.

## Findings (the question asked)
Before this change (read of `apps/api/src/chat.ts` at c1027c9, plus checker A's earlier probe in `qa/verdicts/p1-iss135-anon-crisis-budget.A.md`): on the authenticated turn route the crisis scan already ran on the FULL text before the limiter. Rate-limited crisis, over-turn-limit crisis and the L5 over-long exception all already surfaced the crisis answer (criteria CRISIS and RATE were green on the unchanged code, `qa/evidence/p1-iss303/red.txt`). Two gaps matched the ISS-135 class: (1) the cap was 256 KiB, 4x the anonymous scan budget, with the scan running twice per turn; (2) a body over the cap was a bare 413 with no helpline. A body over the cap is not scanned on either route; that is the D-101 design, kept.

## What changed
Code commit `0dc9d52` on `p1/iss303` (base c1027c9 = origin/main). Edited in place, no new source file:
- `apps/api/src/chat.ts`: `MAX_CHAT_BODY_BYTES` 256 -> 64 KiB with the comment; `readJson` takes `{ helpline?: boolean }` and the turn route's two 413 branches answer `{ error: "body_too_large", helpline: TELE_MANAS_LINE }` (other routes keep the bare 413); `handleTurn` computes `crisisGuard(text).level` once (it was two scans of the same text); import `TELE_MANAS_LINE` from `@vc/engine`.
- `apps/api/src/openapi.ts`: `postChatTurn` documents the 413 (64 KiB, helpline) using the existing `AnonymousError` schema.
- `apps/api/tests/chat.test.ts`: four new `ISS-303` tests; no existing test touched.
- Not touched: auth code, `anonymous.ts`, the engine guard, `.claude/**`, `.env`.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.16
Tier: M (authenticated chat route, crisis safety path; one constant, one helper option, one de-duplicated call)
Round: 3 files, 5 criteria, est 25 min — red tests first, in-place fix, 3 falsifications in a copy, the six affected API test files whole, repo typecheck
Base / checked state: base c1027c9, code 0dc9d52, a manifest-and-evidence-only commit on top
Affected tests / full-suite trigger: `apps/api` chat/openapi/anonymous test files only; no `packages/*` file changed, so no engine/db suite and no full-suite trigger.
Tests[CAP]: apps/api/tests/chat.test.ts ("ISS-303: the authenticated chat body cap...") — constant is 64 KiB
Tests[HELPLINE]: apps/api/tests/chat.test.ts ("ISS-303: a turn body over the cap...") — 413 + helpline at 100/300 KiB x 3 positions and on a streaming rejection; no model, nothing stored
Tests[CRISIS]: apps/api/tests/chat.test.ts ("ISS-303: a crisis phrase at the start...") — escalated for 3 positions inside the cap; plain over-long is 400
Tests[RATE]: apps/api/tests/chat.test.ts ("ISS-303: a student already over the rate limit...") — escalated while 429 for plain
Tests[REG]: apps/api/tests/chat.test.ts, chat-privacy.test.ts, chat-profile.test.ts, chat-rank.test.ts, student-openapi.test.ts, anonymous-route.test.ts — existing behaviour unchanged
Pre-check[CAP]: 0dc9d52 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="ISS-303: the authenticated chat body cap" tests/chat.test.ts -> pass 1 (0 failed) blobs=apps/api/tests/chat.test.ts:f18557c408172cb3cab3df3cfce83882ad17ab4a,apps/api/src/chat.ts:7f9ccaa9fa7fa1b5e80ef19010cb7e2a1b40fc1f
Pre-check[HELPLINE]: 0dc9d52 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="ISS-303: a turn body over the cap" tests/chat.test.ts -> pass 1 (0 failed) blobs=apps/api/tests/chat.test.ts:f18557c408172cb3cab3df3cfce83882ad17ab4a,apps/api/src/chat.ts:7f9ccaa9fa7fa1b5e80ef19010cb7e2a1b40fc1f
Pre-check[CRISIS]: 0dc9d52 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="ISS-303: a crisis phrase at the start" tests/chat.test.ts -> pass 1 (0 failed) blobs=apps/api/tests/chat.test.ts:f18557c408172cb3cab3df3cfce83882ad17ab4a,apps/api/src/chat.ts:7f9ccaa9fa7fa1b5e80ef19010cb7e2a1b40fc1f
Pre-check[RATE]: 0dc9d52 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="ISS-303: a student already over the rate limit" tests/chat.test.ts -> pass 1 (0 failed) blobs=apps/api/tests/chat.test.ts:f18557c408172cb3cab3df3cfce83882ad17ab4a,apps/api/src/chat.ts:7f9ccaa9fa7fa1b5e80ef19010cb7e2a1b40fc1f
Pre-check[REG]: 0dc9d52 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/chat-rank.test.ts tests/student-openapi.test.ts tests/anonymous-route.test.ts -> pass 112 (0 failed) blobs=apps/api/tests/chat.test.ts:f18557c408172cb3cab3df3cfce83882ad17ab4a,apps/api/src/chat.ts:7f9ccaa9fa7fa1b5e80ef19010cb7e2a1b40fc1f

## How to verify (commands + expected)
- Per criterion: the Pre-check lines above (cwd = worktree root, TMP/TEMP on D:); logs `qa/evidence/p1-iss303/precheck-<id>.txt`.
- Affected set: the REG line -> tests 112 pass 112 fail 0 (`green-affected.txt`).
- `bash scripts/vc-testlock.sh pnpm -r typecheck` -> exit 0 (`typecheck.txt`).

## Actual outputs
- Red first: `qa/evidence/p1-iss303/red.txt` — on the 256 KiB code CAP and HELPLINE failed (tests 4, pass 2, fail 2); CRISIS and RATE were already green (they guard behaviour that must stay).
- Green: `green-iss303.txt` (4/4), `green-affected.txt` (112/112), `typecheck.txt` (exit 0).

## Capability coverage (one falsification per criterion, in a COPY: detached worktree `.worktrees/p1-iss303-fals` at 0dc9d52, since removed)
Baseline: `base-green.txt` (ISS-303 pass 4 fail 0). Restored after each mutant (`git checkout`): `restored-green.txt` pass 4 fail 0.
| Criterion | mutation (apps/api/src/chat.ts) | after (red) | log |
|---|---|---|---|
| CAP | constant back to 256 KiB | 2 fail of 4 (CAP, HELPLINE) | fals-M1-cap-256.txt |
| HELPLINE | `opts.helpline ? respond(...)` -> `false ? ...` (bare 413) | 1 fail of 4 | fals-M2-413-no-helpline.txt |
| RATE | `if (!crisis) {` -> `if (true) {` (limiter before the crisis exemption) | 1 fail of 4 (RATE) | fals-M3-limiter-before-crisis.txt |
CRISIS and REG have no separate mutant: CRISIS was green on the old code (guard test), and the existing L5 tests in chat-privacy cover the over-long branch.

## Not done / stated limits
- Changed by design, for Umesh to confirm: a student body over 64 KiB now gets a 413 where 64-256 KiB used to be scanned and answered. A 64 KiB body is about 16x the turn limit. Both routes now share one budget.
- A body over the cap is NOT scanned on either route (D-101 design); the helpline in the 413 is the safety net. Scanning an over-cap body would need reading it, which is the CPU the cap exists to bound.
- The CPU claim is by construction (a 4x smaller maximum scan input, one scan instead of two), not a timing benchmark. The residual (crisis scan unlimited per student by B24.7, up to 64 KiB) is the same as ISS-300 and is Umesh's call.
- The fresh-context `senior-software-engineer` review of the diff has NOT run (the maker may not review its own code); the caller dispatches it.
- `readJson` callers: the turn route (helpline) and the fact-decision route (bare 413, now also 64 KiB; a decision body is a few hundred bytes).
