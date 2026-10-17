# PROPOSED NOT APPROVED — T052 graph commit/publication integration

Status: complete candidate protocol for independent quality review. D048 is not yet an authorizing decision. D046 authorizes this QA record and the preserve-and-hold owner choice; it does not authorize product implementation. No product edits, runtime, tests, DB operations, provider calls or migration execution were performed for this plan.

## Context and boundaries

Current summary UUID CAS preserves a foreign current writer but can restore failed A after A's cleanup already completed. Desired behavior: both failed A/B leave zero A/B payload across raw rows and restore exact known committed S0 (absent/present/withheld); genuinely completed A survives B failure; independently recreated/foreign winner complete bytes remain unchanged.

Use the ledger agent's exact protocol in existing decisions collection: verified proof/root, immutable parent/root/node identity, pending/committed/invalid candidate, absorbing invalidation with complete candidate-payload scrub, logical Session summaryLineageId and physical summaryRestoreToken. This graph plan does not redefine the ledger CAS/normalization algorithm. No new source file, named helper, collection or transaction is proposed.

Brain INDEX and concepts/langgraph/persistence.md were consulted. ARCHITECTURE H1/H3/H5, contract B23.3/B23.5/B15 and decisions D040-D047 apply. Preserve disjoint peer changes. File/line references below are the inspected source baseline and may shift under peer edits.

## Exact additive callback signatures

Extend existing WriteApprovedOptions (nodes.ts:1425) and RecordApprovedSessionSummaryOptions (facts.ts:942), without creating named interface/helper siblings:

```typescript
onOwnedWrite?: (
  undo: () => Promise<void>,
  originalSettlement: Promise<unknown>,
  commit?: (operationOptions: {
    authorize: () => Promise<void>;
    deadline: WriterDeadline;
    onOriginalOperation: (raw: Promise<unknown>) => void;
  }) => Promise<void>,
) => void;
onOriginalOperation?: (raw: Promise<unknown>) => void;
deferSummaryCommit?: true;
```

The optional third argument distinguishes summary lifecycle ownership from generic fact/checkpoint cleanup. Existing two-argument callbacks remain valid; merely having onOwnedWrite does not imply a graph will commit the candidate. Explicit deferral requires an actual consumer before any mutation. The nodes function always installs its own consumer and decides whether to commit locally or forward graph-managed commitment.

Extend graph.ts:436 private checkpointInvocation with:

```typescript
summaryWrites: Array<{
  undo: () => Promise<void>;
  commit: (operationOptions: {
    authorize: () => Promise<void>;
    deadline: WriterDeadline;
    onOriginalOperation: (raw: Promise<unknown>) => void;
  }) => Promise<void>;
}>;
```

Initialize it in existing invokeFenceAware, never in request/state/checkpoint data. Existing write-node registration becomes:

```typescript
onOwnedWrite: (undo, originalSettlement, commit) => {
  owner.cleanup.push(undo);
  owner.pending.push(originalSettlement);
  if (commit) owner.summaryWrites.push({ undo, commit });
},
onOriginalOperation: raw => { owner.pending.push(raw); },
deferSummaryCommit: true,
```

DB calls registration before the first potentially mutating ledger driver, so failure before the leaf returns still leaves its exact cleanup reachable. Callback closures capture exact original candidate/scope/UUID ownership. They never capture a public grant as newly minted authority, renew the deadline or borrow another invocation.

## Original promise registration and D047 interaction

For EVERY admission/proof/root/candidate/session read or write and commit driver:

```typescript
const original = collection.updateOne(exactSelector, mutation, deadline.op());
onOriginalOperation(original);
const receipt = await deadline.run(original);
await authorize();
```

Capture raw promise BEFORE timeout/cancel race. Register original checkConsent/readActiveProfile using D047's existing optional private recorder. Pre-owner recovery uses the exact created.pending array; later owner inherits the same array. Do not replace/recreate that array when constructing owner.

Stable drain repeatedly slices newly appended originals until no unexamined originals remain. Nested FencedWriterDeadlineError.settled promises are followed outside the raw pending array; rejected cleanup settlements stay observable. Recognized duplicate/CAS errors already handled by the normal execution logic must not become a new unconditional publication failure merely because their raw promises rejected.

Never register owner.compensate(), a composed commit callback, a deadline.race wrapper, or a composed settlement into the pending array it drains. Otherwise cleanup can wait on itself. Track raw drivers and the already-existing original leaf execution promise only.

D047 remains separately approved: only an exact AbortError from an already deadline-aborted signal normalizes to prompt FencedWriterDeadlineError with original cause. Earlier nondeadline errors preserve their classification. The lineage extension must accommodate that same branch, not synchronously wait for a held raw profile read after expiry.

## Commit barrier and successful publication

Claim-bearing path: extend existing underLease success tail (graph.ts:1174-1182). Do not commit in writeApproved, readOutcome, or the earlier invokeFenceAware return on this path.

```text
graph.invoke completed
readOutcome completed under original owner
invokeFenceAware outer post-checks completed
stable-drain original operations under original deadline
check original owner authority
release exact original thread/claim lease
check original authority AFTER release settlement
for each owner.summaryWrites in registration order:
    await owned commit({authorize: owner.authorize,
                       deadline: owner.deadline,
                       onOriginalOperation: raw => owner.pending.push(raw)})
    check original authority after callback completion
stable-drain registered originals again
check original authority after that drain
original deadline.op()
return existing result synchronously
```

Existing releaseLease (graph.ts:1057) retains raw release registration before race, exact captured claim/token selector and post-release authorization. Commit is after release and its authority check. Releasing a thread lease is not a session-summary mutex or a commitment proof.

Claimless path: run the equivalent INLINE barrier in invokeFenceAware's existing success tail (graph.ts:825-829), omitting lease release. Claim-bearing paths defer to underLease, so neither path commits twice. An empty summaryWrites array remains ordinary existing start/refusal/interrupt behavior.

Every commit callback uses the still-live exact original graph WriterDeadline, not the already disposed summary leaf timer and not a new full deadline. Its conditional mutation is pending -> committed for the exact owned candidate only. Invalid is absorbing; a held/retried commit cannot re-create scrubbed payload or transition invalid -> committed. Idempotent committed success must match the exact own immutable identity, never a foreign row.

After the final successful barrier there is no additional graph-owned async work. Do not clear rollback callbacks early: commit becoming visible in Mongo is not permission to discard cleanup obligations.

## Completed A versus subsequently failed A

Completed A: original graph completion passed driver settlement, subsequent original-authority checks, final original deadline.op and successful return. Its original invocation has no remaining async failure continuation. B's cleanup owns B only and cannot invalidate A.

Subsequently failed A: A's original invocation fails before that boundary, including after its ledger commit mutation became visible. Its own registered undo invalidates A from pending OR committed and scrubs the complete candidate payload, then normalizes through the ledger protocol. That state is not resurrected by late commit.

Do not call a durable committed marker proof of a successfully returned response while its original commit response/checks remain held. It is reversible state until the original completion boundary. Do not scan historical A and invalidate it using B's current grant failure. All invalidation remains exact original A ownership.

## Ordinary errors, authority loss and settlement

Any failed invocation after registration invalidates every own summary candidate, including ordinary nonauthority errors. For ordinary graph failure with valid authority, perform summary-only cleanup; do not newly compensate unrelated facts/checkpoints solely for a retry error. Successful conflict/partial_conflict terminal results remain successful outcomes and can commit the approved summary.

Ordinary failure order:

```text
wait original invocation/drivers and necessary original settlements
attempt every own summary undo even if one fails
preserve valid shared S0 and complete foreign winner bytes
release exact owned retry lease after cleanup
throw original error, aggregating cleanup errors
```

For authority loss/fencing, retain existing full owner.compensate, including registered summary invalidation. Shared valid root/proof and admitted shared session anchor are not removed on ordinary creator failure. Actual erasure remains the full purge; late orphan cleanup deletes only exact own creator UUID artifacts under the ledger agent's rules.

Timeout/cancellation stays prompt. Extend existing exposed settlement composition, not a detached background task:

```text
throw prompt FencedWriterDeadlineError with original cause
its exposed settled:
    waits original invocation/raw drivers
    follows nested exposed original settlements
    attempts all own summary invalidations/normalization
    attempts remaining owned compensation and exact lease cleanup
    rejects with independently observable cleanup errors
```

This applies when a commit response is held, when postcommit authorization times out, or when a newly tracked D047 profile cursor remains live. No lease release while original work is live. Never force original authorization to succeed before cleanup: cleanup uses exact ownership and bounded cleanup operations after authority/deadline loss. A catch attached solely to observe rejection must not replace the exposed rejecting settlement with fulfilled success.

## Direct leaf and direct nodes callers

recordApprovedSessionSummary without explicit deferSummaryCommit commits INLINE after its own leaf checks under its original live WriterDeadline, checks authority after commit settlement, performs final original deadline.op and returns. Its catch/deadline settlement invalidates its own candidate even if commit landed. Explicit later own undo can still compensate committed content; it cannot touch a foreign winner.

writeApproved ALWAYS defers the leaf commit and stores its third callback locally. It forwards graph-managed ownership if private deferSummaryCommit:true is supplied. Otherwise it establishes one original local WriterDeadline at invocation entry, binds leaf deadlineMs to the remaining time until that original expiresAt, and finalizes its stored commit only after applyApprovedDiff and successful result validation. Postcommit auth and final original deadline.op precede return. Dispose the local deadline in the existing function's finally. Graph-managed final commit receives the original graph owner deadline, preserving existing writerDeadlineExpiresAt binding.

Direct calls must not be inferred deferred merely because an old two-argument onOwnedWrite callback was supplied. Explicit defer without a consumer refuses before writing. Direct nodes ordinary errors invalidate own summary; existing authority/fence paths retain broader cleanup. Verified leaf/nodes callers remain positive controls; unverifiable legacy calls receive the explicit HOLD/error below.

## Admission and exact independently approved HOLD clarification

D046 owner choice is implemented before ANY new student mutation on an unverifiable existing session. Inline read-only proof/root/current-ledger validation goes before thread attachment, transcript, concern edges, new claim, rejection audit, or graph.invoke/checkpoint writes at existing startScribe/resumeUnderDeadline/approval-node boundaries. Recheck using captured original authority after awaited admission reads. An earlier successful admission check is not a permission cached through later awaits.

Known ledger ancestry may contain a concurrently active candidate; it is not unverifiable legacy merely because it is pending. Validate exact parent/root/proof/scope and ledger protocol, allowing the approved concurrent lineage controls. Missing/contradictory legacy evidence cannot be adopted lazily, synthesized from old UUIDs, or repaired automatically.

Keep normal verified ensureScribeSessionRow public returns exactly its previous public fields; do not add proof/root/node IDs to those returns. Add an OPTIONAL PRIVATE onSummaryAdmission callback to the existing options, carrying the ledger owner's exact proof/root/scope identity and shared readiness state to CreatedByCall/owner. This is not request authority or a public response. Capture exact ownership through the helper's private state and onOwnedWrite registration, and register each raw original BEFORE a potentially mutating proof/root/readiness driver is awaited. Deliver onSummaryAdmission shared readiness evidence ONLY AFTER persisted readiness/evidence validation; it is not the pre-mutation ownership callback. Readiness must account for a CAS becoming visible while its original response is held: compensation must verify the exact persisted shared admission before deciding to delete a creator anchor; absence of a local receipt/readiness boolean is not proof that no legitimate B relies on the visible admission. Preserve exact captured grant/generation/creation-attempt and raw operation registration.

Preflight capacity BEFORE the first candidate write must cover the complete rollback S0, every reachable ancestor payload needed by normalization, and the physical transient guard/materialization fields. Size actual proposed BSON documents/update results using the installed BSON sizing behavior rather than JSON length. Fail with existing generic Error and fixed raw-free message 'Session summary history exceeds BSON capacity.' BEFORE mutation if the complete worst-case owned restoration cannot fit. This is a capacity ERROR, separate from unverifiable legacy HOLD; do not serialize raw sizes/values/IDs/causes, truncate content, drop ancestors, narrow verification to the proposed short summary, or discover capacity failure only during cleanup. The exact document shapes and scope tuple are the ledger agent's separately reviewed protocol.

FIXED graph HOLD object uses the EXISTING ScribeOutcome done/refused shape; no new kind/schema is introduced. Root and independent quality pinned this clarification:

```json
{"kind":"done","result":{"status":"refused","reason":"Session history requires verification before new writes."}}
```

It contains no original summary, session/student IDs, UUIDs, raw error or dynamic message. It explicitly states the verification hold using the existing refused result; it cannot be replaced with a generic refusal. Existing API start/resume/approval routes return outcomes unchanged and emit approved events only for kind done WITH result.status written; this hold therefore triggers no approved-event mutation. Existing read/inspect/export/already-resolved branches stay available and preserve old bytes. No API source edit is proposed solely for forwarding this outcome.

FIXED helper admission result returned before mutation:

```json
{"created":false,"summaryAdmission":{"status":"hold","reason":"summary_history_verification_required"}}
```

Direct summary writer uses the EXISTING SessionRowMissingError with optional FIXED code summary_history_verification_required and the SAME fixed message: Session history requires verification before new writes. Preserve the existing default missing-row error behavior. Do not create an error class/helper. Graph recognizes only the exact trusted admission hold/code and returns the fixed done/refused object. Other authority, fence, unreadable DB, timeout or malformed-input errors remain their existing refusal/error paths. The HOLD clarification is independently approved; the complete lineage implementation still requires combined plan approval and its authorizing decision.

Fresh admission (DB agent owns ensureScribeSessionRow:791): a successful exact fresh empty-session creation receipt precedes proof/root minting; proof/root readiness precedes thread attachment. Existing/duplicate/ambiguous creation never receives guessed proof. Capture private admission/root readiness in CreatedByCall. Once verified shared S0 admission is established, ordinary creator failure must not delete a shared anchor another legitimate writer relies on. Actual erasure purges proof/root through existing student selectors; exact late-erasure orphan cleanup never re-creates them. No migration executes under this plan.

## Exact existing targets

- nodes.ts:1425 WriteApprovedOptions; :1498 writeApproved: additive signature, local callback storage, direct/deferred finalization and all-failure summary invalidation.
- graph.ts:258 existing write node: callback forwarding and raw registration.
- graph.ts:436 private owner interface; :662 invokeFenceAware: summary ownership and claimless success/failure/settlement handling.
- graph.ts:1057 releaseLease; :1086 underLease: raw-before-race release, postrelease authority, final commit barrier and prompt exposed settlement.
- graph.ts:837 startScribe; :1276 resumeUnderDeadline; existing approval node: early mutation admission/HOLD using existing done/refused outcome. No ScribeOutcome kind addition.
- Existing CreatedByCall: private admission/root readiness and same pending-array transfer, preserving D045/D047 ownership.
- DB lane existing facts.ts summary options/results/functions: callback lifecycle, direct commitment and exact rollback; ensureScribeSessionRow fresh admission as separately specified by ledger/DB owner.

## Independent acceptance schedules

1. A commit mutation lands, hold actual commit response, B captures A/writes B, revoke original grant, resume A; A scrubs own ledger A while complete Session B bytes unchanged; B later fails and restores exact S0.
2. Reverse cleanup: B restores logical A first; A later scrubs/normalizes using exact observed physical-token rules. Exact S0, zero failed payload across all raw rows.
3. Completed A returns successfully, B alone fails; complete A payload/history preserved. B never invokes A's cleanup.
4. Own invalidation beats held commit; late pending->committed CAS cannot resurrect invalid state/payload.
5. Actual erase/purge/readback/regrant while ledger commit held; old invocation refuses, exact own cleanup leaves no orphan payload and preserves recreated complete winner.
6. Ordinary valid-grant final graph failure; own summary invalidated, shared committed S0/proof/root/anchor retained.
7. Commit/cleanup driver rejects; original failure and each cleanup failure observable, other cleanup still attempted.
8. D047 raw profile cursor held: prompt original deadline, exposed settlement pending until cursor terminal, then exact cleanup/lease release; nondeadline AbortError classification unchanged.
9. Early unverifiable HOLD before each attachment/transcript/concern/claim/reject/checkpoint driver. Snapshot complete raw collections before/after, preserve old read/export.
10. Verified standalone record/nodes success, held standalone commit failure, explicit old two-arg callback success; no accidental indefinite deferral or timer renewal.
11. Independently recreated/foreign winner: compare COMPLETE raw rows byte-for-byte at every relevant driver window, not selected fields.
12. Absent/present/withheld S0 own-property equality, successful verified markerless S0 and fresh admission/concurrent retries.

Each reaches the actual underlying driver with preceding guards intact; independent falsifiers remove exact predicates or postawait checks and must produce intended assertion failure. Existing test modules only. Offline fake controls do not claim real Mongo cross-process execution. Fresh checkers independently exercise the complete candidate after source readiness.

## Verification status

NOT RUN: dispatch prohibited runtime/tests/DB/provider work. This document is proposed QA analysis only. No PLAN APPROVED, product PASS, D048 implementation authority, release acceptance, migration, commit or push is claimed.

## D068 proposed writeApproved settlement propagation source component

Status: PROPOSED SOURCE PLAN ONLY. Author /root/t052_profile_settlement_plan. Current source inspected: packages/engine/src/scribe/nodes.ts SHA256 ED46B42A36463EFF0DE435EA952D8996EFC8CE8668E1AB5644D53488A5942E2E. No source/test/runtime changes or acceptance performed. This subsection supersedes only the earlier settlement-propagation assumptions for writeApproved; all original lineage/publication/admission/deadline/owned-rollback contracts remain.

### Exact established defect and bounded scope

At nodes.ts:1509 the real recordApprovedSessionSummary original-operation callback registers actual Mongo originals before they are raced. The concrete current candidate insert facts.ts:1556 can remain held until the leaf deadline returns; after release, that actual original can reject with an independently created ordinary Error, AbortError-named Error, or foreign FencedWriterDeadlineError. The writeApproved failure drain nodes.ts:1581-1582 observes the rejection but places it only into executionErrors; :1585-1590 searches that list for nested settled promises and causal objects, never records an ordinary unexpected root as a settlement failure. If all cleanup succeeds, :1598 sees no errors and the public node deadline error's settled promise incorrectly fulfills. The same loss is possible for actual commit updateOne facts.ts:1471, registered through nodes.ts:1534. Separately, the success drain nodes.ts:1542 awaits allSettled but ignores every rejection, permitting successful return after a registered original fails. Confidence exceeds 80% from these exact source paths; this is source proof, not a reached runtime result.

The DB D068 correction may expose the same sentinel via a leaf's nested settlement and thereby mask an isolated mutation of the node collector. Therefore the test plan also needs an independent real writeApproved authorization-boundary fault after actual summary/fact writes, using the supported private options.authorize callback, original foreign deadline error and cause identities, and an actually held/observed raw operation behind its settlement. No fake success, fabricated owner or detached counterfeit settlement may substitute for this dependent control.

Node source edits are ONLY the existing WriteApprovedOptions interface at :1428 and writeApproved at :1480. No new function, module, source/test file, exported helper, collection, error class or public request/model/checkpoint field. This component adds no data-authority adoption, marker mutation, deadline renewal, grace widening, summary-history interpretation, provider call or production action. Preserve exact existing first caught error identity, current timedOut/prompt/wrapping orchestration, ordinary retry facts behavior, result categories and captured session/summary ownership. Root explicitly requires first public cause immutability before and after all late failures; this repair changes settlement observability and provenance, not public timing categories.

### Exact private callback handshake and cross-file boundary

The node WriterDeadline is distinct from the deadlines instantiated inside recordApprovedSessionSummary and applyApprovedDiff, even when all derive from the same absolute budget. A leaf deadline error cannot be called node-owned because of its class/name, elapsed time, callback location or a fulfilled settled promise. Clean child-expiry compatibility therefore requires a coordinated OPTIONAL callback in EXISTING options interfaces:

    onExpectedExpiry?: (error: unknown, provenance?: { wrappedCause: unknown }) => void;

Exact coordinated interfaces are facts.ts:341 ApplyApprovedDiffOptions; facts.ts:1359 RecordApprovedSessionSummaryOptions; nodes.ts:1428 WriteApprovedOptions. Graph source owner additionally forwards this optional callback from the existing guarded write node into WriteApprovedOptions and captures it in the current private invocation registry shared through CreatedByCall. This cross-file addition belongs to the DB/graph D068 source plans, not authorization for this planner to edit peer-owned files. No new named type is needed. Existing callers omitting the callback retain ABI compatibility. Existing two-argument owned-write callbacks and commit option shapes remain supported.

A callback without the second argument is emitted ONLY from the exact original expiry rejection of that invocation's own WriterDeadline.run(never) or the exact error thrown directly by that same deadline.op at a syntactically isolated source callsite. Catching an arbitrary authorization/driver error after the clock expired is not an own-expiry witness. A second argument is emitted ONLY immediately after constructing an owned wrapper, with wrappedCause equal to the actual captured cause reference. It is a construction receipt, not a claim that its whole causal graph is expected. Existing applyApprovedDiff PartialApplyError construction sites must provide exact wrapper/captured-cause receipts where the parent would otherwise lack provenance. For summary commit using a supplied operationOptions.deadline, only direct operations on that exact supplied deadline may emit its op witnesses; default-authorize and child deadline paths must not claim a different invocation's clock. Any parent forwarding preserves both arguments unchanged.

Node maintains a local exact-identity receipt registry, forwards leaf receipts unchanged to options.onExpectedExpiry and records its own exact timer/op identities at their actual creation sites. Raw original registration and this receipt callback are separate mechanisms; neither callback, a parent collector, cleanup composition nor Promise.allSettled wrapper is recorded as an original operation. Receipts are private trusted closure values; they cannot originate in HTTP bodies, schema data, saved checkpoints, model output or database fields, and private callbacks are not spread into Mongo driver options. Graph binds its callback to the same captured graph/DB/student/owner invocation already required by its write gate. Root/quality must approve the entire optional ABI and exact leaf emission sites before D068 implementation.

### Expected-only rule, first cause and fixed failure envelope

Classify a rejected original as expected ONLY after a complete positive causal proof. Its exact identity must be a witnessed own expiry/op or an exactly receipted constructed wrapper. Every receipted wrapper's current cause reference must equal its captured wrappedCause; then every reachable child/cause must itself satisfy positive receipt provenance. An independently constructed ordinary Error, AbortError-named Error, foreign FencedWriterDeadlineError, unreceipted aggregate/partial wrapper, mutated cause, unproven leaf or causal cycle is unexpected regardless of current deadline state. Shared diamond identities are visited once and are not mistaken for a cycle; active-path cycles fail closed. Expected roots never suppress unexpected causes, aggregate children or nested settlement rejections.

Do not mutate, replace or relatch the first caught err or any public wrapper's cause when late failures arrive. The current catch's err remains the first primary identity; a foreign deadline primary may continue through the existing prompt wrapper but its exact root and unexpected causal leaves remain observable through rejecting settled. Clock expiry later cannot erase an earlier ordinary or caller-abort cause. Preserve the fixed existing message writeApproved: owned cleanup failed for the final settlement AggregateError. Its ordered errors begin with that same first err, followed by the existing authority error if distinct and then the discovered unexpected original/commit/nested/early-cleanup/undo roots and leaves in stable phase order. Deduplicate object identities across the complete envelope, including a root already present as primary; preserve distinct errors with the same message, name or class. Do not redact, stringify, flatten away or fabricate error identities. The observable settled promise rejects whenever any unexpected original or required cleanup failure exists, including when all other cleanup succeeds.

### Stable success and failure drains in the existing function

On the direct success path, inspect the actual results of every allSettled batch at :1542. Any rejected original becomes a genuine failure entering the existing catch/owned-cleanup path, preserving the first rejection identity; an own-expiry rejection is still an execution failure, not successful publication. Drain newly appended originals and committing promises to a fixed point before successful return and the existing final authorization/deadline checks. Never publish result while a registered original is still live or any original has rejected. Deferred graph commitment continues to use the graph owner's final publication barrier; this change does not move that boundary.

On failure, collect every committing, registered-original and original work rejection, preserving roots as well as traversable causes/children. Maintain separate identity sets for observed original promises, discovered errors and nested settled promises; a promise/error reachable twice must not be awaited/appended twice. Repeatedly drain all newly registered originals/commits and discover then drain every reachable nested FencedWriterDeadlineError.settled. Each nested rejection is recorded and becomes another discovery seed, so a deeper nested rejection cannot evade observation merely because it was discovered after the first pass. Never place this function's own settled promise, earlyCleanup, an undo composition or a collector's Promise.allSettled into originals.

Await the existing earlyCleanup and attempt every required owned undo in the existing reverse order, even if original work, nested settlement, early fence check, an early summary undo or a prior undo failed. Retain existing earlySummaryUndos attempt bookkeeping and ownership predicates; do not add a retry, broad cleanup or foreign deletion. Cleanup may append raw originals through existing callbacks or reveal nested error graphs, so repeat original/nested discovery after cleanup to a fixed point before settled resolves/rejects. A rejecting cleanup with a nested held settlement cannot let the outer settlement terminate early. Identity-deduplicate failures, but do not short-circuit the remaining cleanup callbacks. The original absolute expiresAt and WriterDeadline timer/disposal boundaries remain unchanged.

### Existing-file tests and importer impact

Root assigns a disjoint writer for EXISTING packages/engine/tests/scribe-per-fact.test.ts; the test-only sibling plan lives in existing initial-db-concurrency-tests-proposed.md. Required controls: actual held candidate insert and actual held direct commit response followed by ordinary/AbortError-named/foreign-deadline raw rejection; node-specific real final-authorization foreign deadline/cause after actual summary/fact persistence; expected exact own-node and positively receipted child expiry with clean settlement; unexpected nested cause on a receipted wrapper; appended original during nested settlement; diamond and cycle discovery; distinct same-message errors; multiple original/undo failures with all required undo attempts; and unchanged first public cause before/after release. Preserve complete foreign session/claim/fact/ledger bytes and exact owned cleanup. Baselines must reach actual raw driver/authorization phase and fail the intended settlement assertion, not setup. No runtime has been run by this planner.

Optional ABI impact requires existing DB/engine/API types and the existing summary/direct write/per-fact/persistence/fence/API importer suites after the source is ready. Maker runs affected/failed/touched controls only under the normal vc-testlock and sole heavy lane; final complete integration, eleven types, browser and blind dual checker remain separate gates. Meaningful isolated mutations discard node raw rejection, trust Abort/FWD class or deadline.expired, replace the raw original with a raced wrapper, skip causal receipt validation, stop after one nested batch, stop after one undo failure, or replace first err on a late failure; each must produce a reached assertion failure. A leaf correction masking a node mutation is not sufficient falsifier proof.

Verification status: proposed plan, source-only evidence. Fresh independent complete-plan approval plus official D068 authorization are required before any source or protected test implementation. Existing source/source-test owners are not displaced; all prior artifact bytes preserved.
### D068 finite provenance clarification: native aggregate vector and actual wrapper construction

This paragraph supersedes ONLY the earlier receipt interpretation of AggregateError in the D068 subsection. The ABI remains exactly onExpectedExpiry?: (error: unknown, provenance?: { wrappedCause: unknown }) => void; no second schema, optional field, type, module or helper is added. Ordinary Error/FencedWriterDeadlineError/PartialApplyError wrapper provenance.wrappedCause pins the actual error.cause reference. For an actually locally constructed AggregateError that needs transparent parent causal proof, provenance.wrappedCause instead pins its actual native error.errors ARRAY reference, not the usually absent aggregate.cause and not the iterable/input array supplied to the constructor. The receipt is emitted immediately at that exact existing constructor site. Class information interprets an already authenticated construction receipt; class information alone never establishes ownership.

The parent receipt observer snapshots the exact native array reference AND its ordered member identities when the receipt arrives. Expected-only classification requires that the same aggregate identity retains that exact native array and identical ordered member vector, then positively proves every actual child. A changed array, reordered/appended/replaced child, unknown child, unproven causal cycle or newly introduced unexpected cause fails expected-only proof. Ordinary wrapper cause references must likewise remain exactly the captured reference, and every reachable unexpected cause or nested settlement still rejects the public settlement. Unknown raw foreign FencedWriterDeadlineError/AggregateError objects are never enrolled because of class, name, deadline.expired, or a fulfilled nested settled promise.

Within the node's existing writeApproved, any locally constructed public deadline wrapper at current nodes.ts:1601 must be emitted as the exact constructed object with wrappedCause equal to its actual cause, before propagation. An actual locally constructed AggregateError used for parent causal traversal, including the current fixed settlement envelope at :1598 when needed, emits wrappedCause equal to its own native errors array. A construction receipt does not make that aggregate expected: its foreign primary, authority, raw or cleanup descendants remain unexpected and must retain their original identities. No arbitrary caught external error or enclosing catch becomes an emission site. Source owner forwards both callback arguments unchanged and never mutates the first public cause. Optional callback observer failures are themselves unexpected observable failures; they cannot be silently swallowed, left as an unhandled detached rejection or used to stop other required cleanup.

This is a finite coordinated PLAN amendment only. The complete amended source artifact must receive fresh whole-hash quality approval and official D068 authorization before implementation. No source, tests, runtime, helper or new file was changed by this amendment.
### D068 final finite quality reconciliation: rejection roots and no failure-envelope receipt

This subsection supersedes ONLY two phrases in the preceding D068 proposal. No source/algorithm/ABI scope is added.

First, remove the proposed construction-receipt emission for the always-UNEXPECTED final failure/cleanup AggregateError at current nodes.ts:1598. That fixed writeApproved: owned cleanup failed envelope, and any other already-unexpected failure/cleanup envelope, needs no receipt for expectedness. Preserve it automatically as the SAME observed rejection ROOT and original causal DAG. Do not call onExpectedExpiry while constructing that final failure envelope: an observer fault after its failure list was copied could otherwise be lost. The exact actual public FencedWriterDeadlineError constructor at :1601 and genuinely required positive-cause constructor receipts remain in scope. The SAME callback ABI, native aggregate array/reference/ordered-vector rule and unknown-foreign exclusion remain unchanged. No blanket aggregate exemption is introduced.

Second, the earlier phrase roots and leaves in stable phase order does NOT authorize flattening or inventing additional original-category failures from unregistered causal leaves. Output entries arise only from actual observed primary, authority, original-operation, commit, nested-settlement or cleanup rejection ROOTs. Traversing .cause and .errors preserves their original DAG, validates positive provenance and discovers reachable nested settlements; it does not promote an otherwise unregistered causal leaf into another top-level output entry. A receipted root with any unknown descendant remains that SAME unexpected root with its DAG intact. An independently observed nested settlement rejection is its own actual rejection root. Identity deduplication keeps each observed root once, retains distinct same-message identities, and does not mutate its causes/errors. The existing fixed envelope begins with the unchanged first primary identity, followed by distinct actual observed rejection roots in stable phase order.

Quality /root/t052_d058_plan_quality explicitly accepted this exact finite removal subject to final whole-hash repinning; no implementation, runtime, test mutation, new helper, file or broader algorithm was performed. All prior artifact bytes remain preserved. The amended artifact is FROZEN for the whole D068 component gate.