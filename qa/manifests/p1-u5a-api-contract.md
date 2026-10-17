# Manifest — p1-u5a-api-contract
**Contract:** qa/contracts/counselling-engine.md (B21 student-JWT and anonymous amendments, B24.x as written by U0 on p1/u0; spec v8 A20, A23 config part, A6 prefix)
**Goal task:** P1 plan v8 U5a (D-089)
**Date:** 2026-10-17
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no (no route is enabled; the gate only reads files)
**Persona walk:** skip (no UI and no live route)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** single bounded unit (schemas + static OpenAPI draft + one read-only script) that fits one context.

## What changed
- packages/schemas/src/student-api.ts (new, exported from index.ts) — Zod source of truth: `claims[]` (status verified|attributed|unverified; verified/attributed need >=1 sourceId), sources (kind internal-seminar|toc|whatsapp|unknown), profile facts (source pathlynks|student-confirmed), turn/thread/profile/fact-decision, anonymous request/response and the strict text-free counter (date, kind, count), voice session response, WS client/server event unions (eventId, lastEventId resume), `DEFAULT_LIMITS` + `resolveLimits` (D-088: 30 rpm, anon 10 rpm, 60 voice-min/month, 20-min session, 2 s crisis bound, PCM16 16k in / 24k out), `SYNTHETIC_STUDENT_ID_PREFIX = "syn-"` + `isSyntheticStudentId`. Existing exports untouched.
- apps/api/src/openapi.ts (edited in place, lines 1-18 import, 330-end) — adds `STUDENT_API_DRAFT`, a SEPARATE draft OpenAPI 3.1 document (`x-status: draft-not-enabled`, every op `x-enabled: false`): chat threads/turns, voice-session, profile, fact decision, anonymous turn, `x-websocket` event schemas. `OPENAPI_DOCUMENT` and `API_ROUTES` are unchanged, so the existing both-directions route-table test still holds. Enums come from @vc/schemas constants.
- apps/api/src/go-live-gate.ts (new), apps/api/scripts/go-live-gate.ts (new CLI), apps/api/package.json (`go-live-gate` script), apps/api/src/index.ts (exports) — the A20 script. Read-only. Formats follow U0 (p1/u0 c3d52f5): `B13-signed: SIGNED <ISO> by <name>` in p1-u0-amendment-signatures.md (backtick-wrapped line accepted), last `Answered: <ISO> - <option> ...` line in g-publish.md / g-prod.md, `Nights-mode:` in nights.md, and for voice an A10 record `qa/gates/a10-voice-gate.md` (`Result: PASS`, `Run-at:`, `Evidence: qa/evidence/...` must exist).
- tests: packages/schemas/tests/student-api.test.ts (16), apps/api/tests/student-openapi.test.ts (10), apps/api/tests/go-live-gate.test.ts (14).

## Format decisions to confirm (coordinator / U0)
1. Signed means `B13-signed: SIGNED <ISO instant> by <personal name>` (stricter than "not PENDING": a bare "SIGNED" or a role word such as Maker/Checker/Claude refuses). The name is not hard-coded (the B21 scanner in auth.test.ts forbids the approver literal in apps/api/src); set `VC_GATE_APPROVER=<name>` or pass `approver` to require an exact match. No file check can prove identity.
2. `Answered:` option letters scope the gate: g-publish a|b go, c hold; g-prod a = authenticated text, b = + anonymous, c = + voice, d = hold. The LAST Answered line counts. Separator `-`, `--`, en or em dash all parse. U0's g-prod/g-publish "Options" lists use these letters; if U0 renumbers them, change `requirements()` in go-live-gate.ts.
3. Targets: student-routes, anonymous and voice need B13 + g-publish + g-prod + Nights (g-prod.md precondition 3); `publish` needs B13 + g-publish + Nights (g-publish.md preconditions, no g-prod). Voice also needs the A10 record, whose file name/format is NOT defined by U0: U4's `run-live` (or the checker) must write `qa/gates/a10-voice-gate.md`.
4. Draft route names are proposals: `/v1/students/{studentId}/chat/threads[/{threadId}[/turns|/voice/sessions]]`, `/chat/profile`, `/chat/profile/facts/{factId}/decision`, `/v1/public/chat/turns`.

## Verification scope
Policy-Version: proportional-verification/2026-10-15.12
Tier: M (new contract schemas and a gate script; no runtime route, no data write, no auth path changed)
Base / checked state: base 38e751d, code commit 315ed11 (this manifest is the next commit on p1/u5a)
Gate answers: none applicable (G-PUBLISH/G-PROD/B13 are the things the script reads; they are open and the script refuses)
Affected tests / full-suite trigger: packages/schemas (all) and apps/api (all, because openapi.ts, index.ts and package.json changed); full-suite trigger: none. The builder ran no full suite.
Pre-check[A20]: 315ed11 `bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api test` -> 81 tests, 81 pass, 0 fail (go-live-gate.test.ts 14 of them) t=40 blobs=apps/api/tests/go-live-gate.test.ts:bc42e5b
Pre-check[A23-config]: 315ed11 `bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/schemas test` -> 79 tests, 79 pass, 0 fail (student-api.test.ts 16 of them) t=8 blobs=packages/schemas/tests/student-api.test.ts:92528a9
Pre-check[A6-prefix]: 315ed11 same schemas run as A23-config (test "A6 prefix: synthetic ids start with syn-") -> pass t=8 blobs=packages/schemas/tests/student-api.test.ts:92528a9
Pre-check[contract-shape]: 315ed11 `bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api test` (student-openapi.test.ts, 10 tests, Zod/OpenAPI parity, no draft path in OPENAPI_DOCUMENT or API_ROUTES) -> pass t=40 blobs=apps/api/tests/student-openapi.test.ts:a103dd7
Metrics: start=2026-10-17T14:00:00+05:30 end=2026-10-17T14:25:00+05:30 wall_min=25 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=19 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=unavailable mutants=19 defects_unit=0 defects_6c=0

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/schemas test` -> expected: 79 pass, 0 fail
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api test` -> expected: 81 pass, 0 fail
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/schemas typecheck` and `... -C apps/api typecheck` -> expected: no output after `tsc --noEmit`
- `pnpm -C apps/api go-live-gate student-routes` (and `voice`, `anonymous`, `publish`) -> expected: exit 1, REFUSED
- `pnpm -C apps/api exec tsx scripts/go-live-gate.ts student-routes --gates-dir <p1-u0 worktree>/qa/gates` -> expected: exit 1, `nights.md` ok, B13 PENDING, g-publish and g-prod unanswered
- `python3 contracts/verify_contracts.py` -> expected: PASS by vacuity

## Actual outputs (from maker's own run)
- schemas test: `ℹ tests 79 / pass 79 / fail 0`; apps/api test: `ℹ tests 81 / pass 81 / fail 0` (first apps/api run had 1 failure, auth.test.ts "no issuer or key is hard-coded": it caught a literal approver name in src/go-live-gate.ts; fixed by removing the literal, see decision 1).
- typecheck both packages: clean.
- Against the real worktree qa/gates (U0 files not merged here): all four targets `REFUSED`, exit 1, every record `missing`.
- Against U0's actual gates dir (p1/u0 c3d52f5): `student-routes: REFUSED / ok nights.md / MISSING p1-u0-amendment-signatures.md: B13-signed is not "SIGNED <ISO instant> by <approver name>" (found "PENDING") / MISSING g-publish.md: no Answered line (gate still open) / MISSING g-prod.md: no Answered line (gate still open)`, exit=1.
- contracts: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

## Capability coverage (each new claim -> its isolating falsification)
Mutations were applied one at a time to the source (original restored and byte-compared after the run); numbers are pass/fail counts of the named test file(s) under the mutant, baseline being all green.

| Criterion | capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|---|
| A20 | gate cannot be bypassed by a blanket allow | go-live-gate.test.ts (today's files, per-record, hostile) | `allowed: failures.length === 0` -> `allowed: true` | red: 13 pass / 11 fail |
| A20 | Nights mode required | "each required by every target" | drop `night` from student-routes requirements | red: 3 fail |
| A20 | role words / wrong signer refused | "B13 signer must be a personal name" | remove `ROLE_WORDS.test(m[2])` | red: 1 fail |
| A20 | configured approver enforced | same test | drop the `approver` comparison | red: 2 fail |
| A20 | future dates refused | hostile + A10 cases | `t <= now + skew` -> `true` | red: 2 fail |
| A20 | voice needs A10 | "voice alone needs the passing A10 record" | drop A10 from voice requirements | red: 2 fail (11 pass / 2 fail) |
| A20 | fenced/quoted/indented text ignored | hostile | `if (!fenced) out.push(line)` -> always push | red: 1 fail |
| A20 | duplicate keys refused | hostile | `v.length === 1` -> `>= 1` | red: 1 fail |
| A20 | last Answered line wins | "LAST Answered line counts" | use `all[0]` | red: 1 fail |
| A20 | hold option is not a go | g-publish / g-prod option tests | `go.includes(option)` -> `true` | red: 3 fail |
| A20 | publish does not need g-prod; anonymous needs b or c | option-scope tests | add prod to publish / accept `a` for anonymous | red: 2 fail / 1 fail |
| A20 | A10 evidence file must exist | A10 test | skip `existsSync` | red: 1 fail |
| A1 shape | verified/attributed need a sourceId | student-api.test.ts | `refine` -> `true` | red: 1 fail |
| A23 config | defaults are the D-088 numbers | "D-088 default limits" | `requestsPerMinute: 30` -> `31` | red: 2 fail |
| A15a | counter schema is strict | "A15a counter" | add an optional `text` field | red: 1 fail |
| A6 | prefix is exact and case-sensitive | "A6 prefix" | `toLowerCase()` before `startsWith` | red: 1 fail |
| contract-shape | OpenAPI enum parity | student-openapi.test.ts | `CLAIM_STATUSES` -> `["verified"]` | red: 1 fail |
| contract-shape | draft ops are not enabled | same | `"x-enabled": false` -> `true` | red: 1 fail |
Honest gaps: the go-live tests were written after the gate module (no red-first run for that file; the mutation table is the substitute). One mutant ("b13 any value") is equivalent because the thrown TypeError is caught and still refuses.

## Live browser evidence
Not UI-touching — no surface changed (changed paths: packages/schemas/src, apps/api/src, apps/api/scripts, tests).

## Open risks
- Routes are not implemented; the gate is not yet called by any server code (A20 requires the script to exist before a route does; the route unit must call `assertGoLive`).
- The gate proves a record exists in the agreed format, not who wrote it; keep gate files under the checker/Approver process.
- The B21 student-JWT amendment is U0 proposal P-1; the draft contract assumes the JWT supplies student and tenant.
