# Manifest — pc-hardening-2
**Contract:** ISS-pc-hardening-1, -3, -6 and ISS-pc-partner-keys-3, -6 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-hardening-2.md, criteria J1-J5 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 1
**Status:** checked-PASS
**Dual check:** yes
**Dual-trigger:** auth apps/api/src/partners.ts:436 (the rotate update `store.update(partnerId, patch, expect)` in `rotatePartner`; the expected hash is built at :435)
**Persona walk:** skip (widget notes and api responses; no new screen or flow)
**Live browser:** Not run (widget text only, unit-tested against fakes; the live-browser check stays a separate step)
**Issues addressed:** ISS-pc-hardening-1, ISS-pc-hardening-3, ISS-pc-hardening-6, ISS-pc-partner-keys-3, ISS-pc-partner-keys-6
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-hardening-2, branch wave/pc-hardening-2, base 02483f6).

## What changed (all in place, no new module)
- apps/widget/src/vc-widget.js: `voiceFallbackText` / `voiceErrorNotice` append the helpline to the busy note (J1; English line = `HELP`, Hindi line `HELP_HI` for `hi*` page language) and a new `off` reason note "Voice is not available here. Please type your question." (en/hi) plus the helpline (J2). The busy wording, `HELP`, the crisis block and every other text are untouched.
- apps/widget/src/voice.js: a mint `403 {"error":"voice_unavailable"}` is `fallback {reason:"off"}`; any other 401/403 stays `unavailable`; 429 busy/rate unchanged.
- apps/api/src/voice.ts: `anonymousCaps` (the two caps, bad values already fallen back via `anonymousCapLimit`), new `anonymousVoiceOff` (either cap is 0), used by the anonymous session mint to answer `403 {"error":"voice_unavailable"}` (no Retry-After, no token, helpline kept) before the busy check; caps > 0 at capacity keep `429 voice_busy`. The upgrade and start checks are unchanged.
- apps/api/src/partners.ts: `PartnerStore.update(partnerId, patch, expect?)` with new `PartnerExpect` (`keys.<scope>.hash`); the Mongo store adds it to the filter (compare-and-set); `rotatePartner` passes the hash it read and, on a miss, re-reads: a vanished partner stays `partner_not_found`, otherwise new `PartnerError` code `rotated_concurrently` ("... was rotated concurrently, run again (no key was minted)"). New exported `partnerCliFailureLine` (J5): `partner: failed (<class> <code>)` with class and code cut to `[A-Za-z0-9_.-]{1,64}`, never the message.
- apps/api/scripts/partner.ts: the catch-all prints `partnerCliFailureLine(err)`.
- docs/partner-integration.md: "Anonymous voice caps" (set 0 to turn anonymous voice off; negative or invalid falls back to the default; 429 voice_busy vs 403 voice_unavailable) and the rotate-overlap and CLI-error lines in section 4.
- Tests: partners.test.ts +3 (J4 x2, J5) and the K1 (c1) same-scope overlap test updated in place from "last writer wins" to "first commit wins, the loser fails" (the old behaviour is exactly what J4 removes); partner-voice.test.ts +2 (J2, J3); widget voice.test.js +3 (J1 x2, J2).
- Line endings: working copies are CRLF (autocrlf); the touched files were normalised to LF in this worktree (git diff shows real changes only). pnpm-lock.yaml restored after the offline install, not committed.

## Deviations and findings the checker should know
1. J1 language of the helpline: the English line is the widget's `HELP` constant byte for byte; the Hindi note gets "Tele-MANAS 14416 (24x7) · आपातकाल 112" (same numbers, "Emergency" translated). The server's `helpline` body field is not used for the busy note (the widget's own constant is, so a note never depends on the response body).
2. J2 placement: the 403 is decided after auth, the origin check, the rate limiter and the empty-body check (so an unauthenticated caller learns nothing about caps) and before the busy check. Either cap at 0 (per client or per partner, number or function) switches the partner's anonymous voice off. The race path (a token minted before a cap was set to 0) still ends in the existing upgrade/start refusal.
3. J3 test: a function-valued per-partner cap of 3 asked with the partner id of the key; three visitors open, the fourth is 429 at the mint AND at the upgrade (token minted earlier), one freed slot lets exactly one in. The pre-existing H1 per-partner loop (bad values fall back to 50) is unchanged: 50 sessions are too slow to pin. The J3 falsifications below turn the new test red.
4. J4 CAS filter: for a scope with no hash the filter is `$exists: false`; addPartner always writes both records, so this is only defensive. The loser prints nothing (the error is thrown before any key line is built); the CLI maps it to exit 1 via the existing PartnerError path.
5. J5: the script test uses `MONGO_CLIENT_TIMEOUT_MS` holding a mongodb:// URI with a password: `connectFromEnv` rejects it and quotes it in its message, before any client is created, so no network or Mongo is touched. The pre-fix helper printed that URI (the unit half of the test was the recorded red).
6. chat.test.ts: the known A20 baseline red is the only failure.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L, Dual check: yes. Base 02483f6, code commit 23ccf9341dd10b4cf04a3adb209ac67d648f8dff (short 23ccf93; first code commit 3baa38c).

J1 (ISS-pc-hardening-1): when the widget shows the voice busy note (mint 429 voice_busy, or the voice_busy error frame), the HELP / helpline line that other widget error notes keep is shown too, in the same language as the busy note. Crisis text, the busy note wording and other texts stay byte-identical. Test both busy signals in en and hi.
J2 (ISS-pc-hardening-3): an anonymous voice cap of 0 (voice deliberately off for that client or partner) is not reported as busy: the mint returns a distinct non-transient refusal (for example 403 `{"error":"voice_unavailable"}`, no Retry-After) and the widget shows a plain "voice is not available here, please type" note (en/hi) plus HELP. Caps > 0 at capacity keep 429 voice_busy. Docs (partner-integration) state: set 0 to turn anonymous voice off; a negative or invalid value falls back to the default.
J3 (ISS-pc-hardening-6): the per-partner cap API test discriminates the limit: it fails if the per-partner cap is removed or changed from its configured value (use a small configured cap, e.g. 3, to keep it fast). Record the no-cap mutant red.
J4 (ISS-pc-partner-keys-3): two overlapping rotates of the same key scope cannot both report success: the rotate update is conditional on the key hash it read (compare-and-set); the loser gets a clear "rotated concurrently, run again" error and prints no key. Prove with an interleaved test against the fake Db (both start, one commits first), and show the printed key of the winner authenticates and the loser printed none.
J5 (ISS-pc-partner-keys-6): the partner CLI catch-all never prints a raw driver error message; it prints a fixed message plus the error class/code only. A test feeds an error whose message contains a mongodb:// URI with a password and asserts neither the URI nor the password appears on stdout/stderr.

Tests[J1]: widget voice.test.js "J1: the voice busy note carries the helpline too ..." (mint fallback and error frame; en / hi / hi-IN / none; exact strings; busy wording, HELP and the other texts byte-identical) and "J1: a voice_busy error frame reaches the widget as an error event ..."; the existing H3 tests (busy wording, crisis path) still pass.
Tests[J2]: partner-voice.test.ts "J2: a cap of 0 ..." (per-client 0, per-partner 0, per-partner function 0 give 403 voice_unavailable, no Retry-After, no token, helpline kept; a positive cap at capacity gives 429 voice_busy with Retry-After; the six bad values mint 201; the doc says set 0 / negative or invalid falls back / voice_unavailable); widget voice.test.js "J2: a mint refused with 403 voice_unavailable ..." (off fallback, mic freed, no socket, exact en/hi text plus HELP, other 401/403 stay unavailable, busy stays busy).
Tests[J3]: partner-voice.test.ts "J3: the per-partner anonymous cap is discriminated by the API ..." (cap 3: three open, the fourth is 429 at the mint and at the upgrade, the cap function is asked for the key's partner, one freed slot admits exactly one).
Tests[J4]: partners.test.ts "J4: two overlapping rotates of the same key scope cannot both report success ..." (interleaved: both read, then both write; one PartnerError rotated_concurrently "rotated concurrently, run again" with no key in it; the winner's printed key authenticates, the original does not, the stored hash is the winner's) and "J4: a rotate of an unknown or vanished partner is still partner_not_found, and overlapping rotates of DIFFERENT scopes both succeed"; the K1 (c1) overlap test updated in place.
Tests[J5]: partners.test.ts "J5: the partner CLI's catch-all prints a fixed message plus the error class and code only ..." (unit: URI, host and password absent, class and code present, a hostile name or code cannot carry the URI back; and the real script run with a URI in MONGO_CLIENT_TIMEOUT_MS: exit 1, no URI, host or password on stdout or stderr).

Red runs before each fix (recorded): J4 and J5 `--test-name-pattern="^J[45]"` on partners.test.ts: 3 tests, 1 pass (the vanished-partner / different-scope control), 2 fail (J4 `2 !== 1`: both rotates reported success; J5: the line held the mongodb:// URI and password). J2 and J3 `--test-name-pattern="^J[23]"` on partner-voice.test.ts: 2 tests, 1 pass (J3, a guard that passes on the unchanged cap code and is proven by the mutants below), 1 fail (J2 `429 !== 403`). Widget `node --test "tests/*.test.js"`: 64 tests, 61 pass, 3 fail (J1 x2, J2).

Falsifications (in a copy under the session scratchpad fals-pc2, never in D:/ or the repo root; each mutant restored and the copy diffed equal to the worktree afterwards):
- J1: busy fallback without the helpline line: widget voice.test.js 2 fail (J1 and the H3 equality test); busy error frame without the helpline: 3 fail (J1 x2, H3). Red.
- J2: mint without the `anonymousVoiceOff` 403: J2 fails `429 !== 403`. Red.
- J3: `return client >= perClient;` (per-partner cap removed): J3 fails `201 !== 429`; `partner >= perPartner + 1` (cap changed from 3 to 4): J3 fails `201 !== 429`. Both red (the no-cap mutant is the first).
- J4: `store.update(partnerId, patch)` (unconditional): J4 fails `2 !== 1`. Red.
- J5: `partnerCliFailureLine` returning `name: message`: J5 fails; the script printing `err.message` directly (bypassing the helper): J5 fails (script half). Red.

Round: 9 files, 5 criteria, est 30 min — diff of 23ccf93 vs 02483f6
Tests[R3a]: partners.test.ts whole file — regression for partners.ts (store.update signature, rotate)
Tests[R3b]: partner-voice.test.ts whole file — regression for voice.ts mint/cap changes
Tests[R3c]: partner-openapi.test.ts whole file — public mint response shapes
Tests[R3d]: voice.test.ts, voice-limits.test.ts, voice-wiring.test.ts — voice.ts importers
Tests[R3e]: auth.test.ts, server.test.ts, index.test.ts, main.test.ts — partners.ts/index.ts importers
Tests[R3f]: chat.test.ts — partner tenancy importer (A20 baseline red)
Tests[R3g]: anonymous-route.test.ts H2|H6|G5|K2|K4 — anonymous Origin/partner path
Tests[R3h]: tsc --noEmit (apps/api) — type check of the changed signatures
Pre-check[J1]: 23ccf93 `node --test --test-name-pattern="^J" apps/widget/tests/voice.test.js` (repo root) -> exit 0, 3 passed, 0 failed (J1 x2 and J2); whole widget suite `node --test "apps/widget/tests/*.test.js"` -> exit 0, 64 passed, 0 failed
Pre-check[J2]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^J" tests/partner-voice.test.ts` (apps/api) -> exit 0, 2 passed, 0 failed (J2 and J3); widget J2 as under Pre-check[J1]
Pre-check[J3]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^J" tests/partner-voice.test.ts` (apps/api) -> exit 0, 2 passed, 0 failed (J3 is one of the 2)
Pre-check[J4]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^J" tests/partners.test.ts` (apps/api) -> exit 0, 3 passed, 0 failed (J4 x2 and J5)
Pre-check[J5]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^J" tests/partners.test.ts` (apps/api) -> exit 0, 3 passed, 0 failed (J5 is one of the 3)
Pre-check[R3a]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/partners.test.ts` -> exit 0, 69 passed, 0 failed
Pre-check[R3b]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/partner-voice.test.ts` -> exit 0, 38 passed, 0 failed
Pre-check[R3c]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/partner-openapi.test.ts` -> exit 0, 15 passed, 0 failed
Pre-check[R3d]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/voice.test.ts` tests/voice-limits.test.ts tests/voice-wiring.test.ts (run per file) -> exit 0 each, 67 + 10 + 16 passed, 0 failed
Pre-check[R3e]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/auth.test.ts tests/server.test.ts tests/index.test.ts tests/main.test.ts` (run per file) -> exit 0 each, 15 + 34 + 8 + 10 passed, 0 failed
Pre-check[R3f]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-skip-pattern="A20 flag on but gate closed" tests/chat.test.ts` -> exit 0, 34 passed, 0 failed
Note R3f: the skip pattern excludes only the recorded A20 baseline test (ISS-pc-partner-keys-8); the full-file run on 23ccf93 is 35 tests, 34 passed, 1 failed (that baseline test only).
Pre-check[R3g]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts` -> exit 0, 9 passed, 0 failed
Note R3i: the widget regression (all of apps/widget/tests) is recorded under Pre-check[J1] (64 passed, 0 failed).
Pre-check[R3h]: 23ccf93 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output

## Repair cycle 1
Trigger: both blind coordinators FAILed J1 (qa/verdicts/pc-hardening-2.A.md, .B.md): HELP_HI was a new Hindi translation ("आपातकाल 112"), which LK10 forbids. Repair code commit 6b578a7c9f811d5b288fec6bd97583c482b0d8c4 (short 6b578a7), on top of main merged into the branch. Deviation 1 above is superseded: the Hindi helpline line is now "Tele-MANAS: 14416, मुफ़्त, 24x7 · 112 पर फ़ोन करें", both parts copied verbatim from packages/engine/src/student/lang.ts (HELPLINE_GLOSS inner text, and the 112 phrase of the Hindi crisis text at CRISIS_CORE_HI), joined with the same " · " the English HELP uses. No new Hindi word; lang.ts, crisisGuard, the busy wording, English HELP, the crisis path are untouched.

R1 (J1, LK10): apps/widget/src/vc-widget.js HELP_HI; apps/widget/tests/voice.test.js constant updated and new "R1: the Hindi helpline line is built only from fragments copied verbatim ..." (reads lang.ts from disk, every " · " part of the Hindi line must be a substring of it, same part count as English HELP, "आपातकाल" absent from every file in apps/widget/src).
R2 (review low): apps/api/src/index.ts, the default PartnerStore wrapper is extracted in place to the exported `deferredPartnerStore(ref)` (so a test can reach it) and its `update` now forwards `expect`; apps/api/tests/index.test.ts "R2: the partner store the server builds ... forwards update's third argument" (mismatched expect: false and nothing written; matching: written).
R3 (B proposed): apps/api/tests/partner-voice.test.ts "R3: with a cap of 0 ..." byte-compares the 401 (status, sorted headers, body) for a bad key, a missing key and a wrong Origin between the default-cap world and per-client-0 and per-partner-0 worlds; a good request is 201 / 403 respectively. No production change (the order was already correct).
R4 (A and B proposed): apps/api/src/partners.ts `PartnerExpect` gains `status?: "active"`; `rotatePartner` adds `status: "active"` to its compare-and-set; on a miss it re-reads: vanished = partner_not_found, revoked = new message under the existing `partner_revoked` code ("was revoked while the key was being rotated, so no key was minted"), else rotated_concurrently. apps/api/tests/partners.test.ts "R4: a revoke that lands between rotate's read and rotate's write ..." (interleaved against the fake Db; no key printed; stored hash unchanged; partner stays revoked; old key does not authenticate).

Red runs before each fix (recorded): R1 `node --test --test-name-pattern="R1" apps/widget/tests/voice.test.js` -> 1 fail ("not a verbatim fragment of lang.ts: Tele-MANAS 14416 (24x7)"). R2 `--test-name-pattern="R2" tests/index.test.ts` with the extracted wrapper still dropping `expect` -> 1 fail ("mismatched expect: refused", actual true). R4 `--test-name-pattern="R4" tests/partners.test.ts` -> 1 fail (rotate succeeded, no error). R3 is a characterization pin: green on the unchanged order, proven by its mutant below.

Falsifications (own worktree with the file backed up in the session scratchpad and restored, sha256 verified, git status clean of the mutation afterwards): R1: "112 पर कॉल करें" in the widget -> R1 red ("not a verbatim fragment"). R3: `if (who && anonymousVoiceOff(who.partnerId)) return failAnon(403, ...)` inserted before the Origin check in voice.ts -> R3 red. R2: the pre-fix wrapper (`update: (id, patch)`) is the mutant -> red as recorded. R4: pre-fix rotate (no status filter) is the mutant -> red as recorded.

Tests[R1]: widget voice.test.js "R1: ..." plus whole widget suite
Tests[R2]: index.test.ts "R2: ..."
Tests[R3]: partner-voice.test.ts "R3: ..."
Tests[R4]: partners.test.ts "R4: ..."
Pre-check[R1]: 6b578a7 `node --test "apps/widget/tests/*.test.js"` (repo root, via vc-testlock.sh) -> exit 0, 65 passed, 0 failed (64 before + R1)
Pre-check[R2]: 6b578a7 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test apps/api/tests/index.test.ts` -> exit 0, 9 passed, 0 failed (8 + R2)
Pre-check[R3]: 6b578a7 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test apps/api/tests/partner-voice.test.ts` -> exit 0, 39 passed, 0 failed (38 + R3)
Pre-check[R4]: 6b578a7 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test apps/api/tests/partners.test.ts` -> exit 0, 70 passed, 0 failed (69 + R4)
Pre-check[R5a]: 6b578a7 same wrapper, files partner-openapi, voice, voice-limits, voice-wiring, auth, server, main (run per file) -> exit 0 each, 15 + 67 + 10 + 16 + 15 + 34 + 10 passed, 0 failed
Pre-check[R5b]: 6b578a7 `... tsx --test --test-skip-pattern="A20 flag on but gate closed" apps/api/tests/chat.test.ts` -> exit 0, 34 passed, 0 failed
Pre-check[R5c]: 6b578a7 `... tsx --test --test-name-pattern="H2|H6|G5|K2|K4" apps/api/tests/anonymous-route.test.ts` -> exit 0, 9 passed, 0 failed
Pre-check[R5d]: 6b578a7 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output

Close-out (2026-10-22T17:06:30+05:30): cycle 1 dual check PASS — A e4e1af1, B 830326f (Cycle checked: 1; cycle 0 FAIL on J1 kept as .r0-1); senior review c0 Approve (qa/evidence/p1-briefs/pc-hardening-2-c0-review-result.md); browser validation c286d74 OK (26/26). Status: checked-PASS
