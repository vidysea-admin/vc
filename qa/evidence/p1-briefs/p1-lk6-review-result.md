# p1-lk6 senior review result (diff ae48596..c54f7a2), saved by the maker (reviewer is read-only)

VERDICT: Warning (no Block-level defect; the chat-reply latency should be decided before go-live).

Tests the reviewer ran in the lk6 worktree, all green:
- engine `tests/student-fact-extractor.test.ts`: 13 pass.
- db `tests/student-store.test.ts`: 19 pass.
- api `tests/chat-profile.test.ts` and `tests/voice.test.ts`: 84 pass.

## Findings (>80% confidence)
- **[medium] Chat reply waits on extraction.** apps/api/src/chat.ts:704-717. The extraction is awaited before `respond(200, ...)` (~730).
  - The default extractor is new (apps/api/src/index.ts:333-334), so every stored-text chat turn now waits for a second LLM call, plus a schema retry (nodes.ts:1060), plus DB writes.
  - No signal is passed, and the provider deadline is 45 s (packages/providers/src/index.ts:35).
  - Fix: take it off the reply path (`void` it with its own catch) or race it against a short timeout; the lease is already completed at line 704.
  - Voice (voice.ts:708-722) is less affected, because the Live model answers independently.
- **[low] Nothing ties the value to the quote.** nodes.ts:1311-1327. The only check is `text.includes(quote)`, with no minimum length, so a one-character quote passes. The `needsReview` flag from `assessFactForReview` is discarded.
  - Mitigation today: facts are only "proposed", and the student confirms them.
  - Harden with a minimum quote length (about 3 characters or 2 words).
- **[low] The value guard is a script check, not an English check.** nodes.ts:1255. Latin-script non-English values pass ("Deutschland", "bees lakh", fullwidth Latin). This is documented in the code; it must not be read as proof of English.

## Brief answers
1. **Quote, value and crisis guards hold.**
   - The quote guard does a raw substring match against the original text, so translated, fabricated, NFC/NFD-drifted, whitespace-drifted and case-drifted quotes are all dropped.
   - The value guard drops Devanagari, CJK, Cyrillic, homoglyphs, non-ASCII digits and fullwidth digits.
   - The key regex is `^[A-Za-z][A-Za-z0-9_]{0,63}$`.
   - crisisGuard runs first on the original text (~1264), and a crisis or concern turn makes no call.
   - Errors carry the class name only.
2. **profile-facts.ts is safe.**
   - The new fields are additive and optional, and the quote is redacted with `redactPii`.
   - A stale quote is unset on re-propose and on correct; a confirmed row keeps its own quote.
   - The quote never reaches clients or the model (chat.ts:195, 505-513).
3. **Chat and voice wiring is correct.**
   - The extraction runs only on the stores-text branch (chat `leaseToken`; voice `persistText`, voice.ts:716).
   - The anonymous API has no extractor.
   - Logs carry the event name or `err.name` only.
   - An injected extractor wins on both transports.
   - The open item is the latency finding above.
4. **The audit proposal is read-only in code.**
   - It only does `find` with a projection, uses secondaryPreferred, needs `VC_AUDIT_MONGODB_URL`, and prints counts and opaque ids.
   - A human-approved read-only credential is still required.

## Open questions
- The extractor is wired without a `preflight` (consent hook), which is consistent with the existing apps/api paths. The raw student text goes to the provider, as the main graph already does. Does D-093 require per-call preflight?
- A Devanagari character anywhere in the turn labels `sourceLang` as "hi". This is cosmetic.

## Test gaps
- No test that a never-resolving extractor leaves the chat reply unblocked.
- No test for a one-character quote.
