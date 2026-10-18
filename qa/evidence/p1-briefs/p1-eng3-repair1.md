# You are a /maker build subagent: eng3 fix cycle 1 (p1-eng3-crisis-leftovers), tier L
- Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-eng3 (branch p1/eng3, head 559a421 = checker FAIL verdict). Work ONLY there. Never `git add -A`. Never touch .claude/**. Do NOT push.
- Read: qa/verdicts/p1-eng3-crisis-leftovers.md (FAIL) and D:/vc/qa/evidence/p1-briefs/p1-eng3-review-result.md (senior review Warning).

## Fix (failing test first for each)
1. C1 high, packages/engine crisis.ts ~629-636 kms heuristic: suppress "kms" ONLY when it follows a number or a plain quantity word ("50 kms", "few kms"). Drop DISTANCE_AFTER suppression entirely; drop about/around/nearly/almost/some from DISTANCE_BEFORE. Must fire: "i keep thinking about kms", "i was almost kms tonight", "i wanna kms from the stress", "kms away from here". Must not fire: "50 kms", "a few kms from campus", "kill this exam".
2. C1 downstream: apps/api/tests/anonymous-zero-persistence.test.ts:621 sends "thinking about ending things" (now a crisis). Change the input to non-crisis text, as the engine twin did. Record it in the manifest as a test-input change, not a weakened assertion.
3. Review W1: "I don't see the point in continuing/going on with MBA/course" is a false positive. Require the self-referential life form; bare "I don't see the point in going on" keeps firing. Positive and negative tests.
4. Review I1: add 1->l to LEET_MAP ("ki11 myself").
5. Checker spelling variants: "mujhe marna h", "marnaa hai", "kmss" fire.
6. Manifest fixes: the ISS-125 CORE-REQUEST cites packages/providers/src/index.ts:509 (not litellm.ts); repair the mutant-cap-raise line (file:line + reason); add the 5 engine tests the checker found missing to the test selection.
- Tests through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...`: the manifest's engine set + the 5 added + the 4 apps/api tests the checker ran (anonymous-route, anonymous-zero-persistence, server, index) + engine typecheck. No full suite. One falsification per changed criterion in a throwaway copy.

## Finish
Manifest: `Fix cycle: 1 of max 2`, Round line, Pre-check[<id>] on the final sha, Tests[<id>], falsifications, Metrics, Status: ready-for-check. Lint with tick.mjs --lint-manifest. Commit narrow pathspecs. Return ONE line: `p1-eng3-crisis-leftovers <sha> ready`.
