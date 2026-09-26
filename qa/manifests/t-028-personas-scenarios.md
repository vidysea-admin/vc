# Manifest — t-028-personas-scenarios

**Contract:** qa/contracts/counselling-engine.md (B17 persona usability, B19 scenario matrix)
**Goal task:** T-028
**Date:** 2026-09-26
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (data/config only, no UI surface)
**Issues addressed:** none
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

## Status: ready-for-check
