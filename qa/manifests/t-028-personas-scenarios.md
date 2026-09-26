# Manifest — t-028-personas-scenarios

**Contract:** qa/contracts/counselling-engine.md (B17 persona usability, B19 scenario matrix)
**Goal task:** T-028
**Date:** 2026-09-26
**Fix cycle:** 1 of max 3
**Dual check:** no
**Persona walk:** skip (data/config only, no UI surface)
**Issues addressed:** ISS-t-028-c0-1 (high, B19)
**Executor:** claude-sonnet-subagent
**Executor rationale:** data/config authoring task (JSON keys + CSV matrix), no reasoning-heavy build; Sonnet default applies.
**Authority:** docs/DECISIONS.md D-022 (`Changes-authorized`: `qa/adapter.json` add `personas`+`scenarios` keys only; `qa/scenarios/counselling-engine.csv` new)

## What changed
- `qa/adapter.json`:37 — added `"personas"`: an array of the 10 persona objects `{id, who, goal, blocks_on, language, input_mode}` from B17's declared ladder (qa/contracts/counselling-engine.md B17) and docs/intent.md's persona table. `who`/`goal`/`blocks_on` text is taken verbatim/near-verbatim from those two sources. `language`/`input_mode` are set from B17's text where it states them (`gaurav-bhaiya`: `hi`/`voice`; `govt-teacher`: `hi`/not-specified — B17 says "Hindi-first" but does not name an input mode); every other persona has no language/input-mode text in B17 or intent.md, so both fields are the literal string `"not-specified"` rather than an invented value.
- `qa/adapter.json`:117 — added `"scenarios": "qa/scenarios/counselling-engine.csv"`. Every other key is byte-identical to the pre-existing file (verified below).
- `qa/scenarios/counselling-engine.csv` (new) — 57 rows, header `id,persona,type,preconditions,steps,expected`, covering every flow named in the brief and every must-include case B19 lists (India-only student SC-035, two-years-out student SC-038, a Hinglish session SC-039, a concern-level turn SC-024/025/026, an erasure request mid-session SC-033/034, the AI-down `rules`-provider path SC-017/018). Rows for capability that is not yet built (T-010 live cards, T-025 API/JWT, T-027 webhooks, and — found while reading TASKS.md, not asked for by name but genuinely unbuilt — T-012 crisis-escalation notify/downgrade and T-022 concern-flag-and-continue) carry `preconditions` exactly `not-yet-built:<T-id>` so a run records them `skip`, per the brief's instruction.

## How to verify (commands + expected)
- `python -c "json.load(open('qa/adapter.json'))"` → expected: no exception (valid JSON)
- key-diff of `qa/adapter.json` against `git show HEAD:qa/adapter.json` → expected: only `personas` and `scenarios` added; no other key changed
- a Python check parsing `qa/scenarios/counselling-engine.csv` → expected: parses, row count >= 50, no duplicate ids, both `happy` and `negative` types present, every persona id in the CSV is in `adapter.json` personas, and every one of the 10 adapter personas appears at least once
- `python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc/.worktrees/t-028-personas-scenarios` → expected: no NEW violation in this unit's own files (pre-existing ISS-060 hits on other files are a known false positive, not a gate)

## Actual outputs (from maker's own run)

**JSON parse + top-level keys:**
```
parsed OK, top-level keys: ['adapter', '_why', 'unit_vocab', 'data_class', 'real_data_markers', 'personas', 'scenarios', 'verify', 'artifact', 'isolation', '_markers_note']
personas count: 10
scenarios: qa/scenarios/counselling-engine.csv
```

**Key diff against `git show HEAD:qa/adapter.json`:**
```
added keys: {'scenarios', 'personas'}
removed keys: set()
changed common keys (should be empty): []
```

**CSV verification script:**
```
adapter persona ids: ['au-agent', 'ca-consultant', 'gaurav-bhaiya', 'gaurav-pm', 'govt-teacher', 'jaipur-counsellor', 'sapna-expert', 'school-counsellor', 'uk-counsellor', 'us-counselor']
row count: 57
duplicate ids: []
types present: {'negative', 'happy'}
rows with bad type: []
personas used in csv: ['au-agent', 'ca-consultant', 'gaurav-bhaiya', 'gaurav-pm', 'govt-teacher', 'jaipur-counsellor', 'sapna-expert', 'school-counsellor', 'uk-counsellor', 'us-counselor']
persona ids in csv but not in adapter (should be empty): set()
adapter personas never used in csv (should be empty): set()
per-persona row counts: {'gaurav-pm': 26, 'jaipur-counsellor': 10, 'sapna-expert': 3, 'school-counsellor': 5, 'gaurav-bhaiya': 3, 'uk-counsellor': 2, 'us-counselor': 2, 'au-agent': 2, 'ca-consultant': 2, 'govt-teacher': 2}
per-type row counts: {'happy': 37, 'negative': 20}
ALL CHECKS PASSED
```

**`data_boundary.py` run against the worktree:**
```
[VIOLATION] D:\vc\.worktrees\t-028-personas-scenarios\docs\DECISIONS.md
    project declares data_class=synthetic but this file carries 2 email address(es)
[VIOLATION] D:\vc\.worktrees\t-028-personas-scenarios\qa\issues.jsonl
    project declares data_class=synthetic but this file carries 2 email address(es)
[VIOLATION] D:\vc\.worktrees\t-028-personas-scenarios\qa\evidence\t-008-approval-ui\test.txt
    project declares data_class=synthetic but this file carries 1 email address(es)
[VIOLATION] D:\vc\.worktrees\t-028-personas-scenarios\qa\evidence\t-018-approval-followups\test.txt
    project declares data_class=synthetic but this file carries 1 email address(es)
[VIOLATION] D:\vc\.worktrees\t-028-personas-scenarios\qa\evidence\t-020-reject-reason-ui\test.txt
    project declares data_class=synthetic but this file carries 1 email address(es)
[VIOLATION] D:\vc\.worktrees\t-028-personas-scenarios\qa\gates\config-audit-fixes.md
    project declares data_class=synthetic but this file carries 2 email address(es)

6 file(s) breach the declared data class. Move them out of this project, or change the declaration deliberately and say why.
```
All 6 hits are on pre-existing files this unit never touched (`docs/DECISIONS.md`, `qa/issues.jsonl`, three `qa/evidence/**/test.txt`, `qa/gates/config-audit-fixes.md`) — the pre-existing false positive tracked as ISS-060. `grep -c "@" qa/scenarios/counselling-engine.csv qa/adapter.json` → `0` and `0` for both new files: no new hit.

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| every persona id used in the scenario CSV exists in `adapter.json`'s `personas`, and every declared persona is used at least once | a Python membership check (`check.py`, pasted below) comparing the two sets | in a throwaway copy outside the worktree, delete the `govt-teacher` object from `adapter.json`'s `personas` array | before: `PERSONA-MEMBERSHIP: PASS \| missing_from_csv=[] \| csv_persona_not_in_adapter=[]` — after: `PERSONA-MEMBERSHIP: FAIL \| missing_from_csv=[] \| csv_persona_not_in_adapter=['govt-teacher']` |

The falsification ran against a copy of both files in the session scratchpad (`.../scratchpad/falsify/`), never against the worktree or the live adapter — the check script:
```python
import csv, json, sys
adapter = json.load(open(sys.argv[1], encoding='utf-8'))
persona_ids = set(p['id'] for p in adapter['personas'])
rows = list(csv.DictReader(open(sys.argv[2], encoding='utf-8')))
used_personas = set(r['persona'] for r in rows)
missing_personas = persona_ids - used_personas
not_in_adapter = used_personas - persona_ids
ok = not missing_personas and not not_in_adapter
print("PERSONA-MEMBERSHIP:", "PASS" if ok else "FAIL", "| missing_from_csv=%s | csv_persona_not_in_adapter=%s" % (sorted(missing_personas), sorted(not_in_adapter)))
```

## Live browser evidence
Not UI-touching — no surface changed. This unit only edits `qa/adapter.json` (add two keys) and adds `qa/scenarios/counselling-engine.csv`; no code, screen, or flow in `apps/web` or `apps/api` was touched.

## Fix cycle 1

**Checker verdict (cycle 0, `qa/verdicts/t-028-personas-scenarios.md`, commit `9ff8aed`): FAIL**

**ISS-t-028-c0-1 (high, B19), quoted in full:**

> **[B19] sev: high · SC-028, SC-029, SC-030, SC-031 and SC-033 describe the B15 approver-erasure workflow (double confirm → email-outbox approver → `autoDelete` default false → HMAC pseudonym → fence+24h, per the 2026-09-26 gate answer folded into the contract) as ordinary runnable rows, but `packages/db/src/erasure.ts` — read in full — implements only the older single-confirm model: `requestErasure` (pending) → one `confirmErasure` by a different actor (confirmed) → `executeErasure`. There is no approver, outbox, or `autoDelete` code anywhere (`grep -rniE "approver|autoDelete|outbox|HMAC" packages/ apps/` hits only erasure.ts's own comments proposing HMAC as a future option); the audit hash is still salted sha256 (`HASH_SCHEME`), not HMAC; `ERASURE_FENCE_GRACE_MS` is hardcoded `0`, not the 24h the same gate recommended. No task in TASKS.md builds this — T-011/T-014/T-015/T-016/T-017 are all `done` and predate the amendment, and no later T-id claims it — so there is not even a valid `<T-id>` these rows could cite for a `not-yet-built:<T-id>` marker. Net effect: B19's required "erasure request mid-session" scenario has no row that is honestly runnable against the shipped code today, even though the underlying mid-session write-fence (single-confirm model) is already built and tested (T-011/T-014-017) and could have been the row instead. Fix direction: either (a) rewrite SC-028/029/030/031/033 against the actually-shipped single-confirm+fence model and add a *separate* row explicitly marked `not-yet-built:<new-T-id>` for the approver/outbox/autoDelete/HMAC pieces once a task exists to build them, or (b) create that task now and mark all five rows `not-yet-built:<that-id>` — but then also add one currently-testable row so B19's mid-session-erasure requirement has real coverage in the meantime. issue: ISS-t-028-c0-1**

Between cycle 0 and cycle 1, main gained **T-029** ("B15 erasure approver workflow", `TASKS.md` row 40, status `open`, explicitly noting "T-028 scenario rows SC-028..034 exercise it") and was merged into this branch (`3381cf9`), giving the checker's option (b) a real `<T-id>` to cite. `qa/adapter.json` was not touched (D-022's authorization doesn't cover it, and the fix needs no adapter change).

### What changed (cycle 1)
- `qa/scenarios/counselling-engine.csv`:
  - **SC-028, SC-029, SC-030, SC-031, SC-033** — `preconditions` set to `not-yet-built:T-029` (these five describe the double-confirm / email-outbox approver / `autoDelete` / HMAC / 24h-hold workflow that `packages/db/src/erasure.ts` does not implement today; T-029 is the task that will build it). SC-033's steps/expected reworded to name the T-029 approver workflow explicitly, so it no longer reads as testable against today's code.
  - **SC-032** — reworded from "an approved erasure purge" to "a confirmed erasure request (confirmErasure) is executed" / "executeErasure runs and one collection's deleteMany fails" / "...marked failed (ErasureIncompleteError)...", citing the real shipped function and error class (`packages/db/src/erasure.ts` lines ~994-1009 `executeErasure`, `ErasureIncompleteError` class ~199-212) instead of the ambiguous word "approved". Left **without** a `not-yet-built` marker: partial-failure handling is shipped today.
  - **SC-034** — reworded to name the shipped fence functions (`setErasureFence`/`isStudentFenced`) instead of vague "the fence window" language. Left **without** a `not-yet-built` marker: the fence and its read-back-after-fence invariant are shipped (D-015/D-016, T-011/T-014-017).
  - **SC-058 (new)** — added to give B19's "erasure request mid-session" requirement an honestly runnable row against the model that ships today: `requestErasure` → `confirmErasure` by a different actor (sets the fence via `setErasureFence`) → a mid-session scribe write refused/undone by the fence (`assertStudentNotFenced` / `compensateIfFenced`, throwing `StudentFencedError`) → `executeErasure` purges and reads back zero. Function names cited directly from `packages/db/src/erasure.ts`.
- `qa/manifests/t-028-personas-scenarios.md` (this file): cycle-1 section, updated `Fix cycle`/`Issues addressed`, `Status`.
- `qa/adapter.json`: **not touched** in cycle 1.

Row count: 57 → **58**.

### How to verify (cycle 1)
- The same structural CSV check as cycle 0, extended with two new assertions: (a) every `not-yet-built:<T-id>` precondition names a `T-id` whose `TASKS.md` row status starts with `open`; (b) at least one erasure-related row carries no `not-yet-built` marker (so B19's mid-session-erasure case has live coverage).

### Actual outputs (cycle 1, from the worktree)
```
--- worktree (real run) ---
row count: 58
duplicate ids: []
types present: {'negative', 'happy'}
persona ids in csv but not in adapter: []
adapter personas never used in csv: []
not-yet-built rows found: [('SC-022', 'T-012'), ('SC-023', 'T-012'), ('SC-024', 'T-022'), ('SC-025', 'T-010'), ('SC-026', 'T-012'), ('SC-028', 'T-029'), ('SC-029', 'T-029'), ('SC-030', 'T-029'), ('SC-031', 'T-029'), ('SC-033', 'T-029'), ('SC-053', 'T-010'), ('SC-054', 'T-025'), ('SC-055', 'T-025'), ('SC-056', 'T-027'), ('SC-057', 'T-027')]
not-yet-built rows citing a non-open (or unknown) task (should be empty): []
erasure-related rows with NO not-yet-built marker (need >=1): ['SC-032', 'SC-034', 'SC-058']
ALL CHECKS PASSED
```
(Row-count, duplicate-id, type, and persona-membership assertions all re-run and green; unchanged from cycle 0 apart from the count. `data_boundary.py` was not re-run in cycle 1 — the CSV's only new content is function names, error-class names and prose, no new email-shaped strings; a `grep -c "@"` on the changed file still returns 0.)
```
$ grep -c "@" qa/scenarios/counselling-engine.csv
0
```

### Capability coverage (cycle 1 addition)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| every `not-yet-built:<T-id>` precondition in the scenario CSV names a task that is genuinely still `open` in `TASKS.md` (never a stale marker on a task that shipped) | the `verify_c1.py` check's "not-yet-built rows citing a non-open (or unknown) task" assertion | in a throwaway copy of `TASKS.md` + the CSV + `adapter.json` outside the worktree (`.../scratchpad/falsify/t028c1/`), changed the `T-029` row's status column from `open` to `done` (single-hunk, one line) | before: `not-yet-built rows citing a non-open (or unknown) task (should be empty): []` → `ALL CHECKS PASSED` (exit 0). After: `not-yet-built rows citing a non-open (or unknown) task (should be empty): [('SC-028', 'T-029', 'done'), ('SC-029', 'T-029', 'done'), ('SC-030', 'T-029', 'done'), ('SC-031', 'T-029', 'done'), ('SC-033', 'T-029', 'done')]` → `CHECKS FAILED` (exit 1) — fires for the named reason (the five rows citing T-029, and only those) not a parse/import crash; every other assertion in the same run (row count, duplicates, types, persona membership, the untagged-erasure-row check) still printed green in the same output. |

The check script (`verify_c1.py`, run against `(adapter.json, counselling-engine.csv, TASKS.md)` triples):
```python
def load_tasks_status(tasks_path):
    status = {}
    pat = re.compile(r"^\|\s*(T-\d+[a-z]?)\s*\|\s*([^|]+?)\s*\|")
    for line in open(tasks_path, encoding="utf-8"):
        m = pat.match(line)
        if m:
            status[m.group(1)] = m.group(2).strip()
    return status
...
nyb_pat = re.compile(r"^not-yet-built:(T-\d+[a-z]?)$")
bad_nyb = []
for r in rows:
    m = nyb_pat.match(r["preconditions"].strip())
    if m:
        tid = m.group(1)
        st = tasks_status.get(tid)
        if st is None or not st.lower().startswith("open"):
            bad_nyb.append((r["id"], tid, st))
```

## Status: checked-PASS (cycle 1, verdict 2637f20)
