# Verdict (coordinator b, blind dual check) — p1-lk9
**Verdict:** PASS
**Cycle checked:** 0
**Checked state:** `p1/lk9` at `5bf2d7f` (code identical to C2 `1f63e76`; C1 `9f3de14`; base `8b485a2`)
**Checker:** claude-sonnet-subagent (checker b). Did not read the other coordinator's verdict file.
**Policy-Version:** proportional-verification/2026-10-19.17 · Tier L · dual-trigger security `apps/api/src/chat.ts:695`
**Checked at:** 2026-10-21T13:19:55+05:30

## Commands run (actual counts)
All via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout N ...`, TMP/TEMP on D:.
1. `pnpm -C D:/vc/.worktrees/lk9/apps/api exec tsx --test tests/chat-privacy.test.ts tests/chat.test.ts tests/chat-rank.test.ts tests/chat-profile.test.ts` -> 111 tests, 111 pass, 0 fail.
2. `pnpm -C D:/vc/.worktrees/lk9/apps/api typecheck` (tsc --noEmit) -> exit 0, no errors.
3. Own hostile suite (9 tests, in a detached throwaway copy `D:/tmp-chk-lk9b/w` at `5bf2d7f`, file `apps/api/tests/hostile-b.test.ts`, copy kept at the checker scratchpad `hostile-b.test.ts`; nothing added to the artifact) -> 9 tests, 9 pass, 0 fail (first run had 1 fail that was my own wrong assertion: it grepped "Germany" in the stored turn text after an erasure; narrowed to the fact value "Pune" and re-run green).
4. Four falsifications in the copy (each reverted with `git checkout`), see below.

## C1 (fail closed, zero provider calls) — PROVEN
Provider spy is the single `deps.provider` (chat.ts:223/463, used for model, safety screen and detector), plus the KB spy; both asserted 0.
- Ordinary texts (English, Hinglish, Devanagari, a non-English question, a "kill the process" tech text, replay x3 with the same clientTurnId) for 11 unconsented token shapes: minor no claim; `guardianConsent` false / `"true"` / `1` / `null`; no age claim; `age:"25"` (string); `isMinor:"false"` (string); `isMinor:null`; `age:17`; `isMinor:false` + `age:15` -> every one: HTTP 200, message === `GUARDIAN_CONSENT_REPLY` (carries 14416), 0 provider calls, 0 KB calls, 0 escalations, no student text stored. `consentOk` undefined/null cannot occur at chat.ts:637 (auth.ts:415 coerces both fields to booleans; `=== true` only); the null/1/"true" tokens prove it end to end.
- Crisis texts (13 variants: English, Devanagari x2, Hinglish incl. "mujhe ab jeena nahi hai...", "mai khatam ho jana chahta hu", leetspeak "i w4nt to d1e", "just kms", "ending things", spaced letters, crisis plus study question, concern "hopeless about my marks", crisis plus padding) for all 11 unconsented token shapes -> every one: state `escalated`, message has 14416 and is NOT the consent reply, 0 provider calls, 0 KB calls, 0 escalations, no text stored. Over-long crisis text (crisis first, and crisis only after the 20k-char truncation point) -> vetted reply, 0 provider calls; over-long ordinary -> 400.
- Controls: consented adult, consented minor (`guardianConsent:true`), age-30 token -> answered by the provider with claims (spy live), reply not the consent reply.
- Gate read: `level` is computed on the full original text at chat.ts:590 (`crisisGuard(text).level`) before truncation; the gate at chat.ts:695 sits after the lease/marking and before `runStudentTurn`, so the crisis exception rides the original text.

## C2 (detached extraction) — PROVEN
- Never-resolving extractor, 5 consecutive turns on one thread: each reply 200 in under 2 s, extractor started 5 times, no unhandled rejection.
- Odd failures: reject(undefined), reject("string with words"), an Error named `StudentFencedError` thrown from the extractor, a malformed fact `{key:"",value:""}`, a thrown object whose `toString` throws -> reply 200, logs contain neither "secret-words" nor "Germany", no unhandled rejection.
- Erasure requested AND confirmed after the reply but before a two-fact extractor resolves -> 0 `profile_facts` rows, "Pune" stored nowhere.
- Replay of a completed turn and an over-long crisis turn never start the extractor (started stays 1); maker's own tests cover the unconsented minor. Logs carry no student text.
- Reading of the code: `proposeFactsDetached` (chat.ts:560) wraps the whole body (including `extract(turn)` call, so a sync throw) in `try/catch` inside an async fn and ends with `void run().catch(() => undefined)`; the reply is built (`respond(200, response)`) and only then `startAfterReply?.()` runs; it is armed only inside `if (leaseToken !== undefined)`, i.e. only the stores-text branch.

## Falsifications (copy, each caught)
| id | edit | result |
|---|---|---|
| F1 | consent gate disabled (`if (false && ...)`) | 2 hostile C1 tests fail (ordinary text; replay) |
| F2 | gate widened to `if (!consentOk)` | 2 hostile C1 tests fail (crisis variants; over-long crisis) |
| F3 | extraction awaited before the reply (`return run()`, `await startAfterReply()`) | never-resolving test hangs; killed by the 600 s harness timeout (file-level fail; my suite has no per-test guard, the maker's 3 s guards turn this into a clean failure) |
| F4 | catch rethrows and the detached promise left un-caught | 2 hostile C2 tests fail (odd rejections; erasure) |

## Replaced protected test
`chat-privacy.test.ts` "an under-18 ... still gets the answer" -> "p1-lk9 C1: ... fixed consent reply". The only removed assertions are `claims.length >= 1` ("the answer is the same quality") and the "or was told" wording, both of which describe the behaviour the brief deliberately removes. Storage assertions (0 chat_turns, text-free thread marker, nothing stored) are kept. No other pre-existing assertion was deleted or loosened in the diff (only the `settle()` additions and imports in chat-profile/chat-rank). Intended behaviour change, not a weakening elsewhere.

## Findings (none blocking)
1. LOW (test signal) — `apps/api/tests/chat-rank.test.ts:312` (C7), `apps/api/tests/chat-profile.test.ts:114` and `:376` assert that an unconsented minor never reaches the ranking port / extractor. After C1 these turns return before the graph, so the three tests now pass without exercising the `textless`-variant and `persistText` guards they were written for (those guards are still reachable only for crisis/concern turns). Defence in depth is still in code; its regression tests are now vacuous for non-crisis text. Suggest a follow-up, not a block.
2. INFO — `GUARDIAN_CONSENT_REPLY` (chat.ts:133) is English only and not human-vetted (maker risk 2 confirmed); it does carry Tele-MANAS 14416, so an unconsented minor whose distress is phrased outside `crisisGuard`'s recall still sees the helpline. The LK5 safety-screen model no longer runs for them (accepted per brief; offline `crisisGuard` is the only screen).
3. INFO — product change for under-18 and unknown-age students (no answers without consent) vs D-093 4A as worded; whether a superseding DECISIONS entry is needed is the orchestrator's call (maker risk 1, agreed).
4. INFO — the `settle()` waits (8 setImmediate rounds) are timing-based (maker risk 4); no flake in the 111-test run here.

## Verdict sha
Recorded in the git commit that adds this file on `p1/lk9` (`git log -1 -- qa/verdicts/p1-lk9.b.md`).
