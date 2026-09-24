# Manifest — t-004-langfuse
**Contract:** qa/contracts/counselling-engine.md B7/B8
**Goal task:** T-004
**Date:** 2026-09-25
**Fix cycle:** 0
**Dual check:** no
**Issues addressed:** none
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

## Status: ready-for-check
