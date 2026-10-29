# S13 final checker (2026-10-29)

A fresh read-only senior-software-engineer ran this check. It could not write files, so the main session saved the verdict.

**VERDICT: FAIL.** 11 of 12 checks PASS; the promise floor misses obfuscated guarantees.

## Suites (run under scripts/vc-testlock.sh)
| Suite | Tests |
|---|---|
| packages/db (chat-threads, student-store, erasure, facts, db-init) | 236/236 |
| apps/api six chat files | 217/217 |
| apps/api voice*, main, index, partner-voice, anonymous-route | 242/242 |
| packages/engine (student-graph, claims-guard, lang, routing-probe) | 230/230 |
| packages/providers | 225/225 |

`tsc --noEmit` is clean in db, api, engine and providers.

## FAIL: promise floor misses obfuscated guarantees (medium)
- The floor is `promisesOutcome` at `packages/engine/src/student/graph.ts:743`; line 744 normalises the text.
- 6 of 48 promise phrasings got through:
  - `g u a r a n t e e d`
  - `g-u-a-r-a-n-t-e-e-d`
  - `gua­ranteed` (soft hyphen)
  - `ɢuaranteed`
  - `1 0 0 %  sure` (ambiguous)
  - `Visa is 100 percent` (ambiguous)
- Normalisation strips only U+200B to U+200D and U+FEFF.
- Fix: also strip U+00AD, U+2060 and U+180E; collapse runs of single characters separated by space, dot, hyphen, underscore or asterisk; match against both the collapsed and the plain text.
- 26 neutral or negated phrasings gave 0 false positives. Matching is linear: 20,000 characters take under 9 ms.

## PASS, with hostile proof
- Crisis helpline under four lease and consent races: always 200 plus the helpline, one escalation, and logs with no text.
- Erase vs marker race: zero residue.
- Retry and replay counting: a 409 counts nothing, a retry counts once, a replay counts zero.
- Partial pending index matches the invalidate filter.
- `discardProposal` `$max`: a real cutoff is kept.
- Voice consent armed on the readout's `turn_complete`.
- Gemini usage reporting.
- The `isServedAsk` guard.
- `canonicalPreferenceKey` in voice.
- The 1 s frame TTL applies to audio frames only.

## Open (low-medium, unproven)
- `voice.ts:1187-1193` attributes `turn_complete` to the readout using `readoutPromptId` alone.
- If the reply to an earlier turn completes after `readoutPromptId` is set but before the readout runs, the early-yes window could reopen.
- The test needed: emit an earlier `turn_complete` between `confirm` and the readout.
