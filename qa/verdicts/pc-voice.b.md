# Verdict - pc-voice (checker B, blind coordinator of a dual check)
Cycle checked: 2
Checked state: wave/pc-voice, head 91dc37a (code 6e5af5a; its parent is 54f3a34, the main merge, verified with git rev-parse 6e5af5a^). Policy-Version: proportional-verification/2026-10-19.17. Result: **PASS** (V1 signer rule holds at the outcome level, B21 is green; V2 and V3 untouched).
TIER: L (dual-trigger auth apps/api/src/go-live-gate.ts ownerOverrideProblem). I did not read, list or grep the other coordinator's verdict or checkpoint (my own checkpoint qa/checkpoints/pc-voice.b.md does not exist in this tree; none needed). Cycle-1 verdict archived as qa/verdicts/pc-voice.b.r1-1.md.

## Check plan
Read the repair diff `git diff 6e5af5a^ 6e5af5a` (go-live-gate.ts, go-live-gate.test.ts, docs/go-live-checklist.md; the rest is qa/evidence). Re-run the named suites through the test lock. Hostile probes on the REAL qa/gates (CLI) and on 17 fixture variants of a10-voice-gate.md (library). One falsification in a copy outside the tree (junctioned node_modules), green then red then restored (cmp identical).

## Criteria
- V1 (signer rule, reopened by 6c RED B21): **PASS.**
  - B21: `git diff 8e54fe8 HEAD -- apps/api/tests/auth.test.ts` is empty and `git log 8e54fe8..HEAD -- that file` is empty (protected test unchanged). auth.test.ts 15 tests, 15 pass, including "T-025 B21 contract: no issuer or key is hard-coded in apps/api/src". grep -rniE "umesh|mallory" apps/api/src finds only a prose comment at anonymous.ts:64 (unquoted, not matched by the scanner). A10_OVERRIDE_DEFAULT_OWNER has no remaining reference outside the manifests and my archived cycle-1 verdict.
  - Real gates, CLI (cwd apps/api, `node --import tsx scripts/go-live-gate.ts voice`): VC_GATE_APPROVER=Umesh (the record's signer) => ALLOWED, exit 0, "NOTE a10-voice-gate.md: A10 OVERRIDDEN by owner (D-111)". Unset => REFUSED exit 1 ("Result is not PASS, and Owner-override needs VC_GATE_APPROVER (the repo approver) to be set"). Empty => same. Mallory, " Umesh", "Umesh ", "umesh", "UMESH", "Umesh<TAB>", "Ume.*", "." => all REFUSED exit 1 (B13 and A10 both name "not the repo approver"). Exact string equality, no trim, no case fold, no regex.
  - Library, 17 fixtures on a copy of the real gates (clock fixed, probe in scratchpad): allowed only for the exact Umesh line with approver Umesh. Refused: Mallory line with approver Umesh; Umesh line with approver Mallory / unset / empty / " Umesh" / "umesh"; two override lines; future instant; D-110; fenced; quoted; indented; role signer Claude with approver Claude; no override line; Result: PASS with no Run-at/Evidence. (Mallory line with approver Mallory passes A10 as designed; the whole gate stays refused because B13 is signed by Umesh.) No path to ALLOWED for voice without either A10 PASS (Run-at + existing evidence file) or the valid override; the only code branch returning `{note}` is ownerOverrideProblem === null.
  - Fail-closed ordering: the "needs VC_GATE_APPROVER" test runs before the regex, so an unset approver refuses for every signer, Umesh included. Other targets and B13 are unchanged (B13 is still only pinned when an approver is set).
  - Falsification V1 (copy, go-live-gate.test.ts): baseline 20 pass / 0 fail. Mutation = delete the "needs VC_GATE_APPROVER" guard and enforce equality only when an approver is set (any personal name accepted when unset) => 17 pass / 3 fail: "V1 real gates ...", "V1 signer (fail closed) ...", "A20 CLI ... real qa/gates". Restored => 20 / 0, and `cmp` against the tree file identical.
  - Test rewrites in go-live-gate.test.ts judged: no assertion weakened. The old "unset => Umesh allowed" assertions are inverted to "unset => refused for Umesh and Mallory", with a stronger check that the failure text names the missing env var and the OVERRIDE_TEXT is absent, in library (undefined, default arg, empty), assertGoLive throw, and CLI with the env removed. The positive paths gain an explicit VC_GATE_APPROVER (CLI env in V1 allow test, withApproverEnv helper that restores env in finally, signer read from the real record by realOverrideSigner). The real-gates CLI test now asserts both exit 1 with env unset and exit 0 with the signer, and still never skips. Nothing deleted without an equal or stronger replacement.
  - docs/go-live-checklist.md env row: accurate. It says unset or empty refuses the D-111 override and keeps voice closed, set means the signer must equal it exactly, and it also pins the B13 signer; all three confirmed above. Wording "the go-live gate and the CLI read it" omits that the routes (chat, anonymous, voice via assertGoLive default) read it too, harmless.
- V2, V3: untouched by this diff (git diff --stat lists only go-live-gate.ts, its test, the docs row and qa/evidence). voice-wiring and partner-voice re-run anyway, green.

## Commands run and counts (apps/api; tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/<file>`)
- auth.test.ts 15 tests, 15 pass, 0 fail
- go-live-gate.test.ts 21 tests, 20 pass, 0 fail, 1 skipped (pre-existing REAL_B13_PENDING)
- voice-wiring.test.ts 16/16 pass; partner-voice.test.ts 32/32 pass
- `pnpm exec tsc --noEmit` exit 0, empty output
- CLI probes x11 and library probe 17 cases (bad=0); falsification 20/0 -> 17/3 -> 20/0
- Not run: chat.test A20 (known baseline red), full suite, live Gemini/LLM. No process killed, no product code changed.

## Not verified
Real browser/WebSocket voice path, nginx, a real deployment env where VC_GATE_APPROVER is actually set (the documented operational requirement: with it unset voice stays refused, by design), real Mongo.

## PROPOSED-ISSUE
- PROPOSED-ISSUE pcv-B9 (info): voice now ships only if the deploy environment sets VC_GATE_APPROVER to the exact record signer; nothing in startup tells an operator why voice is refused beyond the GoLiveRefusedError text. Consider listing it in the go-live launcher checks. Not blocking.
- pcv-B8 (cycle 1, hard-coded default signer) is closed by this repair (constant removed, fail closed). Carried: pcv-B4, pcv-B6, pcv-B7 from cycle 1, unchanged.

Metrics: start=2026-10-22T12:18:06+05:30 end=2026-10-22T12:20:36+05:30 wall_min=~6 blocked_min=0 mutations=1 suite_runs=0 repeat_runs=0 mutants=1 defects_unit=0
