# P1 U5a independent check (student API contract + A20 go-live gate)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-15.12
VERDICT: PASS

CHECK-PLAN: bound to worktree p1/u5a (head e658f80, code commit 315ed11, base 38e751d). Tier M kept. Criteria: A20 (gate refuses today, hostile variants, valid set allows exactly the intended targets), STUDENT_API_DRAFT not enabled and served document unchanged, A23-config (D-088 defaults), A6-prefix, contract-shape. One coordinator, serial (shared vc-testlock). No full suite.
Lane: normal (quick lane off). U0 gates read from worktree p1/u0 (c3d52f5/02c489f) as the real gate set.

SCOREBOARD: A20 PASS, draft-not-enabled PASS, A23-config PASS, A6-prefix PASS, contract-shape PASS. Falsification floor 4/4 (A20, A23, A6, shape), each green before / red after / restored, in a copy (qa/evidence not touched; copy under scratchpad u5a-chk/mut).
CHECKED-STATE: HEAD e658f80, worktree clean (git status empty before and after). Test blob identity matches the manifest pre-check blobs: go-live-gate.test.ts bc42e5b, student-api.test.ts 92528a9, student-openapi.test.ts a103dd7. Diff since base touches only apps/api (src, scripts, tests, package.json), packages/schemas and the manifest. server.ts and auth.ts: 0 diff lines. openapi.ts hunks are pure additions (no removed line).

OUTCOME EVIDENCE (executed by this checker)
- Tests (bash D:/vc/scripts/vc-testlock.sh pnpm -C <p1-u5a>/packages/schemas test): tests 79 / pass 79 / fail 0, exit 0. Same for apps/api: tests 81 / pass 81 / fail 0, exit 0 (go-live-gate 14, student-openapi 10, student-api 16 included).
- Typecheck (pnpm -C packages/schemas typecheck, -C apps/api typecheck): both exit 0. python3 contracts/verify_contracts.py: PASS by vacuity.
- Go-live CLI against the real U0 gates (copied path p1-u0/qa/gates): student-routes, anonymous, voice, publish all REFUSED, exit 1 (B13 "PENDING", g-publish and g-prod no Answered line; nights.md ok; voice also a10 missing; publish needs no g-prod). Against the worktree's own qa/gates all four exit 1. Bad target exit 2.
- Hostile matrix (u5a-chk/hostile.mts, 78 rows, 0 BAD) via evaluateGoLive on temp gate sets, all refused for all 4 targets: "SIGNED <iso> by Claude" (plain, backticked, "Claude Opus", lowercase, Maker, Agent Smith, Assistant, Maker-bot); "PENDING" with trailing space, trailing dot, lowercase; lowercase "signed"; bare SIGNED; no date; date-only; future instant; no zone; lowercase key; duplicate PENDING+SIGNED; indented; "> " quoted; code-fence and tilde-fence only; HTML comment; wrong VC_GATE_APPROVER. Gate answers: g-publish c (hold), a-then-later-c, empty, no option, "approve", future, in fence, quoted, template prose, "abc"; g-prod c-then-later-d refuses all, c-then-later-a refuses anonymous and voice but keeps student-routes (correct scoping). Nights: missing, none, PENDING, "funded." , "Funded", fenced, duplicate, quoted, bullet. A10: FAIL, "PASS.", lowercase, evidence missing file, ../ traversal, nested ../../ traversal, evidence outside qa/evidence, directory, absolute path, no Run-at, future Run-at, fenced, duplicate Result.
- Constructed valid set (B13 signed by a personal name, g-publish a, g-prod c, Nights tele-manas-disclosed, A10 PASS with existing evidence file): allows all 4. g-prod a: student-routes+publish only. g-prod b: + anonymous. No g-prod and no a10: only publish allowed. No a10 file: voice refused, other three allowed. Later Answered line wins (c then a refuses voice).
- STUDENT_API_DRAFT: 7 operations, every x-enabled false, no x-enabled anywhere other than false, x-status draft-not-enabled, no draft path in the served document. OPENAPI_DOCUMENT deep-equal to the same object evaluated from 38e751d (13 paths both). API_ROUTES source in server.ts unchanged (0 diff lines); grep of server.ts for chat, public/, STUDENT_API_DRAFT, go-live: no match, so no new route is mounted.
- Zod probes (zod.mts, 35 rows, 0 BAD): claim status accepts only verified|attributed|unverified (rejects "Verified", "verified ", "unknown", "partial", missing); verified/attributed need a sourceId; unverified may have none; extra key rejected. Anonymous counter strict: extra text, studentId, threadId, kind "text", negative or fractional count, datetime in date all rejected; the four kinds accepted. isSyntheticStudentId: syn-x true; SYN-x, " syn-x", "syn-", syn_x, xsyn-x, "" and undefined false. DEFAULT_LIMITS = 30 rpm, anon 10, 60 voice-min/month, 20 min session, 2000 ms crisis, pcm16 16000/24000, matching d088 Q5/Q7; resolveLimits override affects only the named key.

Falsify[A20]: keyValues regex allows leading spaces (apps/api/src/go-live-gate.ts:77) -> RED (13 pass / 1 fail, "A20 hostile ..."). A first attempt had a bad escape (regex became ^s*) and stayed green, so it was discarded as an invalid mutant and redone with a literal space.
Falsify[A23-config]: voiceSessionMaxMinutes 20 -> 21 (packages/schemas/src/student-api.ts:202) -> RED 15 pass / 1 fail.
Falsify[A6-prefix]: SYNTHETIC_STUDENT_ID_PREFIX "syn-" -> "SYN-" -> RED 15 pass / 1 fail.
Falsify[contract-shape]: STUDENT_API_DRAFT x-status "draft-not-enabled" -> "enabled" -> RED 9 pass / 1 fail.
Extra (A20, within cap 3): last-Answered selection changed to "last parseable" -> RED 13/1. Evidence-path ".." check removed (go-live-gate.ts a10 checker) -> GREEN 14/0 (survivor, see below).

FAILURES: none.
REMAINING: none.
LIVE-BROWSER: not-applicable (no UI, no live route).

PROPOSED-ISSUE: low (test gap, no product defect) - the A10 evidence ".." guard in apps/api/src/go-live-gate.ts is not exercised by go-live-gate.test.ts. Removing it keeps all 14 tests green, and then "Evidence: qa/evidence/x/../../gates/g-prod.md" (a path that escapes qa/evidence and exists) lets voice through. The shipped code refuses it (probed: voice allowed=false, "Evidence does not point at a qa/evidence/ report"). Add a nested-traversal case to the A10 test.
PROPOSED-ISSUE: low - the B13 signer pattern accepts any capitalised name-like text, including trailing words (for example "by Umesh PENDING", "by Bob") unless VC_GATE_APPROVER is set. The manifest already says no file check proves identity; set VC_GATE_APPROVER (or pass approver) in the route unit that calls assertGoLive so the signer must equal the repo Approver.
PROPOSED-ISSUE: low - the draft route names and the B24/g-prod option letters are proposals the manifest asks the coordinator/U0 to confirm. This check read U0's actual letters (a|b|c|d in g-prod, a|b|c in g-publish, `B13-signed: SIGNED <ISO> by <name>`, `Nights-mode:`) and they agree with requirements(). U4/run-live must write qa/gates/a10-voice-gate.md in the Result/Run-at/Evidence format or voice stays refused (safe default).
PROPOSED-ISSUE: info - the route unit that enables any target must call assertGoLive; nothing calls it yet (A20 only requires the script to exist first).

Metrics: start=2026-10-17T14:27:30+05:30 end=2026-10-17T14:34:36+05:30 wall_min=8 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=unavailable mutants=3 defects_unit=0 defects_6c=0
