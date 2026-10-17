# T052 cycle2 initial graph closure — PROPOSED, not implementation approval

This is a minimal source repair proposal against the terminal maker core run in
`qa/evidence/t052-maker-cycle2/affected-initial-core.log`. That run ended with
`runtime_exit=1`, `mutex_present=False`, at `2026-10-13T20:27:33.2926385Z`.
The three source issues below are evidenced by reached assertions and existing code.
No product source, test, runtime, deadline or contract has been changed for this proposal.
Fresh independent quality approval and the root's implementation authorization are required.

Frozen source:

- `packages/engine/src/scribe/graph.ts`: SHA256 `5B3385608B0F3A484AF50079174D76BF7D8C4FC26306DC0C620ADE9F136368F5`.
- `packages/engine/src/scribe/nodes.ts`: SHA256 `C66F07E41AF56BCD4BE4BA547061CFC0BDC9D37022190A8F3311C6EAB5030BD7`.

## Scope and unchanged boundaries

Only the three existing `graph.ts` functions named below require source edits.
`nodes.ts` remains owned but requires no change for these closures. No new helper,
product file, callback, authority field, collection or algorithm is proposed.
Preserve peer source/tests, the original WriterDeadline and signal, all raw-driver
registration before await, stable allSettled drains, observable nested settlement
failures, precise claim/token cleanup and foreign-owner preservation.

This explicitly excludes the withdrawn ownerless extraction-recorder proposal and
any weakening of `compileScribeGraph`'s private checkpoint owner guard. Existing
adapter and mutation binding guards remain strict. Separate test owners handle
authorized cancellation routing, manual consent fixture metadata and assertions
about the new ledger or nested errors. These are not implementation work in this plan.

## 1. Nondeadline AbortError must retain its lease

**Existing location:** `packages/engine/src/scribe/graph.ts`, `underLease`, lines
1253–1268 and 1327–1336.

**Actual evidence:** `b18-suppression-outcome.test.ts:841`, “T-045 AbortError with
late work retains lease and starts no cleanup”, reached line854. Actual cleanup
count was 1; expected 0. The catch sets `release=false` for AbortError at line1261,
but the ordinary failed-invocation cleanup branch at line1327 ignores that flag
and unsets the lease at line1330.

**Minimal in-place change:** require `release` in the existing ordinary failure
lease-cleanup condition:

```ts
if (release && failure && owner && !owner.authorityLost && owner.invokeSettled && owner.claimAuthority) {
```

An ordinary error with closed originals still performs its current exact owned
retry-lease cleanup. A nondeadline AbortError reaches the existing failure throw
without releasing its lease; expiry/recovery remains responsible for that lease.
Do not use a rejected invocation promise alone as proof that detached original
work is closed. Preserve the D047 branch for an actual FencedWriterDeadlineError
or `deadline.signal.aborted && exact AbortError`: prompt deadline error with
original cause, composed `.settled`, all original work/raw drivers drained before
exact owned cleanup. Do not release a lease while any tracked original remains live.

**Independent controls and falsifiers:** keep the existing AbortError zero-cleanup
and retained-token assertions; assert the original AbortError remains the rejection.
Keep ordinary-error exact lease-release and foreign-token controls. Keep D045/D047
held actual driver controls: public deadline remains prompt, `.settled` remains
pending and lease remains owned while driver is held, then only exact own lease is
removed after successful cleanup. Removing `release` must reproduce the reached
cleanup-count RED; do not extend any timeout to hide it.

## 2. Preserve one safe typed settlement failure

**Existing location:** `packages/engine/src/scribe/graph.ts`, `resumeUnderDeadline`,
outer catch and composed settlement, lines1764–1787, specifically line1784.

**Actual evidence:** the three “T-045 late claim … is observable and ownership
bounded” controls at `b18-suppression-outcome.test.ts:929` reached their settlement
assertion. Actual was an outer `AggregateError: Scribe admission original settlement
failed.` from graph line1784, while the inner late claim settlement supplies the
fixed, text-free `ProviderAuthorizationRefusedError`. This wrapper changes the
observable typed failure even when there is only one safe settlement rejection.

**Minimal in-place change:** after the existing full stable raw-driver/nested
settlement drain, rethrow the sole failure unchanged only when
`failures.length === 1 && failures[0] instanceof ProviderAuthorizationRefusedError`.
Use the actual class, not an error-name string or arbitrary message. Retain the
existing AggregateError for every other nonempty failure set, including multiple
failures, nested aggregates, unsafe arbitrary errors and combined cleanup failures.
Do not flatten errors, discard duplicates, copy private driver messages, suppress
cleanup failures or fulfill `.settled` on any failed required cleanup. The public
FencedWriterDeadlineError's original `cause` remains unchanged.

**Independent controls and falsifiers:** keep actual late insert/acquisition
settlement tests and their original class/privacy/owned-row/foreign-byte assertions.
A held original must still keep `.settled` pending. A sole inner safe refusal must
remain that exact failure and reject; a clean settled original with successful
cleanup must fulfill despite expected execution expiry/abort. Add or retain a
multiple-required-cleanup-failure control proving all attempts occur and all errors
remain observable in an AggregateError, with the original deadline cause retained.
Retain private marker non-disclosure checks. Replacing the narrow branch with the
current unconditional aggregate must restore the typed-failure RED; returning
success instead must fail the rejection/residue controls.

## 3. Refused and guard-only no-consent paths must not read personal sessions

**Existing location:** `packages/engine/src/scribe/graph.ts`, `startScribe`, the
no-consent/original-null-grant branch, lines956–966.

**Actual evidence:** “T047 no-consent processing never enters graph, checkpoints,
tracing or personal collections” at `crisis-escalation.test.ts:830` reached line847.
All graph/checkpoint/tracing counts were 0; actual personal collection accesses
were exactly `['sessions', 'sessions']`, expected `[]`. Those accesses are the
new initial and final personal session reads at graph lines957 and963.

**Minimal in-place change:** remove those two session reads and their dependent
session identity comparisons from this branch only. Keep the final original grant
comparison exactly `isDeepStrictEqual(finalGrant, originalGrant)` and refusal on
any difference. In particular an original `null` grant must remain `null`: a newly
issued grant cannot authorize this old attempt. Keep the initial grant capture,
consent check, pre-branch fence checks, deterministic crisis processing, guard-only
escalation budget, post-guard fence read, final grant read and final `deadline.op()`
immediately before synchronous refused/minimal guard-only publication.

This branch returns no personal session/checkpoint payload and begins no session
writer, so session-row lookup is not its authority. This closure reconciles T047's
zero-personal-access gate with D040's original-authority requirement using the
captured original grant and current fence for this minimal outcome only. Exact
session-generation/creationAttempt authority on every consented personal path,
summary/leaf mutation, materialized publication and lease boundary is unchanged.

**Independent controls and falsifiers:** keep ordinary refused and crisis guard-only
privacy spies asserting zero personal collection access, graph invocation,
checkpoint reads, traces, classifier review and scribe provider calls. Keep actual
minimal crisis notifications and no-personal-row erasure/export controls. Hold the
guard's final boundary and issue a grant while the original grant is null: the old
attempt must refuse, then a fresh invocation with its own valid grant may run.
Change/revoke a captured non-null refused grant and assert no stale publication.
Fence before start or during guard execution must return fenced/retain required
guard cleanup without personal work. Keep shortened original deadline controls
(including 200ms); neither the guard budget nor final publication gets renewed.
Restoring either sessions read must make the original zero-access spy RED.

## Verification handoff

After independent plan approval, implement only these existing branches, report
exact source SHA256s and `git diff --check`, then freeze. The root owns the sole
runtime lane and source resnapshot. Independent checks must run the affected
controls and the approved broader matrix against that exact final snapshot;
typechecking or maker GREEN is not a feature/checker PASS. No commit or push is
authorized by this proposal.

## Additional BUILDING proposal: nested graph binding loss must invalidate its owning invocation

This appended section is a NEW PROPOSAL requiring fresh independent quality
approval and an authorizing decision before implementation. It does not alter
the already implemented D051 three-branch closure or certify any feature verdict.
No source, test or runtime edit is made by appending this diagnosis.

**Frozen identity and actual failure:** current `graph.ts` SHA256 is
`2BC9CE281101B1EB5A122EA97EAE7FA6794215BAD86BE6B4CA60FC1B3222E91B`.
The exact current per-fact test SHA256 is
`864F30899A0631A08E90C55ED2A31CA9424882837C13989A15B0A5C94576328F`.
Sealed `d054-importer-failed-touched2.log` ended `runtime_exit=1`, mutex absent,
at `2026-10-13T21:48:22.8533242Z`. It records 173 tests, 127 passes, one failure,
zero cancelled and 45 declared skips. The preserved final raw-claim equality
at `scribe-per-fact.test.ts:789` actually reached and failed: a durable claim
for `t046-exact-graph` remained, expected the original empty claim array.

**Reached path:** the existing T046 nested-graph control redirects the original
compiled graph's invoke into a separately compiled second graph sharing DB,
student, thread and saver. The second approval node reaches the strict private
binding guard at `graph.ts:223–226`, rejects with the exact fixed
ProviderAuthorizationRefusedError, dispatches no provider or personal mutation,
and leaves complete original checkpoint/private bytes unchanged. The outer
`resumeUnderDeadline` had legitimately inserted its own captured claim before
invocation (`graph.ts:1668–1740`) and provided that winner's immutable actor/time,
response, student and tenant metadata to the private approval scope at line1753.

**Actual source fault:** the second graph's binding refusal at line226 throws
without latching `owner.authorityLost`. Original grant/session/claim remain valid,
so `invokeFenceAware`'s final owner authorization succeeds and its ordinary-error
branch (`graph.ts:885–890`) uses summary-only compensation. `underLease` then
performs ordinary retry-lease release (`graph.ts:1325–1334`), preserving the
new claim. That is appropriate for an ordinary error on the original authorized
graph, but wrong after exact compiled-graph authority was refused.

**Smallest in-place source closure:** change ONLY the existing approval node's
strict binding refusal branch in `buildScribeGraph`, `SCRIBE_NODES.approval`,
`packages/engine/src/scribe/graph.ts:223–226`. Keep every predicate unchanged.
Inside that existing failed predicate branch, synchronously latch
`owner.authorityLost = true` when the private owner exists, then throw the SAME
fixed ProviderAuthorizationRefusedError. An absent owner still refuses and gains
no cleanup/adoption capability. No schema, field, helper, broad exception policy
or new claim API is needed. An inline branch can retain the existing throw seam
at line226, but exact line-number pinning must never replace semantic verification.

This marks loss of the actual invocation's compiled-graph binding, not a fresh
student/session/grant permission. The existing `owner.authorize` begins by
refusing the latch (`graph.ts:731`), so existing `invokeFenceAware` switches to
full owned compensation after all original work/raw drivers settle. Its existing
claim delete (`graph.ts:794–796`) selects the captured `_id`, student, responseHash,
claimedAt and original lease token (or only the proven own intentional released
lease case). It neither deletes by arbitrary thread/student nor rewrites a
replacement claim. No new deletion or owner adoption is introduced.

**Important preservation rules:** do not classify every thrown
ProviderAuthorizationRefusedError as global authority loss, and do not delete
ordinary legitimate retry claims. The latch is at this exact private-binding
failure. Original proposal/source/actor/time/tenant metadata is never adopted by
the nested graph, recalculated or restamped. Existing grant/session/lease identity,
raw-original stable drains, pending deadline `.settled`, all cleanup attempts,
absorbing summary invalidation, full foreign B/C bytes and fixed original budgets
remain unchanged. A preexisting recovery claim is still preserved; existing full
compensation releases only its exact acquired own lease after originals close.

**Independent controls and falsifiers:**

- Keep the exact nested T046 control's fixed refusal class/message, actual private
  approval-boundary reach, one redirected invoke, zero provider/new personal
  mutation, complete personal rows and checkpoint/private snapshot equality,
  and final raw claims equal to the captured original empty array. Do not weaken
  final equality or exempt the durable claim from the oracle.
- Remove only the new private loss latch: the current exact final raw-claim RED
  must return, proving this repair's causal boundary.
- Restore the original graph after refusal and retry through its actual authorized
  wrapper. It must create its own fresh claim, write the accepted proposal and
  preserve authenticated original actor/time/source semantics. Concurrent actual
  original graphs and serialized forged-config refusal controls remain unchanged.
- Ordinary simulated crash on the ORIGINAL bound graph retains its captured
  legitimate claim and releases only its own retry lease; null recovery uses the
  winner's original metadata. This falsifies accidentally broad generic-error
  deletion or global reclassification.
- Replace the own claim/token with a foreign same-key owner during held refusal
  cleanup: preserve the complete replacement bytes and unrelated tenant/student
  claims. Exact token/responseHash/claimedAt CAS must be reached; broad deletion
  must fail. A preexisting claim recovery failure preserves that claim and cleans
  only its own acquired lease.
- Pin the held-cleanup timing probe to a genuinely expired ORIGINAL invocation:
  hold an actual registered original until its FencedWriterDeadlineError has
  ALREADY returned, then hold its late exact claim-cleanup driver. The exposed
  `.settled` remains pending until that actual cleanup releases and rejects visibly
  on required cleanup failure, while every other owned cleanup is attempted.
  Separately, an ordinary nonexpired binding refusal awaits complete owned cleanup
  and then preserves the same typed refusal (or original-plus-cleanup aggregation
  when cleanup fails). The current non-timedOut `invokeFenceAware` path directly
  awaits compensation at line879; this one-branch latch repair does NOT introduce
  a universal prompt deadline guarantee for cleanup started before expiry. Such a
  new race would require separately concrete source scope and approval. No alive
  original is overlapped by lease release; no new deadline, grace, fabricated
  authority or provider dispatch is permitted.

Root owns final source resnapshot/runtime after quality approval and an authorizing
decision. This proposal is BUILDING diagnosis, not an intermediate checker or
source verdict; no commit, push or PASS is claimed.

## D057 completed-source-review BUILDING repair proposal — not approved

This appended proposal preserves all prior approved text. Product source remains
frozen at graph SHA256 `4EC6BFE68A979F2548C1D7DDCF17AC3E3567B5138A153BC33AA8F57201C5188E`.
The root identified three concrete completed-source-review BLOCKs. This is maker
diagnosis and proposed scope, not an intermediate acceptance check or verdict.
No source, test, runtime, helper/module, schema, vendor or provider change has
been made. Fresh whole-plan quality approval and an authorizing decision precede
implementation; inspection explicitly needs added scope beyond original D040.

### A. Concern upsert attempted ownership must precede its receipt

**Existing functions/lines:** `recordSessionConcerns`, graph.ts1121–1147;
existing private `checkpointInvocation` owner `cleanup`/`pending`; existing full
compensation loop graph.ts793 and concern token deletion graph.ts813–818.

The current upsert awaits `edges.updateOne` at line1144, then adds `_id` to
`createdSink` only after a successful inserted receipt at line1145. A real upsert
issued before authority loss can apply after purge/regrant and reject its receipt;
the owned edge then never enters acknowledged IDs and survives compensation.

**Smallest proposed existing-function closure:** use the existing private owner
in `recordSessionConcerns`, refusing an unavailable/mismatched private owner before
dispatch. Before starting each actual upsert, register an anonymous exact-owned
undo on that owner's EXISTING cleanup list selecting `{_id, writerToken:
options.writerToken}`. Then start the original updateOne, push its ACTUAL promise
into the same owner's pending list before await, and await its receipt. Keep the
line1145 successful-upsert `createdSink` condition unchanged. Keep the returned
detected ConcernRecord array and acknowledged-created-ID meaning unchanged.
This registers attempted cleanup ownership independently without a new sink,
schema field, collection, named helper or broadened acknowledged return.

The current stable original drain runs before full cleanup, so late applied/rejected
receipt is closed before exact token deletion. An acknowledged insert may be
visited by the existing concern ID cleanup too; both are idempotent exact-token
deletes, not adoption of a preexisting edge. A matched prior row or foreign/recreated
winner does not have this invocation's token and is preserved. Ordinary valid
authority failure keeps its existing concern/retry policy; authority loss/deadline
uses all full owned cleanup attempts with observable errors.

**Independent controls/falsifiers:** existing persistence test owner will use an
actual concern-level graph start and actual edge upsert. Hold issued raw mutation,
perform real erasure/purge/release/regrant and create a genuine fresh winner, then
allow the old actual upsert to apply and reject its receipt. Require zero old-token
edge and complete foreign/recreated raw bytes. Pair ordinary successful receipt,
matched-existing-edge, exact foreign-token replacement, held original/prompt
deadline `.settled`, and failing exact cleanup with all other attempts controls.
Removing only attempted undo registration must restore applied/rejected residue.
Adding attempted IDs to public/acknowledged results or broad deleting an edge must
fail acknowledged-return/foreign-byte controls.

### B. Late actual successful lease-unset receipt must retain release evidence

**Existing function/lines:** `releaseLease`, graph.ts1221–1245; late success at
line1237; existing full claim selector graph.ts794–796 and preexisting recovery
lease cleanup graph.ts820–825.

The raw exact `$unset` may apply with matchedCount1 while its SUCCESS receipt is
held past the original deadline. Its late success continuation currently ignores
the receipt and never sets `owner.leaseReleased`; compensation then requires the
old token and misses the now-unleased newly owned claim.

**Minimal candidate closure:** change only the existing late SUCCESS continuation
to inspect its ACTUAL receipt. Set `owner.leaseReleased=true` only when actual
`matchedCount === 1`, before existing authority-loss compensation. A zero-match
receipt never proves intentional release; a rejected receipt never invents success
or adopts absent-lease ownership. Retain the original exact mutation, registered
raw promise, deadline/cause, observer and compensation machinery. No broad absent
lease deletion or unqualified student/thread selector is proposed. A preexisting
recovery claim is still never deleted; only its exact acquired lease is cleaned.

**Foreign ownership assessment requiring closure before approval:** this flag
proves the original exact release mutation succeeded, not continuous exclusivity
until its receipt arrived. A currently reacquired foreign lease is protected by
the existing absent-lease selector. A replacement claim with changed `_id`/student/
responseHash/claimedAt is protected by those captured fields. However, if a genuine
foreign recovery reacquires AND later releases the SAME durable claim, its lease
is absent again while captured fields remain identical. Receipt matchedCount1 alone
cannot distinguish that completed handoff from the original release. This ABA
case must be independently reached or proven unreachable before claiming safety.
No durable marker, new schema field, borrowed identity or universal absent-lease
ownership is silently added by this candidate proposal.

The ordinary latest-thread null recovery that captures pending state before original
completion is guarded by `currentAuthority(latest,true)` requiring the same current
checkpoint at graph.ts1641; original completion advances it and can refuse recovery
before a new execution. Thus that schedule alone is NOT proof of foreign completion.
An earlier suggested historical `checkpointId` acquisition route is WITHDRAWN:
the current `resumeUnderDeadline` stateConfig ignores opts.checkpointId for its
initial and requireOriginalCheckpoint getState, so it does not pin that earlier
capture. Only later graph invocation consumes opts.checkpointId. Do not cite that
route as proof. The persistence planner will separately assess a real fresh start
on the same public thread/session after the original unset, followed by genuine
null recovery against that actual new checkpoint; original claim decision and
approval metadata checks must still pass. A genuine acquired-lease execution and
its own final release must actually complete before the old held receipt returns.
Do not seed completion, invent a foreign handoff, or treat still-leased replacement
as the complete ABA case. If no actual schedule reaches completion, report the
precise existing continuity gate that prevents it rather than inventing proof.
If that actual completion is reachable and the flag-only selector deletes its raw
claim, this candidate is INSUFFICIENT and needs a separately concrete ownership
continuity proposal/whole approval. Do not weaken the foreign-completion oracle.

**Independent controls/falsifiers:** actual owned unset then held successful
matchedCount1 receipt beyond unchanged500ms -> prompt original deadline, pending
`.settled`, then zero invalid newly owned claim after successful cleanup. Pair
actual matched0 (selector replacement), actual rejected receipt, foreign currently
reacquired token, actual foreign reacquired-and-completed same claim, unrelated
tenant/student bytes, preexisting recovery claim preservation, cleanup failure,
and ordinary completion. Removing only late matched1 capture must restore own
unleased residue. Any non-matched1 receipt setting the flag or absent-lease-only
delete must fail negative ownership controls. Held cleanup timing is tested after
a genuinely expired original FWD has already returned; no new preexpiry cleanup
deadline promise is inferred.

### C. Inspection must capture original read authority before materialization

**Explicit new authorizing scope:** existing `inspectScribe`, graph.ts1867–1934,
and its existing read-only request/result assembly. Original D040 did not name
this function. `apps/api/src/server.ts` pre-requires session before invoking it;
the source proposal changes ONLY this existing graph function, not API roles,
routes or access rules. A new decision must explicitly authorize inspection's
original read-authority scope before editing.

The current first `graph.getState` at line1878 materializes checkpoint bytes before
grant/session capture. Later current-only `deps.authorize` calls at lines1902/1915
can accept a reissued grant after actual erase/regrant, especially completed edited
decisions and empty-approved-history pending payloads. API's earlier requireSession
does not bind the engine's final asynchronous disclosure.

**Proposed input/output contract:** preserve current signature, union, ordinary
not_found/fenced/in_progress/done/request shapes, tenant binding and read-only
behavior. Before the first materialized snapshot, read the recorded session through
the existing thread association, then capture its original student/session identity
and original grant. Copy `_id`, studentId, sessionId, generation/creationAttempt
including own-field presence/legacy absence, grant `_id`/incarnation including
legacy absence and valid purpose/guardian scope; never replace those captured
values after an await. Original missing session gives not_found with no personal
checkpoint payload. Original null/missing or invalid grant cannot borrow a newly
issued one for personal request/result publication. Current erasure fence still
takes precedence and discloses only fenced.

Keep legacy recorded sessions without D048 proof/root or generation fields readable
under unchanged captured legacy absence and valid original grant. Do not call
ensure/admission, create proof, acquire lease, adopt a row, write a marker, initiate
migration or apply the new-write HOLD to ordinary legacy read/export. Current
minimal guard-only/refused results remain minimal; no new grant execution is
authorized and no personal decision edits may be disclosed through that bypass.

Within this SAME function's existing reading IIFE, build a local inspection value
instead of returning sensitive request/done branches before the common final
boundary. Require materialized latest student/session and parsed request identity
to match the captured recorded session. Keep pending approved-history freshness
authorization through existing `deps.authorize` with its D047 original-operation
recorder. After all snapshot/claim/history/result parsing awaits, reread original
session by its captured `_id`+student, exact original grant and actual fence, checking
identity/field presence/thread association/purpose/guardian and original null state.
After all awaited current-history work, perform the final exact original authority
checks and signal/deadline check before synchronous public return. Completed edited
decisions need original scope even though they do not require pending profile equality.
No new named authorization helper is proposed; use the existing function/IIFE and
in-place final assembly. Safe nonpersonal not_found/fenced/in_progress branches
must not carry any student payload.

**Original operations/error behavior:** create a private inspection-local pending
raw array. Record actual session/grant/claim findOne and graph.getState promises
before their deadline/cancellation await. Use D055 actual-fence-driver recorder;
keep enclosing reading/authorization/composed-settlement chains OUTSIDE raw pending.
Forward the existing approved-context original recorder to close actual held profile
work. Never use a new deadline for these reads. On original FWD, preserve cause and
compose `.settled` to observe the original reading plus stable raw/nested settlement;
no write/undo occurs. Expected execution expiry with closed reads is not a fake
cleanup error; unexpected required original read/settlement failure remains observable.
Keep caller cancellation's existing AbortError/no-disclosure behavior, stop further
dispatch at signal checks, and observe every late raw read without unhandled rejection.
No late returned value may bypass original identity checks. Any additive cancellation
error-contract requirement must be stated and reviewed, not inferred as a new schema.

**Independent controls/falsifiers:** inspector planner owns existing b18 and API
test modules. Hold an actual materialized inspection getState AFTER initial original
capture for (a) empty-history pending approval and (b) completed counsellor-edited
decision; actual erase/confirm/purge/release + byte-identical public consent with new
UUID + genuine fresh start/approval creates a winner. Old inspection must exact-refuse
and disclose no old edited values/request; fresh inspection succeeds. Exercise the
actual cached graph used by API pre-requireSession and prove its earlier check cannot
substitute for engine final scope. Compare all raw storage/checkpoint/claim/ledger
bytes before/after inspect: zero mutations. Include legacy recorded absent-proof read,
ordinary not_found/fenced/in_progress, no-consent minimal, same-thread/student across
tenants, foreign unrelated bytes, held raw grant/session/profile/fence/getState with
original shortened deadline/caller cancellation and observable raw settlement.
Removing initial capture/final exact recheck must restore erase/regrant disclosure;
writing proof/HOLD/lease during legacy inspect or adopting current grant must fail
positive read-only and zero-storage-mutation controls.

**Final-read timing limit requiring technical quality clarification:** a read
materializes authority at its actual driver operation. If a test holds the receipt
of the TRULY last authority read and a complete erase/regrant/release occurs before
that receipt returns, repeated ordinary reads cannot universally prove continuity
after that last read; adding a later authority read changes which read is last.
This proposal requires rechecking after held materialized checkpoint and earlier
authority responses, without falsely promising an impossible universal last-I/O
publication guarantee. The inspector planner's last-session/grant response-hold
addition must pin an actual reached read seam followed by the approved final scope
checks, or quality must state a concrete additional atomic/serialization contract
and authorize its exact existing targets. No such new lock, transaction, schema
marker, recursive verification, or timing grace is silently proposed here.

### Approval and ownership handoff

Coordinate existing persistence owner `/root/t052_tests_builder_cycle2` for A/B and
inspector/API test planner `/root/t052_importer_compat_plan` for C. Source and tests
remain disjoint; runtime stays root-owned. The lease ABA continuity boundary is
explicitly unresolved until its actual schedule is reviewed/tested; this proposal
does not silently approve the matched1-only candidate or invent a durable receipt.
Fresh whole-plan quality approval must resolve that boundary and explicitly add
inspection scope; root then appends the authorizing decision before source edits.
No helper/module/file, schema/provenance field, broad cleanup, runtime or PASS is
authorized by this proposal.

## D057 technical addendum: durable lease ownership and bounded two-phase inspection

This APPEND-ONLY proposal preserves all prior approved text. It supersedes only
the earlier unapproved flag-only lease candidate and one-materialization inspection
ordering. It is NOT source authorization. Root explicitly requested the concrete
durable provenance option, with new whole-plan approval and a new authorizing
decision before any source changes. Clear concern repair A remains separately
reviewable; its exact private binding checks are owner present, identical DB
object, original student and session. The concern writer UUID is distinct from
`owner.token`; do NOT equate them or adopt it from model/configuration fields.

### Durable latest lease holder protocol (recommended B closure)

**Why flag-only/checkpoint consistency is insufficient:** independent explorer
`/root/d058_lease_aba_analysis` established actual source-reachable foreign handoffs.
Normal A reject completes C1, its exact physical lease unset succeeds, and its
successful receipt remains held. A real B `startScribe` on the same thread can
create current pending C2; B null recovery acquires the SAME Q under actual current
checkpoint checks, successfully returns awaiting_approval and unsets B's lease.
An actual DONE route also exists: B start uses a genuine retained predecision
checkpoint C0 via existing `checkpointId`, creates fresh current C2 without a
decision, and B null recovery WITHOUT checkpointId acquires/rechecks current C2,
applies the durable Q rejection and completes/releases. Rejection is proposal-
independent, so winning decision verification passes without fabricated metadata.
A late matched1-only compensation then deletes completed foreign Q when lease is
absent. Resume-only mismatch rejection does not stop B start. Therefore do NOT
change supported checkpoint API semantics as a substitute for ownership proof.

**Exact new private field, deliberately proposed:** extend existing
`packages/db/src/collections.ts::ScribeResolutionDoc` at209–229 with optional
`leaseOwnershipToken?: string`. It is the UUIDv4 token of the latest actual lease
holder, written only by existing engine claim mutations. It is permanent latest-
holder provenance across lease unset, not a new authorization grant, user input,
actor, decision, response, timestamp, or schema-version marker. Existing public
Zod schemas and request/model/checkpoint payloads do NOT gain the field.

**Existing-function mutations/selectors:**

- `graph.ts::resumeUnderDeadline`, new claim construction at1682–1694: mint the
  existing lease ONCE, use it unchanged as `lease`, and write
  `leaseOwnershipToken: lease.token` in that SAME original claim insert. No second
  UUID, follow-up restamp or new helper. Original responseHash, claimedAt,
  authenticated approvalMetadata, tenant/student/thread and decision remain exact.
- The existing recovery acquisition at1579–1584 atomically sets BOTH the freshly
  minted lease and `leaseOwnershipToken: lease.token` in its existing selector-
  qualified findOneAndUpdate. Only an actual successful CAS establishes B ownership;
  no pre-read adoption or write to an unacquired row. Preserve absent/expired lease
  acquisition and current-checkpoint verification. A failed/zero-match acquisition
  makes no provenance change.
- `invokeFenceAware` owner authorization at753–757: require the captured own
  `leaseToken` equals the durable marker as well as all original claim identity.
  Before release require that lease token; after proved own release require lease
  absent AND marker equal to the captured token. Never refresh captured authority
  from a later holder. A foreign marker refuses even if its lease is absent.
- `releaseLease` exact original update selector at1224–1228 additionally requires
  `leaseOwnershipToken: token`. Its mutation still ONLY unsets `lease`; retain
  latest-holder provenance. Keep normal actual matched1 flag assignment. In the
  existing late SUCCESS continuation at1237 set `owner.leaseReleased=true` ONLY
  for actual matchedCount1, then run existing authority-loss compensation. Rejected
  or zero-match receipts do not prove release or adopt absence.
- `invokeFenceAware` full own-created claim delete at794–796: require captured
  latest-holder marker equal to original captured lease token, in BOTH still-
  leased and proved-own-unleased alternatives, along with captured `_id`, thread,
  student, responseHash and claimedAt. Released alternative requires lease absent;
  unreleased alternative requires original lease.token. Foreign B marker prevents
  old A deletion after B completes/unsets. Do not delete a preexisting recovery
  claim. Do not invent a marker for an ambiguous rejected release receipt.
- Existing token-qualified lease cleanup in `invokeFenceAware`, `underLease`,
  and `resumeUnderDeadline` late acquisition/insert cleanup gets the SAME durable
  marker equality where it operates on a successfully created/acquired own lease.
  Cleanup unsets only lease and RETAINS latest-holder marker. All existing raw
  registration, actual original settlement, late FWD cause and all cleanup errors
  remain observable. No new callback or helper chain enters its own pending array.
- `recoverUnder`/CreatedByCall captures continue using the actual winning lease
  token and original claim identity; no later marker read is an adoption. Actual
  acquired return must show the expected own token/marker; missing/mismatched new
  provenance on a path that should have stamped it refuses before execution.

**Legacy/preexisting full raw compatibility, explicitly reconciled:** completed
legacy rows with no marker remain readable/exportable and ordinary alreadyResolved
historical replays retain their current public outcomes; do NOT migrate/stamp them
merely by inspection/read/export. A genuine successful recovery acquisition on
an absent/expired legacy lease is an authorized new private provenance delta:
its actual CAS writes the new B marker along with B lease. After B success OR B
failure cleanup, markerB remains. Do NOT delete it or restore markerA/S0 as a
blanket rollback; either would recreate the ABA gap. Preexisting claim public
identity/decision/response/actor/source/time remains unchanged, and failed recovery
still preserves that claim. Full raw tests must compare an explicitly constructed
expected row with the ACTUAL observed B acquisition token, all original fields,
and exactly the authorized lease/provenance delta. They must not strip marker keys,
filter comparisons, invent a token or seed handoff completion. Foreign rows and
foreign complete winner snapshots remain byte-for-byte unchanged by old A cleanup.

**Schema/index/export/importer scope:**

- Existing `collections.ts::ScribeResolutionDoc` optional private interface only;
  no public schema additions, no new collection, no new validation helper/module.
  Real engine tokens come from existing UUIDv4 `newLease`. No added index is needed:
  existing exact claim `_id`/tenant-thread uniqueness selectors remain the lookup
  anchors; provenance is an additional per-document ownership predicate. Existing
  INDEX_PLAN/setup/unique indexes are unchanged.
- Existing `erasure.ts::StudentExport` approvalClaims type at1852 must omit the
  structural `leaseOwnershipToken` alongside `lease`. Existing `exportStudent`
  approvalClaims projection at2069–2104 is already an explicit allowlist; keep it
  excluding the new top-level marker and preserve opaque decision/response values,
  reasons, provenance and even personal nested keys/text spelling the marker name.
  Normal decision exports and unrelated rows remain unchanged. No broad recursive
  key filtering, replacement or new public output is permitted.
- Source consumers found by current `rg`: graph private types/claims, erasure
  export/purge, existing persistence/per-fact tests, and `apps/web/demo/seed.ts`
  legacy synthetic claim seed plus internal count. The optional interface preserves
  those legacy seeds; any actual recovery stamps only its genuine acquired token.
  API inspection/approval results do not return claim objects. No API/MCP source
  change is proposed. Required engine/API/web/DB importer type/test checks must run
  against final exact hashes, not be presumed from optional typing.
- Every mutable lease writer in this authorized engine must use this protocol.
  Do not claim protection from an older independent writer that bypasses the new
  private CAS rule; mixed-version deployment is unverified and not runtime proof.

**Required independent acceptance:** retain original500ms late successful unset
residue RED/positive, exact matched0/rejected/no-invented-success controls and
foreign currently leased raw bytes. ADD actual source-reachable same-claim B
awaiting AND DONE successful completion/release before A late receipt. Capture
full Q/session/ledger/checkpoint bytes after B success (markerB, lease absent),
then release A receipt and require all B bytes unchanged. Original own invalid
claim with markerA must be removed, so preserving every unleased claim is not a
fix. Test new claim/legacy recovery actual marker stamping, zero-match no stamp,
preexisting failure retaining B marker and original public winner metadata,
public exports omitting structural marker while retaining opaque same-named values,
all unrelated tenant/student rows, and held/rejected exact cleanup settlement.
Mutation removing the marker selector must restore the REAL ABA deletion RED;
restoring markerA after B failure must fail the handoff delta control. No source
scope/schema/index/foreign-byte oracle is implicitly exempted.

### Bounded two-phase read-only inspector protocol (recommended C closure)

This supersedes the earlier unapproved unconditional-session-before-discovery
ordering. Exact existing function is `graph.ts::inspectScribe` at1867–1934, newly
authorized explicitly before edits; no new helper/module/public option is proposed.

1. First actual graph.getState is DISCOVERY ONLY. Record its original before await;
   derive student/session routing and classify safe minimal outcome, but never
   return its sensitive request, decision, summary, edits or result payload under
   any grant captured later. No state -> current not_found. No recorded session
   may require discovery before that outcome; do not claim zero checkpoint reads.
2. Capture actual original grant presence/identity/incarnation/purpose/guardian
   scope from that discovered student, with immutable copies and exact metadata
   own-property presence including legacy absence. Check the actual fence. Original
   null/absent or invalid grant cannot adopt a newly issued grant after an await.
   For a null original, only a safe minimal refused or guard_only result with
   `decision:null`, no personal session payload and no edits may be returned after
   exact original grant-presence/fence checks; a changed final grant exact-refuses.
   These minimal paths read NO sessions, approved profile or transcript and run no
   provider, mutation or checkpoint write. Do not infer consent from serialized state.
3. Authorized PERSONAL path now captures the recorded session for the actual
   discovered student/thread, plus its immutable `_id`, studentId, sessionId,
   generation/creationAttempt own-field presence/legacy absence, and the already
   captured original grant. Missing recorded session -> not_found/no personal
   request/result, with no second personal checkpoint materialization. Do not adopt
   another student's/tenant's row. Legacy recorded rows without summary proof/root
   or generation fields remain readable; no ensure/admission/HOLD/proof mutation.
4. SECOND actual graph.getState rematerializes the personal snapshot AFTER original
   scope capture. Sensitive public output must come ONLY from this second snapshot,
   whose student/session and parsed request identity match captured recorded scope.
   If first discovery was held across erase/regrant, a fresh winner may be returned
   only after genuine new capture/rematerialization; stale discovery content can
   never supply it. If the SECOND read was held across erase/regrant, original scope
   must exact-refuse rather than adopt new grant/session.
5. Preserve current claimed/in-progress/fenced/not_found semantics. Pending request
   freshness uses existing deps.authorize approvedContext with original recorder;
   completed edits retain current consent behavior but also original scope. Use
   in-place local candidate assembly and ONE finite post-materialization original
   authority-check sequence after all awaited claim/history authorization, then
   final signal/deadline check and synchronous return. Compare original session
   identity/presence/thread association, original grant identity/presence/valid
   scope, and actual fence. No universal LAST-I/O continuity or recursive reads.
6. Pin intermediate authority-hold test to the actual current-history requireConsent
   read within deps.authorize, AFTER captured original scope/rematerialization and
   BEFORE these final scope checks. Actual erase/regrant during that hold must
   refuse. Do not rename that read the truly LAST read or infer a transaction/lock.
7. Keep original fixed WriterDeadline and combined cancellation signal. Record
   actual raw grant/session/claim/fence and graph.getState work before await;
   use the D055 raw-findOne recorder for fence and existing D047 approved-context
   recorder for original profile work. Enclosing helper/reading/settlement chains
   stay out of raw originals. Original FWD remains prompt with its cause and a
   stable original-read `.settled` closure, no writes/undos. Caller AbortError
   remains cancelled/no-disclosure, all late reads observed, no postcancel driver
   dispatch past signal checks. Required late original read/settlement errors are
   observable; expected expiry alone is not a manufactured cleanup failure.

**Concrete independent matrix agreement:** inspector planner's existing
`d054-control-reachability-proposed.md` two-phase version90561270 covers empty-history
pending and completed genuine edits in direct inspect and actual signed-JWT API
using its SAME cached graph. Hold SECOND materialization after independently
observed original session/grant capture; real purge/release/new UUID grant/genuine
winner -> old exact ProviderAuthorizationRefusedError (current API safe error mapping),
fresh success, complete newer/foreign storage preserved. Initial discovery hold
may yield only a fresh second snapshot, never stale bytes. Original null held grant
then genuine regrant must exact-refuse minimal publication. Legacy absent-proof/
generation read/export, ordinary no-session/not_found, minimal0session accesses,
in_progress, fenced, malformed identity and intermediate current-consent hold are
explicit positives/negatives. Full Date/Binary/property-presence storage/checkpoint
snapshots compare exactly; zero inspector mutations/provider/invoke or lazy proof.
No-source-capture/final-scope mutant must recreate old second-snapshot disclosure;
using first discovery payload must fail fresh-winner equality; unconditional initial
session read must fail minimal privacy spy.

### New whole-plan authorization/ownership boundary

Root must authorize the private ScribeResolutionDoc/interface and export type
targets plus existing graph claim lifecycle/inspection functions in a NEW decision
after whole-plan quality approval. Assign graph maker only graph.ts; disjoint DB/
projection owner handles collections.ts and erasure.ts. Source test owners remain
existing persistence/per-fact, b18/API and DB erasure files as explicitly assigned;
no new modules/files. Keep concern A independently executable after its own approved
decision, so unresolved technical B/C review cannot idle clear work. No schema field,
provenance mutation, checkpoint semantic change or new inspector scope is approved
by merely recording this proposal. No runtime, feature PASS, commit or push.

## Independently reviewable C: exact two-phase inspector protocol

This separately reviewable C section is PROPOSED ONLY. It restates the accepted
bounded protocol with precise original-null outcomes so C can be authorized
independently while the durable B schema/export proposal is reviewed. Concern A
approved semantics are unchanged: anonymous exact-owned concern cleanup is on
existing `owner.cleanup`, never an invented owner.undo; ordinary summary-only
compensation retains concerns, full authority-loss/deadline compensation cleans
them only after original driver closure. No source or runtime runs here.

**Existing scope:** `packages/engine/src/scribe/graph.ts::inspectScribe`1867–1934,
its existing reading IIFE and local result/error assembly, existing raw callback
interfaces. No new module/helper/schema/public input/API source target. Existing
API test World may expose its SAME cached graph only under the separate existing
test proposal; no production API authority is relaxed.

1. Existing FIRST graph.getState becomes discovery only and is recorded before
   await. No state -> existing exact `{kind:'not_found'}`. It may supply student/
   session routing and safe-minimal classification ONLY. Its pending request,
   summary, edited decision and other sensitive result are NEVER the personal
   public output. Signal/deadline checks precede every later dispatch.
2. Read/copy the discovered student's actual original grant, preserving null,
   presence and own-property absence/presence of incarnation (including legacy
   absent metadata). Check actual fence with raw recorder. A genuinely personal
   pending/done discovery with original grant NULL MUST reject with EXACT fixed
   ProviderAuthorizationRefusedError BEFORE any sessions, profile/facts or
   transcript read, second materialization, provider, invocation or mutation.
   A new grant issued while that null receipt is held cannot be adopted.
3. A retained VALIDATED minimal guard_only/refused branch, if selected, requires
   `decision:null` and no summaryDecision; it preserves only that existing fixed
   minimal typed result, no summary/request/edited facts or session payload.
   Original grant null/presence/identity and actual fence are checked after its
   minimal awaits, with final signal/deadline check. A changed grant exact-refuses.
   It reads ZERO sessions/profile/transcript and runs zero providers/writes.
   Do not create a fabricated checkpoint to test it. Genuine current no-consent
   start persists NO checkpoint, so real empty discovery returns not_found
   without session/profile/transcript reads or further personal collection work.
4. Authorized PERSONAL branch captures recorded session for discovered student/
   thread and its immutable `_id`, studentId, sessionId, lifecycleGeneration and
   creationAttempt with exact own-field absence/presence; the original valid grant
   remains the already captured one. Missing recorded session -> exact not_found
   after discovery, no second personal checkpoint read and no data disclosure.
   A recorded legacy session with absent proof/root/generation remains readable
   under the same captured absence and valid original grant. No proof writer,
   ensure/admission, HOLD, new lease, marker or migration is invoked.
5. SECOND actual graph.getState rematerializes AFTER original grant/session capture.
   Its student/session and parsed pending request must match captured identity.
   Personal output is built ONLY from this second snapshot. A held FIRST discovery
   may safely return a genuine fresh winner only through fresh original capture
   and SECOND materialization; never from stale discovery bytes. A held SECOND
   materialization across erasure/regrant must exact-refuse the old inspection.
6. Preserve existing typed in_progress/fenced/not_found and completed decision/
   summaryDecision semantics. Pending approved-history freshness remains existing
   deps.authorize with original recorder; completed edits also require original
   scope. Assemble a local candidate, then run ONE finite final exact original
   session/grant/fence sequence after all claim/history authorization awaits,
   compare immutable identity/field presence/thread association/valid consent,
   perform final combined signal/deadline check, synchronously return candidate.
   A held intermediate requireConsent/current-history read after original capture
   and second materialization is followed by this final sequence, so regrant
   during that hold refuses. No universal truly-LAST-I/O continuity, lock, recursive
   polling or post-deadline grace is claimed.
7. Every actual session/grant/claim/fence/graph.getState original is recorded BEFORE
   deadline/cancellation await; fence uses existing actual-findOne recorder and
   approved context uses existing original-profile recorder. Helper/composed
   reading/settlement chains remain OUT of raw pending. On original timeout,
   preserve prompt FencedWriterDeadlineError/cause with stable original-reading
   plus raw/nested settlement, no compensation or writes. Expected abort/expiry
   with closed reads does not fabricate cleanup failure; unexpected required raw
   or nested settlement failure remains observable. Preserve caller AbortError,
   stop later dispatch on signal, observe every late original without leaking
   stale output/unhandled rejection, and never create a new execution deadline.

**Independent exact outputs:** the existing test planner90561270 (to be repinned
after its precise-null amendment) targets SECOND materialized snapshot AFTER
independently reached original session/grant capture in pending-empty-profile and
completed genuine edited cases, direct and signed-JWT actual cached API graph.
Actual erase/purge/fence release, new-incarnation same-public grant and real winner:
old direct exact ProviderAuthorizationRefusedError, current API existing safe mapper,
fresh exact winner and no stale request/edit. Original-null grant held during
personal discovery then real regrant: SAME exact refusal before any session/
profile read, not a loose union. Empty actual no-consent discovery: exact not_found
and zero extra personal/session work. Legacy absent-proof/generation existing
read/export remains exact and write-free. Intermediate current-history grant
response hold is followed by bounded final checks, not called the LAST operation.
Full raw Date/Binary/property presence/newer/foreign snapshots unchanged, zero
inspector mutations/providers/invoke, ordinary in_progress/fenced positives and
raw held driver/cancellation/settlement failures complete the matrix.

**C falsifiers:** return discovery personal bytes, omit second rematerialization,
remove original-null guard or final original scope comparison, adopt new incarnation,
or add an unconditional session lookup before minimal classification. Each must
restore intended stale-disclosure/minimal-access RED. No rewrite of ground-truth
output, legacy HOLD, proof fabrication, skipped required controls, widened budget
or weak any-error acceptance is part of this protocol.

Root may request fresh C-specific quality approval/new authorizing decision without
waiting for B schema approval. Product graph remains frozen until that explicit
source authorization and runtime-safe boundary; source-ready is not PASS.

## C precise abort-origin correction (separately reviewable, proposal only)

Own-deadline cancellation must not be assumed to already surface as FWD: current
combined AbortSignal can reject the cancelled branch with AbortError before the
existing WriterDeadline race emits its FWD. Inside EXISTING `inspectScribe`, add
private first-abort-source state and source event listeners BEFORE composing/
awaiting cancellation. Initialize an already-aborted caller signal as caller;
otherwise install first-source latches on the actual `deadline.signal` and caller
signal, never overwrite the first witnessed source, then compose the existing
signals. Capture the actual cancellation exception chosen by the combined abort
branch. No new deadline, helper or elapsed/classname-only inference.

If the first witnessed source is THIS invocation's own deadline and the actual
combined cancellation/own deadline path wins, normalize that public expiry to
FencedWriterDeadlineError preserving the actual original exception as cause and
the stable original reading/raw/nested `.settled` closure. A genuine FWD remains
FWD. If caller cancellation won FIRST, preserve its original AbortError identity/
cause even if the deadline expires later while raw reads drain. Other original
read errors are not reclassified merely because their name or clock changed.
Remove both private source listeners and existing combined listener in finally.
All original operations remain observed without postabort dispatch or data release.

Independent own200ms held-read control must reach own deadline and prove prompt
FWD, actual cause and pending `.settled` until real raw closure; separately caller-
first cancellation then later own deadline during held raw drain must retain
original AbortError and no disclosure. The exact actual null-grant personal branch
remains fixed ProviderAuthorizationRefusedError before session/profile reads;
no looser error union or cancelled-source timestamp guess is accepted.

## B ambiguous receipt correction (proposed private cleanup evidence only)

Durable latest-holder marker also resolves an actual matched1 UNSET whose receipt
REJECTS. Do NOT equate ACK with physical ownership proof or manufacture matched1.
Inside existing `releaseLease`, after strict original authorization but immediately
BEFORE driver dispatch, set an invocation-private `leaseReleaseAttempted` latch on
the existing owner. This is not persisted, not permission and not a new public
schema field. Actual success with matchedCount1 remains the ONLY route setting
`owner.leaseReleased` for execution/publication authority; rejected/zero-match ACK
does not set it. Original driver is still captured before await and fully drained.

Full own-CREATED claim compensation requires complete captured identity plus
`leaseOwnershipToken === original leaseToken`, and permits original leased token
OR (only when this private release attempt was issued) lease ABSENT. Thus an
applied-unset/rejected-receipt retains exact durable markerA and may clean its own
invalid claim without fake release success. A foreign acquisition/completion or
failure leaves durable markerB and fails old A's selector even with lease absent.
An unapplied rejected receipt leaves original tokenA; the ordinary owned selector
works. Preexisting recovery claim remains preserved; only its actual acquired
lease is unset, keeping latest-holder provenance. Ordinary valid-authority retry
claim policy is unchanged; this alternate absence selector is only existing full
owned compensation, never a blanket generic-error claim deletion or authority borrow.

Mandatory actual test: perform the real original `$unset`, assert actual matched1,
then throw/reject its receipt (with a held-response late-deadline variant). Require
no invented owner.leaseReleased, actual exact owned invalid claim removal after
original closure, observable original error/cleanup settlement, foreign full-byte
preservation and all cleanup attempts. Retain actual rejected-matched0 as a separate
negative, not a substitute. Removing private attempted-release/marker predicate
must respectively reproduce own residue/foreign ABA RED. Raw driver failure cannot
be disguised as successful execution merely because owned cleanup succeeded.


## D066 bounded unreadable inspection fence restoration (SOURCE proposal only)

This appendix preserves all earlier approved text. Current graph source is frozen
AD3863D2D2F1C8478067562ED65499311B9E290DD27EA69A73093A8BB8179416.
No implementation, runtime, acceptance verdict or new product scope is claimed.

**Reached defect and fixture authority:** the sealed affected CORE run at
qa/evidence/t052-maker-cycle2/d065-affected-core.log:877-910 reaches the original
T045 control in packages/engine/tests/b18-suppression-outcome.test.ts:1185-1192.
Its historyHarness({tenantId: "history-test"}) at1186 becomes tenantScopedDb at
packages/engine/tests/scribe-fixtures.ts:160. The actual Proxy.findOne stack at
log885-888 passes the explicit tenantIdOf guard in graph.ts1903 and rejects at
isStudentFenced erasure.ts676 -> inspectScribe graph.ts1910. This is not an
unscoped or obsolete fixture. Actual result contains the synthetic raw driver
error instead of exact {kind:"fenced"}; assertion1190 is reached in40.8ms.
The adjacent unreadable readOutcome control1194 is GREEN in the same sealed run.

The last good HEAD inspectScribe defaulted fenced=true and caught ordinary fence
read rejection while enforcing the original budget and cancellation. Current
readOutcome graph.ts620-628 retains that fail-safe condition. D059's two-phase
rewrite unintentionally replaced it with uncaught awaits. Existing ScribeInspection
contract graph.ts1861-1863 explicitly covers unreadable fence state with fenced
and no student disclosure; earlier approved C paragraphs in this plan preserve
existing typed fenced/not_found/in_progress semantics. Complete B23.1-B23.7 remain
unchanged: this restoration discloses no personal or private authority payload,
creates no authority, and never renews an invocation budget or adopts a grant.

**Exact existing implementation targets:** ONLY
packages/engine/src/scribe/graph.ts::inspectScribe:
- first discovery-phase fence read1910-1915;
- retained validated minimal branch final fence read1926-1931;
- personal candidate final fence read1996-2001.
The runtime failure proves the FIRST site. The two final sites have the same
source-evidenced uncaught-read hazard; new explicit fault controls must independently
reach them before claiming their behavior verified. No other function or source
file is proposed, and no named helper, extra operation, cast or grace is needed.

At EACH existing read, replace the const result binding with a local default-true
binding and wrap ONLY its existing isStudentFenced await in try/catch. Keep the
same student selector, date, deadline.op options and onOriginalOperation recorder.
In catch, preserve an actual FencedWriterDeadlineError by rethrowing it unchanged;
never turn its pending/rejected settled closure into successful fenced. For other
read rejection, first check the existing combined signal and throw the SAME chosen
abortError (or the existing exact cancellation fallback), then deadline.op() using
THIS original deadline. Only a settled ordinary fence rejection with still-valid
signal/budget is retained as fenced=true. Keep the existing post-await signal check,
deadline.op() and exact minimal {kind:"fenced"} branch in their present order.
No matching by error.name, elapsed-time guess or later abort source is permitted.

The existing first-source listeners, abortSource latch, actual chosen abortError,
outer original reading/raw/nested stable drain and own-deadline normalization remain
unchanged. The actual findOne promise is still synchronously added to originals
through isStudentFenced's private recorder before await. No wrapper, local catch,
settlement or helper/composed promise is added to originals. A held original still
causes prompt original FWD with settled pending; its late rejection remains
observable through that existing settlement closure. Ordinary failure of an already
settled fence read releases only the existing safe minimal union, never candidate
request/result, raw failure text or a success inferred from unreadability.

All explicit tenant/student validation1903, original null/non-null grant capture,
minimal decision-null/result parsing, zero-personal-access branch, SECOND sensitive
materialization, pending approved-history authorization, exact final grant/session
presence/incarnation/generation comparisons and legacy absence compatibility stay
unchanged. An unreadable initial fence must stop before sessions/profile reads.
An unreadable final fence returns minimal fenced instead of any previously assembled
personal or minimal candidate. No provider/invoke/storage mutation is added.

**Existing independent controls to retain and re-run in the sole root lane:**
- b18-suppression-outcome.test.ts1185 exact original unreadable inspection fence
  result/no raw marker;1194 same readOutcome fail-safe positive control.
- :1117 saved inspection caller cancellation must remain the fixed AbortError and
  disclose no held checkpoint; :799 existing origin x driver matrix includes actual
  FENCE findOne held200ms own deadline, live-raw settled pending, and caller-FIRST
  cancellation that must not become own expiry during later raw drain. Preserve
  the original budgets and complete actual raw closure.
- :677 personal discovery with captured NULL grant cannot adopt reissue or touch
  sessions; :781 genuine no-consent start then empty inspect remains not_found with
  zero personal reads/providers/invoke; :874 existing explicitly SYNTHETIC retained
  minimal checkpoint DATA controls preserve exact guard_only/refused semantics,
  decision=null and zero personal access, not proof of start persistence/authority.
- :734 current/legacyAbsent genuine completed inspection/export remains exact and
  write-free; :958 held SECOND materialization and intermediate current-consent
  erasure/regrant controls keep original refusal and full foreign/newer winner bytes;
  :1088 revoked-consent/changed-history controls retain typed refusal.

**Additional final-fence falsifiers, within EXISTING test file/callback seams:**
Test owner may extend existing b18 unreadable inspection/minimal/control matrices,
not create a file/helper or fabricate authority. Intercept the existing FakeCollection
actual erasure_fences.findOne after genuine tenant-scoped start, invoke the actual
bound reader for earlier fence checks, and reject ONLY the selected final fence
call. Pin reached phase using existing graph.getState/materialization and collection
read counters; do not treat an earlier deps.authorize fence as the target final read.
For personal pending/done routes, require second actual materialization and the
postcandidate final session read before the selected final fence rejection. For
minimal route, use the existing :874 explicitly synthetic saver DATA setup and
observe its final grant read followed by the second inspector fence read; retain
that DATA-only attribution and zero sessions/facts/transcripts/profile/provider/
invoke/mutations. Require exact {kind:"fenced"}, no marker/private/personal payload,
full raw storage equality and completed original read. A readable-false companion
must return the prior exact authorized request/done/minimal result, not fenced.

For each final route also use the existing raw findOne response-hold pattern from
:799 to hold that selected final read through own expiry or caller-FIRST abort.
The catch must NOT convert either to fenced: retain original FWD cause/pending
settled for own expiry and original AbortError for caller first. No time extension,
physical-final-I/O guarantee or universal error-name classification is proposed.
Removing the catch at each site must restore its selected ordinary-rejection RED;
removing the catch's signal/deadline/type preservation must be killed by these
held-read controls. Restoring the final catch while weakening tenant/grant/session
checks must still fail the unchanged D059 original-authority controls.

Fresh independent SOURCE plan approval and official D066 authorizing decision must
precede product edits at a released runtime boundary. This bounded proposal is a
restoration of last-good fail-safe behavior inside approved two-phase inspection;
it is not acceptance, a fixture-oracle rewrite or a new repair cycle.
## D068 consolidated graph original settlement and admission receipt closure (PROPOSED only)

This appendix leaves all prior approved bytes intact. Product graph remains frozen
19F12D1688D66351E166768E284D6816F8BE853DD048B178A7EE1C3CF3041700.
Current completed-feature source-review input is the27-path D067 manifest
A7677D95CDBD232A3300EC55C0D507863580D9FDF9A51D8300DFE59232C804EA.
The fresh t052_d067_fresh_senior and t052_d067_fresh_data tool handbacks report
Block with27/27 hashes unchanged before/after source review. No runtime reproduction
was run by those reviewers or this planner. This is source-gate repair within the
same T052 cycle, not formal acceptance FAIL, a reset, PASS or release authority.

**Full-goal mapping:** preserve complete B23.1-B23.7 plus B4/B14/B15/B21, D040's
original captured student/session/grant/deadline and exact ownership, D045/D047
actual-original settlement, D048 summary commit/rollback, D055/D058 all-cleanup
attempts, D059 durable latest-holder marker/ABA safety and D066's three restored
fail-safe inspection catches. No production/provider/schema/index/API/checkpoint-
option change, no new source file/helper, no new deadline/grace or approval adoption.
DB standalone summary settlement is a SEPARATE DB-maker plan; this appendix neither
edits nor silently assumes that repair completed. Shared error contract must align.

### G1: Mongo adapter original observations

**Evidenced target:** existing compileScribeGraph's adapter.put Mongo branch
packages/engine/src/scribe/graph.ts383,389 and adapter.putWrites430,436. Each passes
actual collection.findOne directly into owner.deadline.run, so expiry can release
work while the original driver is absent from owner.pending.

At all FOUR existing reads, first retain the actual returned promise in a local,
synchronously owner.pending.push that exact promise, THEN await the existing same-
deadline.run. The second existence-check read remains conditional on !existing:
do not dispatch another read on existing rows, change logical/physical selectors,
move serialization/authorization, or register the deadline race itself. Preserve
vcWriterAttempt CAS/upsert ownership, existing MemorySaver behavior and private
adapter/graph binding. No named helper or extra operation is needed.

**Independent probes:** existing scribe-persistence.test.ts adapter put/putWrites
callback seams must hold EACH actual indexed findOne (initial-existing lookup and
conditional !existing recheck, both checkpoint and pending-write collections).
Observe exact facade promise by the approved async-resource observer technique if
identity differs from the raw fake's inner promise. Hold original beyond unchanged
short budget: public FWD prompt, its settled remains pending until actual release.
Both late success and late rejection required. With successful exact cleanup, the
late rejected sentinel must STILL make settled reject with that exact identity.
Readable/no-hold existing/new checkpoint positives, MemorySaver positives, foreign
full BSON/property-presence rows and D066 inspection controls remain unchanged.
Omit any one push and its corresponding held-read control must independently RED.

### G2: observable unexpected originals without hiding cleanup failures

**Evidenced targets:** existing invokeFenceAware timed-out work settlement856-877,
its existing compensate closure770-834 (committing772-775 and pending779-791), and
same closure propagation in existing underLease1268-1319/1365-1387 and
resumeUnderDeadline1771-1795. These loops currently traverse ordinary failures
ONLY to find nested FWD.settled, then discard the ordinary rejection. Some batches
use fresh per-batch seen sets, allowing the same cause to be reintroduced later.
Repair these in place; do not add a reusable/new named error collector/helper.

Keep a private identity collection shared for the entire invocation drain (not
fresh for every batch), including work, committing, raw pending and nested original
settlement outcomes. Retain the exact unexpected rejected objects/primitive values;
inspect AggregateError.errors and Error.cause only to follow their original graph
and find ALL nested FWD.settled closures. Preserve nested containers/cause chains;
do not flatten/replace errors, stringify/concatenate raw messages, or synthesize a
dummy guard to hide an unexpected failure. Each retained aggregate membership is
identity-deduplicated across work/raw/cleanup observations; original immutable
cause/container paths may still reach the same identity. Tests compare the set of
reachable identity-distinct original leaves, not invented ordering/tree counts.

Expected exclusions require POSITIVE private provenance for this invocation's OWN
expiry or guard, never Error.name, instanceof alone, message matching, Date.now or
merely an already-aborted signal. Concrete graph-only provenance proposal: extend
EXISTING private owner/CreatedByCall types with optional invocation-private expected-
failure identity state; no persisted/model/checkpoint/public field. Record an exact
newly created guard object at its existing owner.authorize predicate-deny site, and
an exact chosen cancellation object at existing buildScribeGraph authorizeSnapshot
cancellation creation only when it is tied to this same registered private owner
and its original signal. A raw provider/DB/foreign guard-shaped error is not thereby
expected. owner.authorize's catch must not blanket classify a raw read failure as
an expected guard just because it latches authorityLost.

For actual original deadline expiry, an invocation-local no-driver witness of
THIS deadline.run on an otherwise unresolved promise can observe the exact private
timer rejection identity (no new timer, budget, work/driver or pending registration).
For an actual same-deadline op() throw, record it only at the inline call boundary
that witnessed THAT original op generate it. Where such provenance is unavailable,
preserve/report the rejection conservatively; do not invent an AbortError/FWD
exclusion. This explicit private-provenance target includes the existing private
owner type476-490, CreatedByCall656-665, graph authorizeSnapshot124-158 and the
existing adapter/invoke/lease/resume call boundaries above. Quality must approve
these concrete inline additions before implementation; no arbitrary framework-
AbortError can be silently treated as expected merely because expiry happened.

Expected original failure never excuses its nested settled rejection: await every
nested closure and preserve ANY rejection of a cleanup/settlement closure, including
guard/FWD-shaped errors. Cleanup failures are never excluded by an expected-original
classification. Stable drain after original work completes repeatedly snapshots new
actual originals, drains allSettled, follows newly discovered nested closures and
joins every cleanup attempt. No composed settlement/compensation/undo promise goes
in its own originals; no self-wait or fail-fast Promise.all is allowed.

Perform ALL existing exact compensations despite original rejections; error
collection must not interrupt later summary/fact/checkpoint/claim/session/transcript/
concern/lease cleanup. Expose unexpected original and cleanup identities through
fixed-text AggregateError envelopes (existing fixed messages may be retained).
Keep original public FWD/cause and causal nested closure chain. A sole ACTUAL fixed
safe ProviderAuthorizationRefusedError may retain identity under D051 only when
no unexpected raw failure or other cleanup error is omitted. An expected witnessed
expiry/guard plus successful completed cleanup may fulfill settled; an ordinary
unexpected original may NOT disappear just because cleanup succeeded. Typed fenced
is permitted only after originals closed and required cleanup succeeded.

**Independent probes:** strengthen existing D058 transcript/concern rejected-receipt
cases at scribe-persistence.test.ts165-248: public settled MUST reject with the
actual late original sentinel, even when every cleanup succeeds (current243's
conditional 'if settlement rejects' is insufficient). Add two distinct failures
(original receipt + later cleanup) and repeated-same-identity observations through
work/pending/cause; require exact distinct leaves and every cleanup attempt. Include
arbitrary FWD/ProviderAuth/AbortError-shaped RAW sentinel controls to kill blanket
class/name exclusion. Preserve clean own expiry/known own guard companions, original
prompt budget, held raw pending, fixed text/no public marker and foreign bytes.
The source-supplied selected expected identity must be private/control-flow proven,
not a test-seeded exemption set. The DB plan uses the same observability contract.

### G3: prospective admission ownership, strictly cleanup-only

**Evidenced targets:** existing resumeUnderDeadline recovery acquisition1586-1638,
new claim insertion1692-1760 and outer error/settlement1771-1795; existing
CreatedByCall656-665, invokeFenceAware compensation793-797/825-831 and underLease
pre-owner cleanup1293-1299/1313-1319 as necessary for propagation. Actual insert
receipt assigns createdClaim only at1708; ordinary rejecting receipt exits1743/
1772; late rejection1739 drains but never removes an applied own claim. Recovery
acquisition similarly exits1597/1627 before recoveryCreated exists at1632.

BEFORE dispatch, capture cleanup-only attempt evidence from KNOWN immutable inputs:
kind=new-claim OR recovery-lease, complete {_id,threadId,studentId,responseHash,
claimedAt}, and THIS minted lease.token/leaseOwnershipToken UUID, with original
session/grant binding retained only in the private invocation. Register that
prospective evidence in the existing CreatedByCall/private cleanup context before
calling the actual insertOne/findOneAndUpdate, then push the actual returned driver
promise into the existing pending array before ANY deadline race/await. A private
optional attempt field in EXISTING CreatedByCall may carry this evidence and
receipt state; it is not claimAuthority, created.claim, winner, a published result,
persisted schema or permission. Binding fields are captured once; receipt state
can only record actual completion/no-match/rejection, never refresh identity.

Execution/claimAuthority/createdClaim/approvalInvocation winner remain strict
ACTUAL-ACK-only. Insert fulfillment sets its existing acknowledged claim only after
the real driver receipt; acquisition additionally requires actual returned lease
and marker equal THIS minted UUID. Null/no-match returns existing safe in_progress
with current-authority guards and no graph invoke. Rejected or ambiguous receipt
cannot pretend success, read/adopt a foreign winner or authorize a new dispatch.

At a rejected admission receipt (ordinary or deadline-late), AFTER original
admission work and all registered raw originals actually settle, reconcile the
prospective CLEANUP target even if the driver rejected. New attempted claim:
exact delete {_id,threadId,studentId,responseHash,claimedAt,'lease.token':token,
leaseOwnershipToken:token}; no universal absent-lease fallback is invented because
this unacknowledged admission never issued a release. Preexisting attempted
recovery acquisition: exact same selector UPDATE only {$unset:{lease:""}};
NEVER delete the claim or restore the prior marker. An unapplied rejection or
null result has no own token match and changes zero rows. A foreign re-acquisition
or completion has markerB and fails A's selector, including genuine lease-absent
ABA. Permanent actual markerA/B remains, as D059 requires; tests compare the whole
prior row plus that actual issued delta, not a field-filtered oracle.

Prospective cleanup must be attempted for ordinary receipt errors BEFORE rethrowing
those errors, not only a deadline catch. An expired caller returns prompt original
FWD with composed settled: never synchronously wait the held original or cleanup.
That closure waits original driver/pending/nested work with allSettled and attempts
exact cleanup even if any original rejects. Held/rejected cleanup keeps settlement
pending/rejecting observably and retains all errors under G2. No later driver can
apply an admission after its cleanup falsely certified completion.

ACKed ordinary valid-authority failure/retry policy stays DISTINCT: preserve existing
durable acknowledged claim, invalidate only owned failed summary and release exact
retry lease per current behavior. In particular, existing T045 held insertOne
positive requires the ACTUAL late successful ACK with still-valid original checkpoint,
grant/session and fence to preserve its issued decision as a crash/retry winner,
without ever invoking/publishing after original expiry. Keep that late-success
continuity validation; register any actual postcheck reads before racing them and
drain them if a postcheck timeout wins, so no hidden live postcheck survives settled.
For actual rejected receipt there is NO successful ACK; cleanup-only proof removes
its own attempted residue even if current public consent bytes still look valid.
For late successful ACK with invalidated/unreadable original authority, use existing
exact invalidation cleanup and error observability, never replacement authority.

Do not double-remove an ACKed created claim through both prospective and existing
full compensation. Use private receipt/attempt state to make prospective-only
cleanup run for unacknowledged admission failures, and keep current created.claim
full compensation for ACKed ownership. Clean up once after stable original closure;
a completed cleanup still preserves later foreign token/marker rows. Before-owner
ordinary and timeout exits are covered inline in existing resume/underLease, not
by waiting until invokeFenceAware materializes an owner. Cleanup promises remain
OUTSIDE originals; actual cleanup driver handling is observable without self-drain.

**Independent admission falsifiers:** in existing scribe-persistence.test.ts, actual
insertOne/findOneAndUpdate first performs real indexed mutation, THEN rejects the
same original receipt sentinel. Cover within original budget and held beyond original
budget, plus late mutation after actual erase/purge/fence-release/regrant. New claim
must leave ZERO own stale decision/response rows; recovery must leave ZERO own lease
while preserving complete preexisting claim with its actual permanent marker delta.
Include rejection BEFORE mutation, actual null/no-match acquisition, duplicate-key
legitimate foreign winner, newer token/marker between applied mutation and rejected
receipt, and BOTH existing genuine completed/awaiting foreign ABA routes. Require
exact raw driver/rejection identity, pending until raw release, no provider/invoke
or expired publication, fixed outer text, complete BSON/presence equality for all
foreign claims/session/checkpoint/ledger rows, all-cleanup attempts and fresh valid
retry/claim positives. Keep D060 actual matched1-unset/rejected receipt controls;
those RELEASE tests are not admission receipt proof. Removing prospective evidence
or rejection-path cleanup must recreate own residue; dropping token/marker/full
identity must kill foreign preservation; accepting ACKless authority must kill the
no-invoke/publication control. No seeded lease/proof completion is acceptable.

**Technical approval boundary:** this complete source proposal still needs fresh
independent plan review, exact private expected-error provenance clarification if
needed, official D068 BEFORE edits, actual new-test baseline RED and a released
runtime source boundary. Test designers own their existing test artifacts separately.
No source edits/runtime/helper/new file or acceptance claim occurred while drafting.
### D068 G2/G3 propagation correction and explicit technical reconciliation

Read-only helpers independently confirmed SAME late-original-loss collectors in
startScribe admission1031-1042, releaseLease's late rejected releasing handler1244,
underLease's preowner1275-1289 and ordinary preowner1310-1319, plus resume outer
1778-1789. Include THESE existing GRAPH collectors in G2's exact approved target
proposal, alongside invokeFenceAware/compensate, not a new exception policy.
releaseLease must pass the actual rejected receipt identity into the shared
collector before compensation; successful matched1 still alone sets leaseReleased.
Existing successful stable batches in invokeFenceAware898-908 and underLease1344-
1359 must inspect their allSettled results rather than permit an unexpected registered
rejection to be silently ignored before publication. No extra raw operations or
helper are proposed. nodes.ts::writeApproved has an analogous issue, reported to
root for its separately assigned SOURCE plan; this graph-only appendix does NOT
assign itself that file or silently claim that separate closure implemented.

The collector retains exact unexpected ROOT objects, including an aggregate root,
not only leaf errors. Its fixed public text never formats an upstream message.
Original cause/error trees stay unchanged. ALWAYS traverse causes/aggregate members
even when the current root is a witnessed expected own expiry/guard, since an own
wrapper can contain an unexpected upstream cause. Join each distinct nested
FWD.settled ONCE, feed any rejecting closure's original reason back into the SAME
identity traversal, and repeat stable raw-pending/nested-settlement drain to a
fixed point before and after ALL required cleanup. Do not seed/join this collector's
own exposed deadline settlement. No identity cycle, shared cause or diamond permits
duplicate membership or infinite traversal; same identity appearing in original
immutable error trees is preserved and is not itself another failure.

Exact positively witnessed graph guard/abort creation sites are owner.authorize
731-765 and existing authorizeSnapshot130/132/144/148/156 plus cancellation
135/137/153/155. In the catch-created wrapper case156, preserve the actual incoming
cause root through the collector; simply recording a newly fixed guard must NOT
hide the original raw error. Existing facts.ts414-417 demonstrates the local
same-deadline timer-identity witness pattern; graph must create its OWN invocation
witness and record direct original op throws at their actual inline generation
boundaries, not adopt a DB registry or classify every FWD as own. Source/quality
must review any unresolved callback/framework cancellation provenance honestly;
no fake expected-identity set or classname/clock workaround is proposed.

**Technical reconciliation required before SOURCE approval:** preserved T045
unreadable readOutcome1194 intentionally returns typed fenced after an ordinary
settled fence lookup fails (existing graph620-628); D066 inspection catches likewise
intend that minimal fail-safe result. The D066 inspector is OUTSIDE G2 and must
remain unchanged. An indiscriminate G2 rule turning EVERY earlier caught raw fence
failure into an aggregate would change the protected readOutcome control, whereas
silently exempting all driver failures caught in owner.authorize would recreate
the reported bug. Fresh quality/root must pin whether the exact existing deliberate
readOutcome fail-safe classification is an allowed positively proven guard outcome,
or whether G2's all-unexpected-original rule applies only to failures not already
safely classified by that particular existing contract. It cannot be inferred from
a class/name, hidden behind a blanket catch, or solved by weakening the original
assertion. No new product timing/output requirement or source edit is authorized
by this unresolved technical question. The review handback must distinguish it
from held raw receipt/read/work failures AFTER deadline, which are unambiguously
unexpected and must reject exposed settlement with exact root identities.

**Additional actual foreign-completion admission routes:** for rejected recovery
acquisition, perform its actual exact cleanup UNSET, then HOLD that cleanup receipt.
B null recovery on the same genuine pending checkpoint acquires the same durable
claim, stamps real markerB, completes/releases; release A's old cleanup receipt and
preserve B's full claim bytes with lease absent. For rejected NEW insertion, A's
exact cleanup DELETE physically removes Q_A, then hold its deletion receipt. The
unchanged genuine pending checkpoint admits B through normal public resume(reject),
which inserts Q_B with actual new token/marker/claimedAt, completes/releases; A's
old receipt then settles without affecting Q_B. This is actual same-ID new claim
incarnation, distinct from same-durable-claim acquisition ABA. No30sec lease expiry
shortcut, seed-only completion, borrowed token or enlarged invocation budget is
needed. Preserve raw foreign-CAS negative fixtures only with explicit attribution;
they cannot substitute for these two genuine public completed-winner controls.

Whole appendix remains PROPOSED, SOURCE frozen, pending exact complete quality
review/technical clarification and official D068 plus actual baseline/runtime-safe
source window. No code/test/runtime/commit/push or acceptance occurred here.
### D068 full immutable admission predicates and finite original-registration floor

Fresh data reviewer refinement: G3's cleanup-only evidence captures full immutable
claim payload as well as identity/hash: decision, response, claimedAt, approvalMetadata
actual presence/value/order, scoped tenant and exact minted lease tuple/latest marker.
Selectors must pin those original personal containers (and absent metadata with an
actual absence predicate), not treat a matching hash alone as permission to modify
a row whose content changed. Preserve raw BSON/property-presence representation,
not JSON round-tripped/adopted content. For recovery dispatch, retain its existing
absent/expired eligibility AND atomically compare complete captured claim plus prior
lease and prior leaseOwnershipToken actual presence/value/tuple. Success stamps the
new lease+marker in the same CAS. Cleanup still selects the NEW own exact lease and
marker plus immutable body, unsets only lease, and retains the actual newly issued
marker; never restore a previous marker or body. Actual non-null postimage ACK must
match the exact prospective immutable body/token before creating execution authority.
This explicitly extends only existing resumeUnderDeadline selectors/private fields;
no schema/index/export/public callback change or new lookup is proposed.

Confirmed actual work-only late failure (not a synthetic callback): startScribe1073
awaits recordSessionTranscript, whose facts.ts1855 awaits the real transcript updateOne.
Holding that actual updateOne until the graph's original expiry, then rejecting it,
makes invokeFenceAware original work reject. G2 must retain that original work ROOT
even if it is not itself an owner.pending entry and every exact transcript cleanup
succeeds. Existing D058 work/receipt test seams can prove this unchanged budget path.
Native fixed-text AggregateError.errors/.cause retain the actual objects using
non-enumerable native properties; no enumerable raw diagnostic/code/message field
or error-derived public label is allowed. Current API safe mapping is unchanged.

Additional finite SAME-registration gaps confirmed in graph19F12 source:
- startScribe initial isStudentFenced936, original grant940, actual checkConsent
  work941, repeated prepublication fence956/961 and no-consent final grant962.
- resumeUnderDeadline initial session1509, fence1511, grant1512 BEFORE its pending
  bucket exists; raw graph.getState1561/1645/1746, claims.findOne1575/1655/1658/
  1744/1749 and explicit fence1564/1651 later raced without enrollment.
These are not new authority rules. PROPOSE existing pending bucket allocation before
first original dispatch in each EXISTING function, retain actual promises before
racing them, and use that same bucket in current admission/owner/outer settlement.
Initial resume captures must be INSIDE its original settlement catch. Original
session/grant capture remains exactly once; initially absent private authority
cannot authorize cleanup/invoke/dispatch. start's no-consent minimal branch still
performs ZERO personal session/profile/transcript operations. checkConsent's actual
returned work (its driver is directly awaited, not internally cancellation-raced)
may be tracked as D047 already does; never track an added raced wrapper as original.

The already-existing late-success insertion/acquisition continuity branch also has
actual fence/checkpoint/grant/session postcheck originals and a cleanup driver raced
against its existing postcheck signal. Retain/register those actual operations before
that existing race, and make the exposed original settled wait their actual closure
including cleanup even if the small postcheck race times out. Do NOT renew the
caller deadline or treat that postcheck budget as publication permission; it is
only the existing cleanup/continuity path. Keep exact marker selectors and successful-
late-ACK retry semantics. All unexpected late postcheck/cleanup rejection roots
remain observable, even if a fixed safe refusal is also the causal public error.

These explicit preowner sites form the PROPOSED same original-registration floor;
root/quality must approve their finite scope before any edit. Existing original
T045 early-fence prompt tests and D047 preowner read tests must retain budgets and
be extended through existing callback seams to check settled waits raw closure and
late success/rejection identity. No change to no-consent minimal/private tenant
binding/current-grant capture is proposed. The existing start grant-timeout
postcheck944-953 can return safe fenced under its original policy; whether an alive
initial raw read can be represented without an exposed deadline settlement MUST
be resolved with quality under the same explicit fail-safe reconciliation above,
not by silently returning success while an original remains live or rewriting the
protected test. Root may narrow/sequence this technically clarified source scope,
but omitted actual-live original obligations remain unresolved, not PASS.
### D068 final precise disposition/provenance alignment (supersedes open technical question only)

Root and independent quality have now explicitly accepted the following NARROW
source disposition; this does not exempt an entire owner.authorize catch or alter
D066 inspection. The actual protected T045 outcome test currently at B18:1332-1349
injects a new fence Error inside graph.getState; readOutcome615 awaits owner.authorize
BEFORE its own620 catch. Thus the proposal includes exact fence-driver rejection
sites inside owner.authorize734/final-fence761 as well as readOutcome620-628, not
an inaccurate claim that the protected control reaches only the latter catch.

Capture the exact registered original fence-driver promise/source and its actual
rejected ROOT object as a PRIVATE disposition CANDIDATE. The actual read must have
completed and the same original signal/budget must still be live: perform the actual
original deadline.op check after observing that rejection, preserving actual own
op/abort failure if it does not pass. A held raw driver after expiry never qualifies.
Do not infer qualification from a name/class/message or owner.authorityLost catch.
Use operation-specific provenance, not a global raw-error identity exemption: reuse
of the SAME error by another grant/session/claim/work original is still unexpected.
No additional read, new scope authority or timer/grace is issued to qualify a candidate.

Candidate disposition becomes effective ONLY for the ACTUAL existing minimal-fenced
terminal path, after ALL original/nested operations and ALL exact owned cleanup have
completed successfully and its final same-deadline/signal check passes, with no
personal publication. In existing compensate/invokeFenceAware/underLease collectors,
retain candidate roots provisionally while draining and attempting every cleanup;
apply the final conditional classification at their existing final failure assembly/
fenced return boundary. Never delete the root from its original private error ledger:
a timeout/other terminal route reevaluates classification and does NOT inherit a
successful-fenced exception. If cleanup fails, a different original is unexpected,
budget expires, or an original remains live, the disposition cannot certify success.
Original pending => prompt FWD with true original/cleanup closure rather than hidden
live typed-fenced work. No universal new physical-cleanup-before-error guarantee is
introduced; the same original deadline must bound waits, with composed cleanup
settlement outside originals when that original expiry wins.

A plain known-site closed ordinary fence leaf may be intentionally handled under
that existing safe minimal policy irrespective of its name/message. If the ROOT
has an unproven Error.cause, AggregateError member, arbitrary/unknown causal node,
cycle or unexpected nested settlement rejection, retain the SAME root and full DAG;
do not prune a child, flatten a container or promote an unregistered child to an
own error. Always follow/drain every distinct child settled, even for a provisionally
qualified fence root. Grant/session/claim/work errors, after-expiry fence failures
and cleanup failures remain outside this disposition. Existing final authorization
fence reads may be candidates only under the SAME exact source/driver/live-budget/
actual-minimal-terminal conditions. This finite rule preserves the protected typed
fenced outcome and cannot swallow D068 late raw errors.

For startScribe's early grant/consent timeout branch944-953, an actual initial raw
original that is STILL LIVE must instead expose prompt original FWD plus composed
pending/late-rejection drain; it cannot return typed fenced while hiding that live
operation. Register its preowner originals before any race as specified above.
Preserve the existing original T045 prompt FWD test, no added timer/grace/renewal,
and the legitimate settled-within-budget safe minimal cases. Fresh grant remains
captured once; no no-consent personal reads or replacement adoption are authorized.

**Exact aligned leaf-expiry callback protocol (private, proposed only):** existing
DB write options / WriteApprovedOptions / trusted graph write-node forwarding use
optional `onExpectedExpiry?: (error: unknown, provenance?: { wrappedCause: unknown })
=> void`. Undefined provenance may emit ONLY an exact locally generated own timer/
original op/owned cancellation identity witnessed by that producer. The optional
{wrappedCause} form emits ONLY a just-created owned wrapper with that exact original
cause receipt; it does not declare the whole causal graph expected. Private node/
graph state records the exact error and immutable witnessed wrappedCause identity.
A wrapper is expected-only only while wrapper.cause is STILL that exact receipt and
its entire causal graph terminates in positively emitted producer identities/proven
wrappers. Unknown leaves, changed causes or cycles remain unexpected; retain the
same wrapper ROOT and descendants. Always join nested FWD.settled/aggregate children
and preserve any rejecting nested closure regardless of expected wrapper status.

Graph's EXISTING approved write node/private binding at graph.ts252-286 forwards
this callback from the SAME exact private invocation owner/registry into existing
nodes.writeApproved options, aligned with the separate node/DB-maker proposal.
It cannot be supplied by request/model/checkpoint or forwarded to Mongo options.
Preserve current graph/tenant/student/thread/approval binding before accepting any
producer receipt; do not use a callback as permission to write/publish or replace
an original grant/session. This is additive existing-option/private-field plumbing,
not a new exported schema/helper/module. Every actual child emission is recorded
before propagating that exact chosen exception; arbitrary upstream FWD/Abort/refusal
objects are never marked by a producer catch merely because they have that shape.
Graph's own timer/op/guard creation witness remains separate and exact; callback
provenance lets independent DB/node deadlines be recognized without classname guess.

All G1/G2/G3 parts plus the finite propagation/registration floor and this exact
alignment form the WHOLE proposed GRAPH protocol. Existing final-site B18 tests,
protected original outcomes, actual producer-only expected companions, unknown-
shaped raw sentinels, exact ROOT+DAG identity, no self-enrollment, both actual public
foreign-winner admission routes, ACK-only execution and full same-cycle acceptance
remain mandatory. Test plan persistence FECC69B5CBB8882DF20B53D0773F515E6DA6185FC281A6A9C9DEE8B5A82CFFEF
is separately authored and not implementation authority. Root must obtain full
independent approval and append official D068 before source; product remains19F12.
### D068 exact node/reject forwarding references and owned-container receipt pin

Correction of the preceding approximate write-node line range: the actual approved
write_approved node/private gate is graph.ts296-308; its writeApproved option object
317-329 is the exact onExpectedExpiry forwarding target. The separate approval
rejection gate252-258 remains equally strict; add the SAME optional private callback
at its actual recordRejectReasons options273-274. These are distinct existing calls,
not a new function or weak owner fallback. Preserve current raw onOwnedWrite undo/
original registration and deferSummaryCommit in both existing paths. Existing node
source plan is separately frozen summary-graph-publication-plan.md SHA
66426A04506CFC8AE18B61C4EF886B86E3EFBF6D1BC47C72A272FAC907EA37EC;
this graph appendix does not alter that artifact or authorize its source itself.

The reject-audit producer's separately planned just-created inline AggregateError
can be the cause of an owned FWD wrapper. The SAME callback signature supports
positive receipt of that ACTUAL native container: for an emitted AggregateError,
{wrappedCause} may capture its exact native .errors array rather than a nonexistent
.cause. This is a PROPOSED explicit owned-CONTAINER receipt pin, not an exemption
for all aggregates. The parent privately retains that array identity AND its
emitted element identities/presence/order. Expected-only requires the SAME native
array and unchanged captured member topology, every causal member terminating in
positively emitted own leaves/proven wrappers, no unknown branch/cycle and no nested
settlement rejection. A normal Error wrapper still requires exact .cause receipt.
Changing array/cause/member presence/order invalidates that wrapper receipt; retain
SAME root and actual causal graph. Never prune/remove/replace an upstream object to
make it expected. A producer emits this receipt only at actual new construction,
not for an upstream raw error merely caught at its boundary. Root/quality/node/DB
producers must approve this exact shared container interpretation before source.
Class checks are only structural traversal/discovery AFTER exact receipt capture;
no class/name-only expected provenance is introduced.

All prior bytes remain preserved. This correction/alignment is still PROPOSED with
product19F12 unchanged, no runtime or source/test edit, awaiting whole fresh review
and official source authorization. No partial SOURCE approval is inferred from the
narrow fail-safe disposition clarification.
### D068 graph-local constructed wrappers and exact terminal envelopes (finite clarification)

The shared private registry also records exact GRAPH-created public/composed
wrappers at their ACTUAL local constructor sites before propagation. A later
underLease/resume collector must not treat its own graph-produced FWD as foreign
merely because only leaf/timer/op identities were enrolled; conversely, a foreign
wrapper cannot be omitted because its cause happens to be an owned expiry.
This is the SAME existing callback/receipt ABI and private owner/CreatedByCall
registry, not an extra raw operation/helper, error.name test or new public field.

Existing graph FWD construction sites to enroll, each with actual chosen cause
receipt: invokeFenceAware876/918; startScribe admission1047 and its proposed early-
preowner error closure; releaseLease1246; underLease1304/1387/1399; recovery late
acquisition1629, insertion1741 and resume outer1795. At1629/1741 add the ACTUAL
caught err as native cause when constructing the existing local wrapper, rather
than lose that execution cause. Any new in-place prompt FWD necessitated by the
approved original-registration floor is similarly enrolled at its exact local
constructor before throw. Do not adopt arbitrary caught existing FWD roots.

Locally constructed graph AggregateError roots consumed downstream likewise have
positive construction receipts at existing827/871/881/888/915/1044/1301/1319/1327/
1339/1384/1389/1792 assembly sites. Store the exact native .errors array AND its
ordered member identities/presence. ALSO snapshot that aggregate's actual native
.cause presence/value at the receipt time, whether absent or present; later added,
removed or changed .cause invalidates the receipt even if .errors still matches.
Always traverse every original aggregate member AND cause. Ordinary wrappers store
actual .cause presence/value as well. Container provenance proves construction
ONLY; expected-only classification requires the entire unchanged causal graph to
terminate solely in positively witnessed own errors, with no unknown branch,
cycle or rejecting child settled. Unknown-cause/root/container errors remain
unchanged and observable. A provisional known-site fence disposition is still
subject to its separate exact live-budget/minimal-terminal/all-cleanup conditions.

Use the same registry through start/preowner resume CreatedByCall, into owner,
and through actual writeApproved/recordRejectReasons callbacks. A wrapper receipt
created before owner materialization is retained by that invocation context, not
a process-wide cache, guessed local clock or replacement owner. Enrollment emits
no new error, changes no driver or permission, and does not copy/prune causal DAGs.
No public FWD.settled produced by THIS collector, composed work/drain or cleanup
promise is registered as a raw original or scheduled as its own nested dependency.
A downstream collector may await the completed preceding closure causally; it must
never re-enroll a closure that depends on itself. D066 inspect2062/2066 is outside
this graph-error propagation repair and remains unchanged.

**Exact exposed late-settlement envelope contract for test designers:**
- D058 late actual start graph work/raw rejection: public FWD.cause retains the
  actual original graph error; its .settled rejects native AggregateError with
  fixed literal "Scribe original settlement and owned compensation failed.".
- D068 late resume preowner insert/acquisition rejection: public FWD keeps the
  actual original cause chain; its outer .settled rejects native AggregateError
  with fixed literal "Scribe admission original settlement failed.".
- Within-budget admission receipt failure with successful exact cleanup preserves
  the original sole rejection object's identity (existing direct failure semantics).
  If cleanup also fails, retain BOTH exact roots in the existing applicable fixed
  native aggregate; no invented arbitrary-failure union or raw message concatenation.

For these late envelopes, collect every distinct unexpected original ROOT and
cleanup failure ROOT actually observed through work/raw/preceding/nested closure
outcomes, with shared identity dedup and unchanged causal/container trees. A bare
raw sentinel observed as both work and registered raw appears once as a retained
membership; a DISTINCT actual native container carrying it remains that distinct
root when its own graph cannot be proven expected-only. Its immutable errors/cause
may also reach the same sentinel; this is not another leaf identity. Tests assert
fixed outer message/name, exact reachable identity-distinct ROOT/leaf set against
actual produced errors, shared identity membership dedup, all cleanup attempts and
unchanged causal identities. They must not assume generated nested container count,
ordering or invent an error object; real producers/receipts determine those roots.
Clean own-expiry/guard-only successful cleanup still fulfills settled. Any unexpected
late raw receipt/read/work/nested/cleanup failure still rejects even if cleanup works.

This finite constructor/terminal clarification preserves all prior text and updates
only this existing proposal. Full SOURCE approval + official D068 + actual baseline
RED/released runtime boundary are still required before product edits. Source19F12
is unchanged; no runtime/test/source edit/new helper/file/commit or PASS here.
## CURRENT prospective native expiry shape and safe discovery proposal — 2026-10-14

Status: PROPOSED, NOT APPROVED. No D077/source GO, implementation, runtime,
checker verdict, acceptance, commit or release is conferred by this appendix.
The preceding 108649 bytes are immutable retained proposal history, SHA256
AB4292B754329CD66EFFB9F33D67AFC24D9751E26328A85C64AADFDEE26AFDBE.
This appendix is the final shared erasure/WriterDeadline packet; separately owned
graph/facts/decisions/nodes consumer and compiled-test packets must be consolidated
and independently reviewed before any whole-plan approval or implementation.
The earlier one-timer-object-only proposal was REFUSED AS SUBMITTED in the existing
approval artifact SHA25614ECB10786510EB355CCA159BEADCAA2CE7DF84FEEBD6C518F54A6195AA9752D.
It is explicitly superseded prospectively here by construction-before-exposure
negative shape validation plus safe captured/current discovery, not reapplied.

### Existing-file scope and frozen source

Only prospective existing packages/db/src/erasure.ts changes are described here:
import area, type declarations immediately before WriterDeadline at581, the
existing WriterDeadline class fields and distinct static methods, existing
constructor590 timer600-601, and op613-616. Existing run620-622 and dispose624-626
remain EXACT. No new file or duplicate reflection implementation is proposed.
The two local descriptor/comparison closures below are part of the one distinct
shared inspector, not exported helpers or separate collector implementations.
New distinct class methods/fields/types require whole independent plan approval
and a new official authorizing decision; this text alone authorizes no code.

Frozen source bytes verified during preparation:
- erasure.ts:33B6B5946443B1EB3439CE520B7316F3161CBFA75762797759945D3350823CAD.
- graph.ts:9AC10E0C1A6FB5B6284DF50A9C7A88C5F71E1FC0D14CA21287A8BF3F8D2C1E2B.
Existing packages/db/src/index.ts7 already exports all erasure.ts public types.
No export-file change is needed. Future source line/stack shifts must be measured
after an authorized implementation; these baseline lines are not final repins.

### Complete shared type and captured-intrinsic surface

Add the existing-file import:
```ts
import { types as nativeTypes } from "node:util";
```

Capture method references at module initialization; these are inert lexical
bindings, not exposed registry/capability functions:
```ts
const causalOwn = Object.getOwnPropertyDescriptor;
const causalProto = Object.getPrototypeOf;
const causalKeys = Reflect.ownKeys;
const causalFreeze = Object.freeze;
const causalDefine = Object.defineProperty;
const causalHasOwn = Object.hasOwn;
const causalSame = Object.is;
const causalApply = Reflect.apply;
const causalArray = Array.isArray;
const causalNumber = Number;
const causalInteger = Number.isInteger;
const causalString = String;
const causalPromise = nativeTypes.isPromise;
const causalProxy = nativeTypes.isProxy;
const causalBirthGet = WeakMap.prototype.get;
const causalBirthSet = WeakMap.prototype.set;
const causalFrameHas = WeakSet.prototype.has;
const causalFrameAdd = WeakSet.prototype.add;
const causalSetHas = Set.prototype.has;
const causalSetAdd = Set.prototype.add;

type CausalDescriptor = Readonly<PropertyDescriptor> | undefined;
type CausalTuple = readonly [
  CausalDescriptor, CausalDescriptor, CausalDescriptor,
];
interface CausalRow {
  readonly node: object;
  readonly prototype: object | null;
  readonly descriptors: CausalTuple;
}
export interface WriterCausalFrame extends CausalRow {
  readonly chain: readonly CausalRow[];
  readonly effective: CausalTuple;
  readonly children: readonly unknown[];
  readonly settlements: readonly Promise<unknown>[];
  readonly vector?: Readonly<{
    node: unknown[];
    prototype: object | null;
    keys: readonly PropertyKey[];
    descriptors: readonly (readonly [PropertyKey, CausalDescriptor])[];
  }>;
  readonly unsafe: boolean;
  readonly failed: boolean;
  readonly failure?: unknown;
  readonly unchanged: boolean;
}
```

Every descriptor tuple is positional cause/errors/settled. descriptors contains
OWN descriptors; chain records the exact prototype chain and its own descriptors;
effective selects the first descriptor for each field along that chain.
The frame always has OWN data vector and failure properties, including undefined,
so reading absent metadata never resolves an inherited Object.prototype accessor.
Frame objects, descriptor objects, rows and metadata arrays are frozen. Actual
errors, child values, native error vectors, prototypes and promises are NOT frozen.

### Complete private birth/query implementation

Add these fields and static block INSIDE the existing WriterDeadline class:
```ts
static #expiryConstructions =
  new WeakMap<object, readonly WriterCausalFrame[]>();
static #causalFrames = new WeakSet<WriterCausalFrame>();

static {
  const names = ["inspectCausal", "expiryConstruction"] as const;
  for (let index = 0; index < names.length; index++) {
    const key = names[index]!;
    const descriptor = causalOwn(WriterDeadline, key)!;
    causalDefine(WriterDeadline, key, {
      ...descriptor, writable: false, configurable: false,
    });
  }
}

static expiryConstruction(root: unknown): Readonly<{
  nativeShape: readonly WriterCausalFrame[];
  unchanged: boolean;
}> | undefined {
  if ((typeof root !== "object" || root === null) &&
      typeof root !== "function") return undefined;
  const nativeShape = causalApply(
    causalBirthGet, WriterDeadline.#expiryConstructions, [root],
  ) as readonly WriterCausalFrame[] | undefined;
  if (!nativeShape) return undefined;
  const current = WriterDeadline.inspectCausal(root, nativeShape[0]);
  return causalFreeze({
    nativeShape,
    unchanged: current !== undefined && current.unchanged &&
      !current.unsafe && !current.failed,
  });
}
```

Only the actual constructor timer and own op mint sites below populate the
#private birth map before exposure. Public FWD constructors, foreign values,
public callbacks and callers cannot register a birth or dependency.
#causalFrames authenticates only the inspector's immutable metadata artifacts;
it is not a positive error receipt or owner registry. A forged/proxy previous
frame remains unchanged:false without reading that caller-supplied frame.
Query always uses the lexical canonical WriterDeadline class and captured native
WeakMap/WeakSet operations. Subclass receiver/this, replaced public method binding
or replaced WeakMap/WeakSet prototype methods cannot substitute the lookup.
The public query returns NO creator, origin, deadline, controller, owner, issuer,
scope or writable store. Captured causal refs are evidence, not authority.
Both static API properties are nonwritable/nonconfigurable.

### Complete ONE shared ownerless descriptor inspector

```ts
static inspectCausal(
  root: unknown, previous?: WriterCausalFrame,
): WriterCausalFrame | undefined {
  if ((typeof root !== "object" || root === null) &&
      typeof root !== "function") return undefined;
  const node = root as object;
  const rows: CausalRow[] = [];
  const effective: [
    CausalDescriptor, CausalDescriptor, CausalDescriptor,
  ] = [undefined, undefined, undefined];
  const children: unknown[] = [];
  const settlements: Promise<unknown>[] = [];
  let unsafe = false, failed = false;
  let failure: unknown;
  let vector: WriterCausalFrame["vector"];

  const descriptor = (
    d: PropertyDescriptor | undefined,
  ): CausalDescriptor =>
    d === undefined ? undefined : causalFreeze({ ...d });
  const sameDescriptor = (
    a: CausalDescriptor, b: CausalDescriptor,
  ): boolean => {
    if (a === undefined || b === undefined) return a === b;
    const dataA = causalHasOwn(a, "value");
    const dataB = causalHasOwn(b, "value");
    return dataA === dataB &&
      a.enumerable === b.enumerable &&
      a.configurable === b.configurable &&
      (dataA
        ? a.writable === b.writable && causalSame(a.value, b.value)
        : a.get === b.get && a.set === b.set);
  };

  try {
    const seen = new Set<object>();
    for (let current: object | null = node; current !== null;) {
      if (causalApply(causalSetHas, seen, [current]) ||
          causalProxy(current)) {
        unsafe = true;
        break;
      }
      causalApply(causalSetAdd, seen, [current]);
      const prototype = causalProto(current);
      const own: [
        CausalDescriptor, CausalDescriptor, CausalDescriptor,
      ] = [
        descriptor(causalOwn(current, "cause")),
        descriptor(causalOwn(current, "errors")),
        descriptor(causalOwn(current, "settled")),
      ];
      rows[rows.length] = causalFreeze({
        node: current, prototype, descriptors: causalFreeze(own),
      });
      for (let index = 0; index < 3; index++) {
        if (effective[index] === undefined && own[index] !== undefined) {
          effective[index] = own[index];
        }
      }
      current = prototype;
    }
    for (let index = 0; index < 3; index++) {
      const field = effective[index];
      if (field !== undefined && !causalHasOwn(field, "value")) {
        unsafe = true;
      }
    }
    const cause = effective[0];
    if (cause !== undefined && causalHasOwn(cause, "value")) {
      children[children.length] = cause.value;
    }
    const errors = effective[1];
    if (errors !== undefined && causalHasOwn(errors, "value")) {
      if (causalProxy(errors.value) || !causalArray(errors.value)) {
        unsafe = true;
      } else {
        const array = errors.value as unknown[];
        const prototype = causalProto(array);
        if (prototype !== null && causalProxy(prototype)) unsafe = true;
        const keys = causalKeys(array);
        const entries: (readonly [PropertyKey, CausalDescriptor])[] = [];
        for (let index = 0; index < keys.length; index++) {
          const key = keys[index]!;
          entries[entries.length] = causalFreeze([
            key, descriptor(causalOwn(array, key)),
          ] as const);
        }
        vector = causalFreeze({
          node: array, prototype,
          keys: causalFreeze(keys),
          descriptors: causalFreeze(entries),
        });
        const length = causalOwn(array, "length");
        if (length === undefined || !causalHasOwn(length, "value") ||
            typeof length.value !== "number" ||
            !causalInteger(length.value) || length.value < 0) {
          unsafe = true;
        } else {
          let memberCount = 0;
          for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
            const entry = entries[entryIndex]!;
            const key = entry[0], member = entry[1];
            if (typeof key !== "string") continue;
            const index = causalNumber(key);
            if (!causalInteger(index) || index < 0 ||
                index >= length.value || causalString(index) !== key) continue;
            memberCount++;
            if (member === undefined || !causalHasOwn(member, "value")) {
              unsafe = true;
            } else {
              children[children.length] = member.value;
            }
          }
          if (memberCount !== length.value) unsafe = true;
        }
      }
    }
    const settled = effective[2];
    if (settled !== undefined && causalHasOwn(settled, "value")) {
      if (causalPromise(settled.value)) {
        settlements[settlements.length] = settled.value;
      } else unsafe = true;
    }
  } catch (error) {
    failed = true; unsafe = true; failure = error;
  }

  const first = rows[0];
  const frame: WriterCausalFrame = {
    node, prototype: first?.prototype ?? null,
    descriptors: first?.descriptors ??
      causalFreeze([undefined, undefined, undefined] as const),
    chain: causalFreeze(rows),
    effective: causalFreeze(effective),
    children: causalFreeze(children),
    settlements: causalFreeze(settlements),
    vector, unsafe, failed, failure, unchanged: false,
  };
  let unchanged = previous === undefined && !unsafe && !failed;
  if (previous !== undefined && causalApply(
    causalFrameHas, WriterDeadline.#causalFrames, [previous],
  )) {
    unchanged = !unsafe && !failed &&
      !previous.unsafe && !previous.failed &&
      node === previous.node && rows.length === previous.chain.length;
    if (unchanged) for (let row = 0; row < rows.length; row++) {
      const a = rows[row]!, b = previous.chain[row]!;
      if (a.node !== b.node || a.prototype !== b.prototype) {
        unchanged = false; break;
      }
      for (let index = 0; index < 3; index++) {
        if (!sameDescriptor(a.descriptors[index], b.descriptors[index])) {
          unchanged = false; break;
        }
      }
      if (!unchanged) break;
    }
    if (unchanged) {
      const a = vector, b = previous.vector;
      if (a === undefined || b === undefined) unchanged = a === b;
      else {
        unchanged = a.node === b.node && a.prototype === b.prototype &&
          a.keys.length === b.keys.length &&
          a.descriptors.length === b.descriptors.length;
        if (unchanged) for (let index = 0; index < a.keys.length; index++) {
          if (a.keys[index] !== b.keys[index] ||
              a.descriptors[index]![0] !== b.descriptors[index]![0] ||
              !sameDescriptor(
                a.descriptors[index]![1], b.descriptors[index]![1],
              )) {
            unchanged = false; break;
          }
        }
      }
    }
  }
  const result = causalFreeze({ ...frame, unchanged });
  causalApply(causalFrameAdd, WriterDeadline.#causalFrames, [result]);
  return result;
}
```

The only Array traversal is direct bounded indexing on inspector-owned dense
metadata; no dynamically resolved map/every/push, user iterator, indexed getter,
user vector spread or deep value equality participates in query construction/
comparison. Array.prototype.every replacement cannot make P-to-Q unchanged:true.
Native errors-vector holes are detected by own canonical member count versus
length, not iteration up to length. A sparse native array length4294967295 with
only index7 requires only its actual own-key/descriptor census and records that
actual child; holes make it unsafe. Array own key order preserves numeric member
order. Data member undefined and present cause undefined remain actual children,
never empty/expected by omission. Accessor/hole/non-array errors/nonnative settled
marks unsafe. Effective inherited DATA fields are retained without getter calls.
Proxy/revoked-proxy root is identified before any reflection and returns unsafe
frame with empty chain/children/settlements, failed:false. A proxy errors vector
is refused before Array.isArray, so its traps do not run. Actual reflection throws
set failed:true with the exact thrown value, including undefined via the flag;
source consumers retain original root and that actual fault, not an invented Error.

The current frame contains CURRENT children/P only. Prior immutable frames and
native birth frames contain their captured children/P; consumer history union
must retain all observed birth/first/intermediate/current references, including
removed children and replaced P alongside current Q. Safe query/shape comparison
does not itself perform settlement, reconstruct unknown past mutation, or enroll
positive error ownership.

### Exact existing constructor/op hunks; run and disposal unchanged

Replace ONLY the existing timer body600-601 with:
```ts
this.timer = setTimeout(() => {
  const expired = new FencedWriterDeadlineError();
  const birth = WriterDeadline.inspectCausal(expired)!;
  causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
    expired, causalFreeze([birth]),
  ]);
  this.controller.abort(expired);
  fire(expired);
}, ms);
```

Replace ONLY existing op's one-line throw615 with:
```ts
if (left <= 0 || this.controller.signal.aborted) {
  const expired = new FencedWriterDeadlineError();
  const birth = WriterDeadline.inspectCausal(expired)!;
  causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
    expired, causalFreeze([birth]),
  ]);
  throw expired;
}
```

Preserve EXACT existing:
```ts
run<T>(work: Promise<T>): Promise<T> {
  return Promise.race([work, this.expiry]);
}
dispose(): void {
  clearTimeout(this.timer);
}
```

One actual timer E is recorded BEFORE synchronous abort listeners see signal.reason,
then abort(E) and fire(E) use SAME identity. Direct real run rejections and actual
signal.throwIfAborted observe SAME E. Subsequent real op calls mint fresh distinct
E; they do not adopt timer or a foreign producer. Native bare FWD constructor
already sets settled=Promise.resolve(), which is captured as a real native P.
The unchanged run may forward a real foreign/parent-op error; that DOES NOT create
an own producer receipt for this run receiver. D076 receiver11/id5-to-receiver18
provenance remains separate/unresolved; this proposal does not transfer it.

### Exact native first-rejection observer template and job boundary

Each consumer captures native method references once in its existing module:
```ts
const observationApply = Reflect.apply;
const observationThen = Promise.prototype.then;
const observationSeenHas = WeakSet.prototype.has;
const observationSeenAdd = WeakSet.prototype.add;
```

Inside each genuine invocation, observedOriginals and observerFailures are local.
At FIRST actual native raw registration, BEFORE forwarding onOriginalOperation/
onOwnedWrite or awaiting/racing the SAME actual original P, adapt this template:
```ts
try {
  if (!observationApply(
    observationSeenHas, observedOriginals, [original],
  )) {
    observationApply(observationSeenAdd, observedOriginals, [original]);
    void observationApply(observationThen, original, [
      () => undefined,
      (error: unknown) => {
        try { observeCausal(error); }
        catch (fault) { observerFailures.add(fault); }
        return undefined;
      },
    ]);
  }
} catch (fault) {
  observerFailures.add(fault);
}
// Preserve SAME original registry push/identity, forwarding and await/race.
```

observeCausal is the consumer's invocation-local ledger adapter to the ONE shared
inspector; not a duplicate reflection implementation, producer or ownership mint.
Its concrete body/calls are separately owned consumer packet scope. Direct source
catch/constructor/receipt ingresses capture before callback/wrapper/next await.
The observer child is never enrolled as raw original/producer/settlement, never
returned in place of original P and never grants dependency exclusion. Both
handlers return undefined. Using undefined as the success handler instead would
propagate an arbitrary original success value through builtin identity and could
assimilate a thenable added later; that incorrect earlier draft is superseded.
Actual native subscription/constructor/species failures are retained in the
observer-failure ledger. The consumer must force those actual faults unexpected;
no silent clean subscription claim for poisoned native Promise constructors.
Neither native brand nor callback status provides positive error authority.

This adds once-per-issued-native-identity observation reactions and changes P
handledness/order/performance; these are disclosed source changes, not zero-job
instrumentation. Facts census is52 static raw registration sites plus3 actual
work attachment sites=55, with dynamic dedup by exact P identity. Other consumers
must supply their complete actual counts/maps. Batch allSettled results alone
are too late when one R rejects while another enrolled peer stays held.
An observation reaction cannot precede a same-turn foreign mutation that occurs
before its first job. Native creator birth evidence covers native E before
exposure; a foreign root's unobserved removed fields cannot be reconstructed.
No first-observation omniscience, parent-to-leaf bridge or opaque Promise causality
inference is claimed.

### Consumer integration requirements and sound dependency boundary

All causal histories, observed-original sets, receipt maps and failure ledgers
are INVOCATION-LOCAL. Never keep graph/DB/node history in a module-global cache:
reusing the SAME foreign Error across two calls must not import first-call state
or permission into the second. The private native birth map is ownerless creator
evidence only; it never enrolls, binds, transfers or copies caller/owner receipts.
Current expectedness requires existing exact scoped source positives AND unchanged
first receipt/provenance plus EVERY actually observed causal shape frame/native
birth negative validation. Restoration after an observed drift does not erase it.
Collectors preserve union of all observed causal refs/P/Q across rechecks and
post-await rescans, mark unreadable/mutated roots unexpected, retain same original
root and exact actual fault/removed descendants, attempt all safe owned cleanup.
No name/class/message/time/signal waiver or foreign birth-based approval is added.
Source wrapper first frames are captured BEFORE outward optional recorder callbacks.
Only actual source construction emits the existing private onExpectedExpiry ABI;
classifying an invalid ACK/refusal as expected remains forbidden.
Legacy/no-owner callbacks retain optional ABI/argument packets; standalone writers
keep their own existing source-positive sets and do not require graph ownership.

Existing graph has eight discovery sites on frozen source: invoke929; start1240/
1365; underLease1634/1710/1856; resume2421; inspect2762. Seven fixed-point loops
and resume's separate D051 positive loop must receive identical negative guards.
inspect's own DOMException cancellation constructors, caller/deadline abortSource,
and final caller-origin condition2771-2773 remain unchanged; no library Abort
classification is introduced. Exact consumer census/patches belong to the graph
consumer owner. Nodes/facts/decisions analogous sites are separately inventoried.

Only exact source-known self and already-drained work/raw/cleanup identities may
be excluded from a nested join. Outcomes must be retained before a drained-P
exclusion. For graph compensate, a prospective finite self binding is to change
the existing async outer arrow to ordinary same-args arrow returning ONE inner
async-IIFE P with its unchanged collector body:
```ts
const compensate = (/* SAME existing args/defaults */) => {
  let settlement!: Promise<void>;
  settlement = (async () => {
    // SAME existing body; exact nested-P !== settlement check.
  })();
  return settlement;
};
```
Do NOT retain async on outer arrow (that adds/adopts another P). This substitutes
one actual async creator for one, adds no await/reaction/race/raw enrollment, and
makes self identity available after existing first await/before returned exposure.
Existing const-IIFE collectors can become let-P/assignment analogously.
Those finite consumer hunks require explicit whole-plan review; this sketch is
not an approved implementation or ancestry inference.

No public registerDependency(P,edges), caller-provided exclusion predicate,
creator/issuer exposure or global claimed-ancestry boolean is proposed. Such an
API could connect foreign rejecting Q to exposed genuine graph P and hide an
independent unexpected branch. A safe factory that truly constructs dependencies
must drain independent residual Q even where another branch is own ancestor;
it cannot simply tag today's opaque async collectors from claimed edges.

C1-C7 alias complete B23.1-B23.7 (manifest12). This preserves especially original
deadline/authority C3, actual original driver/exact-owned compensation/concurrent
winner C5, and independent actual evidence C7. D068 no-self reenrollment floor
(initial retained proposal1485-1488) remains. Natural source direction is actual
child leaf/work to parent; current private callbacks record/forward evidence and
do not feed parent public settlement back into child originals. Bare native timer/
op E's default P is already resolved, including foreign forwarded parent-op E.
Original128 Error-DAG cycle control persistence677/686 is cause/container identity
cycle, not opaque Promise ancestry; its foreign FWD683 uses Promise.resolve.
Nested-public729/740/756-762 controls real late child undo original registration,
which remains stable-drain scope, not a new ancestry waiver.

A concrete UNPROVED external opaque backedge remains: after observing parent
public E.settled=G while child driver I is live, a caller can inject SAME E as I's
later rejection, creating childC->G->childC; arbitrary Q awaiting G is equally
opaque. No blanket guarantee about foreign Promise internals is possible. Exact
local self identities do not certify cross-module ancestors. Fresh quality must
assess this explicit boundary against actual required source/control reachability;
rejecting an optional unsafe setter is not itself a blanket blocker, and required
no-self obligations may not be waived. A larger factory-owned phase conversion
requires a separate complete finite proposal if a genuine required source cycle
is evidenced. No such conversion is silently included here.

### Required separately authored acceptance/test packet

Existing erasure deadline callbacks and normal scribe-checkpointer callback tail
only; original16 adapter/33 persistence/all128 protected assertions/deadlines/
budgets remain byte-preserved. Root test owner supplies exact compiled hunks:
actual own run E===signal.reason===throwIfAborted E with multiple observers;
dispose/original value/error controls; fresh distinct own op birth; bounded API
binding/forged previous/proxy/getter/sparse negatives; pregelTaskId/name/stack
compatibility; synchronous and queued microtask before first receipt mutations;
post-receipt observed mutation/restoration; prototype->Aggregate/errors[]+actual
rejecting Q; captured actual source-wrapper held P plus replaced current Q;
descriptor kind/flags/cause undefined/native vector undefined/cycles/foreign/
received actual native-FWD and native Abort controls. Include precise initialized
query negative: replace Array.prototype.every with ()=>true after native birth,
change E.settled from actual P to actual Q; unchanged must remain false. Restore
the exact prototype descriptor before other assertions/fixtures run.
Static timer order proves abort(E) before fire(E); runtime abort-listener-before-
run-reaction observation alone is NOT proof of fire's native Promise state.
No test uses copied receipt maps/fabricated positive callback or parent-leaf bridge.
Both new query/method integrity and every producer/consumer root/cleanup invariant
require fresh independently derived mutation RED->exact restore->GREEN evidence
after implementation; this planning appendix runs nothing and claims none.

## CURRENT complete consumer packet — nodes owner transfer

Author: expiry_nodes_plan. READ-ONLY prospective packet, source
5DC65C2316A722DFF566CA23FF26696E34DEA204C42F1183430C339A0A44684D.
Existing nodes.ts/import8/module intrinsics/writeApproved1481-1727 only.
This records the final concrete owner packet, not implementation/approval.
Shared API is the E509 appendix above; no creator/owner/dependency capability.

MODULE INITIALIZED captures adjacent existing imports (import8 adds types as utilTypes):
```ts
const observationApply=Reflect.apply;
const observationThen=Promise.prototype.then;
const observationSeenHas=WeakSet.prototype.has;
const observationSeenAdd=WeakSet.prototype.add;
const observationHasOwn=Object.hasOwn;
const observationIsPromise=utilTypes.isPromise;
```

Replace1499-1517 LOCAL ledger/adapter:
```ts
type CausalFrame=NonNullable<ReturnType<typeof WriterDeadline.inspectCausal>>;
const expectedFailures=new Map<unknown,{frame:CausalFrame|undefined;children:readonly unknown[]}>();
const observerFailures:unknown[]=[];
const causalFirst=new Map<unknown,CausalFrame>();
const causalHistory=new Map<unknown,Set<CausalFrame>>();
const causalTainted=new Set<unknown>();
const recordedFaults=new Set<unknown>();
const subscriptionSeen=new WeakSet<Promise<unknown>>();
const noteFault=(failure:unknown)=>{
 if(!recordedFaults.has(failure)){recordedFaults.add(failure);observerFailures.push(failure);}
};
const observeCausal=(root:unknown):CausalFrame|undefined=>{
 const queue:unknown[]=[root],seen=new Set<unknown>();let result:CausalFrame|undefined;
 while(queue.length){
  const value=queue.pop();if(seen.has(value))continue;seen.add(value);
  try{
   const previous=causalFirst.get(value);
   const current=WriterDeadline.inspectCausal(value,previous);
   if(Object.is(value,root))result=current;
   const birth=WriterDeadline.expiryConstruction(value);
   if(birth&&!birth.unchanged)causalTainted.add(value);
   if(current){
    if(!previous)causalFirst.set(value,current);
    if(current.unsafe||current.failed||(previous&&!current.unchanged))causalTainted.add(value);
    if(current.failed)noteFault(current.failure);
   }
   for(const frame of [...(birth?.nativeShape??[]),...(current?[current]:[])]){
    const history=causalHistory.get(frame.node)??new Set<CausalFrame>();
    history.add(frame);causalHistory.set(frame.node,history);
    if(frame.unsafe||frame.failed)causalTainted.add(frame.node);
    if(frame.failed)noteFault(frame.failure);
    for(const child of frame.children)queue.push(child);
   }
  }catch(failure){causalTainted.add(value);noteFault(failure);}
 }
 return result;
};
const observePromise=(raw:Promise<unknown>,emit?:(error:unknown)=>void):void=>{
 try{
  if(!observationApply(observationSeenHas,subscriptionSeen,[raw])){
   observationApply(observationSeenAdd,subscriptionSeen,[raw]);
   void observationApply(observationThen,raw,[()=>undefined,(error:unknown)=>{
    try{observeCausal(error);if(emit)emit(error);}catch(failure){noteFault(failure);observeCausal(failure);}
    return undefined;
   }]);
  }
 }catch(failure){noteFault(failure);observeCausal(failure);}
};
```

Both native handlers return undefined; actual subscription/species fault retained.
Same original/work P pushed/forwarded/awaited; observer child discarded, never enrolled.
Adapters retain invocation-local first/intermediate/current/birth frames.
No second reflection implementation. Optional opaque authorization awaits unchanged;
only native brand attaches. No API-derived positive membership.

Inside onExpectedExpiry1503 FIRST observeCausal(error), before outward callback.
Replace1505-1511 receipt body:
```ts
const frame=observeCausal(error);
const birth=WriterDeadline.expiryConstruction(error);
const field=frame?.effective[error instanceof AggregateError?1:0];
const provenanceMatches=!provenance||(error instanceof Error&&field!==undefined&&observationHasOwn(field,'value')&&field.value===provenance.wrappedCause);
if(provenanceMatches&&!expectedFailures.has(error)&&!causalTainted.has(error)&&!frame?.unsafe&&!frame?.failed&&!(birth&&!birth.unchanged)){
 const children:unknown[]=[];
 const ownCause=frame?.descriptors[0];
 if(error instanceof Error&&ownCause&&observationHasOwn(ownCause,'value'))children.push(ownCause.value);
 if(error instanceof AggregateError&&frame?.vector){
  const effectiveCause=frame.effective[0];
  const offset=effectiveCause&&observationHasOwn(effectiveCause,'value')?1:0;
  for(let index=offset;index<frame.children.length;index++)children.push(frame.children[index]);
 }
 expectedFailures.set(error,{frame,children});
}
```
Children ordering is effective DATA cause first including undefined, then own DATA
numeric native array members. OWN cause/source Error/Aggregate positive semantics
preserved; inherited data is discovery only, never an own-positive grant.
First receipt not refreshed; shape drift remains sticky even after restoration.
Callback throw is noteFault+observeCausal; optional ABI and arguments unchanged.

FIRST-INGRESS/attachment/source map (exact owner expansion directives):
1518-19 originalExpiry => observePromise(originalExpiry,error=>expiryOptions.onExpectedExpiry!(error));
1521 actual summaryWork assigned local, observePromise, await SAME;
1528 originalSettlement and1531 raw BEFORE external owned/original callback;
1536 factsWork assigned local, observePromise, await SAME;
1539 originalSettlement BEFORE external owned callback;
1544 observeCausal(err) FIRST before conflict classification;
1551/1557/1563/1575/1584 optional authorize assigned local, native-brand observer then SAME await;
1560 raw BEFORE outward;1561 observePromise(commit) after push BEFORE deadline.run;
1573 rejected outcome observe before throw;
1580 err FIRST before authority await/earlyCleanup;1585 authorityErr FIRST;
1592 actual isStudentFenced workP local observer BEFORE await;1594 raw BEFORE outward;
1600 actual undoP local observer BEFORE await, catch observe/rethrow SAME error;
1603 actual earlyAggregate local observe BEFORE throw, no positive enrollment;
1605 existing earlyCleanup swallow replaced observePromise;
1624/1631/1638/1660/1668/1685 rejected reasons observe BEFORE root/forced/nested routing;
1641 observer ledger root observe BEFORE roots+forced;
1677 actual undoP local observer BEFORE await, catch cleanupErr BEFORE roots+forced;
1714 actual final owned-cleanup Aggregate local observe BEFORE SAME throw/message;
1717 existing settled swallow replaced observePromise(SAME settled) BEFORE1720 callback;
1722 settlementError FIRST before unwrap.
Attachment census19 fixed:raw5(1528,1531,1539,1560,1594)+work8(1518,1521,1536,1561,1592,1600,1605,1677)+authorize5(1551,1557,1563,1575,1584)+finalsettled1(1717).
PLUS1 native-nested template1648, exact-P dedup. No observer child/raw-facade/budget renewal.

Discovery1643-1654 replacement:
```ts
const queue=[...roots].reverse(),traversed=new Set<unknown>();
while(queue.length){
 const error=queue.pop();if(traversed.has(error))continue;
 traversed.add(error);discovered.add(error);observeCausal(error);
 if(causalTainted.has(error))forced.add(error);
 for(const frame of causalHistory.get(error)??[]){
  for(const child of frame.children)queue.push(child);
  for(const promise of frame.settlements){
   if(promise===settled||promise===earlyCleanup||drainedNative.has(promise))continue;
   const parents=nested.get(promise)??new Set<unknown>();parents.add(error);nested.set(promise,parents);
   if(nestedFailures.has(promise))forced.add(error);
   observePromise(promise);
  }
 }
}
```
1608-14 add drainedNative:Set<Promise<unknown>>; widen nested/joined/nestedFailures to
Promise<unknown>. Add actual batch/raw/work/undo P to drainedNative ONLY AFTER actual
allSettled/await completed AND rejected outcomes retained at1623/1631/1638/1658/1667/
1683 and actual undo catches. observed.has before await does NOT certify drainage.
Keep both nested-await branches and failed-P all-parent propagation; late parent of
already failed P forced immediately. Exact self settled/earlyCleanup only, no opaque
ancestry. Capture all birth/first/intermediate/current P/Q and removed causal refs.

Proof1693-1707 moves INSIDE existing collector for(;;), replacing break1691 after
existing stable checks; same fixed point with:
```ts
if(!discovered.has(error)||expected.has(error)||forced.has(error)||causalTainted.has(error))continue;
const birth=WriterDeadline.expiryConstruction(error);
if(birth&&!birth.unchanged)continue;
const current=WriterDeadline.inspectCausal(error,receipt.frame);
if(receipt.frame&&(!current||current.unsafe||current.failed||!current.unchanged))continue;
let childrenExpected=true;
for(const child of receipt.children)if(!expected.has(child)){childrenExpected=false;break;}
if(!childrenExpected)continue;
expected.add(error);grew=true;
```
Validate ALL same-root retained frames via inspect(error,observedFrame), or sticky
taint latched from those comparisons; any unsafe/failed/divergent frame vetoes.
Actual inspection fault including undefined goes noteFault and forces original root.
Terminal proof adding fault/child/P frontier re-enters SAME collector loop before seal,
no new budget. Shared proxy refusal means no inspector trap between last synchronous
discovery and proof. Primitive positives remain only existing source emissions.
Public aggregation1711-14/FWD1719-20/non-timeout unwrap1723 unchanged.
SIX emissions1519/1552/1556/1558/1576/1720 preserved.
Protected18nodes/33persistence/16adapter/all128 outcomes, clocks, ownership and foreign
BSON unchanged. Observer jobs/handledness changes disclosed. Same-turn foreign
pre-reaction mutation and external opaque backedge remain UNPROVED.
Owner transfer complete; fresh quality must assess exact proposal, not infer GO.

## CURRENT complete consumer packet — decisions owner transfer

Author expiry_decisions_plan; verified source
ECB9B520FC1A1214AAE9E68A0F3A59F2005C7996354D6EDA10DB69BCCB5699E8.
Existing recordRejectReasons103 only. Shared E509 API; no existing duplicate
observeCausal/inspectCausal/history/nativeThen collector. Proposed A-I, not GO.

HUNK A: import types as nativeTypes from node:util, module captures:
```ts
const observationApply=Reflect.apply;
const observationThen=Promise.prototype.then;
const observationSeenHas=WeakSet.prototype.has;
const observationSeenAdd=WeakSet.prototype.add;
const observationIsPromise=nativeTypes.isPromise;
```
HUNK B beside117 BEFORE originalExpiry119:
```ts
type Frame=NonNullable<ReturnType<typeof WriterDeadline.inspectCausal>>;
type History={first:Frame;current:Frame;frames:Frame[];children:Set<unknown>;settlements:Set<Promise<unknown>>;tainted:boolean;revision:number};
const causalHistory=new Map<unknown,History>();
const causalDiscoveryRoots=new Set<unknown>();
const causalTaints=new Set<unknown>();
const detachedRoots=new Set<unknown>();
const causalObserverFailures=new Set<unknown>();
const observedOriginals=new WeakSet<object>();
const observeCausal=(root:unknown):void=>{
 const pending:unknown[]=[root];const seen=new Set<unknown>();
 while(pending.length){
  const node=pending.pop();if(seen.has(node))continue;seen.add(node);causalDiscoveryRoots.add(node);
  let history=causalHistory.get(node);
  try{
   const previous=history?.current;
   const frame=WriterDeadline.inspectCausal(node,previous);if(!frame)continue;
   if(!history){history={first:frame,current:frame,frames:[],children:new Set(),settlements:new Set(),tainted:false,revision:0};causalHistory.set(node,history);}
   if(previous&&!frame.unchanged){for(const child of previous.children){if(!frame.children.includes(child))detachedRoots.add(child);}}
   const birth=WriterDeadline.expiryConstruction(node);
   if(!previous||!frame.unchanged)history.frames.push(frame);
   if(birth&&!history.frames.includes(birth.nativeShape[0]!))history.frames.push(birth.nativeShape[0]!);
   const captured=birth?[birth.nativeShape[0]!,frame]:[frame];
   for(const shape of captured){
    if(shape.unsafe||shape.failed||!shape.unchanged||(birth&&!birth.unchanged)){
     causalTaints.add(node);if(!history.tainted){history.tainted=true;history.revision++;}
    }
    if(shape.failed){causalObserverFailures.add(shape.failure);causalDiscoveryRoots.add(shape.failure);}
    for(const child of shape.children){if(!history.children.has(child)){history.children.add(child);history.revision++;}pending.push(child);}
    for(const promise of shape.settlements){if(!history.settlements.has(promise)){history.settlements.add(promise);history.revision++;}}
   }
   history.current=frame;
  }catch(fault){
   causalObserverFailures.add(fault);causalDiscoveryRoots.add(fault);causalTaints.add(node);
   if(history&&!history.tainted){history.tainted=true;history.revision++;}
  }
 }
};
```
First/changed intermediate/current/birth retained; unchanged snapshot identity does
not grow history. Taint survives restoration. failed preserves undefined fault.
Discovery seeds NEVER automatically become errors members. detachedRoots only
observed previous->current child removals, not flattening unchanged foreign DAG;
that membership rule explicitly requires fresh quality review.

HUNK C: FIRST observeCausal(ROOT) at all30 actual catches/constructors, before
same existing assignment/add/push/throw/callback or next await:
error120/156/174/194/241/243/252/258/324;
observerError123/160/178/198/263/344/349;
err153/170/209/217/222/236/250;authorityErr191;expiryError260;
outcome.reason273/276/332;aggregate342;publicError347.
Constructor captures immediately after construction before recorder.
Existing expiry catch120 already first-observes; no duplicate expiry subscription.

HUNK D native N(original):
```ts
try{
 if(observationIsPromise(original)&&!observationApply(observationSeenHas,observedOriginals,[original])){
  observationApply(observationSeenAdd,observedOriginals,[original]);
  void observationApply(observationThen,original,[
   ()=>undefined,
   (error:unknown)=>{
    try{observeCausal(error);}catch(fault){causalObserverFailures.add(fault);causalDiscoveryRoots.add(fault);}
    return undefined;
   },
  ]);
 }
}catch(fault){causalObserverFailures.add(fault);causalDiscoveryRoots.add(fault);}
```
Both handlers return undefined. Child never enrolled/returned/awaited/receipt/
dependency. Same original P. Subscription/species faults unexpected. Non-native
original thenables unobserved and unchanged, no fabricated native registration.
Nine static patterns:150 authorization1;167 authorization2;188 authorization3;
206 authorization4;214 authorization5;233 authorization19;247 authorization20;
each original options.authorize&&!includes condition braces preserve same push,
then N(actualP), before same deadline.run await. Work218 immediately after actual
IIFE and before onOwnedWrite219. Newly discovered promise312-313 before nested
registration/join. Dynamic exact-P dedup. Extra reactions/jobs/handledness disclosed.

HUNK E seven receipts122/159/177/197/262/343/348:
ROOT error/error/error/error/expiryError/aggregate/publicError respectively.
After C capture, wrap SAME original source addition/callback/observer catch:
```ts
const construction=WriterDeadline.expiryConstruction(ROOT);
if(!causalTaints.has(ROOT)&&!causalHistory.get(ROOT)?.tainted&&(!construction||construction.unchanged)){
 // SAME original ownExpiryFailures.add only121/158/176/196/261.
 // SAME original onExpectedExpiry callback and observer-error catch.
}
```
Only five producer-positive additions; foreign/wrapper never enter own set.
Valid/undefined birth grants nothing. Existing metadata compatibility preserved.

HUNK F actual native copied-vector provenance343, within valid receipt guard:
```ts
const wrappedCause=causalHistory.get(aggregate)!.first.descriptors[1]!.value;
try{options.onExpectedExpiry?.(aggregate,{wrappedCause});}
catch(observerError){observeCausal(observerError);if(!expiryObserverFailures.includes(observerError))expiryObserverFailures.push(observerError);}
```
Actual OWN AggregateError.errors copied vector, never constructor-input primary,
getter/spread/clone. PublicError348 actual cause provenance unchanged.

HUNK G classifier278-292; SAME literal repeated before final337 AFTER nested/undo:
```ts
for(const originalError of [...originalFailures,...detachedRoots]){
 observeCausal(originalError);
 const leaves:unknown[]=[originalError];const visited=new Set<unknown>();let expectedOnly=true;
 while(leaves.length){
  const leaf=leaves.pop();if(visited.has(leaf)){expectedOnly=false;break;}visited.add(leaf);
  const construction=WriterDeadline.expiryConstruction(leaf);const history=causalHistory.get(leaf);
  if(causalTaints.has(leaf)||history?.tainted||(construction&&!construction.unchanged)||!ownExpiryFailures.has(leaf)){
   expectedOnly=false;break;
  }
  if(history)for(const child of history.children)leaves.push(child);
 }
 if(!expectedOnly&&!errors.includes(originalError))errors.push(originalError);
}
```
Negative before existing scoped positive. Foreign/cycle/changed/accessor/proxy/
fault refuses, same root retained. Final repeated proof prevents stale classification
after await. Adds never removes forced errors. Detached removals subject same
positives/negative rules, unchanged foreign DAG remains sole original root.

HUNK H discovery294-335: errorSeen298 becomes Map<unknown,number>.
START existing for(;;)303:
```ts
for(const root of causalDiscoveryRoots){observeCausal(root);errorStack.push(root);}
for(const fault of causalObserverFailures){if(!errors.includes(fault))errors.push(fault);errorStack.push(fault);}
```
Existing observer failures304-308 drain unchanged. Replace310-318:
```ts
const error=errorStack.pop();observeCausal(error);
const history=causalHistory.get(error);const revision=history?.revision??0;
if(errorSeen.get(error)===revision)continue;errorSeen.set(error,revision);
if(history){
 for(const promise of history.settlements){
  if(promise===settled||promise===work||originalOperations.includes(promise)||nestedSeen.has(promise as Promise<void>))continue;
  // EXACT N(original=promise) inline here, no fabricated dependency API.
  nestedSeen.add(promise as Promise<void>);nested.push(promise as Promise<void>);
 }
 const descendants=[...history.children];
 for(let index=descendants.length-1;index>=0;index--)errorStack.push(descendants[index]);
}
```
Preserve remaining seeds/arrays/drains/undo/error routing/aggregate. Rescan each
outer pass after original/nested/final undo waits; C324/332 captures before original
push. G repeated before337. Native current/captured P/Q independent of class.
Only exact self and work/originals already drained271-277 with actual outcomes
retained excluded. No opaque ancestry/positive transfer; external backedge unproved.

HUNK I proposed normal terminal356 AFTER SAME existing priorities352-355:
```ts
if(causalObserverFailures.size===1)throw causalObserverFailures.values().next().value;
if(causalObserverFailures.size>1)throw new AggregateError([...causalObserverFailures],"recordRejectReasons: causal observation failed");
```
Healthy return unchanged; same sole actual fault or complete actual-fault vector;
new fault aggregate receives no expected receipt. Extra terminal hunk and detached
membership are explicit scope additions requiring quality review, not silently GO.
Baseline ranges A35-44/module imports;B116-119;C120-349;D150/167/188/206/214/
233/247/work218-219/nested312-313;E/F121-123/158-160/176-178/196-198/261-263/
342-349;G278-292 plus before337;H294-335;I352-356.
Future final numerical pins unknown; native receiver18 does not acquire receiver11
ownership from valid query. Existing messages/deadlines/foreign/owned cleanup
unchanged; no implementation/runtime/approval/sourceGO claim.

## CURRENT complete consumer packet — facts owner transfer (all 3/3 received)

Author resume_facts_d068; source18F59B7B75555CE2F5C69AB163C85E4B3DA5BFDAD3B6D897A4EB80C1DD99F5AC.
Existing applyApprovedDiff395/ensureScribeSessionRow1063/recordApprovedSessionSummary1775.
Shared E509 inspector; add type WriterCausalFrame to erasure import170-177.
Module inert bindings:
```ts
const observationApply=Reflect.apply;
const observationThen=Promise.prototype.then;
const observationSeenHas=WeakSet.prototype.has;
const observationSeenAdd=WeakSet.prototype.add;
const observationHasOwn=Object.hasOwn;
```
PART1 local scopes apply415-417/ensure1080-1084/summary1791-1795, exact adapter:
```ts
const observedOriginals = new WeakSet<object>();
const causalHistory = new Map<unknown, WriterCausalFrame[]>();
const causalLatest = new Map<unknown, WriterCausalFrame>();
const causalChildren = new Map<unknown, Set<unknown>>();
const causalSettlements = new Map<unknown, Set<Promise<unknown>>>();
const causalVeto = new Set<unknown>();
const causalDrift = new Set<unknown>();
const causalFaults = new Set<unknown>();
let causalRevision = 0;
const observeCausal = (root: unknown): void => {
 const queue: unknown[] = [root]; const visited = new Set<unknown>();
 try { while (queue.length) {
  const node = queue.pop(); if (visited.has(node)) continue; visited.add(node);
  const birth = WriterDeadline.expiryConstruction(node);
  const previous = causalLatest.get(node) ?? birth?.nativeShape[0];
  const current = WriterDeadline.inspectCausal(node, previous);
  if (!current) continue;
  let history = causalHistory.get(node);
  if (!history) { history=[]; causalHistory.set(node,history); causalChildren.set(node,new Set()); causalSettlements.set(node,new Set()); causalRevision++; }
  if (birth) for (let i=0;i<birth.nativeShape.length;i++) { const f=birth.nativeShape[i]!; if (!history.includes(f)) history.push(f); }
  // Refined condition: repeated unsafe snapshots alone do NOT prove an observed shape change.
  if ((birth && !birth.unchanged) || (previous && !previous.unsafe && !previous.failed && !current.unchanged)) {
   if (!causalDrift.has(node)) { causalDrift.add(node); causalRevision++; }
  }
  if (current.unsafe || current.failed || causalDrift.has(node)) {
   if (!causalVeto.has(node)) { causalVeto.add(node); causalRevision++; }
  }
  if (!previous || !current.unchanged) history.push(current);
  causalLatest.set(node,current);
  const children=causalChildren.get(node)!; const settlements=causalSettlements.get(node)!;
  const length=history.length;
  for (let i=0;i<length;i++) {
   const f=history[i]!;
   if (f.failed && !causalFaults.has(f.failure)) { causalFaults.add(f.failure); provenanceFailures.push(f.failure); causalRevision++; }
   for (let j=0;j<f.children.length;j++) { const c=f.children[j]; if (!children.has(c)) {children.add(c);causalRevision++;} }
   for (let j=0;j<f.settlements.length;j++) {const p=f.settlements[j]!;if(!settlements.has(p)){settlements.add(p);causalRevision++;}}
  }
  const descendants=[...children]; for(let i=descendants.length-1;i>=0;i--)queue.push(descendants[i]);
 }} catch(fault) {
  if(!causalFaults.has(fault)){causalFaults.add(fault);provenanceFailures.push(fault);causalRevision++;}
  if(!causalVeto.has(root)){causalVeto.add(root);causalRevision++;}
 }
};
```
Only new refs/faults/latches advance revision, repeated unsafe snapshots do not create
an infinite fixed point. Spreads traverse own Set metadata, not user errors vector.
The FINAL safe-prior drift condition above supersedes the earlier unrefined draft.

Native attachment, actual mapped original P before external callback/race/await:
```ts
try {
 if(!observationApply(observationSeenHas,observedOriginals,[original])){
  observationApply(observationSeenAdd,observedOriginals,[original]);
  void observationApply(observationThen,original,[()=>undefined,(error:unknown)=>{observeCausal(error);return undefined;}]);
 }
}catch(fault){observeCausal(fault);provenanceFailures.push(fault);}
```
Both return undefined; no child enrollment/replacement. Subscription fault forced
unexpected. Complete60 sites:55 raw/work PLUS5 discovered native P/Q; explicit scope
addition, not old55 mislabel. Dynamic same-P dedup per invocation only.

Seven proof negative prelude after existing seen rule:
```ts
observeCausal(leaf);
const frame=causalLatest.get(leaf);
const birth=WriterDeadline.expiryConstruction(leaf);
let intact=!causalVeto.has(leaf)&&(!birth||birth.unchanged);
const history=causalHistory.get(leaf);
if(history)for(let i=0;intact&&i<history.length;i++){
 const checked=WriterDeadline.inspectCausal(leaf,history[i]!);
 if(!checked||checked.unsafe||checked.failed||!checked.unchanged){
  intact=false;
  if(!causalVeto.has(leaf)){causalVeto.add(leaf);causalRevision++;}
  if(!causalDrift.has(leaf)){causalDrift.add(leaf);causalRevision++;}
  if(checked?.failed&&!causalFaults.has(checked.failure)){causalFaults.add(checked.failure);provenanceFailures.push(checked.failure);causalRevision++;}
 }
}
if(!intact){expectedOnly=false;break;}
```
Emission proofs substitute provenExpiry/receiptLeaves. Settled apply repeated node
=>false; emission/ensure/summary existing repeats=>continue. Existing own-positive:
```ts
if(ownExpiryFailures.has(leaf)){
 if(frame)for(let i=frame.children.length-1;i>=0;i--)leaves.push(frame.children[i]);
 continue;
}
```
Apply adds partialFrames Map<PartialApplyError,WriterCausalFrame>. Constructors817/868
capture first before callback. After own branch:
```ts
const first=partialFrames.get(leaf as PartialApplyError), d=frame?.effective[0];
if(partialCauses.has(leaf as PartialApplyError)&&first&&frame&&d&&observationHasOwn(d,'value')&&d.value===partialCauses.get(leaf as PartialApplyError)){
 const checked=WriterDeadline.inspectCausal(leaf,first);
 if(checked&&checked.unchanged&&!checked.unsafe&&!checked.failed){for(let i=frame.children.length-1;i>=0;i--)leaves.push(frame.children[i]);continue;}
}
expectedOnly=false;break;
```
Ensure/summary expiryWrappers values become {cause:unknown;frame:WriterCausalFrame;
kind:'cause'|'errors'}. Ensure has NO existing setter; invent none. Wrapper proof:
```ts
const receipt=expiryWrappers.get(leaf);
if(receipt&&frame){
 const d=frame.effective[receipt.kind==='cause'?0:1];
 const checked=WriterDeadline.inspectCausal(leaf,receipt.frame);
 if(d&&observationHasOwn(d,'value')&&d.value===receipt.cause&&(receipt.kind!=='errors'||frame.vector?.node===receipt.cause)&&checked&&checked.unchanged&&!checked.unsafe&&!checked.failed){
  for(let i=frame.children.length-1;i>=0;i--)leaves.push(frame.children[i]);continue;
 }
}
expectedOnly=false;break;
```
Malformed current receipt grants nothing. Existing exact no-provenance source channel
alone may add own positives. No owner transfer from birth query.

PART2 five collectors apply445/940,ensure1132/1598,summary1841 add local:
```ts
const drained=new Map<Promise<unknown>,PromiseSettledResult<unknown>>();
const removedRoots=new Set<unknown>();
```
Widen nested arrays/Sets to Promise<unknown>. All batches retain SAME P/outcome first:
```ts
const outcomes=await Promise.allSettled(batch);
for(let i=0;i<outcomes.length;i++){
 const outcome=outcomes[i]!;drained.set(batch[i]!,outcome);
 if(outcome.status==='rejected'){
  observeCausal(outcome.reason);
  // SAME existing root category and errorStack routing at this batch site.
 }
}
```
Single work batch=[work], same routing. Actual cleanup outcome retained around SAME
await; exception remains cleanupRoots/errorStack before exclusion.

Discovery apply484-489/982-987,ensure1165-1170/1623-1628,summary1873-1878:
```ts
const error=errorStack.pop(); // E/S: shift (existing queue order).
if(errorSeen.has(error))continue;errorSeen.add(error);
observeCausal(error);
const promises=causalSettlements.get(error);
if(promises)for(const promise of promises){
 if(promise!==settlement&&!drained.has(promise)&&!nestedSeen.has(promise)){
  try{
   if(!observationApply(observationSeenHas,observedOriginals,[promise])){
    observationApply(observationSeenAdd,observedOriginals,[promise]);
    void observationApply(observationThen,promise,[()=>undefined,(error:unknown)=>{observeCausal(error);return undefined;}]);
   }
  }catch(fault){observeCausal(fault);provenanceFailures.push(fault);}
  nestedSeen.add(promise);nested.push(promise);
 }
}
const children=causalChildren.get(error),current=causalLatest.get(error);
if(children){
 const descendants=[...children];
 for(let i=descendants.length-1;i>=0;i--){
  const child=descendants[i];
  if(causalDrift.has(error)&&!current?.children.includes(child)&&!removedRoots.has(child)){
   removedRoots.add(child);nestedRoots.push(child);
  }
  errorStack.push(child); // E/S: unshift (existing order).
 }
}
```
Apply adds separate nestedRoots, not premature classification merge. Only actual
observed drift/removal becomes extra roots, unchanged foreign DAG not flattened.
Capture P/Q from all frames independent of prototype/class/native shape.
Before discovery per existing fixed-point pass:
```ts
const beforeDiscovery=causalRevision;
errorSeen.clear();
for(const node of causalHistory.keys())errorStack.push(node);
```
New nested await =>continue; all waits rescan all nodes. Move originalRoots proof
inside final loop after cleanup and stable originals/nested. Recompute unexpected
originals every candidate seal. Before seal:
```ts
if(causalRevision!==beforeDiscovery||observed<pending.length||observedObservers<provenanceFailures.length||observedNested<nested.length||observedCleanup<cleanupPending.length)continue;
break;
```
Substitutions:apply pending=originalOperations, add observedObservers cursor; no
observedCleanup/cleanupPending in apply or readonly ensure. Ordinary E/S preserve
existing observed/observedCleanup/observedObservers/observedNested. No new budget.

SELF exact:apply445/940 and ensure readonly1598 const settled IIFE =>
let settlement!:Promise<void>; settlement=(async()=>{SAME existing body})();
const settled=settlement. Preserve apply first awaitPromise.resolve447 and SAME work.
Ensure cleanup1132 =>ordinary outer returning ONE inner async-IIFE P; summary
undo1841 same. No outer async/adopting P. Each cleanup invocation knows its OWN P.
Remove/inert old invocation-wide selfSettlements only; never exempt sibling closures.
Exact current self or already-drained actual P/outcome only, no graph borrowing.

APPLY FINAL UNDO explicit addition: current999 moves into ONCE-ISSUED fixed-point
stage; DB algorithm528-576 unchanged except actual first captures:
```ts
let finalUndoIssued=false;
const finalCleanupRoots:unknown[]=[];
// Inside existing collector loop AFTER initial pending/nested stable drains:
if(!finalUndoIssued){
 finalUndoIssued=true;const cleanupOriginal=undo();
 try{await cleanupOriginal;drained.set(cleanupOriginal,{status:'fulfilled',value:undefined});}
 catch(error){drained.set(cleanupOriginal,{status:'rejected',reason:error});observeCausal(error);finalCleanupRoots.push(error);errorStack.push(error);}
 continue;
}
```
No second undo/operation/timer/budget/predicate. Final category priority unexpected
postcheck,immediateUndoFailures,unexpectedOriginalFailures,provenanceFailures,
nestedRoots,finalCleanupRoots, identity dedup; messages/immutable primary unchanged.
Nonexpired paths unchanged. Immediate apply cleanup917/928/934 gets same-invocation
sourceCleanupOutcomes Map and preserves same ordering/failure insertion:
```ts
const cleanupOriginal=undo();
try{await cleanupOriginal;sourceCleanupOutcomes.set(cleanupOriginal,{status:'fulfilled',value:undefined});}
catch(error){observeCausal(error);sourceCleanupOutcomes.set(cleanupOriginal,{status:'rejected',reason:error});immediateUndoFailures.push(error);}
```
Collector drained starts from those actual retained outcomes. Precheck no cleanup.
Ensure five cleanupStep predicates/order unchanged, readonly no cleanup.
Summary ownedCleanup??=1895 memoized once, actual outcome around1901/1902 retained.

PART3 full actual native attachment maps:
APPLY21:428 authorization1;434 precheck;437 authorization2;584 authorization3;
598 authorization4;608 authorization5;648 authorization6;658 authorization7;
676 authorization8;700 authorization9;712 authorization10;722 authorization11;
749 authorization12;761 authorization13;773 authorization14;783 authorization15;
843 authorization16;859 authorization17;883 authorization18;909 authorization19;
923 authorization20.
ENSURE5:1099 run raw;1194/1201/1207/1214 raw; before options.onOriginalOperation/
return deadline.run, existing pending push and duplicate guards preserved.
SUMMARY26:1819 fence;1824 raw;1834 finalFence;1948 authorization;1956 original;
1958 authorization;1965 raw;1967 authorization;1979 authorization;1988 child raw;
1998 originalAdmission;2001 authorization;2010 rawPrior;2013 authorization;2042 raw;
2044 authorization;2079 authorization;2086 originalInsert;2089 authorization;
2100 originalCas;2102 authorization;2113 authorization;2119 rawFence;
2121/2131 authorization;1898 cleanup raw. Deferred commit operationOptions channel
unchanged; no foreign deadline adoption.
WORK3:891/1593/2106 immediately after actual IIFE BEFORE onOwnedWrite.
DISCOVERY5:484/982/1165/1623/1873 actual promise before nested push, not raw promotion.
TOTAL60 static=21+5+26+3+5, exact-P per-invocation dedup, no observer child enrollment.

FIRST observeCausal(binding) in ALL actual catch clauses:
APPLY57:421 observerError;432 error AND432 observerError;439 err;506 observerError;
509 observerError;532 err;542 err;561 err;571 readErr;587 err;591 error AND591 observerError;
601 err;604 error AND604 observerError;611 err;651 err;654 error AND654 observerError;
661 err;679 err;684 error AND684 observerError;703 err;715 err;718 error AND718 observerError;
725 err;752 err;755 error AND755 observerError;764 err;766 err;776 err;779 error AND779 observerError;
786 err;810 err;826 observerError;846 err;851 error AND851 observerError;862 err;866 err;
877 observerError;886 err;898 err;912 err;917 error;919 error;926 err;928 error;934 error;
999 error (moves final undo stage);1005 observerError;1008 observerError.
ENSURE42:1089 observerError;1101/1106/1111/1121/1126/1195/1202/1208/1215/1255/
1268/1290/1295/1308 error;1316 err;1318/1345/1350/1359/1365/1381/1387/1415/
1425/1434/1448/1454/1493/1518/1533/1541/1550/1558/1568/1575/1583/1595 error;
1676 observerError;1679 settlementError;1688 observerError;1691 settlementError.
SUMMARY33:1800 observerError;1810/1815/1820/1830/1835/1902/1944/1952/1961/1972 error;
1980 err;1982 error;2002 err;2005 error;2014 err;2037 error;2045/2080 err;2082 error;
2090 err;2095 error;2103/2108/2114 err;2115 error;2122 err;2124 error;2132 err;
2133 error;2139 err;2145 observerError;2148 settlementError.
Other arrows419/1087/1798 timer error before source add/recorder;
unwrap442/936 =>originalExpiry.catch(error=>{observeCausal(error);return error;});
handledness503/1002/1673/1685/2142 =>catch(error=>{observeCausal(error);return undefined;});
same existing reactions, never enrolled. Every allSettled rejected reason before
original category routing. Direct DB cleanup532/542/561/571 before next await,
no new raw registration for existing direct-DB-await algorithm.

Actual constructors:partial817/868 after SAME ctor/partialCauses.set BEFORE callback:
```ts
observeCausal(partial);
const firstPartial=causalLatest.get(partial);
if(firstPartial)partialFrames.set(partial,firstPartial);
```
826/877 SAME actual constructor argument wrappedCause:err, no partial.cause getter.
Apply native cause504/1003 after same construction:
```ts
observeCausal(cause);
const causeFrame=causalLatest.get(cause);
if(primary.length!==1&&causeFrame&&!causeFrame.unsafe&&!causeFrame.failed&&causeFrame.vector){
 try{options.onExpectedExpiry?.(cause,{wrappedCause:causeFrame.vector.node});}
 catch(observerError){observeCausal(observerError);provenanceFailures.push(observerError);}
}
```
Native copied vector, not primary input. Singleton original cause/message unchanged.
PublicFWD508/1007/1675/1687/2144 capture expired immediately after ctor before
recorder; SAME actual cause arguments apply:cause/ensure:error/summary:err.
Receiver summary1990-1995:
```ts
onExpectedExpiry:(error,provenance)=>{
 observeCausal(error);
 if(provenance){
  const frame=causalLatest.get(error);
  if(frame&&!frame.unsafe&&!frame.failed){
   const cause=frame.effective[0],members=frame.effective[1];
   if(cause&&observationHasOwn(cause,'value')&&cause.value===provenance.wrappedCause){
    expiryWrappers.set(error,{cause:provenance.wrappedCause,frame,kind:'cause'});
   }else if(members&&observationHasOwn(members,'value')&&members.value===provenance.wrappedCause&&frame.vector?.node===provenance.wrappedCause){
    expiryWrappers.set(error,{cause:provenance.wrappedCause,frame,kind:'errors'});
   }
  }
 }else ownExpiryFailures.add(error);
 options.onExpectedExpiry?.(error,provenance);
},
```
Existing exact no-provenance child source channel only; malformed receipt no grant.
Aggregate failures501/576/1000/1248-1250/1669-1670/1938-1939/2151: bind SAME constructor
failure, observe BEFORE registration/throw; named failure observe then same routing.
Scalar cleanup1936 observe errors[0] before scalar throw. No extra constructor/await.
Seven proofs462/959 settled repeats refuse;822/873 emission receiptSeen repeats
continue;1228/1649 ensure;1914 summary seen repeats continue. Existing source
own additions remain same deadline guards; commit operationOptions.deadline emits
own only when===own deadline. Query valid/absent never enrolls/transfers.

Category map:apply445 raw=>originalFailures;apply940 work/raw=>originalFailures;
nested=>nestedRoots, exact outcome order. Ensure1132 work/pending=>originalRoots+
errorStack, cleanupPending=>cleanupRoots+errorStack,nested=>nestedRoots+errorStack.
Ensure1598 same work/pending and nested;summary1841 ordinary ensure categories.
All actual P/outcomes retained before drained exclusion. Final proof only after
raw/nested/observer/cleanup/history stability. Witnesses ensure1253-1259;
summary candidate2082-2086;CAS2091-2100 selectors/authority/ownership unchanged.
undoApprovedSessionSummary2188-2364 has NO EDIT: active branch raw drivers exposed
through actual supplied callback and observed atsummary1898 before outward await;
actual ownedCleanup outcome retained. Legacy branch not silently enrolled.
Preexisting PartialApplyError274 cause-rendering sink is NOT silently fixed.
Full3/3 transfer received; final safe-prior guard,60-site total and final-undo scope
addition explicit. External opaque ancestry unproved; no source/runtime/GO/PASS.

## CURRENT complete consumer packet — graph owner transfer (6/6 received)

Author source_callsite_map; frozen source
9AC10E0C1A6FB5B6284DF50A9C7A88C5F71E1FC0D14CA21287A8BF3F8D2C1E2B.
All addresses below CURRENT anchors, never prospective repins. Shared E509 API.
Receipt type529 becomes Map<unknown,{frame:GraphCausalFrame;accepted:boolean}>.
Owner type524 requires three private ledgers; CreatedByCall713 optional preserves ABI.
Mint at createdCall1134/invocationCreated2029; fallback ??= atinvoke777 before receipt/
native work; owner790-796 shares SAME three objects; created.owner797 unchanged.
RecoveryCreated2217/resumedCreated2380 SAME aliases unchanged; recoverUnder2520
default-created fallback initializes missing ledgers. inspectScribe freshLOCAL causal
context beside originals2594. NO module-global error/promise history.

MODULE type/inert references and private adapters:
```ts
type GraphCausalFrame = NonNullable<ReturnType<typeof WriterDeadline.inspectCausal>>;
interface GraphCausalContext {
  causalHistory?: WeakMap<object, GraphCausalFrame[]>;
  observedOriginals?: WeakSet<Promise<unknown>>;
  observerFailures?: Set<unknown>;
}
const graphApply = Reflect.apply;
const graphThen = Promise.prototype.then;
const graphWeakGet = WeakMap.prototype.get;
const graphWeakSet = WeakMap.prototype.set;
const graphSeenHas = WeakSet.prototype.has;
const graphSeenAdd = WeakSet.prototype.add;
const graphSetHas = Set.prototype.has;
const graphSetAdd = Set.prototype.add;
function rememberGraphCausal(context: GraphCausalContext, root: unknown, pass = new Set<unknown>()): GraphCausalFrame | undefined {
  const queue: unknown[] = [root];
  let first: GraphCausalFrame | undefined;
  for (let next = 0; next < queue.length; next++) {
    const value = queue[next];
    if (graphApply(graphSetHas, pass, [value])) {
      if (next === 0 && value !== null && (typeof value === "object" || typeof value === "function")) {
        const seen = graphApply(graphWeakGet, context.causalHistory!, [value]) as GraphCausalFrame[] | undefined;
        first = seen?.[seen.length - 1];
      }
      continue;
    }
    graphApply(graphSetAdd, pass, [value]);
    if (value === null || (typeof value !== "object" && typeof value !== "function")) continue;
    const born = WriterDeadline.expiryConstruction(value);
    if (born) for (let index = 0; index < born.nativeShape.length; index++) {
      const frame = born.nativeShape[index]!;
      let history = graphApply(graphWeakGet, context.causalHistory!, [frame.node]) as GraphCausalFrame[] | undefined;
      if (!history) { history = []; graphApply(graphWeakSet, context.causalHistory!, [frame.node, history]); }
      let present = false;
      for (let old = 0; old < history.length; old++) if (history[old] === frame) present = true;
      if (!present) history[history.length] = frame;
    }
    let history = graphApply(graphWeakGet, context.causalHistory!, [value]) as GraphCausalFrame[] | undefined;
    const previous = history?.[history.length - 1];
    const frame = WriterDeadline.inspectCausal(value, previous);
    if (!frame) continue;
    if (next === 0) first = frame;
    if (!history) { history = []; graphApply(graphWeakSet, context.causalHistory!, [frame.node, history]); }
    if (!previous || !frame.unchanged) history[history.length] = frame;
    for (let version = 0; version < history.length; version++) {
      const observed = history[version]!;
      for (let child = 0; child < observed.children.length; child++) queue[queue.length] = observed.children[child];
      if (observed.failed) queue[queue.length] = observed.failure;
    }
  }
  return first;
}
function observeGraphOriginal(context: GraphCausalContext, original: Promise<unknown>): void {
  try {
    if (graphApply(graphSeenHas, context.observedOriginals!, [original])) return;
    graphApply(graphSeenAdd, context.observedOriginals!, [original]);
    void graphApply(graphThen, original, [() => undefined, (error: unknown) => {
      try { rememberGraphCausal(context, error); }
      catch (fault) { graphApply(graphSetAdd, context.observerFailures!, [fault]); }
      return undefined;
    }]);
  } catch (fault) { graphApply(graphSetAdd, context.observerFailures!, [fault]); }
}
```
Initializer fields causalHistory:new WeakMap<object,GraphCausalFrame[]>(),
observedOriginals:new WeakSet<Promise<unknown>>(),observerFailures:new Set<unknown>().
Only inert method references module-global. No duplicate reflector/join collector.
Both observation handlers undefined; actual faults negative only; child never
enrolled/returned/awaited/producer/dependency. Extra jobs/handledness disclosed;
same-turn pre-reaction foreign mutation not reconstructible.

THREE receipts778-786(created/created.expectedFailures!),1136-1143(createdCall/
createdCall.expectedFailures!),2031-2038(invocationCreated/invocationCreated.expectedFailures!):
```ts
try {
  const frame = rememberGraphCausal(CONTEXT, error);
  if (!frame || REGISTRY.has(error)) return;
  const wrapped = error instanceof AggregateError ? frame.effective[1] : frame.effective[0];
  const accepted = error instanceof Error && (!provenance || (!!wrapped && Object.hasOwn(wrapped, "value") && Object.is(wrapped.value, provenance.wrappedCause)));
  REGISTRY.set(error, { frame, accepted });
} catch (fault) { graphApply(graphSetAdd, CONTEXT.observerFailures!, [fault]); }
```
First source-construction receipt/accepted flag never relatches. Raw snapshot does
not call receipt arrow; history/native birth never enrolls owner/positive/dependency.

Proof replaces only causal checks inside SAME existing fixed-point loops/growth:
```ts
if (!receipt.accepted || receipt.frame.unsafe || receipt.frame.failed) continue;
let rejectedShape = false;
const history = CONTEXT.causalHistory!.get(receipt.frame.node) ?? [];
for (let version = 0; version < history.length; version++) {
  const observed = history[version]!;
  if (observed.unsafe || observed.failed) { rejectedShape = true; break; }
  const compared = WriterDeadline.inspectCausal(error, observed);
  if (!compared || !compared.unchanged || compared.unsafe || compared.failed) { rejectedShape = true; break; }
}
if (rejectedShape) continue;
const born = WriterDeadline.expiryConstruction(error);
const current = WriterDeadline.inspectCausal(error, receipt.frame);
if (!current || !current.unchanged || current.unsafe || current.failed || (born && !born.unchanged)) continue;
let acceptedChildren = true;
for (let child = 0; child < current.children.length; child++) {
  if (!graphApply(graphSetHas, EXPECTED_SET, [current.children[child]])) { acceptedChildren = false; break; }
}
if (!acceptedChildren) continue;
EXPECTED_SET.add(error); grew = true;
```
Retain existing initial expected/forced or positive gates. Proof tuples:
954 owner/expected;1263 createdCall/expected;1385 createdCall/expected;
1654 created/expected;1730 created/expected;1876 owner/expected;
2441 invocationCreated/expected;2459 invocationCreated/positive.
Every observed shape divergence vetoes even restored; undefined child requires
genuine scoped positive. Last current check AFTER all-history/birth, no await.

SEVEN discovery closures add drainedIdentities:Set<Promise<unknown>> AND
drainedFailures:Map<Promise<unknown>,unknown>, widen nested/joined toPromise<unknown>.
Keep original/work/commit/cleanup/nested outcome routing FIRST, then drained ID;
rejecting P maps exact reason including undefined (Map.has). Merge observerFailures
into roots ANDforced before each queue round. Class/getter traversal becomes:
```ts
const capturePass = new Set<unknown>();
const queue = [...roots];
const discoveryPass = new Set<unknown>();
while (queue.length) {
  const error = queue.pop();
  if (discoveryPass.has(error)) continue;
  discoveryPass.add(error); visited.add(error);
  const current = rememberGraphCausal(CONTEXT, error, capturePass);
  if (!current) continue;
  const history = CONTEXT.causalHistory!.get(current.node)!;
  for (let version = 0; version < history.length; version++) {
    const frame = history[version]!;
    if (frame.unsafe || frame.failed) { roots.add(error); forced.add(error); }
    if (frame.failed) { roots.add(frame.failure); forced.add(frame.failure); queue[queue.length] = frame.failure; }
    for (let child = 0; child < frame.children.length; child++) queue[queue.length] = frame.children[child];
    for (let child = 0; child < frame.settlements.length; child++) {
      const operation = frame.settlements[child]!;
      if (operation === SELF) continue;
      if (drainedIdentities.has(operation)) {
        if (drainedFailures.has(operation)) {
          const reason = drainedFailures.get(operation);
          roots.add(reason); forced.add(reason); forced.add(error);
          // ONLY resume2418 also: settlementFailures.add(reason).
        }
        continue;
      }
      const parents = nested.get(operation) ?? new Set<unknown>();
      parents.add(error); nested.set(operation, parents);
    }
  }
}
```
Tuple CONTEXT/SELF:924 owner/settlement;1237 createdCall/cleanup;1362 createdCall/cleanup;
1631 created/settled;1707 created/cleanup;1853 owner/cleanup;2418 invocationCreated/settled.
Per-round discoveryPass dedups cycles; old visited not suppressing post-await capture.
Existing unjoined/allSettled/parent-forced/stable lists/cleanup/envelopes preserved.
Rejected drained reason+parent negative preserved, not bare completed-P exemption.

EXACT local self bindings:compensate861 loses outer async and returns ONE inner
async-IIFE actual P, no extra async creator/adoption/await:
```ts
const compensate=(/* SAME args/defaults */)=>{
 let settlement!:Promise<void>;
 settlement=(async()=>{ /* SAME existing collector body with SELF===settlement */ })();
 return settlement;
};
```
Six const-IIFEs1218/1344/1600/1684/1822/2398 become let+assignment, inspect2745 same.
Before returned/public exposure P assigned; before initial await no newly unexposed
self P can already be an error data edge. Different prior P not skipped.
No opaque parent ancestry or public dependency grant.

EIGHTH inspect closure:context freshcausal at2594. Original observer seams2603/
2611/2619/2635/2642/2658/2666/2678/2684/2699/2707/2712/2719,reading2739 before2740 race.
OwnDOMException/caller/deadline listeners/abortSource/final2770-2773 unchanged.
ONLY catch-settled2745-2769 replacement:
```ts
let settled!: Promise<void>;
settled = (async () => {
  const errors: unknown[] = [];
  const executions: unknown[] = [err];
  const drainedIdentities = new Set<Promise<unknown>>();
  const drainedFailures = new Map<Promise<unknown>, unknown>();
  const reportedDrained = new Set<Promise<unknown>>();
  const metadataFailures = new Set<unknown>();
  if (reading) {
    const finished = await Promise.allSettled([reading]);
    executions.push(...finished.flatMap(value => value.status === "rejected" ? [value.reason] : []));
    const outcome = finished[0]!;
    if (outcome.status === "rejected") drainedFailures.set(reading, outcome.reason);
    drainedIdentities.add(reading);
  }
  let drained = 0;
  const nested = new Set<Promise<unknown>>();
  const joined = new Set<Promise<unknown>>();
  const seen = new Set<unknown>();
  for (;;) {
    while (drained < originals.length) {
      const batch = originals.slice(drained); drained += batch.length;
      const finished = await Promise.allSettled(batch);
      for (let index = 0; index < finished.length; index++) {
        const value = finished[index]!;
        if (value.status === "rejected") {
          errors.push(value.reason); executions.push(value.reason);
          drainedFailures.set(batch[index]!, value.reason);
        }
        drainedIdentities.add(batch[index]!);
      }
    }
    for (const fault of causal.observerFailures!) {
      if (!metadataFailures.has(fault)) {
        metadataFailures.add(fault); errors.push(fault); executions.push(fault);
      }
    }
    const capturePass = new Set<unknown>();
    const discoveryPass = new Set<unknown>();
    const queue = [...executions];
    while (queue.length) {
      const failure = queue.pop();
      if (discoveryPass.has(failure)) continue;
      discoveryPass.add(failure); seen.add(failure);
      const current = rememberGraphCausal(causal, failure, capturePass);
      if (!current) continue;
      const history = causal.causalHistory!.get(current.node)!;
      for (let version = 0; version < history.length; version++) {
        const frame = history[version]!;
        if ((frame.unsafe || frame.failed) && !metadataFailures.has(failure)) {
          metadataFailures.add(failure); errors.push(failure);
        }
        if (frame.failed && !metadataFailures.has(frame.failure)) {
          metadataFailures.add(frame.failure); errors.push(frame.failure); executions.push(frame.failure);
          queue[queue.length] = frame.failure;
        }
        for (let child = 0; child < frame.children.length; child++) queue[queue.length] = frame.children[child];
        for (let child = 0; child < frame.settlements.length; child++) {
          const operation = frame.settlements[child]!;
          if (operation === settled) continue;
          if (drainedIdentities.has(operation)) {
            if (drainedFailures.has(operation) && !reportedDrained.has(operation)) {
              reportedDrained.add(operation);
              const reason = drainedFailures.get(operation);
              errors.push(reason); executions.push(reason); queue[queue.length] = reason;
            }
            continue;
          }
          nested.add(operation);
        }
      }
    }
    const unjoined = [...nested].filter(operation => !joined.has(operation));
    if (unjoined.length) {
      for (const operation of unjoined) joined.add(operation);
      const finished = await Promise.allSettled(unjoined);
      for (let index = 0; index < finished.length; index++) {
        const value = finished[index]!;
        if (value.status === "rejected") {
          errors.push(value.reason); executions.push(value.reason);
          drainedFailures.set(unjoined[index]!, value.reason);
          reportedDrained.add(unjoined[index]!);
        }
        drainedIdentities.add(unjoined[index]!);
      }
      continue;
    }
    if (drained < originals.length) continue;
    break;
  }
  if (errors.length) throw new AggregateError([err, ...errors], "Scribe inspection original settlement failed.");
})();
```
Nested rejection roots rediscovered; metadata dedup only new faults, never erases
original errors. Report once per actual P, including rejected undefined.

FINAL negative shape guard applied at ALL seven discovery and propagation sites,
before children/P union; divergent adds originalroot to roots+forced:
```ts
const born = WriterDeadline.expiryConstruction(error);
let divergent = !!born && !born.unchanged;
for (let version = 0; version < history.length; version++) {
  const observed = history[version]!;
  const compared = WriterDeadline.inspectCausal(error, observed);
  if (observed.unsafe || observed.failed || !compared || !compared.unchanged || compared.unsafe || compared.failed) { divergent = true; break; }
}
```
Inspect substitutes failure and metadataFailures.add/errors.push if divergent,
leaving all original entries. This completes mutated/unreadable negative binding.

Propagation975-979 inside SAME while, propagationPass beside queue:
```ts
const error = propagationQueue.pop();
if (propagated.has(error)) continue;
propagated.add(error);
const current = rememberGraphCausal(owner, error, propagationPass);
if (!current) continue;
const history = owner.causalHistory!.get(current.node)!;
for (let version = 0; version < history.length; version++) {
  const frame = history[version]!;
  if (frame.unsafe || frame.failed) { roots.add(error); forced.add(error); }
  if (frame.failed) { roots.add(frame.failure); forced.add(frame.failure); propagationQueue[propagationQueue.length] = frame.failure; }
  for (let child = 0; child < frame.children.length; child++) propagationQueue[propagationQueue.length] = frame.children[child];
}
```
Same divergent negative above; no joins/positives here. Live-budget propagation986 same.

DisposedFence988-991 retain exact fencedTerminal/deadline/signal/forced/class-rejection/
originalFailures exact-disposition gates; replace only own-cause foreign read:
```ts
let disposedCausal = true;
const causal = rememberGraphCausal(owner, error);
if (causal) {
  const history = owner.causalHistory!.get(causal.node)!;
  for (let version = 0; version < history.length; version++) {
    const frame = history[version]!;
    const compared = WriterDeadline.inspectCausal(error, frame);
    if (frame.unsafe || frame.failed || frame.effective[0] !== undefined || frame.effective[1] !== undefined || frame.effective[2] !== undefined ||
        !compared || !compared.unchanged || compared.unsafe || compared.failed) { disposedCausal = false; break; }
  }
  const born = WriterDeadline.expiryConstruction(error);
  const current = WriterDeadline.inspectCausal(error, causal);
  if (!current || !current.unchanged || current.unsafe || current.failed || (born && !born.unchanged)) disposedCausal = false;
}
```
Primitive exact-disposition behavior stays; causal/accessor/inherited ambiguity refuses.

Single-member unwrap1419/2497, same Aggregate gate and err throw:
```ts
const frame = WriterDeadline.inspectCausal(failure);
let lengthDescriptor: Readonly<PropertyDescriptor> | undefined;
let firstDescriptor: Readonly<PropertyDescriptor> | undefined;
if (frame?.vector) for (let index = 0; index < frame.vector.descriptors.length; index++) {
  const entry = frame.vector.descriptors[index]!;
  if (entry[0] === "length") lengthDescriptor = entry[1];
  if (entry[0] === "0") firstDescriptor = entry[1];
}
if (failure instanceof AggregateError && frame && !frame.unsafe && !frame.failed &&
    lengthDescriptor && Object.hasOwn(lengthDescriptor,"value") && lengthDescriptor.value === 1 &&
    firstDescriptor && Object.hasOwn(firstDescriptor,"value") && Object.is(firstDescriptor.value,err)) throw err;
```
Otherwise same failure. D0512459 DISTINCT positive from forced-aware2441. Keep2477-2480
cleanupFailures0/settlementFailures1/soleProviderAuthorizationRefusedError/positive
membership/ALLrootspositive. Equivalent bounded ALL membership if replacing every:
```ts
let allPositive=true;
for(const root of roots)if(!graphApply(graphSetHas,positive,[root])){allPositive=false;break;}
```
Use allPositive, dropping no conjunct. Drained rejection also settlementFailures.

FULL observation expansion map: existing push SAME, then observe SAMEactualP before
await/race/outwardcallback. OnOwnedWrite undo+original pending same. No work-only push.
OWNER32:141 original;212 original;216 original;260 raw;305 originalSettlement;307 recording;
354 originalSettlement;357 raw;360 writing;420 existingReading;429 absenceReading;438 work;
473 existingReading;482 absenceReading;491 work;665 reading;677 fenceReading;
688 raw AND wholeoriginal;696 raw AND wholeoriginal;809 fenceReading;821 grantReading;
824 sessionReading;839 claimReading;844 finalFenceReading;1090 raw;1091 committing;
1478 writing;1565 releasing;1801 raw;1802 committing.
createdCall12:1148/1151/1152/1153/1158/1159 original;1179 reading;1184 sessionReading;
1189 fenceReading;1195 raw;1197 originalSettlement;1212 originalReading.
invocationCreated32:2043/2045/2046 original;2081 raw;2095/2098/2109 original;
2139 acquisition;2173/2175/2178/2180 original;2201 cleanupOriginal;2229/2235/2239 original;
2240 rawANDwholeoriginal;2242 original;2271 rawANDwholeoriginal;2298 insertion;
2322/2324/2327/2329 original;2350 cleanupOriginal;2365/2367 original;
2368 rawANDwholeoriginal;2370 original.
recoveryCreated1:2223 snapshotReading;recoverUnder created1:2525 rawcallback.
currentAuthority optionalpending4:2055 grantReading;2058 sessionReading;2061 fenceReading;
2067 snapshotReading. Observe under invocationCreated even undefined pending, no new push.
inspect13:2603 discoveryReading;2611 grantReading;2619 raw;2635 finalGrantReading;
2642 raw;2658 sessionReading;2666 snapshotReading;2678 claimReading;2684/2699 raw;
2707 finalGrantReading;2712 finalSessionReading;2719 raw.
Census95 seams/90 matchedlines=owner30pending+2committing+12+32+1+1+4+13.

WORK7 exact:
1005 await owner.authorize;const invoking=invoke(deadline.signal);observeGraphOriginal(owner,invoking);
const result=await invoking;await owner.authorize;same result handling.
1011 owner.work=work thenobserve before1014run;
1590 const originalWork=work();observeGraphOriginal(created,originalWork);result=await originalWork;
2184/2333 continuity after SAMEIIFE before2185/2334 races, native2189/2338 flags unchanged;
2524 SAME deps.authorize call once/raw2525 same, observe created wholeP then same deadline.run,
WITHOUT wholeP pending push;2739 reading before2740race.

Actual cleanup-P7:909/1229/1354/1623/1699/1845/2410 owner/createdCall/createdCall/
created/created/owner/invocationCreated:
```ts
let originalCleanup:Promise<void>|undefined;
try{
 originalCleanup=cleanups[cleanupIndex]!();
 observeGraphOriginal(CONTEXT,originalCleanup);
 await originalCleanup;
}catch(error){
 // SAME original roots/forced/(resume cleanupFailures) additions FIRST.
 if(originalCleanup)drainedFailures.set(originalCleanup,error);
}finally{if(originalCleanup)drainedIdentities.add(originalCleanup);}
```
Synchronous throw no P invented; no second call/enrollment.

Graph.invoke-P4:1334/2385/2547/2550 contextscreatedCall/resumedCreated/created/created;
replace only original ()=>graph.invoke(EXACTARGS):
```ts
()=>{const original=graph.invoke(EXACTARGS);observeGraphOriginal(CONTEXT,original);return original;}
```
Same approvalInvocation.run/config/receiver/args/output/error/P.
Logical/budget4:1320 recordSessionTranscript;1325 recordSessionConcerns;1332 conditional
escalateSessionFlags bind SAMEactual callP observecreatedCall then sameawait, no push.
1332 original escalation run callback:
```ts
run:work=>{observeGraphOriginal(createdCall,work);return deadline.run(work);}
```
Same work/expiresAt/signal/background policy.
TOTAL117 static=95registry+7work+7cleanup+4invoke+4logical/budget, per-invocation P dedup.
Exclude observer child,publiccleanupcollector,Promise.race/allSettled composedP,
native producer originalExpiry788/1145/2040 and arbitrary discovered settlement from
raw observation enrollment. Existing native timer catches/receipt route unchanged;
discovered real native P joins original collector, no positive ownership transfer.

Source constructor immediate own Aggregate.errors provenance same data, removed
invalidACK/refusal receipts stayremoved. Privateapproval255;adapter419/428/472/481;
compiler400;owner797;start1129;underLease1585;resume2020;recover2510 are CURRENT pins.
Observer additions move lines; final numerical fixtures must be measured from frozen
future source bytes, same method/selector/phase. Exact adapter discovery callstring
collection.findOne(logical,owner.deadline.op-wrapper) unchanged; no regex loosening,
dropped F/I/primary-null/ordering gate. Entire6/6 transferred; no source edits/
runtime/GO/approval/PASS, cross-parent opaque ancestry unproved.

### FINAL nodes drained-rejection correction (supersedes bare skip above)

Exact owner correction: add drainedFailures Map<Promise<unknown>,unknown> at1608-14.
At EACH completed drain, keep original category/forced/nestedFailures/allparents
routing FIRST; rejected observeCausal(reason),roots.add(reason),
drainedFailures.set(actualP,reason), THEN drainedNative.add(actualP). Undo catch same
actualP/reason before drainedmark; Map.has distinguishes rejectedundefined.
Replace only settlement subloop in nodes discovery1643-1654:
```ts
for(const promise of frame.settlements){
 if(promise===settled||promise===earlyCleanup)continue;
 const parents=nested.get(promise)??new Set<unknown>();
 parents.add(error);nested.set(promise,parents);
 if(drainedFailures.has(promise)){
  const reason=drainedFailures.get(promise);
  observeCausal(reason);
  roots.add(reason);forced.add(reason);
  nestedFailures.set(promise,reason);
  for(const parent of parents)forced.add(parent);
  joined.add(promise);
  continue;
 }
 if(nestedFailures.has(promise))forced.add(error);
 if(drainedNative.has(promise)){
  joined.add(promise);
  continue;
 }
 observePromise(promise);
}
```
joined identity guard prevents existing nested.keys unjoined from rejoining completed
P. Rejecting completed P's SAMEactualreason and ALL known/late parents forced BEFORE
continue. Self/earlyCleanup unchanged; no classification/authority/ancestry grant.

## CURRENT complete test packet — fixture owner parts1/2/3a/3b

Author persistence_fixture_d070. Source input pins:
erasure.test.ts4D204921455BCB4B2464C2A6652BF6D22175FA7FBC88659F77B0C9698368F683;
scribe-checkpointer.test.ts2D4585241B3884938393A5BB878F029BFD8976EB20DCD52EAEA892CEB412ECB2.
Existing imports only:WriterDeadline/typeWriterCausalFrame in erasure;nativeTypes
from node:util andrecordRejectReasons/typeWriterCausalFrame in checkpointer.
No new title/callback/helper/file. All original statements/16/33/128 remain.
Proposed code only; nothing executed.

PART1 append existing D016 deadline callback1611 after original1649:
```ts
const native = new WriterDeadline(40); const disposed = new WriterDeadline(40); disposed.dispose();
const heldNative = new Promise<void>(() => undefined); let abortReason: unknown; let abortThrown: unknown; let abortBirth: ReturnType<typeof WriterDeadline.expiryConstruction>; let abortBeforeReaction = false; let reacted = false;
const onAbort = () => { abortReason = native.signal.reason; abortBeforeReaction = !reacted; try { native.signal.throwIfAborted(); } catch (error) { abortThrown = error; } abortBirth = WriterDeadline.expiryConstruction(abortReason); };
native.signal.addEventListener("abort", onAbort, { once: true });
try {
 const firstP = native.run(heldNative); const secondP = native.run(heldNative); assert.notEqual(firstP, secondP);
 const firstSeen = firstP.then(() => assert.fail("held native work cannot win"), error => { reacted = true; return error; }); const secondSeen = secondP.then(() => assert.fail("held native work cannot win"), error => error);
 const [firstError, secondError] = await Promise.all([firstSeen, secondSeen]);
 assert.strictEqual(firstError, abortReason); assert.strictEqual(secondError, abortReason); assert.strictEqual(abortThrown, abortReason); assert.ok(abortBeforeReaction); assert.ok(native.signal.aborted);
 assert.ok(abortBirth?.unchanged); assert.strictEqual(abortBirth.nativeShape[0]!.node, abortReason); assert.ok(Object.isFrozen(abortBirth)); assert.ok(Object.isFrozen(abortBirth.nativeShape));
 assert.equal(disposed.signal.aborted, false); assert.equal(await disposed.run(Promise.resolve("disposed-work")), "disposed-work"); const beforeFailure = new Error("native pre-abort original"); assert.strictEqual(await disposed.run(Promise.reject(beforeFailure)).catch(error => error), beforeFailure); assert.equal(WriterDeadline.expiryConstruction(beforeFailure), undefined);
 let opA: unknown; let opB: unknown; try { native.op(); } catch (error) { opA = error; } try { native.op(); } catch (error) { opB = error; }
 assert.ok(opA instanceof FencedWriterDeadlineError); assert.ok(opB instanceof FencedWriterDeadlineError); assert.notStrictEqual(opA, opB); assert.notStrictEqual(opA, abortReason); assert.ok(WriterDeadline.expiryConstruction(opA)?.unchanged); assert.ok(WriterDeadline.expiryConstruction(opB)?.unchanged); assert.strictEqual(native.signal.reason, abortReason);
 for (const key of ["inspectCausal", "expiryConstruction"] as const) { const descriptor = Object.getOwnPropertyDescriptor(WriterDeadline, key)!; assert.equal(descriptor.writable, false); assert.equal(descriptor.configurable, false); }
 assert.equal(WriterDeadline.inspectCausal(7), undefined); assert.equal(WriterDeadline.expiryConstruction(7), undefined);
} finally { native.signal.removeEventListener("abort", onAbort); native.dispose(); disposed.dispose(); }
```
Actual SAME E from two real runs/signal/throwIfAborted; source abort-before-fire is
static proof only. disposed40 timer remains clear when other actual40 timer fires.

PART2 append existing erasure2202 callback after original2229 cleanup assertion:
```ts
const shapeDeadline = new WriterDeadline(40); const neverShape = new Promise<void>(() => undefined);
try {
 await shapeDeadline.run(neverShape).catch(() => undefined);
 for (const phase of ["sync", "microtask", "after-authenticated-frame"] as const) for (const fault of ["prototype", "cause", "errors", "settled", "getter-cause", "getter-errors", "getter-settled", "sparse", "revoked-vector", "iterator"] as const) {
  let root: unknown; try { shapeDeadline.op(); } catch (error) { root = error; } assert.ok(root instanceof FencedWriterDeadlineError);
  let before = WriterDeadline.inspectCausal(root)!; assert.ok(before && !before.unsafe && !before.failed); assert.ok(Object.isFrozen(before)); assert.ok(Object.isFrozen(before.descriptors)); assert.ok(Object.isFrozen(before.chain)); assert.ok(Object.isFrozen(before.effective)); assert.ok(Object.isFrozen(before.children)); assert.ok(Object.isFrozen(before.settlements)); assert.ok(WriterDeadline.expiryConstruction(root)?.unchanged);
  const P = Object.getOwnPropertyDescriptor(root, "settled")!.value as Promise<unknown>; const Q = Promise.resolve(); const leaf = new Error(`shape-${fault}`); let getterReads = 0; let proxyTraps = 0;
  if (phase === "microtask") await Promise.resolve(); if (phase === "after-authenticated-frame") { before = WriterDeadline.inspectCausal(root, before)!; assert.equal(before.unchanged, true); }
  if (fault === "prototype") { Object.setPrototypeOf(root, AggregateError.prototype); Object.defineProperty(root, "errors", { value: [], writable: true, configurable: true }); }
  else if (fault === "cause") Object.defineProperty(root, "cause", { value: leaf, writable: true, configurable: true });
  else if (fault === "errors") { Object.setPrototypeOf(root, AggregateError.prototype); Object.defineProperty(root, "errors", { value: [leaf], writable: true, configurable: true }); }
  else if (fault === "settled") Object.defineProperty(root, "settled", { value: Q, writable: true, configurable: true });
  else if (fault.startsWith("getter-")) { const field = fault.slice(7); Object.defineProperty(root, field, { configurable: true, get: () => { getterReads++; throw leaf; } }); }
  else if (fault === "sparse") { const vector = new Array<unknown>(4294967295); vector[7] = leaf; Object.setPrototypeOf(root, AggregateError.prototype); Object.defineProperty(root, "errors", { value: vector, writable: true, configurable: true }); }
  else if (fault === "revoked-vector") { const revoked = Proxy.revocable([], { get: () => { proxyTraps++; throw leaf; }, getPrototypeOf: () => { proxyTraps++; throw leaf; }, ownKeys: () => { proxyTraps++; throw leaf; }, getOwnPropertyDescriptor: () => { proxyTraps++; throw leaf; } }); revoked.revoke(); Object.defineProperty(root, "errors", { value: revoked.proxy, writable: true, configurable: true }); }
  else { const vector = [leaf]; Object.defineProperty(vector, Symbol.iterator, { configurable: true, get: () => { getterReads++; throw leaf; } }); Object.defineProperty(root, "errors", { value: vector, writable: true, configurable: true }); }
  const after = WriterDeadline.inspectCausal(root, before)!; assert.equal(after.unchanged, false); assert.equal(WriterDeadline.expiryConstruction(root)?.unchanged, false); assert.equal(getterReads, 0); assert.equal(proxyTraps, 0); assert.strictEqual(before.effective[2]!.value, P); assert.strictEqual(before.settlements[0], P);
  if (fault === "cause" || fault === "errors" || fault === "iterator") assert.ok(after.children.includes(leaf));
  if (fault === "settled") { assert.ok(after.settlements.includes(Q)); assert.notStrictEqual(P, Q); assert.ok(before.settlements.includes(P)); }
  if (fault.startsWith("getter-") || fault === "sparse" || fault === "revoked-vector") { assert.equal(after.unsafe, true); assert.equal(after.failed, false); }
  if (fault === "sparse") { assert.equal(after.children.length, 1); assert.strictEqual(after.children[0], leaf); assert.equal(after.vector!.keys.length, 2); assert.equal(after.vector!.keys[0], "7"); assert.equal(after.vector!.keys[1], "length"); }
  const forged = Proxy.revocable({}, { get: () => { proxyTraps++; throw leaf; }, getPrototypeOf: () => { proxyTraps++; throw leaf; }, ownKeys: () => { proxyTraps++; throw leaf; }, getOwnPropertyDescriptor: () => { proxyTraps++; throw leaf; } }); forged.revoke();
  assert.equal(WriterDeadline.inspectCausal(root, forged.proxy as unknown as WriterCausalFrame)!.unchanged, false); const unsafe = WriterDeadline.inspectCausal(forged.proxy)!; assert.equal(unsafe.unsafe, true); assert.equal(unsafe.failed, false); assert.equal(unsafe.prototype, null); assert.equal(unsafe.chain.length, 0); assert.equal(unsafe.children.length, 0); assert.equal(unsafe.settlements.length, 0); assert.equal(proxyTraps, 0); assert.equal(WriterDeadline.expiryConstruction(forged.proxy), undefined);
 }
 let decorated: unknown; try { shapeDeadline.op(); } catch (error) { decorated = error; } assert.ok(decorated instanceof FencedWriterDeadlineError); const decoratedBefore = WriterDeadline.inspectCausal(decorated)!; Object.defineProperty(decorated, "pregelTaskId", { value: "real-framework-compatible-extra", configurable: true }); Object.defineProperty(decorated, "name", { value: "decorated", configurable: true }); Object.defineProperty(decorated, "stack", { value: "decorated", configurable: true }); assert.equal(WriterDeadline.inspectCausal(decorated, decoratedBefore)!.unchanged, true); assert.equal(WriterDeadline.expiryConstruction(decorated)?.unchanged, true);
 // Part5a every-poison block inserts here before finally.
} finally { shapeDeadline.dispose(); }
```
Unit after-authenticated-frame does NOT claim actual source first receipt; compiled
next block does. Huge synchronous loop cannot be preempted by Node callback timeout.

PART3a/3b append ONLY normalcheckpointer122 tail AFTER original435-437, before438
closure;16 non-normal early-return139-433 untouched:
```ts
const causalCases: ReadonlyArray<readonly ["sync"|"microtask"|"post-receipt", "clean"|"pregel"|"prototype"|"cause"|"errors"|"settled"|"getters"|"sparse"|"revoked-vector"|"revoked-raw"]> = [["sync","clean"],["sync","pregel"],["sync","getters"],["sync","sparse"],["sync","revoked-vector"],["sync","revoked-raw"],["sync","prototype"],["microtask","prototype"],["post-receipt","prototype"],["sync","cause"],["microtask","cause"],["post-receipt","cause"],["sync","errors"],["microtask","errors"],["post-receipt","errors"],["sync","settled"],["microtask","settled"],["post-receipt","settled"]];
for (const [phase, fault] of causalCases) {
 const threadId = `causal-${phase}-${fault}`; const input = baseInput({sessionId:`session-${threadId}`}); const graph = compileScribeGraph(deps,{checkpointer:createScribeCheckpointer(tenantScopedClient(fake.client,"scribe-test"))});
 const beforeRows = Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()])); const beforeBytes = BSON.serialize(beforeRows,{ignoreUndefined:false});
 const rows = fakeDb.collection<any>(COLLECTION_NAMES.scribe_checkpoints); const originalFind = rows.findOne.bind(rows); const originalInvoke = graph.invoke.bind(graph); const originalRunDescriptor = Object.getOwnPropertyDescriptor(WriterDeadline.prototype,"run")!; const originalRun = originalRunDescriptor.value as WriterDeadline["run"];
 let openRaw!:()=>void; let enterRaw!:()=>void; const rawHeld = new Promise<void>(resolve=>{openRaw=resolve;}); const rawReady = new Promise<void>(resolve=>{enterRaw=resolve;}); let raw:Promise<unknown>|undefined; let rawObserved:Promise<{value:unknown}|{error:unknown}>|undefined; let once=true;
 let signal:AbortSignal|undefined; let reason:unknown; let thrownReason:unknown; let birth:ReturnType<typeof WriterDeadline.expiryConstruction>; let abortBeforeReaction=false; let reactionSeen=false; let mutationDone=false; let mutationError:unknown; let getterReads=0; let proxyTraps=0; let rawFault:unknown;
 const leaf = new Error(`PRIVATE_CAUSAL_${phase}_${fault}`); let rejectQ!:(error:unknown)=>void; const Q=new Promise<void>((_resolve,reject)=>{rejectQ=reject;}); void Q.catch(()=>undefined); let QUsed=false;
 const observed:unknown[]=[]; const runs:Array<{deadline:WriterDeadline;returned:Promise<unknown>}> = []; let postQueued=false;
 const mutate = ()=>{try {
  if (fault==="prototype") {Object.setPrototypeOf(reason,AggregateError.prototype);Object.defineProperty(reason,"errors",{value:[],writable:true,configurable:true});Object.defineProperty(reason,"settled",{value:Q,writable:true,configurable:true});QUsed=true;}
  else if (fault==="cause") Object.defineProperty(reason,"cause",{value:leaf,writable:true,configurable:true});
  else if (fault==="errors") {Object.setPrototypeOf(reason,AggregateError.prototype);Object.defineProperty(reason,"errors",{value:[leaf],writable:true,configurable:true});}
  else if (fault==="settled") {Object.defineProperty(reason,"settled",{value:Q,writable:true,configurable:true});QUsed=true;}
  else if (fault==="pregel") Object.defineProperty(reason,"pregelTaskId",{value:"compatible-extra",writable:true,configurable:true});
  else if (fault==="getters") for (const field of ["cause","errors","settled"]) Object.defineProperty(reason,field,{configurable:true,get:()=>{getterReads++;throw leaf;}});
  else if (fault==="sparse") {const vector=new Array<unknown>(4294967295);vector[7]=leaf;Object.setPrototypeOf(reason,AggregateError.prototype);Object.defineProperty(reason,"errors",{value:vector,writable:true,configurable:true});}
  else if (fault==="revoked-vector" || fault==="revoked-raw") {const revoked=Proxy.revocable(fault==="revoked-vector"?[]:{},{get:()=>{proxyTraps++;throw leaf;},getPrototypeOf:()=>{proxyTraps++;throw leaf;},ownKeys:()=>{proxyTraps++;throw leaf;},getOwnPropertyDescriptor:()=>{proxyTraps++;throw leaf;}});revoked.revoke();if(fault==="revoked-vector")Object.defineProperty(reason,"errors",{value:revoked.proxy,writable:true,configurable:true});else rawFault=revoked.proxy;}
  mutationDone=true;
 } catch(error){mutationError=error;}};
 const onAbort=()=>{try {reason=signal!.reason;abortBeforeReaction=!reactionSeen;try{signal!.throwIfAborted();}catch(error){thrownReason=error;}birth=WriterDeadline.expiryConstruction(reason);if(phase==="sync")mutate();else if(phase==="microtask")queueMicrotask(mutate);}catch(error){mutationError=error;}};
 let attempt:Promise<{value:unknown}|{error:unknown}>|undefined; let exposed:FencedWriterDeadlineError|undefined; let closure:Promise<{value:unknown}|{error:unknown}>|undefined; let closureDone=false;
 try {
  Object.defineProperty(WriterDeadline.prototype,"run",{...originalRunDescriptor,value:function<T>(this:WriterDeadline,work:Promise<T>):Promise<T>{const returned=originalRun.call(this,work) as Promise<T>;const row={deadline:this,returned};runs.push(row);for(let observer=0;observer<2;observer++)void Promise.prototype.then.call(returned,()=>undefined,(error:unknown)=>{try{if(this.signal===signal&&error===signal!.reason){reactionSeen=true;observed.push(error);if(phase==="post-receipt"&&!postQueued&&runs.find(item=>item.deadline.signal===signal)===row){postQueued=true;queueMicrotask(mutate);}}}catch(failure){mutationError=failure;}});return returned;}});
  graph.invoke=((...args:Parameters<typeof originalInvoke>)=>{signal=args[1]?.signal;assert.ok(signal instanceof AbortSignal);signal.addEventListener("abort",onAbort,{once:true});return originalInvoke(...args);}) as typeof graph.invoke;
  rows.findOne=((...args:Parameters<typeof originalFind>)=>{const filter=args[0] as Record<string,unknown>;if(!once||filter.tenantId!=="scribe-test"||filter.thread_id!==threadId||typeof filter.checkpoint_id!=="string"||typeof filter.checkpoint_ns!=="string")return originalFind(...args);once=false;const operation=(async()=>{const actual=await originalFind(...args);assert.equal(actual,null);enterRaw();await rawHeld;if(rawFault!==undefined)throw rawFault;return actual;})();raw=operation;rawObserved=operation.then(value=>({value}),error=>({error}));return operation;}) as typeof rows.findOne;
  attempt=startScribe(graph,input,{threadId,writerDeadlineMs:200}).then(value=>({value}),error=>({error}));
  const reached=await Promise.race([rawReady.then(()=>({reached:true})),attempt]);assert.ok("reached"in reached&&raw&&rawObserved);const providerAtHold=deps.provider.calls.length;
  const terminal=await attempt;assert.ok("error"in terminal&&terminal.error instanceof FencedWriterDeadlineError);if(!("error"in terminal)||!(terminal.error instanceof FencedWriterDeadlineError))throw new Error("causal probe failed typed original deadline");exposed=terminal.error;
  assert.equal(mutationError,undefined);assert.ok(mutationDone);assert.strictEqual(reason,thrownReason);assert.ok(abortBeforeReaction);assert.ok(observed.length>=2);for(const observedError of observed)assert.strictEqual(observedError,reason);assert.ok(birth?.unchanged,"captured birth was clean BEFORE caller mutation");
  const changed = !["clean","pregel","revoked-raw"].includes(fault); assert.equal(WriterDeadline.expiryConstruction(reason)?.unchanged,!changed);
  const primaryCause=Object.getOwnPropertyDescriptor(exposed,"cause");closure=exposed.settled.then(value=>{closureDone=true;return{value};},error=>{closureDone=true;return{error};}); await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(closureDone,false,"source closure waits actual held raw driver");openRaw();const rawResult=await rawObserved;
  if(fault==="revoked-raw"){assert.ok("error"in rawResult);if("error"in rawResult)assert.strictEqual(rawResult.error,rawFault);}else assert.deepEqual(rawResult,{value:null});
  if(QUsed){await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(closureDone,false,"after raw closure, actual substituted Q remains required");rejectQ(leaf);}else rejectQ(leaf);
  const outcome=await closure;
  if(fault==="clean"||fault==="pregel")assert.deepEqual(outcome,{value:undefined});
  else {
   assert.ok("error"in outcome&&outcome.error instanceof AggregateError);if(!("error"in outcome)||!(outcome.error instanceof AggregateError))throw new Error("shape drift became successful settlement");assert.equal(outcome.error.message,"Scribe original settlement and owned compensation failed.");
   const todo:unknown[]=[outcome.error];const seen=new Set<unknown>();
   for(let index=0;index<todo.length;index++){const value=todo[index];if(seen.has(value))continue;seen.add(value);if(value===null||(typeof value!=="object"&&typeof value!=="function")||nativeTypes.isProxy(value))continue;
    for(const field of ["cause","errors","settled"]){const descriptor=Object.getOwnPropertyDescriptor(value,field);if(descriptor&&Object.hasOwn(descriptor,"value"))todo.push(descriptor.value);}
    if(Array.isArray(value))for(const key of Reflect.ownKeys(value)){if(typeof key!=="string"||! /^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=4294967295)continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor&&Object.hasOwn(descriptor,"value"))todo.push(descriptor.value);}
   }
   assert.ok(seen.has(fault==="revoked-raw"?rawFault:reason),"exact actual unexpected ROOT retained");if(QUsed||fault==="cause"||fault==="errors"||fault==="sparse")assert.ok(seen.has(leaf));
  }
  assert.strictEqual(Object.getOwnPropertyDescriptor(exposed,"cause")?.value,primaryCause?.value);assert.equal(getterReads,0);assert.equal(proxyTraps,0);assert.equal(deps.provider.calls.length,providerAtHold);
  const afterRows=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()]));assert.deepEqual(afterRows,beforeRows);assert.deepEqual(BSON.serialize(afterRows,{ignoreUndefined:false}),beforeBytes);
 } finally {
  openRaw();rejectQ(leaf);rows.findOne=originalFind;graph.invoke=originalInvoke;if(signal)signal.removeEventListener("abort",onAbort);Object.defineProperty(WriterDeadline.prototype,"run",originalRunDescriptor);
  const terminal=attempt?await attempt:undefined;await Promise.allSettled([...(raw?[raw]:[]),Q,...(exposed?[exposed.settled]:[]),...(terminal&&"error"in terminal&&terminal.error instanceof FencedWriterDeadlineError?[terminal.error.settled]:[])]);
 }
}
```
Real saved physical read returns SAME original P after actual null/gate; actual graph
invoke/run spies return SAME P, no fake receipt/owner/ACK. Postreceipt actual original
expiry catch installed after run spy; queued mutation runs after its existing job.
Independent public DAG uses own DATA descriptors, not production inspector oracle.
Sparse keys bounded, proxies/getters untouched, actual200ms preserved.
Manual pregel decoration is compatibility-only, not genuine task-path coverage.

## CURRENT complete test packet — Part4 retained original proposal and FINAL correction

The following is the root-forwarded ORIGINAL Part4 proposal retained as history.
Its finally/P-binding is superseded by the mandatory finite correction immediately
after the block. The authoritative current test is this body PLUS those exact three
substitutions; do not implement the historical incomplete finally.

```ts
for (const kind of ["native","wrapper-PQ"] as const) {
 const donorThread=`causal-donor-${kind}`;const targetThread=`causal-receiver-${kind}`;const audits=fakeDb.collection<any>(COLLECTION_NAMES.decisions);const savedInsert=audits.insertOne.bind(audits);let openA!:()=>void;let hitA!:()=>void;const Aheld=new Promise<void>(resolve=>{openA=resolve;});const Aready=new Promise<void>(resolve=>{hitA=resolve;});let A:Promise<unknown>|undefined;let donorAttempt:Promise<unknown>|undefined;let donorWrapper:FencedWriterDeadlineError|undefined;
 const checkpoints=fakeDb.collection<any>(COLLECTION_NAMES.scribe_checkpoints);const savedFind=checkpoints.findOne.bind(checkpoints);let openR!:()=>void;let hitR!:()=>void;const Rheld=new Promise<void>(resolve=>{openR=resolve;});const Rready=new Promise<void>(resolve=>{hitR=resolve;});let R:Promise<unknown>|undefined;let receiverAttempt:Promise<{value:unknown}|{error:unknown}>|undefined;let receiverError:FencedWriterDeadlineError|undefined;let closeReceiver:Promise<{value:unknown}|{error:unknown}>|undefined;let receiverDone=false;let once=true;let donorOnce=true;let receiverSignal:AbortSignal|undefined;
 const S=new Error(`PRIVATE_CAUSAL_Q_${kind}`);let failQ!:(error:unknown)=>void;const Q=new Promise<void>((_resolve,reject)=>{failQ=reject;});void Q.catch(()=>undefined);const receiver=new WriterDeadline(200);const graph=compileScribeGraph(deps,{checkpointer:createScribeCheckpointer(tenantScopedClient(fake.client,"scribe-test"))});const savedInvoke=graph.invoke.bind(graph);
 try {
  audits.insertOne=((...args:Parameters<typeof savedInsert>)=>{if(!donorOnce||args[0].kind!=="per_fact_reject"||args[0].threadId!==donorThread)return savedInsert(...args);donorOnce=false;assert.equal(args[0].tenantId,"scribe-test");assert.equal(typeof args[0].writerToken,"string");const operation=(async()=>{const actual=await savedInsert(...args);hitA();await Aheld;return actual;})();A=operation;void operation.catch(()=>undefined);return operation;}) as typeof audits.insertOne;
  donorAttempt=recordRejectReasons(db,{threadId:donorThread,studentId:baseInput().studentId,rejected:[{key:"actual-donor-probe"}]},{deadlineMs:20}).then(()=>assert.fail("held real audit must reach its actual deadline"),error=>error);
  await Promise.race([Aready,donorAttempt]);assert.ok(A);const donorResult=await donorAttempt;assert.ok(donorResult instanceof FencedWriterDeadlineError);donorWrapper=donorResult;
  const P=Object.getOwnPropertyDescriptor(donorWrapper,"settled")!.value as Promise<unknown>;assert.ok(nativeTypes.isPromise(P));let Pdone=false;void Promise.prototype.then.call(P,()=>{Pdone=true;},()=>{Pdone=true;});await Promise.resolve();assert.equal(Pdone,false,"P is a genuine helper closure waiting real A");
  const nativeForeign=Object.getOwnPropertyDescriptor(donorWrapper,"cause")!.value;assert.equal(WriterDeadline.expiryConstruction(nativeForeign)?.unchanged,true);assert.equal(WriterDeadline.expiryConstruction(donorWrapper),undefined);const foreign=kind==="native"?nativeForeign:donorWrapper;
  const forwarded=await receiver.run(Promise.reject(nativeForeign)).catch(error=>error);assert.strictEqual(forwarded,nativeForeign);assert.equal(receiver.signal.aborted,false);assert.equal(receiver.signal.reason,undefined);receiver.dispose();
  const before:WriterCausalFrame=WriterDeadline.inspectCausal(donorWrapper)!;assert.ok(before.settlements.includes(P));
  const beforeRows=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()]));const beforeBytes=BSON.serialize(beforeRows,{ignoreUndefined:false});
  graph.invoke=((...args:Parameters<typeof savedInvoke>)=>{receiverSignal=args[1]?.signal;return savedInvoke(...args);}) as typeof graph.invoke;
  checkpoints.findOne=((...args:Parameters<typeof savedFind>)=>{const filter=args[0] as Record<string,unknown>;if(!once||filter.tenantId!=="scribe-test"||filter.thread_id!==targetThread||typeof filter.checkpoint_id!=="string"||typeof filter.checkpoint_ns!=="string")return savedFind(...args);once=false;const operation=(async()=>{const actual=await savedFind(...args);assert.equal(actual,null);hitR();await Rheld;throw foreign;})();R=operation;void operation.catch(()=>undefined);return operation;}) as typeof checkpoints.findOne;
  receiverAttempt=startScribe(graph,baseInput({sessionId:`session-${targetThread}`}),{threadId:targetThread,writerDeadlineMs:200}).then(value=>({value}),error=>({error}));const stage=await Promise.race([Rready.then(()=>({reached:true})),receiverAttempt]);assert.ok("reached"in stage&&R);const terminal=await receiverAttempt;assert.ok("error"in terminal&&terminal.error instanceof FencedWriterDeadlineError);if(!("error"in terminal)||!(terminal.error instanceof FencedWriterDeadlineError))throw new Error("real receiver original deadline not reached");receiverError=terminal.error;assert.notStrictEqual(receiverSignal!.reason,nativeForeign);
  closeReceiver=receiverError.settled.then(value=>{receiverDone=true;return{value};},error=>{receiverDone=true;return{error};});openR();await assert.rejects(R,error=>error===foreign);await new Promise<void>(resolve=>setImmediate(resolve));
  if(kind==="wrapper-PQ"){
   assert.equal(receiverDone,false,"real receiver joined explicit foreign E.settled P");Object.defineProperty(donorWrapper,"settled",{value:Q,writable:true,configurable:true});const after=WriterDeadline.inspectCausal(donorWrapper,before)!;assert.equal(after.unchanged,false);assert.ok(before.settlements.includes(P));assert.ok(after.settlements.includes(Q));
   openA();await P;await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(receiverDone,false,"captured real P closes while later current Q still holds public drain");failQ(S);
  }else{failQ(S); /* Helper A is NOT a dependency of bare nativeE; no ancestry bridge inferred. */}
  const closureResult=await closeReceiver;assert.ok("error"in closureResult&&closureResult.error instanceof AggregateError);if(!("error"in closureResult)||!(closureResult.error instanceof AggregateError))throw new Error("foreign E was adopted as own expiry");assert.equal(closureResult.error.message,"Scribe original settlement and owned compensation failed.");
  const queue:unknown[]=[closureResult.error];const visited=new Set<unknown>();for(let index=0;index<queue.length;index++){const value=queue[index];if(visited.has(value))continue;visited.add(value);if(value===null||(typeof value!=="object"&&typeof value!=="function")||nativeTypes.isProxy(value))continue;for(const field of ["cause","errors","settled"]){const descriptor=Object.getOwnPropertyDescriptor(value,field);if(descriptor&&Object.hasOwn(descriptor,"value"))queue.push(descriptor.value);}if(Array.isArray(value))for(const key of Reflect.ownKeys(value)){if(typeof key!=="string"||! /^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=4294967295)continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor&&Object.hasOwn(descriptor,"value"))queue.push(descriptor.value);}}
  assert.ok(visited.has(foreign));assert.ok(visited.has(nativeForeign));if(kind==="wrapper-PQ")assert.ok(visited.has(S));
  const afterRows=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,fakeDb.collection<any>(name).all()]));assert.deepEqual(afterRows,beforeRows);assert.deepEqual(BSON.serialize(afterRows,{ignoreUndefined:false}),beforeBytes);
 }finally{openA();openR();failQ(S);audits.insertOne=savedInsert;checkpoints.findOne=savedFind;graph.invoke=savedInvoke;receiver.dispose();await Promise.allSettled([...(A?[A]:[]),...(R?[R]:[]),...(donorAttempt?[donorAttempt]:[]),...(receiverAttempt?[receiverAttempt]:[]),...(donorWrapper?[Object.getOwnPropertyDescriptor(donorWrapper,"settled")!.value]:[]),...(receiverError?[receiverError.settled]:[]),Q]);}
}
```

FINAL mandatory Part4 correction (exact finite substitutions, same real controls):
1. Outer beside donorWrapper add let donorP:Promise<unknown>|undefined.
2. Capture replaces const P=... with:
```ts
const P = donorP = Object.getOwnPropertyDescriptor(donorWrapper, "settled")!.value as Promise<unknown>;
```
All native-brand/Pdone/previous frame/receiver identity/release assertions unchanged.
3. Unconditional finally awaited array becomes:
```ts
await Promise.allSettled([
  ...(A ? [A] : []),
  ...(R ? [R] : []),
  ...(donorAttempt ? [donorAttempt] : []),
  ...(receiverAttempt ? [receiverAttempt] : []),
  ...(donorP ? [donorP] : []),
  ...(donorWrapper ? [Object.getOwnPropertyDescriptor(donorWrapper, "settled")!.value] : []),
  ...(receiverError ? [receiverError.settled] : []),
  Q,
]);
```
Original REAL donor P retained outside try and drained even when E.settled became Q.
No extra production call/gate/deadline/helper/creator authority. Bare native kind
does NOT wait donor A or borrow parent ancestry; actual foreign E remains unexpected.
Wrapper kind uses actual held helper A-derived P, later Q after actual handling.
Exact selectors:real audit kind/thread/tenant/source-minted writerToken;checkpoint
tenant/thread/stringcheckpoint_id/stringcheckpoint_ns;SAME real operation before hold.
No fabricated ACK/key/state/receipt/lease/ownership or dependency grant.

### FINAL test Part5a — every-poison negative inside existing2202 shapeDeadline try

Append after Part2 mutation cases BEFORE finally dispose:
```ts
let everyRoot: FencedWriterDeadlineError | undefined;
try { shapeDeadline.op(); } catch (error) {
  assert.ok(error instanceof FencedWriterDeadlineError);
  everyRoot = error;
}
assert.ok(everyRoot);
const everyBirth = WriterDeadline.expiryConstruction(everyRoot);
assert.ok(everyBirth);
assert.equal(everyBirth.unchanged, true);
const everySettled = Object.getOwnPropertyDescriptor(everyRoot, "settled");
assert.ok(everySettled && "value" in everySettled);
const everyP = everySettled.value as Promise<unknown>;
const everyQ = Promise.resolve(undefined);
assert.notEqual(everyP, everyQ);
const savedEvery = Object.getOwnPropertyDescriptor(Array.prototype, "every");
assert.ok(savedEvery && "value" in savedEvery);
let poisonedUnchanged: boolean | undefined;
try {
  Object.defineProperty(everyRoot, "settled", {
    value: everyQ,
    writable: everySettled.writable,
    enumerable: everySettled.enumerable,
    configurable: everySettled.configurable,
  });
  Object.defineProperty(Array.prototype, "every", {
    value: function () { return true; },
    writable: savedEvery.writable,
    enumerable: savedEvery.enumerable,
    configurable: savedEvery.configurable,
  });
  poisonedUnchanged = WriterDeadline.expiryConstruction(everyRoot)?.unchanged;
} finally {
  Object.defineProperty(Array.prototype, "every", savedEvery);
}
assert.equal(poisonedUnchanged, false);
const restoredEvery = Object.getOwnPropertyDescriptor(Array.prototype, "every")!;
assert.equal(restoredEvery.value, savedEvery.value);
assert.equal(restoredEvery.writable, savedEvery.writable);
assert.equal(restoredEvery.enumerable, savedEvery.enumerable);
assert.equal(restoredEvery.configurable, savedEvery.configurable);
assert.equal(Object.getOwnPropertyDescriptor(everyRoot, "settled")!.value, everyQ);
await Promise.allSettled([everyP, everyQ]);
```
ZERO await/timer/assertion/user iterator/source-writer call in poison interval,
only initialized native query; exact descriptor restore on query throw. Narrow
query integrity, not whole-realm security; requires explicit quality/decision scope.

### FINAL test Part5b — exact runtime selector union and unchanged budgets

Existing callbacks ONLY:erasure1611 after1649;erasure2202 after2229;
normalcheckpointer122 tail after435-437 before438, non-normal139-433 untouched.
No new titles/import statements beyond named existing imports/helpers/files.
Old exact128 pattern alternatives retained firstfour. Prospective exact union:
```text
^(?:D068 .+|D058 (?:transcript|concern) rejected receipt: actual late (?:owned insertion leaves zero residue|matched recreated winner preserves full rows)|D059 applyApprovedDiff dynamic postcheck: (?:successful|failed) work then expired budget preserves exact read undo priority|D059 applyApprovedDiff actual partial wrapper: (?:clean-own-expiry|unexpected-raw) preserves provenance and immutable primary|D-016 deadline: a writer that exceeds its deadline is ABORTED and COMPENSATED \(typed error; its in-flight insert is undone when it lands; every op carried a driver timeoutMS\)|D-016 deadline: the post-check runs AT the abort \(in the finally\), not only when the stuck op settles: a fact that landed before the stuck edge write is already gone when the writer returns|ISS-t-007-rev-6 / B14: the REAL MongoDBSaver persists a scribe run into the fake db; a FRESH saver on the same db reads the paused thread back and completes it)$
```
Keep allfive originalruntime files:facts.test.ts,decisions.test.ts,
scribe-persistence.test.ts,scribe-checkpointer.test.ts,scribe-per-fact.test.ts.
ADD existing packages/db/tests/erasure.test.ts as sixth. Keep concurrency1 and
ALL original clock/process budgets. Old128 PLUSexactly3 existing names =>proposed131
selected top-level titles, UNRUN; internal matrix does not inflate title count.
Measure reached native/unit/matrix/donor controls, not coverage from count/exit alone.
Same real physical selector/actual-null gate asPart3; donor actual kind/thread/tenant/
source writerToken andSAME realInsert beforehold. No manual ACK/source receipt grant.

### FINAL test Part5c — inverse-byte proof and explicit incomplete coverage

Frozen erasure4D204/checkpointer2D458 above and existing persistence
3DEB738228A9821913020F1BF58BAE6A2C24EEA177223AA172F3574FB525F96C unchanged.
Future implementation proof inverse-removes ONLY approved import/append blocks to
reproduce each complete original byte stream/hash. Compare original D016 bodies,
normal435-437, FULLnon-normal139-433/all16 oracles andALL33 persistence originals.
Scoped diffcheck/finalfreeze before ROOT-ONLY runtime; none claimed now.

EXPLICIT UNRESOLVED compiled-framework metadata seam:unitPart2 and manual Part3
pregelTaskId decoration show extra-field compatibility ONLY. Installed retry.js52
actually assigns error.pregelTaskId=pregelTask.id; physical checkpoint controls
are NOT proven to enter that retry task path. NO concrete existing-callback hunk
obtains actual framework-added pregelTaskId on SAME real source expiry. Mark this
requirement INCOMPLETE; separate real compiled node-path control or explicit scoped
resolution must be reviewed if full goal requires it. Do not call manual tag proof.
Strict abort-before-fire runtime gap remains:real signal/run/throwIfAborted identity
and listener-before-reaction cannot distinguish fire-before-abort due microtasks.
Actual order is SOURCE static hunk proof; no private-expiry inspection authorized.
Sparse bound is ownkeys count, not arraylength; Node callback timeout cannot preempt
a synchronous bad loop. Bounded source review+root external-process bound required.
No whole-realm immunity/no-unhandled guarantee/positive ownership from query.

## COMPLETE prospective documentation handoff marker — NOT approval/implementation

All supplied shared, graph6/6, facts3/3, decisionsA-I, nodes+drained correction and
fixture1/2/3a/3b/Part4+donorP/5a/5b/5c code templates and exact expansion maps are
consolidated above. Current authority is this appendix's final labeled sections;
earlier proposals, E509 standalone snapshot and explicitly historical Part4 finally
are superseded only where a FINAL correction is named. Original108649-byte history
is immutable. Expanded observation counts:graph117,facts60,nodes19+1,decisions9.
Facts finalUndo and normal decisions fault surface are explicit prospective additions
for independent whole-plan review. No duplicate mapped-template expansion is required.

Remaining substantive review boundaries:unproven external opaque ancestry/backedge;
same-turn foreign mutation before first observation; D076 parent-op receipt ownership;
actual compiled framework metadata witness missing; strict fire order runtime proof
limited to static source order; pure source/coverage/falsifier sufficiency judged by
freshquality, not by author. Original128/16/33/deadlines/budgets/foreign BSON/ACK/oracles
never weakened or renamed. COMPLETE here means document packet handoff, NOT complete
behavior/coverage, source GO,D077, runtime/checker PASS or release. Root must obtain
fresh full prospective quality and official new decision before any source/test edit.

## CURRENT PROSPECTIVE AMENDMENT — complete-plan REFUSE repairs (not approved)

This appendix amends only the exact portions named below of the prior 235337-byte A61BB8175B17A39E9B64952C66ABE9905E28EF82BA63E62FC7804B2A1373F057 packet. That entire packet/history remains verbatim. Independent whole-plan REFUSE is initial-persistence-plan-approval.md637–676, SHA C634B3660010B3DA5015F10C54236D641B537FB1B7ECE056F2D3EA03949BBE3C. These are prospective source/test templates, not implemented code or partial approval. Shared birth/inspector API1521–2086 is unchanged. No D077, SOURCE GO, runtime or PASS is claimed. All source anchors remain original frozen source positions; future numeric pins require measured implementation bytes.

### Amendment N — nodes classifier and happy-terminal proof

Author expiry_nodes_plan; nodes source5DC65C2316A722DFF566CA23FF26696E34DEA204C42F1183430C339A0A44684D. Replace ONLY existing writeApproved1544–1549 unsafe PartialApplyError.cause classification with:

```ts
} catch(err){
 const frame=observeCausal(err);let partialCause:unknown;let partialCauseProved=false;
 if(err instanceof PartialApplyError&&frame&&!frame.unsafe&&!frame.failed&&!causalTainted.has(err)){
  try{
   const birth=WriterDeadline.expiryConstruction(err);let intact=!(birth&&!birth.unchanged);
   for(const previous of causalHistory.get(err)??[]){
    const current=WriterDeadline.inspectCausal(err,previous);
    if(!current||current.unsafe||current.failed||!current.unchanged){
     intact=false;causalTainted.add(err);if(current?.failed)noteFault(current.failure);
    }
   }
   const current=WriterDeadline.inspectCausal(err,frame);
   if(!current||current.unsafe||current.failed||!current.unchanged){
    intact=false;causalTainted.add(err);if(current?.failed)noteFault(current.failure);
   }
   const ownCause=current?.descriptors[0];
   if(intact&&!causalTainted.has(err)&&ownCause&&observationHasOwn(ownCause,'value')){
    partialCause=ownCause.value;partialCauseProved=true;
   }
  }catch(fault){causalTainted.add(err);noteFault(fault);}
 }
 if(err instanceof FactConflictError)result=ScribeResultSchema.parse({status:'conflict',key:err.key,message:err.message});
 else if(partialCauseProved&&partialCause instanceof FactConflictError)result=ScribeResultSchema.parse({
  status:'partial_conflict',key:(err as PartialApplyError).failingKey,
  writtenFactIds:(err as PartialApplyError).writtenIds,message:partialCause.message,
 });
 else throw err;
}
```

Own DATA cause only; authentic safe frame and all retained history plus birth negative gate. No causal getter or inherited ownership adoption. Refusal rethrows SAME original err; reflection/subscription faults retain actual identity including undefined. Legitimate original conflict conversion survives. Mandatory prior drainedFailures correction3217–3249 remains authoritative.

No additional nodes happy-terminal hunk is needed: existing1578 `if (observerFailures.length) throw observerFailures[0];` is outside deferred-summary conditional and precedes return1579. Proposed noteFault feeds SAME array; actual subscription S therefore enters outercatch1580 and existing owned cleanup. Coexisting R+S are retained by observer ledger roots+forced1640–1642 and existing aggregation1711–1714. Final-settled observer1717 attaches while collector has yielded before ledger drainage. New frontier/fault causes existing collector re-entry. This is static evidence, not runtime proof.

### Amendment D — decisions complete corrective hunks R1–R5 and direct drivers

Author expiry_decisions_plan; source ECB9B520FC1A1214AAE9E68A0F3A59F2005C7996354D6EDA10DB69BCCB5699E8. Only existing recordRejectReasons103. The original source/no-fault behavior, all fixed timed-out public envelopes, replay/duplicate ownership and actual P identities remain.

R1 first ingress at actual insert catch183 BEFORE duplicate classification; actual209 binding is authorityErr (withdraw erroneous err209 map):

```ts
} catch(err){
 observeCausal(err);
 if(!isDuplicateKey(err))throw err;
 // SAME remaining duplicate-winner logic.
}
catch(authorityErr){observeCausal(authorityErr);authorityLoss={err:authorityErr};throw authorityErr;}
```

Thirty original first-ingress patterns become31 with183; every other original map unchanged.

R2 DELETE prior proposed fault-surface after352–355. Insert immediately BEFORE original352–355 priority throws:

```ts
const terminalObserverFaults=[...new Set<unknown>([
 ...expiryObserverFailures,...causalObserverFailures,
])];
if(terminalObserverFaults.length){
 const terminalRoots=[...new Set<unknown>([
  ...immediateUndoFailures,
  ...(postcheckFailure?[postcheckFailure.err]:[]),
  ...(authorityLoss?[authorityLoss.err]:[]),
  ...(failure?[failure.err]:[]),
  ...terminalObserverFaults,
 ])];
 if(terminalRoots.length===1)throw terminalRoots[0];
 throw new AggregateError(terminalRoots,"recordRejectReasons: causal observation failed");
}
if(immediateUndoFailures.length)throw immediateUndoFailures[0];
if(postcheckFailure)throw postcheckFailure.err;
if(authorityLoss)throw authorityLoss.err;
if(failure)throw failure.err;
return {recorded:true,_id};
```

No new fault => original priority, throw identities and return exactly preserved. With fault => all actual original terminal roots in original priority order plus actual faults, exact identity dedup; sole root including undefined is unchanged. Normal fault-only owned-cleanup policy is separately unresolved until the author's finite addition below; no row oracle is inferred from this R2 alone.

R3 collector-local outcome ledgers near268–270 BEFORE firstawait271:

```ts
const completedOutcomes=new Map<Promise<unknown>,PromiseSettledResult<unknown>>();
const forcedSettlementParents=new Set<unknown>();
const forcedOutcomeEdges=new Map<unknown,Set<Promise<unknown>>>();
```

Replace actual work-outcome273, preserving SAME Promise.allSettled([work])271:

```ts
for(const outcome of workOutcome){
 completedOutcomes.set(work,outcome);
 if(outcome.status==="rejected"){
  observeCausal(outcome.reason);originalFailures.push(outcome.reason);
 }
}
```

Replace original batch276 positional loop, preserving SAME slice/cursor and oneawait:

```ts
const outcomes=await Promise.allSettled(batch);
for(let index=0;index<outcomes.length;index++){
 const outcome=outcomes[index]!;
 completedOutcomes.set(batch[index]!,outcome);
 if(outcome.status==="rejected"){
  observeCausal(outcome.reason);originalFailures.push(outcome.reason);
 }
}
```

Replace nested331–334 outcomes, preserving nestedbatch329/furtherErrors330 and stackpush335:

```ts
const outcomes=await Promise.allSettled(batch);
for(let index=0;index<outcomes.length;index++){
 const outcome=outcomes[index]!;
 completedOutcomes.set(batch[index]!,outcome);
 if(outcome.status==="rejected"){
  observeCausal(outcome.reason);
  if(!errors.includes(outcome.reason))errors.push(outcome.reason);
  furtherErrors.push(outcome.reason);
 }
}
```

R4 complete replacement of proposed discovery310–318; forcing precedes revision skip:

```ts
const error=errorStack.pop();
observeCausal(error);
const history=causalHistory.get(error);
if(history){
 for(const promise of history.settlements){
  if(promise===settled)continue;
  const completed=completedOutcomes.get(promise);
  if(completed?.status!=="rejected")continue;
  let forcedEdges=forcedOutcomeEdges.get(error);
  if(!forcedEdges){forcedEdges=new Set();forcedOutcomeEdges.set(error,forcedEdges);}
  if(forcedEdges.has(promise))continue;
  forcedEdges.add(promise);
  forcedSettlementParents.add(error);
  if(!errors.includes(error))errors.push(error);
  if(!errors.includes(completed.reason))errors.push(completed.reason);
  observeCausal(completed.reason);errorStack.push(completed.reason);
 }
}
const revision=history?.revision??0;
if(errorSeen.get(error)===revision)continue;
errorSeen.set(error,revision);
if(history){
 for(const promise of history.settlements){
  if(promise===settled)continue;
  if(completedOutcomes.has(promise))continue;
  if(nestedSeen.has(promise as Promise<void>))continue;
  // SAME original nativeobserver N(promise), BOTH handlers undefined.
  nestedSeen.add(promise as Promise<void>);nested.push(promise as Promise<void>);
 }
 const descendants=[...history.children];
 for(let index=descendants.length-1;index>=0;index--)errorStack.push(descendants[index]);
}
```

DELETE naked work/originalOperations identity exclusions. A known identity without actual recorded completed outcome must join normally. Fulfilled actual completed P can skip; rejected completed P forces SAME parent and actual reason before skip, including rejection undefined. Per-parent/P forcededge recorded before queue prevents reason===parent cycling. Requeue retained roots after actual awaits so unchanged-revision late parents are forced.

R5 both classifiers278–292 and final repeated proof before337 add this negative BEFORE existing own positive:

```ts
if(forcedSettlementParents.has(leaf)||causalTaints.has(leaf)||history?.tainted||(construction&&!construction.unchanged)||!ownExpiryFailures.has(leaf)){
 expectedOnly=false;break;
}
```

Direct-driver first-subscription additions are explicit scope and census9->11 (31 ingresses unchanged). At182 replace only driver await with:

```ts
const inserting=coll.insertOne(doc,insertBudget);
// SAME nativeobserver N(inserting), BEFORE actual await.
await inserting;
```

At202–203 replace only winner driver await with:

```ts
const winnerRead=coll.findOne({_id,studentId:input.studentId,threadId:input.threadId,kind:"per_fact_reject"},winnerBudget);
// SAME nativeobserver N(winnerRead), BEFORE actual await.
const winner=await winnerRead;
```

N is the literal complete native template already in the original decisions packet, bothhandlers explicitlyundefined, actual registration fault retained. No originalOperations enrollment: direct DB awaits remain work-owned, not inferred completed merely because work drained. Original receiver/doc/selectors/options and single actual await are unchanged. Actual insert synchronous throw enters now-captured catch183. Discovered raw P joins until actual nested outcomes authorize a completed skip. Deterministic writerToken selector and undo exact-owned filter remain unchanged. This amendment introduces no dependency setter, external ancestry inference, parent ownership transfer, arbitrary thenable assimilation or birth-positive grant.

### Amendment G1 — discovered native settlements and no-consent crisis seams

Prospective source-based packet from /root/graph_plan_ready; NOT approval, source GO, execution or acceptance. Frozen graph source 9AC10E0C1A6FB5B6284DF50A9C7A88C5F71E1FC0D14CA21287A8BF3F8D2C1E2B. In eight existing `for (const operation of unjoined) joined.add(operation)` loops before batch allSettled at source930/1241/1366/1635/1711/1857/2422/2762, replace only the loop body with:

```ts
{ observeGraphOriginal(CONTEXT, operation); joined.add(operation); }
```

CONTEXT is respectively owner/createdCall/createdCall/created/created/owner/invocationCreated/causal. P is the genuine discovered native settlement from the inspector. Existing exact SELF/drained bypass remains before discovery. Observer children never join or enroll as raw originals/receipts. There is no extra original push.

At existing no-consent source1156, use the same actual call, IDs, flag processing, signal and deadline:

```ts
if (turnIds.length > 0 && deps.escalation) {
  const original = escalateTurns(deps.db, parsed, {
    ...deps.escalation,
    budget: {
      expiresAt: deadline.expiresAt,
      signal: deadline.signal,
      run: work => {
        observeGraphOriginal(createdCall, work);
        return deadline.run(work);
      }
    }
  });
  observeGraphOriginal(createdCall, original);
  await deadline.run(original);
}
```

No pending push, consent grant, budget change or ownership adoption is introduced. Static first-observation census117+8+2=127, UNRUN; direct catches are separate ingresses.

### Amendment G2 — sticky observed detached causal roots

Add optional `detachedCausalRoots?: Set<unknown>` to existing GraphCausalContext. Initialize a new Set at actual contexts777/1134/2029/2594; alias the SAME set everywhere causalHistory aliases owner/recovery. No module-global history. Capture `const graphSame = Object.is` beside the existing inert intrinsic declarations. In rememberGraphCausal after `if (!frame) continue;`, before `if (next === 0) first = frame`, insert:

```ts
if (previous && !frame.unchanged) {
  for (let version = 0; version < (history?.length ?? 0); version++) {
    const oldFrame = history![version]!;
    for (let child = 0; child < oldFrame.children.length; child++) {
      const removed = oldFrame.children[child];
      let present = false;
      for (let now = 0; now < frame.children.length; now++) {
        if (graphSame(removed, frame.children[now])) { present = true; break; }
      }
      if (!present) graphApply(graphSetAdd, context.detachedCausalRoots!, [removed]);
    }
  }
}
```

Never clear on restoration. Unchanged frames do not detach/flatten children. Before every capturePass in the seven root/forced collectors924/1237/1362/1631/1707/1853/2418, with contexts owner/createdCall/createdCall/created/created/owner/invocationCreated respectively, insert:

```ts
for (const detached of CONTEXT.detachedCausalRoots!) {
  roots.add(detached);
  forced.add(detached);
}
```

Inspect before capturePass uses:

```ts
for (const detached of causal.detachedCausalRoots!) {
  if (!metadataFailures.has(detached)) {
    metadataFailures.add(detached);
    errors.push(detached);
    executions.push(detached);
  }
}
```

Set iteration follows existing collector sets, not a foreign causal vector. Do not invent settlementFailures for detached C: only an actual drained-rejection reason has that status. Previously observed removed C remains independently public even when Q rejects independent S without cause C. Undefined is preserved; this is negative evidence only, with no receipt, positive grant or owner enrollment.

### Amendment F1 — apply ordinary precheck fault terminal and typed closure identity

Prospective source-based packet from /root/facts_plan_ready; NOT recovered historical authority, approval or source GO. Frozen facts18F59B7B75555CE2F5C69AB163C85E4B3DA5BFDAD3B6D897A4EB80C1DD99F5AC. Retain the complete preceding metadata/60-site/collector revision hunks. At apply precheck catch439, before the SAME planned first collector:

```ts
const expiredAtEntry = deadline.expired();
if (!expiredAtEntry && !provenanceFailures.length) throw err;
let primary: unknown[];
if (expiredAtEntry) {
  const expiryError: unknown = await originalExpiry.catch(error => {
    observeCausal(error); return error;
  });
  ownExpiryFailures.add(expiryError);
  primary = [...new Set<unknown>([...(err === expiryError ? [] : [err]), expiryError, ...provenanceFailures])];
} else primary = [...new Set<unknown>([err, ...provenanceFailures])];
let closedErrors: unknown[] | undefined;
let closedFailure: { error: unknown } | undefined;
```

At that collector's final errors seal replace the sole throw with:

```ts
closedErrors = errors.slice();
if (errors.length) {
  const terminal = new AggregateError(errors, "applyApprovedDiff: timed-out writer settlement failed");
  closedFailure = { error: terminal };
  throw terminal;
}
```

Collector cleanup remains unchanged (this collector has none). After handled SAME settled, before existing cause/FWD emission:

```ts
if (!expiredAtEntry) {
  let closureFailure: { error: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (error) { observeCausal(error); closureFailure = { error }; }
  const roots = [...new Set<unknown>([
    ...primary, ...(closedErrors ?? []), ...provenanceFailures,
    ...(closureFailure && !(closedFailure && closureFailure.error === closedFailure.error) ? [closureFailure.error] : [])
  ])];
  primary = roots;
  if (!(deadline.expired() && closedErrors === undefined)) {
    if (roots.length === 1) throw roots[0];
    throw new AggregateError(roots, "applyApprovedDiff: causal observation failed");
  }
}
```

Then the SAME existing genuine FWD emission uses original settled. This is fault-only SAME-deadline race#1, not a future-expiry wait, new timer or cleanup. The typed closedFailure OBJECT-presence guard is mandatory in every analogous hunk: optional equality against absent `closedFailure?.error` would drop actual rejection undefined.

### Amendment F2 — apply main success/error fault closure

At MAIN931–1015 replace ONLY source931 `if (deadline.expired())` with `const expiredAtEntry = deadline.expired(); if (expiredAtEntry || provenanceFailures.length) {`. Other deadline guards are unchanged; immediate undo stays once guarded. Primary is:

```ts
let primary: unknown[];
if (expiredAtEntry) {
  const expiryError: unknown = await originalExpiry.catch(error => {
    observeCausal(error); return error;
  });
  ownExpiryFailures.add(expiryError);
  primary = [...new Set<unknown>([
    ...(failure && failure.err !== expiryError ? [failure.err] : []), expiryError,
    ...(postcheckFailure ? [postcheckFailure.err] : []),
    ...(authorityLoss ? [authorityLoss.err] : []), ...immediateUndoFailures, ...provenanceFailures
  ])];
} else primary = [...new Set<unknown>([
  ...(failure ? [failure.err] : []), ...(postcheckFailure ? [postcheckFailure.err] : []),
  ...(authorityLoss ? [authorityLoss.err] : []), ...immediateUndoFailures, ...provenanceFailures
])];
let closedErrors: unknown[] | undefined;
let closedFailure: { error: unknown } | undefined;
```

The SAME maincollector joins work/original/nested and ONCE finalUndo. Replace its final throw with F1 closedErrors/closedFailure seal, retaining the existing timed-out-writer aggregate label. After handled SAME settled, insert the F1 fault-only terminal code verbatim using its mandatory object-presence identity guard and normal label `applyApprovedDiff: causal observation failed`. Race#2. If genuine expiry races while the collector is unclosed, continue existing true FWD using SAME settled and actual combined primary; otherwise refuse with actual roots. No ledger faults plus nonexpired preserves old downstream priority/return. No new undo/direct-driver observer or renewed deadline.

### Amendment F3 — ensure normal/readonly fault closure

No authorityLoss variable exists here. Add invocation-local `const closedSettlements = new Set<Promise<unknown>>();` beside settlementErrors1085. In the EXISTING ordinary cleanup1132 and readonly collector1598 exact-self bindings, at the final fixed-point seal before final errors throw/return, add `closedSettlements.add(settlement);` where settlement is the SAME actual local returned IIFE P, not an observer child; readonly retains settled=settlement.

Replace success1594 with:

```ts
try {
  if (callbackFailure) throw callbackFailure.err;
  const result = await deadline.run(work);
  if (provenanceFailures.length) throw provenanceFailures[0];
  return result;
}
```

Existing catch executionFailure is unchanged. After each existing collector's handledness and before the old deadline.expired branch:

```ts
if (provenanceFailures.length && !deadline.expired()) {
  let closureFailure: { error: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (error) { observeCausal(error); closureFailure = { error }; }
  const recorded = closureFailure ? settlementErrors.get(closureFailure.error) : undefined;
  const roots = [...new Set<unknown>([
    error, ...provenanceFailures, ...(recorded ?? []),
    ...(closureFailure && !settlementErrors.has(closureFailure.error) ? [closureFailure.error] : [])
  ])];
  if (!(deadline.expired() && !closedSettlements.has(settled))) {
    if (roots.length === 1) throw roots[0];
    throw new AggregateError(roots, "Session admission failure and causal observation failed.");
  }
  const cause = roots.length === 1 ? roots[0] : new AggregateError(roots, "Session admission failure and causal observation failed.");
  const expired = new FencedWriterDeadlineError(settled, { cause });
  observeCausal(expired);
  try { options.onExpectedExpiry?.(expired, { wrappedCause: cause }); }
  catch (observerError) { observeCausal(observerError); provenanceFailures.push(observerError); }
  throw expired;
}
```

Fault-only races#3/#4. Actual entry-expired branches preserve original true FWD/settled; healthy nofault preserves old awaits/priorities. Set.has/map.has preserve rejection undefined; the private map is the sole flatten authority. Readonly collector has ZERO cleanup; ordinary collector retains SAME five owned-cleanup predicates. The newly added trueFWD branch is reachable ONLY when actual deadline expired AND the collector remains unclosed after the real race. The live collector's original observer cursor/fixed-point drains synchronous forwarding observerError before seal. A sealed collector forbids this FWD emission and throws combined roots directly; no postclosed onExpectedExpiry callback is added.

### Amendment F6 — three existing early callback guards

At apply891 move existing nullable `failure` declaration before the callback (declaration only; result declaration may stay). Add:

```ts
let callbackFailure: { err: unknown } | undefined;
try { options.onOwnedWrite?.(undo, work); }
catch (err) {
  observeCausal(err);
  if (!provenanceFailures.length) throw err;
  callbackFailure = { err };
}
if (callbackFailure) failure = callbackFailure;
```

Initial895 try becomes `try { if (!callbackFailure) result = await deadline.run(work); } catch (err) { observeCausal(err); failure = { err }; }`. Maincollector still joins SAME work and exact owned cleanup.

At ensure1593:

```ts
let callbackFailure: { err: unknown } | undefined;
if (!options.summaryAdmissionOnly) {
  try { options.onOwnedWrite?.(cleanup, work); }
  catch (err) {
    observeCausal(err);
    if (!provenanceFailures.length) throw err;
    callbackFailure = { err };
  }
}
```

F3 initialtry throws callbackFailure actual T before work await; collector still joins actual work. At summary2106 move existing nullable failure declaration before callback; use the same guarded call with `(undo, work, commit)`, optionalcallbackFailure, and assign failure only when the OBJECT is present. Initialtry is `if (!callbackFailure) await deadline.run(work)`. No-fault callback T retains exact old throw/no new cleanup. Fault S+T retains both roots; actual undefined T remains `{ err: undefined }`, not an absent failure. Native attachment census60 is unchanged; callbacks are not new subscription sites. F4/F5 and graph normal terminals are still outstanding: this amendment prefix is INCOMPLETE and gives no source GO.

### Mandatory F6 ordering refinement — supersedes the three preceding callback catches

The callback catch must test the PREEXISTING ledger before reflection of callback T. In all three F6 catches use exactly:

```ts
catch (err) {
  if (!provenanceFailures.length) throw err;
  observeCausal(err);
  callbackFailure = { err };
}
```

This preserves the exact old nofault callback throw even if reflecting T itself could introduce S. No subscription site changes. Conditional first-ingress observation applies to the S-qualified callback path; the nofault callback retains its existing external semantics.

### Amendment G3 — real normal observer faults through existing cleanup paths (part1)

Capture `const graphSetEach = Set.prototype.forEach;` beside inert intrinsics; one unique private helper in the existing graph module beside metadata adapters:

```ts
function throwGraphObserverFaults(context: GraphCausalContext): void {
  const faults: unknown[] = [];
  graphApply(graphSetEach, context.observerFailures!, [(fault: unknown) => { faults[faults.length] = fault; }]);
  if (faults.length === 1) throw faults[0];
  if (faults.length > 1) throw new AggregateError(faults, "Scribe native observation failed.");
}
```

Undefined is an actual fault (length discriminates). No receipt callback, onExpectedExpiry, synthetic FWD or new deadline. Existing failure collectors union the entire observer ledger into roots+forced, retaining coexisting R separately. Normal exits call this gate inside their existing try/cleanup path, not outside it.

Owner catch1015 begins rememberGraphCausal(owner,err), preserving original thrown R. After authorization catch1026 closes, before existing settled1032:

```ts
try { throwGraphObserverFaults(owner); }
catch (err) {
  rememberGraphCausal(owner, err);
  thrown ??= { err };
  if (deadline.expired()) timedOut = true;
}
```

Healthy-work S sets thrown and reaches existing ordinary-failure branch1062 `compensate(true, thrown)` under SAME deadline. Coexisting R stays original thrown R; ledger S independently roots+forced in compensate. Metadata S does not mark authorityLost. In existing finalcommit try, after authorize1104, call the gate before op; existing1105catch performs compensation. Leased healthy invoke has no await from this gate to1121 return (claimAuthority skips finalcommit).

UnderLease1590 append gate(created) immediately after `result = await work()` inside existing1591catch; at1815 after final `await owner.authorize()` and before op inside existing1818 cleanup-catching try. Owned invoke failure compensates before lease retry-release. Ownerless failure uses existing1684 collector. Do not inject the gate into unconditional expiry synthesis1915catch; no awaited interval follows1815 gate before successful result.

Start early fenced returns1148/1153/1158 become `{ throwGraphObserverFaults(createdCall); return { kind: "fenced" }; }`. At1162 refusal/1163 crisis/1297 history-hold/1339 fenced/1341 outcome, prepend the same gate inside outer1134try. Conditional-return branches use braces so the gate runs only when actually returning. At1336 inner invoke callback after readOutcome, gate(createdCall) before returning; S becomes actual work rejection and follows existing owned compensation. Outer1342 capture must precede owner early rethrow. Resume/inspect normal exits and complete catch map remain outstanding, so G3 alone is not complete authority.

### Amendment R6/R7 — decisions fault-only owned cleanup and existing collector reuse

Prospective packet from /root/decisions_plan_ready; frozen decisionsECB9B520FC1A1214AAE9E68A0F3A59F2005C7996354D6EDA10DB69BCCB5699E8. Undo140–144 remains SAME selector `_id, studentId, threadId, kind: "per_fact_reject", writerToken` and SAME deleteMany. At242 extend ONLY alwaysUndo to `deadline.expired() || !!authorityLoss || expiryObserverFailures.length > 0 || causalObserverFailures.length > 0`. After authorization20 block254, before255:

```ts
if ((expiryObserverFailures.length || causalObserverFailures.length) && !immediateUndoAttempted) {
  immediateUndoAttempted = true;
  try { await undo(); }
  catch (error) { observeCausal(error); immediateUndoFailures.push(error); }
}
```

Original timer remains live throughout actual cleanup, with no deadline.op, synthetic expiry, renewed deadline, broad delete or refreshed authorization. Change255 outer condition to `if (deadline.expired() || expiryObserverFailures.length || causalObserverFailures.length)`. Keep existing immediate undo guard256–259. Replace unconditional expiry read/receipt260–263:

```ts
let hasExpiry = false;
let expiryError: unknown;
if (deadline.expired()) {
  hasExpiry = true;
  expiryError = await originalExpiry.catch(error => error);
  ownExpiryFailures.add(expiryError);
  try { options.onExpectedExpiry?.(expiryError); }
  catch (observerError) {
    observeCausal(observerError);
    if (!expiryObserverFailures.includes(observerError)) expiryObserverFailures.push(observerError);
  }
}
const primary = [...new Set<unknown>([
  ...(failure && (!hasExpiry || failure.err !== expiryError) ? [failure.err] : []),
  ...(hasExpiry ? [expiryError] : []), ...(postcheckFailure ? [postcheckFailure.err] : []),
  ...immediateUndoFailures, ...expiryObserverFailures, ...causalObserverFailures
])];
```

Use the single existing settlement collector266–339 with R3–R5. Append both actual observer ledgers to discoverySeeds293–294; normal S joins authentic nested P/Q. Immediately after errors268:

```ts
if (!hasExpiry) {
  for (const root of [
    ...immediateUndoFailures, ...(postcheckFailure ? [postcheckFailure.err] : []),
    ...(authorityLoss ? [authorityLoss.err] : []), ...(failure ? [failure.err] : []),
    ...expiryObserverFailures, ...causalObserverFailures
  ]) if (!errors.includes(root)) errors.push(root);
}
```

Existing postcheck269/immediate270 stay with identity dedup (guard existing postcheck push with `if (!errors.includes(postcheckFailure.err))`). Expired-at-entry ordering is unchanged. Normal S is explicitly unexpected, never classifier-suppressed. At337:

```ts
if (errors.length) {
  if (!deadline.expired() && errors.length === 1) throw errors[0];
  throw new AggregateError(errors, deadline.expired()
    ? "recordRejectReasons: timed-out writer settlement failed"
    : "recordRejectReasons: causal observation failed");
}
```

Zero actual faults+unexpired bypasses collector exactly as before. Immediately after handled settled339, before cause340:

```ts
if (!hasExpiry) {
  let boundedFailure: { err: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (err) { boundedFailure = { err }; }
  if (!deadline.expired()) {
    if (boundedFailure) throw boundedFailure.err;
    const roots = [...new Set<unknown>([
      ...immediateUndoFailures, ...(postcheckFailure ? [postcheckFailure.err] : []),
      ...(authorityLoss ? [authorityLoss.err] : []), ...(failure ? [failure.err] : []),
      ...expiryObserverFailures, ...causalObserverFailures
    ])];
    if (roots.length === 1) throw roots[0];
    throw new AggregateError(roots, "recordRejectReasons: causal observation failed");
  }
  hasExpiry = true;
  expiryError = await originalExpiry.catch(error => error);
  ownExpiryFailures.add(expiryError);
  if (!primary.includes(expiryError)) primary.push(expiryError);
  if (boundedFailure && boundedFailure.err !== expiryError && !primary.includes(boundedFailure.err)) primary.push(boundedFailure.err);
  try { options.onExpectedExpiry?.(expiryError); }
  catch (observerError) {
    observeCausal(observerError);
    if (!expiryObserverFailures.includes(observerError)) expiryObserverFailures.push(observerError);
  }
}
```

Add all CURRENT observer faults not already primary; retain existing aggregate/public FWD builder340–350. Only real expiry reaches it. SAME settlement P is public, never nativeThen child; timer unchanged. Actual S with concurrent expiry retains distinct boundedFailure. Normal initial ordering is immediateUndo C(s),postcheck R,authority A,work R,S ledgers, identity dedup; later original/nested/observer faults append in observed order. Native vectors are not flattened; tests use safe own-data DAG containment. Fault-free paths retain prior semantics.

### Amendment F4/F5 — summary and deferredcommit fault closure

Prospective source packet from /root/summary_fault_controls. Requires invocation-local `closedSettlements` and the exact memoized undoP fixed-point seal; no allSettled wrapper may substitute. In summary return2138, before return add `if (provenanceFailures.length) throw provenanceFailures[0];`. After the catch's exact memoized `const settled = undo(); selfSettlements.add(settled); void settled.catch(...)`, before timedOut:

```ts
if (provenanceFailures.length) {
  let closureFailure: { err: unknown } | undefined;
  try { await deadline.run(settled); }
  catch (error) { closureFailure = { err: error }; }
  const errors: unknown[] = [err];
  if (authorityLoss) errors.push(authorityLoss.err);
  if (closureFailure) {
    if (settlementErrors.has(closureFailure.err)) errors.push(...settlementErrors.get(closureFailure.err)!.errors);
    else errors.push(closureFailure.err);
  }
  errors.push(...provenanceFailures);
  const failure = new AggregateError([...new Set<unknown>(errors)], "Session summary failure and owned cleanup failed.");
  if (deadline.expired() && !closedSettlements.has(settled)) {
    const expired = new FencedWriterDeadlineError(settled, { cause: failure });
    try { options.onExpectedExpiry?.(expired, { wrappedCause: expired.cause }); }
    catch (observerError) { provenanceFailures.push(observerError); }
    throw expired;
  }
  throw failure;
}
```

Race#5. No fault preserves original timedOut/settled/authority throw. Actual closureFailure undefined is retained by typed receipt plus map.has.

Inside existing deferred commit callback1942–1976 wrap its current entire body, including expiresAt guard, unchanged:

```ts
let bodyFailure: { err: unknown } | undefined;
try { /* CURRENT BODY verbatim */ }
catch (err) { bodyFailure = { err }; }
if (!provenanceFailures.length) {
  if (bodyFailure) throw bodyFailure.err;
  return;
}
const settled = undo();
selfSettlements.add(settled);
void settled.catch(error => { observeCausal(error); return undefined; });
let closureFailure: { err: unknown } | undefined;
try { await operationOptions.deadline.run(settled); }
catch (err) { closureFailure = { err }; }
const errors: unknown[] = [];
if (bodyFailure) errors.push(bodyFailure.err);
if (closureFailure) {
  if (settlementErrors.has(closureFailure.err)) errors.push(...settlementErrors.get(closureFailure.err)!.errors);
  else errors.push(closureFailure.err);
}
errors.push(...provenanceFailures);
const failure = new AggregateError([...new Set<unknown>(errors)], "Session summary failure and owned cleanup failed.");
if (operationOptions.deadline.expired() && !closedSettlements.has(settled)) {
  const expired = new FencedWriterDeadlineError(settled, { cause: failure });
  if (operationOptions.deadline === deadline) {
    try { options.onExpectedExpiry?.(expired, { wrappedCause: expired.cause }); }
    catch (observerError) { provenanceFailures.push(observerError); }
  }
  throw expired;
}
throw failure;
```

Race#6. Exact operationOptions.deadline is not replaced or renewed. No foreign own receipt or new native observer. Original nofault body order/return/throw unchanged. FWD exposes SAME settledP only on real expired+unclosed state. This is a finite prospective hunk: the prior memoized undo closure still needs its exact seal from the facts owner before complete freeze.

### Amendment G3 part2 — final public normal gate map

Resume invocationCreated exits2045/2099fenced,2106hold,2215in_progress AFTERcurrentAuthority,2236fenced,2249alreadyResolved,2255hold,2376alreadyResolved gate only the chosen conditional return. Await-return2102/2114recover,2218underLease,2393run/underLease replace `return await EXACTCALL;` with `{ const result = await EXACTCALL; throwGraphObserverFaults(invocationCreated); return result; }` in SAME outertry, SAME call/deadline, no extra async P. recoverUnder created2555fenced/2557outcome gates before chosen return; internal2542/2553 covered by owner.

Inspect local causal gates2608notfound/2628fenced/2651fenced/2653done/2662notfound/2728fenced/2738candidate INSIDE existing read IIFE and2743result after deadline.op inside outertry. Actual faults route through2744 collector. readOutcome685/691/699 and internal1007/1336/2387 are covered by enclosing owner's post1026 gate. The earlier optional inner1336 gate in G3part1 is WITHDRAWN as redundant; do not implement it. Outer resume2009/2011 lacks invocation context: do not invent public context or change SessionRowMissing hold rule. Inner2394 coexisting-fault routing and private ownerless authorization/postcheck context plumbing remain required before whole packet can be complete.

### Amendment test L — isolated descriptor/undefined/inherited/nonnative controls

Prospective packet from /root/test_plan_ready, not execution. Append inside the existing erasure callback2202 shapeDeadline try after original PART2 loop, no new test/helper/file:

```ts
for (const fault of ["flag-enumerable", "flag-configurable", "flag-writable", "kind", "own-cause-undefined", "native-vector-undefined", "inherited-DATA", "nonnative-settled"] as const) {
  let E: unknown;
  try { shapeDeadline.op(); } catch (error) { E = error; }
  assert.ok(E instanceof FencedWriterDeadlineError);
  const before = WriterDeadline.inspectCausal(E)!;
  const sd = Object.getOwnPropertyDescriptor(E, "settled")!;
  const P = sd.value;
  const inheritedC = new Error("PRIVATE_D070_INHERITED_DATA");
  let kindReads = 0;
  if (fault.startsWith("flag-")) {
    const flag = fault.slice(5) as "enumerable" | "configurable" | "writable";
    Object.defineProperty(E, "settled", { ...sd, [flag]: !sd[flag] });
  } else if (fault === "kind") Object.defineProperty(E, "settled", { configurable: true, enumerable: sd.enumerable, get: () => { kindReads++; return P; } });
  else if (fault === "own-cause-undefined") Object.defineProperty(E, "cause", { value: undefined, writable: true, configurable: true });
  else if (fault === "native-vector-undefined") {
    Object.setPrototypeOf(E, AggregateError.prototype);
    Object.defineProperty(E, "errors", { value: [undefined], writable: true, configurable: true });
  } else if (fault === "inherited-DATA") {
    const parent = Object.create(FencedWriterDeadlineError.prototype);
    Object.defineProperty(parent, "cause", { value: inheritedC, writable: true, configurable: true });
    Object.setPrototypeOf(E, parent);
  } else Object.defineProperty(E, "settled", { value: { then: () => assert.fail("nonnative settled must never assimilate") }, writable: true, configurable: true });
  const after = WriterDeadline.inspectCausal(E, before)!;
  assert.equal(after.unchanged, false);
  assert.equal(WriterDeadline.expiryConstruction(E)?.unchanged, false);
  assert.equal(after.failed, false);
  assert.equal(after.unsafe, fault === "kind" || fault === "nonnative-settled");
  if (fault === "own-cause-undefined" || fault === "native-vector-undefined") {
    assert.equal(after.children.length, 1);
    assert.strictEqual(after.children[0], undefined);
  }
  if (fault === "native-vector-undefined") {
    assert.equal(after.vector!.keys.length, 2);
    assert.deepEqual(after.vector!.keys, ["0", "length"]);
  }
  if (fault === "inherited-DATA") {
    assert.equal(Object.hasOwn(E, "cause"), false);
    assert.strictEqual(after.children[0], inheritedC);
  }
  assert.ok(before.settlements.includes(P));
  assert.equal(kindReads, 0);
}
```

Every actual opE is fresh; no restoration/global prototype mutation. Getter counter proves kind not read. In compiled NORMALtail PART3a3320 append exactly eight sync rows matching those literals, retaining original eighteen rows byteexact. Mutation before existing prototype branch flips SAME own settled selected flag; kind getter increments existing getterReads and returns saved sd.value; owncauseundefined adds DATAundefined; nativevectorundefined uses Aggregate/errors[undefined]; inheritedDATA uses a local parentowncause leaf under original FWD prototype; nonnative settled gets a then getter that increments getterReads and throws leaf without assimilation. Existing raw/P closure-before-release/final BSON comparisons stay.

Every new compiled row is unexpected under existing changed blacklist, uses same200ms writerdeadline, and final own-data public DAG must contain exact reason. Undefined rows additionally contain undefined and verify actual own descriptor/value. In inheritedDATA row do NOT require public own-only traversal to find inherited leaf: independently assert `const inheritedFrame = WriterDeadline.inspectCausal(reason)!; assert.strictEqual(inheritedFrame.children[0], leaf); assert.equal(Object.hasOwn(reason, "cause"), false);`. Root identity is independently public; inherited inspection grants no ownership. Getter/proxy read counters stay zero. Eight new finite ideal waits add1.6s without changing any protected deadline or legacy budget. Sticky restoration/subscription-fault/control selector packets remain outstanding; no partial approval.

### Amendment G4 — exact private missing-context routing

Source9AC. At authorizeSnapshot125 add final private `causalContext?: GraphCausalContext`; after owner129 bind `const causal = owner ?? causalContext`; catch175 begins `if (causal) rememberGraphCausal(causal, error);`. Private GraphDeps.authorize557 adds optional fifth causalContext; lambda512 forwards it to authorizeSnapshot. Ownerless deps.authorize2240/2271/2368 pass invocationCreated fifth;2524 passes created;2684/2699 pass inspection-local causal. Existing688/696 use owner ALS. No public export/receipt/query/authority grant.

fencedForPostCheck740 gains final private `causalContext: GraphCausalContext`; sole call1023 supplies owner. Anonymous744 becomes `catch (error) { rememberGraphCausal(causalContext, error); return true; }`, preserving fail-safe true and same P/deadline.

At outer resumeScribe beside deadline2005 mint one private context with causalHistory/originalWeakSet/observerFailures/detachedCausalRoots; sole2007call passes it as last argument. Private resumeUnderDeadline2025 gains final causal:GraphCausalContext; invocationCreated2029 aliases the SAME four references, not a second ledger. Before outer2009 deadline.op call the gate(causal). Outer2010 first remember(causal,err), then before2011 conversion collect actual err plus actual faults with captured graphSame identity dedup; if ledger nonempty throw sole actual identity or AggregateError(array,"Scribe native observation failed."). No faults preserves exact old SessionRowMissing conversion/throw. Inner collector already owns compensation; private context is negative-only, not extra ownership. Undefined is retained. This supersedes the earlier G3part2 statement that no outer context was proposed: this finite private threading supplies it without a public/context-global API.

### Amendment G5 — complete direct first-ingress map

Source coordinates, not prospective doc callsite repins. Every listed catch inserts rememberGraphCausal(SAMEctx, actual binding) FIRST, before guard/await/collector:

- owner `error`:175(optional causal alias under G4),680,812,846,909,982,1034; `expiry`:681outer/815/849; `err`:859/1015/1026/1105/1571/1767/1818/1915; `cleanupErr`:1049/1064/1108; `cleanupFailure`:1112.
- createdCall `err`:1217/1342 (1342 BEFORE owner earlythrow); `error`:1229/1354; `cleanupFailure`:1289; `failure`:1414.
- created `err`:1591; `error`:1623/1699; `cleanupFailure`:1755/1902; `cleanupErr`:1781.
- invocationCreated `err`:2153/2306/2394 (2394 BEFORE owner earlythrow); `error`:2186/2204/2335/2353/2410; `failure`:2492.
- inspect local causal `err`:2621/2644/2721/2744 (2744 BEFORE collector IIFE).

Existing deadline.op catch(error) wrappers first remember using SAME existing receipt context, then original receipt callback/throw. Existing rejection callbacks1573error use owner before compensate;2210/2359error invocationCreated before throw; allSettled outcomes2190/2339 invocationCreated before postFailure. Original-expiry callbacks789/1146/2041 first remember SAME owner/createdCall/invocationCreated before original receipt. Three receipt arrows778/1136/2031 first remember before provenance/registry. G4 supplies anonymous744 and outer2010. Source1915 gets capture ONLY, never the fault gate in its unconditional expiry catch. Ordinary catch roots receive no positive receipt enrollment.

### Amendment test D — actual native subscription fault base and owned-row oracle

Append supplemental local scenarios AFTER all protected original healthy decisions callback41 assertions, not around/replacing them. Existing79 BSONidempotence/239heldcount1/290cleanup failure remain protected. Literal S-only base supplied by test owner:

```ts
{
  const { db: probeDb, fakeDb: probeFake, decisions: probeRows } = setup();
  const savedInsert = probeRows.insertOne.bind(probeRows);
  const S = new Error("PRIVATE_D070_REJECT_SUBSCRIPTION");
  let reads = 0, species = 0, stack: string | undefined;
  let raw: Promise<unknown> | undefined;
  let fired = false;
  const hostile = { get [Symbol.species]() { species++; stack = new Error().stack; throw S; } };
  probeRows.insertOne = ((...args: Parameters<typeof savedInsert>) => {
    const P = savedInsert(...args);
    if (!fired && args[0].threadId === "d070-reject-observer") {
      fired = true; raw = P;
      Object.defineProperty(P, "constructor", { configurable: true, get() { reads++; return reads === 1 ? hostile : Promise; } });
    }
    return P;
  }) as typeof probeRows.insertOne;
  try {
    const result = await recordRejectReasons(probeDb, {
      threadId: "d070-reject-observer", studentId: "d070-reject-student",
      rejected: [{ key: "major", reason: "private outcome" }]
    }).then(value => ({ value }), error => ({ error }));
    assert.ok(raw && fired);
    assert.equal(species, 1);
    assert.ok(reads >= 2);
    assert.ok("error" in result);
    if ("error" in result) assert.strictEqual(result.error, S);
    await raw;
    assert.deepEqual(probeRows.all(), []);
    // Exact production N(inserting) numeric stack assertion ONLY after actual source freeze.
  } finally {
    probeRows.insertOne = savedInsert;
    if (raw) await Promise.allSettled([raw]);
  }
}
```

Real insert ACK/await, no onOriginal enrollment or then override. A remove-N(inserting) mutant must make species0/healthy helper and exactS assertion RED, not incidental intrinsic failure. Other supplemental healthy/S+C/S+F/foreign/recreated winner branches require finite literal expansion; not approved by this base. Successful S-only refusal removes ONLY exact writerToken-owned row; deterministic-ID foreign/recreated DIFFERENTtoken winner remains exact BSON/property presence. Cleanup failure retains C+S and honestly present own residue; no false totalcount0 oracle. R6 immediate raw postcheck/undo can remain pending beyond original timer until actual release; SAME-deadline race begins only after initialcleanup and collector creation. R6 immediateundo+collectorfinalundo can perform TWO exact-token attempts (second no-op), not a memoized once-count. Summary facts memoized undo has its distinct once contract. This explicit limitation is not a deadline waiver, runtime result or readiness proof.

Summary F4 normal fault result is AggregateError with message `Session summary failure and owned cleanup failed.` and vector[S] for sole S, not exactS direct throw. F4 ordered identity dedup is err/authorityLoss/private closure errors or actual closureerror/ledger; F5 bodyFailure/private closure errors or actual closureerror/ledger. Only real expiry+exact undoP unclosed yields FWD exposing SAMEP/cause native aggregate; deferred external deadline gets no own receipt. All genuine F identities including race failure remain unless exact private closure identity map owns them.

### Mandatory summary closure seal, fault-only memoization and ingress correction

Beside summary settlementErrors1795 add `const closedSettlements = new Set<Promise<unknown>>(); let faultUndo: Promise<void> | undefined;`. In ALREADY-proposed exact-self undo1841 outer ordinaryarrow/ONEinnerIIFE (`let settlement!: Promise<void>; settlement = (async () => { ... })(); return settlement;`), immediately before1931 errors throw after fixed-point/classifier/final vector add `closedSettlements.add(settlement);`. Both fulfilled and rejected exact closure P are marked only at seal.

F4 catch settled declaration is `const settled = provenanceFailures.length ? (faultUndo ??= undo()) : undo();`; F5 faultbranch is `const settled = faultUndo ??= undo();`. This memoizes only new fault paths. No-fault undo call remains exactly old; do NOT globally memoize public undo. Existing ownedCleanup??=1895 stays once. No new native site or method.

In new F4/F5 closure catches first observeCausal(error), then typed closureFailure. Deferred bodycatch first observeCausal(err), then typed bodyFailure. First observe every new actual failure aggregate before branch/throw, new actual expired envelope before forwarding, and forwarding observerError before ledger push. These are causal snapshots only, not subscriptions; native site census60 remains unchanged. F4/F5 normal public aggregate always retains fixed `Session summary failure and owned cleanup failed.` even sole S; tests must not expect scalar S.

### Mandatory R6 strict-deadline replacement — supersedes raw-await forced-S cleanup

Prospective correction from decisions source owner. Application deadline/liveness D016 and B23.3/B15 remain binding. Add `let observationForcedPostcheck = false;` beside postcheckFailure230. At233–242 capture SAME existing actual call and preserve original selector/readtimeout/callback:

```ts
observationForcedPostcheck = expiryObserverFailures.length > 0 || causalObserverFailures.length > 0;
const postchecking = compensateIfFenced(db, input.studentId, async () => {
  immediateUndoAttempted = true;
  try { await undo(); }
  catch (error) { observeCausal(error); immediateUndoFailures.push(error); }
}, {
  ...(failure ? { cause: failure.err } : {}),
  alwaysUndo: deadline.expired() || !!authorityLoss || observationForcedPostcheck
});
if (observationForcedPostcheck) {
  if (!originalOperations.includes(postchecking)) originalOperations.push(postchecking);
  // SAME complete literal native observer N(postchecking), BOTH handlers undefined.
  await deadline.run(postchecking);
} else await postchecking;
```

Existing catch243 becomes:

```ts
catch (error) {
  observeCausal(error);
  if (observationForcedPostcheck && deadline.expired()) {
    const actualExpiry = await originalExpiry.catch(reason => reason);
    ownExpiryFailures.add(actualExpiry);
    if (error !== actualExpiry) postcheckFailure = { err: error };
  } else postcheckFailure = { err: error };
}
```

Actual raced E is not an unexpected postcheck fault; distinct S/R remain. Held postchecking is tracked ORIGINAL for R3 collector; real FWD can precede raw cleanup release with SAME settled pending.

After254, before255, replace preceding bare-awaitundo fault branch:

```ts
if ((expiryObserverFailures.length || causalObserverFailures.length) && !immediateUndoAttempted) {
  immediateUndoAttempted = true;
  const cleaning = undo();
  if (!originalOperations.includes(cleaning)) originalOperations.push(cleaning);
  // SAME complete literal native observer N(cleaning), BOTH handlers undefined.
  try { await deadline.run(cleaning); }
  catch (error) {
    observeCausal(error);
    if (deadline.expired()) {
      const actualExpiry = await originalExpiry.catch(reason => reason);
      ownExpiryFailures.add(actualExpiry);
      if (error !== actualExpiry) immediateUndoFailures.push(error);
    } else immediateUndoFailures.push(error);
  }
}
```

Expiry fallback256–259 must use `if (!immediateUndoAttempted && !observationForcedPostcheck)` before its SAME old undo body. Held forced postcheck read can leave immediateUndoAttempted false; do not start a blocking fallback duplicate. Actual forcedpostchecking performs ownedundo under original compensate; collector finalundo after its drain removes late writes. Undo can start with timer justexpired under existing legal cleanup, no renewed timer. Actual later C comes from ORIGINAL cleaning outcome, never synthetic expiry failure.

Coexisting auth20 rejection original251–253 keeps authorityLoss={err} and immediateUndoAttempted=true; bind `const authorityCleaning = undo();` once. If either observer ledger is nonempty, push SAME authorityCleaning into originalOperations if absent, attach SAME native N(authorityCleaning), await deadline.run(authorityCleaning); otherwise await SAME authorityCleaning as old undo. Catch first observes actual error; when fault-forced+expired compare SAME actualExpiry and add only distinct C to immediateUndoFailures; otherwise old actual push. No second call/authrefresh. Third explicit nativeattachment makes decisions static census11->14. Track actual postchecking and executed cleaning/authorityCleaning, not nativeThen children.

Add `let undoFailuresDrained = 0;` beside nestedDrained298. In existing collector loop before302 observer-ledger drain:

```ts
while (undoFailuresDrained < immediateUndoFailures.length) {
  const error = immediateUndoFailures[undoFailuresDrained++];
  observeCausal(error);
  if (!errors.includes(error)) errors.push(error);
  errorStack.push(error);
}
```

Initial roots dedup; late C after held postchecking/undo is retained and its P/Q joined. Collector waits actual work/originalOperations including forced cleanup, then final exact undo after all original/nested drain. Early actual FWD is not own-zero proof until SAMEsettled terminal and raw readback. This mandatory correction supersedes testD's earlier disclosed pending-beyondtimer/no-immediateFWD assertion for fault-forced paths; corrected controls require actual early realFWD with held tracked original pending, not a deadline waiver.

Graph postcheck744 limitation remains explicit: capture preserves fail-safe true, but WeakMap history is not enumerable and captured swallowed R is not automatically a collector root. Capture alone does NOT prove hidden Q reachable solely from swallowed R drains. Complete prospective review must decide the finite private discovery-seed routing requirement; no broad opaque-ancestry claim or source GO follows this disclosure.

### Amendment test S — actual observed drift restored before native Q join

Finite literal control from /root/native_subscription_injector in the EXISTING normalcheckpointer callback122 tail (original packet3319+). Add `observed-restored` fault union literal and ONLY one matrix row `["sync", "observed-restored"]`. Existing leaf is independent C. After3326 existing Q.catch (BEFORE any constructor poison), add:

```ts
const independentS = new Error("PRIVATE_CAUSAL_Q_S_NO_C");
let qConstructorReads = 0;
let qRestoreStack: string | undefined;
let qRestored = false;
let savedCause: PropertyDescriptor | undefined;
let savedErrors: PropertyDescriptor | undefined;
let savedSettled: PropertyDescriptor | undefined;
let savedPrototype: object | null = null;
```

Add mutate branch before pregel:

```ts
else if (fault === "observed-restored") {
  savedCause = Object.getOwnPropertyDescriptor(reason, "cause");
  savedErrors = Object.getOwnPropertyDescriptor(reason, "errors");
  savedSettled = Object.getOwnPropertyDescriptor(reason, "settled");
  savedPrototype = Object.getPrototypeOf(reason) as object | null;
  Object.defineProperty(reason, "cause", { value: leaf, writable: true, configurable: true });
  Object.defineProperty(reason, "settled", { value: Q, writable: true, configurable: true });
  QUsed = true;
  Object.defineProperty(Q, "constructor", {
    configurable: true,
    get() {
      if (++qConstructorReads === 1) {
        qRestoreStack = new Error().stack;
        assert.strictEqual(Object.getOwnPropertyDescriptor(reason, "cause")?.value, leaf);
        assert.strictEqual(Object.getOwnPropertyDescriptor(reason, "settled")?.value, Q);
        Object.setPrototypeOf(reason, savedPrototype);
        for (const [key, descriptor] of [["cause", savedCause], ["errors", savedErrors], ["settled", savedSettled]] as const) {
          if (descriptor) Object.defineProperty(reason, key, descriptor);
          else assert.equal(Reflect.deleteProperty(reason as object, key), true);
        }
        qRestored = true;
      }
      return Promise;
    }
  });
}
```

Existing onAbort birth precedes mutate, no new onAbort callback. Source observeCausal(E) captures C/Q before N(Q). NativeThen successfully reads Q.constructor and restores original E after capture, before actual join. No test subscription/await/catch/resolve/allSettled may touch Q while the getter is active. Getter returns stock Promise and causes no subscription fault.

At3349 changed becomes `const changed = !["clean", "pregel", "revoked-raw", "observed-restored"].includes(fault);`. Sticky E CURRENT shape and authentic birth are restored/unchanged; historical taint alone must refuse it. After3349:

```ts
if (fault === "observed-restored") {
  assert.ok(qRestored);
  assert.ok(qConstructorReads >= 1);
  assert.ok(qRestoreStack);
  assert.strictEqual(Object.getPrototypeOf(reason), savedPrototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(reason, "cause"), savedCause);
  assert.deepEqual(Object.getOwnPropertyDescriptor(reason, "errors"), savedErrors);
  assert.deepEqual(Object.getOwnPropertyDescriptor(reason, "settled"), savedSettled);
  assert.equal(Object.getOwnPropertyDescriptor(independentS, "cause"), undefined);
}
```

Add exact actual production N(Q) stack frame assertion ONLY after final measured source freeze. Guessed numeric/family pins do not count. Replace BOTH rejectQ(leaf) at3352 with `rejectQ(fault === "observed-restored" ? independentS : leaf)`; preserve actual pendingQ/closureDonefalse. After3362 public DAG assertions:

```ts
if (fault === "observed-restored") {
  assert.ok(seen.has(leaf), "restored-away C retained independently of Q rejection");
  assert.ok(seen.has(independentS), "actual Q rejection S retained without cause C");
}
```

Finally3367 rejectQ uses same conditional; before direct Promise.allSettled3368 delete Q.constructor in this row, so cleanup cannot trigger the active getter even on failure. Existing BSON/provider/ownedcleanup oracles stay. Independent C-history omission keeps source N(Q), restoration and QrejectionS, and must make missing-C assertion intendedRED. Independent Q-history/enrollment omission must make actualQpending or missing-S assertion intendedRED. This is not private inspector spying, ACK authority, actual pregel integration proof or abort/fire runtime proof.

### Prospective expanded test selectors and unchanged boundaries

Test owner scope is only EXISTING erasure callbacks1611/2202; saver NORMAL122tail435–438; facts receipt1781/admission1978/2022/standalone2095/2143; decisions healthy41/idempotent79/held239/290. Protected original128 graph/16 adapter/33 persistence/D069 assertions AND budgets byte-preserved. New lowlevel8/compiled8 sync rows plus sticky1 are supplemental, not replacements. Summary14old+8new native/deferred/early and admission controls need their full finite exact packet before whole freeze.

After WHOLE prospective approval only, proposed db selection:

```text
pnpm --filter @vc/db exec tsx --test --test-name-pattern='D-016 deadline: a writer that exceeds|D-016 deadline: the post-check runs AT|D068 admission|D068 summary|D048 standalone|recordRejectReasons: writes the thread id|recordRejectReasons: idempotent under the SAME|D044 rejection leaf' tests/erasure.test.ts tests/facts.test.ts tests/decisions.test.ts
```

Engine NORMAL plus ALL pinned original128/16/33 selectors remain verbatim from preceding complete packet. Original40/200ms deadlines, elapsed<2000, 5k/10k callback ceilings unchanged. Single sequential process for prototype/run spies; numeric native physical pins only after measured frozen implementation. Added cases do not renew allowances. Same-turn pre-first-job foreign mutation, external opaque Promise ancestry, genuine framework pregel on SAME compiled expiry, and private abort-before-fire stronger runtime witness remain explicitly unproved; static order alone proves only its stated source boundary.

### Amendment G6 — swallowed postcheck discovery frontier, finite deep causal routing

Supersedes the earlier explicit unresolved postcheck744 gap with this prospective private plan; still no approval/source GO. In existing invokeFenceAware bind `const postCheckFrontier = new Set<unknown>();` beside owner setup before compensate closure. Private fencedForPostCheck signature is `(db, studentId, causalContext: GraphCausalContext, frontier: Set<unknown>)`; sole1023call passes SAME owner/postCheckFrontier. Catch744 first remembers actual R, captured Set.add(frontier,R), then returns SAME fail-safe true.

Only owner compensate924 collector gains local `const postCheckNodes = new Set<unknown>();` beside roots/forced. Each round, after fault/detached ledger merge and BEFORE original main queue/discovery:

```ts
const frontierQueue: unknown[] = [...postCheckFrontier];
const frontierPass = new Set<unknown>();
for (let ix = 0; ix < frontierQueue.length; ix++) {
  const node = frontierQueue[ix];
  if (frontierPass.has(node)) continue;
  frontierPass.add(node);
  postCheckNodes.add(node);
  const current = rememberGraphCausal(owner, node);
  if (!current) continue;
  const history = owner.causalHistory!.get(current.node)!;
  let tainted = false;
  for (let version = 0; version < history.length; version++) {
    const frame = history[version]!;
    const compared = WriterDeadline.inspectCausal(node, frame);
    if (frame.unsafe || frame.failed || !compared || !compared.unchanged || compared.unsafe || compared.failed) tainted = true;
    for (let child = 0; child < frame.children.length; child++) frontierQueue[frontierQueue.length] = frame.children[child];
    if (frame.failed) frontierQueue[frontierQueue.length] = frame.failure;
  }
  if (tainted) {
    roots.add(node);
    forced.add(node);
    for (const seed of postCheckFrontier) { roots.add(seed); forced.add(seed); }
  }
}
```

Original main queue becomes `[...roots, ...postCheckFrontier]`. Seeds and unchanged child nodes are DISCOVERY ONLY, not roots/forced/receipts/raw originals/positive grants. Hidden actual native Q is discovered and observed under G1 before join even if unchanged R. Nested-rejected-parent loop940 keeps forced.add(parent); when postCheckNodes.has(parent), additionally roots.add(parent) and roots+forced every actual postCheckFrontier seed. SAME propagation applies to rejected-drained-Q branch; exact Qreason remains original root. Deep R→C→Q recognized by actual retained causal frames, not guessed Promise ancestry. Unrelated rejected parent outside postCheckNodes does not promote frontier. Frontier never clears during invocation. All fulfilled unchanged R/C stay discovery-only and preserve original fail-safe fenced outcome; tainted/restored/unsafe/failed nodes stay independently unexpected. SAME collector/deadline/actual heldQ drain, no extra timer/observer-child enrollment/reflection implementation/public field. Earlier G6 direct-frontier-membership-only idea is superseded by this complete local descendant map.

### Final graph field and exact rejected-parent literal reconciliation

Read-only source-owner reconciliation against snapshot4C8CE7771A081349BDB40AD39FA7285D4988191CB219FB9FDB8F25DF032B54EF found G1–G6 matched, with these finite clarifications. G4 descriptive originalWeakSet means actual field `observedOriginals: new WeakSet<Promise<unknown>>()`, alongside causalHistory/observerFailures/detachedCausalRoots. InvocationCreated aliases SAME actual four fields.

G6 exact owner-only nested-parent replacement:

```ts
for (const parent of nested.get(unjoined[index]!)!) {
  forced.add(parent);
  if (postCheckNodes.has(parent)) {
    roots.add(parent);
    for (const seed of postCheckFrontier) { roots.add(seed); forced.add(seed); }
  }
}
```

In owner rejected-drained-Q existing `roots.add(reason); forced.add(reason); forced.add(error);`, append:

```ts
if (postCheckNodes.has(error)) {
  roots.add(error);
  for (const seed of postCheckFrontier) { roots.add(seed); forced.add(seed); }
}
```

Actual source variables error/index/unjoined remain existing ownercollector bindings. This supplements ONLY owner924; no other collector gains postcheck frontier. Earlier redundant1336 withdrawal and explicit context/postcheck supersessions remain binding.

Authority boundary clarification: root separately authorized D077 checker-runner ONLY and D078 isolated HindiUI ONLY. Neither authorizes these privacy source/test edits. Historical no-D077/sourceGO wording is historical readiness context; CURRENT state is no NEW PRIVACY SOURCE GO, with eventual authorization subject to a fresh complete whole prospective approval and official next decision. Privacy pins remain unchanged. Supplemental test packet remains incomplete, so this document is not final feature readiness or partial approval.

### Final decisions supplemental test replacement — strict-deadline actual native cases

Supersedes the S-only testD supplemental draft4261–4304; protected original healthy callback41 remains byte-identical. Append this loop after its old assertions, no new title/helper/file. The final map typing correction is applied literally below (`Record<string, unknown[]>`). Exact frozen N(inserting) physical numeric stage is filled only after measured source freeze, never a family match.

```ts
for (const mode of ["S", "S+C", "S+F", "foreign", "recreated"] as const) {
 const { db: probeDb, fakeDb: probeFake, decisions: rows } = setup();
 const input = {threadId:`d070-native-${mode}`,studentId:"d070-native-student",rejected:[{key:"major",reason:"PRIVATE_D070_OWN_REASON"}]};
 const id=rejectReasonAuditId(input.threadId); const winner={_id:id,kind:"per_fact_reject" as const,threadId:input.threadId,studentId:input.studentId,rejected:[{key:"major",reason:"PRIVATE_D070_WINNER_REASON"}],decidedAt:"2026-10-01",writerToken:"ffffffff-ffff-4fff-8fff-ffffffffffff"};
 if(mode==="foreign")rows.seed(winner);
 const expected:Record<string,unknown[]>=Object.fromEntries(Object.values(COLLECTION_NAMES).map(name=>[name,probeFake.collection(name).all()]));
 const insert=rows.insertOne.bind(rows),remove=rows.deleteMany.bind(rows);const S=new Error("PRIVATE_D070_SUBSCRIPTION"),C=new Error("PRIVATE_D070_CLEANUP");let reads=0,species=0,stack:string|undefined;let raw:Promise<unknown>|undefined,ownedToken:string|undefined;let once=true,cleanupCalls=0;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let reached!:()=>void;const entered=new Promise<void>(resolve=>{reached=resolve;});let cleanupP:Promise<unknown>|undefined;let publicP:Promise<void>|undefined;let attempt:Promise<{value:unknown}|{error:unknown}>|undefined;
 const hostile={get[Symbol.species](){species++;stack=new Error().stack;throw S;}};
 rows.insertOne=((...args:Parameters<typeof insert>)=>{const P=insert(...args);if(once&&args[0].threadId===input.threadId){once=false;raw=P;ownedToken=args[0].writerToken;Object.defineProperty(P,"constructor",{configurable:true,get(){return ++reads===1?hostile:Promise;}});}return P;}) as typeof rows.insertOne;
 rows.deleteMany=((...args:Parameters<typeof remove>)=>{const filter=args[0] as Record<string,unknown>;if(filter._id===id&&filter.studentId===input.studentId&&filter.writerToken===ownedToken){cleanupCalls++;if(mode==="S+C")return Promise.reject(C);if(mode==="recreated"&&cleanupCalls===1){return(async()=>{await remove({_id:id});rows.seed(winner);expected[COLLECTION_NAMES.decisions]=[winner];return remove(...args);})();}if(mode==="S+F"&&cleanupCalls===1){const P=(async()=>{reached();await held;return remove(...args);})();cleanupP=P;return P;}}return remove(...args);}) as typeof rows.deleteMany;
 try {
  attempt=recordRejectReasons(probeDb,input,{deadlineMs:40}).then(value=>({value}),error=>({error}));
  if(mode==="S+F"){
   await Promise.race([entered,attempt.then(()=>assert.fail("held actual initial undo must be reached"))]);
   const out=await attempt;assert.ok("error"in out&&out.error instanceof FencedWriterDeadlineError);
   if(!("error"in out)||!(out.error instanceof FencedWriterDeadlineError))throw new Error("genuine bounded fault cleanup missing");
   publicP=Object.getOwnPropertyDescriptor(out.error,"settled")!.value;
   let done=false;
   const seen=Promise.prototype.then.call(publicP,()=>{done=true;return{value:undefined};},error=>{done=true;return{error};});
   await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(done,false);assert.ok(cleanupP);
   release();const final=await seen;assert.ok("error"in final);
   if("error"in final){
    const queue:unknown[]=[final.error];const visited=new Set<unknown>();
    for(let i=0;i<queue.length;i++){
     const v=queue[i];if(visited.has(v))continue;visited.add(v);
     if(v instanceof Error){
      const d=Object.getOwnPropertyDescriptor(v,"cause");if(d&&Object.hasOwn(d,"value"))queue.push(d.value);
      if(v instanceof AggregateError){
       const e=Object.getOwnPropertyDescriptor(v,"errors");
       if(e&&Object.hasOwn(e,"value")&&Array.isArray(e.value))for(const key of Reflect.ownKeys(e.value)){
        const member=Object.getOwnPropertyDescriptor(e.value,key);
        if(typeof key==="string"&&/^(0|[1-9]\d*)$/.test(key)&&member&&Object.hasOwn(member,"value"))queue.push(member.value);
       }
      }
     }
    }
    assert.ok(visited.has(S));
   }
  } else {
   const out=await attempt;assert.ok("error"in out);
   if("error"in out){
    if(mode==="S+C"){
     assert.ok(out.error instanceof AggregateError);
     if(out.error instanceof AggregateError){assert.equal(out.error.constructor,AggregateError);assert.equal(out.error.message,"recordRejectReasons: causal observation failed");assert.deepEqual(out.error.errors,[C,S]);}
    } else assert.strictEqual(out.error,S);
   }
  }
  assert.equal(species,1);assert.ok(reads>=2&&raw);
  // Exact frozen N(inserting) numeric stage assertion ONLY after actual source freeze.
  if(mode==="foreign")await assert.rejects(raw!);else await raw;
  if(mode==="S+C"){
   assert.equal(rows.all().filter(row=>row._id===id&&row.writerToken===ownedToken).length,1);assert.ok(cleanupCalls>0);
  }else for(const name of Object.values(COLLECTION_NAMES))assert.deepEqual(BSON.serialize({rows:probeFake.collection(name).all()},{ignoreUndefined:false}),BSON.serialize({rows:expected[name]},{ignoreUndefined:false}));
 }finally{
  release();rows.insertOne=insert;rows.deleteMany=remove;
  await Promise.allSettled([...(raw?[raw]:[]),...(cleanupP?[cleanupP]:[]),...(publicP?[publicP]:[]),...(attempt?[attempt]:[])]);
 }
}
```

Recreated winner uses real remove and seeded different UUID before original conditional delete; foreign duplicate is actual insert11000, no simulated ACK. S+C preserves actual C then S vector and honest own residue. Complete unrelated BSON for that residue is supplied separately below before final freeze. Remove-N(inserting) intended falsifier must fail actual species/identity assertion. Existing protected healthy body supplies clean companion; this loop adds five scenarios, not six duplicate clean executions.

### Mandatory decisions supplemental oracles

S+C branch additionally compares EVERY collection after filtering only exact own residue `(name === COLLECTION_NAMES.decisions && row._id === id && row.writerToken === ownedToken)` against expected[name], with BSON ignoreUndefined:false. This preserves unrelated/foreign/property-presence bytes while honestly retaining failed cleanup row. In S+F capture the public envelope's OWN cause descriptor before publicP observation, then after final closure assert its exact flags/value unchanged. Public actual F is preserved in that immutable primary cause; expected own F may be correctly filtered from final settlement, so do not force it to be unexpected in final aggregate. Final closure DAG still contains S. Foreign raw rejection asserts actual Mongo11000 via error.code, not generic rejection. Numeric stage qualification remains exact measured N(inserting), not regex/callfamily. These finite additions supersede prior weaker generic assert.rejects and incomplete S+C byteoracle.

### Final summary native/deferred/early supplemental test — complete literal branch

From /root/summary_fault_controls. Replace ONLY the existing two matrix loop headers, retain all fourteen original callback bodies below new branch verbatim; remove now-unused second loop closing brace. Same existing callback/title/deadline:

```ts
for (const [window, termination] of [
 ...(["candidate-insert", "summary-cas"] as const).flatMap(window => (["clean-own-expiry", "raw-error", "raw-abort-name", "foreign-clean", "foreign-rejecting", "distinct-cleanup", "shared-cleanup"] as const).map(termination => [window, termination] as const)),
 ["normal-candidate", "observer-only"], ["normal-candidate", "observer-plus-original"],
 ["normal-cas", "observer-only"], ["normal-cas", "observer-plus-original"],
 ["deferredcommit", "observer-only"], ["deferredcommit", "observer-plus-original"],
 ["earlyowned", "observer-only"], ["earlyowned", "observer-plus-original"],
] as const) {
 test("D068 summary original receipt: " + window + " " + termination + " preserves exact failure and owned beforeimage", { timeout: 5_000 }, async t => {
  // New branch below, followed by ALL EXISTING original callback body verbatim.
 });
}
```

Inside that existing callback, BEFORE old setup, insert:

```ts
if (window !== "candidate-insert" && window !== "summary-cas") {
 const { db: rawDb, fakeDb } = setup();
 const db = tenantScopedDb(rawDb, "summary-a"), foreignDb = tenantScopedDb(rawDb, "summary-b");
 const studentId = "receipt-student", sessionId = "receipt-session";
 for (const [scope, text] of [[db, "OWN_COMMITTED_BEFOREIMAGE"], [foreignDb, "FOREIGN_COMMITTED_PERSONAL_HISTORY"]] as const) {
  await scope.collection(COLLECTION_NAMES.consents).insertOne({ _id: "receipt-grant", studentId, guardianConsent: false, minor: false, purposes: ["counselling", "profile_synthesis"], recordedAt: "2026-10-14", lifecycleIncarnation: "11111111-1111-4111-8111-111111111111" });
  await ensureScribeSessionRow(scope, { studentId, sessionId, threadId: "actual-receipt-fixture" });
  await recordApprovedSessionSummary(scope, { studentId, sessionId, summary: text, summaryWithheldReason: "" });
 }
 const before = Object.fromEntries(Object.values(COLLECTION_NAMES).map(name => [name, fakeDb.collection<{ _id: string } & Record<string, unknown>>(name).all()]));
 const sessions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.sessions), decisions = fakeDb.collection<{ _id: string } & Record<string, unknown>>(COLLECTION_NAMES.decisions);
 const insert = decisions.insertOne.bind(decisions), cas = sessions.findOneAndUpdate.bind(sessions), update = decisions.updateOne.bind(decisions);
 const S = new Error("PRIVATE_D070_SUMMARY_SUBSCRIPTION"), E = new Error("PRIVATE_D070_SUMMARY_EARLY_CALLBACK");
 let constructorReads = 0, speciesReads = 0, cleanupHits = 0, originalHits = 0; let speciesStack: string | undefined;
 const hostileConstructor = { get [Symbol.species]() { speciesReads++; speciesStack = new Error().stack; throw S; } };
 let latest: Promise<unknown> | undefined, facade: Promise<unknown> | undefined, inner: Promise<unknown> | undefined;
 let release!: () => void, entered!: () => void; const held = new Promise<void>(resolve => release = resolve), reached = new Promise<void>(resolve => entered = resolve);
 const originals: Promise<unknown>[] = [], receipts: Array<{ error: unknown; wrappedCause?: unknown }> = [];
 let ownId: unknown, ownToken: unknown, ownedUndo: (() => Promise<void>) | undefined;
 let commit: Parameters<NonNullable<RecordApprovedSessionSummaryOptions["onOwnedWrite"]>>[2];
 let attempt: Promise<{ value: unknown } | { error: unknown }> | undefined; let exposed: FencedWriterDeadlineError | undefined;
 const operationDeadline = new WriterDeadline(80);
 const observer = createHook({ init: (_id, type, _trigger, resource) => { if (type === "PROMISE" && resource instanceof Promise) latest = resource; } });
 const abort = () => { release(); observer.disable(); }; t.signal.addEventListener("abort", abort, { once: true });
 try {
  decisions.insertOne = ((...args) => {
   if (args[0].kind === "session_summary_write" && args[0].tenantId === "summary-a" && (args[0].payload as Record<string, unknown> | undefined)?.summary === "FAILED_D070_PERSONAL_SUMMARY") {
    ownId = args[0]._id; ownToken = args[0].writerToken;
    if (window === "normal-candidate" && originalHits++ === 0) {
     facade = latest; assert.ok(facade); observer.disable(); Object.defineProperty(facade, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } });
     inner = (async () => { entered(); await held; return insert(...args); })(); return inner;
    }
   }
   return insert(...args);
  }) as typeof decisions.insertOne;
  sessions.findOneAndUpdate = ((...args) => {
   if (window === "normal-cas" && args[0]._id === "summary-a:receipt-session" && args[1].$set?.summary === "FAILED_D070_PERSONAL_SUMMARY" && originalHits++ === 0) {
    facade = latest; assert.ok(facade); observer.disable(); Object.defineProperty(facade, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } });
    inner = (async () => { entered(); await held; const result = await cas(...args); assert.ok(result); return result; })(); return inner;
   }
   return cas(...args);
  }) as typeof sessions.findOneAndUpdate;
  decisions.updateOne = ((...args) => {
   if (args[0]._id === ownId && args[0].writerToken === ownToken && args[0].tenantId === "summary-a" && args[1].$set?.state === "invalid") cleanupHits++;
   if (window === "deferredcommit" && args[0]._id === ownId && args[0].writerToken === ownToken && args[1].$set?.state === "committed" && originalHits++ === 0) {
    facade = latest; assert.ok(facade); observer.disable(); Object.defineProperty(facade, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } });
    inner = (async () => { entered(); await held; return update(...args); })(); return inner;
   }
   return update(...args);
  }) as typeof decisions.updateOne;
  const options: RecordApprovedSessionSummaryOptions = { deadlineMs: 80,
   onOriginalOperation: raw => { originals.push(raw); }, onExpectedExpiry: (error, provenance) => { receipts.push({ error, wrappedCause: provenance?.wrappedCause }); },
   onOwnedWrite: (undo, _work, commitOwned) => { ownedUndo = undo; commit = commitOwned; if (window === "earlyowned") throw E; },
   ...(window === "deferredcommit" ? { deferSummaryCommit: true as const } : {}),
  };
  if (window === "earlyowned") {
   let first = true;
   options.authorize = () => {
    const P = (async () => { if (first) { entered(); await held; } const grant = await db.collection(COLLECTION_NAMES.consents).findOne({ studentId }); assert.ok(grant); assert.equal(grant._id, "receipt-grant"); assert.equal(grant.lifecycleIncarnation, "11111111-1111-4111-8111-111111111111"); assert.ok(grant.purposes.includes("profile_synthesis")); })();
    if (first) { first = false; facade = P; inner = P; observer.disable(); Object.defineProperty(P, "constructor", { configurable: true, get() { constructorReads++; return constructorReads === 1 ? hostileConstructor : Promise; } }); }
    return P;
   };
  }
  observer.enable();
  const summaryAttempt = recordApprovedSessionSummary(db, { studentId, sessionId, summary: "FAILED_D070_PERSONAL_SUMMARY" }, options);
  if (window === "deferredcommit") {
   const result = await summaryAttempt; assert.equal(decisions.all().find(row => row._id === result.summaryLineageId)?.state, "pending"); assert.ok(commit); observer.enable();
   attempt = commit({ authorize: async () => { const grant = await db.collection(COLLECTION_NAMES.consents).findOne({ studentId }); assert.ok(grant); assert.equal(grant.lifecycleIncarnation, "11111111-1111-4111-8111-111111111111"); }, deadline: operationDeadline, onOriginalOperation: raw => { originals.push(raw); } }).then(value => ({ value }), error => ({ error }));
  } else attempt = summaryAttempt.then(value => ({ value }), error => ({ error }));
  const gate = await Promise.race([reached.then(() => "reached"), attempt.then(() => "terminal")]); assert.equal(gate, "reached"); assert.equal(speciesReads, 1); assert.ok(facade && inner); assert.equal(originals.filter(raw => raw === facade).length, 1);
  assert.equal(cleanupHits, 0);
  if (termination === "observer-only") release();
  const outcome = await attempt; assert.ok("error" in outcome);
  let failure: unknown = outcome.error;
  if (termination === "observer-plus-original") {
   assert.ok(failure instanceof FencedWriterDeadlineError); exposed = failure;
   let terminal = false; void exposed.settled.then(() => { terminal = true; }, () => { terminal = true; }); await Promise.resolve(); assert.equal(terminal, false);
   assert.equal(cleanupHits, 0); release(); await inner.catch(() => undefined);
   try { await exposed.settled; assert.fail("native observer S must reject owned settlement"); } catch (error) { failure = error; }
  }
  assert.ok(failure instanceof AggregateError); assert.equal(failure.constructor, AggregateError);
  assert.equal(failure.message, termination === "observer-only" ? "Session summary failure and owned cleanup failed." : "recordApprovedSessionSummary: owned writer settlement failed");
  if (termination === "observer-only") assert.deepEqual(failure.errors, window === "earlyowned" ? [E, S] : [S]);
  const seen = new Set<unknown>(), stack: unknown[] = [failure, outcome.error];
  while (stack.length) { const node = stack.pop(); if (seen.has(node)) continue; seen.add(node); if (node instanceof Error) { const cause = Object.getOwnPropertyDescriptor(node, "cause"); if (cause && "value" in cause) stack.push(cause.value); } if (node instanceof AggregateError && node.constructor === AggregateError) { const members = Object.getOwnPropertyDescriptor(node, "errors"); if (members && "value" in members && Array.isArray(members.value)) stack.push(...members.value); } }
  assert.ok(seen.has(S)); if (window === "earlyowned") assert.ok(seen.has(E)); assert.equal(Object.hasOwn(S, "cause"), false);
  for (const rendered of [failure.message, String(failure), JSON.stringify(failure)]) assert.equal(rendered.includes("PRIVATE_"), false);
  const expectedCleanupHits = window === "earlyowned" && termination === "observer-plus-original" ? 0 : 1;
  assert.equal(cleanupHits, expectedCleanupHits); assert.ok(ownedUndo); await ownedUndo().catch(() => undefined); await ownedUndo().catch(() => undefined); assert.equal(cleanupHits, expectedCleanupHits);
  for (const name of Object.values(COLLECTION_NAMES)) {
   const rows = fakeDb.collection<{ _id: string } & Record<string, unknown>>(name).all();
   assert.deepEqual(BSON.serialize({ rows: rows.filter(row => row.tenantId === "summary-b") }), BSON.serialize({ rows: before[name]!.filter(row => row.tenantId === "summary-b") }));
   assert.deepEqual(BSON.serialize({ rows: rows.filter(row => !(name === COLLECTION_NAMES.decisions && row._id === ownId)) }), BSON.serialize({ rows: before[name] }));
  }
  if (ownId !== undefined) { const candidate = decisions.all().find(row => row._id === ownId)!; assert.equal(candidate.state, "invalid"); assert.equal(Object.hasOwn(candidate, "payload"), false); }
  assert.equal(receipts.some(receipt => receipt.error === S || receipt.error === E), false);
  // Exact speciesStack physical source stage qualified only after implementation freeze.
 } finally { release(); observer.disable(); t.signal.removeEventListener("abort", abort); decisions.insertOne = insert; sessions.findOneAndUpdate = cas; decisions.updateOne = update; operationDeadline.dispose(); await inner?.catch(() => undefined); await attempt; await exposed?.settled.catch(() => undefined); await Promise.allSettled(originals); }
 return;
}
```

This is prospective code, not execution/readiness. Exact S+F public vector remains explicitly not qualified by deriving an expected vector from the observed response; physical stage after freeze and original identity assertions are required. No old fourteen callbacks/deadlines/lines below branch change. BSON property-presence correction/import additions follow before final freeze; no partial approval is implied by having literal code.

### Mandatory summary branch type/presence corrections

All FOUR new summary BSON.serialize calls (both equality pairs, left and right) pass `{ ignoreUndefined: false }` as second argument. Explicit absence stays distinct. Imports already exist in current facts.test.ts: createHook4, BSON5, WriterDeadline28, RecordApprovedSessionSummaryOptions37; no new import is required. After `const outcome = await attempt`, replace assert.ok narrowing with `if (!("error" in outcome)) assert.fail("native subscription failure cannot publish summary success");`. This supplies concrete TypeScript branch narrowing before outcome.error. Physical speciesStack pin still only after actual measured freeze; no output-derived expected vectors.
