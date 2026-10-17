# T052 D052 immediate summary compensation — PROPOSED technical timing closure

No source or test implementation approval is claimed. This plan is read-only
diagnosis plus a proposed existing-function change. The root owns runtime and
independent quality review; product sources remain frozen.

## D055 terminal maker diagnosis — 2026-10-14, read-only amendment

This appended diagnostic section preserves the approved proposal text and its historical hashes below. D055 already authorized the helper/node implementation; this diagnosis authorizes no further product or test edit, no budget/oracle change and no acceptance verdict.

Frozen inspected sources:

- `packages/db/src/erasure.ts`: SHA256 `7E31AD7DFB9527D2B5C485D56DA6FDB9D7C16E5AF947F7EB0A61BF1E56AD0129`.
- `packages/engine/src/scribe/nodes.ts`: SHA256 `ED46B42A36463EFF0DE435EA952D8996EFC8CE8668E1AB5644D53488A5942E2E`.
- `packages/engine/tests/scribe-persistence.test.ts`: SHA256 `499EF925CE1D951A2F251457F9B7DFD5C3C4FCBBC2D3C80AB341FFC552B6E092`.

Actual terminal evidence is `d055-persistence-failed-touched2.log`: 104 tests, 99 passes, 5 failures, zero cancellations/skips/todo; runtime_exit=1, end_utc=2026-10-13T21:50:25.9727172Z, mutex_present=False. Both ordinary true/false early-fence probes passed. These are maker results, not whole-feature acceptance.

The original 20ms/60ms ISS-t-017-c1-2 test failed at `scribe-persistence.test.ts:1424`, **actual fact driver not reached**, after 25.4596ms. It did not reach the immediate summary assertion at line1434, the full raw S0 assertion at1436, or the failed-text assertion at1440. The earlier GREEN does not erase this current RED, but this current run does not reproduce a product failure at those later assertions. The node raised the original deadline error before the controlled held fact stage; claiming a newly proved summary-restoration race from this result would be false attribution.

The original fixture currently allocates `new Error().stack` on **every** fence read at line1400, before checking existing factEntered/expired eligibility. The admission/summary path legitimately issues additional original-authority reads before the first fact. A bounded fixture amendment can move stack observation behind those existing eligibility checks, while continuing to count all reads and keeping the exact original20ms expiresAt at line1419, original60ms hold at1425, actual null postcheck result, real request/confirmation and complete nine-field/raw S0 assertions unchanged. Do not renew the deadline, start a later product budget, skip a target stage, remove an assertion or manufacture a fence. No product optimization/fix is justified by this stage-missing run alone.

All four new 200ms guard/rollback hold/rejection probes failed at `scribe-persistence.test.ts:1618`, `cleanPostcheck === false`, before their held target identity/settlement assertions. Each captured phase array has65 entries. Its final three semantic records are:

| Probe | Actual compensateIfFenced/applyApprovedDiff read past expiry (ms) | Confirmation's setErasureFence read past expiry (ms) | Actual node catch guard past expiry (ms) |
| --- | ---: | ---: | ---: |
| guard held | 14 | 14 | 15 |
| guard rejection | 12 | 13 | 13 |
| rollback held | 84 | 84 | 85 |
| rollback rejection | 3 | 3 | 4 |

Every recorded read above has factEntered=true and cleanPostcheck=false. No captured `semantic-clean-postcheck-confirmed` phase exists before the failing assertion. Actual node catch guard provenance reaches `nodes.ts:1559`, so these four failures are not a missing catch-guard call. They have not yet proven the intended held/rejected guard or rollback closure.

The fixture condition at lines1576–1580 checks only inherited stack inclusion of `compensateIfFenced` and `applyApprovedDiff`. It then awaits requestErasure and confirmTwiceAndApprove before setting cleanPostcheck=true. The confirmation itself calls `setErasureFence`, whose real read is `erasure.ts:727`. That recursive read retains the asynchronous original postcheck frames, remains after expiry, observes factEntered=true, and arrives while cleanPostcheck is still false. Thus it satisfies the same broad fixture discriminator and attempts another request before the first confirmation finishes. The first request has already persisted its active studentKey; the real unique-index failure maps to ErasureRequestAlreadyOpenError at erasure.ts1088. The diagnostic arrays show this exact recursive confirmation-read path. The terminal top-level assertions did not themselves print the entire nested original exception object, so this diagnosis distinguishes the proved erroneous discriminator/control flow from an independently executed exact-error-object assertion.

A bounded test proposal must therefore discriminate the **immediate relevant production caller** of the actual read, rejecting the setErasureFence/request/confirmation recursive path rather than accepting any matching asynchronous ancestor. Selection also needs a separate before-await one-shot/in-progress latch, set synchronously before the first request/confirmation await; the final cleanPostcheck flag remains set only after the genuine real confirmation succeeds. Do not fake confirmation, set final success early or use an ordinal read number. Capture and return the exact original null result from the selected clean postcheck. Retain actual request+confirmation, the independently observed exact tenant facade promise and recorded raw promise, true/false latch behavior, original200ms deadline, held/rejected cleanup observations, full nine-field S0 and foreign winner bytes. Lazy stack observation after eligibility may reduce fixture overhead without altering any execution budget.

The actual source remains unchanged. `writeApproved` starts its early guard at nodes1558–1571, records the helper's real findOne through the approved private callback, latches fullCleanup before supplied summary undo, and starts observed stable settlement separately at1573–1599. This run proves no new product-source race at the missed target phases. Root and the test owner received the precise source/test distinction and the bounded instrumentation proposal; fresh independent plan approval and authorizing decision are still needed before any proposed fixture edit.

## Actual reached failure and source snapshot

`d052-failed-touched1.log` records terminal run `0eb358`: 203 tests, 202 passes,
one failure, zero cancelled/skipped/todo. The failure at
`packages/engine/tests/scribe-persistence.test.ts:1433` is the original immediate
summary-compensation assertion. The actual summary and approved timestamp remained
stored before the caller observed/awaited the exposed `.settled` promise.

The revised existing test reaches the actual summary materialization and held fact
insert, keeps the original 20ms budget, reaches the actual clean
`applyApprovedDiff` deadline postcheck, confirms real erasure after that clean
read, releases the held fact after 60ms, catches an actual
FencedWriterDeadlineError, then checks immediate complete S0 restoration. This is
not an ordinal-read matcher failure, missing-driver setup or widened-budget issue.

Frozen source hashes:

- `packages/engine/src/scribe/graph.ts`: `2BC9CE281101B1EB5A122EA97EAE7FA6794215BAD86BE6B4CA60FC1B3222E91B`.
- `packages/engine/src/scribe/nodes.ts`: `C66F07E41AF56BCD4BE4BA547061CFC0BDC9D37022190A8F3311C6EAB5030BD7`.

## Existing source defect

The proposed source scope is the existing `packages/engine/src/scribe/nodes.ts`
DB import and `writeApproved`, lines1478–1584, plus the existing
`packages/db/src/erasure.ts::isStudentFenced`, lines669–681, for exact raw-driver
registration. The root must assign the DB helper edit to a separate owner from
nodes; all peers preserve each other's edits. At line1555 the nodes cleanup promise first waits all summary
commits, all raw/global original operations, and nested deadline settlements
(lines1557–1573), then starts the summary undo at line1575. The timed-out caller
gets FencedWriterDeadlineError at line1581 while that global fact drain remains
pending. Summary invalidation is therefore unnecessarily coupled to live fact
drivers, even after the summary's own originals have closed.

No change to graph, API, contracts, public output, writer authority, collections,
schema, original deadline, or new named helper is proposed. The existing DB helper
gets only the optional private recorder described below; default callers retain
their exact behavior.

## Exact raw-driver capture in the existing fence helper

Extend `packages/db/src/erasure.ts::isStudentFenced`'s existing options type at
line673 with optional private
`onOriginalOperation?: (original: Promise<unknown>) => void`. Within that SAME
function, destructure the recorder out of options, start the actual
`erasureFences(db).findOne` promise using only the remaining Mongo options, invoke
the recorder synchronously with that actual promise BEFORE awaiting it, and then
keep the current fence-presence/hold/release-time calculation unchanged:

```ts
const { onOriginalOperation, ...mongoOptions } = options;
const reading = erasureFences(db).findOne({ _id: erasureFenceKey(studentId) }, mongoOptions);
onOriginalOperation?.(reading);
const fence = await reading;
```

This records the actual issued driver promise, not the `isStudentFenced` helper's
async promise. The private function must never be forwarded in Mongo options.
No existing default caller needs to change. No new helper, schema or physical
mutation is added. Helper work, supplied undo, early guard/cleanup and composed
settlement promises all stay OUTSIDE `originals`, preventing self-drain.

## DB protocol coordination, read-only

The DB owner confirmed on the current frozen `facts.ts` implementation:

- Its summary `onOwnedWrite(undo, work, commit)` registers original summary work;
  that work includes candidate insert and materialized session CAS, not facts.
- The supplied `undo` stably drains the summary-local pending originals, including
  candidate insert, session CAS, final fence reads and any later commit mutation
  and response. It has no fact/edge dependency.
- After that drain it invokes the approved exact-owned invalidation/restoration
  protocol. Invalid state is absorbing, payload is scrubbed, and restoration
  preserves full foreign A/B/C ownership and all nine S0 presence fields.
- Candidate INSERT and materialized CAS must settle before rollback; an issued
  late insert or CAS could otherwise recreate payload or materialize an invalid
  summary. The supplied undo is the authoritative closure; do not bypass it with
  a lower-level undo or a new driver mutation.
- A held summary commit remains a summary original; supplied undo waits it. No
  summary rollback may use fact-driver completion as a substitute for this proof.

## Minimal proposed scheduling closure

Within existing `writeApproved` local ownership and catch state:

1. Identify summary entries by their registered private third `commit` callback;
   fact entries have no such callback. Do not use public model fields or result IDs.
2. Start a private early fence-check/compensation promise in the existing catch
   BEFORE the global fact drain. Reuse existing exported `isStudentFenced` and
   `FENCE_POSTCHECK_TIMEOUT_MS` through the existing DB import. Pass the existing
   helper's newly approved private recorder together with its cleanup driver
   timeout. That recorder pushes the actual `findOne` driver promise into
   `originals` and forwards `options.onOriginalOperation` synchronously BEFORE
   helper await. Do not register the enclosing helper/early chain or call
   `deadline.op()` after expiry to obtain a new execution budget.
   This is bounded cleanup evidence, never permission to execute or publish.
   The early check is not awaited on the caller's timeout path and has no grace
   timer, microtask delay or deadline-renewal race.
3. Only actual `isStudentFenced` result `true` starts early supplied summary
   `undo()` calls. A false result performs ZERO early summary mutation and retains
   the existing unfenced pre-settlement observation. A rejected/held guard remains
   an observable settlement operation; it never authorizes an early mutation.
   Do not infer a true fence from expiry, arbitrary error names, absent authority,
   a generic failure, or metadata. Any authority-specific expansion beyond this
   existing actual fence evidence would require separate quality clarification.
4. Change the existing catch's `const fullCleanup` at line1554 to an invocation-local
   mutable latch initialized to the SAME current timeout/authorityError/StudentFencedError
   expression. Actual guard `true` sets this latch to `true` BEFORE any early undo
   or further await. It remains true even if the fence subsequently releases.
   Guard false preserves the original ordinary-error retry fact/edge policy;
   unreadable guard never guesses true. After a true fence, call every summary entry's supplied undo independently,
   collecting all outcomes. Each supplied undo itself stably closes the actual
   summary-local candidate insert, materialized CAS, final reads and commit drivers;
   `originalSettlement` fulfillment alone is not a sufficient closure proof.
   If those summary originals have closed, rollback proceeds while facts remain
   held. Mark each attempted early summary in local catch state before calling
   its undo so the later loop does not invoke it again in this catch. No new named
   helper or public callback is needed; a local Set and cleanup promise suffice.
5. Observe the early cleanup promise without replacing it and keep it outside
   raw-original arrays. Only its actual fence-read original is in those arrays;
   no undo/composed settlement enters its own original drain. A held guard or
   rollback cannot delay the original prompt FencedWriterDeadlineError.
6. The existing public timeout remains prompt with the same cause and deadline.
   Its `.settled` joins the early guard/summary cleanup plus the existing stable
   global raw-original/nested settlement drain BEFORE deciding the eventual undo
   policy. Even when early guard/undo rejects, collect that error and continue.
   Only after this join may the eventual loop inspect the latched `fullCleanup`.
   Thus an ordinary original error followed by an actual true early fence cleans
   ALL owned facts/edges after originals close, not only summaries. There is no
   race where the loop reads false before the guard's true result arrives.
   The eventual loop still invalidates every failed owned summary not attempted
   early, INCLUDING unfenced failures under D048, and performs full fact/edge undo
   where currently required. Attempt every required cleanup even if the guard or
   an early undo rejects; aggregate after all attempts. Retain graph's independently
   owned/idempotent cleanup behavior and absorbing invalidation.
7. Aggregate actual guard/cleanup failures with the original execution/authority cause.
   Expected expired/aborted original execution with successful compensation does
   not turn clean `.settled` into a cleanup failure. Held cleanup leaves `.settled`
   pending, and rejected cleanup keeps it rejecting; no observer replaces it.
8. Ordinary valid-authority errors preserve approved retry fact/checkpoint behavior
   while invalidating only the owned summary. Deadline/fence/authority loss keeps
   current full owned compensation. Final commitment remains deferred as in D048.

This removes the unnecessary global fact wait only for actually fenced summaries.
It preserves eventual D048 all-failure invalidation, including the unfenced path,
without generically moving that invalidation before original settlement.

## Exact timing interpretation for independent quality clarification

**Held rollback versus prompt rejection:** if an exact summary rollback driver is
held after the original deadline, physical nine-field S0 restoration cannot finish
before the public FencedWriterDeadlineError and also leave that error prompt. It
is impossible to guarantee both for an arbitrarily held driver. The proposal does
not claim that universal guarantee. Starting undo early during the existing held
fact interval allows closed summary work and an unheld rollback to finish without
waiting for facts. Do not await a held
rollback beyond the original budget, enlarge 20ms/200ms, add a grace timer, claim
invalid metadata equals physical restoration, or silently move the immediate
assertion after `.settled`. For a held rollback/guard, the exact proposed semantics
are prompt original error plus observably pending/rejecting `.settled`, followed
by exact physical restoration once that actual cleanup settles. Independent quality
must affirm this technical timing interpretation within the existing contracts;
it is not an inferred new product/ownership decision or a human gate.

**Existing unfenced immediate-retention control:** the adjacent original control
at `scribe-persistence.test.ts:1446` asserts an unfenced timeout still immediately
has `DEFAULT_SUMMARY` and currently passes. D048's approved protocol says every
failure invalidates the owned summary eventually. The actual positive checks only
before `.settled` and does not await it. Thus a false early fence check does ZERO
early mutation, retains that original immediate observation, and the existing
eventual cleanup still invalidates the failed candidate under D048. This schedules
existing invalidation differently only when the early read actually proves a fence;
it does not narrow the eventual failed-candidate policy. No fixture/oracle change
is included here.

**Exact reached fenced case:** the original test leaves the fact driver held for
60ms, confirms erasure during the semantic deadline postcheck, and observes the
already-rejected original20ms error only after releasing facts. During that same
unchanged interval, actual fence evidence is available, summary originals have
closed, and an unheld supplied summary undo can restore S0 independently. That
specified case must remain physically restored BEFORE its existing pre-settlement
assertion. No extra delay, grace, budget or post-settlement oracle is proposed.

## Independent controls and falsifiers after approval

- Keep the reached fenced original20ms control: actual held fact driver, clean
  semantic postcheck, actual confirmation, typed original deadline error, summary
  text/timestamps/withheld reason absent BEFORE caller awaits `.settled`, exact
  nine-field baseline equality, invalid candidate without payload, zero raw text.
- Add/retain an actually fenced held fact control proving early summary compensation
  progresses independently while the fact is STILL live, with the public original
  error prompt and `.settled` pending. Late fact settlement cannot revive it.
- Hold the summary candidate insert, materialized CAS, or commit response instead:
  public error remains prompt and supplied undo cannot run restoration ahead of
  those originals; the held-summary/rollback settlement semantics above must be
  asserted explicitly, without imposing an impossible synchronous driver guarantee.
- Hold the actual guard `findOne`, prove its exact promise was recorded BEFORE
  await and private recorder is absent from Mongo options; hold/reject it and
  prove no early summary mutation, prompt original error, pending/rejecting
  `.settled`, every later cleanup attempt and unchanged foreign rows. Existing
  default `isStudentFenced` callers must retain outcomes/options and driver counts.
- Cause an ordinary original error, make the early actual guard true while fact
  drivers remain live, then release originals and prove latched full cleanup
  removes owned facts AND edges even if the fence later releases. Pair it with
  guard false: zero early mutation and legitimate retry facts/edges preserved.
  Removing the true-result latch or deciding policy before joining the guard must
  make this control RED. An unreadable guard must not be treated as true evidence.
- Hold the rollback driver itself, assert original prompt budget and pending
  `.settled`, then release and prove exact S0/invalid payload; force its failure and
  prove rejection/all later cleanups attempted with no private text leak.
- Keep same-session A/B both cleanup orders, absent/present/withheld S0, held commit,
  completed C before/after restore, exact foreign bytes, original erasure/regrant,
  committed-A success plus failed-B positive, and real original grant/session guards.
- Preserve the unfenced original pre-settlement retention positive, additionally
  assert false early fence means zero early mutation, then separately await the
  original `.settled` and prove D048 eventual invalidation. Hold/reject the early
  raw fence read to prove prompt original budget, observable original tracking,
  no early writes on unreadable evidence, all later cleanup attempts and no raw
  text disclosure. Do not accept any outcome merely because it is an error.
- Reintroducing the global-before-summary drain must reproduce the actual line1433
  RED. Bypassing summary-local insert/CAS settlement must fail late-resurrection
  controls. Dropping errors or releasing `.settled` early must fail held-original
  and cleanup-failure falsifiers. Do not increase any original caller/test budget.

After clarification and independent PLAN APPROVED plus a new authorizing decision,
apply the approved in-place change, publish source hashes/diff check and freeze for
the root's sole runtime lane. Maker source-ready/types/tests are not checker PASS;
no final review, commit, push or production action is authorized by this proposal.

## D068 proposed finite rejection-writer expiry provenance receipts — 2026-10-14

Status: PROPOSED SOURCE PLAN ONLY. This append preserves all earlier proposal bytes and does not authorize source, test, runtime or acceptance work. Root owns the complete D068 quality decision and official source-authorizing entry. The existing rejection writer's algorithm, error collector, original deadline, ownership selectors, public categories and cleanup order remain unchanged.

### Exact existing edit targets and optional private ABI

Proposed in-place targets are ONLY `packages/db/src/decisions.ts:68` `RecordRejectReasonsOptions` and `packages/db/src/decisions.ts:102` `recordRejectReasons`. The graph owner separately forwards the callback in the EXISTING guarded rejection writer call at `packages/engine/src/scribe/graph.ts:266`, options at `:273-274`, bound to the already captured private invocation owner. No new function, named type, module, source/test file, collection or public schema field is proposed here.

Add the same optional callback shape already coordinated with DB summary/facts and writeApproved owners:

    onExpectedExpiry?: (error: unknown, provenance?: { wrappedCause: unknown }) => void;

Existing callers that omit it retain their behavior. This is an invocation-private synchronous receipt callback; it is never sourced from HTTP, model output, database fields or checkpoints. The callback and provenance metadata must never enter Mongo options. It neither registers an original operation nor changes data authority. Parent forwarding preserves both arguments and their object identities unchanged; forwarding must not synthesize a new witness or infer ownership from the callback's name. The trusted parent receipt sink is bookkeeping only and does not perform DB operations or throw.

### Finite exact emission sites inside recordRejectReasons

1. Existing `ownExpiryFailures` is created at `decisions.ts:116`. The independently observed `originalExpiry` at `:117` races a never-resolving promise against THIS function's existing WriterDeadline. At the exact catch `:118`, after recording the same error in the existing set, emit that same object with NO provenance argument. The later direct observation at `:233-234` refers to that SAME timer object; if forwarded there too, the parent deduplicates by identity. No fresh deadline, extra timer, pending original or settlement composition is created for receipts.
2. At the three syntactically isolated direct `deadline.op()` catches `:150`, `:161` and `:174`, emit without provenance ONLY the exact object those direct calls already add to `ownExpiryFailures`. Those try blocks contain only the direct operation-budget call. Do not extend them around authorization callbacks, raw drivers, postchecks or cleanup. A foreign timeout-looking error thrown by `options.authorize`, `insertOne`, `findOne`, `compensateIfFenced` or undo receives no own-expiry receipt, even if the clock is expired.
3. At `:296`, the existing public FencedWriterDeadlineError is an ACTUALLY locally constructed wrapper. Preserve the identical `settled` promise and identical existing cause expression, materialize that existing construction in a local variable, emit its exact wrapper identity with `{ wrappedCause: actualCause }`, then throw that SAME instance. This second argument proves construction and pins the actual cause reference; it does not assert that the cause is expected or that settlement will fulfill.
4. When `:296`'s existing `primary.length > 1` expression actually constructs its local cause AggregateError, record that SAME constructed aggregate identity before emitting the public wrapper, using `{ wrappedCause: actualAggregate.cause }` (normally undefined). This is finite provenance for the existing aggregate construction; preserve its exact message and primary elements/order, and introduce no aggregator helper or collector rewrite. A parent that requires positive provenance for aggregate containers must not infer the aggregate's ownership merely because an owned FWD points to it. The parent separately traverses every aggregate child; any unexpected child keeps the complete root unexpected.

No other rejection writer error is licensed by this extension. In particular the local final settlement AggregateError at `:293` represents actual failures and must remain a failure; it is not emitted as an expected-expiry leaf. The existing `ownExpiryFailures` filtering at `:248-263`, recursive nested settlement discovery at `:264-291`, exact undo at `:292`, and outcome priority at `:298-301` are unchanged. The optional receipt does not broaden the rejection writer's own classification or repair unrelated error provenance.

### Parent dependency and positive causal proof

The graph/node parent must receive the optional callback directly from its captured trusted invocation call. The rejection leaf's WriterDeadline is a distinct object, although its budget is derived from the parent's original absolute expiry. Leaf timer/op identities become known to the parent only through actual trusted receipts; elapsed time, a fulfilled `settled` promise, class, name, message and stack resemblance never establish ownership.

A parent treats a root as expected only after complete positive proof. A receipt without provenance is an exact witnessed own timer/op object. A receipt with provenance is an exact locally constructed wrapper whose current cause reference still equals its captured `wrappedCause`. Every reachable cause and aggregate child must itself have positive provenance. Foreign FencedWriterDeadlineError, arbitrary AbortError-named errors, raw driver errors, upstream authorization errors, unreceipted wrappers, changed causes or a causal cycle remain unexpected. Shared diamond identities may be deduplicated without being mistaken for an active-path cycle. Wrapper construction receipts never suppress unexpected descendants.

Every reachable FencedWriterDeadlineError.settled is still drained, including an arbitrary foreign FWD's settlement. Discovering that promise uses the class to join settlement only; it never marks the wrapper expected. A held nested settlement prevents completion, and its actual rejection remains visible even when the root has a valid construction receipt. A clean witnessed rejection-writer expiry with successfully settled originals and exact cleanup must remain a clean parent settlement. Arbitrary child/driver/guard failure must cause rejecting parent settlement with its exact identity reachable through the existing fixed failure envelope.

First public error and cause references remain immutable before and after receipt forwarding and every late failure. No new success result, raw error redaction, replacement error, cleanup grace or physical-restoration-before-held-driver promise is introduced. Original 20ms, 200ms and caller/runner budgets remain unchanged wherever used.

### Verification requirements owned by the existing D068 lanes

The graph and DB source owners must include this exact ABI and finite emission contract in the complete proposal before quality approval. Existing affected DB/engine/API types and rejection/per-fact/persistence suites must verify omitted-callback compatibility, exact own timer/op positive receipts, clean child-expiry settlement, same-class/name foreign error negatives, unexpected causal children on a receipted actual wrapper, nested settlement holds/rejections, exact first cause identity and full foreign-state preservation. No new test file is authorized by this appendix. No execution or source edit has been performed by this planner; maker greens and this document are not independent acceptance.
### D068 coordinated container receipt correction — supersedes item 4 above

The graph source owner identified that pinning only the absent `.cause` of a native AggregateError does not pin its actual causal container. Keep the SAME optional callback signature; specialize its second argument by actual locally constructed wrapper kind. For the exact native AggregateError cause constructed at `decisions.ts:296`, emit `{ wrappedCause: actualAggregate.errors }`, using the actual native errors-array reference, not the input `primary` array and not `actualAggregate.cause`. This paragraph supersedes item 4's aggregate `.cause` emission and the generic parent cause-equality wording ONLY for actual aggregate containers.

The parent requires the receipted aggregate's CURRENT native `.errors` array to be identical to the captured `wrappedCause`, then positively validates every contained descendant. Any additionally present aggregate `.cause` is also a descendant and cannot be silently suppressed. For ordinary Error, FencedWriterDeadlineError and PartialApplyError wrappers, `wrappedCause` continues to pin the exact actual `.cause` reference. Thus the public FWD receipt still pins its actual cause aggregate object, while the aggregate's separate construction receipt pins its actual native errors array. Neither receipt asserts that any descendant is expected, and an unreceipted or foreign aggregate remains unexpected. Mutated containers, unproved descendants and active causal cycles fail closed; class/name or eventual clean settlement never grants provenance.

This is a proposed coordinated private ABI semantic refinement, requiring complete-plan independent quality approval before any implementation. It changes no rejection algorithm, primary ordering, original error/cause identity, raw operation registration, exact cleanup selector, deadline or execution budget. The graph, DB and node owners were informed; no claim of their implementation/adoption or runtime proof is made here.
### D068 root-confirmed finite receipt seal — planning approval only

Root approved the SAME-ABI interpretation for planning. Direct own timer/op errors emit no provenance argument; producer-owned ordinary/FWD wrappers emit `{ wrappedCause: actualCause }`; the producer's local AggregateError emits `{ wrappedCause: actualAggregate.errors }`. Parent classification may use the class only to interpret an already positively receipted construction; it never infers provenance from a class.

For the rejection writer's EXACT local `new AggregateError(primary, "recordRejectReasons: timed-out post-check failed")` and EXACT public `new FencedWriterDeadlineError(settled, { cause: actualCause })` construction currently together at `decisions.ts:296`, retain both exact constructed object references, emit the local aggregate receipt when that aggregate is actually created, emit the public FWD receipt with its actual cause, and throw that same FWD instance. The existing own timer sites `:118/:233-234` and isolated direct-op catches `:150/:161/:174` remain the only receipt sites without provenance. There is no other leaf or constructor expansion in this finite plan.

At receipt time the parent snapshots the aggregate's exact native errors-array reference AND an ordered copy of its member identities. Before classifying that aggregate as expected it verifies that the current array reference, length, order and every member identity are unchanged, then positively validates every descendant. This ordered-vector rule tightens and supersedes the array-reference-only wording above. Ordinary/FWD cause references remain equal to the captured cause; aggregate cause presence/value is captured locally at receipt and must also remain unchanged. Distinct errors with the same names/messages remain distinct. No callback field, helper, type, module, schema or source algorithm is added for this rule.

This appendix is now FROZEN for independent complete-plan quality review and official D068 authorization. Planning agreement is not source implementation approval, runtime evidence, checker acceptance or release permission. Earlier artifact bytes and all existing rejection-writer collector/settlement/cleanup semantics remain preserved.
### D068 optional receipt-observer fault correction — supersedes nonthrow assumption

Independent final plan quality BLOCKED the BB390 seal because the optional exported recorder can throw, particularly inside the fire-and-observe timer catch at `decisions.ts:118`. Root requires this finite correction. This appendix supersedes the earlier trusted-sink nonthrow assumption and the collector-unchanged wording ONLY to retain actual recorder failures. The SAME optional ABI, finite emission sites, original writer/cleanup behavior, ownership and timing remain unchanged.

Inside the EXISTING `recordRejectReasons` function at `decisions.ts:102`, add a local ordered recorder-failure ledger with identity deduplication. Every proposed `options.onExpectedExpiry` invocation at the own timer observer `:118`, any optional repeat of that same witnessed timer at `:233-234`, the isolated op catches `:150/:161/:174`, and both exact local cause-aggregate/public-FWD constructions at `:296` is protected by its own synchronous try/catch. A receiver exception is appended by exact identity to this ledger and is NEVER added to `ownExpiryFailures`, emitted as an expected witness, substituted for the error being witnessed, or recursively sent back into the recorder. No new helper function or named type is needed.

For the timer emission, the existing `void originalExpiry.catch(...)` callback records the actual own timer identity first, catches any synchronous recorder exception internally, records the exception, and returns normally. Its catch promise therefore cannot acquire an unobserved rejection from a recorder exception. Do not replace the independently observed `originalExpiry` with a new race or synthetic raw operation. At isolated direct-op catches, retain the original caught op identity in the existing witness set, attempt the optional recorder within the protected call, retain any observer exception, and rethrow the ORIGINAL op error. At wrapper construction sites, retain the actual cause/container references and ordered vector, protect the recorder calls, then throw the SAME already-constructed public FWD regardless of a recorder fault. The first public error/cause and the primary causal vector are not changed by observer faults.

The existing timeout settlement `:237` still first drains actual `work` at `:241-243` and every dynamic `originalOperations` batch at `:244-247`. After the existing original classification `:248-263`, before nested discovery at `:264-291`, copy every not-yet-included recorder-failure identity into the existing unexpected `errors` list and discovery seeds. These errors remain unexpected even if their class/name/cause resembles an own expiry, their identity equals an otherwise expected witnessed error, or the clock is expired. Preserve stable phase ordering: current immediate/postcheck failures, actual unexpected original failures, recorder failures in emission order, then newly discovered nested/cleanup failures. Identity deduplication preserves different errors with identical messages and never removes the actual observer failure merely because it resembles another category.

Recorder failure discovery participates in the existing nested-settlement fixed point. If a recorder throws an arbitrary FWD or aggregate/cause chain containing one, join every actual reachable nested settlement and retain actual nested rejection identities, while continuing every required exact cleanup. Re-read any newly appended recorder-failure entries after nested-drain iterations and after the existing final undo, adding them to the same unexpected/discovery queues until stable. No observer exception permits a skipped original drain, detached cleanup, early public settlement, foreign deletion or an enlarged deadline. The local settlement composition itself is NEVER awaited as its own nested dependency: if a recorder throws the exact just-produced public FWD or another FWD referring to THIS composed `settled` promise, retain that error as unexpected but exclude that exact self-promise from nested joins. This guards an actual optional-callback dependency cycle without changing arbitrary foreign nested-settlement holds.

After all actual originals, reachable nonself nested settlements and exact undo attempts settle, the existing fixed AggregateError envelope at `:293` rejects whenever the recorder-failure ledger is nonempty, preserving the observer errors and every cleanup failure by exact identity. The envelope message remains `recordRejectReasons: timed-out writer settlement failed`. The public wrapper constructed at `:296` keeps its original captured cause unchanged before/after settlement. The ordinary no-timeout outcome priorities `:298-301` are unchanged; original execution failure never becomes a successful result. A clean own expiry with omitted/nonthrowing callback and successful original/cleanup settlement retains the existing fulfilled settlement behavior.

No recorder failure is registered as an original promise, no callback invocation is a raw driver, and no composition is inserted into the original-operation list. Promise rejections returned by a receiver are outside the void synchronous callback contract; this finite plan introduces no asynchronous recorder operation. This correction adds only recorder-fault accounting to the existing source function and optional options field; it does not rewrite rejection-writer work, authority, duplicate replay, owned undo, the original deadline or the existing error classification algorithm.

Existing `decisions.test.ts` controls are owned by the separate ninth D068 test-plan lane: exact synchronous observer sentinel at real own timer, isolated direct op and actual public/cause-container receipt boundaries; a held real original proves no early settlement; every cleanup still runs; observer and cleanup failures retain exact identities; first public cause remains unchanged; complete foreign bytes survive; no unhandled timer-observer rejection; omitted/nonthrowing callback clean-expiry positives remain. Include throwing the received exact public wrapper to falsify a self-settlement join. No source/test/runtime has been performed by this planner. This corrected appendix is FROZEN for complete final quality and official D068 authorization.