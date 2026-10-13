# T054 independent completed-feature check

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-10.9
Native adapter: codexnative.3; checker protocol SHA256 3DE10756092428C100D255677DF06192E6ABEF94CBE61579745DC28B830601FA
VERDICT: PASS

CHECK-PLAN: C1 exact public list records/status sets and immutable reads; C2 actual tenantScopedDb wrapping an independently implemented raw fake driver, selector captured at find before cursor and row materialization; C3 wanted-status selection, signed byte-preserving fake recipient, persisted readback, retry/rejection/empty controls; C4 filtered/legacy differential delivery and two-tenant unchanged rows. One semantic falsifier for each C1-C4. Affected four engine tests, public-signature API importers, engine/API types. Budget M20min; API-only internal worker audience, no changed UI.
Risk floor: M. Two product functions change schema reading and worker selection; constructor, tenant authority/wrapper, auth, persistence writes, index and scheduling are unchanged. No new L/security/prod-write trigger. One independent coordinator.
SERIAL: local acceptance, tests and type checks share scripts/vc-testlock.sh; no helper campaign or simultaneous runtimes.
Lane: normal. No owner-enabled quick lane; M with four criteria is ineligible.

SCOREBOARD: C1-C4 4/4; required falsification 4/4; affected engine 37/37; API importer 5/5; both scoped type checks exit0; invariants evidenced. No skips/cancellations/failures.
CHECKED-STATE: HEAD/base 018ec276ad31f2947a2049504b14051bc2fb2d6d plus exact frozen five-file dirty T054 candidate. Existing unrelated dirty T052 is excluded. identities: qa/evidence/t054-checker/identity-hashes.json; checkpoint below. No builder-output reuse (dirty candidate and short runs).
FAILURES: none.
REMAINING: none for this scope.
LIVE-BROWSER: not-applicable; worker API has no changed UI. Engine tests use real loopback fake receivers; independent acceptance uses injected in-process HTTP response controls. Neither is deployed-client evidence.
ISSUES-WRITTEN: none; no ledger authority in this dispatch.

Independent acceptance command: bash scripts/vc-testlock.sh node --import tsx qa/evidence/t054-checker/acceptance.ts -> exit0; C1-C4 each GREEN baseline, intended AssertionError RED, exact source-byte restoration, GREEN restored copy. Batched one Node process per campaign; four separate mutant directories, no bound-source edits. Raw messages/stacks: qa/evidence/t054-checker/acceptance-report.json. First pass retained as acceptance-report.first-pass.json. Two acceptance-only reruns followed checker-harness protection fixes (finally restoration, then signal-aware interrupt handling); each again4/4 GREEN-RED-GREEN. No affected test/type repetition.
Falsify[C1]: delete changed memory selector filter -> RED C1 exact selected public records (explicit empty selector returned four rows).
Falsify[C2]: replace changed Mongo status predicate with {} -> RED C2 raw driver predicate precedes cursor creation (tenant retained, status missing).
Falsify[C3]: reverse changed includeFailed status constants -> RED C3 single selected list call (failed unexpectedly selected by default).
Falsify[C4]: delete changed delivery wanted-status guard -> RED C4 legacy adapter cannot deliver unselected records (failed/delivered/dead sent).
mutant-cap-raise: packages/engine/src/webhooks/delivery.ts:174 four distinct changed criterion falsifiers, permitted by policy .9-4 and pinned manifest.
Copy setup: only @vc/db import in isolated outbox copies resolves directly to actual unchanged packages/db/src/tenant.ts; type-only imports erased. No substituted tenancy behavior. Restored bytes compare exactly to this common setup. Bound source hashes rechecked unchanged.

Affected engine command: bash scripts/vc-testlock.sh node --import tsx --test --test-concurrency=1 --test-timeout=30000 packages/engine/tests/webhooks-outbox.test.ts packages/engine/tests/webhooks-outbox-mongo.test.ts packages/engine/tests/webhooks-delivery-drain.test.ts packages/engine/tests/webhooks-delivery.test.ts -> exit0,37/37.
Immediate importer command: bash scripts/vc-testlock.sh node --import tsx --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern='(webhook|outbox)' apps/api/tests/server.test.ts -> exit0,5/5 actual named cases.
Types: bash scripts/vc-testlock.sh node node_modules/typescript/bin/tsc --noEmit -p packages/engine/tsconfig.json; same with apps/api/tsconfig.json -> both exit0.
Project validator: python contracts/verify_contracts.py -> exit0, no frozen contracts/PASS by vacuity. This contributes no webhook acceptance evidence.
Commands, timings, exits and owned handles: qa/evidence/t054-checker/commands.json and owned-handles.jsonl. Complete stdout/stderr retained per command.

Invariants: no-argument/all/empty/duplicate status listing, stored event JSON including Unicode/provenance bytes, terminal and unselected rows unchanged, actual tenant query preserved before materialization, foreign tenant bytes unchanged, signing HMAC/idempotency/destination/retry/readback and empty no-send preserved. No deletion/retention/lifetime policy introduced. B8/B12/B13 fake-only boundaries and B14 actual downstream effects reached; B21 signed event/tenant behavior checked within this worker scope.
Issue reproduction: ISS-t-034-de-1 historical command pnpm -C packages/engine test tests/webhooks-delivery-drain.test.ts is an inert narrowing shape that expands the complete package suite. Not rerun under .7; actual named four-file 37-test command above replaces it for this scoped query defect. Retention half remains open; no whole issue closure inferred.
Scope limit: no full suite at M; no production/provider/external network, live-client/Ubuntu/deployment, T052 repair/release, push/merge/commit or whole-goal completion certified.
Runtime: Windows11, Node24.13.1, TSX4.23.15, TypeScript5.8.3. Fresh elevated CIM free RAM4.534GB before,4.719GB after original campaign,4.914GB final; normal mutex readings4.37/4.59/4.53/4.49/4.66GB plus acceptance protection reruns4.82/5.07GB. No foreign PID kill, install or lock bypass. Terminal exec session32269; all original recorded handles plus rerun Nodes14360/33976 and runnerPS32804/47308 absent at16:53:55Z; mutex absent. final-cleanup-proof.json records actual liveness. Isolated semantic restoration now executes in finally on errors; SIGINT/SIGTERM suppress default abrupt exit until that boundary. run.ps1 bounds owned process waits180s and finally cleans only its own started process tree plus isolated red copies after forced termination. Syntax parse PASS; final-harness-hashes.json records protected harness identity.
Process note: attempted native helper --lane-check lacked implementation, fell through to a tick-text append in qa/.last-tick. Its exit0 is uncredited; normal lane is derived from actual adapter/feature scope. Root owns removal of that exact accidental line. Original logs retained; unsupported lane invocation removed from QA run.ps1 for reproducibility. No product check skipped or repeated due to this metadata repair.

Per-step command wall: lane uncredited0.340s; acceptance2.444s; engine3.681s; API4.682s; engine types4.399s; API types3.813s. Remaining active time is own protocol/diff/contract reads, independent instrument construction, QA protection repair and evidence persistence. Native M25 hard ceiling, explicitly sliced M20; both respected.
Metrics: start=2026-10-13T16:43:39Z end=2026-10-13T16:55:13Z wall_min=11.57 agent_min=11.57 blocked_min=0 suite_runs=0 repeat_runs=2 mutations=12 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-10.9 lane=normal check_s=694 mutants=4 defects_unit=0 defects_6c=0 slow=independent-instrument-setup-and-guarded-restoration-repair,7.85min
Mutation accounting: four distinct changed-condition/constant mutants executed three times due harness protection repair;12 falsifying edit executions. No extra mutant beyond the cited four and no product repair cycle.

Checker attribution: /root/t054_independent_checker. Saved checkpoint qa/checkpoints/t-054-webhook-drain.md. Source reviews are advisory and contribute no executable acceptance proof.
