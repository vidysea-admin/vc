# T052 summary lineage data protocol

Date: 2026-10-14. PROPOSED - NOT APPROVED. D048 is proposed, not recorded by this artifact. Source: complete read-only handback from t052_summary_lineage_design, delivered directly to independent plan quality; root persists the protocol because that reviewer cannot write artifacts. No implementation, migration, provider/production operation or acceptance is claimed.

## Exact stored schema and identity

Use only existing decisions collection and SessionDoc. Every ledger row has version:1, studentId, sessionId and binding containing lifecycleGeneration and creationAttempt as exact presence descriptors `{present:false}` or `{present:true,value:string}`. Tenant comes from tenantIdOf(db) and existing tenant wrapper, never request-supplied authority. Empty strings remain distinct from absence. No own undefined or unknown payload field.

Public payload is only optional string summary, summaryApprovedAt and summaryWithheldReason. The complete private marker tuple is summaryWriterToken, summaryLineageId, summaryRestoreToken, summaryBaselineId, summaryVerificationId and summaryProofCreatorToken, each with exact original own-property presence/value. Public payload plus markers form nine-field rollback identity. Other session fields never change through summary rollback.

- session_summary_verification: _id, state:verified, creatorToken UUID, snapshotDigest, source fresh_session_creation or verified_migration, immutable verified evidence; no payload.
- session_summary_baseline: _id, state:verified, creatorToken UUID, proofId, proofCreatorToken, snapshotDigest, immutable payload and baselineMarkers.
- session_summary_write: _id `summary-write:` plus writerToken UUID, writerToken UUID, distinct restoreToken UUID, immutable parentId/rootId and materializationMarkers; state pending, committed or invalid. Pending/committed require own summary and summaryApprovedAt strings with optional reason. Invalid MUST have no own payload.

Allowed transitions: pending->committed; pending->invalid; committed->invalid; invalid->invalid. Invalid is absorbing, never restore payload. Candidate materializationMarkers contain own writer UUID/node ID, unchanged admission association fields and original absence of summaryRestoreToken. Candidate contains only own payload, never copied ancestor text.

proofId is `summary-proof:` plus SHA256 of a canonical presence-aware sequence of tenant namespace, student/session, binding and admitted baseline tuple. Strings are never trimmed or Unicode-normalized. rootId is `summary-baseline:` plus SHA256 of that scope/snapshot and proof.creatorToken. A post-erasure identical-byte replacement proof has a different root, so old references cannot adopt it. Baseline creator ownership is separate from shared validity.

Fresh proof creationReceipt is operation lifecycle_open or scribe_create, actual insertion generation/creationAttempt, original consentId/lifecycleIncarnation. Only acknowledged upsertedCount===1 plus exact own-session readback with summary/marker tuple absent permits proof. Existing/duplicate/CAS-loser/ambiguous insert cannot mint proof. Existing ensureScribeSessionRow creator path owns proof/root creation. All originals registered before awaiting and followed by original grant/fence/deadline checks.

Fresh readiness is ONE exact creator CAS associating summaryBaselineId=rootId, summaryVerificationId=proofId and summaryProofCreatorToken=proof.creatorToken with session, requiring exact generation/attempt and initial absent tuple. Consumers require persisted association plus validated proof/root. Standalone visible proof/root are not readiness. Baseline stores the actual readiness markers; snapshot digest uses initial admitted tuple, derived readiness IDs checked separately to avoid self-reference. Verified migration can retain association fields absent only with explicit verified migration evidence and exact baseline snapshot; runtime never performs migration or lazy stamps.

Visible readiness is shared admission even if its driver response is held. Provisional creator deletion selector must require readiness association ABSENT, never a local success flag. Once ready, ordinary creator failure preserves shared anchor/proof/root for legitimate B. When original anchor is actually erased/replaced, only exact creator-owned late artifacts are deleted after original operations settle. No tombstone upsert or recreation.

## Early admission and fixed HOLD

Before ANY new attachment, transcript, concern, checkpoint, claim/lease, rejection audit or approved-data mutation, validate fresh readiness or verified historical evidence and exact ancestry. Marker syntax/current row presence alone is no evidence. Current candidate requires exact writer/node identity, matching scope, valid parent/root/proof and acyclic ancestry. Pending valid A is a verifiable provisional ancestor, never invocation authority or completed A.

Unverifiable start/resume returns exactly `{kind:'done',result:{status:'refused',reason:'Session history requires verification before new writes.'}}`. Existing ensure attachment path returns `{created:false,summaryAdmission:{status:'hold',reason:'summary_history_verification_required'}}` before mutation; callers cannot treat hold as success. Direct summary writer may throw existing SessionRowMissingError with optional FIXED code summary_history_verification_required and the same raw-free message, preserving default missing-session behavior. Translate only that exact code; never misclassify as missing consent. Unknown legacy without claimed proof/readiness/lineage is HOLD; claimed readiness/lineage with missing or corrupt proof/root/ancestor is a fixed raw-free corruption ERROR, never downgraded to HOLD. Legacy read/export stays byte-exact, no adoption/deletion/migration.

## Interfaces, original tracking and commit

Existing RecordApprovedSessionSummaryResult returns approvedAt, summaryWriterToken, summaryLineageId, rootId and sessionAuthority. New path does not use textual beforeImage as rollback authority. Existing options add private onOriginalOperation(rawPromise) and deferSummaryCommit:true. onOwnedWrite gets optional third commit callback accepting original authorize/deadline/onOriginalOperation. Reject explicit deferral without a callback consumer before mutation. Register owned undo/commit before first mutating ledger operation; every actual driver original is additionally registered BEFORE timeout/cancel race. Never register composed commit/compensation into the pending array it drains.

The ensureScribeSessionRow result is serialized directly by existing lifecycle routes. Its normal successful public fields remain the existing created/generation/creationAttempt/capability/state fields; proof/root/creator identity MUST NOT be returned. Only the fixed public HOLD descriptor above is additive. A new optional PRIVATE onSummaryAdmission(evidence) callback carries validated proof/root/shared-origin identity to the trusted graph closure, never request bodies/checkpoints or lifecycle JSON. This interface amendment requires independent quality approval with the full plan.

Direct record commits at its own final success boundary; direct writeApproved defers leaf commit until facts/result validated; graph defers to final publication. Conditional pending->committed is reversible by exact original invocation cleanup after post-await refusal. Held commit response does not certify completed A. Commit never resurrects invalid candidate or scrubbed payload. Caller keeps original fixed deadline; no renewal.

## recordApprovedSessionSummary

1. Validate input/options/captured binding. Original-authority/fence checks under original deadline; admission HOLD before writing.
2. Read exact prior nine-field tuple and immutable parent ancestry. Allocate writer UUID and distinct durable restoration UUID. Register undo/commit before candidate write.
3. Insert own payload+parent/root+markers, register/await raw driver, reauthorize. No predecessor payload backup.
4. No-upsert session CAS matches exact ID/student/binding and all captured nine fields/presence. Install own summary/time/writer/node, unset restore marker and omitted reason. Admission association and other fields unchanged.
5. Register/await raw driver and reauthorize. CAS miss invalidates/scrubs only own candidate and reports failure.
6. Direct commit conditional pending->committed, raw driver registered/awaited, reauthorize and final original deadline check; otherwise return retained deferred commit. Every failed settlement invalidates even if committed became visible.

## undoApprovedSessionSummary

1. Drain own original drivers. Read exact original anchor binding.
2. Absent/replaced origin: delete only exact owned candidate by scope/writer UUID and any root/proof actually owned by this creator under admission rules; preserve all reused/replacement artifacts. Never insert tombstones, proof/root or session. Verify owned residue absence and report deletion/read failures.
3. Present origin: atomically invalidate own pending/committed/already-invalid candidate and UNSET entire payload, retaining immutable refs/token. Never alter baseline or another candidate.
4. Read current session. Independent logical B/C: leave COMPLETE session bytes unchanged. Logical invalidated A: traverse immutable parents, skipping invalid nodes. Missing/corrupt ancestor/root/proof is fixed raw-free ERROR; never guessed root fallback.
5. CAS exact current binding/logical identity/observed physical token/admission markers/public tuple to resolved ancestor, using own durable restoreToken TEMPORARILY and target payload; no upsert. CAS miss rereads; independent winner preserved.
6. Revalidate restored ancestor. Invalid target => traverse again and normalize only exact own transient token. Valid target => exact own-token CAS restores target's saved original marker tuple, including absence. Settle actual driver and reread ownership; foreign winner never overwritten.
7. A cleanup recognizes ANY current materialization of logical A with captured observed physical token (transient, canonical or absent). Thus A invalidation after B validation/marker-clear still normalizes S0. All driver/traversal/verification errors observable, not swallowed.

After both failures settle, ENTIRE raw S0 row and nine-field tuple match baseline; no ignoring private markers. Invalid A/B rows contain no personal payload anywhere. Genuinely completed A is preserved by B-only failure. Ordinary creator failure never deletes shared S0. No detached unlock/background cleanup.

## Public history, erasure and capacity

Optional StudentExport.summaryHistory entries contain only sessionId and own present summary/summaryApprovedAt/summaryWithheldReason. Valid baseline/pending/committed stored payloads are access-copy history, not final graph completion claims. Absent S0 omitted; equal-valued distinct versions retained; invalid omitted only after verifying no payload. All three ledger kinds excluded ordinary decisions; proof/ref/authority/token metadata never public. Corrupt/missing/cyclic ancestry fails fixed raw-free error; opaque user values/strings preserved exactly. Existing erasure already deletes/residue-checks decisions by top-level studentId; writer closes late owned insert race. Root/public/graph detailed plans are separate artifacts.

Legitimate versions retained until existing student erasure. No TTL, pruning or constant total storage claim. Storage grows linearly per version/attempt. BEFORE the first candidate mutation, exact BSON size for every proof/root/candidate, projected session update AND every reachable valid S0/ancestor rollback materialization with the transient restore marker must fit 16MiB, including existing tenant metadata. Checking only the shorter candidate cannot establish that the larger baseline plus guard can later be restored. Capacity failure preserves data, never discards ancestors. No migration execution is authorized.

Capacity outcome is an existing generic Error with fixed raw-free message 'Session summary history exceeds BSON capacity.' before mutation. It is separate from legacy HOLD and never returns raw sizes/values/IDs or serialized causes.

## Required actual-driver proofs

- A invalidates while B current and completes, then B fails: exact S0, no A/B payload; complete B bytes unchanged during A cleanup.
- B reads valid A, A invalidates, held B restoration lands: B validation normalizes S0.
- B restores/validates/canonicalizes A, A invalidates later: A captures actual current physical marker and restores S0.
- B-first with pending valid A: exact provisional A, then A failure exact S0.
- Actually completed A plus B-only failure: entire A original tuple retained.
- Completed C during held restoration/canonicalization: COMPLETE C row unchanged.
- Original proof/root/candidate insertion settles after actual erase/regrant: exact own late artifacts deleted, fresh replacements untouched.
- Shared root reused by B, creator failure/held readiness response: shared S0 root/proof/anchor retained.
- Historical markerless/UUID row without evidence: visible HOLD, zero new mutations, old read/export bytes unchanged.
- New acknowledged lifecycle-open/scribe creator succeeds; ambiguous creation/CAS loser never invents proof.
- Commit mutation visible before held response and original authority loss: own committed node invalidated/scrubbed; B preserved; B later restores S0.
- Direct caller, ordinary post-write error, read/canonicalization rejection: same observable cleanup and independent positive controls.

No listed proof has been executed by the data designer. Fresh combined plan approval, separate authorizing decision, completed source review and blind dual final checker acceptance remain required.
