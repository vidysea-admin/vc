# P1 wave 3: engine builder (slug p1-eng3-crisis-leftovers), tier L (crisis path)
Follow D:/vc/qa/evidence/p1-briefs/p1-w3-common.md (read it first).
- Worktree S/p1-eng3, branch p1/eng3, base 52d2af5 (the U7 review repair).
- U7 is under check: do not change apps/api/**. You OWN packages/engine/** only.
- Contract: <wt>/qa/contracts/counselling-engine.md (A11, A11b). Plan: D:/vc/qa/evidence/p1-plan-draft-20261017/plan.md, line 24.
- Criteria: C1..C4 = items 1..4 below. Sub-ids per issue are fine.

1. **Crisis phrases (D-093 2A).** Add every proposed Hindi/Hinglish crisis phrase, including "kms", to the crisis guard phrase list (packages/engine/src/guards/crisis.ts, or wherever the list lives).
   - Proposals are in D:/vc/qa/evidence/crisis-research-20261017/ and in the U6/U7 review findings: grep for "marna chahta" and "ending things" under S/p1-u7/qa and S/p1-u6h-int/qa/verdicts.
   - Cover spaced and letter variants and the Devanagari forms.
   - A crisis turn still produces the fixed message plus Tele-MANAS 14416 before any KB or model call.
   - Study talk such as "kill this exam" stays non-crisis wherever existing tests say so.
2. **Soft stress note (D-093 3A).** For stress phrases ("pressure bahut hai", "bahut stress", "I am so stressed", "can't handle the pressure"), append a soft check-in line plus Tele-MANAS 14416 to the normal answer. The turn still answers. This is not the crisis message.
3. **ISS-125 and ISS-126.** Grep D:/vc/qa/issues.jsonl for each id. Fix them inside packages/engine. A fix that needs other files becomes a CORE-REQUEST line, and you skip it.
4. **U6h leftovers.** Take the 5 PROPOSED-ISSUE lines in S/p1-u6h-int/qa/verdicts/p1-u6h-claim-hardening*.md. Fix the ones inside packages/engine. The rest become CORE-REQUEST lines.
