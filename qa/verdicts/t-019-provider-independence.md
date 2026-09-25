# Verdict: t-019-provider-independence

**Verdict:** PASS
**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** claude-sonnet-subagent, fresh context, bound to `D:\vc` (worktree
`D:\vc\.worktrees\t-019-provider-independence`, branch `wave/t-019-provider-independence`)
**Manifest:** qa/manifests/t-019-provider-independence.md
**Diff:** ac4dc1e..304ae76 (one commit `5ed159b` + the manifest commit `304ae76`)
**Contract:** qa/contracts/counselling-engine.md (B6 primary; B1, B2, B5, B8, B11, B13, B14)

## 1. Re-run verify commands (fresh, not the maker's pasted output)

```
pnpm install                            -> "Already up to date", exit 0
pnpm -r typecheck                       -> 9/9 workspace projects "Done", exit 0
pnpm -r test                            -> 519/519 tests pass, 0 fail (summed per-package:
                                            providers 31, schemas 50, observability 57, db 185,
                                            api 8, mcp/student-profile 12, mcp/university-kb 9,
                                            engine 150, web 17 = 519) -- matches the manifest exactly
python contracts/verify_contracts.py    -> "no frozen contracts yet (research phase) -- PASS by
                                            vacuity", exit 0
```

## 2. Outcome proof, produced by the checker itself (B14)

**(a) LiteLlmProvider against the checker's OWN stub server** (`packages/providers/.checker-probe.mjs`,
run then deleted -- not committed; `git status` confirmed clean before and after). 30 independent
assertions, all PASS: a real POST to `/chat/completions` with `response_format:{type:"json_object"}`,
both message roles, model name, and an `Authorization: Bearer <own-secret>` header only when
configured; response correctly parsed. Then every failure mode against the SAME stub, using the
checker's own secret (`checker-own-secret-abc123`, never used in the maker's tests): 401, 503,
non-JSON body, missing `choices[0].message.content`, schema-invalid content (native `ZodError`, not
wrapped), a 150ms-timeout hang (`LiteLlmTimeoutError`, bounded), and connection-refused
(`LiteLlmNetworkError`). The checker's own secret never appeared in any `err.message`, `String(err)`,
`err.stack`, or `JSON.stringify(err, Object.getOwnPropertyNames(err))` -- checked explicitly, not
just asserted. Provider-instance leak surfaces also checked independently: `JSON.stringify`,
`String()`, `util.inspect(depth:10)`, `Object.values`, `Object.entries` -- none leaked the key.
`baseUrl: "file:///etc/passwd"` was tried directly: `fetch()` (Node/undici) rejects the `file:`
scheme and the provider correctly surfaces it as a typed `LiteLlmNetworkError`, not a silent success
or a local-file read.

**(b) `VC_LLM_PROVIDER=rules` end-to-end.** Re-ran `scribe-rules-e2e.test.ts` as part of the real
`pnpm -r test` pass (150/150 engine tests green, including this one, `428ms`) -- it runs the REAL
`compileScribeGraph` over the REAL `MongoDBSaver` checkpointer, stubs `globalThis.fetch` to throw on
any call, and asserts `fetchCalls === 0` after a full `startScribe` -> `awaiting_approval` ->
`resumeScribe(approve)` -> `written` run. Facts read back correctly (`targetCountry=Canada`,
`budget_inr_per_year=2000000`, numeric coercion confirmed), each cited to its exact turn+quote (B2),
and the deterministic summary matches the real `isScriptLike`/no-script guard (B1) via the actual
graph path, not a mock of it.

**(c) RulesProvider hostile inputs** (own probe, `packages/providers/.checker-probe2.mjs`, run then
deleted): an injection-like `key: value` embedded MID-SENTENCE ("haan sir, budget: whatever aap bolo
theek hai") correctly produces ZERO facts -- the field regex is anchored to the start of the (trimmed)
line, so prose containing a colon does not qualify. **However**, a turn whose ENTIRE text (after trim)
literally reads `budget: whatever` or `note: ask about scholarships next time` -- plausible ordinary
sentences, not deliberately crafted -- DOES become a confidence:1 fact (ISS-t-019-c0-1, medium,
logged). Duplicate keys on separate lines correctly become two separate facts (documented,
intentional -- not a bug). Values containing colons (`"scheduled at 10:30 with ratio 3:1"`) are
captured whole, correctly. Devanagari VALUES are captured correctly (`targetCountry: कनाडा` ->
`value: "कनाडा"`); Devanagari KEYS are correctly rejected (the field regex is ASCII-identifier-only
by documented design, consistent with the manifest's stated input contract). Empty values
(`"targetCountry: "` and `"targetCountry:"`) correctly produce zero facts rather than an empty-string
fact.

**(d) Config.** No default provider (`loadProviderConfig({})` throws, confirmed). Unknown provider
refused. litellm missing `VC_LLM_MODEL` or `VC_LLM_BASE_URL` each refused independently. `rules`
needs nothing beyond the provider name, confirmed. `VC_LLM_BASE_URL` scheme/shape is NOT validated by
`loadProviderConfig` (accepts `file:///etc/passwd` and a bare non-URL string unchanged) -- judged
against B13/B8: `fetch()` itself currently rejects `file://`, so there is no local-file-read bypass
today, but there is no host allowlist for the litellm gateway analogous to B12's explicit
DB-name guard for Mongo. `VC_LLM_BASE_URL` is trusted operator config (same class as `MONGODB_URL`/
`GEMINI_API_KEY` today), not attacker-controlled per-request input, and the contract does not yet
require endpoint allowlisting -- logged as ISS-t-019-c0-2 (medium, forward-looking hardening),
**not a blocker**.

## 3. Capability coverage (4b) -- falsified in a SCRATCH COPY, not the bound tree

The manifest's own "Falsification per capability" table (lines 101-115) is a narrative test-design
description, not the project's established `## Capability coverage` table with maker-supplied
single-hunk falsifying-edit rows (precedent: `t-005-skills-guards.md`, `t-008-approval-ui.md`) --
logged as ISS-t-019-c0-3 (low, process/documentation gap). The checker performed the falsification
itself instead of refusing on the format gap:

- Scratch copy: `...scratchpad\providers-falsify\` (`src/`, `tests/`, `package.json` copied;
  `node_modules/{zod,tsx,esbuild,@esbuild/win32-x64}` symlinked to the SAME absolute pnpm-store
  paths the worktree uses -- no reinstall needed, nothing shared with the worktree except read-only
  package content). **GREEN baseline confirmed first: 31/31 `packages/providers` tests pass in the
  copy**, before any edit.
- 8 single-hunk edits applied to the copy's `src/index.ts`, one at a time, each reverted from a
  pristine `.bak` immediately after capturing the RED line:

| # | capability | edit | result |
|---|---|---|---|
| 1 | litellm: correct request path | `/chat/completions` -> `/wrong-completions` | RED: "a real request goes out and a well-formed response is parsed..." |
| 2 | litellm: typed `LiteLlmHttpError` on non-2xx | `if (!res.ok)` -> `if (false && !res.ok)` | RED: "a non-2xx HTTP response gives a typed LiteLlmHttpError..." |
| 3 | litellm: B11 no-key-in-message (network path) | appended `" key=" + this.#apiKey` to the network-error reason | RED: "...gives a typed LiteLlmNetworkError, no key value in the message" |
| 4 | litellm: typed `LiteLlmTimeoutError` | swapped to throw `LiteLlmNetworkError` instead | RED: "a server that never responds times out with a typed LiteLlmTimeoutError..." |
| 5 | litellm: schema-invalid output not swallowed | wrapped `outputSchema.parse` in a try/catch that returns the raw value | RED: "well-formed JSON that fails the caller's outputSchema throws the underlying schema error..." |
| 6 | rules: fact citation quote is the real line | `quote: line` -> `quote: "corrupted-quote"` | RED: "a 'key: value' annotation line...becomes a cited candidate fact" |
| 7 | rules: zero network calls | added a spurious `fetch("http://falsify.invalid/leak")` inside `rulesExtractFacts` | RED: "no global fetch call is ever made by the rules provider" |
| 8 | rules: B1 summary is a record, not an instruction | summary template prefixed with `"Tell the student: "` | RED: "the template is a record, never an instruction...(no recital verbs)" |

All 8 reproduced the correctly-named test failing for the stated reason (not a collateral break).
After the last revert, `diff` confirmed the scratch copy's `src/index.ts` is **byte-identical** to
the worktree's, and `git status --porcelain` in the bound worktree was empty throughout -- the bound
tree was never touched. The remaining rows from the manifest's table (the 3 malformed-body variants
as one combined test, connection-refused as a distinct case, and the E2E's zero-AI claim, which
shares `RulesProvider`'s already-falsified no-fetch code path) were verified behaviorally in part 2
above rather than by a second source-edit; `B11`'s own-instance-serialization sub-claim
(`JSON.stringify(provider)`) is structurally guaranteed by the `#apiKey` private class field and is
not meaningfully falsifiable by an application-code edit.

## 4. Diff scope (4c)

`git diff ac4dc1e..304ae76 --stat`: 7 files, all within the manifest's declared scope
(`packages/providers/src/index.ts`, 3 new/extended test files, `.env.example`, the manifest, one new
`packages/engine/tests/scribe-rules-e2e.test.ts`). The only removed lines in `index.ts` are the
old `ProviderKind` union, the old config-required-fields comment, and the old error message / status
string -- all superseded in place by the extended four-provider versions, not silent deletions.
`.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `packages/engine/src/scribe/
{nodes,schemas,graph,checkpointer}.ts`, and `TASKS.md` are untouched (`TASKS.md`'s T-019 row still
reads `open`, as claimed). No secret-shaped value found via grep of the diff (only the tests'
obviously-fake `test-key-value`/`super-secret-key`/`super-secret-value` strings).

## 5. Ledger + proposed D-entry

No `Issues addressed` claimed by this manifest. Three new findings logged (ISS-t-019-c0-1/2/3,
medium/medium/low) -- none block PASS: (1) a whole-turn "identifier: rest" line of ordinary speech
becomes a confidence:1 fact under the rules provider, mitigated by B3's mandatory human approval
before any write; (2) `VC_LLM_BASE_URL` has no endpoint allowlist (forward-looking hardening,
mirrors B12's DB-name precedent, not required by the current contract); (3) the manifest's
capability-coverage table doesn't follow this project's established falsifying-edit format (the
checker did the falsification itself, all 8 held).

The **proposed D-entry** is sound and correctly left unwritten for the Approver: it traces to the
lead's 2026-09-25 review in `qa/feedback-inbox.md`, accurately describes the shipped provider set
and the `rules` provider's input contract, and does not overreach (it does not claim P2/P3 coverage,
audio-first input, or anything beyond what this unit built).

## Answers to the manifest's open questions

- The `key: value` line format is an acceptable input contract for now (B3's human-approval gate is
  the real backstop), but ISS-t-019-c0-1 should be addressed -- e.g. requiring the annotation to be
  the ONLY content of a turn from a specific `speaker` role (counsellor-entered form), or a stricter
  marker -- before this scales past the P1 pilot.
- `LITELLM_DEFAULT_TIMEOUT_MS` configurability via env: reasonable, not required now; leave as the
  manifest's residual.

VERDICT: PASS
SCOREBOARD: 9/9 contract criteria met (B1, B2, B5, B6, B8, B11, B13, B14, plus B3 exercised by the
reused E2E path), 0/0 invariants violated
FAILURES (if any): none at >80% confidence
CAPABILITY-COVERAGE: 8/11 rows reproduced via the checker's own falsifying edits in a scratch copy
(GREEN baseline confirmed); 3/11 verified behaviorally instead (malformed-body variants, E2E zero-AI
sharing an already-falsified code path, B11's structurally-guaranteed private-field claim)
LIVE-BROWSER: not-applicable (packages/providers, packages/engine/tests only -- no UI surface touched)
ISSUES-WRITTEN: ISS-t-019-c0-1 (medium), ISS-t-019-c0-2 (medium), ISS-t-019-c0-3 (low)
EXECUTOR: claude-sonnet-subagent (manifest's Executor) (checker: claude-sonnet-subagent)
EXPLANATION: Every re-run command matches the manifest exactly (519/519 tests, 9/9 typecheck, vacuous
contracts PASS). The checker independently reproduced the litellm provider's success and every
failure mode against its own stub server and its own secret (never leaked), independently ran the
rules-provider hostile-input matrix, and independently falsified 8 capabilities via single-hunk edits
in a scratch copy with a confirmed green baseline -- all landed correctly and the worktree was never
touched. Three real but non-blocking findings were logged: a conversational false-positive-fact risk
in the rules provider (mitigated by the mandatory human-approval gate), a missing endpoint allowlist
for VC_LLM_BASE_URL (forward-looking, not contract-required today), and a manifest documentation gap
in the capability-coverage table (the checker did the falsification itself and it held). The proposed
D-entry is sound and correctly deferred to the Approver.
