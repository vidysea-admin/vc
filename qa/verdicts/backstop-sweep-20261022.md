# Backstop sweep (Mode B) - origin/main da227b2, 2026-10-22

VERDICT: PASS-WITH-LOWS (no S1/S2, no HOLD)
Checker: fresh-context Mode B, read-only toward code. Worktree: .worktrees/sweep-20261022 (detached at origin/main da227b2, tree 7545b34f9adb59f21a222759d14747e293c4112b). Stamp written: 2026-10-22T22:17:04+05:30.
Previous sweep: 2026-10-19 (8dd6890 tree, origin/main d7319b9). Window: d7319b9..da227b2 (576 commits, 78 non-merge commits touching apps/ or packages/).

## 1. Install, typecheck, suites (TMP/TEMP on D:)
- pnpm install --offline --frozen-lockfile: exit 0.
- pnpm -r typecheck: exit 0 (every workspace Done, including engine evals+scripts, api, web).
- Full suite through vc-testlock.sh, run twice. Run 1 (pnpm -r, bail on first failure) stopped at @vc/engine, so run 2 added --no-bail to reach every package (VC_TESTLOCK_TIMEOUT_SECS=7200, workspace-concurrency=1).

| package | tests | pass | fail | skipped |
|---|---|---|---|---|
| apps/widget | 65 | 65 | 0 | 0 |
| observability | 59 | 59 | 0 | 0 |
| schemas | 98 | 98 | 0 | 0 |
| db | 289 | 289 | 0 | 0 |
| providers | 201 | 201 | 0 | 0 |
| mcp/student-profile | 12 | 12 | 0 | 0 |
| engine | 1878 | 1832 | 1 | 45 |
| web | 44 | 44 | 0 | 0 |
| mcp/university-kb | 77 | 77 | 0 | 0 |
| api | 595 | 595 | 0 | 0 |

api: 0 failed, 0 skipped (A20 all-targets test is unskipped and green; no allowed red remains).
Engine failures are timing-bound only, both in packages/engine/tests/guard-crisis.test.ts, a DoS-latency bound, not a recall assertion:
- Run 1: ":1013 leet fold is linear" (best-of-3 235 ms vs 200 ms bound) and ":1067 'see the point in continuing' linear" (182 ms vs 120 ms bound).
- Run 2: only ":1067" failed (135 ms vs 120 ms bound); ":1013" passed.
- Run alone under the lock, 3 times: both pass every time (the whole 2-test file selection finishes in about 120-165 ms each, so a single scan is roughly 20 ms against the 120 ms bound).
Load-flake rule: passes alone + timing/deadline assertion, so low row ISS-sweep-20261022-1. Caveat: the rule's "file unchanged" leg is only partly met, because crisis.ts grew since the last sweep (lk8, lk10, ISS-340 patterns) and the 120 ms bound is the tightest in the file. Suggest the maker widen the bound or move to a ratio test.

## 2. Bypass detection (commits since the 8dd6890/d7319b9 stamp up to da227b2)
Every one of the 78 non-merge commits touching apps/ or packages/ was matched to a manifest at checked-PASS, or merged-no-check (test-lane): p1-lk1..lk10 and sub-units, p1-nosource-expert/grounded, p1-grounding-hardening, p1-alerts, p1-a10-*, p1-u13b-*, p1-iss135/303/330/340/350, p1-ollama-actual-tokens, p1-deepseek-id, p1-greal-bold, p1-eng3-crisis-leftovers, golive-*, pc-widget, pc-docs-openapi, pc-partner-keys, pc-voice, pc-reserved-ids(-2), pc-hardening(-2..-7) checked-PASS; pc-hardening-8 merged-no-check (test-lane, merge 173bd45), as expected. 76 commits cite their sha (or a branch merge) in qa/manifests, verdicts, evidence or QUEUE.
Two commits carry no sha reference in qa/ (both test-only, low):
- 98de1ee "test: guard A20 CLI B13 assertion on the real gate state (ISS-golive-a20-1)": 1-line change to apps/api/tests/go-live-gate.test.ts. It is the fix for ISS-golive-a20-1, which is still status open in the ledger even though the manifest golive-b13guard (checked-PASS, f17eafe) covers the same guard family. Needs the ledger row closed.
- 6d25177 "test: real-bodies expects A10 LiveRefusedError ... (merge conflict fix)": 3-line test fix inside the p1/a10-live merge (4fb24d6, p1-a10-live checked-PASS). Merge-resolution only.
No product-code bypass. Recorded as low row ISS-sweep-20261022-2.

## 3. Crisis-path spot check
- 14416 / Tele-MANAS text present: packages/engine/src/guards/crisis.ts:553,562 (and graph.ts note); asserted in packages/engine/tests (crisis-defaults 23 refs, student-graph 15, lang 12) and apps/api/tests (chat-privacy 15, anonymous-zero-persistence 12, chat 3, partners 4, others).
- Crisis tests present and green in this run: engine crisis-defaults, crisis-escalation, crisis-eval, guard-crisis (all recall assertions green; only the 2 timing bounds above flaked), api voice-crisis-turn, chat-privacy, anonymous-route, anonymous-zero-persistence. No red crisis or helpline test.

## 4. Feedback inbox fold-in
Six items dated after the last sweep carry no FOLDED marker (qa/feedback-inbox.md lines 298, 300, 302, 304, 305, 306): b13-fill Tavily wording in contract B13 (D-090), no-source expert answer, Gemini grounding, partner integration/widget ask, and two maker defaults (K1/K2 rotation, scoped keys). Each already has shipped, checked-PASS work (D-110 p1-nosource-expert/grounded, pc-widget, pc-partner-keys). Folding into contracts is the checker's contract-amendment step; not done in this read-only sweep. Candidate row ISS-sweep-20261022-3 (low): fold lines 298-306 into the contracts and mark FOLDED. Line 298 (B13 still lists Tavily as processor (3)) is a contract-staleness item worth doing before the B13 sign-off is relied on.

## 5. Other
- Open ledger rows: high 25 (all pre-existing, none opened by this window); no new S1/S2.
- Uncommitted pnpm-lock.yaml churn in the sweep worktree was left uncommitted (install side effect).
- No live LLM/Gemini calls, no real Mongo, no python, no .claude/qa-contracts/qa-gates edits.
