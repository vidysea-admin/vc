# Checkpoint: pc-hardening-2 cycle 1, coordinator A

Worktree D:/vc/.worktrees/pc-hardening-2, head de390e3 at start (code 6b578a7; the branch later gained other qa files, none touching product code), merge-base with main 02483f6. Policy-Version: proportional-verification/2026-10-19.17. Tier L. Cycle checked: 1.
Clock: started 2026-10-22T16:48:00+05:30, verdict written 2026-10-22T17:0x (read from `date -Iseconds`).

## Executed (apps/api via vc-testlock, actual counts, in the bound worktree; git status clean of product changes before and after)
- partners 70/70, partner-voice 39/39, partner-openapi 15/15, voice 67/67, voice-limits 10/10, voice-wiring 16/16, auth 15/15, server 34/34, index 9/9, main 10/10.
- chat.test.ts: 35 tests, 34 pass, 1 fail = "A20 flag on but gate closed" (known baseline, ISS-pc-partner-keys-8); with --test-skip-pattern for that test 34/34.
- anonymous-route.test.ts "H2|H6|G5|K2|K4" 9/9. Widget `node --test "apps/widget/tests/*.test.js"` 65/65. `tsc --noEmit` (apps/api) exit 0.

## Probes (own code, run in a copy; copy = git archive of 6b578a7 plus junctioned node_modules)
- J1 widget probe (scratchpad chkA-c1 and probe j1.js): 160 cases (16 page languages x 6 fallback frames and 4 error frames) of c1 vs the c0 widget: every non-Hindi output byte-identical, every hi/hi-IN/hi_IN/HI/Hi-in output differs from c0 only by the helpline line; HELP, FOOTER, UNAVAILABLE_TEXT byte-identical to base; both HELP_HI parts found byte for byte (nukta form included) in lang.ts (HELPLINE_GLOSS at char 2893; the 112 phrase of CRISIS_CORE_HI); the invented word is absent from vc-widget.js. lang.ts, chat.ts, auth.ts, packages/* unchanged vs base (empty diff).
- R2/R4/J4 probe file tests/probe-a.test.ts (9 tests, 9 pass): revoke between rotate read and write for pub and srv (partner_revoked, no key, hash and other-scope hash unchanged, stays revoked, retry still partner_revoked, old key dead); same race through runPartnerCli (nothing printed); 3 concurrent same-scope rotates behind a barrier (1 winner, 2 rotated_concurrently, winner authenticates, original dead); pub vs srv concurrent both succeed and both authenticate; rotate vs revoke order both ways; two rotates plus a revoke give partner_revoked (priority over rotated_concurrently); Mongo store honours expect.status together with the hash; deferredPartnerStore forwards get/list/insert/update with all args and fails closed unbound.
- Scope: git diff base..6b578a7 touches voice.ts only at the anonymous section (1606-1621, 1810-1811), none of the student/srv path (voice.ts:1711-1712) and not chat.ts (:854-855).

## Falsifications (copy under scratchpad chkA-c1/fals; each green before, red after, restored and cmp-identical to the worktree file)
- R1: widget "112 पर कॉल करें" red; lang.ts gloss "मुफ़्त" changed red; lang.ts "112 पर फ़ोन करें" changed red; widget back to the old "आपातकाल 112" red (all "not a verbatim fragment"). Baseline R1 green in the copy.
- R2: index.ts wrapper update drops expect: index R2 red, probe P6 red.
- R3: 403 before the Origin check: R3 red; 403 before the key check: R3 red.
- R4: status removed from rotate expect: R4 + 5 probes red; Mongo store ignoring the status filter: R4 + 6 probes red; partner_revoked branch disabled: R4 red; J4 unconditional update: J4 + R4 red.
- J1 busy note without helpline red; Hindi uses English helpline red (J1 + R1); J2 without the 403 red; J3 per-partner cap removed red; J5 script printing the raw message red.
- Not re-run: J2/J3 other mutants and J5 helper mutant of cycle 0 (voice.ts and partner.ts helper unchanged since then); cycle-0 evidence reused for them.

## Notes
- The session scratchpad is shared with the other coordinator: a scratch reg.sh and reg.log at the scratchpad root were overwritten between us, and I extracted a source copy into scratchpad/fals before moving to my own scratchpad/chkA-c1. The fals/ and probe/ directories at the root may hold my committed-content files (identical to 6b578a7), nothing mutated. My results above all come from chkA-c1 and the bound worktree.
