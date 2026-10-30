# VC status report: T-057 demo close-out (go-live)

Snapshot: 2026-10-30 22:45 IST · worktree `D:\vc\.worktrees\vc-completion` · branch `codex/vc-completion` @ `fa678fb4`
Contract: `docs/demo-contract.md` C1–C11 (frozen, D-124) · latest verdict `qa/verdicts/t057-demo-closeout.md` = **PASS-WITH-HOLD**

## 1. Headline numbers

| Metric | Value |
|---|---|
| Demo criteria C1–C11 met | **7 / 11** (C3, C6, C7, C8, C9, C10, C11) |
| Criteria blocked on an outside cause | **4 / 11** (C1, C2, C4, C5): all need DevOps, none need code |
| Code left to build for go-live | **0** |
| Optional builders running now | **2** (in parallel) |
| Decisions written today | **5** (D-138, D-139, D-140, D-141, D-142) |
| Pushed to `vidysea/main` | `94462c7a` (D-138 + D-139 + D-140) |
| Units checker-PASSed today | **3** (t057 close-out, d140-voice-cost, t057-c5-pl-sources) |
| Ledger `qa/issues.jsonl` (all time) | 974 rows · open 368 (high 27 · medium 92 · low 240 · info 9) |
| Manifests closed `checked-PASS` (all time) | 65 |

## 2. Done ✅

| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | Crisis helpline only on the crisis turn (D-138) | `t057-demo-closeout.md`: crisis tests 19/19, api tests 125/125 | PASS, pushed |
| 2 | Voice tool 20 s timeout plus a filler line (D-139) | same verdict: falsified (5 s cap turns the test red), restored 61/61 | PASS, pushed |
| 3 | Voice cost tracking + tool-call log (D-140) | `qa/verdicts/d140-voice-cost.md` | PASS, pushed |
| 4 | C10 real voice turn, no cap, cost tracked | `qa/evidence/t057/c10-voice-real.md`, `c10-voice-d139.md` (71 audio frames, 316-char answer) | MET with gaps |
| 5 | C5 Pathlynks sources fix (frontend `AIChatWidget.jsx` + backend controller) | `qa/verdicts/t057-c5-pl-sources.md` cycle 1 PASS · frontend 32/32 · backend 34/35 (1 = local PG17 setup, not code) | PASS, **not committed in the Pathlynks repos** (Umesh sends the PR) |
| 6 | Progress routing ("Career Quest mein kitna aage") | `classify.ts:215`, b529a740 | Fixed |
| 7 | Vidysea walk | run 9: **11/11 OK** (has the D-138 + D-139 code) | MET |
| 8 | Pathlynks walk | run 3: **15/15** (10-29, before D-138) | Stale, needs run 4 |
| 9 | KB PR #33 (search speed) | merged `642dd094` | Merged, **not deployed** |
| 10 | D-138 Hindi quotes were mojibake | **D-141** restates D-138 with correct Hindi (cause: `append_decision.ps1:47` reads without an encoding) | Done `fa678fb4` |
| 11 | Worktree branch was missing the pushed D-140 code | merged `vidysea/main` → `b9e3728e` | Done |

## 3. Per criterion (C1–C11)

| C | State | Blocked by |
|---|---|---|
| C1 | ❌ BLOCKED-EXTERNAL | Pathlynks DB allow-list + KB redeploy (preflight 2/4 OK, re-run 22:28) |
| C2 | ❌ BLOCKED-EXTERNAL | Pathlynks DB (all 8 blocks `connect_error`) |
| C3 | ✅ MET | none |
| C4 | ❌ BLOCKED-EXTERNAL | Pathlynks DB (fit scores and traits live there) |
| C5 | ❌ BLOCKED-EXTERNAL | KB `/search` still slow (4016 ms → unavailable), plus the Pathlynks PR deploy |
| C6 | ✅ MET (weak) | none |
| C7 | ✅ MET (indirect) | none |
| C8 | ✅ MET | none (37/37 unit, live 401 probe 12/12) |
| C9 | ✅ MET | none |
| C10 | ✅ MET with gaps | none |
| C11 | ✅ Vidysea / ⚠ Pathlynks stale | Pathlynks walk run 4 (needs the DB) |

Preflight now (22:28): `mongo virtual_counsellor OK · pathlynks db FAIL connect_error · vidysea db OK · kb /search FAIL 4016 ms`.

## 4. Remaining ⏳

### 4a. Blockers outside the code (go-live waits on these)
| # | What | Owner | Unblocks |
|---|---|---|---|
| A | KB `/api/search` redeploy (PR #33 is merged but not deployed) | DevOps | C1, C5 |
| B | Pathlynks DB allow-list for this machine (IP `106.219.71.21` changes; a fixed IP or VPN is better) | DevOps | C1, C2, C4, C11 |
| C | Send the Pathlynks PR (fix is ready but uncommitted in both Pathlynks worktrees) | Umesh | C5 on Pathlynks |
| D | Pathlynks deploy of that PR | Pathlynks team | C5 live |
| E | Rotate DB_PASS | Umesh | hygiene |

### 4b. Running now (parallel builders, optional, D-142)
| # | Unit | Worktree | Progress at 22:44 |
|---|---|---|---|
| 1 | voice-inner-caps: inner 5 s read caps under the 20 s voice tool | `.worktrees/voice-inner-caps` | ✅ **checked-PASS** (verdict `698850bc`, 2 falsifications red as expected; senior review Approve) · **merged `8bc12c5d`** · not pushed |
| 2 | t059-promise-floor: T-059 idioms + Hindi "koi baat nahi" etc. | `.worktrees/t059-promise-floor` | checker **PASS** cycle 0 (verdict `d79b49f8`, 4 falsifications, 16 hostile promises all caught) · senior review **Warning** (1 regression, "na pakka" still missed) → repair cycle 1 ✅ **checked-PASS** (verdict `500608e6`: R1–R4 hold, ~40 hostile sentences, 142/142, importers 232/232; 3 low over-flags → ledger) · **merged `9dbe3b94`** · not pushed |

Each gets its own /checker when it returns. Nothing is pushed until the checker PASSes, the push gate is green and Umesh says yes.

| 3 | t061-voice-crisis-lang: voice crisis reply in the student's language (D-143) | `.worktrees/t061-voice-crisis-lang` | ✅ **checked-PASS** (verdict `3696adda`: Hindi + Hinglish red on base → green with the real detector, anonymous route checked too, hostile variants pass; 21/21; tsc 0) · **merged `c8f60fcc`** · not pushed · senior review **Approve** (2 low: stale comments voice.ts:27/:311, thin anon-route test) |
| 4 | t060-voice-turn-id: provider turn id for voice readout attribution (D-143) | `.worktrees/t060-voice-turn-id` | **ready-for-check `1fe5be88`** (6 new tests; 35/35 providers, 160/160 + 86/86 api; tsc 0). Caveat: Gemini sends no turn id, so the new path is inert in production and the S13 arrival rule still decides · ✅ **checked-PASS** (verdict `fea088c2`, C1 red on base in both packages, 6 hostile variants pass) · senior review Warning (2 low, fail-closed → ledger ISS-t060-voice-turn-id-1/2) · **merged** · not pushed |

All 4 units checked-PASS and merged at `9dbe3b94`. **6c pre-push GREEN** (typecheck 0; full suite: 9 packages all pass, engine 2240/2285 pass 0 fail on rerun after 13 OOM files from low C: disk, each passing alone; merged voice.ts tests 91/91). `push-gate: green 370f9e58` (exit 0). **Pushed** `94462c7a..fd45b26d` → `vidysea/main` at **2026-10-31 04:01:56 IST (reflog)**, 38 commits, fast-forward, on Umesh's "Haan, push karo". Gate re-run before the push in the 6c worktree (`wt6c-batch4`, where the checker's stamp lives): `push-gate: green cedf6de7a19ab6023ee0eb18cb2c8e857f0c37ed` exit 0 (only `qa/verdicts/d139-6c.md` changed since the stamp).

### 4c. Open follow-ups that are not started (need a yes)
| # | Task | Why it matters |
|---|---|---|
| D-141 note | `append_decision.ps1:47` reads without an encoding | Enforcement path: needs an `Approved-by` entry |

### 4d. Wider backlog (outside T-057, not part of go-live)
T-010, T-035, T-038, T-048, T-049, T-050, T-052, T-055, T-056, T-058, and 17 QUEUE TODO rows.

## 5. ETA

| Step | Time after its trigger |
|---|---|
| 2 optional builders → checkers | ~30–45 min from 22:30 |
| A done → C5 re-walk on both surfaces | ~10 min |
| B done → Pathlynks walk run 4 | ~15 min |
| A + B done → final checker C1–C11 → TASKS.md T-057 row | ~15–20 min |
| **T-057 closed** | **~45–60 min after A and B both land** |
| Pathlynks side live | after C + D |

VC itself is already live on `vidysea/main` (`94462c7a`). The date of full go-live depends only on DevOps (A, B) and the Pathlynks PR (C, D).

## 6. Corrections to my earlier messages
- I said "Vidysea walk run 6 10/10". The latest is **run 9, 11/11**.
- I said only C1 and C5 were blocked. **C2 and C4 are also blocked** on the same Pathlynks DB.
- I quoted "full suite 888/888" without naming the run. The checked numbers are the verdict's focused runs (19/19, 125/125, 61/61) and frontend 32/32.
