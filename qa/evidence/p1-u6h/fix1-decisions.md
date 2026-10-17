# U6h fix cycle 1 - decisions (maker, repair base d59c745)

Source: checker verdict `qa/verdicts/p1-u6h-claim-hardening.md` (cycle 0 FAIL on M4) and the AI review `qa/evidence/p1-briefs/p1-u6h-ai-review-e2fd6fc.md`. Out of scope as briefed: crisis recall phrases, minor/age rule, non-numeric coach assertions (product decision).

## M4 (failed criterion) - coach factFree
`numberMentions` is now exported from `claims.ts` and `factFree` (graph.ts, the coach filter) uses it next to the digit and country tests, so "about five thousand euros a year" and "twenty thousand euros" are dropped like "5000 euros". The pronoun "one" is still not a number (NUMBER_RE only counts it before a unit).

## M4b - prior flag (choice recorded)
Options: (a) fail toward disclosure when no durable dep is wired (suffix on every authenticated reply), (b) make `hasPriorFlag` a required dep. Chosen: **(b), the smallest safe change**.
- `StudentGraphDeps.hasPriorFlag` is no longer optional (type), and `buildStudentGraph` throws `StudentGraphDeps.hasPriorFlag is required` when it is not a function (so a JS caller or a cast cannot leave it out; `runStudentTurn`/`compileStudentGraph` reject the same way).
- The in-process `flaggedThreads` memory stays as an additive OR: it can only add the helpline line (it covers a flag-log write that failed in this process), it never replaces the durable read. A throwing read still fails toward disclosure.
- The in-memory stand-in lives in tests only: `NO_PRIOR_FLAG` in `packages/engine/tests/student-fixtures.ts`. No production code path has a default.
- Consequence for the next unit: the API/db wiring must pass the stored flag-log reader. There is no non-test caller of `buildStudentGraph` in the repo today (grep), so nothing else changed.

## M4c - safeFollowUp
Shown only when it is ONE sentence ending in "?" (no other `?`, `!`, `।`, and no ". " inside), at most 200 characters, `noScriptGuard({type:"clarify"})` ok and no `CRISIS_FORBIDDEN_PATTERNS` match, on top of the old digit / country / identifier / verbatim checks. The crisis-rule test is applied to every follow-up, flagged thread or not (a secrecy promise is never wanted). Consequence: the existing A11b test used a secrecy follow-up to reach the final-message guard; the follow-up is now dropped earlier, so that test carries the phrase in a second claim instead (the final-message replacement is still exercised) and a new M4c test pins the follow-up drop.

## H2a - dropped qualifiers do not verify
In `claims.ts` `clauseSupports`: the claim clause and the matched evidence clause must now carry the SAME set of each of:
- quantifiers (some / most / only / all / few / many / both / ...; was one-directional) - added solely / exclusively / merely as "only";
- hedges and modals (may-might-could-can, should, usually-generally-typically-normally-commonly-often, sometimes, rarely, likely, unlikely) - "must" is already the `required` synonym group, so must vs may fails on the word rule and the hedge rule;
- conditions (if, unless, provided/providing, once, whenever, otherwise, except, depending/subject);
- scope words (public, private, international, domestic, foreign, overseas, local, undergraduate, postgraduate, graduate, bachelor, master, doctoral, phd, eu, part, online, residential).
Caveat sentence: an evidence sentence that restricts the one before it (anaphoric "This/It/These ... applies / holds / only / except / not", or starting with Exception(s) / Except / Unless / Provided / Subject to / Only / However / Note that / Conditions / Restrictions) is merged into the preceding clause(s); the claim must then carry the caveat's content words and restrictor classes, or it is unverified. The caveat is also kept as its own clause so a claim that restates it still verifies.
Price: this is deliberately stricter, so honest summaries that drop a qualifier become "unverified" (fail closed). Three existing positive controls had relied on the old one-way rule and were changed in place to carry the qualifier (and a dropped-qualifier negative added next to each): claims-guard "R5 negation parity" (`Germany has no tuition fees` vs `Public universities in Germany ...` now false; the public-scope claim true), claims-guard "A1 /ask verified" and "U6h H2 positive controls" (`... a year` vs `... for most students` now needs `for most students`), and the matching student-graph claim (reworded `For most students, ...` so it is not an 8-word verbatim run of the source).

## H2b - number/country binding
`bindFigures` in `claims.ts`: each figure is bound to the countries in its own segment of the clause (segments split at ", ", ";", and, while, whereas, vs, but, compared to, a spaced dash; a comma inside "11,000" is not a break; a country-only segment before a figure segment is carried forward so "Germany and France charge 300 euros" binds 300 to both). A figure with no country in its segment takes the clause's only country, else stays unbound. `numbersSupported` requires the evidence figure's bound countries to include the claim figure's. "300 euros for Germany and 500 euros for France" no longer verifies "500 euros for Germany".

## M3b - phone detector
`PHONE` in `guards/no-quote.ts` now uses `\p{Nd}` (Devanagari digits) and adds shapes: parenthesised area codes `(415) 555-0132`, `(98765) 43210`, `(011) 23456789`, `+91 (98765) 43210`; dot or slash groups `98765.43210`, `98765/43210`, `415.555.0132`. Years, `5000 euros`, `11,000`, `2026-03-04`, `04.03.2026`, `3.11.4`, `1.5 lakh`, `IELTS 6.5` do not match (pinned by a benign-list test).

## Not changed (stated)
- Coach non-numeric assertions ("IELTS is not required") and the coach over-drop on Polish/English/Indian/Georgia: product decision, untouched.
- Crisis recall phrases (marna hai, kms, ...), minor/age rule: pending Umesh.
- Sensitive-data questions (student text and SOP to the model unredacted): not a code change.
