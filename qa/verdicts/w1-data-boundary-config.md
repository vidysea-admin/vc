# w1-data-boundary-config: independent checker verdict (Mode A)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
Checked-state: branch wave/w1-data-boundary-config @ 3fd534c (code change faa1ff1, qa/adapter.json +5 lines, exactly the 3 domains). Tier L (config), single check.
Checked: 2026-10-25T07:10+05:30

## Evidence (all re-run by the checker; builder numbers not reused)
Instrument: `python -I D:/ai_os/.claude/skills/_shared_validation/data_boundary.py <dir> --json` (plus `import data_boundary` helpers from a read-only analysis script in the scratchpad, `chk-dbc/an.py`).

- **D1 safe domains.** Base `git archive da2faad` extracted fresh: 85 VIOLATION files. Worktree 3fd534c: 66 VIOLATION, exit 1. Delta 85 -> 66 = 20 cleared, 1 new. The 1 new file is `qa/manifests/w1-data-boundary-config.md`, added by the manifest commit 3fd534c; it is flagged for `noreply@anthropic.com`, `bob@evil.example` and the hostile-fixture addresses it quotes, not for a safe domain. The builder's 65 is the count at faa1ff1, before that manifest. Consistent.
  - All 20 cleared files carry only safe-domain/placeholder emails (re-derived by regex): 0 cleared files hide a non-safe email.
  - 0 of the 66 remaining files are flagged only for the three safe domains (every one has a non-safe email: noreply@anthropic.com x27, bob@evil.example x15, etc.).
  - No other new file. `git diff da2faad..HEAD` = adapter.json + the manifest only.
- **D2 pass@.** Fixture `https://user:pass@eu.cloud.langfuse.com/x` and `pass@cloud.langfuse.com`: BEFORE-adapter exit 1 (VIOLATION), AFTER-adapter `data-boundary OK`. Cleared.
  - DEVIATION (recorded): D-112 Q3 literally said "(a) regex exclusion for the pass@ URL fragment". The script has no regex exclusion (only `data_boundary_exclude`, a path-prefix list that would hide whole files). The false positive is cleared through the safe-domain entry instead. The outcome meets the gate's intent: the pass@ lines stop counting, no whole file is hidden, no script edit. The only cost is that any `<anything>@eu.cloud.langfuse.com` address is now safe, which is the domain the gate approved anyway. Judged acceptable. The human should be told the mechanism differs from the literal wording.
- **D3 hostile variants (fixtures built by the checker, with the real adapter).** All still flagged: gmail student email, `x@vidysea.com.evil.io`, `x@notvidysea.com`, `X@VIDYSEA.COM.EVIL.IO`, `ceo@VIDYSEA.EVIL.IO`, `u@cloud.langfuse.com.attacker.net`. Legitimate `umesh@vidysea.com`, `u@cloud.langfuse.com`, `u@eu.cloud.langfuse.com` not flagged. Under the base adapter the same legitimate lines were flagged (so the key is what clears them).
  - Mutant: copy of the adapter with `gmail.com` appended to the safe list: script emits `VIOLATION ... entry "gmail.com" is a public mailbox provider -- it can never be listed as a safe domain`. Refused, and the gmail line stays flagged.
- **Subdomains.** `a@mail.vidysea.com` is treated as safe (`_domain_is_safe` accepts `.vidysea.com` suffix). Acceptable for a company-owned domain; see PROPOSED-ISSUE 2.

## PROPOSED-ISSUE
1. **PROPOSED-ISSUE (medium, pre-existing, not caused by this unit):** `data_boundary.py` has no phone-number detection (signals are email, keyed ObjectIds, literal `real_data_markers`). A CSV of `+91 98765 43210`-style numbers with no email is NOT flagged under the base adapter or the new adapter (identical, checker-verified). The brief's D3 expectation "a +91 phone must still be flagged" is therefore not testable on this instrument. The builder's `students.csv` fixture was flagged by its gmail/rediffmail addresses, not the phones. D3 is judged met on the email half (real-student-shaped data is still caught, and the change does not alter phone behaviour, which was already undetected). Needs an AIOS script change or a `real_data_markers` decision; out of scope for this config unit.
2. **PROPOSED-ISSUE (low):** subdomains of a listed safe domain count as safe by design. Fine for vidysea.com; note that `*.cloud.langfuse.com` is also safe (already covered by the listed eu. entry).
3. **PROPOSED-ISSUE (low, known by the builder):** the check still exits 1 on 66 files for other values (noreply@anthropic.com attribution lines, bob@evil.example fixtures), so the gate's "back to exit 0" outcome is not reached by this unit. Needs a follow-up human decision on those two values. Also `.ts`/suffix-less files stay unscanned (existing blind spot).

## Scope respected
Read-only toward the artifact; no script, adapter, `.claude/**` or gate edits; no process killed; Python used only as `python -I <script> <dir>` plus a scratchpad analysis script run with `-I`.
