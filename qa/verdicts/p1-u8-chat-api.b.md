# Verdict B — p1-u8-chat-api (coordinator B, blind dual check)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-17.14

CHECK-PLAN: Mode A, Tier L, dual trigger auth apps/api/src/auth.ts:406. Own plan: (1) run whole schemas, db, api suites plus typecheck at e2b805d; (2) run downstream consumers (engine tests/tc for exportStudent and COLLECTION_NAMES, web tc); (3) one named falsification per criterion C1..C10 in throwaway copies, green-before/red-after/restored; (4) hostile probes (forged/counsellor token on student routes, student A vs B, minors, limiter, sandbox); (5) security read of verifier, chat handler, stores, erasure, redaction, engine crisis path; (6) diff scope vs base 52d2af5; (7) judge U9 LiveConfigError impact.

VERDICT: PASS
SCOREBOARD: C1..C10 10/10 pass; 10/10 falsifications killed; 6/6 hostile probes pass; suites 551/551 plus engine 94/94; typechecks schemas, db, api, engine, web all exit 0.
TIER: L (dual check; this is the B half).
CHECKED-STATE: worktree p1-u8, HEAD e2b805d, base 52d2af5; bound tree untouched (mutations only in copies, node_modules junctioned).

CRITERIA:
- C1 flag+gate: flag off = unknown path; A20 gate + tracing checked before Mongo connect. Falsify B1 (A20 gate no longer asked): startApi refusal test red (run hung/killed, exit null, named test listed). PASS.
- C2 student JWT: allow-listed alg, mandatory aud/iss/claims, role===student gate (auth.ts:406). B2 (role gate removed): 2 named tests red (counsellor/admin/approver token 403). Probe P1a/P1b. PASS.
- C3 idempotent turns: lease-based claim, same id+text replays, same id other text conflicts. B3: conflict test red. PASS.
- C4 redacted persistence (6A): redactPii before claimChatTurn/store, live turn goes to model. B4: 2 red. PASS.
- C5 under-18 (4A): minor if isMinor, under age, or no stated adult; consent must be boolean true; no text/answer/fact/escalation stored otherwise. B5: 2 red. Probe P3. PASS.
- C6 profile routes (A16b): facts proposed, not in use until confirmed. B6: 2 red. PASS.
- C7 limits (A23): 31st/min = 429 + Retry-After, crisis exempt, per-student/tenant. B7: 1 red. Probe P4. PASS.
- C8 tenants (A6): tenant-scoped ids, sandbox syn- only, token student must equal path (404 not 403). B8: 1 red. Probes P2, P5. PASS.
- C9 logs: flag log ids/time only, gap counts no student/text, prior-flag memory read from log. B9: 1 red. PASS.
- C10 erasure+export: five collections in ERASURE_PLAN, gap counts exempt with reason, export complete. B10: 4 red. PASS.

FAILURES: none.

FINDINGS (all non-blocking):
PROPOSED-ISSUE: {"severity":"medium","title":"adult-with-consent crisis path passes raw text to escalateTurns/classifier; stored classifier rationale (max 500 chars) may restate text-derived content, against D-093 6A spirit","where":"apps/api/src/chat.ts crisis branch; packages/engine/src/guards/escalation.ts","unit":"p1-u8-chat-api"}
PROPOSED-ISSUE: {"severity":"low","title":"profile fact key stored unredacted; only value is redacted","where":"packages/db/src/profile-facts.ts","unit":"p1-u8-chat-api"}
PROPOSED-ISSUE: {"severity":"low","title":"requestHash is over redacted text, so retries differing only in redacted tokens replay instead of conflict","where":"apps/api/src/chat.ts claimChatTurn call","unit":"p1-u8-chat-api"}
PROPOSED-ISSUE: {"severity":"low","title":"unconsented minor in crisis gets the fixed helpline message but no counsellor escalation record (consistent with D-093 4A; owner to confirm explicitly); U10 must supply crisis audio when it wires a detector","where":"apps/api/src/chat.ts","unit":"p1-u8-chat-api"}
PROPOSED-ISSUE: {"severity":"low","title":"request body (up to 256 KB) is read before the limiter runs; limiter is per-process in-memory; name redaction is heuristic (last two maker-stated)","where":"apps/api/src/chat.ts","unit":"p1-u8-chat-api"}

BUILDER OPEN RISKS: limiter per-process and heuristic name redaction judged acceptable for a flag-off, A20-gated unit; both stated by the maker. U9 LiveConfigError: no impact on U8; no live/voice adapter is wired and the symbol is absent from the tree.
NOTES: base discrepancy: main merge-base is 0e62084 (U7 not on main); unit base 52d2af5 used. Diff scope clean: 25 non-qa files in apps/api, packages/db, packages/schemas, nothing deleted/renamed, no assertion weakened. B1 red-after has no exit code (the removed gate lets startApi try Mongo and the run was killed on the named test); judged red. Earlier B5 restored=false was a CRLF artefact only. Full-suite trigger: auth/tenancy L unit, so the .13-2 full suite at 6c; scoped three-package full run done here.
LIVE-BROWSER: not-applicable (JSON API only)
ISSUES-WRITTEN: none (dual check)
EXECUTOR: claude-sonnet-subagent (checker coordinator B)

COMMANDS (all via bash D:/vc/scripts/vc-testlock.sh, VC_TESTLOCK_TIMEOUT_SECS=7200):
- tsx --test packages/schemas: exit 0, 90/90. packages/db: exit 0, 278/278. apps/api: exit 0, 183/183. pnpm typecheck x3: exit 0.
- engine tests exit 0 94/94; engine typecheck exit 0; apps/web typecheck exit 0.
- node falsify.mjs B1..B10 (two runs; B3-B7,B9 then B1,B2,B8,B10): each green-before, red-after, restored=true.
- hostile probe zz-probe.test.ts in copy: 6/6.
Evidence: qa/evidence/p1-u8-chat-api-b/ (38 files, SHA256SUMS.txt). ENVIRONMENTAL: session interruption, shared-lock contention, low free RAM and fork errors (not code defects).

Metrics: start=2026-10-18T04:19:42+05:30 end=2026-10-18T23:51:17+05:30 wall_min=1171 agent_min=unavailable blocked_min=1100 suite_runs=5 repeat_runs=0 mutations=10 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=10 defects_unit=0 defects_6c=0
