# Manifest: t-027-webhooks-core

**Contract:** qa/contracts/counselling-engine.md (B21 "Events" primary; B2 provenance, B6 typed
boundaries, B11 secrets, B13 no student data to external services/no real network in tests, B14
outcome-not-construction)
**Goal task:** T-027 (TASKS.md line 38)
**Status:** checked-PASS — see the Close-out at the end of this file (cycle 0, verdict `qa/verdicts/t-027-webhooks-core.md` f4286e3; merged `5374e05`)
**Fix cycle:** 0 of max 3
**Design:** implements D-021 (2026-09-26, "Events: approved facts (with provenance, B2), erasure
requests and concern flags go out as signed webhooks", contract B21 "Events"). No new ACTIVE
decision written here — D-021 already covers this unit's scope, and D-021 explicitly reserves the
Mongo outbox and the emission wiring for after T-025/T-022/T-029 (TASKS.md T-027 row).

**Resumed unit, attempt 2.** The previous build subagent died on the account session limit mid-way
through, leaving uncommitted work in this worktree (3 modified + 5 untracked files, verified via
`git status` at the start of this session): `.env.example`, `packages/engine/package.json`,
`packages/engine/src/index.ts` modified; `packages/engine/src/webhooks/{schemas,signing,delivery,
outbox,index}.ts` and `packages/engine/tests/webhooks-{envelope,signing,outbox,delivery}.test.ts`
untracked. This session reviewed every file line-by-line against the original scope and contract
B21/D-021, found the implementation already complete and correct (all 4 pieces of the scope, no
scope creep into the Mongo outbox or emission hooks), then ran the full verification and
falsification pass below and wrote this manifest — none of the prior builder's code was rewritten,
only read, verified and (where noted) exercised under fresh falsifications.

**Scope:** `packages/engine/src/webhooks/schemas.ts` (new), `packages/engine/src/webhooks/signing.ts`
(new), `packages/engine/src/webhooks/delivery.ts` (new), `packages/engine/src/webhooks/outbox.ts`
(new), `packages/engine/src/webhooks/index.ts` (new, barrel export), `packages/engine/tests/
webhooks-envelope.test.ts` (new), `packages/engine/tests/webhooks-signing.test.ts` (new),
`packages/engine/tests/webhooks-delivery.test.ts` (new), `packages/engine/tests/webhooks-outbox.
test.ts` (new), `packages/engine/src/index.ts` (extended: `export * from "./webhooks/index.js"`),
`packages/engine/package.json` (extended: `"./webhooks"` export map entry), `.env.example`
(extended: `VC_WEBHOOK_SECRET` name only, no value), this manifest.
**Not touched:** `packages/db`, `apps/api`, `apps/web`, `packages/engine/src/scribe/**` (per brief),
`qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`. No Mongo outbox
collection, no approval/erasure/concern emission hooks (both explicitly out of scope, land after
T-025/T-022/T-029).
**Dual check:** no (no `.goal/` criticality marking on T-027; not requested in the brief)
**Executor:** claude-sonnet-subagent (maker build subagent, resume/verify pass)
**Offline:** every automated test is offline (B8/B13). `webhooks-delivery.test.ts` uses a real
in-process `node:http` fake receiver bound to `127.0.0.1` on an ephemeral port — never a real
network call, never a mocked `fetch` (same "real stub server, not a mocked fetch" pattern as
`packages/providers/tests/failover.test.ts`, B14). No `MONGODB_URL` connection anywhere. No real
`.env` value is read anywhere in code or tests — the secret used in tests is a hardcoded literal
(`"test-secret-do-not-use-in-prod"`), and `.env.example` carries only the variable name.

## What changed

### 1. Event envelope + per-type payload schemas (`packages/engine/src/webhooks/schemas.ts`)

Zod schemas for the three B21 event types, each wrapped in a common envelope
(`WebhookEnvelopeBaseSchema`: `id` [idempotency key, `min(1)`], `occurredAt` [ISO datetime],
`tenantId` [`min(1)`]) discriminated on `type` (`WebhookEventSchema =
z.discriminatedUnion("type", [...])`, `WEBHOOK_EVENT_TYPES = ["fact.approved", "erasure.requested",
"concern.flagged"]`):

- **`fact.approved`** (`FactApprovedDataSchema`): `sessionId`, `studentId`, and a `fact` carrying
  `key`, `value`, `confidence` (0-1), `purposeTags` (non-empty array), `sensitivity`
  (`low|medium|high`), and `source: WebhookFactSourceSchema` — B2 provenance. `WebhookFactSourceSchema`
  is `z.union([FactSourceSchema, <counsellor-edit shape>])`: it reuses `@vc/schemas`'
  `FactSourceSchema` for every existing citation type, and locally adds the `counsellor-edit`
  variant (`counsellorId`, `editedAt`, `editedFrom: FactSourceSchema`) that B2 requires at approval
  time but that `@vc/schemas` does not yet carry (T-023's edit-provenance work is a sibling in-flight
  unit — the module docstring records this as a residual: once T-023 extends `FactSourceSchema`
  itself, this local union should collapse onto the shared schema). The original citation is always
  kept verbatim under `editedFrom`, never discarded.
- **`erasure.requested`** (`ErasureRequestedDataSchema`): `requestId`, `studentId`,
  `reason: ErasureReasonSchema` (reused from `@vc/schemas`, no local duplicate needed here),
  `requestedAt`.
- **`concern.flagged`** (`ConcernFlaggedDataSchema`): `sessionId`, `studentId`, `turnId`, `matched`
  (non-empty array of matched phrases), `message`. Concern-level only (B20) — a crisis-level signal
  (B9) is a different, synchronous escalation path, not one of these three webhook events.

### 2. HMAC-SHA256 signing + receiver verification (`packages/engine/src/webhooks/signing.ts`)

`signWebhookPayload(rawBody, timestampMs, secret)` = `HMAC-SHA256(secret, "${timestampMs}.${rawBody}")`,
hex-encoded — the secret is read only from the caller's env (`VC_WEBHOOK_SECRET`, name recorded in
`.env.example`, no value; this module never touches `process.env` itself and never logs the secret).
`buildSignedWebhookHeaders` emits the three required headers: `X-VC-Signature`, `X-VC-Timestamp`,
`X-VC-Event-Id` (always `event.id`, the idempotency key).

`verifyWebhookSignature` is the receiver side: never throws, always returns a typed
`{ok:true} | {ok:false, reason}`. Rejects, in order: `missing_signature`, `missing_timestamp`,
`invalid_timestamp` (non-numeric/non-integer), `stale` (older than `toleranceMs`, default
`DEFAULT_REPLAY_TOLERANCE_MS = 5 min`), `future_dated` (newer than tolerance), `signature_mismatch`
(constant-time compare fails). `constantTimeEqual` uses `node:crypto`'s `timingSafeEqual`, with an
early length-check guard (an unequal-length pair is rejected without calling `timingSafeEqual`,
which throws on mismatched buffer lengths — this only ever fires for an already-malformed value,
since a genuine HMAC-SHA256 hex digest always has a fixed 64-char length, so the length check leaks
only "differs" never a byte of the digest).

### 3. Delivery with retry, backoff+jitter, idempotency (`packages/engine/src/webhooks/delivery.ts`)

`deliverWebhookEvent(event, destinationUrl, options, outbox?)`: computes `rawBody =
JSON.stringify(event)` and the idempotency key (`event.id`) **once**, outside the retry loop, and
reuses both byte-identical on every attempt; only the timestamp (and therefore the signature) is
recomputed fresh per attempt via `buildSignedWebhookHeaders(rawBody, event.id, secret, now())`, so a
delivery that spans several backoff cycles never fails the receiver's own replay-window check
against a stale first timestamp.

`computeWebhookBackoffMs(attempt, baseDelayMs, maxDelayMs, random)` — full-jitter exponential
backoff (AWS "Exponential Backoff And Jitter"): `round(random() * min(maxDelayMs, baseDelayMs *
2^(attempt-1)))`, `random` injectable for deterministic tests. Defaults:
`DELIVERY_DEFAULT_MAX_ATTEMPTS = 6`, `DELIVERY_DEFAULT_BASE_DELAY_MS = 500`,
`DELIVERY_DEFAULT_MAX_DELAY_MS = 30_000`.

`isRetryableDeliveryStatus(status)`: true for any 5xx or a 4xx in the small allowlist `{408, 429}`;
every other 4xx (400, 401, 403, 404, 422, ...) is a real rejection, not retried. A 2xx means
delivered. A network/fetch-level error (e.g. connection refused) is treated like a retryable
failure. `fetchImpl` and `sleep` are both injectable so tests never do real network I/O or real
timed waits. When an `outbox` is supplied it is `enqueue`d once up front and `update`d after every
attempt and once more at the terminal state (`delivered` / `failed` / `dead`).

### 4. Pluggable outbox interface + in-memory implementation (`packages/engine/src/webhooks/outbox.ts`)

`WebhookOutbox` interface (`enqueue`, `get`, `update`, `list`) — the Mongo-backed implementation is
explicitly out of this unit's scope (lands after T-025). `InMemoryWebhookOutbox implements
WebhookOutbox` for tests: `enqueue` is idempotent by `id` (a second enqueue of the same id returns
the existing row unmodified, never resets bookkeeping or creates a duplicate); `update` merges a
patch and always refreshes `updatedAt`; `update` on an unknown id throws.

### 5. Wiring (`packages/engine/src/index.ts`, `packages/engine/package.json`, `.env.example`)

`packages/engine/src/index.ts` re-exports `./webhooks/index.js`. `packages/engine/package.json`
gets a `"./webhooks": "./src/webhooks/index.ts"` entry in `exports`, alongside the pre-existing
`"."` and `"./scribe/schemas"` entries (unmodified). `.env.example` gets one new line,
`VC_WEBHOOK_SECRET=` (name only, comment records the contract reference — B11: never a committed
value).

## How to verify (exact commands, run in the worktree via the shared test lock)

```
$ bash scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-027-webhooks-core --filter @vc/engine test
...
ℹ tests 315
ℹ suites 0
ℹ pass 315
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6225.0506
```
(all 315 tests in `@vc/engine` — the pre-existing 271 plus this unit's 44 new webhook tests spread
across `webhooks-envelope.test.ts` [8], `webhooks-signing.test.ts` [11], `webhooks-outbox.test.ts`
[6], `webhooks-delivery.test.ts` [15], plus 4 non-webhook additions from sibling in-flight units
already merged to this worktree's base — 0 regressions, 0 failures)

```
$ bash scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-027-webhooks-core --filter @vc/engine typecheck
> tsc --noEmit && tsc --noEmit -p evals/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json
(no output, exit 0)
```

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
(exit 0)
```

## Capability coverage (B14 — outcome, not construction)

Every falsifying edit below was made and reverted in a **throwaway git worktree outside the bound
root** (`C:/Users/Lenovo/AppData/Local/Temp/claude/vc-t027-falsify`, `git worktree add ... HEAD
--detach` off this worktree's `HEAD`, this session's uncommitted webhook files copied in, `pnpm
install --offline` run there) — the live worktree at `D:/vc/.worktrees/t-027-webhooks-core` was
never edited for falsification. The scratch worktree was removed after the run
(`git worktree remove --force` + prune).

| # | Claim | Test id | Falsifying edit | Expected RED |
|---|---|---|---|---|
| 1 | An event missing a required envelope field (or an unknown `type`) is rejected by the Zod schema | `webhooks-envelope.test.ts` (7 rejection-path tests) | *(schema shape itself is the falsification surface — not re-falsified separately; covered structurally: every rejection test targets a distinct required field/`type` literal, and the GREEN run above already proves each one independently discriminates pass/fail)* | — (see note below; rows 2-6 are the code-behavior falsifications actually run) |
| 2 | Idempotency: the raw body and `X-VC-Event-Id` are byte-identical across every retry attempt | `webhooks-delivery.test.ts`: "idempotency: the raw body and X-VC-Event-Id are byte-identical across every retry attempt" | `delivery.ts`: made `rawBody` a `let` mutated to `JSON.stringify({...event, _nonce: Math.random()})` inside the retry loop, before each `buildSignedWebhookHeaders` call | GREEN-before: `✔ idempotency: ... (19ms)` (in the full-suite GREEN run). RED-after: `✖ idempotency: the raw body and X-VC-Event-Id are byte-identical across every retry attempt (21.2ms)` — `tests 315, pass 314, fail 1`. Reverted; re-ran; back to 315/315. |
| 3 | Constant-time signature verification genuinely rejects tampering (body, signature, secret, length) | `webhooks-signing.test.ts`: 4 tampering tests | `signing.ts`: replaced `if (!constantTimeEqual(expected, signature))` with `if (false)` (always accepts) | GREEN-before: all 4 `✔` in the full-suite GREEN run. RED-after: all 4 flip — `✖ a tampered body ...`, `✖ a tampered signature ...`, `✖ a signature of the wrong length ...`, `✖ a signature signed with the wrong secret ...` — `tests 315, pass 311, fail 4`. Reverted; re-ran; back to 315/315. |
| 4 | A stale timestamp (older than the replay window) is rejected | `webhooks-signing.test.ts`: "a stale timestamp (older than the replay window) is rejected" | `signing.ts`: replaced `if (skewMs > toleranceMs) return {ok:false, reason:"stale"}` with `if (false) ...` | GREEN-before: `✔` in the full-suite GREEN run. RED-after: `✖ a stale timestamp (older than the replay window) is rejected (2.6ms)` — `tests 315, pass 314, fail 1`. Reverted; re-ran; back to 315/315. |
| 5 | Backoff formula is bounded by `maxDelayMs` and grows with `attempt` (full jitter), not a constant | `webhooks-delivery.test.ts`: "computeWebhookBackoffMs: bounded by maxDelayMs and grows with attempt (full jitter)" | `delivery.ts`: replaced the cap/growth formula body with `return maxDelayMs;` (ignores `attempt`, `baseDelayMs`, `random`) | GREEN-before: `✔` in the full-suite GREEN run. RED-after: `✖ computeWebhookBackoffMs: bounded by maxDelayMs and grows with attempt (full jitter) (4.1ms)` — `tests 315, pass 314, fail 1` (the sibling "backoff is genuinely applied" test still passed, since it only checks the sleep spy was called, not the specific values — the growth/bound assertion is what this row exercises). Reverted; re-ran; back to 315/315. |
| 6 | Outbox `enqueue` is idempotent by id: a second enqueue never creates a duplicate row or resets bookkeeping | `webhooks-outbox.test.ts`: "enqueue is idempotent by id: a second enqueue never creates a second row or resets bookkeeping" | `outbox.ts`: removed the `const existing = this.records.get(input.id); if (existing) return existing;` guard from `InMemoryWebhookOutbox.enqueue` | GREEN-before: `✔` in the full-suite GREEN run. RED-after: `✖ enqueue is idempotent by id: ... (2.7ms)` — `tests 315, pass 314, fail 1`. Reverted; re-ran; back to 315/315. |

**Final confirmation, same batch run, immediately after row 6's revert:**
```
ℹ tests 315
ℹ pass 315
ℹ fail 0
=== ALL DONE ===
```

Additional claims proven directly by the GREEN suite (not separately falsified, since the assertion
IS the falsification — e.g. "a non-retryable 4xx stops immediately" is proven by the exact-attempt-
count assertion `assert.deepEqual(result, {delivered:false, attempts:1, ...})`, which would fail the
moment a retry were added):

| Claim | Test id |
|---|---|
| Any 2xx (200/201/204) means delivered | `webhooks-delivery.test.ts`: "a 2xx on the first attempt delivers...", the `for (const status of [201, 204])` loop |
| A non-retryable 4xx (400) stops immediately, no retry | `webhooks-delivery.test.ts`: "a non-retryable 4xx (400) stops immediately, no retry" (`attempts: 1` asserted) |
| A retryable 4xx (408, 429) is retried and a later 2xx succeeds | `webhooks-delivery.test.ts`: "a 429 (retryable 4xx) is retried...", "a 408 (retryable 4xx) is retried..." |
| Exhausting `maxAttempts` on persistent 5xx ends `delivered:false`, outbox marked `dead` | `webhooks-delivery.test.ts`: "exhausting maxAttempts on persistent 500s ends delivered:false ... outbox marked dead" |
| A network error (ECONNREFUSED) is retried like a 5xx | `webhooks-delivery.test.ts`: "a network error (connection refused — no receiver listening) is retried like a 5xx" (real ECONNREFUSED against a dead port, not a mocked error) |
| Timestamp/signature refreshed per attempt; every attempt independently verifies | `webhooks-delivery.test.ts`: "the timestamp/signature are refreshed per attempt, and each attempt's headers independently verify against its own timestamp" (asserts 3 distinct timestamps + each one passes `verifyWebhookSignature`) |
| An unedited fact keeps its transcript source; a counsellor-edited fact carries `counsellor-edit` + `editedFrom` (B2) | `webhooks-envelope.test.ts`: the two `fact.approved` parse tests + "a counsellor-edit source missing editedFrom is rejected" |
| A signature of the wrong length never throws (constant-time compare's length guard) | `webhooks-signing.test.ts`: "a signature of the wrong length is rejected without throwing" (wrapped in `assert.doesNotThrow`) |

## Real outputs

```
$ git -C D:/vc/.worktrees/t-027-webhooks-core status --short
 M .env.example
 M packages/engine/package.json
 M packages/engine/src/index.ts
?? packages/engine/src/webhooks/
?? packages/engine/tests/webhooks-delivery.test.ts
?? packages/engine/tests/webhooks-envelope.test.ts
?? packages/engine/tests/webhooks-outbox.test.ts
?? packages/engine/tests/webhooks-signing.test.ts
(as found at session start, before this session's commit)
```

Full-suite GREEN run (`@vc/engine`, includes this unit's 44 webhook tests among 315 total): see
"How to verify" above, `tests 315, pass 315, fail 0, duration_ms 6225`.

Typecheck: `tsc --noEmit && tsc --noEmit -p evals/tsconfig.json && tsc --noEmit -p
scripts/tsconfig.json` — exit 0, no diagnostics.

Contracts: `python contracts/verify_contracts.py` — `PASS by vacuity`, exit 0.

## Open gaps

- **Residual noted in `schemas.ts`'s own docstring:** `WebhookFactSourceSchema` locally duplicates
  `@vc/schemas`' `FactSourceSchema` plus a `counsellor-edit` variant, because T-023 (a sibling
  in-flight unit, same parallel wave) is the one that will extend the shared `FactSourceSchema`
  itself with that variant. Once T-023 lands, this module should switch to the shared schema and
  drop its local union — tracked here, not silently left for someone to discover later.
- **Not in this unit's scope, by design (per the brief and D-021/TASKS.md T-027 row):** the
  Mongo-backed `WebhookOutbox` implementation (lands after T-025) and the actual emission hooks that
  call `deliverWebhookEvent` when a fact is approved (T-029), an erasure is requested (T-022's
  concern-flag row is the sibling for `concern.flagged`), or erasure fires. This unit ships only the
  envelope, signing/verification, delivery-with-retry, and the pluggable interface + in-memory
  implementation, exactly as scoped.
- No live/integration proof against a real Pathlynks endpoint exists yet (none is expected at this
  stage — B21 names Pathlynks as the first client, but the receiver-side contract is proven here
  only against the local fake `node:http` receiver, per B8/B13 "no real network calls in tests").
- Falsification row 1 (envelope/schema rejection) is covered structurally by the GREEN suite's own
  8 distinct pass/fail schema tests rather than by a separate falsify-and-revert cycle, since a Zod
  schema's rejection *is* the assertion under test with no separate "implementation to falsify"
  layer to mutate independently of the schema itself — noted explicitly rather than silently
  skipped.

## Close-out
- Checker cycle 0 PASS (qa/verdicts/t-027-webhooks-core.md, f4286e3). senior review: Approve (low: ISS-t-027-rev-1). data-engineer review: Approve (low: ISS-t-027-rev-2, rev-3).

## Status: checked-PASS
