# Checker brief: w1-data-boundary-config (/checker, Mode A)

You are /checker, single coordinator, under `Policy-Version: proportional-verification/2026-10-19.17`.

## Unit facts
- **Tier:** L (config).
- **Dual check:** no.
- **Worktree:** D:/vc/.worktrees/w1-data-boundary-config
- **Branch:** wave/w1-data-boundary-config
- **Head:** 3fd534c. The code change is faa1ff1 (qa/adapter.json).
- **Manifest:** qa/manifests/w1-data-boundary-config.md, Fix cycle 0.
- **Brief:** qa/evidence/p1-briefs/w1-data-boundary-config.md

## What you may and may not touch
- Read-only toward the artifact.
- Write ONLY `qa/verdicts/w1-data-boundary-config.md` on main in D:/vc. Put `Cycle checked: 0` in its header.
- Never edit the script, the adapter, `.claude/**` or gates.
- Never run `git add -A`.
- Never kill a process you did not start. PIDs 36452 and 23868 are another agent's, so leave them.
- Python is allowed only as `python -I D:/ai_os/.claude/skills/_shared_validation/data_boundary.py <dir>`. Never use `python -` or stdin.

## Prove the outcome, not the construction

Run every check yourself. Do not reuse the builder's numbers.

**D1: safe domains, before and after**
- Run the script on the worktree and on a `git archive` of da2faad, extracted under your scratchpad.
- Confirm the VIOLATION count before and after (builder claims 85 to 65).
- Confirm that no file is still flagged only for the three safe domains.
- Confirm that no new file is flagged.

**D2: the pass@ false positive**
- Confirm the pass@ URL-fragment false positive is cleared.
- Record this deviation: D-112 Q3 said a "regex exclusion", but it was cleared via the safe-domain entry instead. Judge whether the outcome meets the gate's intent, and say so.

**D3: hostile variants**
Build your own fixtures. Each of these must still be flagged:
- A gmail student email.
- A +91 phone number.
- `x@vidysea.com.evil.io`
- `x@notvidysea.com`
- An address at an uppercase VIDYSEA.COM lookalike on another TLD.
- A langfuse lookalike, `cloud.langfuse.com.attacker.net`.

Then try adding gmail.com to the adapter in a COPY, and confirm it is refused.

**Subdomains:** note that subdomains of a safe domain count as safe, and judge whether that is acceptable. That is a low PROPOSED-ISSUE at most.

## Verdict
- **VERDICT:** PASS, or FAIL with failing criterion ids.
- Findings go in as PROPOSED-ISSUE lines.

## Commit
- Commit the verdict file only, by name.
- End the message with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Return: `VERDICT <PASS|FAIL> <sha>`, plus at most 6 lines.
