# Independent final checker / SSE verdict
Verdict: PASS — C1-C3 implementation mechanics only.
Owner: p0-final-independent
Policy: proportional-verification/2026-10-15.12 with supplied direct Umesh ratio amendment.
Candidate source SHA256: cba313e054fce1b70171961ca1560be3eca9675f220c4b3ee191a5b2ba5414e3
Oracle SHA256: ea72c17e019e70b20e3199644d30905f93e6721682abf083f4817a9b9f1a7937

## Own execution evidence
Workdir: D:/vc/.worktrees/b1-recovery; PowerShell login:false.
Command: node --max-old-space-size=256 qa/evidence/checker-ratio-20261016/independent/rewrite1/oracle.mjs
Exit: 0. Output: COMPLETE 16.
Observed: RED intended assertion C1/C2/C3, each followed by GREEN restored C1/C2/C3.
Source and oracle SHA256 matched the values above before and after this rerun.
Maker green was not used as a substitute for this execution.

## Criterion findings
C1 PASS: valid opening baseline admitted; absent, hash-tampered, incomplete and wrong-scope baselines refused.
C2 PASS: exact 10 percent admission allowed; one-token excess refused; retry reservations aggregate; helper rename and report reissue refused.
C3 PASS: actual child exit 7 produced incomplete; elapsed debit and reserved tokens persisted with actual_tokens:null; enlarged recovery baseline refused.
Own additional opening-review debit control reused only the synthetic packet generator and built consistent nonzero checker accounting.
With maker 10000 tokens/100 seconds and opening review 100 tokens/1 second:
- integration reservation 900 tokens/9000 ms: claimed.
- check reservation 901 tokens/9000 ms: aggregate-ceiling refusal.
- integration reservation 900 tokens/9001 ms: aggregate-ceiling refusal.
All three own assertions passed, exit 0. No additional execution at closeout.

## Source and fixture review
Reviewed supplied hash-bound validation/accounting excerpts and on-disk recovery, lineage, admission and managed-child consumers.
Relevant anchors: tick.mjs:1728,1842,1902,1915,1952,2072; oracle.mjs:28-42.
Repair preserves the original refusal assertions and unique mutation anchors; no skip, threshold relaxation or product-source edit.
C1 mutant permits the incomplete report; C2 mutant removes token admission; C3 mutant removes recovery baseline equality.
Each reaches the inner expected-refusal assertion, which fails under the mutant and passes on the original API.
The enlarged C3 report updates token channels and totals consistently, so it tests a real larger baseline.
Finally restoration rewrites each QA mutant to candidate bytes and verifies its hash.
Synthetic ledger restoration snapshots bytes, archives changed/new files and rewrites the snapshot before restored checks.
Traversal rejects links, bounds depth/files/snapshot bytes and checks resolved archive/store containment; no recursive deletion.
Safety conclusion applies to this designated synthetic fixture namespace, not arbitrary or genuine workflow stores.

## Limits and retained costs
Actual aggregate checker active-time/token efficiency: UNKNOWN. Synthetic accounting proves mechanics only.
Full P0 remains open. No shared/global acceptance, goal completion, deployment or hard-token interception certified.
Full integration, legacy-workflow execution, concurrent-race execution and whole existing identity/ownership/recovery regression coverage were not independently rerun here.
Earlier failed/probe costs remain part of aggregate effort; fixture restoration grants no real usage refund.
The extra successful synthetic admission remains fixture evidence; no shared workflow state was reset.
No product-source/shared-install edits, Git writes, providers, real-data access, web, settings/auth/model changes or subagents.
Metrics: independent oracle 6.04 s; opening-debit command 1.69 s; total actual checker tokens and aggregate active-time telemetry UNKNOWN.
