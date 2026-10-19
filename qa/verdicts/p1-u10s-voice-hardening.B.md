# Verdict p1-u10s-voice-hardening (coordinator B, blind dual check)

Verdict: PASS
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-18.15
Tier: L (dual-trigger security apps/api/src/voice.ts:801 verified: onCrisisRecord decides the crisis flag, the escalation and the per-crisis id)
Checked: 2026-10-19T10:16:00+05:30
Base: 1c9fafb (verified with git). Head: c0237b7 (code 651d08e, the only commit touching apps/ in the range). Diff read in full: chat.ts 1 line, voice.ts +21/-2, chat.test.ts 2 lines, voice-crisis-turn.test.ts +60; the rest is the manifest.

## Plan
Read diff 1c9fafb..c0237b7; H1/H3/H4 end to end in the code; run the affected set once; one falsification per criterion in an isolated copy; my own hostile probe per criterion; judge the A20 protected-test change. No full suite (6c runs it).

## Evidence (all under qa/evidence/p1-u10s-check-B/)
- Affected set, bound tree, via vc-testlock: `pnpm exec tsx --test tests/voice*.test.ts tests/chat*.test.ts` (cwd apps/api, TMP/TEMP on D:) -> tests 160, pass 160, fail 0, EXIT=0 (main-run.log).
- Typecheck: `pnpm --filter @vc/api typecheck` via the lock -> EXIT=0 (typecheck.log).
- Falsification floor in an isolated copy (D:/vc/.worktrees/p1-u10s-checkB-fals), running voice-crisis-turn + chat + my probeB (35 tests); green before 35/35, red after, restored 35/35 (green.log, mut-*.log, restored.log):
  - H1 / M1 (try/catch around redact removed): maker test "H1: redaction throws..." RED and my PB-H1 RED (33 pass, 2 fail).
  - H3 / M3 (turnId back to `c.lastUser?.turnId ?? v<sid8>crisis`): "H3: two crises with no words..." RED, PB-H3 and PB-H3b RED (32 pass, 3 fail).
  - H4 / M4 (`?.trim()` restored): the A20 flag test RED and PB-H4 RED (33 pass, 2 fail).
  Each failure is on the named assertion, not an import error.
- My hostile probes (probeB.test.ts, all green on the fix):
  - H1: a redaction throw on crisis words writes exactly 1 flag whose turnId equals the escalation turnId; text and translatedText are both the fixed marker; the log has `voice_crisis_redact_failed` and neither the raw words nor any "kill" text; a LATER crisis after the failure still escalates (marker) under a different id with a 2nd flag.
  - H3: four crises in one session (words, none, none, words) -> 4 distinct turn ids and 4 flags, with flag turnIds equal to escalation turnIds one to one (ids seen: v..000001, v..crisis<8hex>, v..crisis<8hex>, v..000005; the two crises with words kept spoken-turn-format ids). A no-words crisis straight after an answered turn does not reuse that turn's id.
  - H4: unset, "" and "false" off; "true" on; "True", "TRUE", "true\n", "true\r\n", NBSP+true, BOM+true, ZWSP+true, "false\r\n", "false\t", "0", "true,", two spaces all throw ChatConfigError; an unrelated env key reads as off.
- Code reading: H1 `words` stays undefined on a throw, so `text = words !== undefined && words !== "" ? words : VOICE_CRISIS_NO_WORDS_TEXT` yields the marker; the try/catch encloses only redact+clamp, so crisisWrite for the flag and the escalation still run. `logEvent("voice_crisis_redact_failed")` passes no error object, so no message text can leak. H3 `ownTurn` is false for "" (no words) and for undefined while text may be stored (no record), true for a non-empty utterance or an unconsented minor; a used spoken id falls to a fresh `v<sid8>crisis<uuid8>`; `crisisTurnIds` is per connection and initialised in the connection literal (voice.ts:1348). H4: VC_CHAT_ENABLED has one reader (`chatEnabledFromEnv`, called at index.ts:312), so no second trimming reader exists. The fresh id is a non-empty string, accepted by recordStudentFlag's non-empty check (student-logs.ts:46), keyed threadId:turnId:kind.

## Protected-test-change judgement (A20 assertion)
Justified by H4 and not a weakening. H4 says in so many words that " false " must throw; the old line listed " false " as OFF, i.e. it pinned the trim behaviour H4 removes. The change moves that one value from the "off" list to the "throws" list and adds 11 more padded/odd values that throw, so the assertion set is stricter in the fail-closed direction; nothing was deleted, skipped or loosened, and the "off" list still covers unset, "" and "false". M4 shows the changed test goes red when trim is restored. No other existing assertion changed (2 lines in chat.test.ts, both in this test).

## Criteria
- H1 PASS - affected set, maker test, PB-H1, M1 red then restored green.
- H3 PASS - affected set, maker test, PB-H3/PB-H3b, M3 red then restored green. Limit: I verified flag turnId == escalation turnId and the id forms; I did not independently assert that the stored transcript turn row carries the same id (unchanged by this diff; the pre-existing C18 tests pass).
- H4 PASS - affected set (A20 test plus the voice-wiring and chat-profile callers), PB-H4, M4 red then restored green.
- H2 deferred as a product decision; not judged.

## Proposed issues (dual check: no ledger rows written)
PROPOSED-ISSUE: {"severity":"low","kind":"coverage","title":"No test pins H3 for an unconsented minor (persistText false): the flag keeps the spoken id once and a second crisis gets a fresh id","file":"apps/api/src/voice.ts:815-821"}
PROPOSED-ISSUE: {"severity":"low","kind":"ops","title":"VC_CHAT_ENABLED with stray whitespace (for example 'true ') now fails startup with ChatConfigError; deploy configs and the go-live checklist must use the exact word","file":"apps/api/src/chat.ts:124"}

## Environment notes
C: had about 230 MB free (df) during the check; all temp and scratch work stayed on D:, and no environmental failure was seen in the product runs. My first scratch-copy runs failed to load (cp -a materialised the pnpm symlinks, then the chat fixtures needed skills/ and qa/gates); that was my copy, fixed with a node_modules junction plus those two dirs, and is not a product finding. The bound tree was never edited, and the 160-test run was on it unmodified.

Metrics: start=2026-10-19T09:54:01+05:30 end=2026-10-19T10:16:00+05:30 wall_min=22 agent_min=unavailable blocked_min=8 suite_runs=0 repeat_runs=1 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=1320 mutants=0 defects_unit=0 defects_6c=0
