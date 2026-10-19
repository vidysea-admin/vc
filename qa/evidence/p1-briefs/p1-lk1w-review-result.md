# p1-lk1w senior review result (diff 5310e8f..e13f850), saved by the maker (reviewer is read-only)

VERDICT: Approve (no finding above low).

Tests the reviewer ran in the lk1w worktree:
- api `chat-profile.test.ts` and `anonymous-route.test.ts`: 32 pass, 0 fail.
- engine `concern-classifier.test.ts`: 23 pass, 0 fail.

## What holds
- **Provider selection, index.ts:257-273.**
  - With `VC_TEXT_CHAIN` unset, the student provider is the same object as `httpBase.provider`, so nothing changes.
  - Only the anonymous handler (:294) and the chat handler (:411) take the chain. The scribe (:380) and the classifier (:273) keep the current provider.
  - A bad chain throws before connect. Errors name keys only and never echo a key value.
- **concern-classifier.ts:184.** The ollama-base throw is safe: it runs at config build time and its message carries no secret.
- **Test helpers.**
  - `mustRefuseWith`, `stubOllamaFetch` and `CHAIN_ENV` mask no failure.
  - Every stub is restored in a `finally`, and servers are stopped.
- **.env.example** contains no secret.

## Low findings
- chat-profile.test.ts, last test: the title claims "never carries a key", but the test sets no key. Fix: assert with a synthetic key set, or drop that clause from the title.
- `mustRefuseWith`: if `api.stop()` throws, it masks the fail message. Cosmetic.
- `stubOllamaFetch` is process-global and safe only while the tests in a file run sequentially.

## Open question (matters for go-live)
- index.ts:270 calls `createProvider(textChain)` with no `CreateProviderDeps`, so the chain runs without `beforeRequest` (the per-hop budget charge), `onUsage` or `onExhausted`.
- So student chat on the chain has no spend cap or usage metering.
- Confirm that a later unit owns this before `VC_TEXT_CHAIN` is set in any deployed env; otherwise it becomes medium.

## Test gaps
- No test that an exhausted chain or an HTTP 500 on a student turn gives the apology with `retryable: true`.
- No test that, with the chain set and no injected classifier, the classifier is built from `loadProviderConfig`.
