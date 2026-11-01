# Brief A: why a re-stated preference is not re-proposed in a new chat

Read-only investigation. No product code touched, no server touched, no student text or values read. Tree: worktree `D:/vc/.worktrees/vc-completion`; line numbers are from the working tree at investigation time (HEAD moved to aef152b9 while I worked; I modified none of the cited files).
Question: after the widget fix (8eaf5b33, a8b86f8e) a candidate from another thread has no Confirm. In a new thread the same statement did not always re-propose. Find every reason a restated, already-pending fact yields no new pendingChange bound to the current thread.

## Headline (numbers first)
- 9 gates/branches traced from a completed turn to a stored pendingChange. Ruled out: 5 (#5 to #9). Explain the observation: 2 ranked candidates (#1 extractor non-determinism, #2 revision/policy guard). Real but by design: 1 (#3 confirmed + same value). Stale-candidate edge: 1 (#4).
- The db layer ALREADY rebinds. Probed on the repo's fake db with the real `proposeProfileFact`: a restated PENDING fact from another thread gets `pendingChange.threadId` = the new thread (S1 below). The suggested fix ("rebind threadId when the same value is re-proposed") is already the behaviour for pending rows. Do not implement it.
- No log of the failing run (8d) survives in the repo: 0 matches for `chat_fact_extraction*`, `fact_extraction_all_dropped`, `fact_extraction_schema_invalid` in `qa/evidence/t057/walk-vidysea-run8-voice.log` and `walk-vidysea-run9-voice.log`; the only 4 matches in that folder are prose files about runs 4 and 5. So which cause hit run 8d is NOT proven. The ranking is from code plus probes.

## Empirical probe (fake db, real `proposeProfileFact` and `decideProfileFact`)
Script (outside the repo): `C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/7c992131-9165-42b7-81e2-0c8e034008ec/scratchpad/repro-probe.mts`, run from packages/db with `node --import tsx`. Output:

| Scenario | Result |
|---|---|
| S1 row `proposed` in thread A, same key and same value restated in thread B | status proposed, `pendingChange.threadId` = B, row threadId = B. Rebinds. |
| S2 row `confirmed` in A, same key and same value restated in B | status confirmed, NO pendingChange, row threadId stays A. Early return. |
| S3 row `confirmed` in A, same key, different value in B | pendingChange.threadId = B. Rebinds (also covered by packages/db/tests/student-store.test.ts:266-270). |
| S4 a decision (erase) completes between the turn's revision read and the proposal | `proposeProfileFact` returns `null`, nothing written. |
| S5 keys `country`, `targetCountry`, `target-country` | one factId, 1 row. `budget` and `budget_inr` are 2 distinct factIds. |

Key probe with the real `canonicalPreferenceKey` and `isEligibleMemoryFact`: `target_country`, `country`, `targetCountry`, `target-country`, `budget`, `budget_inr`, `budget_usd`, `annual_budget` all pass both (14 keys tried, 14 eligible, 14 non-null canonical). Only `target-country` fails the extractor slug regex (`nodes.ts:1251`).

## Path and every reason a restated pending fact yields no new thread-bound candidate

Order: `handleTurn` reads policy and revision (apps/api/src/chat.ts:962-977) -> reply stored -> `startAfterReply` (chat.ts:1095-1098) -> `proposeFactsDetached` (chat.ts:781-806) -> extractor -> `proposeProfileFact` (packages/db/src/profile-facts.ts:92-195).

| # | Reason | file:line | Explains the observation? | Confidence |
|---|---|---|---|---|
| 1 | Extractor returns no usable fact for the restated sentence. The model call is independent of stored state, so it can return `[]` or have the fact dropped: candidate schema mismatch (`CandidateFactSchema`, packages/engine/src/scribe/schemas.ts:102-125), quote not a verbatim substring of the turn (nodes.ts:1308), key not an ASCII slug (nodes.ts:1251, 1312), value not an English scalar (nodes.ts:1316-1325), crisis/concern text (nodes.ts:1284), one fact per key per turn (keptByKey in `extractFacts`, nodes.ts:1176-1225). This silent-drop class has hit 3 times already: run 4 schema_invalid, run 5 `validFrom` (qa/evidence/t057/c6-confirm-diag.md), run 7 sensitivity "normal" (commit dfb0f8cc). The only signal is a text-free log event the walk does not capture. | nodes.ts:1176-1352 | YES, most likely. It is the only cause that makes a restated fact fail "sometimes" regardless of what is stored. | Medium (code-certain it can; not proven for run 8d, no log) |
| 2 | Silent guard exit. Thread `textStored` false, `learningEnabled` false, or `expectedRevision !== readStudentMemoryRevision` (checked before extraction at chat.ts:784 and before each fact at chat.ts:788), then `return` with no log. `expectedRevision` is read at TURN START (chat.ts:966-967) and extraction takes about 2-3 s (c6-confirm-diag.md item 4). Any `decideProfileFact` (confirm, reject, correct, erase, i.e. the Forget clicks in the walk's c6-clean) bumps the revision (profile-facts.ts decide, marker inc then new revision), so a decision landing in that window drops every fact of the turn (probe S4). Related: if a decision is still pending at turn start, `readStudentMemorySnapshot` throws (profile-facts.ts, `StudentMemoryRevisionPending`), chat.ts:972-975 falls back to `NO_MEMORY_POLICY`, `policy.learningEnabled` is false and chat.ts:1095 never starts extraction. | chat.ts:784, 788, 962-977, 1095; profile-facts.ts:114, 168-183 | YES, plausible when the walk clicks Forget/Confirm close to the propose turn. | Medium-low |
| 3 | Same-value early return: `if (!existing \|\| (existing.status === "confirmed" && existing.value === value)) return;` The upsert matched an existing row, nothing is written, and the final `findOne` returns the row WITHOUT a pendingChange (probe S2). By design (nothing to confirm). Does NOT apply to a row that is only `proposed` (S1 rebinds). | profile-facts.ts:134 (the brief said ~131) | Only if the earlier candidate had been CONFIRMED (for example by a previous walk run on the same student that `c6-clean` did not forget). The brief says pending, so it does not explain run 8d. | High that it behaves so; Low that it is the run 8d cause |
| 4 | Edge: a confirmed row with value X holding a stale pendingChange Y from thread A; restating X from thread B hits #3 and returns, leaving Y pending in A (never rebinds, never clears). | profile-facts.ts:134 | No (a different symptom), but a real stale-candidate leak. | Medium |
| 5 | Extractor drops "known" facts because it sees memory. | nodes.ts:1180-1186 passes only `{turns, approvedContext}`; `approvedContext` defaults to `[]` (schemas.ts:141, 157); chat.ts:209-215 `FactExtractor` gets the turn text and response only; SKILL.md says known keys are not a blacklist. | NO | High (ruled out) |
| 6 | Key canonicalisation target-country vs target_country. `canonicalPreferenceKey` folds case, camel, space, dot and hyphen (packages/schemas/src/student-api.ts:62-75) and `profileFactId` hashes the canonical key (profile-facts.ts:50-54), so spellings share one row (S5). `budget` vs `budget_inr` vs `budget_usd` are different identities, but a different identity creates a NEW row bound to the current thread, so there is no gap (it can cause parallel budget rows, a separate cosmetic issue). | student-api.ts:62-75; profile-facts.ts:104-106 | NO | High (ruled out) |
| 7 | Eligibility filter `isEligibleMemoryFact` or null canonical key rejects the key. | chat.ts:218-221, 787 | NO (probe: all 14 eligible) | High (ruled out) |
| 8 | Cap of 5 facts per turn (`MAX_PROPOSED_FACTS_PER_TURN`). | chat.ts:160, 786 | NO (Canada + budget is 2 facts) | High (ruled out) |
| 9 | `memoryReply !== undefined` skips extraction. Only when the turn is a yes/no answer to a pending prompt in THIS thread (`currentMemoryPrompt` matches pendingChange.threadId === thread, chat.ts:691-702, 934-956). A statement is not a yes/no. | chat.ts:1095 | NO | High (ruled out) |

Also: any error in the detached run is caught and logged as `chat_fact_extraction_failed` or `chat_fact_extraction_fenced` only (chat.ts:798-800). The extractor throws the text-free `StudentFactExtractionError` on a provider failure, which lands there, so a model or network failure is also invisible to the walk.

## What the db layer does (so no fix is needed there)
- Row id = hash(studentId, canonical key) (profile-facts.ts:50-54): one row per key.
- Existing `proposed` row: `$set` a new pendingChange (new candidateId, version, threadId, turnId), a new proposalToken, and value/quote/proposedAt/threadId/turnId (profile-facts.ts:134-145), then published by the CAS at ~profile-facts.ts:196-209. Pending and row both move to the new thread (S1).
- Existing `confirmed` row with a different value: only `pendingChange` is replaced; the active value and its provenance stay (S3).
- `decideProfileFact` with `requireCandidateThread` compares `candidate.threadId` to the request thread (profile-facts.ts:256), which is why the widget fix hides Confirm for foreign candidates.

## Recommendation (smallest fix; not implemented)
1. Do NOT change `proposeProfileFact` to rebind: it already does for pending rows (S1) and S2 is correct behaviour.
2. Make the silent exits diagnosable (the missing evidence for run 8d). In `proposeFactsDetached` (chat.ts:781-806) emit ONE text-free log event with a reason code at each silent exit: `chat_fact_proposal_skipped {reason: "thread" | "policy" | "revision"}` at chat.ts:784 and 788, and `{reason: "noop" | "revision" | "text_not_stored"}` when `proposeProfileFact` returns null or a row with no pendingChange. Codes only, no key, value or text.
3. Walk side (`qa/.delivery/requests/t057-walk.mjs` c6-clean and c6-propose): after the last Forget, wait until the panel shows no Canada/budget row and the decision POSTs have settled before sending the c6 prompt (closes #2), and capture the API stderr `chat_fact_*` and `fact_extraction_*` lines into the walk log so a missing proposal names its cause (closes the evidence gap for #1).
4. Optional product fix for #4: in the same-value branch (profile-facts.ts:134), when the confirmed row still carries a pendingChange, clear it with a CAS (`$unset pendingChange`) instead of returning. Needs an owner decision.
5. If, once logged, the cause is #1, the fix is on the extractor/skill side, not the db (the `fact_extraction_all_dropped` event already exists; surface its count in the walk log first, then decide).

## Tests the fix needs
- packages/db/tests/student-store.test.ts, next to line 262: (a) S1 proposed row restated from thread B gets `pendingChange.threadId === "B"` and a fresh candidateId and version; (b) S2 confirmed + same value from B returns the row with no pendingChange and writes nothing (documents the by-design no-op); (c) S4 stale `expectedRevision` returns null and leaves no row; (d) only if item 4 is taken: confirmed + stale pendingChange + same value clears the pendingChange.
- apps/api/tests/chat-profile.test.ts, next to the extractFacts cases at lines 65-126: two threads, same fake extractor output restated in thread 2: GET /profile shows the candidate with `pendingChange.threadId` = thread 2, the decision POST from thread 2 returns 2xx, from thread 1 returns 409 `memory_changed`.
- apps/api/tests/chat-profile.test.ts: a decision completing between turn start and extraction (gate the fake extractor on a deferred as at lines 637-658) yields NO proposal and the new skipped-event with `reason: "revision"` (item 2).
- Item 2 logging: assert the event carries no key, value or text fields.

## Not verified
- Which cause hit run 8d (no surviving API log). The worktree `.env` model is `gemini-3.5-flash-lite` per c6-confirm-diag.md item 5, the model behind two earlier silent drops. I made no model call.
- Whether the API process behind run 8d had been restarted after the `validFrom` fix (tsx has no watcher; c6-validfrom-fix.md says a restart is needed).
