# L5 decision: "pressure bahut hai" is distress, not crisis (U6h, 2026-10-17)

Scope: `packages/engine/src/guards/crisis.ts` (recall-only keyword guard, D-020) and the student graph gate.

1. Four missed recall phrases ARE crisis (flagged at crisis level, so every flag maps to the full crisis message per B24.7):
   - "in case I'm not here / I won't be around" (English, preparing to be gone)
   - "jaan de dunga / jaan le lunga" (Hinglish) and the Devanagari form
   - "khatam kar lunga khud ko / apne aap ko" (object-last order)
2. "pressure bahut hai" is NOT flagged. It is ordinary academic-pressure talk with no death or self-harm assertion.
   The crisis route has only one output (the full crisis message), so a CONCERN flag on routine study talk would show
   a crisis banner to a stressed but safe student. The student instead gets the normal coach-first path (a brief
   answer plus one coaching question).
3. Rule of thumb recorded in the table in `crisis.ts`: flag when the text asserts or prepares for death/self-harm;
   do not flag general overload words.
4. Open product decision (Umesh): a softer "distress" route (supportive message, no iCALL banner, optional flag log)
   would let "pressure bahut hai" and similar be acknowledged without the crisis message. Not built here.
5. L5 length fix: the crisis scan now runs on the FULL input before any length rejection, so a phrase after
   char 4000 still reaches the crisis route (test "U6h L5: a crisis phrase that occurs only after character 4000").
