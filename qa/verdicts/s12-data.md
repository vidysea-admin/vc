# S12 final supporting data review

Verdict: **FAIL** (completed scoped review; Q22 shortlist acceptance mismatch). Additional driver/live and full voice proof remains **UNVERIFIED**. This is not a whole-feature verdict or release authorization.

Feature/lineage: T-057, original cycle2, bounded D-120/S12 recovery; proportional-verification/2026-10-19.17. Earlier STALLED outcomes, counterexamples, receipts and counters remain intact. Reviewer: s12-data, fresh independent supporting reviewer. No product edits, helpers, production/paid calls, commits or pushes. Read the data-engineer skill; performed this already-independent review directly under the explicit handoff, without model override or recursive delegation. Did not read blind A/B or other supporting verdicts.

## Finding

**DATA-S12-1 — medium — native shortlist is capped below the contracted 50-row read at 20.** Q22 requires deterministic `LIMIT 51`/truncated behavior. `mcp/pathlynks/src/port.ts:305-311` instead selects `LIMIT 21`, and `createVidyseaPort.getShortlistedProgrammes` calls `read(shortlist, id, 20)`. Thus a student with 21–50 qualifying picks receives only 20, marked truncated; this is bounded and does not itself disclose another student's data, but it does not implement the stated read contract. The existing test explicitly locks in `LIMIT 21` and 20 returned rows (`mcp/pathlynks/tests/port.test.ts:338,344-348`). It passed in this independent execution. The binding S12 plan corrections at `qa/verdicts/quest-successor-plan.md:318-320` require bounded deterministic native reads and do not authorize a replacement 20-item shortlist limit. The memory limit of 20 facts governs a different input. Resolve the implementation/acceptance mismatch within authorized ownership before claiming Q22 PASS; this reviewer made no change.

## Source and downstream conclusions

- **Native ownership/schema: source-supported, offline-tested.** `port.ts:292-317` roots reads at `u.id=$1`, joins `users.id=students.id`, and `student_shortlisted_courses.student_id=students.id`; requires active/nondisabled user, nondeleted student and shortlist rows, and deterministic shortlist createdAt/id order. Isolated native `app/models/student.py:24` confirms the actual FK despite the misleading user_id docstring. No host shortlist GET/self-healing call is made by this native adapter. Only fixed SELECTs and fixed session SETs are reachable, with parameter binding, privilege probes, query/connect deadlines and connection cleanup. Vidysea explicitly passes false for the Pathlynks-only privileged-role override.
- **Truthful projections/minimal egress: source-supported.** Native programme/university snapshot labels and profile classifications remain separate from Pathlynks careers/psychometrics; comparison is unsupported. `packages/engine/src/student/graph.ts:252-254,900-921` narrows native fields again and selects the native port; it does not relabel shortlist rows as careers. `apps/api/src/index.ts:845-876` constructs per-site native runtimes and labels trusted live facts. Personal source reads take verified server context, not incoming identity selectors. This is a scoped caller trace, not a complete auth/tenancy signoff.
- **Credential/site/destination boundary: source-supported, focused tests passed.** `packages/schemas/src/sources.ts:94-117` selects only the exact enabled authenticated tenant and matches source id/kind/site/platform/destination/ref before env lookup. `apps/api/src/admin-routes.ts:1024-1046` repeats native source binding before secret resolution and separates cache identity. `packages/db/src/admin-store.ts:328-375` refuses encrypted-secret retarget and CASes config/secret provisioning races. `mcp/pathlynks/src/connect.ts:39-59` rejects wrong platform/site/source/destination/ref/CA ref and retains rejectUnauthorized=true. No claim that an arbitrary local certificate is the official production CA; that operational proof is absent.
- **VC Mongo boundary: verified offline scanner plus source.** `packages/db/src/client.ts:getVcDb/connectFromEnv` fixes the database to virtual_counsellor; other database names are refused. Existing db-scope tests passed. No production Mongo/RDS or Vanced_new read was performed.
- **Active/pending preferences and forget barrier: focused downstream regression passed.** `profile-facts.ts:114-192` preserves active confirmed facts while publishing a bounded candidate with exact-writer compensation; `:234-317` binds replacement decisions and preserves pending uncertainty on ambiguous writes. `:307-339` uses a separate monotonic historyAfter cutoff and opaque revision, refusing unknown legacy history. Cleanup changes revision/counters rather than the cutoff. The retained successful-stale-cleanup regression, overlapping decision/candidate tests, correction/forget/provenance cases and actual HTTP decision tests all passed in this execution. Text `chat.ts:1203-1211` and voice `voice.ts:1208` consume the same loadStudentMemoryContext barrier. No claim of exhaustive cross-process race exploration.
- **Publication/replay: focused downstream regression passed.** `chat.ts:1044-1062` places usage/flags/gaps before final publication, rechecks current state after awaits and after completion, and requires a new intentional turn after stale published output. `chat-threads.ts:345-422` stages a lease-bound pending assistant, CASes the student memory marker as the stated publication linearization boundary, then publishes the exchange; exact-attempt cleanup protects other writers. This does not acknowledge network delivery. The completion/usage correct/erase/disable HTTP tests and pending-history tests passed. These prove the selected offline counterexamples, not all Mongo failure schedules.
- **Voice freshness: caller trace only in this review.** `voice.ts:853-882` rereads policy/revision and closes stale provider state; `:1202-1209` rechecks context around loading. No independent voice provider capture/finalized-speech confirmation test was run here. Root integration evidence explicitly reports the real audio question truncated and final speech decision unproved; audio transport is not confirmation correctness.

## Independent checks and exact output

1. Rehashed all entries in `qa/evidence/completion-local-inputs.json`: **292 inputs, 0 mismatches**. FrozenAt 2026-10-27T16:30:27.472Z; base 184b6a583eaf0ec11a8bf5b2295e84e90f8be15f. This was a disk hash verification, not inference from cached reads.
2. `node --import tsx --test --test-name-pattern=S12 mcp/pathlynks/tests/port.test.ts packages/db/tests/student-store.test.ts packages/db/tests/chat-threads.test.ts apps/api/tests/chat-rank.test.ts apps/api/tests/chat-profile.test.ts` — exit0; tests23, pass23, fail0, cancelled0, skipped0; duration4935.9693ms. Includes current HTTP tenant adapter selection, owned-thread decisions, canonical preferences, retained cutoff counterexample and completion/usage release races. The injected boot fixture logged partner_tenant_guard_off because its pepper is unset; that fixture is not evidence of production partner-key tenancy enforcement.
3. `node --import tsx --test --test-name-pattern=S12 packages/db/tests/admin-store.test.ts apps/api/tests/admin-routes.test.ts packages/schemas/tests/sources.test.ts` — exit0; tests6, pass6, fail0, skipped0; duration5308.8584ms. Includes destination/secret race, viewer refusal, exact env binding and unknown/ambiguous/disabled tenant selection.
4. `node --import tsx --test packages/db/tests/db-scope.test.ts` — exit0; tests11, pass11, fail0, skipped0; duration582.881ms. Database-scope and fence-aware source scanner checks.

Total 40 selected tests passed; these counts do not close the contract mismatch or missing proof. No full-suite churn, test/source modification or mutation-based falsification was performed. Prior red-before-green artifacts were described by the root evidence, not independently replayed against historical source here.

## Unresolved boundaries

**Actual PostgreSQL execution is absent.** `mcp/pathlynks/tests/fakes.ts:30-54` records SQL and returns supplied rows; its later fixture oracle explicitly is not a PostgreSQL interpreter. SQL shape checks plus fake port/admin/HTTP consumers establish plumbing and bounded DTO handling, not driver parsing, real joins, database row predicates, role behavior or official-CA TLS. This review issued no production call and no real-driver fixture run. Q7/Q22 driver-level and Q6 authorized real-account proof remain unresolved; do not present another student's data or fabricated consent to fill them. Missing production inputs do not themselves prevent useful local implementation under Q25.

Full voice confirmation/provider quality and complete dual/specialist/browser/build conjunctions are outside this supporting check. The root integration record also retains frontend build/typecheck limitations. No whole-feature PASS, live validation, push or deployment conclusion follows from this report.

## Exact input identities

Input map SHA256: 3ef47eebf4067d5bb5efe3ff3b78b338912ec6e2e7575f0d1784f51930bc2584.
Manifest SHA256: cfdbcbd1ad21c2ef49aa59ae1be2e75536043085d7e8e32bc3f3c4c3d394b9f9.
Root integration evidence SHA256 at read: b0cb7502d3ca93309cba546906785a10285f492e9bb43bf0e5dd79fed685b6b2.

Paths below are relative to D:/vc/.worktrees/vc-completion; SHA256s match the verified input map:

```text
mcp/pathlynks/src/port.ts 11ec9e67572b9f65dd11341675d7952c078ee277bd6a894aac71ffbde8f0b4a8
mcp/pathlynks/src/connect.ts 031cbfec3b22421d7c150848e2deb2307cc553e3a30dea5f236ab0942c136adf
apps/api/src/admin-routes.ts 3fcd64084febb20335e0297914f377cd60005c0dab290e54a862d256001a5c4c
apps/api/src/index.ts b5fb0282b1bd79bbebc74b3115d9672a8092258448c9ffdd66d3584db904c1d3
apps/api/src/chat.ts 8dd4f0ec39dd693b37fd7ee3817d09d23477709f4ab49b9fa1fb725b9d5428e8
apps/api/src/voice.ts b58850bc599a9a0ce2d119757a4404ca1a3efff93687802aa91d2a71408a7cca
packages/db/src/admin-store.ts fee9b7c17db3b62223a1b874dcfc7782c6aeb65842ebeec5c0632f1897d504c5
packages/db/src/chat-threads.ts 98dfc0a78e970edc4c5bd437bc8aae9b1dc6b76aa4b8e6da2077e5397868b49c
packages/db/src/profile-facts.ts 4748650c13828fa63a92057ce82d5f9348fd11678756f4c47c65bd6e5c8d01ee
packages/db/src/client.ts be51224ce1e204ed014a7f225f2431da3860ffd9794b5a6353b5010f68f9d90a
packages/schemas/src/sources.ts 27b43176d63219d5650c03b22aee7454c408075ba7b63329644a4f8715bc07ce
```

Other inspected/tested frozen identities are recoverable exactly from the map whose 292 hashes were checked above. Native SQLAlchemy model reading supplied schema corroboration only, with no runtime/production assertion.
