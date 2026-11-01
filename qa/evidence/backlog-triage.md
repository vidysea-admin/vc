# Backlog triage (brief C), measured 2026-11-01 at HEAD 2fd5e40a

Method. Counts come from `qa/issues.jsonl` (986 lines, 0 unparseable, 617 distinct ids) and `qa/QUEUE.md` (453 lines), parsed by a throwaway script. The script merged all rows per id in file order, so the last value of each field wins; this is the same merge ISS-084 says the session hook should use. Nothing in the repo was edited except this file. "Age" is the `created`/`date` field against 2026-11-01. Theme buckets are keyword matches on title/unit/class/type, first match wins, so they are indicative only.

## 1. Counts

Status of all 617 ids: open 379, fixed 165, closed 42, verified 19, wontfix 9, verified-resolved 2, wontfix-accepted 1.

Open 379 by severity: high 27, medium 94, low 249, info 9, critical 0. This matches the session hook's figures exactly.

Open by age:

| Age | high | medium | low | info | total |
|---|---|---|---|---|---|
| 0-7 days (since 10-25) | 13 | 20 | 34 | 2 | 69 |
| 8-14 days | 0 | 17 | 133 | 6 | 156 |
| 15-30 days | 3 | 1 | 8 | 1 | 13 |
| 31+ days (oldest 2026-09-25) | 11 | 34 | 48 | 0 | 93 |
| undated | 0 | 22 | 26 | 0 | 48 |

Open by unit (top; 74 rows carry no unit): quest-successor 18, p1-u8-chat-api 16, p1-u10w-voice-wiring 15, t-010-live-cards 13, p1-eng3-crisis-leftovers 11, t-011 10, p1-u7-anon-mode 10, p1-u8r-chat-privacy 10, p1-u6w-rank-wiring 10, vc-admin-control 10, p1-u9-live-adapter 8, p1-a10-live 8, p1-lk5 8, cards-api 7.

Open by `feature` where set (228 rows have none): counselling-engine 98, maker-checker 20, partner-chatbot 18, p1-nosource-expert 6.

Open by keyword theme (total 379):

| Theme | rows | of which high |
|---|---|---|
| chat/api/engine behaviour | 97 | 4 |
| crisis/safety | 72 | 3 |
| privacy/redaction/erasure/export | 66 | 9 |
| qa-process/ledger/hooks/tooling | 44 | 5 |
| auth/tenancy/keys/admin | 41 | 4 |
| voice | 22 | 1 |
| test-gap/flake | 2 | 0 |
| no theme matched | 35 | 1 |

Rows whose `class`/`type` field says security, privacy, dpdp or pii-guard: 23 (high 2, medium 9, low 12). That field is set on few rows, so the high-row table below is the better security measure. 17 open rows have no title.

## 2. The 27 open high rows, spot-checked

Of the 27, security/auth/data-write or privacy-erasure: 14 (ISS-052, 119, 120, 121, 122, T057-S12-01, T057-S12-02, quest-successor c0-1, c0-2, c1-2, c1-3, c1-4, c2-1, c2-2). Crisis safety: 3 (t-012-rev-4, t-010-c0-4, quest-successor c1-1). Correctness: 1 (c0-3). Process/instrument: 7 (045, 076, 093, 099, 100, 104, 110). Product-gap: 2 (077, t-039-1).

Totals: STILL-OPEN 11, FIXED-IN-CODE 2, UNSURE 14.

| Id | Verdict | Evidence |
|---|---|---|
| ISS-052 approval screen has no counsellor identity | STILL-OPEN | apps/web has JWT/bearer handling only under `apps/web/src/app/admin/_lib/` (admin login); the approval-screen server code has none. Umesh's 2026-09-27 answer 6 makes it internal-demo-only; it reverts to a blocker if a pilot counsellor sees it or it is served off localhost. |
| ISS-t-012-rev-4 crisis recall vs 0.95 | STILL-OPEN | `12f08ae8` (w1-crisis-recall, PASS fc472c5) moved held-out recall only from 12/28 to 14/28 (0.50). Bar unchanged. Pilot runs with a counsellor present (Umesh, answer 5). |
| ISS-t-010-c0-4 transliterated self-harm missed | STILL-OPEN | Re-run today: `crisisGuard("mujhe lagtaa hai main apnii jaan de duun, kuchh nahiin bachaa")` returns `{"level":"none"}` (packages/engine/src/guards/crisis.ts:992). The control `"I want to end my life"` returns crisis. |
| ISS-076 regression_check coverage | STILL-OPEN | The instrument shipped (`22378808`, merged `8b18fb3`, checker PASS dc3187a Q1-Q4). The row's own bar, real fixed->verified transitions, is not met; the row says 58 named-unverified. |
| ISS-077 O4 application draft (no build tracking) | STILL-OPEN | Tracking exists now: TASKS.md T-038 (D074 core built in an isolated worktree, cycle1 Checker A PASS, Checker B pending). Not merged here; real application target/spec absent. |
| ISS-t-039-1 B18 unimplemented | STILL-OPEN | `doNotAsk` exists only in the cards path (packages/engine/src/cards/relevance.ts:340-351, schemas.ts:151). No `doNotAsk`/`alreadyApproved` in packages/engine/src/scribe. The approved split (QUEUE answer 1) is not built. |
| ISS-104 data_boundary exits 1 | STILL-OPEN | Row's own 2026-10-31 note: exit 1, 115 files, all under qa/. `w1-data-boundary-config` (5918ec63) added vidysea.com and langfuse only; anthropic.com and example.com are still not safe domains. No student data found. |
| ISS-119 export exposes lease token | STILL-OPEN | `packages/db/src/erasure.ts:2018` still returns raw `scribe_resolutions` as `approvalClaims`. `wip/t052-cycle2` is not an ancestor of HEAD. |
| ISS-120 / ISS-121 / ISS-122 t-052 authority and export | STILL-OPEN | Same unit. t-052 manifest Status STALLED (HUMAN_GATE qa/gates/t052-stall.md); TASKS T-052 says cycle2 repairing, no source GO. Fixes live only on unmerged branches. |
| quest-successor c0-2 voice fact fields bypass name redaction | FIXED-IN-CODE (probable) | `apps/api/src/voice.ts:893,1659-1661` redacts with `knownNames`; `apps/api/tests/voice-history.test.ts` exercises student_memory. No verdict names this id. |
| ISS-100 ledger merge duplicates | FIXED-IN-CODE (detection only) | `8b18fb3d` / `22378808`: conformance script reports duplicate copies (Q3 PASS in `qa/verdicts/w1-conformance.md`). Prevention of cross-branch copying is not shown. Row never closed in the ledger. |
| ISS-093, ISS-099 decorative / coverage-absence checks | UNSURE | Detection added by the same merge (Q1, Q2 PASS). The verdict says closing ISS-093 clears its flagged row. Whether the 68 remapped rows' test content was reviewed is not shown. |
| ISS-045 worktree teardown / WinError3 | UNSURE | Last recurrence recorded 2026-09-27. The 2026-10-31 backstop run of data_boundary.py completed (exit 1) with no crash. 85 registered worktrees (`git worktree list`), and ISS-w1-ledger-closes-1 says the 8 s scan budget truncates at 89. |
| ISS-110 hand-rolled test lock | UNSURE | T-040 shipped canonical `scripts/vc-testlock.sh` (PASS e88c1cf, closes ISS-087). Row records a one-off near-miss; no later verdict closes it. |
| ISS-T057-S12-01, -02 and quest-successor c0-1, c0-3, c1-1, c1-2, c1-3, c1-4, c2-1, c2-2 (10 rows) | UNSURE | All created 2026-10-27, all unit quest-successor, manifest still BUILDING at cycle 2 of max 2. S13 fixes landed (`5c1ade42`) and s13-checker-final-5 is PASS, but no verdict cites these ids. `apps/api/tests/voice-history.test.ts` has pending-revision and after-decision cases (lines 94, 118, 126), consistent with fixes but not proof. ISS-sweep-20261031-2 (QUEUE.md:129) asks a checker to map each id to its fix. |

## 3. The 17 TODO rows in QUEUE.md (plus 2 GATED)

QUEUE.md totals: TODO 17, GATED 2, CANDIDATE 103 (99 say low, 4 say medium), 6 `priority` rows in Candidates, 42 DONE rows. Line numbers are QUEUE.md.

| Line | Row | What | Effort | Class |
|---|---|---|---|---|
| 84 | T-010 | Integrate passing scope; fresh B18 leak (c0-2). B1 half is already merged (line 80, `0341837`). | M | hardening |
| 92 | T-035 | DB privacy coverage and crisis escalation wiring; lifecycle subunit PASS, full pipeline was RED at last TASKS note. | M | hardening |
| 94 | ISS-076 | Real fixed->verified transitions for regression_check. | L | nice-to-have |
| 95 | ISS-077 | T-038 application draft target/spec and delivery. | XL | hardening (pilot scope) |
| 98 | ISS-t-025-rev-2 | Counsellor-facing route for concern_flagged edges. | S | nice-to-have |
| 100 | B15 follow-ups | ISS-t-029-rev-1 TTL is done (`w1-erasure-outbox`); rev-2 legacy failed-row re-approval remains. | S | hardening (before live cutover) |
| 102 | B17 Hindi | Hindi UI is on main (T-048); counsellor voice input for approval edits remains. | M | hardening (pilot) |
| 103 | Timeline | Student activity timeline read API and view. | M | nice-to-have |
| 104 | B22 | Novice+VC vs expert harness; blocked on a human rubric from Sapna ma'am. | L, gated | hardening |
| 105 | B18/O8 | Same work as ISS-t-039-1 above. | L | hardening |
| 106 | ISS-079/080 | Human read-through of scribe nodes.ts and graph.ts. | S | nice-to-have |
| 107 | ISS-057 | Human read-through of erasure.ts. | S | nice-to-have |
| 108 | ISS-058 | Decide Claude-only vs delegation ledger. | S | nice-to-have |
| 109 | ISS-060 | Widen data-boundary false-positive note. Overlaps ISS-104. | S | nice-to-have |
| 110 | ISS-081 | Goodhart class, instance 2 (T-010 self-authored eval). | M | nice-to-have |
| 112 | Second-opinion tester | UI-unit tester via LiteLLM, synthetic data. | M | nice-to-have |
| 113 | Release video | Playwright walkthrough with Hindi voice-over; Umesh sends it. | M | hardening (release) |
| 96, 97 GATED | ISS-056, ISS-084 | Hook readers; need `Approved-by: Umesh` before any hook edit. | M | nice-to-have |

First live demo: none of the 17 rows blocks a first local demo. The demo blockers sit outside the row list: (a) the `t057-e2e-local` verdict is FAIL (cycle 1): C6 "propose, confirm, recall" confirmed an unrelated candidate and recall asserts only length and kind, so C11 "10/11" is overstated; (b) the 13 recent high rows above are unconfirmed; (c) the KB `/search` was down in the checker's preflight (owner DevOps). Staleness: lines 84, 100, 102 and 92 describe work that has partly landed since they were written.

Candidates not individually classified: 103 rows plus the 6 `priority` rows. Production-hardening candidates by their own text: vca-secret-separation (security), vca-github-token-scope (security), vca-login-guard-audit (security), the chat helpline-hang/500 row at line 139 (S2, security), data-boundary phone detection (line 144), ISS-sweep-20261031-2 (ledger re-check, line 129), ISS-sweep-20261031-1 (no committed 6c verdict for pushed batch4 `9dbe3b94`), ISS-sweep-20261031-4 (C: at 100%, 3.4 GB free, 13 engine files OOM in a full run).

## 4. Recommended top 10 for the next two weeks

1. One checker pass over the 13 recent high rows (S12-01/02 plus 11 quest-successor), mapping each to its S13 fix and closing or reopening; also close the manifest (ISS-sweep-20261031-2). Clears or exposes half the open highs. Demo gate.
2. Fix `qa/.delivery/requests/t057-walk.mjs` C6: confirm the proposed fact, assert recall content, then re-run `t057-e2e-local`. Demo gate. Do not trust the 10/11 figure until then.
3. Free C: space, then write the batch4 6c verdict from the scratchpad logs (ISS-sweep-20261031-4 and -1). Prerequisite for any further push.
4. Crisis recall (ISS-t-012-rev-4, ISS-t-010-c0-4): extend the guard to transliterated Hinglish and Devanagari ideation, re-measure held-out, target 0.95. Production blocker; pilot needs a counsellor present until then.
5. Umesh decision on `qa/gates/t052-stall.md` (ISS-119 to 122). Those four highs sit on an unmerged, stalled unit and cannot move without it.
6. Chat crisis turn hang and 500 on malformed profile value (QUEUE.md:139): timeout and fail-open to the helpline. Small, safety-relevant.
7. vca security candidates: refuse equal admin/voice secrets, trailing-dot origins, login-guard LRU eviction, github token scope (human question).
8. ISS-052 decision: confirm apps/web stays localhost-only, or schedule counsellor identity under B21. Needs Umesh; costs nothing to record.
9. B18 scribe do-not-ask/already-approved suppression (ISS-t-039-1, QUEUE lines 84 and 105), as approved in D-029.
10. Ledger hygiene: close ISS-093/099/100 if the checker agrees, add anthropic.com and example.com to safe domains (ISS-104), and give the 17 untitled rows titles. Cuts noise before the next sweep.

## 5. Unclassified count

Rows I could not classify: 14 of the 27 high rows are UNSURE (listed in section 2). Of the other 352 open rows, I did not check fixed/open status at all; I only grouped them by keyword, and 35 of the 379 matched no theme. No medium, low or info row was tested against code.
