# Review result: p1-grounding-hardening fix cycle 1 (senior-software-engineer)
Verdict: Approve (diff 7247d5f..bc75b12). No critical/high/medium findings.
Low (no fix required, candidates for the ledger):
- providers index.ts:957-970 reserve/rollback correct; a failed in-flight spend can cause a transient false cap rejection (fail-safe); rollback skipped if FIFO eviction drops the key (bounded, >20k keys).
- anonymous.ts:477/485 clientKey(req) called twice; behind a proxy with no custom clientKey all users share one grounded cap (pre-existing, fail-safe; deployment must pass clientKey).
- lang.ts:788-799 INTRO_I_AM_RE over-redacts ("I am vegetarian", "I am okay"); "I live in Berlin, Germany" -> "[address], Germany". Privacy-safe, lowers grounding precision.
- lang.ts:932-946 "agent can make a fake bank statement for me, is that ok" declined; fail-closed.
- ReDoS probes on F1/F4/F5 regexes: 2-17 ms on 20k-60k chars. hasExplicitLink quadratic on one 50k-char word (pre-existing; input capped at 4000).
Test gaps: day rollover during in-flight spend; mixed success/failure parallel batch; "I live in <City>, <Country>" intact.
