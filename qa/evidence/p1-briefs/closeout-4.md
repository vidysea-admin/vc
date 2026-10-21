# You are a /maker build subagent doing close-out bookkeeping only, bound to D:/vc (main branch, main tree). Never touch .claude/**, never `git add -A`, never commit qa/.6c-green, never stage .codex/ or AGENTS.md.
Slugs: t-046-canonical-edit-provenance, t-047-crisis-privacy, t-051-classifier-config, t-053-session-outcomes
For each: read qa/manifests/<slug>.md (current Status line, `Fix cycle:`) and qa/verdicts/<slug>.md (verdict, `Cycle checked:`); a qa/verdicts/<slug>.b.md means dual check, BOTH must PASS.
Close out ONLY if the current verdict(s) are PASS AND Cycle checked == manifest Fix cycle AND the manifest is not already checked-PASS / merged-* / superseded-by / STALLED (in any prefix form). Flip only the current Status line in place, keeping its prefix form, to `checked-PASS (verdict qa/verdicts/<slug>.md, cycle N)`.
Otherwise leave the file untouched and report why.
Commit flipped manifests with a narrow pathspec: git commit -m "qa: close out <slugs> (PASS)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>.
Return one line per slug: <slug> closed|skipped <reason>, plus the commit sha.
