# Verdict — p1-u6b-profile-ranking (Mode A, tier M, one checker)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-17.14

CHECK-PLAN: Mode A, Tier M. (1) diff and scope read (base e2b805d to 8473a0f); (2) reread rank.ts and rank-weights.ts against C1..C8; (3) rerun the maker's three engine test files and the engine typecheck through the shared test lock; (4) hostile probes in a throwaway copy (ties, NaN/negative/string/null numbers, bad weights, fact-source mixes, all-insufficient, empty list, 1,000 options, wording); (5) 20 single-edit mutants in a throwaway copy, at least one per criterion.

VERDICT: PASS (with findings; none blocks this unit)
SCOREBOARD: C1..C8 8/8 pass; reruns 98/98 (rank + capability-manifest + student-graph) and engine typecheck exit 0; own hostile probes 8/8 green (H1..H8); mutants 19 killed, 1 survivor that is an equivalent mutant (C8 non-finite check, see NOTES), 0 real survivors.
TIER: M (single check).
CHECKED-STATE: worktree p1-u6b, HEAD 8473a0f, code 8f6a1a8, base e2b805d. Diff scope matches the brief: packages/engine/src/student/rank.ts, rank-weights.ts, one export line in packages/engine/src/index.ts, tests/rank.test.ts, tests/fixtures/ranking-profiles.json, qa/. Nothing in apps/api, packages/db, packages/schemas, graph.ts, claims.ts, classify.ts, skills/. Bound tree untouched; all probes and mutants ran in copies under the scratchpad.

COMMANDS RUN (actual counts):
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine exec tsx --test tests/rank.test.ts tests/capability-manifest.test.ts tests/student-graph.test.ts` -> tests 98, pass 98, fail 0, EXIT 0 (waited behind another checker's lock holder, normal).
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine typecheck` (tsc for src, evals, scripts) -> EXIT 0. I ran the engine package only, not `-r`; the diff touches only engine, and the maker's `-r` run is in its evidence.
- Hostile probes (copy, not through the lock: single-file tsx, no suite): `tsx --test tests/hostile.test.ts` -> 8 pass, 0 fail.
- Mutants: `node mutate.mjs` (20 mutants, each run against rank.test.ts + hostile.test.ts) -> see qa/evidence/p1-u6b-check/mutants.txt.

CRITERIA:
- C1 different deterministic orders: PASS. Mutant "fit constant (every fact matches)" -> 6 red, first named test C1 A16 "a Germany/engineering student and a Canada/business student asking about the same four options get different orders" (suite) and H4. H1: 20 random shuffles of the option list give one byte-identical JSON; equal-score options come out in id order.
- C2 citations and facts: PASS. Mutant "sourceIds emptied" -> 3 red (C2 A16 "every ranked option names its KB source ids..."); mutant "factsUsed emptied" -> 7 red. Claims and sources parse with ClaimSchema / SourceSchema (H2).
- C3 default weights: PASS. Mutant cost 0.25 -> 0.3 -> 5 red (C3 P-8 "no weights ... 0.40 / 0.25 / 0.20 / 0.15"); mutant default name changed -> 4 red.
- C4 changed weights: PASS. Mutant "name always default" -> 2 red (C4 D-086 Q3 scholarship 0.8 test, H8); mutant "weights ignored" -> 10 red. H8: custom name matches /^custom-[0-9a-f]{8}$/, same numbers give the same name, 15 chars; 0.41/0.24/0.20/0.15 cannot be labelled student-success.
- C5 no student, no ranking: PASS. Mutant "sign-in check removed" -> 3 red (C5 B24.8, H5). H5: undefined, "", "   ", null, 0, {}, "\n\t" all give `sign_in_required` with a port that throws if touched.
- C6 fact sources: PASS. Mutants "proposed accepted", "any source accepted", "pathlynks beats student" -> 2 red each (C6 A16b named tests, H4). H4: pathlynks-only, student-confirmed-only, and both conflicting in either input order give the student-confirmed value and a single entry with the exact label; sources `chat-extracted`, and statuses proposed/rejected/erased are all ignored and counted (ignoredFactCount 4); `__proto__`, `constructor`, `hasOwnProperty` as fact keys do not break anything.
- C7 numbers only from the port: PASS. Mutants "NaN accepted", "out of range accepted", "unsourced accepted", "insufficient scored as ranked" -> 2, 2, 1, 9 red (first named: C7 B24.8 "a number with no cited source, outside 0..1 or not finite is treated as missing, never clamped or guessed"). H2: NaN, -0.1, Infinity, "0.9" (string), 1.0001, null, undefined and an unknown option are all `insufficient_data`, score null, rank null, listed after every ranked option; 0, 1 and -0 are accepted as valid numbers.
- C8 weight validation: PASS. Mutants "negative accepted", "unknown key accepted", "zero vector accepted", "no normalise" -> 3, 2, 2, 3 red. H3: 18 bad configs refused (negative, -1e-12, NaN, Infinity, 4 x 1e308 overflow, all zero, missing key, extra key, own `__proto__` key, null, array, string, number, boolean, string value, null value); {4, 2.5, 2, 1.5} is scaled, `weightsNormalised: true`, name stays student-success.

HOSTILE EXTRAS the brief asked for:
- All options insufficient: ranked status with every option `insufficient_data`, no facts reported, ids in order; ok.
- Empty list, or only blank/non-string ids: refused (`no_options`).
- 1,000 options: refused at once (`too_many_options`, cap 25 chosen by the maker); 1,000 ids with 10 distinct collapse and rank in 1 ms. With the cap raised to 100,000 in a copy: 1,000 options rank in 22 ms and 10,000 in 175 ms, so the cap is a policy, not a performance guard.
- Wording: the claim texts are "#1 Munich: overall 0.70 (fit ..., cost ..., scholarship chance ..., visa ease ...)" and "b: not ranked, missing data for cost". No "you should", "recommend" or "choose" anywhere in the output (H7 regexp). Numbers and evidence only; the human decides.

FAILURES: none.

FINDINGS (non-blocking):
PROPOSED-ISSUE: {"severity":"medium","title":"integration mismatch waiting in the CORE-REQUEST: the db stores a confirmed chat fact as source 'chat', status 'confirmed' (packages/db/src/profile-facts.ts:29,83), but rankOptions only accepts source 'pathlynks' or 'student-confirmed'. If the api hook passes listProfileFacts rows through unmapped, every confirmed chat fact is silently ignored (counted in ignoredFactCount) and fit goes missing. Fail-closed, so not a leak, but the hook builder must map {source 'chat', status 'confirmed'} to 'student-confirmed' and have a test for it.","where":"future apps/api/src/chat.ts rank_options hook","repro":"hostile H4: a fact with source 'chat-extracted' is ignored by design; the db label is 'chat'","unit":"p1-u6b-profile-ranking"}
PROPOSED-ISSUE: {"severity":"low","title":"output carries no 'NOT PROVEN' or synthetic marker: ranked claims are kind 'number', status 'attributed', and sources are whatever the port supplies (the fixture uses kind 'internal-seminar'/'toc' for invented nodes). Until a real adapter exists, anything that wires this into a response can present invented numbers as attributed KB figures. The unit itself only produces fixtures in tests, so nothing is exposed today; the wiring unit should carry the NOT PROVEN label (D-097 item 3) into the response or keep the path behind a flag.","where":"packages/engine/src/student/rank.ts claims construction","repro":"hostile H7: output mentions NOT PROVEN/synthetic: false","unit":"p1-u6b-profile-ranking"}
PROPOSED-ISSUE: {"severity":"low","title":"two usable facts with the same key and the same source label but different values are resolved by input order (first wins), so the result is not order independent for that case. Not reachable through the db (fact id is a hash of student and key, so one row per key), only through a hand-built input.","where":"packages/engine/src/student/rank.ts usableFacts","repro":"hostile H4 prints 'same-source conflict order-dependent? true'","unit":"p1-u6b-profile-ranking"}
NOTE: the 25-option cap is the maker's own choice (no criterion asks for it); an overlong list is refused rather than truncated, which is the safe side.

NOTES:
- Surviving mutant "C8 non-finite accepted" (`typeof v !== "number" || !Number.isFinite(v)` reduced to the typeof test) is equivalent: NaN or Infinity then makes the sum non-finite and the next check (`!Number.isFinite(sum) || sum <= 0`) refuses the vector; only the detail text differs. Not a gap.
- The equal-score tiebreak by option id in the ranked group is also redundant given the id-sorted input and a stable sort; the final order is still by id, which the tests assert. Left as is.
- The real data source for per-option numbers stays NOT PROVEN (D-097 item 3); the maker's KB source check is accepted as stated, I did not repeat it.
- Hostile tests and mutants ran in a throwaway copy under the scratchpad (a copy of rank.ts, rank-weights.ts, the test and fixture, with the engine node_modules junctioned in); the worktree code was not edited.

EVIDENCE: qa/evidence/p1-u6b-check/ (hostile.test.ts, mutate.mjs, mutants.txt, perf.test.ts, rerun-3files.txt, rerun-typecheck.txt).

CHECKPOINT: 2026-10-19T00:35+05:30 verdict written, PASS, cycle 0; maker to flip manifest to checked-PASS.
Metrics: start=2026-10-19T00:27+05:30 end=2026-10-19T00:36+05:30 wall_min=9 lock_wait_min~3 mutants=20 killed=19 equivalent=1 real_survivors=0 hostile_probes=8 suite_reruns=1 typecheck_runs=1 cycle=0 policy=proportional-verification/2026-10-17.14
