# Verdict: p1-iss340-devanagari
**Verdict:** PASS (C1-C4 proven; the brief's extra 50 ms runtime bound is NOT met, by the pre-existing pipeline and not by this change - see Findings F1, filed as ISS-355)
**Cycle checked:** 0
**Tier:** M. One checker. Dual check: no per manifest. Policy: proportional-verification/2026-10-19.16
**Base:** c1027c9 **Head checked:** e725bc7 (code 4df25b8). origin/main had moved to a555a90 (G-REAL only, no overlap with crisis.ts); integration is on the latest.
Metrics: start=2026-10-19T15:15:29+05:30 end=2026-10-19T15:33:11+05:30 mutations=5 cycle=0 policy=proportional-verification/2026-10-19.16

## Plan
Detached copy of e725bc7 (D:/tmp340chk/wt, `pnpm install --offline --frozen-lockfile`, TMP/TEMP on D:/tmp340chk/tmp), every run through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`. Checker-authored probes (evidence in qa/evidence/p1-iss340/check/) call the REAL `crisisGuard` (new vs the c1027c9 file side by side) and the REAL anonymous and authenticated chat handlers (anonWorld / chatWorld fixtures, real handlers, fake Db, mock provider). The bound tree was never edited. The builder's 809-test and typecheck pre-checks are reused by identity (4df25b8) and re-run on the integration head (Part 2).

## Outcome results (qa/evidence/p1-iss340/check/*-run.txt)
1. A10 clips: all 20 (ttsInput where set, else text) AND the 7 Latin Hinglish texts reach `crisis` through `crisisGuard`; fixture level for all 20 is `crisis` (crisis-eval.jsonl rows / A10 set). Only crisis-08 and crisis-14 spoken texts changed vs base (none -> crisis). Through the HTTP routes all 27 clip texts: anonymous `state: escalated` with the 14416 message, authenticated `state: escalated`.
2. crisis-08 / crisis-14 variants (77 hand-written: nukta precomposed and decomposed, chandrabindu/anusvara/none, short and long u, ZWJ/ZWNJ after virama and between words, NFD/NFKD/NFC, NBSP/tab/newline/punctuation, mixed Latin+Devanagari in every slot, upper-case Latin, longer sentences) -> 75 crisis. Plus 748 generated forms (NFC/NFD/NFKC/NFKD/upper, and ZWJ, ZWNJ, ZWSP, WORD JOINER, BOM, soft hyphen, nukta injected at every position of 4 core phrases): 0 misses. Through both routes 101 of 103 texts escalated; the 2 that did not are listed in F2 (both have a Latin twin that is also `none` on base).
3. Benign Devanagari / mixed study-abroad sentences I wrote (71: exams, visas, fees, "पढ़ाई खत्म", "मार्केटिंग", "मारवाड़ी", "पीटर", "खत्म होने वाला सेमेस्टर", मार्च/मारिशस/मारुति/मर्सिडीज़/PTE/PT-teacher, living-cost, "मैं खुद को ... तैयार", "सब कोर्स", "आखिरी बार पूछ रहा हूं" ...): 0 of 71 flagged = 0.00 % false-positive rate (base also 0). 40 of them through both routes: none escalated. Stretch cases (contrived), reported separately: "मुझे पीटा ब्रेड बहुत पसंद है" -> crisis, "मेरे साथ मारपीट वाला गेम खेलने वाला दोस्त है" -> crisis, "मैं सब खत्म कर दूंगा असाइनमेंट आज रात" -> crisis (the manifest's accepted residual), "मेरा मन नहीं लग रहा कि कौन सा देश चुनूं" -> concern (by design). Concern phrases (18 spellings/mixed) all land at exactly `concern`, never `crisis`.
4. Recall grid over qa/evals/crisis-eval.jsonl, crisis-eval-heldout.jsonl, golden.sample.jsonl: 280 rows, 0 level drops, 0 level changes vs base. 16 heldout rows are below their expected level on base AND new (identical; includes "पापा मुझे रोज़ मारते हैं", "मैं खुद को नुकसान पहुँचाना चाहती हूँ", "इस दुनिया से चले जाना चाहता हूँ"): out of scope, pre-existing.
5. Runtime, 137 adversarial shapes at 65536 characters (repeated slot prefixes of every pattern, joined/unjoined, 200-space gaps, ZWJ/ZWNJ/nukta/chandrabindu laden, "नही"/"मै" runs, mark runs, space runs): no catastrophic case. Scaling doubles linearly (8k..131k chars, e.g. "मेरे न": 16/27/59/138/240 ms). Worst single call 238.9 ms at 65536 Devanagari characters (= 192 KiB of UTF-8); on the base file the same inputs take up to 250 ms (median new/base ratio 1.11, p90 1.28, max 1.63). A body capped at the anonymous route's 64 KiB of UTF-8 (about 26k Devanagari characters): worst 70.2 ms new vs 107.9 ms base; Latin 64 KiB: 24-49 ms. So the literal "under 50 ms at 64 KiB" is not met on this machine, by either file.

## Falsification (copy only, restored by `git checkout` after each)
| id | crit | edit | result |
|---|---|---|---|
| F1 | C1 | deleted the Devanagari "sab khatam kar dunga" pattern | C1 clip test FAILS (killed) |
| F2 | C2 | nukta fold made a no-op | C2 variant/transform battery FAILS (killed) |
| F3 | C3 | `...ISS340_CONCERN_PATTERNS` not spread | C3 concern test FAILS (killed) |
| F4 | C4 | bare `/खत्म/` crisis pattern added | benign false-positive test FAILS (killed) |
| F5 | C5 | catastrophic `(?:सब\s*)+(?:सब\s*)+(?:सब\s*)+नहींनहीं` pattern added | runtime probe does not finish in 240 s (baseline 55 s) - detected |
5 of 5 killed, 0 survivors.

## Findings
- F1 (non-blocking, ISS-355, low): `crisisGuard` costs about 2.5-4 microseconds per character (six normalised views x every pattern), linear. A 64 KiB Devanagari body is 45-70 ms and 65536 characters up to 240 ms. ISS-340 adds a median 11 % (max 1.6x on one shape) to that; the base file already misses the 50 ms bound. The brief's 50 ms bound cannot be met by a pattern change alone. Left to the orchestrator: accept (the property "no catastrophic backtracking" is proven) or open a perf unit (single-pass pre-filter, or cap the scanned length).
- F2 (non-blocking, ISS-356, low): the Devanagari abuse phrase needs "मेरे साथ" adjacent to the verb. "मेरे साथ बहुत पिटाई होती है" and the Latin-spelling "mere saath pitai hoti hai" stay `none`; their Latin twins ("mere saath bahut peetai hoti hai", "mere saath pitai ...") are `none` on base too, so this is parity, not a regression. Also "पापा मुझे रोज़ मारते हैं" (in the heldout set, `none` on base and new).
- Manifest accepted residuals confirmed (recall-only, D-020): "सब खत्म कर दूंगा" in a benign homework sentence, "मेरी पिटाई नहीं हुई", concern on "मन नहीं लग रहा" in a study question, "मैं नहीं रहूंगा हॉस्टल में".

## Environment
Free RAM was 0.3-3.5 GB with other agents running; no OOM, no environmental failure. Detached copy at D:/tmp340chk/wt removed after the run.
