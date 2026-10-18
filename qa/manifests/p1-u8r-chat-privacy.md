# Manifest — p1-u8r-chat-privacy
**Contract:** C1, C2, C3, C4, C5, C6 (unit-local ids, below). Parent: unit `p1-u8-chat-api` (checker A PASS with findings `qa/verdicts/p1-u8-chat-api.md`, checker B `qa/verdicts/p1-u8-chat-api.b.md`), senior review `qa/evidence/p1-briefs/p1-u8-review-result.md`. Gates: D-093 6A (persist redacted), 4A (unconsented minor: no text), D-096/D-097. Brief `qa/evidence/p1-briefs/p1-u8r-build.md`.
**Criteria:** C1 profile outage fails closed (M1), C2 crisis write cap (M2), C3 lower-case self-introductions (A1), C4 stated names redacted in the model reply (A2), C5 escalation path gets redacted text (B medium), C6 fact key redacted (low)
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Dual check:** required
dual-trigger: security apps/api/src/chat.ts:464 (the redaction/persistence decision: `persistText` now also refuses to store while the Pathlynks profile name cannot be redacted; `chat.ts:455` 503; `chat.ts:469` stated names; `chat.ts:337` escalation text)
**Persona walk:** skip (no human screen: JSON API only)
**Issues addressed:** none (repairs the p1-u8 PROPOSED-ISSUEs: lower-case names, echoed names, crisis rationale, plus the senior review M1/M2)
**Executor:** claude-sonnet-subagent (maker/builder p1-u8r-build)
**Executor rationale:** one coherent repair of the redaction/persistence site in `apps/api/src/chat.ts` with the helper it calls in `packages/schemas`; two small dependent edits in `packages/db`; shared fake-DB test world.

## Criteria
- **C1 profile outage fails closed (M1)** — when `profile.facts` throws, a Pathlynks name cannot be redacted, so redaction must not fail open: an ordinary turn is refused 503 `profile_unavailable` before any write (a retry of the same turn id then works, no 409), and a crisis turn is still answered with the helpline and escalated but its text is not stored. Unredacted text is never stored.
- **C2 crisis write cap (M2)** — crisis detection stays before the limiter and the helpline text is always returned, but per student and thread the first crisis turn in a 10-minute window is stored, flagged, escalated and counted and the rest of the window writes nothing; a turn whose flag or escalation write failed gives the slot back; a second thread has its own budget.
- **C3 lower-case self-introductions (A1)** — "my name is devika nair", "i am kabir", "i'm kabir singh", "call me aarav" are redacted; "i am tired", "i am from delhi", "i am a student", "i am studying ...", "i am 17 years old", "i am really worried" survive (negative tests).
- **C4 stated names in the reply (A2)** — a name the student stated in the turn (capitalised or lower case) and the model echoes ("Welcome Anita Verma") is redacted in the stored message and claims, the replay and the history; the live answer is unchanged. A name that ends a sentence no longer swallows the next sentence's first word.
- **C5 escalation input redacted (B medium)** — the escalation path (and so the classifier rationale it stores, up to 500 chars) is handed redacted text, never name, phone or email; the crisis is still escalated; when redacting would hide the crisis wording from the guard ("i am unalive"), the least-redacted text that still shows it is used.
- **C6 fact key redacted (low)** — a phone number or email inside a model-proposed fact key is stored redacted, like the value.

## What changed
Code commit `b018254` on branch `p1/u8r` (base `b1aadea` = `p1/u8` at the coordinator-A verdict). 6 files.
- `apps/api/src/chat.ts` — `handleTurn`, edited in place. M1: `profileDown` instead of a swallowed error, 503 for ordinary turns, no stored text for crisis (`:446-464`). M2: `takeCrisisSlot` / `releaseCrisisSlot` (in-memory, bounded 100k, oldest evicted) and a `quiet` graph variant with no flag, escalation or gap writes (`:321`, `:459`). A2: `redactPii(text).names` added to the names used for the reply (`:467-471`). Item 5: `escalationText` + an AsyncLocalStorage scope so the cached per-tenant `escalate` wrapper redacts the turn in flight (`:326-360`). The per-turn body moved into an inner `runTurn` so the slot is released on any failure; no logic outside this was changed. `createChatApi` signature, routes and `ChatApiDeps` are unchanged.
- `packages/schemas/src/redact.ts` — `redactPii`: lower-case intros after "my name is / name is / i am / i'm / call me" with a common-word stoplist (`LOWER_NOT_NAME`) and an `-ing` rule; a sentence-final full stop closes the name; `names` added to `RedactResult`; option `introductions: false`.
- `packages/db/src/profile-facts.ts` — `proposeProfileFact` redacts the key.
- Tests: `apps/api/tests/chat-privacy.test.ts` (+11), `packages/schemas/tests/redact.test.ts` (+5), `packages/db/tests/student-store.test.ts` (+1). Nothing deleted; no existing assertion changed.
- Not touched: `packages/engine/**`, `qa/contracts`, `.claude/**`, `docs/DECISIONS.md`, `TASKS.md`, `qa/QUEUE.md`. CORE-REQUEST: none. Every test uses the fake client; no network, no model call, no Mongo.

## Verification scope
Policy-Version: proportional-verification/2026-10-18.15
Tier: L (student PII persistence and redaction on a student-facing route; crisis escalation path)
Round: 6 files, 6 criteria, est 50 min — failing test first per fix, then fix, one falsification per fix, three affected packages run whole (lock waits dominate)
Base / checked state: base b1aadea, code b018254, worktree clean except this manifest
Affected tests / full-suite trigger: the three packages this unit touches (`packages/schemas`, `packages/db`, `apps/api`), each run whole and typechecked. `packages/engine` is not touched, so its suite is not run (the engine's `StudentGraphDeps` contract is unchanged; the `quiet` variant simply omits optional ports). No whole-repo suite.
Tests[C1]: apps/api tests/chat-privacy.test.ts — "p1-u8r M1" x2: ordinary turn 503 with nothing stored and a clean retry; crisis during an outage answered and escalated with zero stored turns.
Tests[C2]: apps/api tests/chat-privacy.test.ts — "p1-u8r M2" x3: 40 crisis turns in one thread give 1 escalation / 1 flag / 2 turn rows / 1 usage and the window reopens after 11 min; a failed escalation gives the slot back; a second thread has its own budget. Existing "A23 crisis never limited" in tests/chat.test.ts still green.
Tests[C3]: packages/schemas tests/redact.test.ts and apps/api tests/chat-privacy.test.ts — lower-case intros redacted, 17 negative sentences survive, trailing full stop, end-to-end "my name is devika nair" in nothing stored or read back, "i am tired and i am from delhi" kept.
Tests[C4]: apps/api tests/chat-privacy.test.ts and packages/schemas tests/redact.test.ts — echoed name (capitalised and lower case) absent from stored rows, replay and history while the live answer keeps it; `names` output; sentence-final name.
Tests[C5]: apps/api tests/chat-privacy.test.ts — "p1-u8r item 5" x2: escalation port input has no name, phone, email or profile name but still has the crisis wording; "i am unalive" still reaches escalation.
Tests[C6]: packages/db tests/student-store.test.ts — fact key with phone and email stored redacted.
Falsification[C1]: golden "p1-u8r M1 ... refused 503" red-before (old tree failed open) / green-after, plus the two single-line edits in the table.
Pre-check[C1]: b018254 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts -> green: 26 passed, 0 failed t=8s blobs=apps/api/tests/chat-privacy.test.ts:e140af6
Pre-check[C2]: b018254 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts tests/chat.test.ts tests/chat-profile.test.ts -> green: 59 passed, 0 failed (26 + 33 from two runs) t=14s blobs=apps/api/tests/chat-privacy.test.ts:e140af6,apps/api/tests/chat.test.ts:a4a5f48,apps/api/tests/chat-profile.test.ts:d9e63b5
Pre-check[C3]: b018254 bash scripts/vc-testlock.sh pnpm -C packages/schemas exec tsx --test tests/redact.test.ts; bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts -> green: 42 passed, 0 failed (16 + 26) t=11s blobs=packages/schemas/tests/redact.test.ts:6e5ef02,apps/api/tests/chat-privacy.test.ts:e140af6
Pre-check[C4]: b018254 bash scripts/vc-testlock.sh pnpm -C packages/schemas exec tsx --test tests/redact.test.ts; bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts -> green: 42 passed, 0 failed (16 + 26) t=11s blobs=packages/schemas/tests/redact.test.ts:6e5ef02,apps/api/tests/chat-privacy.test.ts:e140af6
Pre-check[C5]: b018254 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts -> green: 26 passed, 0 failed t=8s blobs=apps/api/tests/chat-privacy.test.ts:e140af6
Pre-check[C6]: b018254 bash scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/student-store.test.ts -> green: 14 passed, 0 failed t=4s blobs=packages/db/tests/student-store.test.ts:96aa120
Pre-check[packages]: b018254 pnpm --filter test, whole: packages/schemas 95/95 (t=4s), packages/db 279/279 (t=10s), apps/api 194/194 (t=20s); typecheck exit 0 for packages/schemas (t=31s), packages/db (t=13s), apps/api (t=35s)
Metrics: start=2026-10-19T00:22:08+05:30 end=2026-10-19T00:51:29+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=10 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=unavailable mutants=10 defects_unit=unavailable defects_6c=0
(suite_runs=0: no whole-repo suite; only per-criterion file runs and the three affected packages run whole. Lock waits were short: the 2-slot lock was free for most runs.)
mutant-cap-raise: the brief asks for one falsification per fixed item; C1 and C2 each name two independent behaviours (refuse vs store text; cap vs slot release) and C3 two (catch lower case vs do not over-redact), C5 two (redact vs keep the guard able to see the crisis), so 10 single-line edits were run, one per behaviour.

## Capability coverage (falsifying edit applied to the file in the p1/u8r worktree with a byte backup, tests run, file restored from the backup; sha256 of the file was identical before and after every row)
"before" = green on the unmutated tree (26 api privacy tests, 16 redact tests, 14 student-store tests); "after" = the run with exactly one edit.
| id | falsifying edit | after | first failing test |
|---|---|---|---|
| C1a | delete the 503 for an ordinary turn during a profile outage (fail open again) | 1 fail of 26 | p1-u8r M1: when the Pathlynks profile cannot be read, an ordinary turn is refused 503 ... |
| C1b | `persistText` ignores `profileDown` | 1 fail of 26 | p1-u8r M1: a crisis message during a profile outage ... its text is not stored |
| C2a | the crisis slot is always granted (no cap) | 3 fail of 26 | p1-u8r M2: a flood of crisis messages in one thread ... |
| C2b | a failed flag/escalation write keeps the slot (no release) | 1 fail of 26 | p1-u8r M2: a crisis turn whose escalation write failed does not use up the window |
| C3a | lower-case leads switched off (`lowerOk = false`), schemas | 4 fail of 16 | A1: a student who types a self-introduction in lower case ... |
| C3a' | same edit, api end-to-end | 3 fail of 26 | p1-u8r A1: ... 'my name is devika nair' in lower case ... |
| C3b | the common-word stoplist emptied (every lower-case word is a name) | 6 fail of 16 | A1: lower-case sentences that follow I am / I'm are not names |
| C4 | stated names not added to the names used for the reply | 2 fail of 26 | p1-u8r A2: a name the student stated (capitalised) and the model echoes ... |
| C5a | escalation wrapper hands the raw text to the escalation path | 1 fail of 26 | p1-u8r item 5: the crisis escalation path is handed redacted text ... |
| C5b | no guard-preserving fallback (always the fully redacted text) | 1 fail of 26 | p1-u8r item 5: redacting an introduction never hides the crisis wording ('i am unalive' ...) |
| C6 | fact key stored as given | 1 fail of 14 | p1-u8r low: a fact key a model proposed with a phone number or email in it is stored redacted |

Survivors: 0. One first-pass survivor: C5b was green because the stoplist already contained "suicidal"; the test was changed to "i am unalive" (a crisis phrase the intro rule would mangle, checked by hand: crisis -> none) and the edit re-run red.

## Live browser evidence
Not UI-touching — changed paths are `apps/api/src/**`, `packages/db/**`, `packages/schemas/**` and `qa/`.

## Not done / stated limits (for the checker)
- **`profileFactsUsed` redaction (low) not done.** The graph always returns `profileFactsUsed: []` (`packages/engine/src/student/graph.ts:389`, `:667`), so no honest test can reach a non-empty value without editing the engine; left as the brief allows ("only if trivial, each with a test").
- **Crisis during a profile outage is escalated with heuristic-only redaction.** The Pathlynks name is unknown then, so a profile-only name in that crisis text can reach the classifier and its stored rationale. The alternative (dropping the escalation) was judged worse. The stored turn text is not written in that case.
- **Last-resort raw text.** If neither the fully redacted nor the intro-free redacted text keeps the guard at the original level, the escalation gets the original text (an escalation is never lost for privacy). Not reached by any test; the intro-free text differs from the input only by email, phone and known-name replacement.
- **The crisis write window is per process, in memory** (like the limiter). A restart or a second replica allows one more full write per thread per window. Writes stay bounded by thread creation, which is limited to 30/min/student.
- **Later crisis messages inside the window are answered but not stored or escalated.** The first one raised the flag and escalation; a worse message inside 10 minutes does not raise a second one. 10 minutes and "one" are the brief's example values, not a product decision (Umesh may want a small N > 1).
- **Redaction stays a heuristic.** A rare real name that is also a common word ("i am will") is not caught; "my name is" + a lower-case ordinary word not in the stoplist is redacted (over-redaction is the accepted direction). "this is" and "myself" still need a capital letter. A name stated only in an earlier turn is not known to a later turn's reply redaction (earlier turns are stored redacted); the model has no history, so it can only echo what the current text carries.
- **Mixed line endings in the sandbox checkout** are normalised by git (`core.autocrlf=true`); the committed blobs are LF.
- No `senior-software-engineer` review dispatched (brief: the orchestrator owns review and the checkers). Falsification was done in the unit's own worktree with byte backups and sha256 restore proofs, not a second directory copy, because a full copy of the installed worktree would not fit on the nearly full C: drive (5.6 GB free).

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/schemas test` -> tests 95, pass 95, fail 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/db test` -> tests 279, pass 279, fail 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api test` -> tests 194, pass 194, fail 0.
- `pnpm -C <worktree>/<package> typecheck` for packages/schemas, packages/db, apps/api -> exit 0.
- Per-criterion: the Pre-check lines above.
