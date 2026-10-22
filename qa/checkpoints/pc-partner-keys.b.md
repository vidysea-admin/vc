# Checkpoint - pc-partner-keys (checker B, cycle 0) - evidence identity
Checked state: wave/pc-partner-keys code at cfb70c3 (src under apps/, infra/, packages/ unchanged through the later HEAD; base 3a70309). Environment: Windows 11, node + tsx run directly (not via npx: cmd re-parses the pattern), through D:/vc/scripts/vc-testlock.sh; no nginx binary; fake Db, no real Mongo.
Coordinator B was blind to coordinator A's verdict/checkpoint. One exposure: `git log` for the branch printed A's commit subject (verdict FAIL, "K1 rotate lost update") before I wrote anything. I did not open A's files. The H9 reproduction below was written and executed by me from partners.ts:286-300.
- tsc --noEmit (apps/api) -> exit 0.
- tests/partners.test.ts (builder's) -> 42 pass / 0 fail (re-run).
- tests/anonymous-route.test.ts --test-name-pattern "H2|H6|G5" -> 9 pass / 0 fail (qa/evidence/pc-partner-keys-b/anon.out.txt).
- tests/chat-profile.test.ts "H2|LK7 C1-fix" -> 6 pass / 0 fail (profile.out.txt). tests/chat-privacy.test.ts -> 39 pass / 0 fail (privacy.out.txt).
- Hostile suite outside the tree, hostile-B.test.mts (H1-H8, H4b) -> 9 pass / 0 fail (hostile.out.txt).
- Hostile H9 outside the tree, hostile-B-race.test.mts -> 0 pass / 1 FAIL (race.out.txt): result {newPubWorks:false,newSrvWorks:true,oldPubStillWorks:true,oldSrvStillWorks:false}.
- Falsifications K1-K5 in copies outside the tree (fals.sh; logs fals-K*.log.txt): each green-before (1 pass), red-after (1 fail, an AssertionError on the named test), restored copy cmp-identical to the worktree. K4's first attempt was a bad mutant (escaped &&), kept as fals-K4.bad-syntax.log.txt, redone clean.
- CLI exits: usage 2, refusal 1, short pepper 1.
Inputs: apps/api/src/partners.ts, anonymous.ts, chat.ts, index.ts, openapi.ts, apps/api/scripts/partner.ts, infra/ubuntu/nginx-vc.conf, apps/api/tests/partners.test.ts. Checker-run, 2026-10-22T08:19:14+05:30.
Result: FAIL (K1 rotate lost update, see verdict).
