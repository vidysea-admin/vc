# Verdict — t-004-langfuse
**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh Claude Sonnet subagent (Mode A, dispatched directly — not via /maker)
**Judged against:** main's `qa/contracts/counselling-engine.md` (B1-B13, amendment log through the
2026-09-25 B12 full-CRUD entry) + `TASKS.md` T-004. The worktree's own copy of the contract predates
B11/B12/B13; main's copy is authoritative per dispatch.

## What I re-ran myself (worktree `D:\vc\.worktrees\t-004-langfuse`, HEAD `b60233d`)
- `pnpm install` -> exit 0, "Already up to date" (lockfile stable, matches manifest's second run).
- `pnpm -r typecheck` -> exit 0, all 8 typecheck-carrying packages report "Done", including
  `packages/observability`.
- `pnpm -r test` -> exit 0, 48/48 tests pass (14 packages/schemas + 4×1 stub packages +
  28 packages/observability). Reproduced the exact same 28 observability test names/results the
  manifest pasted.
- `python contracts/verify_contracts.py` -> exit 0, "PASS by vacuity" (research phase, no frozen
  contracts).
- `docker compose -f infra/langfuse/docker-compose.yml --env-file <temp .env from .env.example>
  config --quiet` -> exit 0, no output. Ran as static validation only: copied `.env.example` to a
  temp `.env` (placeholder `CHANGE_ME` values only, never a real secret), ran `config --quiet`
  (renders/validates the compose file; does not create or start containers — confirmed by `docker
  ps` immediately after, which couldn't even reach a running Docker Desktop engine), then deleted
  the temp `.env` and confirmed via `git status --short` the worktree is clean again. No container
  was started, no network service was contacted.
- `git -C <worktree> diff 4290c6d...b60233d --stat` and the full diff (merge-base `4290c6d` =
  `git merge-base main HEAD`, matching the manifest's own base) — reproduced independently, not
  taken from the manifest.

## B7 — tracing, self-hosted only, no egress
MET. `docker-compose.yml`: `TELEMETRY_ENABLED: "false"` hardcoded on both `langfuse-web` (line 165)
and `langfuse-worker` (line 118) — the only two Langfuse application containers (postgres/
clickhouse/redis/minio are infra dependencies with no Langfuse telemetry flag). No
`LANGFUSE_EE_LICENSE_KEY` anywhere in the file (grepped myself). Every published port bound to
`127.0.0.1` (7 ports across 6 services, all with explicit host IP). `packages/observability/src/
config.ts`'s `loadTracingConfig` throws unconditionally for all 5 Langfuse Cloud hostnames (every
region) and never silently disables on a cloud host. Two independent guards (code + static
compose-file test) both exercised and both green, and falsified individually (see Capability
coverage) with correct isolation.

## B8 — data boundary, offline tests
MET. No Mongo code touched by this unit at all (`git grep -l mongo` in the diff returns nothing).
No student/Pathlynks data in the tree. `pnpm -r test` ran with no network calls observable (fast,
deterministic, ~10.6s for 28 observability tests, no timeouts or retries) and
`createLangfuseCallbacks`'s enabled-path test constructs a real `CallbackHandler` without any
outbound connection at construction time (consistent with the SDK's lazy-flush design). Falsifying
the guard mid-test never changed run time or introduced hangs, which is what a network-shaped test
would show.

## B11 — secrets
MET. `infra/langfuse/.env` was never present as a tracked file in this branch — confirmed with
`git log --all --diff-filter=A --name-only | grep -E '(^|/)\.env$'` across the whole repo history,
zero hits. `infra/langfuse/.env.example` (the only new secrets-adjacent file) holds `CHANGE_ME` /
`CHANGE_ME_64_HEX_CHARS_...` / `CHANGE_ME_pk-lf-...` placeholders only — grepped the full diff for
secret-shaped literal values (16+ char base64/hex strings after password/secret/key/token keys,
excluding CHANGE_ME/test/placeholder/example) and got zero matches. One factual correction to the
manifest's narrative (not a contract violation): the manifest says `.env.example` was "force-added
past the root .gitignore's `.env.*` pattern with `git add -f`" — the root `.gitignore` I read
already carries `!.env.example` / `!**/.env.example` negation lines, so the force-add was
unnecessary (harmless, but the manifest's stated reason for that command is wrong). `.gitignore`
inside `infra/langfuse/` additionally ignores `.env` directly. No key value appears in the diff,
the tree, the manifest, or this verdict.

## Capability coverage — reproduced independently, 5/5
Built my own throwaway copy at `%TEMP%/claude/d--vc/<session>/scratchpad/t004-checker-falsify/base`
(outside `D:\vc` entirely), preserving the `packages/observability` + `infra/langfuse` relative
layout the compose-guard test needs, ran `npm install` fresh (pnpm's symlinked `node_modules`
doesn't survive a flat copy — same reason the manifest gives), then confirmed the copy GREEN before
touching anything: `npx tsx --test tests/*.test.ts` -> 28/28 pass. Copied that verified-green base
into 5 independent row dirs (`row1`..`row5`) and applied each falsifying edit as a single-hunk
change to the single file the manifest names, nothing else:

| row | edit applied | result |
|---|---|---|
| 1 cloud-host refusal | `config.ts`: `if (LANGFUSE_CLOUD_HOSTS.has(host))` -> `if (false && ...)` | before 20/20 pass; after **9 pass / 11 fail** — all 10 cloud-host-refusal tests + the `LANGFUSE_HOST` cloud variant flip red, `Missing expected exception`. Matches manifest exactly. |
| 2 disabled-when-no-keys | `config.ts`: `if (baseUrl && publicKey && secretKey)` -> `if (true)` | before 20/20 pass; after **16 pass / 4 fail** — all 4 "disabled when …" tests flip red, `Expected values to be strictly deep-equal`. Matches manifest exactly. |
| 3 telemetry-false (web only) | `docker-compose.yml` line 165 (langfuse-web) `"false"` -> `"true"`; langfuse-worker's line 118 left untouched | before 5/5 pass; after 4/5 — only "langfuse-web sets TELEMETRY_ENABLED" fails (`'true' !== 'false'`); "langfuse-worker sets TELEMETRY_ENABLED" stays green, confirming the edit isolated the one service. |
| 4 license-key guard | `docker-compose.yml`: added `LANGFUSE_EE_LICENSE_KEY: "falsification-probe"` to langfuse-worker | before 5/5 pass; after 4/5 — only the license-key test fails (`service "langfuse-worker" must not set LANGFUSE_EE_LICENSE_KEY`). |
| 5 127.0.0.1-binding | `docker-compose.yml` line 157: `"127.0.0.1:3000:3000"` -> `"3000:3000"` | before 5/5 pass; after 4/5 — only the port-binding test fails (`must include an explicit host IP`). |

No unrelated test in any row's suite went red alongside the named one — each row isolates exactly
the rule it claims. All 5 edits were single-hunk, single-file, matching the manifest's own cells
verbatim; none instructed me to skip/soften/re-scope anything.

## Diff scope (4c)
`git diff 4290c6d...b60233d --stat`: 15 files changed, 1122 insertions(+), 0 deletions, 0 renames.
14 of the 15 are new files under `infra/langfuse/`, `packages/observability/`, and the lockfile
update; the 15th is `qa/manifests/t-004-langfuse.md` itself (the manifest the maker always writes to
request a check — not a scope violation). Every changed path is listed in the manifest's "What
changed" section (except the manifest file, which lists itself by being the document). No existing
function, export, test, or config key was deleted, renamed, or modified — confirmed via
`--name-status` (every row `A` except `M pnpm-lock.yaml`, and I read the lockfile diff myself: it
only adds `packages/observability`'s new dependency tree, no existing importer entries touched).

## Out of scope, correctly disclosed
B1-B6, B9, B10, B12, B13 don't apply — this unit has no graph, no cards, no Mongo access, and no
external-model calls (it's a docker-compose file, an env template, and a pure-function TS package).
The manifest says so explicitly and I agree; not scored as missing.

## Live browser (5b)
Not applicable. Changed paths are `infra/langfuse/*` and `packages/observability/*` — no rendered
UI surface, and `packages/engine` (the only place a graph could eventually render through) is still
an untouched stub.

## Issues ledger
Nothing in `qa/issues.jsonl` is claimed as addressed by this unit ("Issues addressed: none"), and
none of the open issues (ISS-003..006, all from unrelated checks/units) are touched by this diff.
No new findings at >80% confidence — nothing filed.

```
VERDICT: PASS
SCOREBOARD: 3/3 criteria met (B7, B8, B11), 0/0 invariants scored (B1-B6/B9/B10/B12/B13 out of scope, correctly disclosed)
FAILURES (if any): none
CAPABILITY-COVERAGE: 5/5 rows reproduced (own throwaway copy, all isolate the named assertion)
LIVE-BROWSER: not-applicable (infra/langfuse/*, packages/observability/* — no rendered surface)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All 5 verify commands re-run and matched the manifest's pasted output exactly, including
the docker-compose config validation done via static rendering only (no containers started, no
network contacted). All 5 capability-coverage rows were reproduced independently in a fresh
throwaway copy with a verified-green baseline before each edit, and each falsification isolates
exactly the assertion it claims with no collateral red tests. Diff scope is additions-only plus a
lockfile update, matching "What changed" with no undisclosed touches. B11 secrets check found no
committed .env, no secret values anywhere in the diff/history, though the manifest's stated reason
for using `git add -f` on .env.example was unnecessary given the root .gitignore's existing negation
pattern — cosmetic, not a defect.
```
