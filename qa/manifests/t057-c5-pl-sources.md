# Manifest — t057-c5-pl-sources
**Contract:** docs/demo-contract.md C5 (>=1 KB citation in the answer, both surfaces)
**Gate:** qa/gates/t057-c5-pathlynks-sources.md (Answered: (a) build the 2-file fix — Umesh)
**Date:** 2026-10-30
**Fix cycle:** 1 of max 2
**Dual check:** no — no security/auth/tenancy or prod-write trigger (response passthrough + render)
**Persona walk:** skip (one widget list; Mode D browser test covers it)
**Executor:** claude-sonnet-subagent x2 (backend, frontend), parallel
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (two repos, public response shape of /ai/chat gains a field)
Owners: backend, frontend
Fan-out: one message (2 builders)
Round: 2 files + 2 tests, 3 criteria, est 25 min — two small hunks

## Criteria
- C5a: Pathlynks /ai/chat response carries VC `sources` ([] when absent), existing fields unchanged.
- C5b: Pathlynks history items carry `sources` on assistant turns when VC returns them.
- C5c: Quest Guide widget renders a "Sources:" list (title or kind; http(s) links only, target=_blank rel=noopener) under an assistant message with >=1 source; nothing when empty.

## What changed (uncommitted, edited in place; both repos already carry other uncommitted VC hunks — judge only these)
- D:/vc/.worktrees/quest-pathlynks-backend/controllers/pathlynks_quest_controller.js:1338 (aiChat sources), :1435 (history sources)
- D:/vc/.worktrees/quest-pathlynks-backend/tests/parent-journey-regression.test.js:84 (fixture sources passthrough), :154 (new test)
- D:/vc/.worktrees/quest-pathlynks-frontend/src/components/career-quest/AIChatWidget.jsx:525 cleanSources, :547 history, :736 reply, ~:916 render (~45 lines)
- D:/vc/.worktrees/quest-pathlynks-frontend/scripts/student-contract-browser.test.cjs (aiChat mock sources + 2 C5 tests, ~27 lines)

Tests[C5a]: backend tests/parent-journey-regression.test.js (new test at :154)
Tests[C5b]: backend tests/parent-journey-regression.test.js:154 (asserts hist.body.data[1].sources); frontend C5 history tests
Tests[C5c]: frontend node --test --test-name-pattern="C5" scripts/student-contract-browser.test.cjs (2 tests, Chromium)
Pre-check[C5a]: uncommitted backend node test tests/parent-journey-regression.test.js -> new test 1/1 green (red before); file 34/35, 1 pre-existing real-PostgreSQL board-selection failure untouched
Pre-check[C5c]: uncommitted frontend node --test --test-name-pattern="C5" scripts/student-contract-browser.test.cjs -> 2/2 green (0/2 before); file 31/31
Evidence: qa/evidence/t057/c5-pl-backend.md, qa/evidence/t057/c5-pl-frontend.md
Metrics: start=2026-10-30T20:44:41+05:30 end=2026-10-30T20:44:41+05:30 wall_min=6 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=0 defects_unit=0 defects_6c=0

## Fix cycle 1 (verdict 65aef8ac FAIL, D1)
- D1 fixed in place: AIChatWidget.jsx:547 history mapper now always drops raw `sources` and sets only the cleaned value (key removed when nothing survives; user turns lose any raw key).
- New test 'C5 Guide history: hostile or unlabeled sources are cleaned, never passed through raw' (javascript: url without title/kind; mixed list with object title and a non-object) — red before the fix (1 fail), green after.
Pre-check[C5c]: frontend uncommitted node --test scripts/student-contract-browser.test.cjs -> 32/32 green (C5 3/3)

## Status: ready-for-check
