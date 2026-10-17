# Verdict: p1-u7-anon-mode
Cycle checked: 0
Verdict: PASS
Bound to: p1/u7 worktree, HEAD f1d762653ba5c33a339815ba8b2339849c06be5d (unit code), base 0e62084a1491b878cbe87b89455681baa5353b77. Coordinator A of a dual check, blind to B (B's commit ede16bb sits on the same branch; I did not read its verdict). Policy-Version: proportional-verification/2026-10-17.14. Tier L, dual-trigger security `apps/api/src/anonymous.ts:54`. Checker: fresh, independent, mock provider only, no network.

## Check plan
Mode A feature check. Criteria from the build brief, the manifest and `docs/plan.md`: A15a, A15b, A15c, A20, TRACE, B21 exception, VAL/B24.6, B24.7, D092, R1B, R2, R3, R4, R5, RA, RCDEF.api, RCDE.eng, RF.eng. Steps:
1. Lint the manifest (`tick.mjs --lint-manifest`) and lane (`--lane-check`).
2. Re-run the two anonymous api test files and the engine student-graph + student-classify files myself under `vc-testlock.sh`, and compare with the maker's counts (no reuse of maker numbers).
3. Read the full diff (step 4c) and the whole of `anonymous.ts` (461 lines); flag any file outside the U7 scope.
4. Security read of the changed lines: A20 gate, text-free counter, 10/min limiter and client key, crisis check before the limiter, helpline on refusals, anonymous output hardening, with hostile probes.
5. Falsification floor of one mutant per criterion, each in a throwaway copy (never the bound tree): green before, red after, restored.
6. Judge the builder's risks: the surviving mutant `RE-restricted-source-listed`, the R1B timeout cancellations, the `mutant-cap-raise` line.
7. Scoped full run of apps/api, packages/db, packages/engine and `pnpm -r typecheck`.

## Criteria
- A15a text-free counter, single writer: PASS. Own mutants A15a-counter-shape and A15a-write-proxy are red on the named assertions (50 text turns through the real route; throwing proxies for gap log, flag log, escalation). Probes H9/H10: provider error text never reaches logs, console or the response; the log line carries the error name only.
- A15b limiter, 10/min per client, salted in-memory key: PASS. A15b-limit and A15b-key-raw red on the named tests; X2 (full table fails open) red on 3 tests. Probe H6: 60k distinct clients stay bounded, an existing client's budget is not reset, /64 rotation shares one bucket. Probe H1: spoofed X-Forwarded-For / Forwarded headers do not buy a fresh bucket (the key is the socket address). See PROPOSED-ISSUE 4 (X1 survivor).
- A15c search-only KB port: PASS. A15c-kb-args red: the KB sees exactly one search call carrying only q.
- A20 go-live gate: PASS. A20-default, A20-exact-true, A20-gate red on the named tests. Probe H4 (8 hostile gate states: B13 missing, g-prod a, g-prod open, g-publish d, bad Nights mode, a future-dated signature, signature inside a fence, signature in a comment) each throw GoLiveRefusedError with 0 Mongo connections; the real repo gates also refuse before connecting. H5: values other than `true` never enable (trim leniency: PROPOSED-ISSUE 3).
- TRACE: PASS. Mutant red: an env that switches LangChain/LangSmith tracing on refuses to build the route.
- B21 exception: PASS. B21-list, B21-method, B21-body-shape red. Probe H16: other registered routes stay 401 with no token; `//v1/...`, trailing slash, `;x`, percent-encoded and NUL variants are all 401 (the absolute-form target `http://evil/v1/public/chat/turns` reaches the same route, nothing else). Probe H7: duplicate keys, __proto__, arrays, BOM, non-string text and body echo are rejected or inert.
- VAL / B24.6 (bare 500, no echo): PASS. VAL-echo-500 red; H10 confirms.
- B24.7 length before crisis: PASS. B24.7-length-before-crisis red. A 413 body is not crisis-scanned, as the contract says.
- D092 drop of unverified claims: PASS. D092-drop red in student-graph (R4 test).
- R1B counter deadline 750 ms: PASS with note. R1B-no-deadline is red by cancellation (cancelled 2 by the 30 s timeout), not by an assertion; for a counter that never answers that is the only observable failure form. Corroborated on the bound code by probe H9 (crisis reply with a hung counter: 200 in 769 ms) and H10 (generic path with a hung counter still replies).
- R2 clientKey or trustSocketAddress required: PASS. R2 red. H4 and the startApi tests show the refusal comes before connectFromEnv.
- R3 address normalisation: PASS. R3 red; H6 confirms /64 and IPv4-mapped sharing.
- R4 sweep rate: PASS. R4 and X2 red.
- R5 OpenAPI 405/413/500 + AnonymousError.helpline: PASS. R5 red.
- RA crisis before limiter, helpline on every non-200: PASS. RA-crisis-before-limiter and RA-helpline-errors red. H2/H2b: a rate-limited client sending a crisis or concern message still gets the fixed message + Tele-MANAS with no model and no KB; the generic 11th request is 429 with the helpline. See PROPOSED-ISSUE 1 for the cost of that exemption.
- RCDEF.api sign-in and no-answer helpline: PASS. RD-signin-helpline and RD-noanswer-helpline red.
- RCDE.eng no model follow-up, opaque ids `s1..`, restricted-kind titles dropped: PASS. RC-followup, RE-opaque-ids, RE-restricted-title red.
- RF.eng email is personal: PASS. RF-email red in student-classify.

## Weakened-assertion review
No existing assertion was weakened in this unit (the diff adds tests and `$inc` support in the fake; the one existing engine test touched is stricter). No skip added; skipped stays 45 (baseline).

## Scope review (step 4c)
Read the full diff. Changed files: `apps/api/src/{anonymous,index,server,openapi}.ts`, `packages/db/src/{collections,erasure}.ts`, `packages/db/tests/fakes.ts`, `packages/engine/src/{student/graph,student/classify,guards/index}.ts`, their tests and the `qa/` evidence. All inside the U7 plan row. No file outside U7 scope.

## Builder's risks
- Surviving mutant `RE-restricted-source-listed`: the "equivalent" claim is WRONG. `claims.ts` (~line 670) builds `cited` from all guarded claims including the unverified ones it later drops, so a source cited only by a dropped unverified claim gets through claims.ts; the graph.ts filter `guarded.sources.filter((s) => cited.has(s.id))` over the kept claims is the line that removes it. My differential probe H17 (a source of kind unknown cited only by a dropped unverified claim) is green on the bound code and red under the mutant (200 body lists `s2` kind `unknown`; expected 1 source, got 2), row X3, `chkA/fals/`. The shipped code is correct; this is a test gap, not a code defect. PROPOSED-ISSUE 2.
- R1B timeout cancellations: accepted, see the R1B line.
- `mutant-cap-raise` line: present and the lint passes; it carries no file:line (PROPOSED-ISSUE 5, info).

## Falsification
33 rows in a throwaway copy (30 contract rows over the 18 criteria, plus X1, X2, X3). Floor of 1 per criterion met. Every row green before. Red after on 31 of 33 (R1B red by cancellation); X1 survived the maker's suite (no test sends an X-Forwarded-For header), and X3 is red only under my own H17 test, i.e. the maker's tests do not kill that mutant. Restoration verified by diffing the copy against the bound tree for apps/api, packages/engine and packages/db (src and tests, CR normalised): 0 differences. The bound worktree was never edited; `git status` is clean apart from this verdict and checkpoint. The driver's own "restored" flag reads False in every row because of the CRLF to LF normalisation, not a failed restore.

## Evidence (all run by me)
- `bash D:/vc/scripts/vc-testlock.sh` whole-file runs: apps/api anonymous-route + anonymous-zero-persistence -> 43/43 pass; packages/engine student-graph + student-classify -> 67/67 pass (`chkA/api-whole.txt`, `chkA/eng-whole.txt`).
- Scoped full runs: apps/api tests 124, pass 124, fail 0; packages/db tests 253, pass 253, fail 0; packages/engine tests 1047, pass 1002, fail 0, skipped 45; `pnpm -r typecheck` exit 0. These match the maker's counts. No tracked file changed.
- Hostile probes (`zz-hostile-a.test.ts`, `zz-hostile-b.test.ts` in the copy; outputs `chkA/hostile.txt`, `chkA/hostile-h4.txt`): 12 cases. 11 passed the first run; H4 first failed on my own invalid case `b13-role` ("Approver" is not a role word), removed it, rerun 1/1 with all 8 states refused.
- Falsification output: `chkA/driver.out`, `chkA/fals/summary.json`.
- `tick.mjs --lint-manifest` rc=0; `--lane-check` none lane-disabled.
- Lock note: about 42 minutes waited on the shared testlock across runs (the project lock script waits up to 30 min per acquisition and the brief says long waits are normal); counted as blocked_min. The run was also interrupted once by an API network outage (ENOTFOUND) and resumed; not a code failure.

## PROPOSED-ISSUES (dual check: I write no ledger rows)
1. [medium] The crisis exemption is an unbounded-CPU path on a public unauthenticated route. A message that `crisisGuard` scores crisis or concern skips the limiter, and the guard scans up to 256 KiB. Probe H13 measures about 212 ms per 256 KiB crisis-at-end request, 10 in a row all 200, with no per-client budget. The crisis-before-limiter order is the contract (B24.7, RA), so this is a design gap, not a regression: give the crisis path its own larger per-client budget, or cap the scanned length, or scan off the request path.
2. [low] Test gap: no maker test kills the `RE-restricted-source-listed` mutant, and the manifest calls it equivalent when it is not. Add the H17 differential (source cited only by a dropped unverified claim, kind unknown) to `student-graph.test.ts` or `anonymous-zero-persistence.test.ts` and correct the manifest note.
3. [low] `anonymousEnabledFromEnv` trims, so ` true ` enables the public route; the A20 wording is "exactly true". Fail-safe either way (the gate still applies); make it exact or document the trim.
4. [low] Test gap: the X1 mutant (default client key reads X-Forwarded-For) survives the maker's suite. The shipped code uses the socket address and probe H1 proves it; add a spoofed-header assertion to A15b. Operational caveat: behind a reverse proxy the deployment must supply `clientKey`, otherwise every client shares the proxy's bucket.
5. [info] The limiter is per process: with N API instances the effective limit is 10 x N per minute per client. The `mutant-cap-raise` manifest line has no file:line.

Full-suite trigger: none outstanding for the unit (the three affected packages ran in full above). For the 6c integration check keep the engine full suite and the two anonymous api files.

Metrics: start=2026-10-18T02:21+05:30 end=2026-10-18T04:15+05:30 wall_min=113 agent_min=unavailable blocked_min=42 suite_runs=4 repeat_runs=0 mutations=33 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal tier=L check_s=unavailable mutants=33 final_survivors=2 defects_unit=0 defects_6c=0
