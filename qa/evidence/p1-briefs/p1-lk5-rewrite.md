# p1-lk5 brief rewrite after STALLED (gate lk5-localized-claims answered (a), D-106)

Worktree D:/vc/.worktrees/lk5, branch p1/lk5, head 82d2470. First merge current main into p1/lk5 (no conflicts expected; stop and return if any).
Read first: qa/gates/lk5-localized-claims.md (option (a) and the Answered line), the cycle-2 verdict qa/verdicts/p1-lk5.md (FAIL K1/M1, ISS-389), and qa/evidence/p1-lk5/repair1-check/probes.txt.
Policy-Version stays as pinned in qa/manifests/p1-lk5.md. Tier unchanged. This is a brief rewrite, not a 3rd patch on the word lists.

## The rule (replaces the word lists)
- The English reply is authoritative. Split it into sentences. An English sentence is "factual" if it contains any of: a digit, a currency symbol or ISO currency code, a % sign, a unit token next to a number, a URL/host/email, or a country/place name (use the country list already in the repo if one exists, else capitalised proper nouns after "in/to/from" plus a small ISO country-name list is acceptable; it is applied to ENGLISH text only).
- In the localized (Hindi/Hinglish) reply, every factual sentence is rendered with the English sentence's wording (verbatim English sentence), never the translated one. Non-factual sentences stay localized.
- If the localized and English replies cannot be aligned sentence-by-sentence (different count, alignment failure), fail closed: show the full English reply.
- DELETE the closed Devanagari number/currency/magnitude word lists and the parity code that used them (lang.ts ~331-361, DEVANAGARI_MAGNITUDE, etc.). Keep the link/host detection fixes from cycle 2 (\p{M}, dot folding) if they still serve the new rule.
- crisisGuard still runs first on the original text; do not touch it.

## Acceptance (must hold, prove with tests)
- K1: every probe in probes.txt and every word cited in the cycle-2 verdict (currency, magnitude and number words outside the old lists) results in the English wording for that factual sentence.
- K2: a hostile set of at least 10 NEW Hindi/Hinglish factual sentences whose words never appeared in any list (e.g. other currencies, ordinals, spelled-out decimals, Hinglish "fifty hazaar", Roman-script units) all show English wording. These prove the rule is structural.
- K3: non-factual sentences (greetings, encouragement, questions back to the student) stay localized.
- K4: alignment mismatch -> whole English reply.
- Existing lang/lk5/student-graph/claims-guard/crisis-defaults tests stay green (update only assertions that pinned the removed word lists, each noted in the manifest as a protected change with reason).

## Discipline
- TDD: failing tests first in packages/engine/tests (lang and lk5 files).
- Run each touched test file plus student-graph, claims-guard, crisis-defaults, one file at a time:
  `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>`, TMP/TEMP on D:. Long lock waits are normal. Never kill PIDs 47984 or 36944; never kill by image name.
- Engine `tsc --noEmit` green.
- Commit code with a narrow pathspec (never git add -A). One falsification per criterion in a copy (Falsification[K*] lines; a golden red-before/green-after counts).
- Update qa/manifests/p1-lk5.md: `Fix cycle: 3` with `Brief-rewrite: 1 (D-106, after STALLED 82d2470)`, Round:, Tests[K1..K4], Pre-check[K1..K4] on the final sha, Metrics line, `Status: ready-for-check`. Run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/p1-lk5.md` and fix any ERROR. Commit the manifest.
- Do not dispatch a checker. Return ONE line: `p1-lk5 <sha> ready` (or `p1-lk5 BLOCKED <reason>`).
Budget: about 60 min wall.
