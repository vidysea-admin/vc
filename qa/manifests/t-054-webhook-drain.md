# T-054 — status-scoped signed webhook delivery drain

Status: checked-PASS
Phase: checked-PASS
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-10.9
Protocol hashes: maker=556316E31B51BBB512AD0EEF6FA713895A387512F79E32EC71C37FE7B0BE7DD4 checker=3DE10756092428C100D255677DF06192E6ABEF94CBE61579745DC28B830601FA
Bound root: D:/vc
Base: 018ec276ad31f2947a2049504b14051bc2fb2d6d plus existing unrelated frozen T052 candidate; preserve all peer edits.
Work source: B21 signed event delivery and existing open ISS-t-034-de-1. Umesh requests remaining full-goal implementation and current work verification. This is independent delivery-worker behavior, not a substitute for counselling features or T052 repair.
Tier: M operational data-reader behavior; independently approved by t054_plan_quality. Existing tenantScopedDb/constructor/auth/index code unchanged; checker derives its own floor. No new authentication capability or tenant-selector authority.
Plan approval: t054_plan_quality explicitly PLAN APPROVED the amended current manifest on 2026-10-13. This is implementation approval only, not product PASS.
mutant-cap-raise: packages/engine/src/webhooks/delivery.ts:174 four distinct C1-C4 changed-criterion falsifiers require one isolated semantic mutation each; policy .9-4 permits this cited raise.

## Initial exact source/test identity

outbox.ts A60733572C19C9AEEF276D4F6511BF536CAF28C8F6EFBFB6B05A6CE82557C11D; delivery.ts 5861CFDCD94017D0F8BA8C1F3CD724E359FAE5513AE3978BD0C7854B12912B7E; webhooks-outbox.test.ts 62797D7DBFA6EAB56F1427E6901F65A281E59970152669C66FED3B1130823867; webhooks-outbox-mongo.test.ts FCD5EEFDC4E6D2397C06ADA16D2D4204AC4CE3E355EAA5118FBBCC4546663ACD; webhooks-delivery-drain.test.ts 05DA77FB5F1164D88C94F9E35E1CC378F69CEAF6E85799851844C3D96C665BF6. All five initially clean against HEAD; unrelated T052 dirty files are preserved.
Audience: existing internal signed-webhook worker; no new user type or external UI.
Gates: D021/B21 client backend JWT direction answered; no provider/production/external sending invoked. T049 file-restoration/T050 expiry/T038 target/T052 repair-model gates do not affect these separate existing functions.

## Exact plan — independent approval required before source edits

Existing packages/engine/src/webhooks/outbox.ts WebhookOutbox.list:36, InMemoryWebhookOutbox.list:74, MongoWebhookOutbox.list:172: accept optional statuses?:readonly OutboxRecordStatus[]. No argument retains current all-record semantics; explicit empty list returns no records. InMemory applies only explicit status selector in its existing method. Mongo pushes {status:{$in:[...statuses]}} into the existing tenant-scoped collection.find before toArray; no new helper, index, retention, pagination, collection or API route.

Existing packages/engine/src/webhooks/delivery.ts drainWebhookOutbox:163: request pending only, or pending/failed only for existing includeFailed=true, with one list(wantedStatuses) call. Retain a defensive wanted-status guard in the existing delivery loop because structurally compatible legacy injected list() implementations can ignore the optional selector. Built-in Mongo filters before cursor materialization; no second historical read is performed. Do not claim a no-history-read guarantee for an arbitrary selector-ignoring external adapter. Preserve delivered/dead exclusion, event/signature/idempotency/retry/backoff options and record destinations.

Only existing test files are edited: packages/engine/tests/webhooks-outbox.test.ts, webhooks-outbox-mongo.test.ts, webhooks-delivery-drain.test.ts. Existing fake DB and tenant wrapper reused; no new named test helper or imported runtime fixture changes.

## Acceptance and immediate downstream

C1: Both implementations preserve no-argument listing and exact public record/event bytes; explicit pending/failed/empty/all selectors give exact status sets, without changing rows.
C2: Actual built-in Mongo find receives status predicate before toArray and retains exact tenant-scoping; terminal payloads and other-tenant payloads never materialize for its drain. Use actual raw fake-driver selector capture plus poison terminal payload or strict cursor returned-row oracle, not only final recipient call count. A selector-ignoring legacy adapter separately proves defensive refusal to deliver terminal/failed rows outside wanted statuses; no false read-efficiency guarantee is attached to that adapter.
C3: Existing drain selects pending by default and pending/failed only when requested; delivered/dead are untouched. Empty backlog performs no network call. Immediate fake receiver sees correct signed event/idempotency headers and persisted delivery bookkeeping; existing retry/failure controls remain.
C4: Filtered and unfiltered adapters agree for mixed status records and tenant separation. No retention/deletion/lifetime-attempt policy or source event normalization is introduced.

Named independent falsification mapping: C1 selector-parity oracle kills removal of InMemory status filtering (explicit pending/empty/all plus no-argument positive); C2 raw-driver materialization oracle kills omitted Mongo status predicate while tenant wrapper remains; C3 receiver/status oracle kills includeFailed selection reversal; C4 legacy-adapter safety oracle kills removal of defensive wanted-status guard on a mixed-status argument-ignoring adapter. Tenant separation, unchanged record/event bytes and no-argument API consumers are retained positive/invariant controls. Each falsifier records baseline GREEN, intended assertion RED and restored GREEN in isolated QA copies only. No full suite per mutant. Preserve original failing evidence.

## Ownership and verification

Builder source owner: outbox.ts and delivery.ts only. Builder test owner: three existing tests only. They are not alone; do not revert unrelated T052/current QA edits. They coordinate signature, test controls and the single local process lane. Test owner runs meaningful focused RED before source owner implements; affected GREEN follows. Root owns QA/decision/TASKS bookkeeping.

Builder affected commands: existing vc-testlock with installed node/tsx --test the three edited test paths plus existing webhooks-delivery.test.ts; also run affected existing apps/api/tests/server.test.ts webhook/outbox-emission cases with an exact independently inspected test-name selector, and engine/API tsc --noEmit configs. This covers list interface consumers and delivery behavior, not just type compatibility. Do not edit API tests or other existing files for this scope. No builder full workspace suite/install/provider/DB connection or browser flow. Runtime RAM/liveness must be freshly verified; no foreign PID kill or lock bypass.

Completed feature boundary: fresh senior-software-engineer plus data-engineer scoped source review; final checker derives independent tests/falsifiers and acceptance from B21 and exact scope. Reuse impact-matching evidence only under policy. Entire release push remains blocked by current T052 FAIL even if this independent worker unit passes. No release completion, real external delivery, Ubuntu deployment or closure of ISS-t-034-de-1 retention half inferred.

## Actual builder handback — 2026-10-13

Test owner reached meaningful RED on unchanged two source hashes:23 tests20pass3intended assertion failures (memory selector, actual raw cursor returned row count before tenant conversion, missing drain selector). Complete red.log/red-exit.txt/red-source-hashes.json in qa/evidence/t054-maker.

After approved two-source implementation, four affected engine test files37/37, no skips/cancellations; exact five API webhook/outbox importer cases5/5, no skips/cancellations; engine/API tsc configs both terminal0. Exact commands, environment, complete logs and exit files are in qa/evidence/t054-maker/environment-results.json. No whole workspace suite. Node24.13.1,tsx4.23.15,TS5.8.3. Current normal mutex RAM readings3.39/3.15/3.1/3.6GB; all owned process handles terminal, fake receivers finally closed and mutex absent at16:41:01Z.

Final rawSHA256: outbox.ts9D326EE2FEB9F35DFD3D64A9179ABB6BA64AA4DC4337AA4E7B66F73841E77EE8; delivery.ts77AFEBC6CCABC5F47EF0985C18A98D99F1899989AFA1587ECCEA7775C5CD8529; outbox.test.ts281820DF55538DBF364B234388F14B033E54E56E394B43F259F126142F80F480; mongo.test.ts28D5728F61ED3D7640A8C699D4342BEC9640455D55C3C3ED8F0671C5BC1D9103; drain.test.tsE949D5DD9B793C2E242CDA57B4C04286C489090353BDACB169A1395206E510D9. Full importer/config/lockfile/mutex identities retained in final-hashes.json. This is builder evidence, not independent PASS; dirty state and runs under30s prevent pre-check reuse under .9-5.

Pre-check[C1]: 018ec276 node --import tsx --test --test-concurrency=1 --test-timeout=30000 packages/engine/tests/webhooks-outbox.test.ts packages/engine/tests/webhooks-outbox-mongo.test.ts packages/engine/tests/webhooks-delivery-drain.test.ts packages/engine/tests/webhooks-delivery.test.ts -> terminal0,37/37, explicit selector/no-argument exact record positives reached.
Pre-check[C2]: 018ec276 node --import tsx --test --test-concurrency=1 --test-timeout=30000 packages/engine/tests/webhooks-outbox.test.ts packages/engine/tests/webhooks-outbox-mongo.test.ts packages/engine/tests/webhooks-delivery-drain.test.ts packages/engine/tests/webhooks-delivery.test.ts -> terminal0,37/37, actual raw Mongo query/cursor before tenant conversion and untouched raw rows reached.
Pre-check[C3]: 018ec276 node --import tsx --test --test-concurrency=1 --test-timeout=30000 packages/engine/tests/webhooks-outbox.test.ts packages/engine/tests/webhooks-outbox-mongo.test.ts packages/engine/tests/webhooks-delivery-drain.test.ts packages/engine/tests/webhooks-delivery.test.ts -> terminal0,37/37, fake receiver signing/idempotency/default/failed/retry/readback reached; API node --import tsx --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern=(webhook|outbox) apps/api/tests/server.test.ts -> terminal0,5/5.
Pre-check[C4]: 018ec276 node --import tsx --test --test-concurrency=1 --test-timeout=30000 packages/engine/tests/webhooks-outbox.test.ts packages/engine/tests/webhooks-outbox-mongo.test.ts packages/engine/tests/webhooks-delivery-drain.test.ts packages/engine/tests/webhooks-delivery.test.ts -> terminal0,37/37, mixed-status selector-ignoring legacy adapter plus filtered/unfiltered parity and tenant separation reached.

All four tagged lines refer to the SAME one affected engine run (not four repeats), under scripts/vc-testlock.sh on HEAD018ec276 plus the exact frozen five-file dirty candidate above. No clean committed candidate or reuse eligibility claimed. Engine runner duration1.9490792s, API runner3.52586s; command wall unavailable. blobs=webhooks-outbox.test.ts@a22eda24b5e8e7fe84ec5ca04cd7ef99165e6993,webhooks-outbox-mongo.test.ts@73d7a6bec69b0f6ea2e9cc025925656af13413fe,webhooks-delivery-drain.test.ts@10ec0c9acb86acb60e47191dd516d9c82c877d26,webhooks-delivery.test.ts@609b0c34b2e592c982a04692793eac248a361cd1.

Completed-feature fresh source review: t054_senior_review VERDICT: Approve; t054_data_review VERDICT: Approve, Failure Modes Observed: None found in the authorized T054 change at greater than80percent confidence. Both source reviews inspected matching frozen hashes; neither executed acceptance tests or certified release. Independent coordinator derives and runs its own checks.

## Independent completion — 2026-10-13

Fresh t054_independent_checker VERDICT: PASS, cycle0, source/test frozen5hashes unchanged. Saved qa/verdicts/t-054-webhook-drain.md SHA2565421747AAAE20CA4349A51282821B53B7331A4CAEFB790A221D347CA31CB4B1A; checkpoint SHA2560C9FE55722F67C2148F673F8BB73B2487DBDDBF7AF60E5CE4CFF47CF4D0D97A4. Own4/4 criteria,4distinct baselineGREEN/intendedAssertionRED/restoredGREEN falsifiers; own37/37engine and5/5APIimporter, engine/APItypes0. M scope has no fullsuite or browser requirement. Actual local loopback fake receiver signing/readback is not live externalclient delivery.

Protected isolatedQA restorationfinally and signal-aware interruption plus bounded owned-process cleanupfinally verified; two acceptance-only protection reruns retained first-pass evidence. Honest12 mutation executions/4distinct and repeat_runs2. Final ownedprocesses absent/mutexabsent16:53:55Z, RAM4.914GB. Checker wall11.57min withinM20. Nativehelper unsupported lane-check produced uncredited ticktext; checkerremoved invalid invocation from ownrun.ps1, rootremovedonlythat exactown tickline. No forgedlane/6cstamp or source change.

Only T054 scoped query/delivery-selection behavior is accepted. ISS-t-034-de-1 retains open retention/lifetime policy. Existing T052 dualFAIL and allfullgoal human/external dependencies remain; local persistence is not push/deployment or full product completion.
