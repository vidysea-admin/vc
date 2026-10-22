# Manifest — pc-hardening
**Contract:** ISS-pc-voice-1, -2, -6 and ISS-pc-reserved-ids-7, -8, -9 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-hardening.md, criteria H1-H6 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Dual check:** yes
**Dual-trigger:** tenancy apps/api/src/index.ts:551 (the sandbox-tenant exemption guard of the partner id = tenant id binding)
**Persona walk:** skip (api + widget text; no new screen or flow)
**Live browser:** Not run (widget text only, unit-tested against fakes; the live-browser smoke stays the separate step of pc-voice V3)
**Issues addressed:** ISS-pc-voice-1, ISS-pc-voice-2, ISS-pc-voice-6, ISS-pc-reserved-ids-7, ISS-pc-reserved-ids-8, ISS-pc-reserved-ids-9
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-hardening, branch wave/pc-hardening, base 350b4eb).

## What changed (all in place, no new module)
- apps/api/src/voice.ts: new exported `anonymousCapLimit` (H1) used by `anonymousCapReached` (both caps); `handleAnonymousSession` refuses a visitor whose client/partner cap is reached with `429 {"error":"voice_busy"}` + the cap Retry-After BEFORE minting (H3 signal); the upgrade and start checks are unchanged (race cover).
- apps/api/src/partners.ts: `foldId` exported; `isReservedPartnerId` now delegates to new `reservedPartnerIdReason` (same result, plus the reason); `runPartnerCli` `list [--check]` marks reserved partners (`** RESERVED: <reason> **`), `--check` throws `PartnerError("reserved_ids")` naming ids and reasons when an ACTIVE partner is flagged; `PARTNER_USAGE`, `PartnerErrorCode` extended.
- apps/api/src/index.ts startApi (:551 area): the sandbox-exemption guard compares `foldId(o.trim()) === foldId(sandbox.trim())` (H4).
- apps/api/scripts/partner.ts: usage line and header only (the script already maps PartnerError to exit 1).
- apps/widget/src/voice.js: a mint 429 whose body is `voice_busy` is `fallback {reason:"busy", wait}` (default 30 s), any other 429 stays `rate`.
- apps/widget/src/vc-widget.js: `voiceFallbackText` / `voiceErrorNotice` (exported, used by the handlers); `busy` note in English and Hindi picked by `<html lang>`; a `voice_busy` error frame (the 1008 path) shows the same note instead of the raw server text. HELP/crisis paths untouched.
- docs: runbook-golive.md (pre-deploy step now `partner list --check`), partner-integration.md (`--check` + the pathlynks-2 line), go-live-checklist.md (one phrase).
- Tests: partners.test.ts +3 (H4, H5, H6), partner-voice.test.ts +4 (H1 x2, H2, H3 server) and 2 existing tests adapted, widget voice.test.js +3.
- Line endings: working copies were CRLF (autocrlf); the touched files were normalised to LF in this worktree (git stores LF either way; diffstat shows real changes only). pnpm-lock.yaml restored, not committed.

## Deviations and findings the checker should know
1. H1 choice: FALL BACK to the documented default (2 per client, 50 per partner), consistent with `drainTimeoutMs`/`connectOverlapWaitMs` in voice.ts; a refusal would not cover the function-valued per-partner cap, which is read on every check. Valid = safe integer >= 0 (0 stays: no anonymous sessions). There is no env/config loader for these two keys (they are `VoiceAnonymousDeps` fields), so the guard is in the one place they are read.
2. H3 signal: the SESSION-MINT response (new 429 voice_busy), plus the existing `voice_busy` error frame that precedes a 1008 close at start. A bare upgrade-time 429 is still unreadable in the browser; it now only happens in the race between a successful mint and the socket, and there the widget still shows the generic network fallback. This is a server behaviour change: a mint for an at-cap visitor is no longer 201. Three existing tests that minted while capped now mint their over-cap token BEFORE the cap fills (same upgrade-refusal intent kept); the contrast "per-client and per-partner refusals look identical" is kept.
3. H3 i18n: the widget had NO existing i18n pattern (every string is English). I introduced the smallest one: `VOICE_BUSY_TEXT {en, hi}` chosen by `document.documentElement.lang` starting with `hi`; only the busy note is translated.
4. H5: `list` marks every partner (including revoked), `--check` fails only on non-revoked flagged partners. The CLI cannot know a custom sandbox tenant id (a `startApi` option, not an env var); the runbook says to list it in VC_RESERVED_TENANT_IDS. Flags print id, status, reason only, no key material (the existing key prefixes in `list` rows are unchanged). The `--check` failure message goes through the existing PartnerError path (stderr, exit 1).
5. H4's mixed-case case uses `SBX-Main` vs binding `sbx-main` (a `sandbox-*` id is already a built-in family and cannot be bound at all). The un-fixed code started a server that stayed open (hung the red run at the 600 s timeout, 124); the committed test stops a server that wrongly starts.
6. H2 passes before and after the change (the code already left the token unspent); it is a regression pin. The falsification below is the proof it is meaningful.
7. chat.test.ts: the known A20 baseline red is the only failure.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L, Dual check: yes. Base 350b4eb, code commit ca1d0a2 (full sha ca1d0a2a8ec13b74ab7f4cf7093db8f0551ecfef).

H1 (ISS-pc-voice-2): a non-finite, negative or non-integer anonymous.maxActivePerClient / maxActivePerPartner (NaN, Infinity, "abc", -1, 2.5) never disables the cap: config load refuses it with a clear error naming the key, or falls back to the documented default (pick one, consistent with how voice.ts treats its other numeric config, and say which). Test each bad value.
H2 (ISS-pc-voice-1): a committed test proves a capped (429) anonymous voice upgrade leaves the voice token unspent: the same token succeeds after a slot frees, within its life. The spend-before-cap mutant must turn this test red (record it as the H2 falsification).
H3 (ISS-pc-voice-6): when the voice upgrade is refused as busy (429 or close 1008 voice_busy), the widget shows a specific "voice is busy, try again shortly" message (English and Hindi, matching the widget's existing i18n pattern), not the generic network fallback. Design within what the browser exposes (a WebSocket upgrade 429 is not readable by onclose; use the session-mint response or the 1008 reason the server already sends; say which signal you use). Crisis/HELP text paths stay unchanged.
H4 (ISS-pc-reserved-ids-7): the sandbox-tenant exemption guard (index.ts ~:551) compares NFKC + case-folded, the same fold as isReservedPartnerId; a mixed-case sandbox id with a lowercase binding is refused at startup.
H5 (ISS-pc-reserved-ids-8): `partner list` marks every partner whose id is currently reserved (built-ins, families, VC_RESERVED_TENANT_IDS minus VC_PARTNER_OWN_TENANTS) with a clear flag and reason, and exits non-zero with a `--check` option when any is flagged (for the pre-deploy step); runbook-golive pre-deploy step updated to use it. No key material printed.
H6 (ISS-pc-reserved-ids-9): a test pins that listing pathlynks in VC_RESERVED_TENANT_IDS does not refuse partner pathlynks-2 (exact-id match for configured tenants is the intended design: it reaches only its own tenant), and the partner-integration doc states it in one line.

Tests[H1]: partner-voice.test.ts "H1: a non-finite, negative ..." (helper, all six bad values x both defaults) and "H1: through the running voice API ..." (each bad maxActivePerClient still caps at two; each bad per-partner function result falls back to 50).
Tests[H2]: "H2: a capped (429) anonymous voice upgrade leaves the voice token unspent ..." (usedTokens unchanged by the refusal, same token connects after a slot frees, is then spent: replay is 401).
Tests[H3]: partner-voice.test.ts "H3 server: ... the session mint says 429 voice_busy ..." (visitor cap, partner cap, same Retry-After, no token, mint works again); widget voice.test.js "H3: a 429 voice_busy from the session mint is a busy fallback ...", "H3: the widget words the busy state in English and Hindi ..." (en/hi/hi-IN/HI, unsupported language and none = English, other texts unchanged, voice_busy error frame = the same note, other error frames unchanged), "H3: ... keep the crisis path intact".
Tests[H4]: partners.test.ts "H4: the sandbox-tenant exemption guard folds case and width ..." (mixed case, same case control, full-width; refused before connecting; a different binding still starts).
Tests[H5]: "H5: partner list marks every partner whose id is currently reserved ..." (built-in family, repo tenant, listed tenant flagged with reason; clean and bound partner not; --check throws reserved_ids naming only flagged ids, no key material; clean --check returns; revoked flagged but not failing; bad options are usage errors; script usage, runbook and PARTNER_USAGE mention --check).
Tests[H6]: "H6: listing pathlynks in VC_RESERVED_TENANT_IDS does not refuse partner pathlynks-2 ..." (five look-alike ids add and authenticate; sandbox-2 still refused as the contrast; doc mentions pathlynks-2).

Red runs before the fix (recorded): partner-voice `--test-name-pattern="^H[123]"` -> exit 1, 4 tests, 1 pass (H2), 3 fail (H1 x2, H3 server); partners `^H[456]` -> 3 fail (H4: missing rejection; H5: sandbox-1 not marked; H6 failed on a test-data error (pathlynks_2 is not a valid partner id) which I then fixed; H6 is a pin so it passes on the old code by design); widget `node --test "tests/*.test.js"` -> 61 tests, 2 fail (H3), 59 pass.

Pre-check[H1]: ca1d0a2 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^H" tests/partner-voice.test.ts` (apps/api) -> exit 0, 4 passed, 0 failed (the unmutated control of the falsification copy; the same 4 pass in the full file run)
Pre-check[H2]: same run as H1 (H2 is one of the 4)
Pre-check[H3]: same run (H3 server) plus `node --test "apps/widget/tests/*.test.js"` -> exit 0, 61 passed, 0 failed
Pre-check[H4]: ca1d0a2 same command with `--test-name-pattern="^H"` tests/partners.test.ts -> exit 0, 3 passed, 0 failed (H4, H5, H6)
Pre-check[H5]: same run as H4
Pre-check[H6]: same run as H4
Pre-check[R3a]: ca1d0a2 `... tsx --test tests/partners.test.ts` -> exit 0, 66 passed, 0 failed
Pre-check[R3b]: `... tests/partner-voice.test.ts` -> exit 0, 36 passed, 0 failed
Pre-check[R3c]: `... tests/partner-openapi.test.ts` -> exit 0, 15 passed, 0 failed
Pre-check[R3d]: `... tests/voice.test.ts` -> exit 0, 67 passed, 0 failed; `tests/voice-limits.test.ts` -> 10 passed, 0 failed; `tests/voice-wiring.test.ts` -> 16 passed, 0 failed
Pre-check[R3e]: `... tests/auth.test.ts` -> 15 passed, 0 failed; `tests/server.test.ts` -> 34 passed, 0 failed; `tests/index.test.ts` -> 8 passed, 0 failed; `tests/main.test.ts` -> 10 passed, 0 failed
Pre-check[R3f]: `... tests/chat.test.ts` -> exit 1, 34 passed, 1 failed (the known A20 baseline red "A20 flag on but gate closed: the real repo qa/gates (B13 pending) ...", nothing else)
Pre-check[R3g]: `... tsx --test --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts` -> exit 0, 9 passed, 0 failed
Pre-check[R3h]: `pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output

Falsify[H1]: in a copy outside the repo (session scratchpad `ph/fals/`, git archive of ca1d0a2, install offline with the D: store) `anonymousCapLimit` back to `Math.max(0, value ?? fallback)` -> red (2 failing: both H1 tests).
Falsify[H2]: the spend-before-cap mutant ( `usedTokens.set(claims.jti, claims.exp)` moved to before the active-cap check) -> red (1 failing: H2). The second mutant (spend removed altogether) is red as well (H2: the replay is no longer a 401).
Falsify[H3]: the mint pre-check disabled (`if (false && anonymousCapReached(...))`) -> red (1 failing: H3 server); widget busy detection disabled (`busy.error === "never"`) -> red (1 failing of 61: the mint test); busy text routed to the unavailable text -> red (1 failing of 61: the en/hi test).
Falsify[H4]: the guard back to `partnerOwnTenants.includes(sandbox)` -> red (1 failing: H4; the test stops the wrongly started server).
Falsify[H5]: the `--check` throw disabled (`if (false)`) -> red (1 failing: H5); the flag set emptied (`.filter((x) => false)`) -> red (1 failing: H5).
Falsify[H6]: configured entries given a `name-` suffix family -> red (1 failing: H6).
Unmutated copy after every restore (`^H` in partner-voice and in partners): 4 passed and 3 passed, 0 failed.

## Metrics
Metrics: start=2026-10-22T15:21:21+05:30 end=2026-10-22T15:45:03+05:30 builder_min=24 wall_min=24 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=30 mutations=10 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
- A live browser run of the widget busy note (unit-tested against fakes only).
- The remaining upgrade-time-429 race path still shows the generic network fallback in the widget (not readable by the browser).
- The per-partner cap with a bad value is proven at the helper level and by "two visitors still fit"; a 50-session saturation run was not done.
