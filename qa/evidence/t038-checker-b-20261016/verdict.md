# T038_C1_B: PASS (bounded draft-core, cycle 1, checker B)

Checked 2026-10-16T19:13 to 19:42 (+05:30), read with `date -Iseconds`. Scope: bounded supplied-requirements draft core only. Real portal/client authority, >=90% five-portal accuracy, 15-minute and atomic freshness are outside this verdict and remain pending. No push or merge.

## Identity
- Candidate E4B1031F0AA40D9631D099203020B1E101F293F3C4A33A85104D47EF827C9BE4 recomputed by me: UTF8 compact sorted-key ASCII JSON {base,files,root}, files = uppercase sha256 of the four sources, base 13207bd0..., root C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc. Exact match (lowercase-hash variant does not match, so the uppercase rule is the one used).
- Four pins match the plan: schemas.ts 9ED93DDE..., server.ts 7B5EB8BB..., openapi.ts 023F2583..., server.test.ts 4A81A832.... Source worktree re-hashed after all runs: unchanged. Scratch copy is byte-identical before, between and after every mutation (PIN-OK x4 each restore).
- Scratch copy: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t038 (source excluding node_modules/.git/qa; node_modules junctions rebuilt so @vc/* resolve INTO the scratch packages, third-party deps junctioned to the read-only originals). The Codex worktree was never written.

## Reruns (under the shared D:/vc/scripts/vc-testlock.sh mutex)
- schemas typecheck (tsc --noEmit -p packages/schemas): exit 0 (7m44s, mostly lock wait).
- API typecheck (tsc --noEmit -p apps/api): exit 0.
- API server.test.ts: 40 tests, 40 pass, 0 fail, 0 cancelled, 0 skipped.
- packages/schemas/tests/*.test.ts: 63 tests, 63 pass, 0 fail.
- Logs: scratchpad/b-logs/{types.log,base-api.log,base-schemas.log,driver.out}.

## Seven required falsifiers (GREEN -> intended RED -> restored bytes -> GREEN; one lock hold; setup/parse errors not counted)
| # | Floor | Mutation (scratch only) | RED result (API 40) | Intended assertion | Restore |
|---|---|---|---|---|---|
| 1 | C1 options bound | drop `.max(DRAFT_MAPPING_LIMITS.options)` on `options` (schemas) | 39/1 | oracle 3 line 1200: 33 unique options expected HTTP 400, got 200 | 40/40 |
| 2a | C2 original grant | remove final original-grant comparison (server) | 39/1 | oracle 11 `initial/grant-content`: expected 403, got 200 | 40/40 |
| 2b | C2 original source (alt) | remove final source-snapshot comparison | 39/1 | oracle 11 `initial/retire`: expected 409, got 200 | 40/40 |
| 3 | C3 false/zero | truthiness filter on mapped value and packet field | 36/4 | oracle 1 deepEqual: `fields: {}` vs `{answer:false, zeroField:0}`, `expected:null` vs `false` (plus oracles 2, 5, 7) | 40/40 |
| 4 | C4 public claim | `requirementsVerified` true in server and schema literal | 37/3 | oracle 1 deepEqual `requirementsVerified: true` vs `false` (also oracles 3, 9) | 40/40 |
| 5 | C1 capturedAt 128 | drop `.max(128)` AND inline `value.length>128` guard together | 39/1 | oracle 3 line 1212: fractional 129 expected 400, got 200; the 128 positive at 1209 still passed | 40/40 |
| 6 | C3 Unicode word counter | `\P{White_Space}+` back to `\S+` | 39/1 | oracle 7: NEL literal `left\x85right` word count wrong (`{}` vs `{answer:'left\x85right'}`) | 40/40 |
| 7 | C4 report citation | corrupt direct report citation factId (`wrong-` prefix), valid shape kept so HTTP 200 is reached | 34/6 | oracle 1 deepEqual: `factId 'wrong-draft-fact-answer'` vs `'draft-fact-answer'` literals (also oracles 2, 5, 6, 7, 9) | 40/40 |

7/7 required floors killed; 0 survivors; 8 mutation events (floor 2 run in both variants). All REDs are literal-value assertion failures at HTTP 200/400/403/409, not 503, import or parser failures. Final pins re-verified after the last restore.

## Outcome proof (not just construction)
My own independent probe, scratch-only (`apps/api/tests/zz-outcome-probe.test.ts`, not part of the frozen candidate), with my own literals via the production handler, JWT auth and the tenant-scoped in-process Mongo fake:
- Seeded approved facts: gpa=0, hasPassport=false, country="Canada", essay="x y", plus a fact tagged only `profile_synthesis` containing "LEAK-ME".
- Requirements: gpa number; passport boolean; country with options [USA, UK]; essay with min 5 words; a field bound to the unconsented fact; one optional missing field.
- Result 200, status "draft", `requirementsVerified:false`. `packet.fields` is exactly {gpa:0, passport:false}, each with one citation (factId f-gpa / f-hasPassport). Gaps: invalidFields [country, essay] (reasons option_not_allowed / length_below_minimum), missingFields [note]. Every report row has actual:null, actualPresent:false, match:false. "LEAK-ME" does not appear in the response. `packet.documents` is empty.
- Whole fake DB byte-identical before and after (no writes), graph/provider never called.
- Fail-closed: a student with no application_filling consent gives a non-200 with no requirements echoed; a different tenant gives non-200 and no data; no Authorization gives 401; DB still unchanged.
- Surface: the only draft-related route is `POST /v1/students/{studentId}/application-draft`; no OpenAPI path matches /submit/. Static scan of the route body (server.ts 285-490) finds no insert/update/delete/replace/bulkWrite, fetch/http, provider or graph calls. The candidate's own oracles also assert `rawAll(fakeDb)` equality and no graph/log calls (13 sites).
- Result: 1 test, 1 pass. Log scratchpad/b-logs/probe.log. Caveat: I did not red-team the probe itself; its sensitivity is evidenced by the same assertions (fields, citations, requirementsVerified) failing in floors 3, 4 and 7.

## Open risks and limits
- Not covered by this verdict: full authorization/coalesced integration suite, real target spec, portal fill/readback/screenshots, five-portal >=90%, zero unintended submissions on a real portal, 15-minute SLA, atomic multi-document freshness (the route is a read-committed recheck by design). requirementsVerified stays literal false; document availability stays unverified.
- Not an instrumented module-load trace; dependency identity is by junction to the same installed packages the maker used.
- Checker A's PASS was not read, so this is blind and independent of it.
- Environmental: C: has about 20 GB free (96% used); no OOM or pagefile failure occurred. The 7m44s schemas typecheck figure was mostly shared-mutex wait.
- Process: all heavy runs under the normal shared mutex; no foreign process killed; two stray background poll loops of mine terminated on their own.
