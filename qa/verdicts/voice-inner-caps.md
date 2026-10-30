# Verdict — voice-inner-caps
**Verdict:** PASS
**Cycle checked:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Checker:** Mode A, tier L (timing trigger), single checker. Bound to D:/vc/.worktrees/vc-completion/.worktrees/voice-inner-caps, branch wave/voice-inner-caps, base fa678fb4, head 86195121.
**Contract:** docs/DECISIONS.md D-142 item 1 + manifest acceptance (no qa/contracts file).

## Check plan
Read the full diff fa678fb4..86195121; re-run the two D-142 tests, the whole voice-wiring file and tsc; one falsification per criterion in a copy outside the root; check what else the override lifts.

## Diff scope (step 4c)
3 files: apps/api/src/index.ts (+4/-2, one hunk in createQuestVoiceTools.run), apps/api/tests/voice-wiring.test.ts (+80, import of runStudentTurn, two new tests), qa/manifests/voice-inner-caps.md. All inside the authorized scope (voice tool path read timeouts and their tests). No engine, chat, config or dependency file touched. No existing assertion deleted or weakened (existing tests untouched; protected-test trigger not hit).

## Criteria
- C1 PASS. `npx tsx --test --test-name-pattern="D-142" tests/voice-wiring.test.ts` (run by me, apps/api, head): 2/2 pass. The C1 test leaves pathlynksTimeoutMs unset, holds the read for 8 s of fake time, and covers all three graph read sites (Pathlynks port profile graph.ts:1535, Vidysea single read :1508, Vidysea list read :1454). It asserts the data string AND the absence of the unavailable text.
- C2 PASS. The never-resolving read is still pending at 19 s and returns `{message: PATHLYNKS_UNAVAILABLE_TEXT}` with outcome `timeout` at 20 s. The test also asserts the shared deps object has no pathlynksTimeoutMs (copy, not mutation) and that runStudentTurn on the same deps still returns the unavailable message after 5 s (chat cap unchanged).
- Diff criterion PASS: no out-of-scope file.

## Falsification (copy at scratchpad/mut, tree from git archive of head, node_modules junctioned, bound tree untouched)
- F-C1 (revert `runStudentTurn(voiceGraph,` to `selected`): C1 RED ("pathlynks_profile actual: {message: I can't see your Pathlynks data right now} expected /12/"), C2 also RED ("still waiting just before 20 s: true !== false"). Green on head before, red after, restored. This reproduces the builder's red-on-base independently; it is a valid red/green for C1 and for the early-cut half of C2.
- F-C2 (outer race `VOICE_TOOL_TIMEOUT_MS` -> `* 2`): C1 stays green, C2 RED ("actual: 'ok', expected: 'timeout'"). Shows the 20 s ceiling assertion bites on its own and the override alone does not lift the ceiling.
Not run: a mutation of the chat 5 s guard (code unchanged by this diff; the assertion guards regression only).

## Other commands (head, bound tree)
- Full tests/voice-wiring.test.ts: 24/24 pass. `tsc --noEmit -p apps/api`: exit 0. No full suite run (unit rule).

## Does the override lift a cap that should stay?
No. `pathlynksTimeoutMs` is read at exactly three sites, all in packages/engine/src/student/graph.ts (:1454, :1508, :1535), all student platform reads. The override lives on a spread copy (`{ ...selected, pathlynksTimeoutMs: VOICE_TOOL_TIMEOUT_MS }`, apps/api/src/index.ts:170), passed only to voice runStudentTurn; navigate_steps reads `selected` and has no cap; chat reads (chat.ts:620, index.ts:1087) keep VC_PATHLYNKS_TIMEOUT_MS or 5 s. LLM caps (expertTimeoutMs, rewrite/lang, safety screen at graph.ts:1315) and the liveProfile 5 s cap (index.ts:938) use other fields and are unchanged. The outer Promise.race at VOICE_TOOL_TIMEOUT_MS still bounds the tool, so the voice turn never exceeds 20 s.

## Observations (non-blocking, low)
- LOW: a deploy that sets VC_PATHLYNKS_TIMEOUT_MS below 20 s is also overridden for voice; manifest states this and D-142 intends it. Not a defect.
- LOW: when the outer race wins at 20 s, work() keeps running until its inner 20 s timer fires, the same instant, so no extra leak (pre-existing pattern).
- Manifest `Metrics:` has start=end and wall_min=30 estimate, not measured; wording only.

## PROPOSED-ISSUE
none.

Metrics: start=2026-10-30T22:55:30+05:30 end=2026-10-30T23:04:09+05:30 wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=520 mutants=0 defects_unit=0 defects_6c=0
