# completion-memory-db — S12 bounded contribution

Status: SELF-VERIFIED contribution, self-tests only; root owns integration and final independent checks. T057 cycle2 STALLED/costs/receipts remain historical. No counter reset. No main-checkout/API/chat-threads edits; no provider/network/live-DB calls, commits or deployments.

Installed maker/checker read at safe boundary; proportional-verification/2026-10-19.17 retained. Approved S12 plan inherited; no helper checker or model override. Shell launcher fails before process creation (helper_unknown_error/setup refresh); local node child_process is available.

## Stable interfaces (2026-10-27)
- ProfileFactDoc.pendingChange?: { candidateId:string, version:string, value:string, proposedAt:string, quote?:string, sourceLang?:string, threadId?:string, turnId?:string }; internal publication metadata stays outside DTO. Active confirmed row.value/status/provenance retained until decision. Initial proposal also carries pendingChange and legacy top-level fields.
- DecideProfileFactInput: action confirm|correct|erase|reject, optional value/candidateId/expectedVersion. Replacement confirm/reject requires exact candidateId + expectedVersion + displayed candidate value. Legacy first-proposal confirm/value and correct/erase preserved. TypeError('ProfileFactChanged') remains stale signal.
- readStudentMemorySnapshot(db,studentId): Promise<{revision:string;historyAfter:string|null;historyUsable:boolean}> exported through existing wildcard barrel; readStudentMemoryRevision returns snapshot.revision. No marker => empty revision/null/true. Legacy marker without validated cutoff => historyUsable=false. Cleanup only changes revision/uncertainty; explicit successful decisions alone $max historyAfter.
- ProposedFact/MemoryItem.pendingChange expose same candidate fields; source enums include vidysea. Voice server confirm.fact and client confirm add optional candidateId/expectedVersion/value compatibility, plus threadId/promptId for root conversational binding; root must require these for replacements.
- canonicalPreferenceKey exported from existing student-api.ts for shared consumers: canonical target_country, budget, interest; preserves other legacy keys, refuses authoritative identity/name/grade/account fields. Root must apply this helper consistently in extraction, profile/graph/ranking/voice.

## Existing targets named before edits
profile-facts.ts:proposeProfileFact:92, discardProposal:135, listProfileFacts:183, decideProfileFact:208, readStudentMemoryRevision:273; student-api.ts:profile/decision:58-96 and voice:286-303; existing student-store.test.ts and student-api.test.ts. Additional existing authorized helper fakes.ts:applyUpdate:183 and FakeCollection.updateOne:385 need $max support. No new product/test module.

## Baseline identities
{
  "packages/db/src/profile-facts.ts": "41a82802c5d4578e112b6336228b40986d528a3c28c901b6d1595ca97a24ef74",
  "packages/db/tests/student-store.test.ts": "10673ed8e0ec849d76aa14dc9ccaefaff0836f99e95cab43a2a7ec36e5dcf724",
  "packages/db/tests/fakes.ts": "d6c27d3a5589570e9f7774ba2c09e47237661d7483c04cf8e05b7c629fcd2185",
  "packages/schemas/src/student-api.ts": "8d59e2beb4b93aab7af4a77b6624349cf43d5e8858cd1c07db09019d73bfa38d",
  "packages/schemas/tests/student-api.test.ts": "c79121ac9d12acc83c47894e0134320e7aa0adf01beb5bfc92912d92606c8364"
}

Policy check command: node C:/Users/Lenovo/.agents/skills/maker/tools/tick.mjs --policy-check
```
proportional-verification/2026-10-19.17 targets=2 drift=0 mode=--policy-check

```
exit 0

## Early test status
node --import tsx --test packages/db/tests/student-store.test.ts packages/schemas/tests/student-api.test.ts -> before implementation exit1:37 pass/8 fail; exact cutoff T2->T0 reproduced (red.txt).
After implementation owned tests pass. Additional existing chat-threads.test.ts run observed 81 pass/2 fail: peer-owned new S12 publication tests fail at lines54/79 (ChatTurnMemoryChanged/final guard); no edit made to peer files. Root owns those implementations. All retained Q12/Q14 memory races passed in that run.
Canonical helper preserves unknown legacy keys after PII redaction; only known aliases normalize. Corrected initial pre-redaction normalization regression by reverting its introduced ordering before applying PII-safe order; existing PII test remains unchanged.

## Final self-check (2026-10-27)
- Existing files changed: packages/db/src/profile-facts.ts, packages/db/tests/student-store.test.ts, packages/db/tests/fakes.ts, packages/schemas/src/student-api.ts, packages/schemas/tests/student-api.test.ts. Existing packages/db/src/index.ts already wildcard-exports snapshot; no barrel change needed. Additional profileFactId canonical alias change is at profile-facts.ts:54. No new product module/collection/test file.
- node --import tsx --test packages/db/tests/student-store.test.ts packages/schemas/tests/student-api.test.ts -> exit0;48 pass,0 fail,0 cancelled. Full output: completion-memory-db-green.txt. Initial red37 pass/8 fail retained in completion-memory-db-red.txt. Additional focused account and malformed-voice red tests retained in completion-memory-db-account-red.txt and completion-memory-db-voice-red.txt.
- node --import tsx --test --test-name-pattern "Q12|Q14" packages/db/tests/chat-threads.test.ts -> exit0;17 pass,0 fail (completion-memory-db-races.txt). Peer source/test changed during work; full-file publication failures above are historical observations, not current completion claims.
- node node_modules/typescript/bin/tsc --noEmit -p packages/db/tsconfig.json -> exit0,no diagnostics.
- node node_modules/typescript/bin/tsc --noEmit -p packages/schemas/tsconfig.json -> exit0,no diagnostics (completion-memory-db-typecheck.txt).
- git diff --check -- packages/db/src/profile-facts.ts packages/db/tests/student-store.test.ts packages/db/tests/fakes.ts packages/schemas/src/student-api.ts packages/schemas/tests/student-api.test.ts -> exit0; warning: in the working copy of 'packages/db/src/profile-facts.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'packages/db/tests/fakes.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'packages/db/tests/student-store.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'packages/schemas/src/student-api.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'packages/schemas/tests/student-api.test.ts', LF will be replaced by CRLF the next time Git touches it
.
- Node v24.13.1; tests use existing offline Mongo fakes. Source errors encountered in expanded cutoff fixture were incorrect test fixture requestHash/history-reader assumptions, corrected to existing declared interfaces. Existing product assertions were preserved.
- Self-review covers exact candidate/version/value CAS, active/candidate provenance separation, rejection/erasure, stale extractor/CAS races, same-candidate one-winner overlap, owner/tenant isolation, PII redaction, canonical aliases/read-only account refusal including legacy rows, durable independent uncertainty counters, $max cutoff and real local chat-context consumption. Initial T0 extraction / T1 delivered dialogue / T2 forget / successful stale cleanup no longer reopens T1 context; delivered history remains.
- No helper/final checker, mutations/falsification, full suite, provider/DB/network run or feature PASS. Root owns final independent falsification/acceptance and any integration gating. No commit/push/deploy, no historic verdict/cost/receipt/counter edits. Cost/token telemetry UNKNOWN; no claim of cost reset.

## Root integration requirements still open
- Consume readStudentMemorySnapshot rather than parsing revision as a date in both text and voice. Snapshot false means omit dialogue context, not independently valid confirmed facts.
- Project pendingChange onto profile/memory DTOs explicitly; never expose proposalToken/proposalPending. Active value remains row.value; current change is pendingChange.value. Validate confirm/reject against candidateId + expectedVersion + displayed value. Legacy key-only voice must never accept a replacement or erase active on rejection.
- Voice confirmation schemas additionally accept optional threadId/promptId and require paired candidate/version and displayed value when refs exist. Root owns fresh owned thread/prompt validation, text/voice yes-no extraction and HTTP409 mapping. MemoryConfirmationRefSchema/MemoryConfirmationRef exported from existing student-api.ts carries required candidateId,expectedVersion,value.
- Apply shared canonicalPreferenceKey consistently across extraction/profile/graph/ranking/voice. Known aliases normalize; unknown legacy keys preserve text after redaction. Authoritative account-field proposals/decisions refuse; erase remains for cleanup. No live legacy-alias migration performed.
- Central API/voice strict consumers/OpenAPI and final cross-package feature tests remain root-owned; no helper-level acceptance claimed. Original T057 cycle2 STALLED/live proof and team-supplied inputs remain unchanged.

## Final input identities
{
  "packages/db/src/profile-facts.ts": "f77f32e0b0f9d40961224150a7d6393a9558d257a88c35317e745dbf048739a7",
  "packages/db/src/index.ts": "8a3682010689ddc90bdd8739096a1c286bc3b9a7dc0cf3c0980ec2b94f34a946",
  "packages/db/tests/student-store.test.ts": "62fcf551fa9cdcc1a44e1ec9f3e8211d5fe52f4d8c3f52d7e36e9dd371811370",
  "packages/db/tests/fakes.ts": "028e7c70c1c2924d4942adacb59813af45e3c77dca216d9e39a2420a10e9feae",
  "packages/db/src/chat-threads.ts": "4f8b2d55b34ddbbc11b930c01059f005e65ab9f8b8c82f1d3a11b50b92ad3355",
  "packages/db/tests/chat-threads.test.ts": "fc7e88b3074aec84df60f97b9afa2a58bc7a2103f8d7e9d31a3eeb2b50c534d4",
  "packages/schemas/src/student-api.ts": "d3ca990c3800474b206d16c0e5687ea57513bcb3a78f797ef94a25bd626978a6",
  "packages/schemas/tests/student-api.test.ts": "2a96764c8fb473c78a79670988f417d6285d05cf0d280a4dc81560b25da68584",
  "tsconfig.base.json": "a4286af536a20e876a22b625c5b2c630dc4195cd1c9e4db8b92651090f7916b7",
  "packages/db/tsconfig.json": "cf48e2f8ce2694c521356937f4d8fd9a5081c95b3cdf6eb9fc99839b9e827552",
  "packages/schemas/tsconfig.json": "9aa58de8b9f9cd31e529bbbfb107052321c231a5275dd960a49e2f00ba4f7e73",
  "pnpm-lock.yaml": "b344f406e0b6c4beb3df693b1e67cfc7b867afd3970c580207e4203d13a1de4d",
  "C:/Users/Lenovo/.agents/skills/maker/SKILL.md": "236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39",
  "C:/Users/Lenovo/.agents/skills/checker/SKILL.md": "835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1"
}
