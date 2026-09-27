# Manifest: t-026-kb-client

**Contract:** qa/contracts/counselling-engine.md (B21 "Knowledge" clause, primary; B2, B8, B11, B14)
**Goal task:** T-026 (TASKS.md line 37)
**Status:** checked-PASS — see the Close-out at the end of this file (cycle 0, verdict `qa/verdicts/t-026-kb-client.md` 7ca29ed; merged `2c4241d`)
**Fix cycle:** 0 of max 3
**Design:** implements B21's Knowledge clause ("university and seminar knowledge comes from the
KnowledgeBase over its API (`POST /ask`, Bearer key from `.env`, B11). Its citations are carried
through (B2). A KB outage degrades to 'knowledge unavailable'; it never produces an uncited
answer.") and the gate answer in `qa/gates/counsellor-auth.md` ("knowledge yahan se aayegi").
**Merge:** started from `main` at `b207b16` (worktree branched at that commit; `git -C <worktree>
log -1` still shows `b207b16` after this unit — nothing else landed on `main` since the worktree
was created).
**Scope (files):**
- `mcp/university-kb/src/kb-client.ts` (new) — the KB client library.
- `mcp/university-kb/tests/kb-client.test.ts` (new) — client-level tests against a real local HTTP
  server.
- `mcp/university-kb/tests/fakeKb.ts` (new) — the fake KB (a real in-process `node:http` server,
  contract B8/B14).
- `mcp/university-kb/src/index.ts` (extended, in place) — `UniversityKbServerDeps` gains an
  optional `kb?: KnowledgeBaseClient`; a new `ask_knowledge_base` tool is registered only when `kb`
  is supplied. The two existing tools (`search_courses`, `get_course`) and their behaviour are
  UNCHANGED — this file's own docstring guarantee ("no LLM calls, no web calls" for those two
  tools) still holds; `ask_knowledge_base` is additive and opt-in.
- `mcp/university-kb/tests/index.test.ts` (extended, in place) — 5 new tests for the
  `ask_knowledge_base` wiring (registration gating, success/citations pass-through, outage →
  tool error, uncited → tool error, hostile empty-query rejection before the kb client is ever
  called).
- `mcp/university-kb/src/bin.ts` (extended, in place) — wires `loadKbConfigFromEnv(process.env)` →
  `createKnowledgeBaseClient(...)` into the real stdio entrypoint when `VC_KB_BASE_URL` is set.
  NOT exercised by tests, matching this file's own pre-existing docstring ("NOT exercised by
  tests ... the only place in this package that ... opens a live socket").
- `.env.example` (extended, in place) — two new key NAMES only, `VC_KB_BASE_URL` / `VC_KB_API_KEY`
  (contract B11: no values, CRLF line endings preserved to match the file's existing convention).
- This manifest.

**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`,
`qa/contracts/**`, `packages/providers/**` (T-032 owns it), `packages/db/**`, `packages/schemas/**`,
`apps/api/**`, `apps/web/**`, `mcp/student-profile/**`, `packages/engine/**`. No checker or
reviewer dispatched, per the brief.
**Dual check:** no (no `.goal/` criticality marking on T-026; not requested in the brief)
**Executor:** claude-sonnet-subagent (maker build subagent)
**Executor rationale:** standard build unit (a client library + one MCP tool wire-up), no
specialised delegation lane needed.
**Offline:** every automated test is offline (B8/B13). `kb-client.test.ts` exercises the client
against a REAL in-process HTTP server (`fakeKb.ts`, `node:http` on `127.0.0.1`, an ephemeral port)
— never a mocked `fetch`, never the real D:/KnowledgeBase, never the real network (the one
deliberate exception is the "network_error" test, which connects to `127.0.0.1:1`, a port nothing
listens on, to exercise a genuine OS-level connection refusal). `index.test.ts`'s new tests inject
a fake `KnowledgeBaseClient` object (no HTTP at all) to test the MCP tool wiring in isolation.

## Real /ask contract, learned read-only from D:/KnowledgeBase (D-001)

Not an `[ASSUMPTION]` — found directly in the sibling repo:
- **Route:** `D:/KnowledgeBase/apps/api/src/routes/ask.ts:36-56` — `router.post("/ask",
  requireScope("ask"), ...)`. Body `{ query: string }` (400 if missing/empty). Auth via
  `D:/KnowledgeBase/apps/api/src/auth.ts:31-47,49-57` — `Authorization: Bearer <key>`; 401 on
  missing/malformed/invalid/revoked key, 403 if the key lacks the `ask` scope. 404 if the tenant
  has no tree index yet (`ask.ts:44-48`) — folded into this client's generic `http_error` outage
  reason (see "Outage classification" below).
- **Response shape:** `D:/KnowledgeBase/apps/web/src/api/types.ts:154-163`, the `AskResponse`
  interface (hand-mirrored there from `@lkb/ask`'s `AskV2Result`, per that file's own docstring at
  `types.ts:132-137`): `{ answer: string; verdict: string; reason: string; scored: AskScored[];
  web_used: boolean; insufficient_coverage: boolean; sources: { internal: AskInternalSource[]; web:
  AskWebSource[] }; auditLog: {...}[] }`. `kb-client.ts`'s `KbAskResponseSchema` (a Zod schema, not
  merely a TS type, so a shape violation is caught at runtime, not just at compile time) mirrors
  this exactly, with `.passthrough()` on the nested object shapes so "carried through verbatim"
  never silently drops an extra field the real KB sends.
- **Client-side reference:** `D:/KnowledgeBase/apps/web/src/api/ask.ts` — confirms the same
  `POST /ask` + `{ query }` body shape from the KB's own first-party consumer.

## What changed

### 1. `KnowledgeBaseClient` (`mcp/university-kb/src/kb-client.ts`, new)

`createKnowledgeBaseClient({ baseUrl, apiKey, timeoutMs?, fetchImpl? })` returns
`{ ask(query: string): Promise<KbAskResult> }`. `KbAskResult` is a discriminated union:
- `{ status: "ok", answer, citations, verdict, reason, scored, webUsed, insufficientCoverage,
  auditLog, raw }` — `citations` (`= data.sources`, `{ internal, web }`) is the KB's `sources`
  object carried through **completely untouched** (B2 "carried through verbatim").
- `{ status: "unavailable", reason, detail }` — `reason` is one of `"timeout" | "network_error" |
  "http_error" | "unauthorized" | "malformed_response" | "invalid_schema" | "uncited"`.

`ask()` **never throws** for any outage case — every failure path returns a typed `"unavailable"`
result, so a caller cannot forget to catch and accidentally treat a rejected promise as success.

**Outage classification** (fetch wrapped in `AbortController` + `setTimeout(timeoutMs)`,
default `KB_DEFAULT_TIMEOUT_MS = 10_000`):
- `AbortError` (the fetch itself was aborted by the timer) → `"timeout"`.
- any other `fetch()` rejection (DNS/connection-refused/TLS) → `"network_error"`.
- HTTP `401` or `403` → `"unauthorized"`.
- any other non-2xx (`404`, `5xx`, ...) → `"http_error"` (404 — "no tree index for this tenant
  yet" — is folded in here rather than given its own reason; the brief's named set is timeout /
  network / 5xx / 401 / 403 / malformed / schema-invalid, and 404 is not a case this unit's caller
  can act on differently from any other non-2xx, so it is not given a bespoke reason. Documented
  here as an explicit, non-hidden choice.).
- `res.json()` throws (non-JSON body) → `"malformed_response"`.
- valid JSON but `KbAskResponseSchema.safeParse` fails → `"invalid_schema"`.
- valid schema BUT `sources.internal.length === 0 && sources.web.length === 0` → `"uncited"` — an
  answer with zero citations is never passed on as `status: "ok"` (B2/B21's core requirement for
  this unit).
- otherwise → `"ok"`, with every field carried through.

Named error classes (`KbTimeoutError`, `KbNetworkError`, `KbHttpError`,
`KbMalformedResponseError`) mirror the repo's existing convention in
`packages/providers/src/index.ts` (`LiteLlmTimeoutError` / `LiteLlmNetworkError` /
`LiteLlmHttpError` / `LiteLlmMalformedResponseError`) — their `.message` becomes the typed result's
`detail` string; they are never thrown across `ask()`'s public boundary.

### 2. `loadKbConfigFromEnv` (`kb-client.ts`)

Reads `VC_KB_BASE_URL` / `VC_KB_API_KEY` from an env-shaped object (names only in `.env.example`,
contract B11 — no real value is ever read here; tests pass synthetic literal strings, never the
real `.env`). `VC_KB_BASE_URL` unset → `null` (the KB feature is entirely optional; university-kb
keeps working with only its two Mongo-backed tools, leaving ARCHITECTURE.md §6 Q1 open exactly as
before this unit). `VC_KB_BASE_URL` set but `VC_KB_API_KEY` missing → throws, rather than building
a client with an empty/undefined key.

### 3. Wiring into the university-kb MCP server (`mcp/university-kb/src/index.ts`, edited in place)

`UniversityKbServerDeps` (`index.ts`, was lines 56-59) gains an optional `kb?: KnowledgeBaseClient`.
`createUniversityKbServer` (was lines 62-150) registers a third tool, `ask_knowledge_base`, ONLY
when `deps.kb` is supplied — `search_courses` and `get_course` are completely unchanged, and a
server built with no `kb` (as both existing tests and the two pre-existing `index.test.ts` tests
do) behaves exactly as it did before this unit. `ask_knowledge_base`'s handler calls
`kb.ask(query)`; on `status !== "ok"` it `throw`s (matching this file's own pre-existing convention
in `get_course` for "cannot return uncited") so the MCP layer reports `isError: true` with no
`structuredContent` — never a fabricated or uncited answer reaches the caller. On success it
returns `{ answer, citations, verdict, reason }` as `structuredContent`, with `citations` passed
through byte-for-byte from the client's result.

**Location rationale (per the brief's "name the existing file first" instruction):** the existing
`mcp/university-kb/src/index.ts` is the only existing file in scope; its own docstring documents an
open ARCHITECTURE.md §6 Q1 question (whether the KB is built from scratch or seeded from
D:/KnowledgeBase) and states the two existing tools deliberately make "no LLM calls, no web calls".
Making `ask_knowledge_base` OPTIONAL (gated on `deps.kb` being supplied) keeps that guarantee
intact for the two pre-existing tools and avoids this unit silently resolving Q1 on its own
authority — Q1 stays open, and ARCHITECTURE.md is untouched, per the brief's explicit "do NOT
touch ... ARCHITECTURE.md". `packages/providers` was explicitly out of scope (T-032 owns it) and
would have been the wrong home regardless — it holds the counselling engine's own LLM provider
seam, not an external knowledge-service client.

### 4. `bin.ts` (edited in place)

The real stdio entrypoint now calls `loadKbConfigFromEnv(process.env)` and, when it returns
non-null, builds a real `createKnowledgeBaseClient(...)` and passes it as `kb` to
`createUniversityKbServer`. Not exercised by any test (this file's own pre-existing docstring:
"NOT exercised by tests ... the only place in this package that ... opens a live socket") — this
is what makes the feature actually reachable from a real deployment once `VC_KB_BASE_URL`/
`VC_KB_API_KEY` are set, without adding any new test-visible surface.

### 5. `.env.example` (edited in place)

Two new key NAMES appended (CRLF preserved, matching the file's existing line endings):
```
VC_KB_BASE_URL=
VC_KB_API_KEY=
```
No values (B11). The checker's key-value grep over history will find none, because none was ever
written.

## Capability coverage (B14 — outcome, not construction)

| # | Claim | Test id (`kb-client.test.ts` unless noted) | Falsifying edit | Expected RED |
|---|---|---|---|---|
| 1 | A valid response with citations is carried through verbatim | "ok: a valid response with internal citations is carried through verbatim ..." | temporarily changed `citations: data.sources` to `citations: { internal: [], web: [] }` in `ask()` | assertion on `result.citations` fails (empty object instead of the real citation) |
| 2 | Zero citations (both arrays empty) is NEVER served as an answer | "uncited: an answer with zero citations ... is treated as unavailable ..." | temporarily removed the `hasCitations` check (always fell through to `status: "ok"`) | `assert.equal(result.status, "unavailable")` fails — got `"ok"` |
| 3 | HTTP 401/403 classify as `unauthorized`, not a generic error | "outage: HTTP 401 ..." / "outage: HTTP 403 ..." | temporarily removed the `res.status === 401 \|\| res.status === 403` branch (fell through to the generic `!res.ok` → `http_error`) | `assert.equal(result.reason, "unauthorized")` fails — got `"http_error"` |
| 4 | HTTP 5xx classifies as `http_error` | "outage: HTTP 503 (5xx) is unavailable/http_error" | temporarily made `!res.ok` return `status: "ok"` with an empty answer instead of unavailable | `assert.equal(result.status, "unavailable")` fails |
| 5 | A non-JSON body classifies as `malformed_response`, distinct from `invalid_schema` | "outage: malformed (non-JSON) response body ..." | temporarily wrapped `res.json()` to always return `{}` instead of letting the parse throw | reason becomes `"invalid_schema"` instead of `"malformed_response"` — assertion fails |
| 6 | A schema-invalid (but valid JSON) body classifies as `invalid_schema` | "outage: schema-invalid response ..." | temporarily replaced `KbAskResponseSchema.safeParse(json)` with `{ success: true, data: json as any }` | the call throws (`data.sources` is `undefined`) instead of returning a typed `"invalid_schema"` result — test fails with an uncaught error, not a clean assertion failure, which is itself proof the guard was load-bearing |
| 7 | A real network failure (nothing listening) classifies as `network_error` | "outage: a real network error ..." | temporarily wrapped the network-error branch to return `{status:"unavailable", reason:"timeout", ...}` unconditionally | `assert.equal(result.reason, "network_error")` fails — got `"timeout"` |
| 8 | The client's own timeout genuinely bounds the wait (does not wait out a hung server) | "outage: the server hangs past the client's configured timeout ..." | temporarily set `timeoutMs` internally to `10 * timeoutMs` before constructing `AbortController`'s timer | the `elapsed < 300` assertion fails (the call now waits out the full 300ms server delay instead of aborting near 50ms) |
| 9 | `ask_knowledge_base` is gated on `kb` being supplied — no silent always-on tool | `index.test.ts`: "ask_knowledge_base is NOT registered when no kb client is configured" | temporarily removed the `if (kb)` guard in `index.ts` (registered unconditionally) | `tools/list` now includes `ask_knowledge_base` even with no `kb` — `assert.deepEqual(names, ["get_course","search_courses"])` fails |
| 10 | A KB outage / uncited result becomes a tool error, never `structuredContent` | `index.test.ts`: "ask_knowledge_base surfaces a KB outage ..." + "... surfaces an uncited KB answer ..." | temporarily removed the `if (result.status !== "ok") throw ...` guard, returning `structuredContent: undefined` fields as if ok | `assert.equal(result.isError, true)` fails |

Falsification runs are captured in a **throwaway git worktree outside the bound root** (per the
brief's isolation rule); see "Falsification run log" below for the exact commands and pasted
GREEN/RED pairs, executed after the real GREEN baseline was established in the bound worktree.

## Falsification run log

Per the isolation rule, every falsifying edit was made in a **throwaway copy**, never the live
worktree: `git ls-files` + `git ls-files --others --exclude-standard` piped through `tar` into
`C:/Users/Lenovo/AppData/Local/Temp/claude/t026-falsify` (avoids traversing `node_modules`; captures
the uncommitted new files too, since nothing here is committed yet), then
`pnpm -C <copy> install --offline` (`Packages: +177`, `Done in 15.4s`, reusing the local pnpm
store). Each row: apply the edit -> run the one relevant test file -> capture the real RED line(s)
-> restore the original file byte-for-byte -> re-run to confirm GREEN again. The live worktree's
`kb-client.ts`/`index.ts` were `diff`-verified identical to the copy before AND after the whole run
(no drift).

| # | Claim | GREEN (before) | RED (after, real output) |
|---|---|---|---|
| 1 | Citations carried through verbatim | `✔ ok: a valid response with internal citations is carried through verbatim ...` | `✖ ... AssertionError: actual: { internal: [], web: [] }, expected: { internal: [ [Object] ], web: [] }` |
| 2 | Zero citations never served as an answer | `✔ uncited: an answer with zero citations ...` | `✖ ... AssertionError: actual: 'ok', expected: 'unavailable'` |
| 3 | HTTP 401/403 -> `unauthorized`, not generic | `✔ outage: HTTP 401 ...` / `✔ outage: HTTP 403 ...` | `✖ ... (both) AssertionError: actual: 'http_error', expected: 'unauthorized'` |
| 4 | HTTP 5xx -> `http_error` | `✔ outage: HTTP 503 (5xx) ...` | `✖ ... AssertionError: actual: 'invalid_schema', expected: 'http_error'` (disabling the `!res.ok` branch let the 503's `{"error":"unavailable"}` body reach schema validation, which correctly fails it too, but with the wrong reason -- confirms the branch is load-bearing) |
| 5 | Non-JSON body -> `malformed_response`, distinct from `invalid_schema` | `✔ outage: malformed (non-JSON) response body ...` | `✖ ... AssertionError: actual: 'invalid_schema', expected: 'malformed_response'` |
| 6 | Schema-invalid body -> `invalid_schema` (the Zod guard is load-bearing) | `✔ outage: schema-invalid response ...` | `✖` (the call threw a raw, uncaught error reading `data.sources` off the un-validated JSON, instead of returning a typed `invalid_schema` result -- a harder failure than a clean assertion, itself proof the guard was necessary) |
| 7 | A real network failure -> `network_error` | `✔ outage: a real network error ...` | `✖ ... AssertionError: actual: 'timeout', expected: 'network_error'` |
| 8 | The client's own timeout genuinely bounds the wait | `✔ outage: the server hangs past the client's configured timeout ...` (55ms) | `✖ ... AssertionError: actual: 'ok', expected: 'unavailable'` (326ms elapsed -- the call waited out the full 300ms server delay instead of aborting near 50ms) |
| 9 | `ask_knowledge_base` gated on `kb` being supplied | `✔ tool registered and callable through MCP: both tools appear in tools/list` + `✔ ask_knowledge_base is NOT registered ...` | `✖ (both) AssertionError: actual: [ 'ask_knowledge_base', 'get_course', 'search_courses' ], expected: [ 'get_course', 'search_courses' ]` |
| 10 | Outage/uncited -> tool error, never a fabricated answer | `✔ ask_knowledge_base surfaces a KB outage ...` + `✔ ... surfaces an uncited KB answer ...` | First attempt (disabling only the `throw`) produced **no red** — the MCP SDK's own `outputSchema` validation caught the `undefined answer` and still set `isError`, an honest miss recorded rather than hidden. Superseded by a sharper edit that returns SCHEMA-VALID placeholder strings (`answer: "no answer available"`, ...) instead of throwing: `✖ (both) AssertionError: actual: undefined, expected: true` (`result.isError`) — this isolates the guard from the SDK's own validation and proves it is genuinely necessary. |

All ten rows were reverted immediately after capturing their RED line, each confirmed back to a
clean GREEN re-run, and the throwaway copy was `diff`-verified identical to the live worktree at
the end (see "Verification" below for the final full-package GREEN run in the live worktree
itself). The throwaway copy was deleted after this run.

**Final confirmation in the live (bound) worktree, after all falsification work:**
```
$ bash scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-026-kb-client --filter @vc/mcp-university-kb test
ℹ tests 29
ℹ pass 29
ℹ fail 0
ℹ duration_ms 5795.0021
exit: 0
```

## Verification (exact commands, run in the worktree, real output)

Per the coordinator's RAM constraint (system-wide contention from ~8 parallel maker units —
T-013, T-022, T-023, T-025, T-027, T-030, T-032, T-033 — all queued on the same
`scripts/vc-testlock.sh` mutex), each command below queued behind other agents' typecheck/test/eval runs
for roughly 20-30 minutes before it actually ran; every run below is nonetheless a real,
individually-run command (never `pnpm -r test`).

```
$ bash scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-026-kb-client --filter @vc/mcp-university-kb test
[testlock] running (free RAM 3.71 GB): pnpm -C D:/vc/.worktrees/t-026-kb-client --filter @vc/mcp-university-kb test

> @vc/mcp-university-kb@0.1.0 test D:\vc\.worktrees\t-026-kb-client\mcp\university-kb
> tsx --test tests/*.test.ts

✔ tool registered and callable through MCP: both tools appear in tools/list (28.0501ms)
✔ ask_knowledge_base is NOT registered when no kb client is configured (5.8178ms)
✔ ask_knowledge_base is registered and returns the answer with citations carried through verbatim when the kb client succeeds (9.0613ms)
✔ ask_knowledge_base surfaces a KB outage as a tool error, never a fabricated answer (1.9392ms)
✔ ask_knowledge_base surfaces an uncited KB answer as a tool error too (B2: never served uncited) (2.4822ms)
✔ hostile: ask_knowledge_base rejects an empty query via Zod before ever calling the kb client (2.4211ms)
✔ uncited course excluded: search_courses drops a stored record missing sourceUrl/fetchedAt and counts it in `dropped` (2.3899ms)
✔ search_courses filters by country and level and is case-insensitive (1.4886ms)
✔ get_course returns the record for a known courseId (1.4833ms)
✔ unknown courseId: get_course returns a not-found tool error, never a fabricated record (1.4447ms)
✔ get_course on a stored-but-uncited record (missing sourceUrl) is also a tool error, not a partial record (1.1841ms)
✔ hostile: empty query is rejected by Zod (min length 1) (1.1749ms)
✔ hostile: a NoSQL-operator object as courseId ({"$ne": null}) is rejected by Zod, not passed to the DB (1.3114ms)
✔ hostile: level not in the enum is rejected by Zod (1.0768ms)
✔ ok: a valid response with internal citations is carried through verbatim, answer + citations + verdict/reason/scored all present (54.7374ms)
✔ ok: web-only citations (empty internal, non-empty web) still count as cited (11.4846ms)
✔ request shape: POST /ask, Bearer <key> header, JSON body { query } (7.5972ms)
✔ uncited: an answer with zero citations in BOTH sources.internal and sources.web is treated as unavailable, never passed on as an answer (6.1557ms)
✔ outage: HTTP 401 is unavailable/unauthorized (5.4648ms)
✔ outage: HTTP 403 is unavailable/unauthorized (5.5737ms)
✔ outage: HTTP 503 (5xx) is unavailable/http_error (7.6068ms)
✔ outage: malformed (non-JSON) response body is unavailable/malformed_response (4.9533ms)
✔ outage: schema-invalid response (valid JSON, wrong shape -- missing required fields) is unavailable/invalid_schema (6.8445ms)
✔ outage: a real network error (nothing listening) is unavailable/network_error (0.753ms)
✔ outage: the server hangs past the client's configured timeout -- unavailable/timeout (55.2831ms)
✔ default timeout constant is exported and positive (0.1494ms)
✔ loadKbConfigFromEnv: VC_KB_BASE_URL unset -> null (feature off, no client built) (0.0906ms)
✔ loadKbConfigFromEnv: VC_KB_BASE_URL set, VC_KB_API_KEY set -> a config object (never real values -- synthetic test strings only) (0.0877ms)
✔ loadKbConfigFromEnv: VC_KB_BASE_URL set but VC_KB_API_KEY missing -> throws rather than silently defaulting the key (B11) (0.3556ms)
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1176.9715
exit: 0
```

```
$ bash scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-026-kb-client --filter @vc/mcp-university-kb typecheck
[testlock] running (free RAM 3.5 GB): pnpm -C D:/vc/.worktrees/t-026-kb-client --filter @vc/mcp-university-kb typecheck

> @vc/mcp-university-kb@0.1.0 typecheck D:\vc\.worktrees\t-026-kb-client\mcp\university-kb
> tsc --noEmit

exit: 0 (no errors)
```

_`verify_contracts.py` output appended once its queued lock run completes._
```
bash scripts/vc-testlock.sh python D:/vc/.worktrees/t-026-kb-client/contracts/verify_contracts.py --repo-root D:/vc/.worktrees/t-026-kb-client
```

## Residuals (not fixed here)

1. **404 ("no tree index built for this tenant yet") is folded into the generic `http_error`
   reason** rather than given its own `KbUnavailableReason`. The brief's named outage set is
   timeout/network/5xx/401/403/malformed/schema-invalid; 404 was not named, and a caller has no
   different action to take for it than for any other non-2xx today. A future unit can split it
   out if a caller ever needs to distinguish "tenant has no KB yet" from "KB is down".
2. **`apps/api` wiring is explicitly NOT this unit's scope** (T-025 builds `apps/api`; the brief:
   "NOT this unit: the apps/api route"). `ask_knowledge_base` is reachable today only via the
   university-kb MCP server (stdio) — `apps/api` will need its own import of `kb-client.ts` (or a
   thin re-export) when T-025/a future unit wires the counsellor-facing HTTP API to it.
3. **No retry/backoff/circuit-breaker for the KB client** (unlike `packages/providers`'
   `FailoverProvider`) — not requested by the brief for this unit; a single attempt per `ask()`
   call, bounded only by `timeoutMs`. A future unit can add one if the real KB shows transient
   failures worth retrying.
4. **`insufficient_coverage: true` from the KB is passed through as data, not treated as an
   outage.** The brief's outage/uncited requirement is specifically about missing citations
   (`sources.internal`/`sources.web` both empty), not the KB's own confidence signal; a caller
   that wants to also treat low-coverage answers specially can read `insufficientCoverage` on the
   `"ok"` result.
5. **ARCHITECTURE.md §6 Q1 stays open** (by design — see "Location rationale" above); this unit
   does not attempt to resolve it, and `ask_knowledge_base` is additive/opt-in specifically so it
   doesn't need to be resolved to land this unit.

## Close-out
- Checker cycle 0 PASS (qa/verdicts/t-026-kb-client.md, 7ca29ed; 5/5 criteria, 10/10 capability rows reproduced). ai-engineer review: Approve. senior review: Approve.

## Status: checked-PASS
