# p1-u10w-voice-wiring: coordinator A verdict

Cycle checked: 1
Policy-Version: proportional-verification/2026-10-18.15
VERDICT: FAIL
Checker: /checker coordinator A, blind dual check, Mode A, tier L. Bound tree D:/vc/.worktrees/p1-u10w (branch p1/u10w), source head 0c2b9812414d804cc910dbcd209837efee5ef6e1; HEAD moved to 7ce9aba during my run by a commit that adds only qa/ files (git diff --name-only 0c2b981 HEAD lists qa/ paths only, so src and tests are byte-identical).

CHECK-PLAN: Re-evidence U10 C1-C19 and U10w W1-W10 on the bound tree with hostile variants. (1) Baselines through the shared testlock: api voice+chat sets, db, providers live, importers, workspace typecheck. (2) Diff-scope and full read of apps/api/src/voice.ts, the index.ts/server.ts wiring diff and the new tests. (3) Hostile probes in a scratch copy (chkA.test.ts): C18 pairing under unanswered earlier turn, throwing detector, mixed order, redaction, unconsented minor; WS auth (alg none, HS384, iss, aud, exp, cross-student, cross-thread, replay, cross-tenant), flag gate values, monthly cap with overlapping starts. (4) One falsification per changed criterion (C18, W1-W9) plus samples of unchanged auth/cap criteria (C2, C7), each in an isolated copy under D:/vc/.worktrees with node_modules junctions: GREEN before, RED after. (5) W10 by network grep over the new tests.
SCOREBOARD: baselines all green (132/132, 101/101, 70/70, 78/78, typecheck exit 0). 12/12 own probes pass at head. 17/17 mutants killed with the intended test failing (C18a, C18d, C18g, W1, W2, W3, W4, W5, W6, W7, W8, W9, A1, A2, A3, A4, A6). C18, W1, W2, W3, W4, W6, W7, W8, W9, W10, C1-C17, C19: all pass. W5: FAIL (one finding, below).
CHECKED-STATE: source head 0c2b981; bound tree never mutated (git status shows only my untracked qa/evidence/p1-u10w-A-c1/); mutants ran only in scratch copies, since removed (junctions unlinked first, original node_modules intact). Full api suite (292) not run, per the brief.

FAILURES:
- P1 W5 MEDIUM: voice turns ON for a padded flag value. apps/api/src/voice.ts:160 `const raw = env[VOICE_FLAG_ENV]?.trim();` then :162 `if (raw === "true") return true;`. Manifest W5 (line 44): "VC_VOICE_ENABLED unset or not exactly \"true\": no voice route, an upgrade is refused, and nothing voice-related is constructed." Executed proof: probe PA9 printed `PA9 observation: ' true ' -> true` (qa/evidence/p1-u10w-A-c1/probes/chkA-run1.txt line 40, PA9 passes its own assertions that only unset/empty/"false" are off and others throw). The W5 test covers only unset, empty and "false", so it cannot see this. A value with stray whitespace is "not exactly true" and must be off. Voice still needs the A20 gate and the other pre-connect checks, so this is not an open door, but it is a spec deviation in the default-off flag. Fix options for the maker: drop the trim (so " true " falls to the throw branch or off), and add " true ", "TRUE", "1", "yes" cases to the W5 test; or ask Umesh to amend the criterion if trim is intended.
  Related W5 note (not counted separately): any other non-"true" value ("yes", "TRUE", "1") throws VoiceConfigError and the API does not start, rather than "no voice route". It fails closed, but the manifest wording says no route; the maker should state which behaviour is intended.

PROPOSED-ISSUE (low, not counted as failures):
- P2 LOW C18/C14: a no-words crisis after an earlier student turn reuses lastUser.turnId (voice.ts onCrisisRecord), so two such crises share one idempotent key and the second escalation collapses into the first. Probe PA13 observed 2 notification records (admin, counsellor) for 2 crises with 1 distinct id (chkA-run1.txt line 39). Idempotency is arguably intended, but a second distinct crisis in one session is silently not re-escalated; a per-record id would avoid it.
- P3 LOW: manifest wording says the WS token requires "sub"; the code requires exp, iat and jti (aud, iss, HS256 checked). Wording only.
- Maker-stated survivors confirmed as equivalent or outside tests: W6d, W9b, C18c. Not re-litigated.

COMMANDS (all through VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh, logs in qa/evidence/p1-u10w-A-c1/):
- apps/api tests/voice.test.ts voice-audit voice-history voice-limits voice-wiring voice-crisis-turn chat.test.ts -> 132 pass, 0 fail (api-voice-chat.txt).
- packages/db tests/chat-threads erasure erasure-approver -> 101 pass, 0 fail (db.txt).
- packages/providers tests/live.test.ts -> 70 pass, 0 fail (providers-live.txt).
- apps/api importers (anonymous-route, chat-profile, index, server, student-openapi) -> 78 pass, 0 fail (api-importers.txt).
- pnpm -C D:/vc/.worktrees/p1-u10w -r typecheck -> exit 0 (typecheck.txt).
- scratch copy tests/chkA.test.ts (PA1-PA6, PA9, PA10a-c, PA11, PA13) -> 12 pass, 0 fail (probes/chkA-run1.txt; probe source probes/chkA.test.ts).
- python fals/mutate.py (and mutate-forceexit.py for W6) -> fals/summary.json; per-mutant green/red counts: C18a 6/0 -> 5/1; C18d 6/0 -> 5/1; C18g 6/0 -> 0/6; W1 15/0 -> 12/3; W2 15/0 -> 13/2; W3 15/0 -> 13/2; W4 15/0 -> 14/1; W5 15/0 -> 14/1; W6 15/0 -> 14/1; W7 15/0 -> 11/4; W8 15/0 -> 14/1; W9 15/0 -> 13/2; A1 64/0 -> 63/1; A2 64/0 -> 63/1; A3 64/0 -> 63/1; A4 64/0 -> 63/1; A6 10/0 -> 9/1.
- W10: grep of the new tests for URLs and network calls (probes/w10-network-grep.txt): only synthetic .test/.example hosts and 127.0.0.1; fake providers only.

REMAINING: after the W5 repair, re-run voice-wiring.test.ts and the W5 mutant. Everything else needs no re-check unless the repair touches more than voiceEnabledFromEnv. Voice stays off (VC_VOICE_ENABLED unset, A20 closed) until PASS.
LIVE-BROWSER: not applicable to this unit; no UI claim.
ISSUES-WRITTEN: none (dual-check side effects belong to the parent); PROPOSED-ISSUE P1 (W5), P2, P3 above.
EVIDENCE: qa/evidence/p1-u10w-A-c1/{api-voice-chat.txt,db.txt,providers-live.txt,api-importers.txt,typecheck.txt,baseline.sh,baseline.done,probes/chkA.test.ts,probes/chkA-run1.txt,probes/w10-network-grep.txt,fals/mutate.py,fals/mutate-forceexit.py,fals/mutate.out,fals/summary.json,fals/W6-rerun-forceexit.out,fals/*.green.log,fals/*.red.log}.
PROCESS NOTES (honest disclosure):
- Independence: after my probes and mutants had finished, a diagnostic `git log -5` and `git diff --name-only 0c2b981 HEAD` that I ran to see why HEAD had moved printed the subject line of coordinator B's commit ("U10w coordinator B verdict (FAIL W5, cycle 1)") and the file names under B's evidence directory. I opened none of B's files. My W5 finding rests on code I read (voice.ts:160-162), the manifest line 44, and PA9, which I ran and recorded (` true ` -> true) BEFORE I saw that subject; I had logged it then as a low observation and raised it to FAIL on re-reading the criterion text "not exactly true". The parent should weigh the independence of this one finding accordingly. Every other result is unaffected.
- W6 first run: the red run of voice-wiring hung after the W6 test failed (the mutant skips the go-live gate, so a server stays listening and the node test process never exits). I killed only my own PIDs (the hung test tree I started), then reran W6 alone with --test-force-exit and --test-timeout=120000: killed, 14 pass / 1 fail, the W6 test failing. The first summary is kept as fals/summary-first-run.json, where W6 shows a false SURVIVES from the killed process; the final fals/summary.json has the rerun.
- C: is full; large outputs were redirected to D:. No environmental failure affected a verdict.
- No push, no production Mongo, no provider call, no .claude/** change, no edits outside the bound tree's qa/ evidence, checkpoint and verdict files.
Metrics: start=2026-10-19T08:04:33+05:30 end=2026-10-19T08:50:06+05:30 wall_min=45.5 agent_min=unavailable blocked_min=unavailable suite_runs=0 targeted_runs=5 repeat_runs=1 mutations=17 cycle=1 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal mutants=17 killed=17 defects_unit=1 defects_6c=0
