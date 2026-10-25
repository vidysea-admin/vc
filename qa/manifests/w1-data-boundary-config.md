# w1-data-boundary-config — data-boundary safe domains in qa/adapter.json

Policy-Version: proportional-verification/2026-10-19.17

## Criteria (verbatim from the build brief)

D1: safe domains. `qa/adapter.json` carries `data_boundary_safe_domains` with exactly those three domains (vidysea.com, cloud.langfuse.com, eu.cloud.langfuse.com), using the key name the script actually reads. `data_boundary.py` run on the worktree no longer flags the staff-email lines or the langfuse-domain lines. Record the VIOLATION count before and after the change.
D2: pass@ false positive. Exclude the pass@ URL-fragment false positive through whatever adapter-level exclusion the script supports. If the script supports no such exclusion, do not edit the script; record `D2: BLOCKED needs AIOS script change` and return READY with D1 only.
D3: real student data is still caught. Falsification: a fake email/phone fixture shaped like real student data in a temp dir is still flagged.

Tier: L (config)
Dual check: no, because this is config, not security/auth/tenancy/prod-write.
Round: 1 files, 3 criteria, est 15 min — one adapter key, shared script runs only
Gate answers (verbatim): "add vidysea.com, cloud.langfuse.com, eu.cloud.langfuse.com to qa/adapter.json data_boundary_safe_domains"; D-112 Q3: "(a) regex exclusion for the pass@ URL fragment"

## Change

qa/adapter.json:14-19 (existing top-level object, edited in place): new key `data_boundary_safe_domains` after `real_data_markers`. Key name read at data_boundary.py:123 (`SAFE_DOMAIN_KEY`). No script edit. No code, no tests added (config only; instrument is the shared script run).

Files touched: qa/adapter.json, qa/manifests/w1-data-boundary-config.md. Code commit: faa1ff1e4a5596ef8aa35e9a9c2efed30064ac73.

## Evidence

Command: `python -I D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc/.worktrees/w1-data-boundary-config`
- Before (base da2faad): exit 1, 85 VIOLATION files.
- After (faa1ff1): exit 1, 65 VIOLATION files. 20 files cleared, 0 new. Output lists "safe domains from adapter: vidysea.com, cloud.langfuse.com, eu.cloud.langfuse.com".
- Cross-check: of the 65 remaining files, 0 carry only safe-domain or placeholder-domain emails (grep re-derivation), so every remaining file is flagged for a different value (noreply@anthropic.com attribution lines, bob@evil.example, other fixture values). Those are outside this brief and are NOT cleared; exit 0 is not reached by this unit.
- D2: no separate regex exclusion exists in the script (only `data_boundary_exclude`, a path-prefix list, which would skip whole files and so hide real data). The pass@ fragment `pass@eu.cloud.langfuse.com` is an email-shaped match whose domain is `eu.cloud.langfuse.com`, so D1's safe-domain entry clears it by the script's own mechanism (fixture: `https://user:pass@eu.cloud.langfuse.com/x` and `pass@cloud.langfuse.com` alone give exit 0). No script change needed. Note for human: this clears it as a safe-domain match, not via a regex exclusion as D-112 Q3 (a) literally worded; no AIOS script change is required.


Tests[D1]: data_boundary.py tree run on the worktree — before/after VIOLATION counts (85 to 65) plus a no-key fixture show the key is what clears the staff-email and langfuse lines.
Pre-check[D1]: faa1ff1 python -I D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc/.worktrees/w1-data-boundary-config -> green for the criterion: 85 VIOLATION before, 65 after, 20 cleared, 0 new, safe-domains line printed, no adapter-validation violation (command exit 1 from unrelated remaining files)
Tests[D2]: temp fixture with pass@eu.cloud.langfuse.com and pass@cloud.langfuse.com lines — the pass@ fragment is cleared by the safe-domain entry, no script change.
Pre-check[D2]: faa1ff1 python -I D:/ai_os/.claude/skills/_shared_validation/data_boundary.py <temp fixture with adapter copy and pass@ lines> -> exit 0 (data-boundary OK); same fixture with base adapter exit 1
Tests[D3]: temp fixture data/students.csv with gmail/rediffmail addresses and +91 phones — real-student-shaped data must still be flagged; plus lookalike and gmail.com-mutant controls.
Pre-check[D3]: faa1ff1 python -I D:/ai_os/.claude/skills/_shared_validation/data_boundary.py <temp fixture with students.csv> -> green: students.csv flagged as intended (exit 1, exactly 1 file), safe-only file not flagged

## Falsification (all in a COPY under scratchpad build-w1-data-boundary-config/fixture, never in the worktree)

- D1: adapter copy without the key -> safe-only fixture flagged (exit 1). With key -> exit 0. The key is what clears it.
- D2: same as D1 mutant on the pass@ fixture (base adapter -> exit 1, "carries 2 email address(es)").
- D3: mutant adding "gmail.com" to the safe domains -> script reports `entry "gmail.com" is a public mailbox provider -- it can never be listed as a safe domain` and still flags a gmail address (exit 1). Hostile lookalikes `x@notvidysea.com` and `y@vidysea.com.evil.io` with the real adapter -> still flagged (exit 1). Real-shaped student fixture flagged with the real adapter.

## Open risks

- data_boundary.py still exits 1 on 65 files for other values; the gate's "exit 0 again" outcome needs a follow-up decision (noreply@anthropic.com, bob@evil.example, anita.rao@example.com-class fixtures are not placeholder domains in the script's list except example.com).
- Blind spot unchanged: `.ts` and suffix-less files are not scanned (gate qa/gates/data-boundary-safe-domains.md). Not a clean data boundary.
- Subdomains of listed domains are also safe by design (x.vidysea.com).

Metrics: 1 file config change (+5 lines), 0 code, 0 tests added, 1 shared-script run family (5 fixtures + 2 tree runs), wall ~15 min.
Fix cycle: 0
Status: checked-PASS (cycle 0, verdict 412e730, merged 5918ec6)
