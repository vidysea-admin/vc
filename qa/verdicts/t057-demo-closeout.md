# Verdict: T-057 demo close-out (D-138 + D-139)

Cycle checked: 0
Checker: fresh /checker (Sonnet), read-only toward product code and contracts. Date: 2026-10-30.
Judged against: docs/demo-contract.md (FROZEN, D-124) C1-C11 plus tier A.
Overall: **PASS-WITH-HOLD** (C1/C2/C4/C5 held on external causes). D-138 + D-139 are safe to push, with the hunk-level exclusion below.

## Re-run by me (bound tree, unchanged)
- `pnpm -C packages/engine exec tsx --test tests/crisis-defaults.test.ts` -> 19 pass, 0 fail.
- `pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts tests/voice-wiring.test.ts tests/partner-voice.test.ts` -> 125 pass, 0 fail.

## Per criterion
| # | Status | Evidence | Why |
|---|---|---|---|
| C1 | BLOCKED-EXTERNAL | qa/evidence/t057/c1-pathlynks-network.md | Preflight is 2 of 4 OK. Pathlynks RDS drops TCP 5432 from this machine (allow-list), and KB `/search` gives no reply in 40 s (KB host, D-131). Not a code defect. |
| C2 | BLOCKED-EXTERNAL | scripted-checks.md (C2 block), c1-pathlynks-network.md | All 8 Pathlynks blocks are `connect_error`, same RDS cause. Not re-verified since 10-28; the network state is unchanged per the 10-30 probe. |
| C3 | MET | scripted-checks.md; walk-vidysea-run9-voice.log step05 (426 ch, kind=bot) | Snapshot + Vidysea profile read OK. Subjects, selected career and university preferences print empty for this student's snapshot row. |
| C4 | BLOCKED-EXTERNAL | walk logs | Fit scores and traits live in the Pathlynks DB. The Vidysea answer comes from the snapshot's recommendedCareers only, so "citing fitscore/trait sources" cannot be shown. |
| C5 | BLOCKED-EXTERNAL (not met today) | walk-run4-diagnosis.md, run 9 step06 (kind=note) and its screenshot | The turn is the `no_sourced_answer` general-guidance note, with no KB citation. The cause is the degraded KB `/search`. Also VC caps `/search` at 4 s, so even the old 13.7 s fails. The report must not claim C5. |
| C6 | MET (weak) | run 9 steps 07-09; vidysea-09 screenshot | Propose, confirm and a new thread work, and the confirmed fact (intended_major) shows in the new thread's memory. The walk never asserts that the recall reply uses the fact; that reply is generic guidance. |
| C7 | MET (indirect) | run 7 step09 and run 9 steps 05-06 share thread 59471f93 | The thread persisted across a full API restart. chat-privacy "after the server restarts" test is green. There is no dedicated restart-then-GET script. |
| C8 | MET | scripted-checks.md | 37/37 unit tests; live 401 probe 12/12. The live cross-student 404 was not run (no signing key); it is proven by code order only. |
| C9 | MET | run 9 step10 (kind=crisis, 606 ch, after D-138 code); hostile tests below | Zero LLM calls and the flag + escalation are shown by tests. The live turn shows the crisis card. |
| C10 | MET with gaps | c10-voice-d139.md, run 9 step04 | One synthetic-WAV session: 71 audio frames, 316-char stored answer with report-derived career fields (not the code's unavailable text). Gaps: no tool-call log, so the tool name and duration are inferred; the filler line was not heard in the transcript; no real-mic turn; the `turn_usage` row is a zero-token placeholder (cost is an estimate, about $0.01). I did not start a Gemini session. |
| C11 | MET (Vidysea) / partly stale (Pathlynks) | run 9 11/11 OK; walk-pathlynks-run3.md | Run 9 is the walk with both D-138 and D-139 code. Pathlynks run 3 (10-29, 15/15) predates D-138, and no post-D-138 Pathlynks walk exists, although steps 12-14 are the ones that motivated D-138. |

## Tier A crisis safety (hostile variants, in a copy, not the bound tree)
New file in the copy only: `fal/packages/engine/tests/hostile-d138.test.ts`, 19 pass.
- H1: 5 crisis texts (English, Hinglish, Hindi, indirect, crisis + study question) x prior flag false / true / store throws. Each gives state `escalated`, the exact fixed language message with 14416, zero model calls, zero KB calls, one flag, one escalation.
- H2: after a crisis turn, 3 ordinary turns are answered with no helpline. There is exactly one flag and one escalation in total, and `priorFlag === true` reaches the kb-answer model input.
- H3 and H4: with a prior flag, or when the flag read throws, a reply carrying "keep this confidential between us" is replaced by the fixed safe message. The unflagged control shows the reply, so the stricter rule really keys on the flag. A failing flag store fails toward caution.
- H5: a stress phrase on a flagged later turn still gets the check-in and 14416 exactly once.

## Falsification (copy at scratchpad/fal; bound tree untouched)
- D-138: re-adding the prior-flag helpline suffix turns RED: crisis-defaults "A11b keep talking" and hostile H2 (2 fail). Restored (cmp identical): 38/38 green.
- D-139: (a) timeout back to 5 s turns the D-139 timeout test RED; (b) removing the filler append (voice.ts:1284) turns the V2 wiring test RED (60 pass / 1 fail). Restored (cmp identical): 61/61 green. The dedicated "filler" unit test only asserts the constant's wording, so V2 is the real wiring guard.

## Push safety
D-138 + D-139 src diffs are minimal and match their `Changes-authorized` fields (both Approved-by Umesh). Only the three src files carry them (graph.ts, index.ts, voice.ts); graph.ts holds no T-059 source change.
**Do not exclude `packages/engine/tests/student-graph.test.ts` as a whole.** Its D-138 hunks (old `/14416/` assertions flipped, new R9/D-138 test) are required, and without them the pushed tree is red. Exclude only the last hunk (`@@ -1808,0 +1820,45 @@`, the `// T-059` block with 3 tests). With that hunk removed, 138 of 139 pass in the copy; the 1 failure is a missing `mcp/` file in the copy, not a defect.
Also never commit `qa/.6c-green` (modified in the tree) or the stale-tick files unless the gate says so.

## PROPOSED-ISSUE
1. PROPOSED-ISSUE (medium): the brief says walk run 7 is 11/11 OK; the log shows step04 c10-voice FAIL (10/11), and run 7 (10:13) predates the graph.ts edit (10:27) and D-139. Use run 9 only.
2. PROPOSED-ISSUE (medium): C5 and C4 have no passing evidence. The walk marks a `no_sourced_answer` note OK and does not assert citations, so "OK" for C5 means nothing. Add a citation assertion to the walk.
3. PROPOSED-ISSUE (low): no post-D-138 Pathlynks walk (goal/progress after a crisis in the same thread); unit tests cover it.
4. PROPOSED-ISSUE (low): voice path logs no tool-call name or duration, `turn_usage` is zero-token (read `usageMetadata` in packages/providers/src/live.ts), and the filler was never heard (the Live output transcription may drop it). D-139 senior warning stands: inner per-read 5 s caps remain.
5. PROPOSED-ISSUE (low): the D-138 entry in docs/DECISIONS.md has mojibake in its quoted Hindi (append-only, so supersede only if it matters).
6. PROPOSED-ISSUE (low): the evidence screenshots show the test student's name; review them before any commit.
