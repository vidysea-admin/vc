# T052 cycle2 - Fresh session summary-baseline admission proposal

Status: READ-ONLY PLAN; NOT IMPLEMENTATION APPROVAL; no runtime evidence claimed.
Bound root: D:/vc. Existing base13207bd plus retained T052 candidate. D046 resolves preserve-and-hold behavior only; a separate exact source-authorizing decision and fresh quality approval remain required.
Owner: /root/t052_db_builder_cycle2. This document is the explicitly authorized new QA proposal; it is not a new product file. Other owners cover ledger types/resolution, graph final commitment/publication, public history and tests. No peer source edits or reversions.

## Purpose and fixed behavior

Fresh, genuinely inserted sessions need trusted absent-summary S0 evidence. Existing historical sessions must never acquire that evidence merely because their summary is absent, markerless or UUID-shaped. D046 preserves their old content and public read/export bytes, and holds ANY new session-associated personal mutation until history can be verified.

The admission boundary precedes thread attachment, transcripts, concern edges, checkpoints, provider work, approval claims, facts, summary changes and rejection audit. Session preparation/open/close against an existing unverifiable session also returns the fixed HOLD before a mutation. Preparing a genuinely absent session may create only its existing opening capability; it does not create a baseline. Opening that fresh session can create its baseline only from its own successful insert receipt. This plan does not authorize historical migration or invent a grant issuer.

## Exact existing implementation targets

1. packages/db/src/facts.ts ScribeSessionRowInput and existing ensureScribeSessionRow:791 inline options/result type, lifecycle operation branch and ordinary scribe attachment branch. Input request fields do not gain authority.
2. packages/db/src/collections.ts existing SessionDoc:97, for the three private readiness association fields below. Ledger type definitions remain owned by the ledger author.
3. packages/engine/src/scribe/graph.ts existing CreatedByCall and private invocation state, startScribe prelude at its current originalSession/ensureScribeSessionRow integration (approximately884), and existing compensation. Graph owner performs those changes; this owner does not edit graph.ts.
4. Existing lifecycle route responses in apps/api/src/server.ts:290 already return the helper result directly. Consequently private admission identifiers MUST NOT be added to the helper result. Existing OpenAPI response documentation may require a narrowly authorized optional HOLD shape; no API implementation edit or current authorization is inferred here.

No new named helper, function, module, collection, product file, index, background job or production operation. Existing functions may contain the inline protocol. Existing client/tenant wrappers continue to supply tenant stamping and ID qualification.

## Proposed trusted options and public result

Extend the existing inline options type without changing existing request input schemas:

```ts
{
  timeoutMS?: number;
  authorize?: () => Promise<void>;
  onOwnedWrite?: (undo: () => Promise<void>, originalSettlement: Promise<unknown>) => void;
  originalGrant?: { _id: string; lifecycleIncarnation: string };
  onSummaryAdmission?: (evidence: {
    proofId: string;
    proofCreatorToken: string;
    rootId: string;
    origin: { _id: string; studentId: string; binding: {
      lifecycleGeneration: { present: false } | { present: true; value: string };
      creationAttempt: { present: false } | { present: true; value: string };
    } };
    shared: true;
  }) => void;
}
```

These are private programmatic options. originalGrant is captured once by startScribe, not refreshed from a replacement grant and not accepted from model, checkpoint or HTTP input. Standalone lifecycle operations capture their own original server-issued grant through the existing authority function. Tenant namespace comes from existing tenantIdOf(db), not a proposed input override. Optional authorize cannot replace the helper's actual persisted grant/fence/session checks. Omitting callbacks is not a bypass of baseline admission.

Keep existing public result fields and add only:

```ts
{
  created: boolean;
  generation?: string;
  creationAttempt?: string;
  capability?: string;
  state?: "active" | "closed";
  summaryAdmission?: {
    status: "hold";
    reason: "summary_history_verification_required";
  };
}
```

On summaryAdmission.status===hold, created is false; no newly issued capability or claimed creation identity is returned. Graph start/resume translates it to exactly {kind:'done',result:{status:'refused',reason:'Session history requires verification before new writes.'}} before any new student mutation. The direct helper returns the same fixed HOLD, rather than throwing an unidentified infrastructure error or silently attaching a thread. No student values or private proof/root/token identifiers appear in the HOLD. Proof/root evidence travels only through onSummaryAdmission's trusted closure after admission is validated. This is the earlier quality-approved fixed public HOLD shape; no alternate code/message fork or verified-result evidence fields are proposed. Normal verified returns contain only the existing public fields. Final decision/API/OpenAPI acceptance must retain this exact shape.

## Persisted proof/root and readiness association

Use the existing decisions collection and the ledger owner's explicit version1 discriminators:

- session_summary_verification: immutable verified fresh-creation evidence, exact tenant/student/session binding, explicit generation/creationAttempt presence, presence-aware pre-association snapshotDigest, source:fresh_session_creation, private creation receipt, fresh proof creatorToken and decidedAt.
- session_summary_baseline: immutable verified S0 payload and baselineMarkers, exact same binding, proofId and proofCreatorToken, fresh independent root creatorToken. Shared validity is not the creator invocation's final success.

The proof lookup ID hashes exact namespace/binding/pre-association snapshot. Its creatorToken is a new immutable incarnation. The root ID hashes that same scopeSnapshotDigest plus proofCreatorToken. An erased/recreated proof with identical public bytes but a different token therefore has a different root ID. A stale parent must never adopt a replacement root.

Add private SessionDoc fields:

```ts
summaryBaselineId?: string;
summaryVerificationId?: string;
summaryProofCreatorToken?: string;
```

Fresh baseline admission requires this actual persisted association AND the exact valid proof/root. Merely observing standalone proof/root documents is insufficient. Summary writers preserve these three association fields; they never rewrite them during normal summary materialization/restoration. Fresh baseline final baselineMarkers include them. Root ID calculation uses the pre-association digest plus proofCreatorToken, so the association values are not recursively fed into their own hash.

Verified historical migration evidence may have an explicitly absent association tuple only when the ledger validator establishes the separately specified migration provenance and exact snapshot/binding. This plan does not stamp absent associations onto old sessions and does not run migration. Present/withheld S0 positives can instead be real committed descendants of a newly admitted absent S0, produced by an actually completed graph approval.

## Fresh insertion and actual driver protocol

1. Start one WriterDeadline before the first read. When called from graph start, its timeout is the remaining time until that invocation's original expiresAt; no operation refreshes this instant.
2. Capture the original persisted grant, validate its existing purpose/minor/guardian rules and valid server-issued incarnation, and retain original student/session/tenant binding. Reauthorize before and after every awaited driver and before publication. A loss latches for this invocation.
3. Read the existing session without mutation. If it exists, validate its recorded proof/root and current lineage via the reviewed ledger protocol BEFORE addToSet, endedAt changes or lifecycle mutation. Unknown legacy history without claimed proof/readiness/lineage returns HOLD. Claimed readiness/lineage with missing or corrupt proof/root/ancestor returns the fixed raw-free corruption ERROR, never HOLD, fresh absence or fallback adoption.
4. For an actually absent session, generate a fresh generation and creationAttempt. The initial session upsert uses the original identity and setOnInsert only. Initially omit summary fields, all summary markers and scribeThreadIds. Ordinary scribe attachment adds the thread only after admission. Lifecycle open retains its existing capability/grant/actor/tenant binding and active-session fields, with summary fields still absent.
5. Record that exact original upsert promise and exact provisional cleanup before awaiting it. Only actual upsertedCount===1 establishes this invocation's successful creation receipt. matchedCount,11000, failed/ambiguous driver outcomes and independently recreated rows never mint evidence. A legitimate concurrent loser may consume the winner's already admitted proof/root after original authority checks; a provisional winner without readiness remains HOLD. It may not initialize the winner's baseline.
6. Re-read the exact inserted origin and validate original generation/creationAttempt, grant/tenant binding and the initially absent tuple below. Stamp the private creation receipt from the known successful operation. No client assertion, public content equality or syntactically valid UUID substitutes for this receipt.
7. Size-check the exact proof and root candidates before issuing their inserts. Insert proof and then root with their independent private creator tokens; record each original driver before awaiting. Check original authority after each operation. A duplicate must be independently read and match the full immutable expected identity/incarnation/content; never restamp a foreign proof/root. Proof/root write failure is not readiness.
8. Validate exact persisted proof/root, then issue ONE non-upserting readiness CAS on the original session identity and the entire own-property absent tuple. Set exactly summaryBaselineId,summaryVerificationId,summaryProofCreatorToken. Record the original driver before awaiting it.
9. This actual association CAS is the admission linearization point. Its mutation may be visible while its response remains held. Consumers can use it only after reading/validating that exact association and immutable proof/root. Readiness does not depend on the creator's local returned shared flag.
10. Re-read the original associated session and referenced evidence, followed by original authorization. A legitimate admitted child may have begun after readiness; validate its lineage rather than insisting the current summary is still absent. Invoke the private onSummaryAdmission callback synchronously and carry the immutable root identity into the existing graph owner.
11. Only now attach the thread using exact original-owner CAS and existing addToSet semantics, preserving lifecycle activation metadata. Continue transcript/concern/checkpoint work under original authority. Existing verified sessions use this same pre-mutation admission gate.

## Exact absent tuple and BSON checks

At fresh insertion verification/readiness CAS, all these fields must be genuinely absent, not present with undefined,null or a malformed value:

```text
summary
summaryApprovedAt
summaryWithheldReason
summaryWriterToken
summaryLineageId
summaryRestoreToken
summaryBaselineId
summaryVerificationId
summaryProofCreatorToken
```

Read-side checks use own-property presence. The readiness CAS places {$exists:false} on every field above, plus exact _id,studentId,lifecycleGeneration,creationAttempt and captured lifecycle binding where present. No upsert. It must not overwrite a marker-bearing summary or partial/foreign readiness association. Field absence and explicit presence are separately encoded in the digest; JSON omission is not a substitute.

Use the installed mongodb/BSON library's calculateObjectSize on each exact candidate document, including identity/binding/receipt fields and association-bearing baselineMarkers. Require each to fit Mongo's16MiB BSON document limit before issuing any write. Before the FIRST candidate mutation, additionally validate every eligible baseline/ancestor payload combined with the COMPLETE original session shape and the transient physical restoration UUID/association fields: each possible rollback materialization must fit16MiB. A candidate that fits by itself is insufficient. Include tenant qualification/stamping overhead and preserve all legitimate existing fields. If any admissible restore would exceed capacity, fail/HOLD before candidate mutation; never truncate rollback content or discover capacity only during cleanup. An oversize candidate returns a fixed bounded error; no truncation of a summary, receipt or lineage. Hashing a complete serialized ancestor chain is prohibited; each proof/root/candidate contains only its single exact payload/metadata under the ledger owner's bounded traversal protocol. The approved final implementation must use BSON-faithful scalar/type/document field-order semantics rather than object reference equality or order-insensitive normalization for selectors.

## Original operations, ownership and cleanup

Every actual driver promise is appended to the invocation's existing pending list before deadline.run or any other await. Record exact owned cleanup simultaneously. The original primitive promise is registered, not the deadline race, post-check or a compensation promise. A stable drain waits all primitives, including ones appended by late continuations, before the final cleanup pass. Never place composed settlement/compensation in its own pending array.

Before persisted readiness, no dependent writer is admitted. Provisional anchor cleanup uses exact student/session/generation/creationAttempt plus readiness-association absent conditions and the initial empty summary/marker tuple; it never upserts. It can delete only this invocation's still-provisional empty origin. Cleanup attempts all exact owned artifacts and reports aggregate failures after every attempt.

Once readiness association is visible, anchor/proof/root become shared verified S0. Ordinary provider, graph, summary, creator deadline or creator return failure cannot delete that shared origin or revoke its root. This applies even when the readiness mutation is visible but its original response is held and the creator has not observed success. The provisional delete's association-absence CAS prevents this overreach without relying on a local flag. Existing graph created.sessionRow compensation must be updated by its owner so it cannot delete an admitted shared anchor.

After original operations settle, cleanup reads the exact original anchor/binding and readiness association:

- Same origin with valid ready association: preserve shared anchor/proof/root; compensate only this invocation's later owned transcript/edge/checkpoint/fact/audit writes.
- Exact still-provisional origin: attempt its exact empty/association-absent delete, then inspect the origin again before artifact deletion. A concurrently published readiness association defeats the provisional delete and transfers ownership to shared S0.
- Original origin absent or replaced by a different generation/creationAttempt: delete only this call's created proof/root documents by kind,ID,studentId and their exact creatorToken. Recreated proof/root or session owners never match. Do not recreate erased history or borrow replacement authority.
- Claimed readiness/proof/root mismatch while the same origin exists: raw-free error/HOLD, preserve historical bytes, no root fallback. Cleanup errors remain visible.

Erasure already deletes student-scoped decisions and sessions. New evidence rows require top-level studentId and exact tenant stamping so existing erasure resolves them; no new collection or exemption. A late original insert/readiness operation after actual purge must settle before exact cleanup, even after fence release/regrant. An ordinary failure is not evidence that the original anchor was erased. A removed origin is not permission to mutate a replacement. Final tests must hold actual origin/proof/root/readiness drivers across real erase/regrant and inspect counts plus exact foreign bytes.

Cleanup can use its separately bounded existing operation timeout after execution authority/deadline expires; it never renews execution's original deadline. Its rejecting settlement Promise remains observable with an observation-only catch. No hidden background readiness, unlock, finalization or cleanup.

## Graph integration and fixed helper compatibility

startScribe captures originalGrant and originalSession once. Its prelude owns admission driver/pending/cleanup state before calling ensureScribeSessionRow. The trusted authorization callback can validate grant/fence while origin is absent, then validates the exact origin after its successful creation; it never captures a replacement as an original. The callback is provided by private code, not input state.

The helper's onOwnedWrite synchronously fills prelude pending/cleanup. The later private graph owner adopts those same lists, not new empty arrays, and receives onSummaryAdmission's exact root/proof/origin identity. Every awaited return from the helper is followed by original authorization before any new personal mutation. A HOLD branch returns the fixed reason through the existing public refusal result, after last awaited original-authority validation; it performs zero thread/transcript/concern/provider/checkpoint/claim/fact/audit mutation.

Lifecycle prepare/open/close retain original strict HTTP schemas, verified actor/tenant binding, capability presence and original deadline. Prepare on an absent session creates no baseline. Open retries of an already admitted origin preserve its exact proof/root. Existing unverifiable origins HOLD before any mutation, including close or new preparation tied to that historical origin. Direct helper calls without new options obey the same admission gate and fixed result shape. Valid admitted direct calls retain addToSet idempotency and lifecycle state preservation. Unknown old sessions remain readable/exportable exactly as before.

## Required independent acceptance and falsifiers

- Fresh ordinary scribe and signed-JWT prepare/open produce trusted absent S0 from actual successful session insert; subsequent fresh approval succeeds.
- A session insert visible with response held admits no child before readiness; after the actual readiness CAS becomes visible, a child can rely on it and survives ordinary creator failure without shared origin/proof/root deletion.
- HOLD precedes every new mutation for markerless,UUID-marked,present,absent and withheld historical sessions lacking verified evidence. Old session/transcript/read/export bytes remain exact; reason is fixed and visible.
- Duplicate/foreign insert, ambiguous failed insert, partial proof/root failure, malformed/oversize candidates and partial association never become fresh evidence.
- Same-session concurrent winner admission preserves exact owner and root identity; loser consumes valid winner evidence or HOLDs without minting it.
- Held actual session/proof/root/readiness drivers across real erase,fence release,regrant leave zero stale owned artifacts and preserve new origin/proof/root bytes. Cleanup failure rejects settled; all registered cleanup is attempted.
- Real committed current A and present/withheld S0 history remain positive via actual completed approvals; no fabricated commit/migration flag. Only B failing preserves committed A. A/B invalidation restores exact original S0 under the separately approved lineage protocol.
- Tenant/student/session/generation/attempt/grant mismatch refuses before mutation; private association/proof identifiers never appear in public result/export/history.
- Mutation floors remove the actual readiness CAS absent tuple, successful-insert receipt requirement, persisted-association consumer check, original-driver registration, shared-anchor cleanup guard and exact artifact creator-token delete. Each must reach its intended violated outcome before restored GREEN.

## Approval boundaries and unresolved integration checks

This proposal does not independently certify ledger resolution, commitment/publication or history export. The final combined plan must pin their schemas/callbacks before source edits and must explicitly authorize SessionDoc association fields, ensureScribeSessionRow options/result, graph prelude/shared-anchor compensation, and the optional public HOLD response documentation. Verified historical migration remains a separate human-approved data operation, with no migration executed by this repair.

No code, tests, types, provider calls, DB operations, processes, commit or push were performed by this plan owner. Any conflicting schema/eligibility choice in another plan must be resolved by the fresh quality coordinator; this document is proposed design, not evidence that other agents adopted it.
