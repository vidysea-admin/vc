# p1-lk5 repair cycle 2 (LAST automatic cycle; fix-cycle cap 2)

Worktree D:/vc/.worktrees/lk5, branch p1/lk5, head e71c8f4 (cycle-1 verdict FAIL, qa/verdicts/p1-lk5.md).
Read that verdict and qa/evidence/p1-lk5/repair1-check/probes.txt first. Keep the change small: no new modules and no refactor.
Edit packages/engine/src/student/lang.ts in place, plus its tests.

## Must fix
1. **ISS-386 (FAIL, K1/M1)**, lang.ts:337-361: number and unit parity cannot see Devanagari-written figures or currency words.
   - Rule, fail-closed: if the localized claim contains any Devanagari number word or Devanagari currency/unit word that the English claim does not carry, return false, so the student gets the English reply.
     - Number words: 1-99 incl. common spellings such as पचास/पाँच/पांच/दस, and the magnitudes सौ/हज़ार/हजार/लाख/करोड़/मिलियन/बिलियन.
     - Currency and unit words: यूरो/रुपये/रुपया/डॉलर/पाउंड/प्रतिशत/साल/वर्ष/महीने/घंटे, etc.
   - Apply the rule whether or not the English claim has a figure.
   - Simplest acceptable form: treat ANY such word in the localized claim as a mismatch unless you can map it to a value that equals a figure in the English claim. Do not build a full number parser; failing closed to English is fine.
   - Every probe in probes.txt must give the English reply.
   - Controls that must still show the localized text:
     - the same figure written in Devanagari digits;
     - a localized claim with no figures when the English has none.
2. **ISS-387**, lang.ts:331-334: DEVANAGARI_MAGNITUDE loses its `\p` escapes. Use `String.raw` or `\p`, then assert `re.source` and that सौंदर्य does not match.
3. **Review medium**, lang.ts:238-239: the host character classes need `\p{M}`, so a Devanagari IDN host with combining marks is detected as a link. Add a test.
4. **Review low**: fold the dot variants `。．｡․` to "." before the link and host check. One test.

## Discipline
- TDD: write failing tests first, in packages/engine/tests (the lang and lk5 test files).
- Run each touched test file plus student-graph, claims-guard and crisis-defaults, one file at a time:
  `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>`, with TMP/TEMP on D:.
  Long lock waits are normal. Never kill PID 47984 or 36944.
- Run the engine `tsc --noEmit`.
- Commit the code with a narrow pathspec.
- Update the manifest qa/manifests/p1-lk5.md:
  - `Fix cycle: 2`
  - `Status: ready-for-check`
  - one `Pre-check[<id>]: <sha> <cmd> -> <result>` line for each repaired criterion
  - the falsification floor: one per changed criterion, done in a copy
- Add issue rows only for new findings.
- Do not merge or push.
- Return one line: `p1-lk5 cycle2 <code sha> <manifest sha> <test counts>`.
