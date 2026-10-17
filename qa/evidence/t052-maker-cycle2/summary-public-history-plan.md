# T052 proposed summary public-history and erasure plan

Status: PROPOSED; source-only implementation plan, not acceptance, runtime PASS, or implementation authorization.

Owner: t052_lineage_projection_plan. Root explicitly authorized this new QA document. No new product source file, named helper, collection, migration execution, production/provider command, or publishing action is authorized by this document. D046 records the owner's legacy behavior; a complete independently approved plan and separate authorizing decision are required before product implementation. Preserve peer changes and disjoint file ownership.

## Existing edit locations and scope

- `packages/db/src/erasure.ts:1822` existing `StudentExport` interface: add the minimal optional public shape below.
- `packages/db/src/erasure.ts:1864` existing `exportStudent`: capture decisions once, validate and project ledger history inline in this existing function, and reuse the captured decisions for its ordinary-decision projection at current line 1894. No new named helper or source file.
- `packages/db/src/collections.ts:97` existing `SessionDoc` and line 163 existing `DecisionDoc`: the ledger-data owner integrates the reviewed private readiness/ledger schema. The projection owner does not independently invent or change it.
- `packages/db/src/erasure.ts:1423` existing `ERASURE_PLAN` decisions step already deletes and residue-checks by top-level `studentId`. Keep this step unchanged; no duplicate purge mechanism.
- Existing `packages/db/tests/erasure.test.ts:712` export controls and existing `apps/api/tests/server.test.ts` are the disjoint test owner's edit locations after approval. Actual writer/settlement controls also use the already authorized existing DB/engine test modules.

## Minimal additive public shape

```ts
summaryHistory?: Array<Pick<SessionDoc,
  "sessionId" | "summary" | "summaryApprovedAt" | "summaryWithheldReason"
>>;
```

Keep `vc-student-export/v1`, `purpose: "data_subject_access"`, and existing fields. Omit `summaryHistory` entirely when there are no emitted entries; do not add an empty array to unchanged legacy/absent exports. Each entry contains only `sessionId` and the public summary fields actually present on the retained payload. Preserve own-property presence, including empty strings, a withheld summary represented by `summary: ""`, and its actual withheld reason. An absent S0 baseline with `{}` payload emits no history entry. A baseline with any own public summary field emits the fields exactly as stored. Do not invent an approval timestamp or counsellor commitment.

Emit a baseline once per immutable node identity. Preserve distinct legitimate candidate revisions even if their summary and timestamp happen to be equal; never deduplicate by public payload value. Order entries deterministically by sessionId, then actual summaryApprovedAt with absent timestamps first, then private node identity as a tie-breaker. The tie-breaker identity is never emitted.

## Exact ledger kinds, identities, and structural validation

Use the ledger-data owner's complete schema, not a competing authority model:

- `session_summary_verification`: payload-free, `state: "verified"`, top-level studentId/sessionId, exact binding, snapshotDigest/evidenceRef, immutable creatorToken, and proof source restricted to `fresh_session_creation` or `verified_migration`. No provisional `known_committed_S0` source or inferred historical commitment.
- `session_summary_baseline`: `state: "verified"`, same scope/student/session/exact binding, immutable payload with optional own public summary fields, baselineMarkers, proofId, proofCreatorToken, and creatorToken identifying the invocation that actually inserted this root.
- `session_summary_write`: `state: "pending" | "committed" | "invalid"`, same scope/student/session/exact binding, `_id = "summary-write:" + writerToken`, UUID writerToken/restoreToken, immutable parentId/rootId, and candidate payload with required summary/summaryApprovedAt plus optional summaryWithheldReason. Invalid nodes retain lineage references but have no own payload.

Binding is the strict presence-aware object:

```ts
{
  lifecycleGeneration: { present: false } | { present: true, value: string },
  creationAttempt: { present: false } | { present: true, value: string }
}
```

Tenant scope comes from the existing `tenantIdOf(db)` and tenant-scoped wrapper, which stamps top-level tenantId and qualifies IDs. Exact binding validation preserves absence versus present strings and forbids malformed presence objects; no undefined/null/empty authority adoption.

Proof/root snapshotDigest binds scope and the presence-aware PRE-association nine-field payload/marker snapshot. For fresh creation, the three derived readiness fields are absent in this digest input; recompute the digest from that exact admitted snapshot and validate the computed association three separately against proof/root identity and the saved post-association baselineMarkers. For verified migration, preserve its explicitly verified exact baseline tuple including association absence. The root identity incorporates scopeSnapshotDigest plus immutable proof creatorToken: a recreated proof can reuse its deterministic lookup ID but has a new creatorToken and therefore a different root identity. Root proofId/proofCreatorToken must match the captured proof. Parent/root references must resolve within the same exact scope, studentId, sessionId, binding and root lineage. Reject missing/corrupt proof/parent/root, unsupported kind/state, cross-scope references, cycles, or mismatched identity. Export validation is unconditional over its captured ledger snapshot, even when no live original Session exists; the original-live-session qualifier belongs only to writer/cleanup behavior.

Payloads contain exactly the public summary fields. Every present field must be a string; a candidate requires summary and summaryApprovedAt. Unknown payload fields or malformed state are errors, not an excuse to silently hide stored personal content. An invalid node with an own payload property, even an undefined value, is an error. A verification proof containing personal payload is malformed. Private row metadata is structurally omitted from the public result.

Fresh admission additionally uses the atomically associated private Session readiness tuple `summaryBaselineId`, `summaryVerificationId`, `summaryProofCreatorToken`. Treat all three as internal authority. BaselineMarkers retain these three exact values and prior own-presence summaryWriterToken/summaryLineageId/summaryRestoreToken. Fresh proof/root IDs derive the pre-association verified-creation snapshotDigest and proof creatorToken; the baseline then captures resulting associations. Candidate materializationMarkers preserve these associations unchanged. Historical verified_migration baselines preserve absent associations; export never creates or repairs associations. Fresh standalone proof/root documents without the Session association are not write-admission-ready, but export still preserves valid retained root personal data when the captured proof/ancestry validates.

## Export behavior and errors

Read decisions once into a captured collection result, build a private identity map, validate the ledger and its references, then produce both ordinary decisions and summaryHistory from that snapshot. This does not make the whole existing multi-query student export transactional; concurrent changes between different collection reads remain an existing consistency limitation. Do not claim a cross-collection Mongo snapshot or final graph-publication proof.

The access-copy includes currently retained public personal payloads from valid verified baselines and pending/committed write nodes. Pending and even provisional committed payloads are stored personal data, so do not silently hide them. This array is a data-subject storage snapshot, never approval to feed profiling/models or a claim that the original graph invocation returned successfully. The graph's durable pending-to-committed update remains reversible if its original invocation fails before the final synchronous return. After original settlement and successful compensation, failed nodes have no payload and their failed text must be absent from raw storage and subsequent exports.

Invalid payload-free nodes and payload-free verification proofs emit no history entry after validation. Every exact summary ledger kind is excluded from ordinary decisions before the existing course/university or per_fact_reject projection. Preserve the existing `session_opening_capability` exclusion and all legitimate ordinary/reject decision content. Never spread a ledger row or its private metadata into a public container.

Malformed ledger/history throws the fixed, raw-free `Error("exportStudent: corrupt session summary history")`; do not include IDs, payload strings, grants, UUIDs, ancestry values, raw rows or a serialized cause in that public error. Database read rejection remains observable; never silently substitute empty history on read failure. Existing API source at `apps/api/src/server.ts:788-794` returns status 500 and JSON `{ "error": "internal" }` for unmapped errors, logging only errorLabel. No new API error class or raw-body response is required.

Preserve ordinary public session projection and opaque user content. D046 legacy summaries continue to be read/exported unchanged; no export mutation, lazy adoption, metadata repair, migration or deletion. Unverifiable legacy writes are held elsewhere by the reviewed admission protocol, before new student writes. Never blanket-scrub strings or recursively remove token-looking words from user data: summaries, withheld reasons, and opaque fact values can legitimately contain words such as writerToken, parentRef or lifecycleGeneration. Strip authority at typed structural boundaries, and preserve those personal values exactly.

The public export must omit every internal node/proof/root/parent identity, writer/restore/creator token, grant/incarnation/actor/tenant authority, presence binding, generation/creation attempt, capability hash, lineage association, materialization marker and baseline marker. This includes the newly added Session readiness tuple and existing Session ownership fields. No internal kind/state is added to summaryHistory.

## Existing erasure and exact late-original cleanup

All three ledger shapes carry top-level studentId. The existing decisions `ERASURE_PLAN` step at erasure.ts1423 therefore hard-deletes them and its existing residue read-back counts them. No new collection, erasure step, broad ledger purge helper, or duplicated engine cleanup is needed.

Ledger writer/undo ownership handles original driver operations that finish after the actual erasure pass: register original proof/root/candidate/commit operations before a deadline race, drain originals stably, then remove only the exact late artifact owned by the invocation after proving its captured original session binding is absent. Deletion predicates include captured scope/student/session/binding plus own node/writer identity; a root is deleted only if this invocation actually inserted it and its creatorToken matches. Never delete a reused/shared baseline on an ordinary failed A write. A original failure invalidates/scrubs its own pending or committed candidate atomically without changing foreign B/C Session bytes. Recreated authority must not be adopted, and a recreated proof with the same deterministic lookup ID and different creatorToken must not be removed. Candidate parent/root references cannot adopt that recreated proof/root.

No invalidation/tombstone upsert may recreate erased ownership or student content. After exact original-session absence, own late candidate/root/proof artifacts may be deleted according to the reviewed ledger ownership protocol; no general replacement-grant cleanup by studentId. Original cleanup failures remain observable through the rejecting settled promise. After actual erasure/regrant and settlement, old personal text and owned late rows must be absent while the exact fresh winner and foreign lease bytes remain unchanged. Normal A failure while its original session remains present retains shared verified S0 and valid history for B or completed predecessors.

## Independent acceptance controls and falsifiers

Implement the controls in the existing authorized tests after complete plan approval, using synthetic in-process storage/provider data and the sole coordinated runtime lane:

1. Baseline absent S0 yields no history property; present S0, empty summary, withheld reason, and own-property approvedAt presence are preserved exactly.
2. Valid pending and committed stored personal payloads appear in the access copy without private state or commitment claims. Distinct equal-valued revisions both appear; shared immutable baseline appears once.
3. Invalid payload-free nodes are omitted; invalid nodes retaining own payload, malformed state, unsupported payload keys/types, missing/corrupt proof/parent/root, cross-student/scope/binding ancestry, or cycles produce the fixed raw-free error and no partial successful bundle.
4. Exact internal marker canaries are absent at every structural Session/history/decision boundary, while opaque public summary/withheld strings and fact values deliberately containing internal-key words remain byte-for-byte present.
5. Existing course/university decisions and per_fact_reject public audit content remain included; opening capabilities and every summary ledger kind are absent from ordinary decisions.
6. Capture complete raw DB bytes before and after export; they must match. Preserve D046 legacy Session content and ordinary read/export exactly. Tenant-scoped two-student/same-public-ID controls prove no cross-tenant history and preserve all foreign raw bytes.
7. Actual API export malformed-ledger control reaches status 500, JSON `{ "error": "internal" }`, raw-free logging and unchanged raw DB snapshot. This must call the real handler/export path, not merely the mapper.
8. Actual confirmed executeErasure deletes proof/root/write rows via the existing decisions plan and read-back. Hold an original ledger insert through the real purge/release/regrant, then release it and drain the visible settled promise: only exact old owned artifacts disappear; recreated proof/root/Session and foreign bytes survive.
9. Ordinary failed A leaves shared valid S0; actual A/B reverse/concurrent rollback controls preserve full B/C Session bytes while removing failed text from all raw rows and exported history. Completed A followed by failed B remains a positive retained-history/restoration control.

Semantic mutants to prove these controls independently: omit summary ledger kind exclusion; spread private row or payload metadata; replace own-property handling with truthiness and lose empty strings; bypass invalid-payload or ancestry validation; remove exact writer/proof-creator ownership predicates from late deletion; deduplicate equal-valued distinct revisions; suppress late cleanup rejection. Coalesce runtime mutation obligations with the authorized final checker plan rather than claiming these proposed falsifiers were executed here.

## Evidence and completion boundary

This artifact records the entire projection/erasure plan and the ledger/graph-owner schema clarifications. No source edits, runtime tests, Mongo/provider connection, deployment, migration, acceptance verdict, commit or push was performed by this planning lane. Fresh quality approval is plan approval only. The completed implementation still needs maker affected checks, completed-feature fresh source reviews, independent dual acceptance, exact candidate hashes and the required release gates.

## D068 ninth component - rejection-writer observer failure TEST proposal

Status: PROPOSED TEST PLAN ONLY, not implementation approval, runtime, acceptance or source adoption. Root explicitly authorized appending this section to the existing QA artifact. Earlier bytes remain unchanged. No product/source/test/helper/file edit or runtime occurred in this lane.

Exact source proposal seal: qa/evidence/t052-maker-cycle2/immediate-summary-compensation-proposed.md SHA256 DA68F11C206617D81D28DCC7894EB961764C6DB725BDD914DBE912F3D99417B4, including its final observer-failure ledger and exact self-settlement exclusion. Source owner directly confirmed this seal. Proposed existing test target: packages/db/tests/decisions.test.ts, inspected SHA256 E811D121F3755E57683D74DA9B4F4A66A914CA47FBE7A31928A1A341679BE47A. Extend its existing direct-timeout patterns at lines323-412 and precheck patterns419-449 with seven D068-prefixed anonymous test rows in that SAME existing file; no named helper or test module. Existing callback/foreign/nested/D059 oracles remain intact.

### Finite actual controls: exactly seven new top-level test rows

1. D068 recordRejectReasons receipt compatibility: actual held insert and clean observer retains clean own-expiry settlement.
2. D068 recordRejectReasons timer observer fault: exact S remains observable after clean owned cleanup.
3. D068 recordRejectReasons timer observer fault: exact S and actual late cleanup U both remain observable.
4. D068 recordRejectReasons public-wrapper observer fault: throwing the RECEIVED actual FWD rejects without joining its own settlement.
5. D068 recordRejectReasons direct-op observer fault: actual precheck op at current source149-150 preserves own primary and exact S.
6. D068 recordRejectReasons direct-op observer fault: actual insert op at current source160-161 preserves own primary and exact S.
7. D068 recordRejectReasons direct-op observer fault: actual duplicate-winner op at current source173-174 preserves own primary and exact S.

All seven keep the existing original30ms leaf budget and5000ms test timeout. No new grace, renewed deadline, fabricated receipt/error wrapper/expiry, mocked clock or eligibility relaxation. Test names/phase diagnostics are new, not replacements for existing controls. A case that fails to reach its actual primitive/constructor is a fixture failure, never an expected PASS.

### Shared actual-driver and receipt instrument

Use the existing setup, tenantScopedDb and real recordRejectReasons. Create a genuine completed foreign rejection row in tenant B using recordRejectReasons BEFORE the own call; capture every foreign collection via the existing BSON-faithful fake all() values. Include an independently captured foreign row payload with exact original key order, presence and Date where the existing fixture permits ordinary DATA; this carries no grant/proof/ownership authority. Never delete/filter/normalize private fields in expected raw rows.

For rows1-4 intercept only the actual own tenant decisions.insertOne primitive. Capture its exact issued selector/document and ONCE-minted writerToken; return the actual gate-bound original promise and restore the wrapper in finally. The primitive remains genuinely pending past the actual existing leaf timer; after release it executes the bound indexed original insertion exactly once. Mark driverDone only after the real primitive terminates. The owned undo selector must retain exact tenant/student/thread/kind/_id/writerToken. Do not register a raced helper or supplied cleanup as an original, manufacture an insertion receipt or seed a completed own row.

Supply the proposed optional private onExpectedExpiry callback to the real leaf. It records each received object and the exact optional provenance reference before any controlled throw. A receipt without provenance is checked against the actual producer boundary; an actual public FWD receipt must be STRICTLY the caller's ultimately exposed wrapper, with wrappedCause STRICTLY that wrapper's real cause. A locally constructed native AggregateError receipt pins its actual native errors-array reference and an ordered copy of every member identity; its own cause presence/value is also captured. No new Error/AggregateError/FWD is constructed to stand in for any production expiry receipt. Test sentinels S/U are independently captured fixture failures only.

Capture a process unhandledRejection observation for the bounded case, then remove it in finally. Keep all actual raw/owned/nested promises observed and drain them before the final observation turn. One setImmediate after closure is an unhandled-rejection observation turn, not execution grace or delayed acceptance; assert zero unhandled events. Do not install a listener to suppress an actual event: any observed event fails the control.

### Timer observer S and cleanup U

Row1 is the nonthrowing receipt positive. Row2 and row3 throw the SAME captured S only on the first actual own timer receipt without provenance. Later duplicate emission of that same expiry and every locally constructed aggregate/public-wrapper callback must still be attempted; record them independently, never recursively emit a receipt for S. Assert original timer identity and public cause semantics remain unchanged: S/U must not replace the original primary, enter its published ordered cause vector or turn expiry into success.

Before the held insertion releases, the public error is the actual FWD with the existing primary; its exposed settled remains pending because the actual original driver remains live, even after observer S was caught. After raw release, row2 requires the fixed existing settlement AggregateError envelope to reject with exactly the captured observer S according to the final source ledger, while all owned inserted residue is removed and foreign full rows remain unchanged. This is not satisfied by any generic error.

For row3, the immediate undo remains a real clean zero-row delete while insertion is still held. Only the actual FINAL owned undo after driverDone rejects exact U before invoking the bound delete. Record every reached cleanup phase/selector and actual rejected promise. Require that final cleanup still ran despite prior observer failure; reached owned residue is one genuine row, not imagined deletion success. The existing envelope must preserve exact S and exact U, and its order must match actual source collector phase ordering: with only final U, observer S precedes U; an immediate undo failure would belong to the earlier immediate phase and is intentionally excluded from this row. Preserve the first public wrapper/cause and original aggregate array/member identities after settlement. Restore the driver and separately execute exact owned fixture cleanup only after all acceptance assertions to close the synthetic test, without touching foreign data.

### Public-wrapper self-error companion

Row4 never throws at the timer/op receipts. Its callback throws the exact object it RECEIVES when that object is the actually constructed public FWD and provenance pins its actual cause. The callback does not create an equivalent wrapper. The caller must receive that SAME public FWD, with unchanged own primary cause. While its actual insert is held, its settled is pending. After the real raw insertion releases and exact owned cleanup completes, settled must reject in the fixed existing envelope with that exact public FWD as an unexpected observer failure, without waiting on its OWN settled promise. Require callback receipt identity equals exposed error, every raw primitive terminal, no owned residue, foreign full bytes unchanged and zero unhandled rejection. A deadlock/cancelled row is FAIL, not a skipped success. This case does not exempt a distinct foreign FWD: existing foreign/nested-held tests remain mandatory and unchanged.

### Three independently observed actual direct-op sites

Rows5-7 instrument the EXISTING WriterDeadline.prototype.op only through an anonymous test wrapper that executes the bound real op and captures the ACTUAL thrown object before rethrowing it. Restore the method in finally. Do not change expiresAt, signal, timer, Date or the production op result. Receipt identity must be present in this independent actual-op observation.

Use the existing trusted authorize option to target its first, second or third actual authorization return. At the selected boundary, a bounded synchronous fixture waits on the REAL existing clock until the original30ms budget has actually elapsed and then returns a fulfilled promise. This deliberately allows the real following op() to refuse before the event loop processes its timer; it renews no execution time or authority. Verify actual direct-op rejection and record which authorization ordinal/production boundary reached. If timer wins instead and the intended op is not reached, report fixture failure.

The third authorization exists only after a REAL indexed duplicate insert. Pre-create the legitimate same-tenant/same-thread rejection using the actual leaf. The second call invokes the bound insert and observes the actual unique-index code11000, not a fabricated duplicate exception or receipt. Its prospective new writer UUID cannot modify/delete/restamp the existing winner. The selected third authorization then reaches its real winner-budget op. Snapshot full existing duplicate-winner and other-tenant rows before the fault and require equality afterward.

Throw exact S only when the callback RECEIVES an object independently captured by the actual-op wrapper. The later real timer receipt and locally constructed cause AggregateError/public FWD receipts still occur and are recorded. Because original work fails with actual op O while actual timer T is separately observed, the current primary cause construction is genuinely native AggregateError with ordered members O then T, not a fabricated test aggregate. Require its callback provenance equals actualAggregate.errors, ordered members remain unchanged, public wrapper provenance equals actualAggregate, and S is outside this original primary. Actual settled must reject exact S in the existing fixed envelope after all actual originals/cleanup, retaining O/T as expected own execution identities and every foreign/duplicate row. This supplies finite catch-site coverage for all three direct-op callback invocations, separate from the timer and public-wrapper rows.

### Required evidence and limits

Root performs the sole frozen-source runtime after all nine D068 components receive fresh quality approval and official D068 authorization. Record exact reached nodes, actual wrapper/cause/native-array identities, S/U identity and cleanup ordering, actual raw pending/terminal state, no-unhandled observations, full foreign/duplicate-row comparisons, final types and unchanged source/test pins. Omitted-callback compatibility is retained by all existing tests; the new nonthrowing row adds receipt-enabled compatibility. Do not claim parent classification of an unreceipted StudentFencedError merely because a local aggregate/public wrapper is receipted. This proposal claims no implemented callback, real runtime result, source/checker PASS, commit, push, provider/production execution or full-goal completion.
