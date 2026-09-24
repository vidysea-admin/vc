# Manifest — t-004-langfuse
**Contract:** qa/contracts/counselling-engine.md B7/B8
**Goal task:** T-004
**Date:** 2026-09-25
**Fix cycle:** 1
**Dual check:** no
**Issues addressed:** ISS-016, ISS-017
**Executor:** claude-sonnet-subagent
**Executor rationale:** infra wiring + adapter code from an explicit brief with pre-verified doc
references; no need for a larger model

## What changed
- `infra/langfuse/docker-compose.yml` (215 lines) — self-hosted Langfuse v4 (6 services: postgres,
  clickhouse, redis, minio, langfuse-worker, langfuse-web), adapted from the official self-host
  compose. `TELEMETRY_ENABLED: "false"` hardcoded on both langfuse-web and langfuse-worker, no
  `LANGFUSE_EE_LICENSE_KEY` anywhere, every published port bound to `127.0.0.1`, all secrets read
  from `infra/langfuse/.env` (uncommitted).
- `infra/langfuse/.env.example` (committed, force-added past the root `.gitignore`'s `.env.*`
  pattern with `git add -f` — see "Not done" below) — every secret as `CHANGE_ME` with `openssl
  rand` generation commands in the header comment.
- `infra/langfuse/.gitignore` (new file, 2 lines) — ignores `.env` only; does not touch the root
  `.gitignore`.
- `infra/langfuse/README.md` — start/stop/validate commands, the 4 MUSTs, why 6 services, source
  links.
- `packages/observability/` (new package `@vc/observability`) — `package.json` with
  `"exports": {".": "./src/index.ts"}` / `"types": "./src/index.ts"` per D-007 (no build step):
  - `src/config.ts` — `loadTracingConfig(env)`: pure function, throws on any Langfuse Cloud host
    (5 hostnames, all regions), `enabled: false` (never throws) when keys are missing.
  - `src/callbacks.ts` — `createLangfuseCallbacks(config)`: thin adapter, `[]` when disabled,
    otherwise sets the 3 env vars `@langfuse/core` actually reads (verified against the published
    `.d.ts` — `CallbackHandler`'s constructor has no `baseUrl`/`publicKey`/`secretKey` params) and
    returns one `CallbackHandler`.
  - `src/index.ts` — re-exports both.
  - `tests/config.test.ts`, `tests/callbacks.test.ts`, `tests/docker-compose.test.ts` (28 tests,
    node:test via tsx, fully offline) — cloud-host refusal (5 hosts × 2 URL shapes), localhost/
    127.0.0.1/internal-domain acceptance, missing-key combinations all disable, `LANGFUSE_HOST`
    alias, malformed-URL error, callbacks-array shape, and the docker-compose.yml structural guard
    (TELEMETRY_ENABLED, EE license key, 127.0.0.1 binding).
  - `README.md` — the one-line T-007 wiring snippet + verified package versions/URLs.
- `pnpm-lock.yaml` — updated by `pnpm install` for the new package's dependencies
  (`@langfuse/langchain`) and devDependencies (`@langchain/core`, `@opentelemetry/api`, `yaml`).

## How to verify (commands + expected)
- `pnpm install` (in the worktree) → expected: exit 0
- `pnpm -r typecheck` → expected: exit 0, all packages report "Done" (9 workspace projects, 8 with
  a typecheck script)
- `pnpm -r test` → expected: exit 0, 48 tests total (20 pre-existing in `packages/schemas` +
  4×1 stub packages + 28 new in `packages/observability`) all pass
- `python contracts/verify_contracts.py` → expected: exit 0 ("PASS by vacuity", research phase)
- `docker compose -f infra/langfuse/docker-compose.yml --env-file infra/langfuse/.env config
  --quiet` → expected: exit 0, no output (validation only, no `up`)
- `git diff --stat --cached` (after `git add`) → expected: only `A` (added) files plus `M
  pnpm-lock.yaml`, no deletions/modifications to any pre-existing file

## Actual outputs (from maker's own run)

**`pnpm install`** — exit 0:
```
Scope: all 9 workspace projects
Packages: +23
Progress: resolved 49, reused 7, downloaded 16, added 23, done
Done in 14s using pnpm v10.33.0
```
(Second, incremental run after all files were in place: `Done in 1.9s using pnpm v10.33.0`, no
package changes — confirms the lockfile is stable.)

**`pnpm -r typecheck`** — exit 0:
```
Scope: 8 of 9 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
packages/observability typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
TYPECHECK_EXIT=0
```

**`pnpm -r test`** — exit 0, 48/48 pass:
```
packages/schemas test: ℹ tests 14 / pass 14 / fail 0
packages/observability test: ✔ disabled config produces an empty callbacks array (never undefined)
packages/observability test: ✔ disabled config does not touch process.env
packages/observability test: ✔ enabled config returns exactly one callback handler and sets the resolved env vars
packages/observability test: ✔ refuses Langfuse Cloud host: cloud.langfuse.com
packages/observability test: ✔ refuses Langfuse Cloud host cloud.langfuse.com even with a path/port on the URL
packages/observability test: ✔ refuses Langfuse Cloud host: us.cloud.langfuse.com
packages/observability test: ✔ refuses Langfuse Cloud host us.cloud.langfuse.com even with a path/port on the URL
packages/observability test: ✔ refuses Langfuse Cloud host: eu.cloud.langfuse.com
packages/observability test: ✔ refuses Langfuse Cloud host eu.cloud.langfuse.com even with a path/port on the URL
packages/observability test: ✔ refuses Langfuse Cloud host: jp.cloud.langfuse.com
packages/observability test: ✔ refuses Langfuse Cloud host jp.cloud.langfuse.com even with a path/port on the URL
packages/observability test: ✔ refuses Langfuse Cloud host: hipaa.cloud.langfuse.com
packages/observability test: ✔ refuses Langfuse Cloud host hipaa.cloud.langfuse.com even with a path/port on the URL
packages/observability test: ✔ accepts a self-hosted localhost base URL
packages/observability test: ✔ accepts a self-hosted 127.0.0.1 base URL
packages/observability test: ✔ accepts a self-hosted internal-domain base URL (not a Langfuse Cloud host)
packages/observability test: ✔ disabled + no throw when LANGFUSE_BASE_URL is missing entirely
packages/observability test: ✔ disabled when only the public key is missing
packages/observability test: ✔ disabled when only the secret key is missing
packages/observability test: ✔ disabled when the env object is empty
packages/observability test: ✔ LANGFUSE_HOST is accepted as a legacy alias for LANGFUSE_BASE_URL
packages/observability test: ✔ LANGFUSE_HOST pointed at Langfuse Cloud is refused too
packages/observability test: ✔ a malformed base URL throws a clear error rather than silently disabling
packages/observability test: ✔ docker-compose.yml defines langfuse-web and langfuse-worker
packages/observability test: ✔ langfuse-web sets TELEMETRY_ENABLED to "false"
packages/observability test: ✔ langfuse-worker sets TELEMETRY_ENABLED to "false"
packages/observability test: ✔ no service sets LANGFUSE_EE_LICENSE_KEY (OSS edition only, MUST b)
packages/observability test: ✔ every published port is bound to 127.0.0.1 (MUST d)
packages/observability test: ℹ tests 28 / pass 28 / fail 0
TEST_EXIT=0
```
(Other 4 stub packages — apps/api, apps/web, mcp/student-profile, mcp/university-kb,
packages/engine, packages/providers — each ran their 1 pre-existing placeholder test, unchanged.)

**`python contracts/verify_contracts.py`** — exit 0:
```
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

**`docker compose -f infra/langfuse/docker-compose.yml --env-file infra/langfuse/.env config
--quiet`** — exit 0, no output (docker 29.6.1 / compose v5.2.0 available; `.env` was created from
`.env.example` for this validation only, then deleted — never committed, confirmed by `git status`
below).

**`git diff --stat --cached`** (after `git add infra/ packages/observability/ pnpm-lock.yaml` +
`git add -f infra/langfuse/.env.example`):
```
 infra/langfuse/.env.example                        |  48 +++++
 infra/langfuse/.gitignore                          |   2 +
 infra/langfuse/README.md                           |  59 ++++++
 infra/langfuse/docker-compose.yml                  | 215 +++++++++++++++++++++
 packages/observability/README.md                   |  47 +++++
 packages/observability/package.json                |  26 +++
 packages/observability/src/callbacks.ts            |  27 +++
 packages/observability/src/config.ts               |  78 ++++++++
 packages/observability/src/index.ts                |   2 +
 packages/observability/tests/callbacks.test.ts     |  51 +++++
 packages/observability/tests/config.test.ts        | 126 ++++++++++++
 packages/observability/tests/docker-compose.test.ts|  68 +++++++
 packages/observability/tsconfig.json               |   9 +
 pnpm-lock.yaml                                     | 173 +++++++++++++++++
 14 files changed, 931 insertions(+)
```
`git diff --cached --name-status` confirms every row is `A` except `M pnpm-lock.yaml` — no
existing file was edited, renamed or deleted.

Note on `git diff --stat main`: `main` has advanced to `b1e6e83` (D-008, unrelated to this unit)
since this worktree's branch point `4290c6d`, so a raw diff against `main` shows ~90 lines of
*main's own later changes* (qa/, ARCHITECTURE.md, docs/DECISIONS.md, etc.) that this unit never
touched. The additions-only proof above is the diff against this branch's actual merge-base with
main (`git merge-base main HEAD` = `4290c6d`), which isolates exactly what this unit changed.

## Capability coverage (each new claim -> its isolating falsification)

All five falsifications below were run in an isolated **temp copy** at
`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/4028b141-b4f9-4793-84a0-f900414a84fb/scratchpad/t004-falsify/`
(outside `D:\vc` entirely — `packages/observability` and `infra/langfuse` copied preserving their
relative layout so the docker-compose guard test's relative path still resolved; `npm install`
run fresh there since pnpm's symlinked `node_modules` doesn't survive a flat copy). Each edit was
applied, the affected test file was run to observe the FAIL, then the file was restored from a
`.bak` copy and the PASS re-confirmed. The worktree's own `packages/observability/src/config.ts`
and `infra/langfuse/docker-compose.yml` were `diff`ed byte-identical against the
pre-falsification originals afterward (both printed `IDENTICAL`) — nothing in the working tree was
touched by this process.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Cloud-host refusal — `loadTracingConfig` throws for any Langfuse Cloud host | `tests/config.test.ts` — 5× "refuses Langfuse Cloud host: `<host>`" | `src/config.ts`: `if (LANGFUSE_CLOUD_HOSTS.has(host)) {` → `if (false && LANGFUSE_CLOUD_HOSTS.has(host)) {` | PASS before: all 5 `✔ refuses Langfuse Cloud host: <host>`, suite `pass 20 / fail 0`. FAIL after: all 5 flip to `✖ refuses Langfuse Cloud host: <host>`, suite `pass 9 / fail 11`, `AssertionError [ERR_ASSERTION]: Missing expected exception.` |
| Disabled-when-no-keys — `loadTracingConfig` returns `{enabled:false}` (never throws) when any of baseUrl/publicKey/secretKey is missing | `tests/config.test.ts` — 4 "disabled when …" tests | `src/config.ts`: `if (baseUrl && publicKey && secretKey) {` → `if (true) {` | PASS before: all 4 `✔ disabled when …`, suite `pass 20 / fail 0`. FAIL after: all 4 flip to `✖ disabled when …`, suite `pass 16 / fail 4`, `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` |
| Telemetry-false guard — both langfuse-web and langfuse-worker set `TELEMETRY_ENABLED: "false"` in the compose file | `tests/docker-compose.test.ts` — "langfuse-web sets TELEMETRY_ENABLED to \"false\"" | `infra/langfuse/docker-compose.yml`: langfuse-web's `TELEMETRY_ENABLED: "false"` → `TELEMETRY_ENABLED: "true"` (single service, single line) | PASS before: `✔ langfuse-web sets TELEMETRY_ENABLED to "false"`, suite `pass 5 / fail 0`. FAIL after: `✖ langfuse-web sets TELEMETRY_ENABLED to "false"`, suite `pass 4 / fail 1`, `AssertionError: langfuse-web.environment.TELEMETRY_ENABLED must be the literal string "false"` |
| License-key guard — no service sets `LANGFUSE_EE_LICENSE_KEY` | `tests/docker-compose.test.ts` — "no service sets LANGFUSE_EE_LICENSE_KEY (OSS edition only, MUST b)" | `infra/langfuse/docker-compose.yml`: added `LANGFUSE_EE_LICENSE_KEY: "falsification-probe"` to langfuse-worker's environment block | PASS before: `✔ no service sets LANGFUSE_EE_LICENSE_KEY …`, suite `pass 5 / fail 0`. FAIL after: `✖ no service sets LANGFUSE_EE_LICENSE_KEY …`, suite `pass 4 / fail 1`, `AssertionError: service "langfuse-worker" must not set LANGFUSE_EE_LICENSE_KEY` |
| 127.0.0.1-binding guard — every published port binds to 127.0.0.1 | `tests/docker-compose.test.ts` — "every published port is bound to 127.0.0.1 (MUST d)" | `infra/langfuse/docker-compose.yml`: langfuse-web's `- "127.0.0.1:3000:3000"` → `- "3000:3000"` | PASS before: `✔ every published port is bound to 127.0.0.1 (MUST d)`, suite `pass 5 / fail 0`. FAIL after: `✖ every published port is bound to 127.0.0.1 (MUST d)`, suite `pass 4 / fail 1`, `AssertionError: service "langfuse-web" port "3000:3000" must include an explicit host IP (HOST_IP:HOST_PORT:CONTAINER_PORT), not just HOST_PORT:CONTAINER_PORT` |

Each falsification broke exactly the named assertion and no unrelated test in the same file went
red alongside it, so each row isolates the rule it claims to cover.

Not claimed as isolated capability rows: `pnpm -r typecheck` (pasted above, exit 0) is the check
that would fail if `TracingConfig`/`CallbackHandler` types didn't line up — a structural claim,
not a single perturbable behaviour. B1–B6, B9, B10 (script guard, cited facts, human-approval
writes, consent, typed boundaries, portable core, crisis routing, draft-only P2) are out of scope
for this unit (no graph, no cards, no Mongo — see UNIT brief) and are not claimed here.

## Live browser evidence
Not UI-touching — this unit is a docker-compose file, an env template, and a backend TS package
with no rendered surface. `packages/engine` (the only place a browser-visible graph could run) is
still a stub; wiring `@vc/observability` into it is explicitly deferred to T-007.

## Fix cycle 1

### Issues addressed (verbatim from `qa/issues.jsonl`)

**ISS-016** (critical, contract-B7):
> Langfuse Cloud refusal bypassed by trailing-dot FQDN: loadTracingConfig({LANGFUSE_BASE_URL:'https://cloud.langfuse.com./v1'}) returns enabled:true (packages/observability/src/config.ts:59-65, exact-match Set lookup) ... fix: normalise host (lowercase, strip trailing dots) before lookup; also refuse any *.langfuse.com subdomain; tests for trailing dot + subdomain

**ISS-017** (critical, contract-B7):
> Tracing is a silent no-op: @langfuse/langchain v5 exports spans only via @langfuse/otel LangfuseSpanProcessor registered on a NodeTracerProvider; neither is installed or registered. callbacks.ts:12-14 comment (keys read by @langfuse/core getEnv) is wrong; README wiring for T-007 repeats the gap ... fix: add @langfuse/otel + @opentelemetry/sdk-trace-node; register provider+processor once (idempotent) with config passed explicitly, not via process.env; fix comment + README; test that a processor is registered when enabled and none when disabled

A prior fix-cycle-1 agent had already applied the ISS-016 fix (config.ts host normalisation +
`.langfuse.com` suffix catch-all) and started `tests/tracing.test.ts`, but was stopped
mid-cycle — that work was UNVERIFIED and UNCOMMITTED when this run picked it up. This run read
`git diff`/`git status` first, confirmed the ISS-016 fix in `config.ts` and the existing
`tests/config.test.ts` ISS-016 assertions were correct and complete as-is (kept unchanged), and
finished ISS-017 plus everything else.

**Mid-cycle contract amendment (commit `485b6ca`, during this same fix cycle):** the checker
tightened B7 ("emit must be proven, not assumed": a captured exported span, hostile-variant host
tests) and added B14 ("outcome, not construction": every integration unit proves its effect end to
end) after reviewing the cycle-0 PASS miss. This run read the amended
`qa/contracts/counselling-engine.md` B7/B14 (main, read-only) and added the outcome test
(`tests/outcome.test.ts`) and three hostile-variant host tests (`tests/config.test.ts`) below to
satisfy it, in addition to the originally-scoped ISS-016/017 work.

### What changed (file:lines against the pre-cycle-1 state)

- `packages/observability/src/config.ts` (`loadTracingConfig`, lines 59-83) — ISS-016 fix (kept
  from the interrupted prior run, verified correct): `host` is now
  `rawHost.toLowerCase().replace(/\.+$/, "")` (strips ALL trailing dots, not just lowercases) and
  the refusal condition is
  `LANGFUSE_CLOUD_HOSTS.has(host) || host === "langfuse.com" || host.endsWith(".langfuse.com")`
  — a catch-all for the bare apex and any subdomain, not just the 5 explicitly-listed Cloud
  hostnames.
- `packages/observability/src/tracing.ts` (**new file**, 96 lines) — ISS-017 fix.
  `initTracing(config, deps?)`: idempotent (module-level `singletonHandle`, set once per process);
  disabled → no-op handle, nothing constructed; enabled → constructs exactly one
  `@langfuse/otel` `LangfuseSpanProcessor` with `publicKey`/`secretKey`/`baseUrl` passed
  EXPLICITLY from `config` (never left to the processor's own env-var/`https://cloud.langfuse.com`
  default — verified against its published `.d.ts`, `baseUrl` defaults to Langfuse Cloud when
  omitted), registers it via `deps.registerProvider` (default: real
  `new NodeTracerProvider({ spanProcessors: [processor] }).register()`, matching the
  `@langfuse/langchain@5.11.1` README Quickstart verbatim). `__resetTracingForTests()` clears the
  singleton for test isolation.
- `packages/observability/src/callbacks.ts` (`createLangfuseCallbacks`, lines 19-31) — removed the
  `process.env.LANGFUSE_BASE_URL`/`PUBLIC_KEY`/`SECRET_KEY` mutation entirely; now calls
  `initTracing(config)` then constructs `new CallbackHandler({})` with no Langfuse config. Fixed
  the wrong comment: `CallbackHandler`'s published `.d.ts` has no Langfuse-credential fields and no
  network client (`startAndRegisterOtelSpan`/`handleOtelSpanEnd` — it only creates OTel spans);
  the old comment's claim that `@langfuse/core`'s `getEnv()` reads those three env vars for the
  handler was never true for this architecture.
- `packages/observability/src/index.ts` — now also exports `{ initTracing }` and the
  `TracingHandle`/`InitTracingDeps` types (named, not `export *` — `tracing.js` also exports the
  test-only `__resetTracingForTests`, kept out of the package's public surface).
- `packages/observability/package.json` — dependencies: `+"@langfuse/otel": "^5.11.1"`,
  `+"@opentelemetry/sdk-trace-node": "^2.11.0"`. devDependencies:
  `+"@opentelemetry/core": "^2.11.0"`, `+"@opentelemetry/sdk-trace-base": "^2.11.0"` (test-only:
  typing the injectable exporter, `ExportResultCode`).
- `packages/observability/README.md` — rewrote the wiring section (`initTracing` at startup +
  `shutdown()` on exit + `createLangfuseCallbacks` per invocation), added an "ISS-017" section
  explaining the silent-no-op history and the fix, a "Why no env vars" section, and the verified
  package-versions section now covers `@langfuse/otel`/`@opentelemetry/sdk-trace-node`/
  `LangfuseSpanProcessorParams`' full shape (including the `baseUrl` Cloud-default trap).
- `packages/observability/tests/tracing.test.ts` (kept from the interrupted prior run, verified
  correct and GREEN as-is) — construction/registration/idempotency tests via an injected
  `registerProvider` spy.
- `packages/observability/tests/callbacks.test.ts` — rewrote the third test (previously asserted
  the OLD env-mutation behaviour, which this cycle removed) to assert `process.env` is untouched
  in the enabled case too (`snapshotLangfuseEnv()` before/after, `deepEqual`).
- `packages/observability/tests/config.test.ts` — added 3 hostile-variant tests per amended B7
  (userinfo, IDN ideographic-full-stop U+3002, IDN fullwidth-full-stop U+FF0E — each verified
  against real Node `URL` parsing behavior before writing the test, not assumed).
- `packages/observability/tests/outcome.test.ts` (**new file**) — B7/B14 outcome tests: a real
  `@langchain/core` `RunnableLambda` invoked through `createLangfuseCallbacks`'s handler, with a
  hand-rolled `RecordingExporter` (`SpanExporter`) injected via `initTracing`'s `deps.exporter`,
  asserts `exporter.exported.length > 0` after `handle.shutdown()`; a second test asserts zero
  spans when disabled. Explicitly NOT `@opentelemetry/sdk-trace-base`'s own `InMemorySpanExporter`
  — verified against its published source that `shutdown()` clears `_finishedSpans` before
  resolving, which would make a post-`handle.shutdown()` read always see `[]` regardless of
  whether export actually happened.
- `pnpm-lock.yaml` — updated by `pnpm install` for the 2 new dependencies + 2 new devDependencies
  above (all `packages/observability`-scoped; diffed to confirm no other importer section
  changed).

### Actual outputs (this run, in the worktree)

**`pnpm install`** — exit 0 (second run, incremental after the devDependency addition):
```
Scope: all 9 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 854ms using pnpm v10.33.0
```

**`pnpm -r typecheck`** — exit 0:
```
Scope: 8 of 9 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/observability typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
TYPECHECK_EXIT=0
```

**`pnpm -r test`** — exit 0. `packages/observability`: 43/43 pass (28 pre-existing + 3 ISS-016
hostile-variant + 4 `tracing.test.ts` + 2 `outcome.test.ts` + the rewritten `callbacks.test.ts`
3rd test, net +15 vs cycle 0's 28). All other packages unchanged (`packages/schemas` 45, 1 each
for the 5 stub packages, `packages/engine` 2) — full run below is the actual paste from this cycle:
```
packages/observability test: ✔ B7/B14: a real traced Runnable invocation exports at least one span (outcome, not construction)
packages/observability test: ✔ B7/B14: a disabled config exports zero spans -- no processor is ever constructed
packages/observability test: ✔ enabled config registers exactly one LangfuseSpanProcessor configured with the given baseUrl
packages/observability test: ✔ calling initTracing twice with the same-shaped enabled config registers exactly once (idempotent)
packages/observability test: ✔ disabled config registers nothing and returns a no-op handle
packages/observability test: ✔ the Langfuse Cloud refusal still applies through the loadTracingConfig -> initTracing pipeline
packages/observability test: ✔ ISS-016 hostile variant: refuses a Langfuse Cloud host with userinfo (user:pass@) in the URL
packages/observability test: ✔ ISS-016 hostile variant: refuses a Langfuse Cloud host written with IDN ideographic-full-stop dots (U+3002)
packages/observability test: ✔ ISS-016 hostile variant: refuses a Langfuse Cloud host written with IDN fullwidth-full-stop dots (U+FF0E)
packages/observability test: ✔ enabled config returns exactly one callback handler and never touches process.env (ISS-017)
packages/observability test: ℹ tests 43
packages/observability test: ℹ pass 43
packages/observability test: ℹ fail 0
```

**`python contracts/verify_contracts.py`** — exit 0:
```
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

**docker compose config validation** — exit 0, no output, using a temp copy of
`infra/langfuse/.env.example` at
`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/4028b141-b4f9-4793-84a0-f900414a84fb/scratchpad/langfuse.env`
(outside `D:\vc`, never committed):
```
docker compose -f infra/langfuse/docker-compose.yml --env-file <temp>/langfuse.env config --quiet
EXIT:0
```

### Capability coverage (ISS-016/017 + B7/B14 amendment — each falsified in an isolated temp copy)

All six falsifications below were run in an isolated **temp copy** at
`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/4028b141-b4f9-4793-84a0-f900414a84fb/scratchpad/t004-cycle1-falsify/`
(outside `D:\vc` — full worktree minus `.git`/`node_modules`/`.worktrees`/`pnpm-lock.yaml`,
`pnpm install` run fresh there — GREEN confirmed first: `tests 43 / pass 43 / fail 0`, matching the
worktree exactly). Each edit was a single hunk, the named test file was run to observe the FAIL,
then the file was reverted in place and the affected suite re-confirmed GREEN before the next
edit. After all six, the full suite was re-run GREEN (`tests 43 / pass 43 / fail 0`) and the
worktree's own `src/config.ts`, `src/tracing.ts`, `src/callbacks.ts`, `src/index.ts` were `diff`ed
byte-identical against the temp copy's post-revert state (all four printed `IDENTICAL`) — nothing
in the working tree was touched by this process.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Trailing-dot refusal (ISS-016) — a trailing DNS-root dot can't bypass the Cloud-host refusal | `tests/config.test.ts` — "ISS-016: refuses a Langfuse Cloud host with a single trailing DNS-root dot" | `src/config.ts`: `rawHost.toLowerCase().replace(/\.+$/, "")` → `rawHost.toLowerCase()` (dot-stripping removed) | PASS before: `tests 43 / pass 43`. FAIL after: `✖ ISS-016: refuses a Langfuse Cloud host with a single trailing DNS-root dot`, `tests 29 / pass 26 / fail 3`, `AssertionError [ERR_ASSERTION]: Missing expected exception.` (3 tests broke: single dot, double dot, uppercase+dot — all depend on the same normalisation line) |
| `*.langfuse.com` catch-all (ISS-016) — any subdomain or the bare apex is refused, not just the 5 explicitly-listed Cloud hostnames | `tests/config.test.ts` — "refuses an arbitrary *.langfuse.com subdomain" + "refuses the bare apex host langfuse.com" | `src/config.ts`: `LANGFUSE_CLOUD_HOSTS.has(host) \|\| host === "langfuse.com" \|\| host.endsWith(".langfuse.com")` → `LANGFUSE_CLOUD_HOSTS.has(host)` | PASS before: `tests 43 / pass 43`. FAIL after: both named tests `✖`, `tests 29 / pass 27 / fail 2`, `AssertionError [ERR_ASSERTION]: Missing expected exception.` — no other test broke |
| Processor registered when enabled (ISS-017) — `initTracing` actually attaches the `LangfuseSpanProcessor` to a tracer provider | `tests/tracing.test.ts` — "enabled config registers exactly one LangfuseSpanProcessor" | `src/tracing.ts`: commented out the `registerProvider(processor);` call | PASS before: `tests 6 / pass 6` (tracing.test.ts + outcome.test.ts together). FAIL after: `tests 6 / pass 3 / fail 3` — the named test (`AssertionError: expected exactly one processor registered`), the idempotency test (`registerProvider must only run on the first call`), and (cascading, as expected) the outcome test (`expected at least one span to reach the exporter, got 0`) |
| Idempotent init (ISS-017) — a second `initTracing` call never re-registers | `tests/tracing.test.ts` — "calling initTracing twice ... registers exactly once (idempotent)" | `src/tracing.ts`: removed the `if (singletonHandle) { return singletonHandle; }` guard (isolated from the registration call itself) | PASS before: `tests 6 / pass 6`. FAIL after: only the named test `✖`, `tests 6 / pass 5 / fail 1`, `AssertionError: registerProvider must only run on the first call` — registration and outcome tests stayed green, proving this edit isolates idempotency alone |
| No `process.env` mutation (ISS-017) — `createLangfuseCallbacks` never writes Langfuse env vars | `tests/callbacks.test.ts` — "enabled config returns exactly one callback handler and never touches process.env (ISS-017)" | `src/callbacks.ts`: reintroduced `if (config.baseUrl) process.env.LANGFUSE_BASE_URL = config.baseUrl;` before `initTracing(config)` | PASS before: `tests 43 / pass 43`. FAIL after: `✖ ... never touches process.env (ISS-017)`, `tests 3 / pass 2 / fail 1` (file-scoped run), `AssertionError: createLangfuseCallbacks must resolve Langfuse config explicitly, never via process.env` |
| B7/B14 outcome — a real traced Runnable invocation must reach the configured exporter (not just construct a processor) | `tests/outcome.test.ts` — "a real traced Runnable invocation exports at least one span" | `src/tracing.ts`: dropped `exporter: deps.exporter` from the `LangfuseSpanProcessor` constructor call (commented out) | PASS before: `tests 2 / pass 2`. FAIL after: the processor fell back to its real default OTLP exporter and made an actual HTTP call to `localhost:3000` — `Error [OTLPExporterError]: Not Found` (code 404, hit an unrelated local dev server) — proving the injected exporter is what keeps this test offline and deterministic, and that its absence is observable, not silent |

Cycle-0's 5 docker-compose/cloud-host falsification rows are unchanged and not re-run here (no
code they cover changed this cycle).

### Not done / deferred
- The `ISS-t-004-langfuse-1` low-severity issue (a hand-constructed `TracingConfig` could bypass
  `loadTracingConfig`'s refusal) is explicitly noted in `qa/issues.jsonl` as "not a blocker on this
  unit; re-check at T-007 wiring time" — left open, not addressed this cycle, per that issue's own
  scope note.
- No checker dispatched (per this fix-cycle brief — maker never dispatches its own checker).

## Status: checked-PASS — qa/verdicts/t-004-langfuse.md (Cycle checked: 1, commit f318306)
