# Verdict: w1-chat-privacy (coordinator B of a DUAL check)
**Cycle checked: 0**
**Checker:** /checker coordinator B (Mode A), blind to coordinator A
**Unit:** worktree D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy, head 8c6657e (code 8dba0ac), manifest qa/manifests/w1-chat-privacy.md
**Checked at:** 2026-10-25T07:28:15+05:30
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier L, dual-trigger security apps/api/src/chat.ts:724)

VERDICT: FAIL (C1)

In a dual check this verdict has no side effects: findings below are PROPOSED-ISSUE lines; qa/issues.jsonl was not edited.

## Re-run of the maker's checks (executed by me, via vc-testlock, worktree at 8c6657e, clean)
- `tsx --test` chat-privacy, chat, chat-profile, anonymous-route, anonymous-zero-persistence, partners, partner-voice, main, server, plus voice, voice-crisis-turn, voice-history (importers of redactPii): 459 tests, 459 pass, 0 fail.
- packages/schemas `tsx --test tests/redact.test.ts` (with my benign file): 23 pass, 0 fail. packages/db `tests/student-store.test.ts`: 19 pass, 0 fail.
- `tsc --noEmit` in apps/api and packages/schemas: exit 0, no output.
- Importers of redactPii (git grep): chat.ts, voice.ts, db chat-threads.ts, profile-facts.ts, schemas index; their test files are in the runs above.

## Hostile probes (my own, outside the tree, scratchpad chk-cp-B/hostile.test.mts, hostile2.test.mts, overredact.test.mts)
### C1 — FAIL
Holds: 30 parallel and 25 sequential crisis turns over distinct threads: every turn 200 + helpline, escalations capped at 10, flags 10, chat_turns 20, usage 10. 15 crisis turns in one thread: 1 escalation. Crisis reply byte-identical (modulo turnId) for all 14 turns, over and under budget (LK10 wording unchanged). A concern turn past budget still gets the crisis reply (200). Unconsented minor, 25 threads: 10 flags, 0 stored turns, all helpline. No reset at +9 min; other tenant id (tenant-b, TENANT-A, Tenant-A) gets its own budget, which is correct because tenant comes from the signed token.
Fails (the "first crisis turn is never blocked" criterion, and a regression of the p1-u8r cycle 2 item 1 guarantee that a textless or lower-level holder never silences a turn that can escalate):
1. H-C1a: 10 CONCERN turns on 10 threads (10 escalations), then the student's first CRISIS turn on a new thread: helpline only, 0 escalations, 0 new flag rows (flags stay at 10). The budget (chat.ts:724 `takeCrisisBudget`) is spent by concern-level turns because `slotKey` is defined for `level !== "none"` (chat.ts:~706), but the criterion is about crisis turns, and the first crisis turn must still be flagged and escalated.
2. H-C1b: 10 over-long (textless) crisis turns on 10 threads (10 flag rows, 0 escalations possible), then a short real crisis turn: helpline only, 0 escalations, no flag. H-C1j: same with ONE thread, 12 over-long turns then a real crisis turn: escalations 0 -> 0, flags 10. Before this unit the real turn took over the rank-0 slot and escalated (existing test p1-u8r "An over-long crisis does not silence a concern turn either", chat-privacy.test.ts:720-725 covers only 1 prior turn, so it stays green).
Both are reproducible with the shipped fixtures in a fresh world; the student is never denied the reply, but a human reviewer never sees the one turn that could have been reviewed. The maker's manifest lists neither case.
PROPOSED-ISSUE (high, security/safety): w1-chat-privacy per-student crisis write budget is spent by concern-level and textless (over-long, unconsented) turns, so after 10 of them the first escalatable crisis turn in the window is answered but never flagged or escalated. Fix direction: spend/limit the budget separately per kind (escalating vs textless vs concern), or always allow the first escalation-capable turn of each level per window; add the two tests above (10 concern then crisis; 12 over-long then crisis).

### C2 — PASS with proposed issues
Stated names, 19 variants, checked in stored rows, replay and GET history: upper case, lower case, Hinglish "mera naam priya sharma hai", punctuation ("priya!!", "Priya, and"), initials ("p. r. sharma", "Priya R. Sharma"), name-like common words (will/hope, grace, rose lee), "The name is Bond", "This is Anjali", "I'm"/curly apostrophe, name echoed in reply in upper/lower/possessive/hyphen/underscore/glued/"M. Kulkarni"/"Kulkarni, Meera" (profile and stated): no leak in any. Leaks found (all pre-existing detectors, none introduced here):
- PROPOSED-ISSUE (low): `main Priya hoon` and `naam hai Priya` (the builder's stated Hinglish residual; U8r P3) store the name. Not in the C2 text, which names lowercase, in-reply and variants; judged PROPOSED-ISSUE, not FAIL.
- PROPOSED-ISSUE (low-medium): a quoted name `my name is "Priya Sharma".` leaks both tokens (NAME_TOKEN needs a letter first; the quote ends the run). Same for `(Priya)` / `'Priya'` by the same regex.
- Not a leak but noted: "Verma, Anjali here" (no lead phrase) is outside the heuristic, as documented in redact.ts.

### C3 — PASS with a proposed issue
Port throws (async Error, rejected string/undefined, sync throw): ordinary turn 503, no model call, 0 chat_turns; crisis turn helpline, nothing stored, name nowhere; works after recovery (maker tests re-run green). Malformed port output (null/undefined/{}/[null]) gives 500 and stores nothing (fail closed by error).
- PROPOSED-ISSUE (medium): a profile port that never settles (the "times out" case) has no deadline in chat.ts (`pathwaysFacts`, chat.ts:~559): my crisis turn was still HUNG after 3 s with no helpline reply and nothing stored. Never raw, so C3's text holds, but a student in crisis gets no answer while the port hangs; a race-timeout there should treat it as `profileDown` (answer crisis, store nothing).

### C4 — PASS with a stated-risk proposed issue
Real escalateTurns with an echoing classifier, six raw texts (stated lower/upper/Hinglish names, phone `+91 98765 43210`, email, profile name inside the text, profile name that IS the wording "Kill"/"Myself"): in every case the escalate input, classifier calls, stored crisis_flag_reviews rationale and the whole fake Db contain none of the name, phone or email, the raw text is never restated, and the crisis wording is still visible to the classifier. `escalationText` last resort no longer returns raw.
- PROPOSED-ISSUE (medium, builder's stated residual): profile outage + crisis: a profile-only name inside the crisis text ("Meera Kulkarni is my friend") reaches escalateTurns (leak list [meera, kulkarni]); stated names, phone and email are still redacted. Judged against C4 text ("beyond what D-093 6A allows") as a documented accepted gap unchanged from p1-u8r, not a FAIL; needs the engine to redact the stored rationale.

### redact.ts lower-case initial change
30 benign English + Hinglish sentences (incl. "i am s. and i want to study", "my name is a.", "call me if the fees change", "mera budget 20 lakh hai"): HEAD output identical to base da2faad on all 30; the only two redacted ("name is required on the form", "mera naam hai kya form mein") are pre-existing and identical in base. Initials still name-continue: "my name is s. kumar", "i am j. r. d. tata", "call me k. v. rao" redacted; trailing/lone initials ("i am a. i want to study", "my name is s.") untouched. 20k-initial run: 49 ms (linear).

### Other residuals judged
- In-memory per-process budget, fixed window 2x edge: PROPOSED-ISSUE (low), accepted design (restart or second process resets), documented.
- Brief labels ISS-198 as "fails closed", but the ledger row ISS-198 is the lower-case initial; the unit covered both. No action.

## Commands (all through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 ...`)
hostile.test.mts 13 tests (11 pass, 2 expected-fail asserts = the C1 findings; the rest print findings), hostile2.test.mts 9 pass (informational), overredact.test.mts + redact.test.ts 23/23, apps/api 12 files 459/459, db student-store 19/19, tsc x2 exit 0.
