# Verdict: t057-c6-sensitivity (Mode A feature check, Tier M, single check)

Cycle checked: 0
Overall: PASS

Bound: manifest f3455075, candidate dfb0f8cc, base 6651819d. Worktree HEAD was 259520ea when the tests ran (later widget-only commits by another session; they do not touch the 3 files). No live LLM called; no student data.

## Diff scope
`git diff 6651819d dfb0f8cc --name-only` -> exactly packages/engine/src/scribe/schemas.ts, packages/engine/tests/student-fact-extractor.test.ts, skills/fact-extraction/SKILL.md (29 insertions, 2 deletions). Matches the manifest list; nothing else.

## Outcome proof (MockProvider through extractStudentTurnFacts, plus verifyCandidateFact for the stored label)
Probe files ran in a COPY of packages/engine (scratchpad, node_modules junctioned), deleted afterwards; bound tree untouched.
Kept, stored label via verifyCandidateFact: "normal"->medium, "Normal"->medium, "NORMAL"->medium, "normal\t"->medium, " normal "->medium, "\tnormal\n"->medium, "normal"+NBSP->medium, "low"->low, " LOW "->low, "low "->low, "medium"->medium, "HIGH"->high.
Dropped with reason "malformed fact: provider output did not match the required candidate schema": "secret", "", 3, null, undefined, "n0rmal", "normal-ish", "nor mal", ["normal"], {v:"normal"}, true.
Result: "normal" (every case/whitespace variant) never yields "low"; hostile near-misses are dropped, not coerced.

## Low-only consumers
`grep sensitivity ===` over src/apps/mcp (excluding .worktrees, qa/evidence, tests): the only low-only consumer is packages/engine/src/cards/nodes.ts:135 (buildKbQuery filter f.sensitivity === "low"). A former-"normal" fact is now "medium", so it is excluded from the external KB query; no consumer newly receives it as low. A former-"normal" fact only ever reaches a consumer as medium.
Observation: the live student chat/voice path (extractStudentTurnFacts, nodes.ts:1328) returns {key,value,quote,sourceLang} and discards the model's sensitivity entirely, so on that path the label only decides keep-vs-drop. The label is stored only on the scribe (post-session) path (nodes.ts:1122).

## Falsification (in a copy)
Copy schemas.ts reverted to 6651819d: student-fact-extractor.test.ts -> the new test "t057 run7 c6 ..." FAILS ("sensitivity \"normal\" must not drop the fact"), 17 pass. Restored dfb0f8cc file: all 18 pass. (A separate "LK6: read-only audit proposal" test fails in the copy in both states because it resolves a repo-relative script path that does not exist in the copy; it passes in the bound tree, below. Not caused by the change.)

## Manifest commands, run by the checker in the bound tree
`cd packages/engine && node --import tsx --test tests/student-fact-extractor.test.ts tests/scribe*.test.ts` -> tests 211, pass 211, fail 0, skipped 0 (matches the manifest's 211/0).
`pnpm -r --filter @vc/engine exec tsc --noEmit -p .` -> exit 0.

## Not verified
The SKILL.md wording change (prompt) cannot be proved without a live model; the manifest's 3/3 live repro and browser run 7c/7d are the maker's local evidence, not re-run (qa/evidence/t057 gitignored). The schema fix does not depend on the prompt.

## Residuals
PROPOSED-ISSUE: low | No deterministic sensitive-topic floor: a model-labelled "high"-worthy fact labelled "normal" is stored as "medium", and on the student path the label is discarded, so sensitivity is entirely model-trusted (ai-engineer review already listed this under Candidates).
PROPOSED-ISSUE: low | No labelled-sensitivity eval exists to measure how often the model mislabels (same Candidates item).

Metrics: start=2026-11-01T09:55:00+05:30 end=2026-11-01T10:06:00+05:30 wall_min=11 agent_min=unavailable blocked_min=0 suite_runs=2 repeat_runs=0 mutations=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17
