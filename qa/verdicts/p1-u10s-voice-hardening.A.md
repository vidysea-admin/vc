# Verdict - p1-u10s-voice-hardening (coordinator A, dual check, blind) - 2026-10-19
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-18.15
Base 1c9fafb (verified ancestor of HEAD) -> Head c0237b7 (code 651d08e). Diff read in full (git diff 1c9fafb..c0237b7 -- apps/: chat.ts 1 line, voice.ts +23/-3 incl. Conn field + literal, chat.test.ts 2 lines, voice-crisis-turn.test.ts +60).

## Check plan
Logic + security flag/escalation path, no UI, no persona walk (api-only). Checks: (1) read diff + onCrisisRecord/redact/assignTurn/recordStudentFlag/chatEnabledFromEnv end to end; (2) affected set once (voice*+chat*) under the testlock; (3) one falsification per criterion in an isolated copy; (4) my own hostile probes; (5) api typecheck. No full suite (6c). Lane check not applicable (dual check).

VERDICT: PASS
SCOREBOARD: 3/3 criteria met (H1, H3, H4), H2 deferred by product decision and not judged; invariants: C18 (a)-(e) still pass, voiceEnabledFromEnv parity holds
TIER: L (security: crisis escalation path for minors, apps/api/src/voice.ts:801 onCrisisRecord; chat go-live flag apps/api/src/chat.ts:124) - dispatched tier kept, not raised
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api-only, no UI)
LIVE-BROWSER: not-applicable (changed paths are apps/api/src and tests only)
ISSUES-WRITTEN: none (dual check; see PROPOSED-ISSUE lines)
EXECUTOR: claude-opus-subagent (checker: claude-sonnet-subagent)

## Evidence (all run by me, this check)
- Affected set, once: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm exec tsx --test tests/voice*.test.ts tests/chat*.test.ts` (cwd apps/api, tree at c0237b7, clean) -> tests 160, pass 160, fail 0, cancelled 0, skipped 0, exit 0 (qa/evidence/p1-u10s-check-A/run1.log).
- Typecheck: `tsc --noEmit -p tsconfig.json` in apps/api -> exit 0 (qa/evidence/p1-u10s-check-A/typecheck.log).
- Falsification, one per criterion, each in its own copy (git archive c0237b7 into D:/vc/.worktrees/p1-u10s-fcA-<k>, node_modules junctioned), green before in copy A0 (37/37 = voice-crisis-turn + chat + my probe file), red after:
  - H1 mutant (try/catch around redact removed): FAIL "H1: redaction throws ..." (+ my P-H1a, P-H1b); 34 pass / 3 fail (qa/evidence/p1-u10s-check-A/mut-H1.log).
  - H3 mutant (turnId = c.lastUser?.turnId ?? v<sid8>crisis): FAIL "H3: two crises with no words ..." (+ P-H3a, P-H3c, P-H1b); 33 pass / 4 fail (qa/evidence/p1-u10s-check-A/mut-H3.log).
  - H4 mutant (?.trim() restored): FAIL "A20: chat is OFF by default ..." only; 36 pass / 1 fail (qa/evidence/p1-u10s-check-A/mut-H4.log).
  Failures are on the named assertions, not import/setup errors. Mutants were never in the bound tree.
- My own hostile probes (real fixtures, no mocks; file qa/evidence/p1-u10s-check-A/zz-probe-A.test.ts.txt, run in copy A0, all green):
  - P-H3a three no-words crises -> 3 escalations, 3 flags, 3 distinct ids, flag ids == escalation ids, all text = VOICE_CRISIS_NO_WORDS_TEXT.
  - P-H3b two crises WITH words -> distinct ids; they are the stored voice turn ids (vfb1420e8000001, vfb1420e8000003): flag/stored-turn agreement holds on first use.
  - P-H3c no-words / words / no-words -> ids [crisis<uuid8>, spoken id 000002, crisis<uuid8>], 3 flags.
  - P-H3d unconsented minor, two crises with words -> 2 distinct flags, 0 escalations, no words in logs (the ownTurn branch for raw===undefined && !persistText).
  - P-H1a redaction throws on two crises with words (names list holding a non-string) -> 2 flags, 2 escalations carrying only the fixed marker, 2 `voice_crisis_redact_failed` log lines (log line = {level,event,ts}, no error field, no words), "rawsecret"/"kill myself" absent from every log line and escalation payload.
  - P-H1b throw on a crisis with words, then a no-words crisis -> 2 flags, 2 distinct ids.
- Padded chat flag fails closed: A20 test now covers " true", "true ", " false ", " false", "false ", " ", "\ttrue\n" -> ChatConfigError; code read: chatEnabledFromEnv (chat.ts:124-127) has no trim, byte-identical logic to voiceEnabledFromEnv (voice.ts:159-164). Only caller outside tests is index.ts:312. No deploy config in the repo sets VC_CHAT_ENABLED with whitespace (grep).

## Criteria
- H1 PASS. voice.ts:806-813 wraps redact in try/catch; on throw words stays undefined, line 837 selects the fixed marker, flag (823) and escalation (839-851) proceed; log carries no text. Raw words never reach the escalation.
- H3 PASS. voice.ts:818-822: spoken id used only if ownTurn (not "" and not undefined-while-text-storable) and not already in c.crisisTurnIds, else a fresh `v<sid8>crisis<uuid8>`; every id used is recorded; Conn literal initialises the Set (1348). recordStudentFlag keys _id on threadId:turnId:kind (student-logs.ts:48), so distinct ids give distinct flags; ids stay non-empty (requireNonEmptyFields) and 23 chars.
- H4 PASS. As above.

## Protected-test-change judgement (A20)
The one existing assertion changed on purpose: " false " moved from the OFF list to the throws list, and padded cases were added. This is justified by H4, whose text lists " false " as a throw, and it makes the pin stricter (fail closed), not weaker: nothing was deleted, no threshold lowered, no skip added. Accepted.

## PROPOSED-ISSUE
PROPOSED-ISSUE: {"sev":"low","kind":"observation","title":"H3/H1 coverage in the committed tests does not include a crisis WITH words whose redaction throws followed by a second crisis, nor an unconsented-minor double crisis; both behave correctly under my probes (P-H1a, P-H3d), suggest pinning them","file":"apps/api/tests/voice-crisis-turn.test.ts"}

## EXPLANATION
All three criteria are evidenced by independent runs: the 160-test affected set is green, each changed criterion has a named test that goes red under its mutant and green on the head, and six hostile probes (repeated no-words crises, throwing redaction across several crises, unconsented minor) behave as the criteria require with no raw words in any log or escalation. H2 is explicitly deferred and was not judged.

Metrics: start=2026-10-19T09:53:54+05:30 end=2026-10-19T10:07:30+05:30 wall_min=14 agent_min=unavailable blocked_min=5 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=816 mutants=0 defects_unit=0 defects_6c=0
