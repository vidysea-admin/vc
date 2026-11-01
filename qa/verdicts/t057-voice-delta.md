# Verdict: t057-voice-delta (Mode A feature check, Tier S, single check)

Cycle checked: 0
Overall: PASS

Checked: 2026-11-01T14:29:01+05:30
Bound: tree HEAD 70d2b9e7 (adds only the manifest over candidate 79cc922f), base ef94d8a4. Policy proportional-verification/2026-10-19.17.
Check plan: diff scope, premise from provider and API source, V1-V3 outcomes with hostile variants in a scratch copy, 2 falsifications (plus 3 extra mutants), manifest test run. Audience: partner-site visitors on the voice widget.

## Diff scope
git diff --name-only ef94d8a4 79cc922f -> apps/widget/src/vc-widget.js, apps/widget/tests/floater.test.js, qa/.delivery/requests/t057-walk.mjs: exactly the 3 listed files. 79cc922f..70d2b9e7 adds only qa/manifests/t057-voice-delta.md.

## Premise (partials are deltas, both roles)
- packages/providers/src/live.ts:449-450 (user): userBuf = "userBuf text" joined, then emit transcript with the raw chunk text. Chunk, not buffer.
- live.ts:455-458 (assistant): same shape, emits only the newest chunk with final:false. Provider side trims each chunk (live.ts:967, :970).
- apps/api/src/voice.ts:1218-1226: only non-final transcripts are relayed, as transcript.partial with text:clamp(ev.text); no accumulation. Finals come from the sink with the full flushed buffer. Premise holds for both roles.

## Manifest command, run by the checker in the bound tree
cd apps/widget && npm test -> tests 131, pass 131, fail 0 (matches the manifest). node --check qa/.delivery/requests/t057-walk.mjs -> ok. Bound tree untouched (git status on apps/widget is clean).

## Outcome proof (hostile variants, scratch copy under the scratchpad, using the real voice.js and a fake socket)
Copy: C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/7c992131-9165-42b7-81e2-0c8e034008ec/scratchpad/w1 (9 added tests H1..H6 on top of the 53 existing floater tests: 62 pass 0 fail).
- H1 interleaved user/assistant partials: user "a b c", assistant "X Y" in two independent lines; finals replace each exactly once; next partials open new lines.
- H2 a final with no partial: one line; the next partial opens a new line with no leftover text; consecutive finals make separate lines.
- H3a socket close (ended) mid-line: lines kept, session restarts cleanly. H3b new thread (clearHistory) mid-line, then a fresh voice session: log emptied, new partials start new lines, no ghost text.
- H4a crisis signal between user partials: one crisis notice, user line continues "I feel hopeless", the assistant final after the signal becomes the crisis text and no bot line is created.
- H5 interrupted assistant final followed by a new partial: two separate lines; same for user.
- H6 confirm prompt does not touch the assistant live line.
- V1/V2 criteria also hold as written in the candidate's own two tests.

## Falsification (copies of w1, bound tree untouched)
- V1: revert the append (var text = t.text): 5 fail, including the candidate's delta test, H1, H2, H2b, H4a. Red, as required.
- V2: remove the confirm reset (liveLine.user = null; liveText.user = ""): 1 fail, the candidate's confirm test. Red, as required.
- Extra mutants: remove "if (t.final) liveLine[t.role] = null": 4 fail (reset-on-final is covered). Remove the liveText reset in ended: 0 fail. Remove the liveText reset in clearHistory: 0 fail (see PROPOSED-ISSUE-1).

## Not verified by me
V4 harness behaviour (6 s stable read, re-read after mic stop, reply-scoped C5 citation count) was checked by syntax and by reading the diff only; it needs a live headed walk (the manifest's run 8b). No live LLM was called.

## PROPOSED-ISSUE lines
- PROPOSED-ISSUE-1 (L, test gap): the liveText resets in ended (vc-widget.js:984) and clearHistory (:611) are not distinguished by any test. They are behaviourally redundant today because liveText is read only when liveLine[role] is non-null, and liveLine is nulled at the same sites, so V3 holds in outcome. Defense in depth only; no action needed unless the read condition changes.
- PROPOSED-ISSUE-2 (L, residual): if voice.js consumes the first assistant final after a crisis signal as the crisis message while an assistant live line is open and no interrupted final preceded it, the next assistant partial is appended to the stale line (H4b: "Let me Later reply"; the old replace behaviour showed "Later reply"). In the real server order fireCrisis (live.ts:589) flushes the interrupted assistant buffer first, so I could not construct a reachable path; recorded for the crisis-ordering residual.
- PROPOSED-ISSUE-3 (L, cosmetic): the widget join does not collapse an inner double space when a chunk has a leading space (H2b: "Hello  world !"). Providers trim chunks, and HTML whitespace collapses in rendering, so this is not visible in practice.
- Residual accepted from the manifest: partial/final out of order across outputChain and sinkChain (voice.ts:953 vs :991) is pre-existing and not caused by this change.

## Metrics
checker_min=35; tests_run=131+62; falsifications=2 (+3 extra); hostile_variants=9
