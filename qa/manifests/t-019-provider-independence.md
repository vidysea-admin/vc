# Manifest: t-019-provider-independence

**Contract:** qa/contracts/counselling-engine.md (B6 primary; B1, B2, B5, B8, B11, B13, B14)
**Goal task:** T-019
**Status:** ready-for-check
**Fix cycle:** 0
**Design:** no new ACTIVE decision is written here. The provider set and the rules-provider input
contract are drafted below as a recommended D-entry for the Approver (see "Proposed D-entry").
**Diff range:** `ac4dc1e..5ed159b` on branch `wave/t-019-provider-independence` (branched from
`main` at `ac4dc1e`, "tasks: T-019 provider independence"), one commit: "feat(providers,engine):
t-019 litellm + deterministic rules provider, no-AI e2e".
**Scope:** `packages/providers/src/index.ts`, `packages/providers/tests/{index.test.ts (extended),
litellm.test.ts (new), rules.test.ts (new)}`, `packages/engine/tests/scribe-rules-e2e.test.ts`
(new), `.env.example`, this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md`
(left `open`), `packages/engine/src/scribe/{nodes,schemas}.ts` (T-018's parallel working files —
avoided entirely, including `packages/engine/tests/scribe-fixtures.ts` which those tests share),
`packages/engine/src/scribe/{graph,checkpointer}.ts`, `packages/db/**`, `packages/schemas/**`,
`packages/observability/**`, `apps/**`, `mcp/**`.
**Dual check:** no
**Executor:** claude-sonnet-subagent (maker build subagent)
**Offline:** every run below is offline (B8/B13). No `MONGODB_URL` connection anywhere. No live
Gemini or LiteLLM gateway call anywhere — the litellm-provider tests run against an in-process
stub HTTP server this test starts and stops on `127.0.0.1`; the rules-provider tests and the E2E
stub `globalThis.fetch` to throw if it is ever called, so the offline claim is proven, not assumed
(B14).

## What changed

### 1. `litellm` provider (`packages/providers/src/index.ts`)

`LiteLlmProvider`: an OpenAI-compatible chat-completions client. `generate()` POSTs
`{model, response_format: {type: "json_object"}, messages: [{role: "system", content:
skillPrompt}, {role: "user", content: JSON.stringify(input)}]}` to `${baseUrl}/chat/completions`,
with `Authorization: Bearer <key>` only when a key is configured. One attempt per call — no
internal retries (retries that could duplicate a write stay the caller's job;
`packages/engine/src/scribe/nodes.ts`'s existing `generateWithRetry` already re-asks on a
schema-invalid output, unmodified). A request-scoped `AbortController` + `timeoutMs` (default
`LITELLM_DEFAULT_TIMEOUT_MS` = 30s, overridable in tests) bounds every call.

Typed, key-free errors for every non-schema failure mode: `LiteLlmTimeoutError`,
`LiteLlmHttpError` (non-2xx, carries the status), `LiteLlmMalformedResponseError` (bad JSON body,
missing `choices[0].message.content`, or that content not itself valid JSON),
`LiteLlmNetworkError` (the request could not be sent at all, e.g. connection refused). A
schema-invalid but otherwise well-formed output is NOT wrapped — `request.outputSchema.parse()`
throws its native `ZodError`, same as `MockProvider`, so it is recognised and retried by the
engine's existing `isSchemaError` check. The API key is a private class field (`#apiKey`, same
pattern as the existing `GeminiProvider`): never enumerable via `JSON.stringify`, `String()` or
`util.inspect`, and never interpolated into any error message (B11).

Config: `VC_LLM_PROVIDER=litellm` needs `VC_LLM_MODEL` (a gateway class name from
`D:/ai_os/litellm-config.yaml`, e.g. `balanced`, or any OpenAI-compatible model id) and
`VC_LLM_BASE_URL`; `VC_LLM_API_KEY` is optional (some local gateways need none).

### 2. `rules` provider (`packages/providers/src/index.ts`) — deterministic, no model

`RulesProvider` dispatches on `skillName`; an unrecognised skill throws a typed
`RulesProviderUnsupportedSkillError`. No network call anywhere (proven by test, not asserted).

**Input contract (documented in the source doc comment above the class, since there is no model to
interpret a free-form prompt):**
- **fact-extraction:** `input.turns` is the engine's normal `ScribeTurn[]`. Any turn whose
  `translatedText` (falling back to `text` when `translatedText` has no such line) contains one or
  more `key: value` lines is read as a structured annotation / form field rendered into the
  transcript — e.g. a counsellor's structured intake form surfaced as a turn reading
  `"targetCountry: Canada\nbudget_inr_per_year: 2000000"`. Each matched line becomes one candidate
  fact, cited to that exact turn and the exact matched line (a verbatim substring of the turn
  text, so the engine's existing citation guard — B2, `verifyCandidateFact` in `nodes.ts`,
  unmodified — accepts it with no fuzzy matching). A numeric-looking value is coerced to a number;
  anything else stays a trimmed string. `confidence` is always 1. A turn with no such line
  contributes no facts — this provider never invents one.
- **session-summary:** `input.facts` is the session's already-extracted `Fact[]`. The summary is a
  fixed template: `"Facts recorded this session: <key> = <value> (turn <turnId>); ...."` — a record
  of what was captured, never an instruction to the counsellor (B1; proven against the real
  `isScriptLike` guard in the E2E, not just asserted not to contain recital verbs in the unit
  test). Zero facts still produces a valid, non-empty summary string
  (`"No facts were recorded this session."`).

### 3. `.env.example`

Comment updated to list all four provider kinds; new key NAMES only, no values:
`VC_LLM_BASE_URL`, `VC_LLM_API_KEY` (B11).

### 4. Existing providers unchanged

`mock` and `gemini` are untouched — the same classes, same config shape, same tests (all still
pass). `VC_LLM_PROVIDER` still has no default; an unset or unrecognised value still throws
(message now lists all four valid values).

## TDD: RED before implementation, then green

**RED** (new test files written first, importing exports that did not exist yet):
```
cd packages/providers && pnpm test
  SyntaxError: The requested module '../src/index.js' does not provide an export named 'LiteLlmProvider'
  SyntaxError: The requested module '../src/index.js' does not provide an export named 'LiteLlmHttpError'
  SyntaxError: The requested module '../src/index.js' does not provide an export named 'RulesProvider'
  tests 3  pass 0  fail 3  (every test file failed to even load)
```

**Falsification per capability** (each check below is a real assertion the test would catch, not
a construction-only check — B14):
| Capability | How falsified |
|---|---|
| litellm: a real request goes out and is parsed | stub server asserts method, path, `Authorization` header (present/absent), model name and both message roles in the actual received body — not just that `generate()` resolved |
| litellm: non-2xx | stub returns 500 → typed `LiteLlmHttpError` naming the status; message checked to NOT contain the configured key |
| litellm: malformed body / missing content / non-JSON content | three separate stub responses, each → typed `LiteLlmMalformedResponseError` |
| litellm: schema-invalid content | stub returns valid JSON that fails `OutSchema` → the underlying `ZodError` surfaces (not swallowed), matching `isSchemaError` in the engine's retry path |
| litellm: timeout | stub server never responds (`"hang"`); a 100ms `timeoutMs` → typed `LiteLlmTimeoutError` within the test's own timeout budget |
| litellm: connection refused | `baseUrl` points at a port nothing listens on → typed `LiteLlmNetworkError` |
| litellm: B11 | key never appears in `JSON.stringify`/`String()` of the instance, and never in any of the above error messages |
| rules: fact-extraction cites the right turn+quote | asserted quote equals the exact line, real substring; multiple lines in one turn each become a separate fact; a turn with no annotation produces zero facts; falls back from `translatedText` to `text` |
| rules: session-summary is template, not model | asserted output string content directly (not just non-empty); B1 checked with a recital-cue regex in the unit test AND against the real `isScriptLike` guard in the E2E |
| rules: no network | `globalThis.fetch` stubbed to throw if called — zero calls asserted after a full fact-extraction run |
| E2E: P1 completes with zero AI | full `startScribe` → `awaiting_approval` → `resumeScribe(approve)` → `written` → read-back facts from the fake `facts` collection, over the REAL `compileScribeGraph` and the REAL `MongoDBSaver` checkpointer class (`createScribeCheckpointer`), with `fetch` stubbed to throw on any call |

## Verification (exact commands, run in the worktree, final state)

```
pnpm -r typecheck                      -> exit 0 (all 9 workspace projects: observability, providers,
                                           schemas, db, apps/api, engine, mcp/university-kb,
                                           mcp/student-profile, apps/web)
pnpm -r test                           -> exit 0
  packages/providers     tests 31  pass 31  fail 0   (was 8; +23 new: 11 litellm, 10 rules, 2 config/factory)
  packages/engine        tests 150 pass 150 fail 0   (was 149; +1 new: the rules-provider E2E)
  packages/db            tests 185 pass 185 fail 0   (unchanged)
  packages/schemas       tests 50  pass 50  fail 0   (unchanged)
  packages/observability tests 57  pass 57  fail 0   (unchanged)
  apps/api               tests 8   pass 8   fail 0   (unchanged)
  apps/web               tests 17  pass 17  fail 0   (unchanged)
  mcp/university-kb      tests 9   pass 9   fail 0   (unchanged)
  mcp/student-profile    tests 12  pass 12  fail 0   (unchanged)
  total 519 / 519 (was 495; +24 new tests, 0 regressions)
python contracts/verify_contracts.py   -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

## Claims → evidence

| Claim | Evidence (test, file) |
|---|---|
| a second real provider exists and makes a real HTTP request, parsed by the caller's schema | "a real request goes out and a well-formed response is parsed by the caller's schema" (litellm.test.ts) — asserts the STUB's received request AND the parsed output |
| the litellm provider's failure modes give typed, key-free errors | the 5 non-2xx/malformed/timeout/network tests + the 2 B11 secret-leak tests (litellm.test.ts) |
| a schema-invalid litellm output is still retryable by the engine's existing retry path | "well-formed JSON that fails the caller's outputSchema throws the underlying schema error" (litellm.test.ts) — asserts a native `ZodError`-shaped rejection, not a wrapped one |
| the rules provider extracts cited facts from structured turn annotations, with no model | 4 fact-extraction tests (rules.test.ts) |
| the rules provider's summary is a template, never a script for the counsellor (B1) | 3 session-summary tests (rules.test.ts) + the E2E's summary assertion, which runs through the REAL `summarizeSession`/`isScriptLike` guard path unmodified |
| the rules provider makes zero network calls | "no global fetch call is ever made by the rules provider" (rules.test.ts) + the E2E's fetch stub |
| P1 (scribe → facts → profile diff → approve) completes end to end with `VC_LLM_PROVIDER=rules` and zero AI/network | `scribe-rules-e2e.test.ts` — real graph, real `MongoDBSaver`, `awaiting_approval` → `approve` → `written`, facts read back with correct values, `fetchCalls === 0` asserted |
| `mock` and `gemini` still work unmodified; `VC_LLM_PROVIDER` still has no default | all pre-existing `index.test.ts` tests still pass unchanged; the new "must be mock, gemini, litellm or rules" message assertion |
| B11: no new key VALUE anywhere in the tree | `.env.example` lists `VC_LLM_BASE_URL`/`VC_LLM_API_KEY` as names only; test fixtures use obviously-fake strings (`"super-secret-key"`, `"test-key-value"`), never a real credential |

## Residuals (not fixed here)

1. **The `key: value` annotation format is the only structured input the rules provider reads.**
   A JSON-form-payload alternative ("a structured form payload" per the T-019 brief) was
   considered but not built: the engine's `extractFacts` (`nodes.ts`, unmodified) always calls the
   provider with `{turns}`, so any form payload would have to travel inside a turn's text the same
   way — the `key: value` line format already covers that shape, and a second parallel format
   would be redundant surface without a concrete producer for it yet. If P2/P3 needs raw JSON
   turns, this is a small additive parser change to `rulesExtractFacts`.
2. **No configurable `sensitivity`/`confidence` per annotation.** Every rules-extracted fact is
   `sensitivity: "low"`, `confidence: 1`. A counsellor-marked-sensitive form field (budget,
   health) would need a small syntax extension (e.g. a `key!high: value` marker) — not built,
   since no current skill's structured intake form was specified to need it.
3. **`LiteLlmProvider` was never run against a real LiteLLM gateway or `D:/ai_os/litellm-config.yaml`'s
   actual endpoints** — B13/B8 forbid that in an automated test. The stub proves the OpenAI-compatible
   request/response contract; a live smoke run against the gateway is a separate, human-approved
   step (same posture as `qa/gates/real-transcripts-gemini.md` for Gemini).
4. **No retry/backoff or circuit breaker for the litellm provider's network/HTTP failures.** By
   design (no retries that could duplicate a write) — a network or HTTP failure propagates to the
   graph's own checkpoint-retry path, same as an unwired Gemini call does today.

## Proposed D-entry (NOT written; for the Approver)

```
## D-0XX | 2026-09-25 | type: decision | status: ACTIVE
**What:** The engine's provider set is `mock | gemini | litellm | rules` (packages/providers).
`litellm` is an OpenAI-compatible chat-completions client against a configurable gateway
(VC_LLM_BASE_URL, VC_LLM_MODEL — a D:/ai_os/litellm-config.yaml class name or any compatible model
id, optional VC_LLM_API_KEY), JSON-mode, one attempt per call (retries stay the engine's job).
`rules` is a deterministic, no-model provider: fact-extraction reads "key: value" lines embedded
in a transcript turn's translatedText/text as structured form annotations, citing each fact to its
exact turn and line; session-summary is a fixed template over the session's Fact[]. Together they
let P1 (scribe -> facts -> profile diff -> approve) complete with zero AI calls.
**Why:** the lead's 2026-09-25 counselor-portal review, relayed by Umesh and approved: "agar kal ko
Gemini hat jaye to mera pura VTC band ho jayega, aisa na ho ... AI dependence ek cheez hai, Gemini
dependence ek cheez hai" — the counsellor's core flow must not depend on one AI vendor, or on any
AI vendor at all.
**Links:** T-019, qa/feedback-inbox.md 2026-09-25T23:30 (lead's review), contract B6
```

## Open questions for the checker

- Is the `key: value` annotation format (rather than a JSON payload) an acceptable input contract
  for the rules provider's fact-extraction, given `nodes.ts extractFacts` always calls the
  provider with `{turns}` and no other structured channel currently exists?
- Should `LITELLM_DEFAULT_TIMEOUT_MS` (30s) be configurable via env (e.g. `VC_LLM_TIMEOUT_MS`)
  rather than only via the constructor option tests use? Not requested by the brief; left as a
  residual rather than guessed at.
