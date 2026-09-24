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

---

## INDEPENDENT CONCURRENT CHECK
**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh Claude Sonnet subagent (Mode A, dispatched with an explicit brief naming this
same verdict path — landed after the check above, same slug + cycle already had a verdict on
disk). Per checker protocol this is appended, not overwritten; the verdict above is left
byte-intact.

**Self-correction note:** an earlier draft of this section (briefly present in this same working
session, never committed) concurred with the PASS above before I had read `qa/issues.jsonl` /
`qa/QUEUE.md` for this unit. Doing so afterward surfaced two CRITICAL, currently-open findings
(`ISS-016`, `ISS-017`, filed the same day by a `senior-software-engineer` review, explicitly
noting they were "missed by t-004 checker cycle 0 PASS 2cce7ca") against this exact unit's B7
claim. I independently reproduced both before finalizing anything below. Per the hard rule "never
soften a criterion to pass a failing artifact," the corrected verdict is **FAIL**, not PASS. No
verdict claiming PASS from this session was ever committed.

**Note on binding:** my session's stated primary working directory at dispatch was a sibling
worktree (`t-002b-schema-hardening`); the dispatch explicitly pinned this unit to
`D:\vc\.worktrees\t-004-langfuse`, so every command below ran with an absolute path or `git -C`
against that worktree, never against the session's default cwd.

### What I re-ran myself (independently, own throwaway copies)
- `pnpm install` -> exit 0, "Already up to date". `pnpm -r typecheck` -> exit 0, all 8 packages
  incl. `packages/observability`. `pnpm -r test` -> exit 0, 48/48 (14 + 4x1 + 28), same 28
  observability test names as the manifest. `python contracts/verify_contracts.py` -> exit 0,
  "PASS by vacuity". `docker compose -f infra/langfuse/docker-compose.yml --env-file <temp copy
  of .env.example, placed OUTSIDE the worktree under my scratchpad, dummy values only> config
  --quiet` -> exit 0, no output (validate only, never `up`).
- `git -C <worktree> diff 4290c6d b60233d --stat` (merge-base = branch point, confirmed via
  `git merge-base main HEAD`) -> 15 files, all `A` except `M pnpm-lock.yaml`; `--name-status`
  confirms zero deletions/modifications to any pre-existing file. `git status --short` in the
  worktree is clean before and after my whole check.
- Grepped `git log -p 4290c6d..b60233d` for `sk-lf-`/`pk-lf-`/long base64-ish strings: only hits
  are the test fixtures `pk-lf-test`/`sk-lf-test` in the new test files. `git log --all
  --diff-filter=A --name-only -- infra/langfuse/.env` and `git log --all -- infra/langfuse/.env`
  both empty — `.env` was never committed on this branch or any other ref.
- Fetched https://langfuse.com/security/data-regions: confirms the 4 real Cloud hostnames
  (`cloud.langfuse.com` EU, `us.cloud.langfuse.com`, `jp.cloud.langfuse.com`,
  `hipaa.cloud.langfuse.com`); `config.ts`'s defensive extra entry `eu.cloud.langfuse.com` is
  explicitly flagged in its own comment as defensive-only, not a misrepresentation.
- Read the installed `@langfuse/langchain@5.11.1` and `@langfuse/core@5.11.1` `.d.ts` files
  directly: `CallbackHandler`'s `ConstructorParams` is exactly `{userId?, sessionId?, tags?,
  version?, traceMetadata?}` (no baseUrl/publicKey/secretKey), and `@langfuse/core`'s
  `LangfuseEnvVar` union includes exactly `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` /
  `LANGFUSE_BASE_URL` (+ `LANGFUSE_BASEURL` alias). `callbacks.ts`'s doc-comment claim about why
  it sets three env vars is accurate against the real shipped types, not just asserted.

### Capability coverage — reproduced independently, 5/5
Built 5 separate throwaway copies (one per row, per protocol: `<scratch>/row1..row5`) outside
`D:\vc`, each with only `packages/observability/{src,tests,package.json,tsconfig.json}` and
`infra/langfuse/docker-compose.yml` copied (pnpm's per-package `node_modules` symlinks excluded),
`npm install`ed fresh in each. Every copy ran GREEN before its edit (20/20 for the two
`config.test.ts` copies, 5/5 for the three `docker-compose.test.ts` copies), then took exactly the
single-hunk edit the manifest names in its own file, and went RED after with only the named
assertion(s) failing in each case — identical pass/fail counts and failure messages to both the
manifest's own run and the first verdict above (cloud-host refusal 9/20 pass; disabled-when-no-keys
16/20; telemetry-false 4/5 with langfuse-worker's copy staying green; license-key 4/5; port-binding
4/5). No collateral test flipped in any row. The worktree itself was never touched (`git status
--short` clean throughout).

### B8 / B11 — MET (unaffected by the findings below)
Independently confirmed no Mongo code touched, no student data in the tree, `pnpm -r test` fully
offline; `.env` never tracked, `.env.example` holding only `CHANGE_ME`-family placeholders, no
secret-shaped literal anywhere in the diff or commit history.

### B7 — FAILS. Two critical, independently-reproduced defects (ISS-016, ISS-017)

**ISS-016 — cloud-host refusal has a live bypass.** `loadTracingConfig`'s `LANGFUSE_CLOUD_HOSTS.has(host)`
is an exact-string Set lookup against the parsed `URL(...).hostname`. I reproduced the bypass myself
in a clean scratch copy of the unmodified `src/config.ts` (never touched the bound worktree — see
"How I probed" below):
```
LANGFUSE_BASE_URL="https://cloud.langfuse.com./v1"   -> {"enabled":true,...}   (should throw)
LANGFUSE_BASE_URL="https://cloud.langfuse.com."       -> {"enabled":true,...}   (should throw)
LANGFUSE_BASE_URL="https://sub.cloud.langfuse.com/v1" -> {"enabled":true,...}   (should throw)
LANGFUSE_BASE_URL="https://CLOUD.LANGFUSE.COM/v1"     -> throws (case-insensitivity IS handled: `.toLowerCase()` at config.ts:59)
```
A trailing-dot FQDN (`cloud.langfuse.com.`, valid DNS syntax meaning the exact same host) and any
subdomain of a listed cloud host (`sub.cloud.langfuse.com`) both sail through as `enabled: true`,
which per `callbacks.ts` gets written straight into `process.env.LANGFUSE_BASE_URL` for
`@langfuse/core` to connect to — i.e. a real path to sending traces (which "carry full prompts and
student transcripts" per this same file's own docstring) to Langfuse Cloud, the exact thing B7 and
standard rule 5 MUST (c) forbid "no exceptions." The capability-coverage table in both this
manifest and both verdicts only exercises the 5 exact listed hostnames — it never tests an evasion
variant, so a suite that is 100% green proves nothing about this bypass class.

**ISS-017 — tracing is a silent no-op as wired.** `@langfuse/langchain@5.11.1`'s own README (read
directly from the installed package, `node_modules/.pnpm/@langfuse+langchain@5.11.1.../README.md`):
*"Spans are exported by the `LangfuseSpanProcessor` from `@langfuse/otel`"*, and its Quickstart
requires registering `new NodeTracerProvider({ spanProcessors: [new LangfuseSpanProcessor()] }).register()`
once at startup before any `CallbackHandler` produces an exported trace. `@langfuse/otel` is not a
dependency of `packages/observability` and is not installed anywhere in this tree (confirmed:
`node_modules/.pnpm` has no `@langfuse+otel` entry at all), and `callbacks.ts` never registers a
`NodeTracerProvider`. So even when `loadTracingConfig` correctly returns `enabled: true` and
`createLangfuseCallbacks` constructs a real `CallbackHandler`, no span reaches even our own
self-hosted Langfuse instance — B7's affirmative half ("Graph runs emit Langfuse traces to a
self-hosted endpoint") is not actually implemented yet, only the refusal half was attempted. This
is a completeness gap the manifest's own "Not claimed as isolated capability rows" section does not
disclose — it says B1-B6/B9/B10 are out of scope but never flags that trace emission itself is
unimplemented, and B7 is the one criterion this unit *does* claim.

**How I probed (read-only toward the worktree):** I initially, in error, wrote a probe script
directly into the bound worktree (`packages/observability/_checker_probe_iss016.mjs`) — caught
this immediately, deleted it before running anything (`git status --short` confirms the worktree
was clean again before any command ran against it), and re-ran the same probe correctly in a fresh
scratch copy of `src/config.ts` outside `D:\vc`, importing via a relative path inside that copy.
The worktree itself was never executed against in a way that could have left a trace of the
mistake; `git status --short` on the worktree shows only this verdict file as modified, now and
throughout.

### Disagreement with the verdict above (named, per protocol)
**Overall verdict:** the first verdict above is PASS; this one is FAIL, on new evidence (ISS-016,
ISS-017) that postdates the first verdict and was not available to it — not a re-judgment of the
same facts. Both checks agree B8 and B11 are MET and the capability-coverage rows reproduce
cleanly; they disagree only on whether B7 is fully met, and this check found it is not.

The first verdict's B11 section also states: *"the root `.gitignore` I read already carries
`!.env.example` / `!**/.env.example` negation lines, so the force-add was unnecessary"* — **this is
factually wrong.** I read the root `.gitignore` directly; it is 8 lines with no negation pattern at
all:
```
node_modules/
dist/
.next/
.env
.env.*
.worktrees/
*.log
.claude/scheduled_tasks.lock
```
`git check-ignore -v --no-index infra/langfuse/.env.example` confirms `.gitignore:5:.env.*` DOES
match the file (exit 0) — `.env.*` glob-matches `.env.example`. `git check-ignore` without
`--no-index` reports it as not-ignored only because the file is already tracked (documented git
behavior: tracked paths are reported as not-ignored unless `--no-index` is passed), which is what
produced the first verdict's false reading. **The manifest's own account was correct**: an
unforced `git add infra/langfuse/.env.example` would have been silently skipped by git under
`.env.*`, so `git add -f` was in fact necessary. This does not change B11's MET status — `.env.example`
is tracked with placeholders-only content either way — but the first verdict's stated reason for
disagreeing with the manifest should not be relied on.

### New finding (low severity, informational for T-007)
`createLangfuseCallbacks(config)` (`packages/observability/src/callbacks.ts:19-26`) trusts any
`TracingConfig` object passed to it and re-applies `config.baseUrl` to `process.env` without
re-checking it against the Langfuse Cloud host list. `TracingConfig` (`config.ts:10-15`) is a
plain exported interface, not a branded/opaque type, so nothing at the type or runtime level stops
a future call site from constructing one directly (e.g. `{enabled: true, baseUrl:
"https://cloud.langfuse.com", ...}`) and bypassing `loadTracingConfig`'s cloud-host refusal
entirely. Not exploitable today — nothing in this unit calls `createLangfuseCallbacks` outside its
own tests, and wiring into `packages/engine` is explicitly deferred to T-007 — but worth the T-007
checker re-verifying that every real call site constructs its config exclusively via
`loadTracingConfig()`. Filed as `ISS-t-004-langfuse-1`, not a blocker on this unit.

```
VERDICT: FAIL
SCOREBOARD: 2/3 criteria met (B8, B11 met; B7 fails), 0/0 invariants scored (B1-B6/B9/B10/B12/B13 out of scope, correctly disclosed)
FAILURES (if any):
- [B7] sev: critical · cloud-host refusal bypassed by a trailing-dot FQDN or any subdomain of a listed cloud host (`config.ts:65`, exact-string Set lookup) · normalise the host (strip trailing dots, and/or refuse any `*.langfuse.com` suffix, not just the 5 exact names) before the Set check; add tests for trailing-dot and subdomain variants · issue: ISS-016
- [B7] sev: critical · tracing is a silent no-op as wired: `@langfuse/otel`'s `LangfuseSpanProcessor` + a registered `NodeTracerProvider` are required for any span to actually export, and neither is installed or registered anywhere in this unit · add `@langfuse/otel` + `@opentelemetry/sdk-trace-node`, register the provider once at startup, and add a test that a processor is registered when enabled / none when disabled · issue: ISS-017
CAPABILITY-COVERAGE: 5/5 rows reproduced (own throwaway copies, one per row, all isolate the named assertion) — reproduction is sound, but the covered set (5 exact hostnames) does not include the bypass class in ISS-016, so a green suite does not evidence B7
LIVE-BROWSER: not-applicable (infra/langfuse/*, packages/observability/* — no rendered surface)
ISSUES-WRITTEN: ISS-t-004-langfuse-1 (low, informational — TracingConfig is unbranded and trusts its caller; distinct mechanism from ISS-016, not a blocker on its own). ISS-016 and ISS-017 already existed (filed by a senior-software-engineer review before this check) and are independently corroborated here, not newly filed.
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: B8 and B11 are independently confirmed MET, and all 5 capability-coverage rows
reproduce cleanly in fresh, isolated copies. B7 fails on two independently-reproduced critical
defects already on the ledger as ISS-016 (cloud-host refusal bypassable via a trailing dot or any
cloud-host subdomain) and ISS-017 (no span processor is installed or registered, so even a
correctly-refused/enabled config never actually emits a trace) — both confirmed against the real
installed package sources/README, not just asserted. One factual correction to the first verdict's
B11 narrative is recorded above (the root .gitignore has no .env.example negation; the manifest's
`git add -f` was in fact necessary) — cosmetic, does not change B11's MET status. This FAIL
corroborates, rather than contradicts, the project's own `qa/issues.jsonl`/`qa/QUEUE.md` state,
which already shows T-004 reopened over these same two issues.
```
