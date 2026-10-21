# Checker brief: /checker Mode A for p1-lk7 (policy .17, Tier L, single checker; includes a protected test change)
Manifest qa/manifests/p1-lk7.md on branch p1/lk7 (code 6d7ecdc, manifest 0d3441c, base a11653e), worktree D:/vc/.worktrees/lk7. Read-only toward the artifact; write only qa/verdicts/p1-lk7.md (Cycle checked: 0) and commit it on p1/lk7.
Prove OUTCOMES with hostile variants, not construction:
1. Real startApi: VC_TEXT_CHAIN set + cap missing / "0" / "-5" / "abc" / "1e999" / " 50 " -> refuses before connecting; valid cap starts; no chain -> no cap needed.
2. Cap reached mid-month -> chat returns 200 degraded reply, no failover to next hop, no 500; month rollover resets.
3. crisisGuard first: crisis text (incl. "khudkushi") makes zero detector/screen/chain calls.
4. Anonymous: behaviour byte-identical to base with VC_ANONYMOUS_SAFETY_SCREEN unset.
5. JUDGE the maker's open risk 2: authenticated screen ON by default; if the base provider cannot serve the classifier (missing key / rules-only), does EVERY turn get the crisis message? If yes, that breaks normal chat in prod: a FAIL-worthy finding unless an env kill switch or a startup refusal exists. State it plainly.
6. Protected test edit (LK1w chat test now asserts no non-classifier calls instead of zero calls): justified or weakening?
7. chat.ts 7-line pass-through outside the owned files: correct?
Reuse maker evidence only on identity match. Tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>`, TMP/TEMP on D:. Long lock waits normal. Never kill processes, never touch .claude/**, never push.
Report PASS/FAIL, findings file:line, verdict sha.
