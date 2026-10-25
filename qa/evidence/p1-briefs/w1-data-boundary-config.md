# Build brief: w1-data-boundary-config (/maker build subagent)

Slug: w1-data-boundary-config. Read `qa/evidence/p1-briefs/w1-common-rules.md` first and follow every rule in it.

- **Tier:** L (config).
- **Dual check:** no, because this is config, not security/auth/tenancy/prod-write.
- **Python:** allowed only for one read-only command, `python -I D:/ai_os/.claude/skills/_shared_validation/data_boundary.py <worktree>`.

## Gate answers (verbatim)
- "add vidysea.com, cloud.langfuse.com, eu.cloud.langfuse.com to qa/adapter.json data_boundary_safe_domains"
- D-112 Q3: "(a) regex exclusion for the pass@ URL fragment"

## Read first
- `qa/gates/data-boundary-safe-domains.md`
- `qa/issues.jsonl` rows ISS-104, ISS-060 and ISS-109
- `qa/adapter.json`
- `D:/ai_os/.claude/skills/_shared_validation/data_boundary.py`. It is outside this repo: read it, never edit it.

## Acceptance

**D1: safe domains.**
- `qa/adapter.json` carries `data_boundary_safe_domains` with exactly those three domains. Use the key name the script actually reads.
- `data_boundary.py` run on your worktree no longer flags the staff-email lines or the langfuse-domain lines.
- Record the VIOLATION count before and after the change.

**D2: pass@ false positive.**
- Exclude the pass@ URL-fragment false positive through whatever adapter-level exclusion the script supports.
- If the script supports no such exclusion, do not edit the script. Record `D2: BLOCKED needs AIOS script change` in the manifest and return READY with D1 only.

**D3: real student data is still caught.**
- This is the falsification. Put a fake email/phone fixture shaped like real student data in a temp dir.
- That fixture is still flagged.
