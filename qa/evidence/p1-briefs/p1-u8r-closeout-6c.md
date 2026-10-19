# You are /checker running close-out + merge + the 6c pre-push check for U8r (p1-u8r-chat-privacy)
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c). Policy .14 with the .13 pre-push rules. U8r is tier L with a security dual-trigger (privacy redaction, crisis escalation, tenancy-scoped writes in apps/api/src/chat.ts). That is a .13-2a trigger, so the FULL SUITE runs before the push.
- S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad. Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not touch the D:\vc working tree. C: is nearly full (about 2.6 GB free): create only one new worktree. Never copy node_modules. If `pnpm install --offline` would need more than about 1.5 GB, STOP and report.

## 1. Close-out (on p1/u8r, worktree S/p1-u8r)
- First, run `git -C S/p1-u8r status --porcelain` and `git -C S/p1-u8r diff e3bec20 -- apps packages`. The code must equal 585f6dc, because checker B saw a mutated chat.ts there earlier. Any code diff: STOP and report it. Leave untracked qa/evidence/p1-u8r-B/ and _probe files alone (do not commit them), and delete untracked `_probeA-*` test files only if they sit under apps/ or packages/.
- Verdicts: A PASS 8d0c2e3 (qa/verdicts/p1-u8r-chat-privacy.A.md) and B PASS b4aa502 (qa/verdicts/p1-u8r-chat-privacy.B.md), both Cycle checked 2. Senior reviews: cycle 0 Block, cycle 1 Block, cycle 2 Approve (D:/vc/qa/evidence/p1-briefs/p1-u8r-c2-review-result.md).
- Mint qa/issues.jsonl rows (copy the field names of the last row on D:/vc main; main max is ISS-197, so start at ISS-198, or at max+1 if higher) from:
  - A's 4 PROPOSED-ISSUEs (the medium is the lower-case initial name leak, redact.ts:152-160),
  - B's 5 PROPOSED-ISSUEs,
  - the 4 low items of the c2 review,
  - the 3 c2 review open questions plus the 2 D-093 4A / retry questions as one low row tagged `umesh-confirm`,
  - ISS-163 (U6b chat source mapping) stays open, so do not duplicate it.
  - Dedupe identical findings across A, B and the review into one row, citing all sources.
- Flip the manifest to `Status: checked-PASS`, citing both verdict paths and shas. Commit narrow pathspecs on p1/u8r: "qa: p1-u8r-chat-privacy close-out (dual PASS)".

## 2. Integrate
- `git -C D:/vc worktree add S/int-u8r main --detach` (D:/vc main = origin/main 30e761f + qa-only commits). In S/int-u8r: `git merge --no-ff p1/u8r -m "merge p1/u8r: U8r chat privacy repair (dual PASS 8d0c2e3/b4aa502, review Approve)"`. qa/issues.jsonl is merge=union. Any other conflict: STOP and report the files.
- Add the medium row(s) at the top of "Candidates (human picks)" in qa/QUEUE.md and the rest under Candidates, one line each, as a separate commit.

## 3. 6c (full suite, .13-2a)
1. `python contracts/verify_contracts.py`.
2. `pnpm install --offline --frozen-lockfile` (compare the lockfile hash with main first).
3. Collection check across all packages.
4. FULL suite via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r test` (no -x or maxfail), plus `pnpm -r typecheck`. Mongo-dependent skips are the known baseline (45 in engine). Any new red: name its owner, STOP, no stamp. An OOM or disk failure is ENVIRONMENTAL: report it, PASS nothing.
5. Run `git diff --stat origin/main...HEAD` to confirm that only apps/api, packages/schemas, packages/db and qa changed.
6. If green: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside S/int-u8r (tree clean first). DO NOT COMMIT qa/.6c-green. Then run `tick.mjs --push-gate` inside S/int-u8r.

## Return (max 8 lines)
Close-out sha, ISS range, merge sha, int-u8r HEAD, validator, full-suite totals per package, typecheck, diff-scope line, and the push-gate stdout line with its exit code.
