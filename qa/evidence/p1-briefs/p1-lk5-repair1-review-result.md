# p1-lk5 repair-1 senior review result (6c30cf3..13ac9b7), saved by the maker (reviewer is read-only)

VERDICT: Warning. Nothing critical or high. lk5.test.ts and lang.test.ts: 87 pass, 0 fail. About 75 probes of localizedClaimOk.

## Findings
- **[medium] lang.ts:331-334, DEVANAGARI_MAGNITUDE.** The regex is built from a normal string, so `\p{L}\p{M}` collapses to the literal class `[p{L}p{M}]`, which is not a Unicode property.
  - Effect: when the English claim has no figure, any Hindi word containing सौ, हजार or लाख blocks the Hindi reply. Examples: सौर ऊर्जा, हजारों.
  - It fails closed to the English reply, so this is a false positive, not a safety hole.
  - Fix: use `String.raw` or `\p`.
- **[medium] lang.ts:238-239, DOMAIN_RE / EMAIL_RE / URL_RE host classes.** These lack `\p{M}`, so a Devanagari IDN host such as `डोमेन.कॉम` or `विश्वविद्यालय.संगठन` passes. The scheme form is caught.
  - Fix: add `\p{M}` to the host classes.
- **[low] lang.ts:238, fullwidth or ideographic dots.** A scheme-less host written with `。`, `．` or `․` passes. Fix: fold those characters to "." before matching.
- **[low] lang.ts:349-358, false positives that block a faithful Hindi reply.** Each fails closed:
  - "one year" → "एक साल";
  - "5.5" → "5,5";
  - a link with a path, written scheme-less.

## Answers to the brief
1. **Schema and cast.** `.catch` on the optional fields is sound. text, kind and sourceIds stay strict, and the cast is runtime-neutral (only safeParse is used).
2. **localizedClaimOk bypasses.** Mixed digit systems, units, countries, scheme-bearing and scheme-less Latin links, e-mails and IPs are all rejected. The only bypasses found are the IDN and dot gaps above.
3. **Crisis check and follow-up.**
   - M2 runs on the shown text (graph.ts:835-838).
   - localizedFollowUpOk mirrors every safeFollowUp check (graph.ts:714-724).
   - Known limit: CRISIS_FORBIDDEN_PATTERNS is English-only, so the M2 check is vacuous for Devanagari text.
4. **English behaviour and crisisGuard order.** Both unchanged.

## Open question
- Does the web or voice client linkify Devanagari IDN hosts or ideographic-dot hosts? If it does, the link findings become high.

## Test gaps
- No test of the magnitude word boundary.
- No IDN host or fullwidth-dot case.
- No faithful-Hindi false-positive cases.
