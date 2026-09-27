# Verdict: t-025-api-jwt-tenant

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (Sonnet, Anthropic session; no `ANTHROPIC_BASE_URL` override)
**Bound root:** `D:/vc/.worktrees/t-025-api-jwt-tenant` (branch `wave/t-025-api-jwt-tenant`, HEAD `ceb693a`)
**Contract:** `qa/contracts/counselling-engine.md` B21 (incl. `9f13acc` placeholder-issuer amendment), B2/B4/B8/B11/B12/B13/B14/B15/B20
**Manifest:** `qa/manifests/t-025-api-jwt-tenant.md`, Fix cycle 0

## What I re-ran myself (never trusted the manifest's pasted output)

All through the machine-wide test lock (`vc-testlock.sh`), one package at a time:

| Command | My result | Manifest claimed | Match |
|---|---|---|---|
| `pnpm --filter @vc/api test` | 36 pass / 0 fail | 36/36 | yes |
| `pnpm --filter @vc/api typecheck` | clean | clean | yes |
| `pnpm --filter @vc/db test` | 233 pass / 0 fail | 233/233 | yes |
| `pnpm --filter @vc/db typecheck` | clean | clean | yes |
| `pnpm --filter @vc/engine test` | 327 pass / 0 fail | 327/327 | yes |
| `pnpm --filter @vc/engine typecheck` | clean (3 tsc invocations) | clean | yes |
| `python contracts/verify_contracts.py` | "no frozen contracts yet — PASS by vacuity" | same | yes |

## Capability coverage — independently falsified (3 of 8 rows, my own throwaway worktree)

Worktree: `git worktree add <scratch> ceb693a --detach` + `pnpm install --offline`, outside the bound root, removed after (git metadata removed cleanly; a few long-path node_modules leaves were left by Windows MAX_PATH, not a bound-root concern).

| Row | Edit (single file, as named in manifest) | GREEN-before (my run) | RED-after (my run) |
|---|---|---|---|
| F1 (issuer checked) | `auth.ts`: commented out `issuer: config.issuer` in `verifyOptions` | `@vc/api test`: 36/36 pass, both named tests ✔ | `@vc/api test`: 33/36 pass, both named tests ✖ |
| F4 / F4b (tenant filter + legacy refusal) | `tenant.ts` `scopeFilter`: dropped `[TENANT_FIELD]: tenantId` from the returned filter | `@vc/db test`: 233/233 (legacy-rule test ✔); `@vc/api test`: 36/36 (cross-tenant test ✔) | `@vc/db test`: 225/233, legacy-rule test ✖; `@vc/api test`: 33/36, cross-tenant test ✖ |
| F6 (unique index leads with tenantId) | `db-init.ts` `INDEX_PLAN`: facts unique index keys `{studentId, key}` (dropped `tenantId`) | `@vc/db test`: 233/233, both named tests ✔ | `@vc/db test`: 229/233, both named tests ✖ |

Each row's own file was reverted before moving to the next (confirmed by a full-suite GREEN back to 233/233 between F4 and F6). Every falsifying edit was the single-hunk change the manifest named — nothing else was touched, no shell command was accepted as an edit.

**CAPABILITY-COVERAGE: 3/8 rows reproduced (F1, F4/F4b, F6); remaining 5 (F2, F2b, F3, F5, F7, F8) rest on the maker's own pasted falsification log, not independently re-run this cycle — acceptable under the "at least 3" floor, not a gap.**

## Diff-scope check (git diff, step 4c)

- This attempt's own diff (`c764569..HEAD`): `.env.example` (+3), `apps/api/tests/auth.test.ts` (+67), `apps/api/tests/server.test.ts` (+48), `qa/manifests/t-025-api-jwt-tenant.md` (+180) — matches "This attempt" in the manifest exactly, nothing else touched.
- The unit's implementation commit `67c3cfa` touches exactly the files the manifest's "Implementation" list names (`apps/api/src/{auth,server,openapi,index}.ts`, `packages/db/src/{tenant,client,erasure,facts,index}.ts`, `packages/db/scripts/db-init.ts`, test files, `.env.example`, `apps/api/package.json`, `pnpm-lock.yaml`) — no deletions of existing functions/exports/tests found.
- `packages/engine/src/scribe/nodes.ts` shows in the wider `6bc395f..HEAD` diff only because that range includes the merge of `main` (T-022's own, already-PASSed changes) — confirmed this unit's 3 own commits (`67c3cfa`, `9260af8`, `881edf8`) never touch it.
- `apps/web`, `mcp/university-kb`, `packages/providers` — zero diff across the whole range. Declared "Not touched" list holds.

## B11 (secrets) re-verified directly

- `git grep` for `BEGIN RSA/EC/PRIVATE KEY` across the tree found nothing tracked; the only source hit is the test file itself, which uses `generateKeyPairSync` (in-memory, never written to disk or committed).
- `.env.example` lists `VC_JWT_*` names with empty values only.
- B21's placeholder-issuer amendment (`umesh`, config-only) is enforced by `jwtConfigFromEnv`, which reads the issuer only from `VC_JWT_ISSUER` with no default — confirmed by reading `apps/api/src/auth.ts` directly, not just by the passing test.

## Ledger

No open issue in `qa/issues.jsonl` blocks this unit. `ISS-065` (goal-coverage-untagged, sweep-level, unrelated) and `ISS-t-027-rev-3` (owned by the future T-027 Mongo-outbox unit, not this one) are the only T-025-adjacent rows; neither is a T-025 defect. No new issues found — none written.

## Live-browser / persona / scenario gates

- **LIVE-BROWSER: not-applicable** — changed paths are `apps/api/**`, `packages/db/**`, `.env.example`; `apps/web` is untouched (confirmed above by diff, not by the manifest's say-so).
- **Persona walk:** the manifest carries no `Persona walk:` line (field added 2026-09-26; this is a low-severity gap in manifest hygiene, not a functional finding) — but the unit is a pure backend HTTP/JWT/tenancy change with zero UI surface, so a walk would have nothing to walk; recorded as a note, not a FAILURE.
- **B19 scenario matrix:** not run — this is not a UI-touching unit, so B19's "every UI-touching unit and release" trigger does not apply; correctly out of scope this cycle.

## Judgment

Every claim in the manifest's capability-coverage table that I could re-derive, I re-derived, on evidence I produced myself: same test/typecheck counts, the T-022 merge gap resolved with no code change (confirmed by reading `tenant.ts`'s `updateOne` path, which already carries `tenantId` through `scopeUpdate`/`scopeFilter`), the B21 placeholder-issuer amendment implemented and tested exactly as the contract now reads, and three of eight falsification rows independently reproduced GREEN-before/RED-after with no surviving mutants. Diff scope holds — nothing outside the declared files changed, nothing pre-existing was deleted. No secrets, no private key, no hard-coded issuer.

```
VERDICT: PASS
SCOREBOARD: 7/7 verify commands reproduced clean, 3/3 open-question criteria for this unit held (B21 auth/tenancy/placeholder-issuer, T-022 merge gap, B11 no committed key)
FAILURES (if any):
- none at >80% confidence
CAPABILITY-COVERAGE: 3/8 rows reproduced (F1, F4/F4b, F6) — GREEN-before/RED-after on my own throwaway worktree; remaining 5 rest on the maker's pasted log
LIVE-BROWSER: not-applicable (changed paths: apps/api/**, packages/db/**, .env.example — apps/web untouched)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (maker) (checker: claude-sonnet-subagent)
EXPLANATION: All 7 verify commands reproduced with identical pass/fail counts to the manifest, run myself through the shared test lock. Three falsification rows (issuer check, tenant query filter, tenant-led unique index) were independently reproduced GREEN-before/RED-after in a scratch worktree outside the bound root. Diff-scope review confirmed the unit touched only its declared files and deleted nothing pre-existing; B11 secrets hygiene (no committed private key, issuer from .env only) was verified by direct source read, not just test output. The unit is API-only (no apps/web diff), so Mode D and B19 do not apply this cycle; the manifest's missing "Persona walk:" line is a minor hygiene gap, not a functional defect, given there is no UI surface to walk.
```
