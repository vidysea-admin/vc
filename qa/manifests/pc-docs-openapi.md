# Manifest — pc-docs-openapi
**Contract:** docs/features/partner-chatbot/spec.md section pc-docs-openapi, criteria D1 D2 (verbatim; also qa/contracts/partner-chatbot.md); brief qa/evidence/p1-briefs/pc-docs-openapi-c0.md. Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Dual check:** no (documents the auth scheme but changes no auth logic: no code path that checks, stores or grants a key is touched; dual-trigger not applicable)
**Persona walk:** skip (api/docs)
**Live browser:** Not UI-touching
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-docs-openapi, branch wave/pc-docs-openapi, base 21f8c73 = main with pc-widget merged + wave/pc-partner-keys cfb70c3 merged).

## What changed
- apps/api/src/openapi.ts: `PARTNER_OPENAPI` is now a real OpenAPI 3.1 document (was the alias `= STUDENT_API_DRAFT`). Paths: GET /v1/partner/openapi.json; POST /v1/public/chat/turns (page key); the five student chat routes (server key + X-VC-Student-Id/-Age/-Guardian-Consent). Security schemes `pageKey` (apiKey, header X-VC-Key) and `serverKey` (http bearer). Errors 400/401/404/409/413/429 (Retry-After required)/500/503 as the code returns them (public route bodies carry the Tele-MANAS helpline, `AnonymousError`). Limits as `x-rate-limit` (anonymous 10/min per partner+client, crisis exempt; student 30/min) and in info.description, with the 60 s rotate/revoke bound and crisis behaviour. Voice: `x-voice: {status: "coming with pc-voice"}` only, no route or field. Schemas are the SAME objects STUDENT_API_DRAFT keeps in step with Zod (derived by reference, not copied); `STUDENT_API_DRAFT` itself is untouched.
- apps/api/tests/partner-openapi.test.ts (new, 15 tests): 3.1 structure, route parity with CHAT_ROUTES + ANONYMOUS_ROUTES + the openapi route (both directions, no VOICE_ROUTES), scope rule, header names from partners.ts constants, errors/Retry-After, limits equal DEFAULT_LIMITS, Zod parity of every component, enums, wiring of schemas to operations, GET serves the document.
- docs/partner-integration.md (new): one page for D2 (widget key mode and proxy mode, 17-line Node/Express proxy, curl for both keys, add/rotate/revoke/list, limits and errors, crisis behaviour, never-list).

## Deviations and findings the checker should know
1. **apps/api/tests/partners.test.ts:806 now fails** (`assert.equal(PARTNER_OPENAPI, STUDENT_API_DRAFT)` inside "K5: ... which is the student draft until pc-docs-openapi fills it in"). This is the intended change of D1 and the test title says so, but the file is not in this unit's owned files (brief: "Nothing else"), so it was NOT edited. Run: `tests/partners.test.ts --test-name-pattern=K5` -> 2 pass, 1 fail, the only failing assertion is that reference-equality line (the rest of that test, which compares the served body to `PARTNER_OPENAPI`, is a deep-equal and holds). Needs a one-line update by the orchestrator/next cycle: drop line 806 (or assert `notEqual`).
2. The brief says the server key goes in "X-VC-Key or Bearer". The code (chat.ts:839-851) reads only `Authorization: Bearer` on student routes (the spec K3 also says Bearer); `X-VC-Key` is read only on the public route (anonymous.ts) and with a server key there it is the same 401 (wrong scope). The document and the guide follow the code: server key = Bearer only.
3. `pnpm install --offline --frozen-lockfile` in the worktree rewrote pnpm-lock.yaml (adds `apps/widget: {}`, a widget-merge leftover, not this unit's); reverted with `git restore`, not committed.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (public API description), Dual check: no. Base 21f8c73, code commit bf259dd.
Round: 3 files, 2 criteria (D1-D2), est 20 min — one document, one test, one guide; one round.

Tests[D1]: apps/api/tests/partner-openapi.test.ts (all 15) — structure, route parity with the code, scope, headers, errors, limits and Zod parity of the partner document; apps/api/tests/student-openapi.test.ts (all 10) — the shared draft the partner schemas are derived from must stay green.
Tests[D2]: none — prose guide; no executable behaviour. Its claims (key formats, header names, limits, CLI commands, status codes) were read off partners.ts, anonymous.ts, chat.ts and apps/widget/README.md; the numbers it states (10/min, 30/min, 60 s) are the same ones the D1 tests pin.

Pre-check[D1]: bf259dd `npx tsx --test tests/partner-openapi.test.ts` (apps/api) -> exit 0, 15 passed, 0 failed
Pre-check[D1b]: bf259dd `npx tsx --test tests/student-openapi.test.ts` (apps/api) -> exit 0, 10 passed, 0 failed
Pre-check[D2]: bf259dd `grep -c` over docs/partner-integration.md for data-vc-key=, data-vc-proxy=, express, curl -sS, partner rotate, partner revoke, Retry-After, 14416, 112, "Never put the server key" and `wc -l` -> exit 0, every term present (counts 1,1,3,3,1,1,4,1,1,1), 106 lines, Node block 17 lines
Pre-check[all]: bf259dd `npx tsc --noEmit` (apps/api) -> exit 0, no output (all runs through VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600)

Falsify[D1]: mutation M1 in a copy outside the tree (scratchpad/fals-docs): delete the public route's `429` response -> red (3 failing: "every $ref resolves, and every document component is used", "the public turn and every student route document 400, 401, 429 ...", "error bodies ..."); mutation M2: student routes' security changed from serverKey to pageKey -> red (1 failing: "scope rule: the page key opens only the public turn ..."); unmutated copy 15/0 before and after.
Falsification[D2]: NO ISOLATING FALSIFICATION (prose).

## Metrics
Metrics: start=2026-10-22T08:01:46+05:30 end=2026-10-22T08:24:00+05:30 builder_min=22 wall_min=22 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=4 mutations=2 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
- A third-party OpenAPI validator (none in the repo; the test uses the same hand-rolled structural approach as student-openapi.test.ts: shape, unique operationIds, declared path params, resolvable $refs, no 3.0-only keywords).
- The Node proxy and the curl examples were not executed against a live API (no live calls; no running server). Their routes, headers and bodies match the code and the Zod request schemas.
- partners.test.ts full file and the full suite were not run (brief: only the three named runs); see finding 1.
- nginx forwards `Authorization` and the X-VC-* headers to the student routes (pc-partner-keys K5 territory, text-checked there, not re-checked).

Status: ready-for-check
