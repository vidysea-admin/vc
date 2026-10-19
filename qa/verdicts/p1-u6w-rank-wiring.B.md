# Verdict B — p1-u6w-rank-wiring (Mode A repair check, tier L, dual check, coordinator B, blind)

Cycle checked: 1
Policy-Version: proportional-verification/2026-10-18.15
Date: 2026-10-19T08:07+05:30

CHECK-PLAN (repair, cycle 1): bound HEAD c8e732d (code cb1ad5b), repair base 1dd12d1 verified in `git log`, whole-unit base 7d2840e verified by `git merge-base HEAD 7d2840e`. (1) read the repair diff 1dd12d1..cb1ad5b in full (chat.ts +4 lines in three places, chat-rank.test.ts +5 tests and added assertions in the tenancy test) and scanned the whole-unit diff 7d2840e..HEAD: outside qa/ only `apps/api/src/chat.ts` and `apps/api/tests/chat-rank.test.ts`, nothing out of scope; (2) reran the manifest commands through the shared lock on the bound tree; (3) my own hostile tests in a scratch copy under D:/vc/.worktrees (removed afterwards, links unlinked first); (4) one falsification per repaired criterion C6..C11 in that copy. Coordinator A's verdict, checkpoint and evidence were never read. Cycle-0 criteria C1..C5: chat.ts changed, so their behaviour was re-evidenced through the same suite plus HB1..HB5 (C2 labels, C3/C10 tenancy and weights, C5/C11 anonymous); C4's failure-never-breaks-turn tests are in the 146-test run.

VERDICT: PASS
SCOREBOARD: C1..C5 5/5 re-evidenced (unchanged), C6..C11 6/6 met; 6 of 6 falsifications killed, 0 survivors; own hostile 6/6.
TIER: L (tenancy: the stored and Pathlynks fact reads feed a student-facing answer; dual-trigger apps/api/src/chat.ts:508 cited and confirmed at `withRanking`)
CHECKED-STATE: worktree p1-u6w HEAD c8e732d2, code cb1ad5b (chat.ts blob c97e9bc6, chat-rank.test.ts blob cd22afb7, rank.test.ts blob f65e783a, anonymous.ts blob 04044172 unchanged). Bound tree never mutated: `git status` shows only untracked qa/evidence dirs. Every mutant and hostile test ran in the scratch copy; blobs of the copy matched HEAD before and after (RESTORED run 35/35).

COMMANDS RUN (actual counts, `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`):
- `pnpm -C <worktree>/apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts` -> tests 146, pass 146, fail 0, EXIT 0 (qa/evidence/p1-u6w-B-c1/api.txt; 16 s).
- `pnpm -C <worktree>/packages/engine exec tsx --test tests/rank.test.ts` -> tests 33, pass 33, fail 0, EXIT 0 (rank.txt).
- `pnpm -C <worktree> -r typecheck` -> EXIT 0 (typecheck.txt).
- Own hostile file `tests/chat-rank-B1-hostile.test.ts` (source kept as chat-rank-B1-hostile.test.ts.txt): run 1 failed 2 of 6 on MY fixture mistakes (it asserted `profileFactsUsed` undefined where the schema gives `[]`, and it read the older unrelated verified turn of the same thread); no product code touched; run 2 -> tests 6, pass 6, fail 0 (hostile-run1.txt, hostile-run2.txt).
- Falsifications: `python mutate.py` in one lock hold, each mutant in the copy with chat-rank.test.ts + my hostile file + anonymous-route.test.ts (35 tests): baseline 35/0; mutants.txt below; restored 35/0.

FALSIFICATIONS (floor: one per repaired criterion; green 35/0 before, red after, restored):
- F6 (C6) the `status: "unverified"` override removed -> 32 pass / 3 fail: HB1, HB1b and the maker's "U6w cycle 1 C6".
- F7 (C7) `&& persistText` removed from the `withRanking` call -> 2 fail: HB2 and the maker's "U6w cycle 1 C7". (So the graph does pick `rank_options` for an unconsented minor's turn and the gate is what stops it, not the graph.)
- F8 (C8) `profileFactsUsed` stored without `redact` -> 2 fail: HB3 and "U6w cycle 1 C8".
- F9 (C9) option-list callback asked with a fixed other student id -> 1 fail: "U6w item 3 tenancy" (this is cycle-0 survivor M3d, now killed by the maker's own test).
- F10 (C10) `weightsForTenant` asked with a fixed "tenant-a" -> 1 fail: "U6w cycle 1 C10" (cycle-0 survivor M3b, now killed by the maker's own test).
- F11 (C11) the anonymous handler touches `deps.ranking`, `deps.profile`, `deps.dbForTenant` -> 2 fail: HB5 and "U6w cycle 1 C11" (the cycle-0 vacuous spy now has a live wire to the anonymous route).

CRITERIA:
- C6 PASS: with custom weights and 4 number claims, every claim live (4/4) and in the stored thread and in the raw `chat_turns` docs is `unverified`; each number claim starts `NOT PROVEN: `; no decimal outside a claim in the live response; 25-option list the same. The accepted `unverified_claim` gap counter is incremented (maker test) and the reply still returns 200.
- C7 PASS: an unconsented minor with four rank-like texts, a crisis+rank text, and an over-long (4,100+ chars) crisis+rank text from an adult: option port 0 calls, option-list callback 0, weights callback 0, no `rankingProfile`, no NOT PROVEN text. Control in the same world: a minor WITH `guardianConsent` reaches the option list (1 call, 4 port reads), so the gate is not blanket.
- C8 PASS: Pathlynks facts `Germany please email anita.rao.private@example.com` and `engineering, call +91 98765 43210 or 044-2345-6789, ask Anita Rao` (plus a `student-name` fact) are used by the ranker (live `profileFactsUsed` carries them unredacted, as the manifest states) while the stored copy reads `... email [EMAIL]` and `... call [PHONE] or [PHONE], ask [NAME]`; none of `anita.rao.private`, `example.com`, `98765`, `43210`, `2345`, `6789`, `Anita`, `Rao` appears anywhere in the stored Db or in the thread read-back.
- C9 PASS: the diff only ADDS assertions (and one push in the existing callbacks; the tenantId assertions stay); a second same-tenant student with opposite facts leaves syn-same's claims and facts unchanged, and F9 turns it red.
- C10 PASS: callback sees exactly the asking tenant; HB4 (reverse of the maker's case: only tenant B has weights) shows tenant A's claims byte-equal to a world with no callback and profile `student-success`; F10 turns the maker's test red.
- C11 PASS: anonymous route with live ranking, profile and `dbForTenant` spies: `sign_in_required` and all spies at 0 for three rank-like texts (HB5) and for the maker's text; the authenticated control calls the spies; F11 turns both red.
- C1..C5 (cycle-0 criteria, chat.ts changed): C1 confirmed chat facts still rank and are listed as `student-confirmed` live (146-run, "U6w item 1" x3); C2 labels hold on every ranked claim (HB1); C3 tenancy holds (HB4, "item 3", F9/F10 killed); C4 the throw/refusal tests are green in the 146-run and the gate leaves the try/catch untouched; C5 anonymous never ranks (HB5, F11, old C5 test kept and green).

FAILURES: none.

FINDINGS (non-blocking; a dual coordinator PASS has no side effects):
PROPOSED-ISSUE: {"severity":"low","title":"wording: the new comment above the `withRanking` call in chat.ts says 'a turn with no student text cannot pick rank_options', and the manifest repeats it for C7. A textless turn (unconsented minor, over-long message) still passes the student's text to the graph, and the graph DOES select rank_options for it (falsification F7 turns the C7 test red when the persistText gate is removed). The gate is the guard, not the absence of text.","where":"apps/api/src/chat.ts the comment above `if (result.selectedTool === \"rank_options\" && persistText)`; manifest criterion C7 last sentence","repro":"remove `&& persistText`; 'U6w cycle 1 C7' fails (F7)","unit":"p1-u6w-rank-wiring"}
PROPOSED-ISSUE: {"severity":"low","title":"design note: `deps.extractFacts` still receives the UNREDACTED live `response` (now including `profileFactsUsed` values) while the stored copy is redacted. It is the caller's port and receives the raw student text already, so no new exposure class; a future port that persists `response.profileFactsUsed` would store the raw values.","where":"apps/api/src/chat.ts the `deps.extractFacts({ ... response })` call","repro":"read the call: it passes `response`, not `stored`","unit":"p1-u6w-rank-wiring"}

NOTES (no action required):
- The live reply keeps fact values as the ranker returned them (the student's own facts), as the manifest states; only the stored copy is redacted.
- Every ranked turn now increments `unverified_claim`; accepted by the repair brief, and the reply still returns 200.
- Out-of-scope items of the manifest (no deadline on ranking callbacks, double Pathlynks fetch, the X-vs-Y trigger, `OptionDataPort` tenant argument, `index.ts` wiring) were not judged.
- The pre-push full suite is the 6c step's job (.13-2 (a)); this check ran none.

EVIDENCE: qa/evidence/p1-u6w-B-c1/ (rerun.sh, api.txt, rank.txt, typecheck.txt, hostile-run1.txt, hostile-run2.txt, chat-rank-B1-hostile.test.ts.txt, mutate.py, mutants.txt).

CAPABILITY-COVERAGE: 6/6 cycle-1 falsification rows reproduced (F6..F11 own edits; the maker's table F9a/F9b are not required, floor is one per criterion)
LIVE-BROWSER: not-applicable (changed paths are apps/api/src/chat.ts, apps/api/tests/chat-rank.test.ts, qa/)
ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines)
EXECUTOR: claude-sonnet-subagent (maker/builder p1-u6w-build); checker: claude-sonnet-subagent
EXPLANATION: The three repair edits in chat.ts do what the criteria say and each is pinned by a test that goes red under its own single-edit mutant; my hostile variants (multi-weight claims, 25 options, unconsented and consented minors, over-long crisis+rank, phone/email/name in fact values, reversed weights tenancy, anonymous with live spies) all held. The two cycle-0 test-gap survivors and the vacuous spy are now killed by the maker's own tests.
Metrics: start=2026-10-19T07:59:58+05:30 end=2026-10-19T08:07:00+05:30 wall_min=7 agent_min=unavailable blocked_min=1 suite_runs=0 repeat_runs=0 mutations=6 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=422 mutants=6 defects_unit=0 defects_6c=0

---
Prior cycle (superseded by this file; kept in git): cycle 0 verdict B = PASS, commit 47353db, qa/verdicts/p1-u6w-rank-wiring.B.md at that commit. Its three PROPOSED-ISSUE test-gap lines (P1 option-list student id, P2 weightsForTenant, P3 vacuous anonymous spy) are the cycle-1 items C9, C10, C11 and are verified fixed above.
