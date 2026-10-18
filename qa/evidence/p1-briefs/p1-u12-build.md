# P1 U12 acceptance + review (slug p1-u12-acceptance), tier M, no dual check (verification unit: it fixes no product code)
Follow D:/vc/qa/evidence/p1-briefs/p1-w3-common.md first (S = the scratchpad path defined there). Policy proportional-verification/2026-10-17.14. MOCK criteria only; REAL criteria (A2b, A4 probes, A8, A10, A14) are U13b under G-REAL and are out of scope here.

**Start condition**
- U12 starts when U6b, U7, U8, U9, U10, U11 are all on main. Base = main at that point: `git worktree add S/p1-u12 -b p1/u12 main`. Until then this brief is a plan; the maker does not dispatch it.
- U3 (golden set, frozen KB recording) is blocked on the KB keys and Sapna ma'am's rubric (D-093 12, "U3 waits"). U12 does NOT wait for it: A2a is reported `NOT PROVEN (U3 golden set pending)`, never green on the synthetic sample (evals/kb-eval.ts already refuses to prove A2a on a synthetic fixture).

**Contract (spec v8 sha e183ee9a, plan row U12)**
"MOCK criteria A1-A7, A9, A9b, A11, A11b, A12, A13, A15-A24 (A2a only); senior-software-engineer review; independent checker." Plan DoD (section 5) lists the MOCK set: A1-A7, A9, A11, A11b, A12, A13, A15a-c, A16, A16b, A17, A18, A19, A20, A21, A22, A23, A24 (A2a, A9b included). Each criterion's own command is the one in the spec table (for example A16 `pnpm --filter @vc/engine test`, A17 `pnpm --filter @vc/engine coverage`, A19 `pnpm --filter @vc/api test`, A23 `tests/limits.test.ts`, A24 `tests/budget-cap.test.ts`). A criterion not run is NOT PROVEN, never "done".

**What you build**
1. A traceability matrix, qa/evidence/p1-u12/trace.md: one row per criterion, with its exact command, test file(s) and the sha it was run at. Compute it from the spec table, not from memory.
2. Gap-fill tests ONLY where a MOCK criterion has no test named in the spec (the trace shows them), plus cross-unit end-to-end tests through the real compiled chat API with Mock providers and the fake DB: sign-in student turn -> KB fixture -> claims guard -> redacted persistence -> ranking -> export -> erasure read-back zero (A6, A7, A16, A16b, A19, A23 together), and a hostile set (crisis flood, wrong tenant, minor without consent).
3. A single re-runnable script, apps/api/tests/acceptance-trace.test.ts: fails if the trace names a command or test file that does not exist.
4. The failures you find: an ISS row proposal in the manifest and a CORE-REQUEST line. You never fix product code (the writer of the fix must not be the verifier).

**Files you OWN**
- apps/api/tests/acceptance-*.test.ts (new), packages/engine/tests/acceptance-*.test.ts (new), qa/evidence/p1-u12/**, qa/manifests/p1-u12-acceptance.md.
**Must NOT touch**: any non-test source file in apps/**, packages/**, mcp/** (read-only for you), qa/contracts, docs, .claude/**.

**Tests**
- Run every MOCK criterion's own command through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u12/<pkg> test` per package (api, db, engine, providers, mcp/university-kb, schemas), then `pnpm -C S/p1-u12 -r typecheck`. Paste command + pass/fail counts per package. If free C: is low and the suite OOMs, report ENVIRONMENTAL (not a defect).
- Falsification: one per new gap-fill test, in a throwaway copy.

**Review step (after your manifest, dispatched by the maker, not by you)**: `senior-software-engineer` agent on the whole P1 diff (main..p1 integration), plus `data-engineer` for the gap-count/usage collections, plus an independent checker. Their Approve/Warning/Block is folded into the close-out.

**HUMAN_GATE (list only)**
- Q-U12-1: may U12 close with A2a `NOT PROVEN` until U3's golden set exists (needs the KB keys and Sapna ma'am's rubric)? The plan DoD lists A2a under MOCK-green, so text P1 cannot be called done without it; this is a scope call for Umesh, not for the builder.
- Gates G-REAL, G-PUBLISH, G-PROD and B13-signed stay OPEN and are not asked here.

**Finish**
- Manifest per p1-w3-common.md (Pre-check per criterion row of the trace, Capability coverage table, Live browser = "not applicable", Metrics, `Round: est <n> min`). Lint with `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/p1-u12-acceptance.md` exit 0. Narrow-pathspec commit. No push/merge/checker. ONE-line return: `p1-u12-acceptance <sha> ready` or `... blocked <reason>`.
