# Verdict — t-028-personas-scenarios

**Date:** 2026-09-26
**Cycle checked:** 0
**Checker:** claude-sonnet-subagent (fresh context, no builder reasoning)
**Bound root:** D:/vc/.worktrees/t-028-personas-scenarios
**Base:** eabddf3 · **Head:** d17785b (verified: `git log -1` in the worktree)
**Authority:** docs/DECISIONS.md D-022, `Changes-authorized`: `qa/adapter.json` (add `personas`+`scenarios` keys only), `qa/scenarios/counselling-engine.csv` (new)

## What I re-ran myself

- `python -c "json.load(open('qa/adapter.json'))"` → no exception. Matches.
- Key-diff of `qa/adapter.json` vs `git show HEAD:qa/adapter.json` (re-derived in Python, not the maker's script) → `added={personas, scenarios}`, `removed=set()`, `changed=[]`. Matches.
- CSV structural check (re-derived independently, not the maker's pasted script): row count 57, no duplicate ids, types = {happy, negative} only, every CSV persona id is in adapter, every adapter persona id is used at least once. Matches the manifest's pasted output exactly.
- `grep -c "@" qa/scenarios/counselling-engine.csv qa/adapter.json` → 0, 0. No email-shaped data in the two new files.
- `python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc/.worktrees/t-028-personas-scenarios` → same 6 pre-existing VIOLATION lines as the manifest pasted, none on the two new files. Cross-checked `ISS-060` on the ledger: it documents this exact set of 34-repo-wide hits (umeshsugara@vidysea.com staff address + a `pass@eu.cloud.langfuse.com` credential-URL false match) as an accepted false positive. B13 (synthetic-only) holds for this unit's own files.
- `git diff eabddf3...HEAD --stat` → exactly 3 files: `qa/adapter.json` (+83), `qa/manifests/t-028-personas-scenarios.md` (+97), `qa/scenarios/counselling-engine.csv` (+58, new). Nothing else touched, nothing deleted or renamed. Matches "What changed" and D-022's authorization exactly. No diff-scope violation (step 4c).
- Not UI-touching, confirmed against the diff (no path under `apps/web` or `apps/api`), not merely asserted.

## Capability coverage (step 4b)

One claimed capability, one row. Reproduced in a **throwaway copy outside the bound root**
(`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/<session>/scratchpad/falsify/t028copy/`, containing only
`adapter.json` + `counselling-engine.csv` + the pasted `check.py`, copied from the worktree, never edited in place):

- **Before** (copy, unmodified): `PERSONA-MEMBERSHIP: PASS | missing_from_csv=[] | csv_persona_not_in_adapter=[]` — green, proving the copy is real.
- **Falsifying edit** (single-hunk, the one file named in "What changed"): removed the `govt-teacher` object from the copy's `adapter.json.personas` array.
- **After**: `PERSONA-MEMBERSHIP: FAIL | missing_from_csv=[] | csv_persona_not_in_adapter=['govt-teacher']` — red, and for the right reason (the assertion that fired is exactly the membership check the row claims to isolate, not a parse/import crash).

**CAPABILITY-COVERAGE: 1/1 reproduced.**

## Judgment against the checked criteria

**Personas faithful to B17, "not-specified" honest:** all 10 `who`/`goal`/`blocks_on` triples trace verbatim or near-verbatim to either B17's bullet text or `docs/intent.md`'s persona table (cross-checked line by line, e.g. `sapna-expert.goal` = "the benchmark, and the reviewer of VC's suggestions" matches intent.md's table cell exactly; `ca-consultant.goal` = B17's "VC must never give visa advice there"). `language`/`input_mode` are `"not-specified"` for every persona except `gaurav-bhaiya` (`hi`/`voice`, matches B17's explicit "Hindi and by voice, no typing") and `govt-teacher` (`hi`/`not-specified`, matches B17 saying "Hindi-first" but never naming an input mode). No invented values found. **Met.**

**≥50 rows:** 57, re-counted myself. **Met.**

**B19 must-include list, checked row by row:**
- India-only student → SC-035. Present.
- Two-years-out student → SC-038. Present.
- Hinglish session → SC-039. Present.
- Concern-level turn → SC-024/025/026. Present (also correctly carry `not-yet-built:T-022`/`T-012`/`T-010`, all confirmed **open** in TASKS.md).
- AI-down `rules`-provider path → SC-017/018. Present, and directly testable today (T-005's e2e already exercises `VC_LLM_PROVIDER=rules`, no not-yet-built marker needed here).
- **Erasure request mid-session → SC-033/034 — see FAILURES below.** Structurally present as rows, but not honestly runnable against the shipped code.

**Actionable rows:** spot-checked across personas (jaipur-counsellor approval rows, the 4 international-policy rows, gaurav-bhaiya's 3 rows) — concrete steps and a checkable expected outcome in each, not vague prose.

**International personas are real rule checks:** SC-046 ("the engine never gives visa advice for Canada; it redirects to a licensed consultant instead") matches the checker task's own example. SC-040/041 (GDPR/UCAS/UKVI), SC-042/043 (FERPA/NACAC), SC-044/045 (ESOS/PIER commission disclosure) each name the specific market rule and a checkable pass/fail direction, not generic "policy compliance" filler. **Met.**

**gaurav-bhaiya finishable in Hindi by voice, no typing:** his 3 rows (SC-019, SC-048, SC-049) are internally consistent with that constraint — SC-048 is the explicit full-flow happy path, SC-049 is the negative (any typed/English-only screen blocks him, filed as a high-severity persona finding, matching B17's own framing). **Met.**

**not-yet-built preconditions vs TASKS.md:** T-010, T-012, T-022, T-025, T-027 are all `open` in TASKS.md — re-checked myself, not taken on the manifest's word. Every row citing one of those five is accurate. **Met, for those five.**

## FAILURES

- **[B19] sev: high · SC-028, SC-029, SC-030, SC-031 and SC-033 describe the B15 approver-erasure workflow (double confirm → email-outbox approver → `autoDelete` default false → HMAC pseudonym → fence+24h, per the 2026-09-26 gate answer folded into the contract) as ordinary runnable rows, but `packages/db/src/erasure.ts` — read in full — implements only the older single-confirm model: `requestErasure` (pending) → one `confirmErasure` by a different actor (confirmed) → `executeErasure`. There is no approver, outbox, or `autoDelete` code anywhere (`grep -rniE "approver|autoDelete|outbox|HMAC" packages/ apps/` hits only erasure.ts's own comments proposing HMAC as a future option); the audit hash is still salted sha256 (`HASH_SCHEME`), not HMAC; `ERASURE_FENCE_GRACE_MS` is hardcoded `0`, not the 24h the same gate recommended. No task in TASKS.md builds this — T-011/T-014/T-015/T-016/T-017 are all `done` and predate the amendment, and no later T-id claims it — so there is not even a valid `<T-id>` these rows could cite for a `not-yet-built:<T-id>` marker. Net effect: B19's required "erasure request mid-session" scenario has no row that is honestly runnable against the shipped code today, even though the underlying mid-session write-fence (single-confirm model) is already built and tested (T-011/T-014-017) and could have been the row instead. Fix direction: either (a) rewrite SC-028/029/030/031/033 against the actually-shipped single-confirm+fence model and add a *separate* row explicitly marked `not-yet-built:<new-T-id>` for the approver/outbox/autoDelete/HMAC pieces once a task exists to build them, or (b) create that task now and mark all five rows `not-yet-built:<that-id>` — but then also add one currently-testable row so B19's mid-session-erasure requirement has real coverage in the meantime. issue: ISS-t-028-c0-1

## Scope / authority check

D-022's `Changes-authorized` is exactly `qa/adapter.json` (add `personas`+`scenarios` keys only) and `qa/scenarios/counselling-engine.csv` (new). The diff touches exactly those two files plus the manifest itself — nothing else. No out-of-scope edit found.

---

VERDICT: FAIL
SCOREBOARD: 6/7 criteria met, 2/2 invariants hold
FAILURES (if any):
- [B19] sev: high · SC-028/029/030/031/033 describe the not-yet-built B15 approver workflow without a `not-yet-built` precondition and with no T-id to cite one from, leaving B19's mid-session-erasure requirement without an honestly runnable row · rewrite against the shipped single-confirm+fence model and/or open a task for the approver workflow, marking those rows `not-yet-built:<id>` · issue: ISS-t-028-c0-1
CAPABILITY-COVERAGE: 1/1 rows reproduced
LIVE-BROWSER: not-applicable (diff touches only qa/adapter.json, qa/manifests/t-028-personas-scenarios.md, qa/scenarios/counselling-engine.csv — no apps/web or apps/api path)
ISSUES-WRITTEN: ISS-t-028-c0-1
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: JSON validity, the adapter key-diff, the CSV structural checks, the data-boundary run, and the diff-scope check all reproduced exactly as the manifest claimed, and the sole capability-coverage row falsifies correctly in a throwaway copy. The unit fails on content correctness: five scenario rows (SC-028/029/030/031/033) describe a B15 erasure sub-workflow (approver, outbox, autoDelete, HMAC, 24h fence) that `packages/db/src/erasure.ts` does not implement and that no TASKS.md entry is building, so they are neither accurately testable today nor properly marked as future work — and this leaves B19's explicit "erasure request mid-session" must-include scenario without a row that is honest against the shipped code.
