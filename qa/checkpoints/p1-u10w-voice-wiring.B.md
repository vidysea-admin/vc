# Checkpoint (coordinator B) - p1-u10w-voice-wiring, cycle 1

Written: 2026-10-19T08:47:29+05:30
Code identity: branch p1/u10w, head 0c2b9812414d804cc910dbcd209837efee5ef6e1 (product code = 29962ce); whole-unit base 76b89c5ea4711de36d1fdae49809711b8957ae87; repair base 8fca003.
Policy: proportional-verification/2026-10-18.15. Tier L. Mode A.
Environment: Windows 11, Node + pnpm, C: full (0 bytes free; ENOSPC on C: is ENVIRONMENTAL), all tests via VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh, scratch trees under D:/vc/.worktrees/p1-u10w-chkB-*.

State: ALL mandatory checks complete. Verdict FAIL (W5, low). Nothing left to resume.

## Evidence identities (command | scope | code | environment | attribution)
1. api voice+chat 7 test files, 132/132 twice | C1-C19, W1-W10 tests | clean tree p1-u10w-chkB-s1 @0c2b981 | testlock, TEMP default | runner sub-checker, qa/evidence/p1-u10w-B-c1/runner/
2. full api tests/*.test.ts, 292 tests, 291 pass, 1 ENOSPC (go-live-gate.test.ts:201); rerun with TEMP/TMP on D: 14/14 | whole api package | same tree | testlock | runner
3. packages/db chat-threads+erasure+erasure-approver 101/101; packages/providers live.test.ts 70/70; pnpm -r typecheck exit 0 | same tree | runner
4. C18/W1 probes (16, 15 green, p12a red = P3), mutants C18-F1/F2 and W1-F1/F2 red | scratch tree p1-u10w-chkB-c18w1 | c18w1 sub-checker, qa/evidence/p1-u10w-B-c1/c18w1/
5. W2/W3/W4/C19 probes (20, 19 green, p3d red = P2), mutants W2-F1/F2, W3-F1/F2, W4-F1a/b, C19-F1 red | scratch tree p1-u10w-chkB-w234 | w234 sub-checker, .../w234/
6. W5-W10 + startApi wiring probes (43, 40 green; 3 red = padded flag values = P1 FAIL), mutants W5-F1, W6-F1b/c, W7-F1/F2, W8-F1/F2, W9-F1 red, W6-F1a survives (equivalent) | scratch tree p1-u10w-chkB-wiring | wiring sub-checker, .../wiring/ (mutants-summary.txt, probe-run1.summary.txt)
7. C1/C2/C7/C11/C15 auth, tenancy, cap probes (20, 19 green, red = P4), mutants AUTH-F1, CAP-F1a/b/c red | scratch tree p1-u10w-chkB-authcap | authcap sub-checker, .../authcap/
8. Coordinator repro of W5: probe in tree p1-u10w-chkB-s1 (apps/api/tests/zz-flag-probe.test.ts), 16 tests, 13 pass, 3 fail; log .../coordinator-flag-repro.log; voice.ts:160 read directly | coordinator (me)
9. Manifest lint: tick.mjs --lint-manifest on the manifest printed nothing; dual-trigger lines verified against voice.ts:369, voice.ts:1315, index.ts:325, index.ts:323.
10. Diff-scope read (4c): clean, no unexplained removals.

## Not done / limits
- No live browser (API only). No real Gemini or paid provider calls (W10). No push.
- W6-F1a equivalent survivor; W2-F2/C19-F1 killed only by runner timeout (P5).
- agent_min is gross (includes test-lock waits).
- Did not read the other coordinator's verdict, checkpoint or evidence.
