# Verdict: t060-voice-turn-id (T-060 / D-143)

Verdict: PASS
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Checked: base 66eef499, head 1fe5be88 (code 7242a9b7). Tier L (timing/attribution), single checker.

## Check plan
Full read of `git diff 66eef499..1fe5be88`; rerun of the touched tests on head; one falsification per criterion in a throwaway copy outside the root; hostile variants in the same copy; verification of the "inert in production" claim from the code. No full suite, no secrets, no real student text, no Gemini call.

## Diff scope
Files changed: apps/api/src/voice.ts, packages/providers/src/live.ts, two new test files, the manifest. This is exactly the D-143 Changes-authorized set (voice.ts readout path, live.ts turn id, their tests). voice.ts hunks sit at Conn (~660), the two readout dispatch sites (~1002, ~1051), `readoutOwnsOutput` and the audio/transcript/turn_complete cases (~1196-1250). `case "interrupted"` and `case "crisis"` (the crisis-message path) are untouched. No edit to index.ts, graph.ts, DECISIONS.md, qa/contracts, .claude/**.

## Production-behaviour claim (checked from code)
Confirmed. `GeminiLiveBackend.sendText` is `void` and returns nothing (live.ts ~914). `translateGeminiMessage` calls `sink.outputTranscript(text)`, `sink.outputAudio(bytes)`, `sink.turnComplete()`, `sink.interrupted()` with no id (live.ts ~970-990); the Gemini serverContent fields read there carry no turn id. So with Gemini: `LiveSession.sendText` returns undefined, `readoutTurnId` is undefined, no event gets a `turnId` key (`turnIdField` returns `{}`), `readoutOwnsOutput` falls to `c.readoutEarlierTurnOpen !== true` (the old condition) and `turn_complete` takes the old `readoutEarlierTurnOpen` branch. The `closesEarlierTurn && !byId` guard keeps the old reset exactly. Net: NO production behaviour change today; the id path is an inert seam that only a transport reporting ids (the mock now) activates. Not a FAIL. Finding for the D-143 review: T-060's stated risk (a late reply arming the yes/no) is NOT closed in production until a real wire id exists; S13 arrival order still decides there.

## C1 - late reply of another turn does not arm or decide (PASS)
- Head, bound tree: voice-readout-turn + voice-history + voice-usage = 35 pass / 0 fail; live-turn-id + live = 86 pass / 0 fail. tsc --noEmit clean in providers and api.
- Falsification (copy, base voice.ts + live.ts, new tests kept): api C1 test RED ("timed out waiting for: early yes recorded as plain speech", pass 2 / fail 1); providers C1 test RED (pass 2 / fail 1). Restored; green on head.

## C2 - no ids = byte-for-byte S13 rule, no turnId key (PASS)
- Providers: "no turnId key on any event, sendText undefined" and crisis-text test green on head. Reading the diff: every emit uses `...turnIdField(turnId)`, which yields `{}` for an absent/empty id.
- Falsification A (copy of head, `turnIdField` always returns `{ turnId }`): providers C2 no-key test RED (pass 2 / fail 1).
- Falsification B (copy of head, no-id fallback of `closesEarlierTurn` mutated to `false`): voice-history S13 fix-c3b transcript and audio tests RED (pass 25 / fail 2).
- Non-blocking observation: mutating only the `readoutOwnsOutput` legacy fallback to `return true` survives (27/27 voice-history). That condition is redundant with the turn_complete `closesEarlierTurn` rule in the base too, so the id change adds no new exposure. Note for the maker, not a defect.
- voice-history S13 fix-b/c2/c3b/c4b tests unchanged and green on head (27 pass).

## Hostile variants (throwaway copy, extra tests, not committed)
- Readout has an id, events carry none: arrival rule, readout arms, early yes decides nothing: PASS.
- Earlier turn t0 open at dispatch, then interrupted(t0), stray turn_complete(t0), other turn t2 completes while the readout is speaking: none arm; the readout's own turn_complete arms: PASS.
- Two/three readouts back to back (the ambiguous or early answer re-dispatches, new ids): tail output and turn_complete of an OLDER readout id never arm the CURRENT readout; the current id's turn_complete does: PASS.
- Readout already cleared (done), then an unrelated turn and a duplicate turn_complete of the old id: no re-arm, no error: PASS.
- Readout with no id, events with ids (builder's test 3): falls to arrival order: PASS.
- Two scripting errors of mine in the first drafts of two hostile tests (miscounted state events; hard-coded ids although an early yes re-dispatches the readout, legacy S13 behaviour also seen with no ids) were test bugs, fixed in the copy; the control with no ids passed throughout. Not product defects.

## Findings
None blocking. Low, for the ledger (PROPOSED, not filed by a unit): in production (Gemini) the seam is inert, so T-060's runtime benefit needs a wire-level id; the manifest says so openly.

## Instruments
Copy: scratchpad/copy with node_modules junctions re-pointed so workspace links resolve inside the copy (mutants never touched the bound tree). Bound tree stayed clean (git status empty after the check).

Metrics: start=2026-10-30T23:05:00+05:30 end=2026-10-30T23:30:00+05:30 wall_min=25 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1500 mutants=0 defects_unit=0 defects_6c=0
