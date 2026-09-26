# Gate: crisis-guard-precision
**Opened:** 2026-09-25 (T-005b STALLED after 3 fix cycles; diagnosis qa/debug/t-005b-guard-hardening-cycle3.md)
**Question:** Should the deterministic crisis keyword guard ever SUPPRESS a match to cut false alarms, or match for recall only and leave precision to a later layer?
**Why it's yours:** B9 says "false positives are the safe direction", but the loop cited it both ways. It filed the cycle-0 false positives ("hurt my self-esteem", "attend it all", "an end. It all comes together") as a high-severity bug (ISS-040), and every suppression rule added since opened a new hole where a real crisis is missed ("I hurt. Myself", "kill. myself"), plus a quadratic slowdown on zalgo text.
**Options:**
- **(A) Recall-only now (recommended).** Remove all boundary suppression and the slow lookbehind. Keep zero-width deletion, newline folding and the letter-spacing collapse. Real crises are never silenced. Cost: the ISS-040-style false alarms come back and counsellors see more escalation cards.
- **(B) = A plus a later downgrade layer (recommended direction).** A now. When T-012's classifier is built, it may mark a flag "reviewed, likely benign" for the counsellor but never hide it. This needs a B16 contract amendment before T-012.
- **(C) A narrow 4th patch of the two known bugs.** Not recommended: 3 cycles show narrow patches open new holes.
**Blocks:** T-005b merge only. Main still runs the T-005 guard. T-007, T-008 and the rest continue.

Answered: 2026-09-26 — (B) recall-only now + later downgrade layer (T-012 classifier may mark "likely benign", never hide) — Umesh via AskUserQuestion in maker session 6c22744a, choice "Recall-only + later layer (Recommended)"
