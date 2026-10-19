# You are a /maker build subagent: U10 fix cycle 1 (p1-u10-voice-ws), tier L, dual check
- Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u10 (branch p1/u10, code 7227385, manifest 0563712). Use `git -C <wt>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. C: is nearly full: falsify on a scratch copy of the single file (the maker copy p1-u10-fals may be reused for this, after resetting it to your new sha).
- The senior review BLOCKED 7227385. Its probes are in scratchpad/probe-u10/ (two.probe.test.mts, leak.probe.test.mts); turn them into real tests. Students are often minors. Provider sessions are paid. Locks and limits must hold under concurrency, and a crisis must never be lost.

## Fix (TDD: a failing test first for each item)
1. HIGH, voice.ts:867-873: the one-session-per-student lock breaks under concurrent starts. B and C both await finalize(A), then both set the map and connect. Fix: after the await, loop while `activeByStudent.get(key)` is another conn: supersede it and finalize it. Then return if `c.state !== "starting"`, and only then set the map. Test with a gated drain: A active, B and C start together, exactly 1 live provider session.
2. MEDIUM, voice.ts:873: a conn closed mid-supersede stays in activeByStudent. It is covered by the state check in item 1. Test that activeSessions returns to 0.
3. MEDIUM, voice.ts:1027-1029, 1103, 1136-1184: one student can fill the global 500-socket cap. Apply the same per-student requestsPerMinute limiter as chat.ts:488 (D-088 Q5, 30/min) to handleSession, and add a per-student pre-start socket limit (for example 2). Test that one student is limited while another student still connects.
4. MEDIUM, voice.ts:1028: the 15 s start timer ignores state "starting". Fire on `awaiting_start || starting`. Test with a never-resolving live.connect: the socket closes, and the slot and the student lock are freed.
5. MEDIUM, voice.ts:658-667, 698-700: a failed crisis flag write is not retried or logged. Add `logEvent("voice_crisis_flag_failed")` and one bounded retry, mirroring chat.ts safeWrite/onWriteError. Test the retry and the log.
6. Voice crisis escalation parity: the text path calls the optional `escalateForTenant` port (chat.ts:307-324) and voice does not. Add the same optional port to the voice API and call it from onCrisisRecord with redacted text, under the same rules as chat. If it is absent, behave exactly as today. Test it. If this cannot be done cleanly within voice.ts plus the API factory, leave it out and list it under "Not done" in the manifest with the reason.
7. LOW, voice.ts:747-756: prune the resume log on read and on an unref'd timer, so retained minor transcripts do not outlive the 5-minute window. Test it.
- Low item 7 of the review (inbound audio rate) is record-only: note it in the manifest as an open risk.
- Do not weaken or delete any existing assertion.

## Pre-check + manifest
- Via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (long waits are normal; never quit on a busy lock): the 7 apps/api files in the manifest, db chat-threads + erasure, providers live.test.ts, `pnpm -r typecheck`.
- One falsification per changed criterion, on a scratch copy.
- Manifest: `Fix cycle: 1`, add the criteria, Pre-check[<id>] lines on the final sha, keep the dual-trigger lines, `Status: ready-for-check`. Run `tick.mjs --lint-manifest` and fix any ERROR. Commit with narrow pathspecs.
- Return ONE line: `p1-u10-voice-ws <sha> ready` or `BLOCKED <reason>`.
