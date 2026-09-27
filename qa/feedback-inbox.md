<!-- One entry per line: <ISO date> · <source> · PATTERN: what generalises · EVIDENCE: where it showed · APPLIES NEXT: where else — not a diary line, not "fixed X". The checker folds patterns into contract criteria; a line with no PATTERN gets folded into nothing. -->
2026-09-25 · Umesh (chat) · PATTERN: the engine is built in D:/vc, not in a sibling repo · EVIDENCE: "we have to buidl here in this current directory" · APPLIES NEXT: every unit; sibling repos are read-only port sources (D-001) · FOLDED: 2026-09-25 (checker sweep) — already carried verbatim by contract A8 ("names which sibling repo supplies which reused piece (D-001), with no claim that anything in D:/vc is already built"), drafted in commit db9dbd3. No new amendment needed.
2026-09-25 · Umesh (chat) · PATTERN: architecture must name the multi-agent framework, the knowledge graph, observability, and prompts/rules as skills and tools · EVIDENCE: "konsa multiagentic framework … knowledgegraph … observablity … prompts and rules as skills and tools" · APPLIES NEXT: plan doc §5 tech map + T-002..T-006 (D-002..D-005) · FOLDED: 2026-09-25 (checker sweep) — already carried verbatim by contract A3 (4 architecture layers from D-002..D-005 plus knowledge graph, observability, hard/soft rule split, "every row has why"), drafted in commit db9dbd3. No new amendment needed.
2026-09-25T04:47:54+05:30 · ai-engineer review of T-005 (maker relay) · PATTERN: safety guards for minors need a MEASURED bar, not just structural routing. B9 says 'routes before generation' but sets no recall target · EVIDENCE: keyword crisis guard misses indirect Hinglish + all Devanagari; no crisis eval exists · APPLIES NEXT: proposed B15 = crisis recall ≥0.95 on a labelled eval set (crisis/indirect/concern/abuse/benign idioms) + script-detector precision/recall, human-approved amendment · FOLDED: 2026-09-25 into contract B16 (crisis recall >= 0.95 on the offline golden set, routine tighten) by checker sweep
2026-09-25T23:30+05:30 · lead's counselor-portal review (relayed by Umesh, plan approved) · PATTERN: the counsellor must not depend on one AI vendor, and the core flow must finish even with no AI at all · EVIDENCE: "agar kal ko Gemini hat jaye to mera pura VTC band ho jayega, aisa na ho … AI dependence ek cheez hai, Gemini dependence ek cheez hai" · APPLIES NEXT: packages/providers/src/index.ts, where VC_LLM_PROVIDER is only mock|gemini and GeminiProvider throws. Proposed B6 tightening: (1) a second real provider through the LiteLLM gateway (D:/ai_os/litellm-config.yaml classes), (2) a deterministic `rules` provider (structured forms, no model) that lets P1 scribe→facts→profile-diff→approve complete end to end, and (3) an e2e that passes with VC_LLM_PROVIDER=rules. Audio-first input ("say June instead of selecting it") is a P3 note, not a unit now. · FOLDED: 2026-09-25 into contract B6 provider independence by the checker
2026-09-25T23:30+05:30 · lead's counselor-portal review · PATTERN: releases are judged by user personas, not login roles · EVIDENCE: "make sure it is easily understandable by an average counselor operating out of a tier 2 city like Jaipur" · APPLIES NEXT: add `personas` (Jaipur counsellor, 1-2 yrs; school counsellor) and `qa/scenarios/*.csv` to qa/adapter.json per the 2026-09-25 domain-adapter fields; checker Mode C now walks them. · FOLDED: 2026-09-25 into contract B17 persona usability by the checker
2026-09-26 · Umesh (AskUserQuestion, gate crisis-guard-precision) · PATTERN: a deterministic safety guard for minors matches for recall only; precision comes from a later layer that may downgrade a flag but never hide it · EVIDENCE: T-005b stalled 3 cycles, each suppression rule opened a crisis miss ("I hurt. Myself", "kill. myself"); answer "Recall-only + later layer" · APPLIES NEXT: T-005c (recall-only guard), B16 amendment before T-012 (classifier may mark "reviewed, likely benign", never suppress) · FOLDED: 2026-09-26 into B9 + B16 (checker sweep)
2026-09-26 · Umesh (AskUserQuestion, gate citation-guarantee-scope) · PATTERN: the full chat is the ground truth and is persisted; only numbers and a fixed vocabulary auto-verify, every other text fact and every REASONING fact is kept and cited to its transcript span as needs-review, never dropped · EVIDENCE: "puri chat bhi save rehegi … knowledge graph … summarized way … numbers k alawa sometimes reasoning is also valuble" · APPLIES NEXT: B2 amendment; T-013 rescope (reasoning fact kind as a KG edge; transcript persistence covered by erasure/export) · FOLDED: 2026-09-26 into B2 (checker sweep)
2026-09-26 · Umesh (AskUserQuestion, gate scribe-concern-level) · PATTERN: distress below crisis level is recorded and followed up, never a reason to withhold the counsellor's output; the AI offers a gentle check-in (a question, not a script) and escalates to counsellor/admin as severity rises · EVIDENCE: "again knowledgegraph and also it should try to ask for it and console in friendly manner and also it will update the concerned person if things loook more serious like counsellor or admin" · APPLIES NEXT: T-022 (scribe flag-and-continue + KG concern node), T-010 check-in card type, T-012 escalation, P3 console · FOLDED: 2026-09-26 into new B20 (checker sweep)
2026-09-26 · Umesh (AskUserQuestion, gate provider-fallback) · PATTERN: a provider failure mid-session fails over across 3 models within a bounded retry budget; if all fail, engineering is alerted and the user gets an apology plus a Retry that keeps their input, never a retype · EVIDENCE: "model 1, fallback model 2, fallback 3 and with about 10 retry" + "highlighted first for the engineering team … apologetic msg and also a retry msg so they dont have to retype" · APPLIES NEXT: B6 amendment; T-021 runtime failover + live synthetic smoke run (approved) · FOLDED: 2026-09-26 into B6 (checker sweep)
2026-09-26 · Umesh (chat, gate counsellor-auth + architecture question) · PATTERN: VC is a headless intelligence API; clients (Pathlynks first, partners later) authenticate with their own backend's JWT and build their own UI, so nothing is hard-coded to one client · EVIDENCE: "api base … JWT token … intelligence yahan se chali jayegi backend team ko"; "integrated hum jitna banayenge utna wo hard coded ho jayega"; "ui vo log khud bnaa lenge" · APPLIES NEXT: apps/api HTTP server + JWT + tenant stamping, KB /ask client, webhooks, OpenAPI · FOLDED: 2026-09-26 into new B21 (checker)
2026-09-26 · Umesh (chat, gate edit-provenance) · PATTERN: an edited fact keeps who changed it and what it was edited from, and both VC and the client store that · EVIDENCE: "(a) … mai apne system me bhi store karna hai … developers apne end pe to rakhte hi hain" · APPLIES NEXT: T-008 follow-up, fact-approved webhook · FOLDED: 2026-09-26 into B2 (checker)
2026-09-26 · Umesh (chat + AskUserQuestion, gate erasure-fencing) · PATTERN: an irreversible delete of a minor's data needs two confirmations and a named human approver; automation is opt-in by config, never the default · EVIDENCE: "do baar confirmation … request jayegi admin ya ek concerned … auto delete abhi nahi … configurable"; "Delete+24h lock, HMAC haan" · APPLIES NEXT: erasure approver workflow unit (outbox, approver, autoDelete flag, HMAC) · FOLDED: 2026-09-26 into B15 (checker)
2026-09-26 · Umesh (chat + AskUserQuestion, personas) · PATTERN: usability is judged across a ladder from the expert benchmark down to a Hindi-speaking non-writer, plus international policy-heavy personas; the target is that a novice with VC reaches 90-95 % of the expert · EVIDENCE: "Sapna mam is the top renowned counsellor of India … Mayo College"; "Gaurav … IIT … product manager … no idea of counselling … Sapna ji level ya 90-95 %"; "Gaurav Bhaiya … English samajh nahi aati … Hindi samajh aati hai bat likhni nahi aati … wow I can also do it"; UK/US/Australia/Canada selected; release video to "Sapna mam and Gaurav Bhaiya" · APPLIES NEXT: qa/adapter.json personas, Hindi i18n, counsellor voice input, golden-session novice-vs-expert eval, release video with Hindi voice-over · FOLDED: 2026-09-26 into B17 + new B22 (checker)
2026-09-26 · lead's counselor-portal review (second relay by Umesh, "improve VC with whatever is in here") · PATTERN: speak instead of select (audio-first); one history timeline of everything done for a student; a second model tests what the first builds; a 20-minute end-to-end video is the single review artifact; a written pre-release checklist · EVIDENCE: "baccha June bole … audio base"; "history wala tab … line se activity record"; "ek model se banaya … dusre model ko bug karne ke liye"; "20 minute ka video dekh lunga shanti se"; "saat-aath checkpoints checklist" · APPLIES NEXT: counsellor voice-input unit, student activity timeline (read API + reference view), second-opinion tester for UI units, release video + checklist. Out of VC: Excel import, journey map, commission onboarding, subject grouping; seminar capture stays in KnowledgeBase (T-036/T-043), consumed via /ask · FOLDED: 2026-09-26 into B17/B21 + queue rows (checker)
2026-09-26 · Umesh (chat, CEO north-star transcript) · PATTERN: VC is a sounding board, never a cheating platform: it explores (questions, visuals, alternatives such as "why UK? have you thought of Ireland?"), personalises from what is already known (skip known questions), concludes with the child, then executes by pre-filling the application for the student to review · EVIDENCE: CEO: "we don't want to create a pure verbatim cheating platform … questions, visuals … sounding board … Explore, conclude … in next 15 minutes … prepare your application … That to me is our North Star" · APPLIES NEXT: already ARCHITECTURE §1 + B1/B18; verbatim transcript kept in project memory (not committed: the repo pushes to GitHub) · FOLDED: 2026-09-26 (no new criterion; B1, B18, B22 carry it)
2026-09-26 · ai-engineer review of T-013 (maker relay) · PATTERN: an auto-verify signal must fail safe: whenever the cited quote carries a negation before the value, or a unit multiplier (lakh/crore/thousand/k) or currency next to a number, the fact drops to needs-review rather than verifying. Auto-verify only narrows toward safety, it never widens · EVIDENCE: assessFactForReview auto-verified value 20 from '20 lakh' (unscaled) and UK from "I don't want the UK, I'd rather go to Canada"; the scaled correct value fell to needs-review · APPLIES NEXT: B2 wording (maker reading of D-020: the conservative direction needs no new gate); T-013 fix cycle 1 adds a bounded negation lexicon and a no-adjacent-multiplier/currency check, plus hostile rows run through the eval providers · FOLDED: 2026-09-27 (checker Mode B sweep consolidation) into contract B2 "Fail-safe + scope clarifications" · ISS-082
2026-09-26 · Umesh (chat, via AIOS brain) · PATTERN: consider calibrated decision routing, a suggestion to EVALUATE and not to switch: a fixed-option decision goes to a small calibrated classifier that returns a probability per option, and confidence routes each item to auto-accept / LLM judge / human (τ = (C_err − C_human)/(C_err − C_auto)); run /rlcd for a full audit · EVIDENCE: T-012 concern classifier (TASKS.md:22, async Flash-Lite on concern turns). Candidate: LAYA self-hosted (student counselling = PII, never a hosted API). HARD CONSTRAINT: the model may only ADD a 'likely benign' hint; it never suppresses or hides a crisis flag (B16) · APPLIES NEXT: benchmark on a labelled set against the current method (accuracy, ECE, p50 latency, cost/1k, share auto-accepted at the target precision) before any change; theory + evidence in D:/ai_os/umesh/operating-brain/wiki/patterns/calibrated-decision-routing.md

## 2026-09-26 — Umesh (chat, AskUserQuestion, gate auto-verify-property) — verbatim choice
"Write the rule down (Recommended)": Auto-verified means: the student said this value, for this fact type, in their own words, in this one turn. Earlier or later turns (a hypothetical, a retraction) are out of scope. A leak counts as high severity, not critical, since the counsellor still approves every fact.
(Recorded as D-026. For /checker: fold this into B2, and reclassify ISS-071 (cross-turn) accordingly.) · FOLDED: 2026-09-26 into B2 auto-verify property (checker); ISS-071 wontfix (outside the property)

## 2026-09-26 — Umesh (chat) — JWT issuer placeholder, verbatim
"abhi umesh k naame se lee lee" (asked why Pathlynks login details are needed: VC needs the issuer, the public key / JWKS URL, and the claim names to verify the client's JWT, B21).
PATTERN: until the Pathlynks backend team supplies its issuer and keys, VC's JWT verification runs against a placeholder issuer owned by Umesh (issuer `umesh`, a locally generated key pair), set only through config (e.g. `VC_JWT_ISSUER`, `VC_JWT_PUBLIC_KEY` / JWKS URL), never hard-coded · EVIDENCE: chat 2026-09-26 · APPLIES NEXT: T-025 reads issuer + key from .env; swapping to the real Pathlynks issuer is a config change plus a contract test, no code change; no private key is committed · FOLDED: 2026-09-26 into B21 (checker)

## 2026-09-27T00:00:00+05:30 — T-036 blind oracle, fix cycle 1 — open B2/D-026 contract questions (FOR /checker)

SOURCE: T-036 blind oracle, fix cycle 1. An independent oracle
(`packages/engine/tests/fixtures/auto-verify-oracle-blind.jsonl`, 102 rows) was authored in a separate
agent context forbidden from reading `packages/engine/src/scribe/nodes.ts`, the property test, or the
earlier fixture, from the prose of criterion B2 and decision D-026 alone. Running it against the engine
for the first time produced **0 auto-verify leaks** (every one of the 72 must-need-review rows came back
needs-review; nodes.ts was not changed) but **29 of 30 expected-auto-verify rows did not auto-verify**.
All 29 disagreements run in the SAFE direction — the engine is stricter than the contract prose. 5 were
the blind author's error and were corrected in-file against a quoted contract sentence. The remaining 24
are quarantined, unasserted, in `auto-verify-oracle-blind-unsettled.jsonl` pending the answers below.
The maker does not edit qa/contracts/**; these are for /checker to settle and fold in.

**Q1 — the accepted-sentence surface (21 of the 24 quarantined rows).** B2 says only "typed numbers, and
values matching a fixed country/alias vocabulary, matched as whole words" auto-verify, and D-026 adds
four clauses (student speaker, key-bound template, own words, one turn). Neither says the *sentence* must
match a fixed template grammar. The engine additionally requires the cited clause to match one of a
closed template set (`unrecognised-form`), so clean single-clause student assertions such as "Honestly,
Australia is the only country I'm seriously considering for my undergrad." or "I scored 7.5 overall in my
IELTS last month." are needs-review. Is B2's list a NECESSARY condition only (the engine may be as narrow
as it likes) or also SUFFICIENT (any clean single-clause student assertion with a typed number or a
vocabulary term must auto-verify)? If necessary-only, B2 should say so, because a reader of the present
text reasonably concluded the opposite — that is precisely what the blind author did, 21 times.

**Q2 — which countries are in "a fixed country/alias vocabulary" (1 row, `blind-pos-country-08`).** The
engine's vocabulary is exactly: Australia, Canada, France, Germany, India, Ireland, New Zealand,
Singapore, UK, USA. The Netherlands is absent, so "I'm only applying to the Netherlands this admission
cycle." can never auto-verify. B2 does not enumerate the vocabulary. Should the contract name it (or name
its source), and is the current 10-country list the intended scope for an international counselling
product?

**Q3 — stated currency / unit multiplier on an exactly-typed number (5 rows,
`blind-pos-budget-02/04/06/08/10`).** The engine reviews any number whose turn carries a currency word or
multiplier (`unit-multiplier`, a D-020 fail-safe), so "I've got around 30000 pounds saved up for my
tuition." is needs-review even though 30000 is typed and matches the value exactly. B2/D-026 do not
mention currency. Is the fail-safe intended to apply even when the digits match the stored value exactly,
or only when a multiplier means the stored value differs from the typed digits (the "20 lakh" -> 2000000
case)? Note the engine also assumes INR for any bare number, which is unstated in the contract.
**FOLDED: 2026-09-27 (checker Mode B sweep consolidation)** — the fail-safe applies whenever a
multiplier/currency word is adjacent, regardless of exact-digit match; folded into contract B2 · ISS-083

**Q4 — is a converted value "said by the student"? (5 rows, corrected — please confirm the reading.)** We
read B2 ("typed numbers ... matched as whole words") plus D-026 ("the student ... said this value, for
this key, in their own words") as settling this: when the student types "20 lakh rupees" and the
extractor stores 2000000, the student never said 2000000, so it must be needs-review. On that reading we
corrected `blind-pos-budget-01/03/05/07/09` from `verify` to `review` in the fixture, each with the
quoted sentence. If the checker disagrees, these five rows and the correction must be reverted. Consider
writing the unit-conversion case into B2 explicitly.
**FOLDED: 2026-09-27 (checker Mode B sweep consolidation)** — reading confirmed, no revert needed;
folded into contract B2 · ISS-083

**Q5 — which exams are in the auto-verify scope? (2 rows, `blind-pos-score-07` JEE, `blind-pos-score-09`
NEET).** The engine has key + template families for IELTS, TOEFL, PTE, GRE, GMAT, SAT, Duolingo, class 10
and class 12 only; JEE, NEET, CAT and CUET have no key and can never auto-verify. B2 says nothing about
exam scope. Is that deliberate non-coverage (record it in B2) or a gap for an India-first product?

**Q6 — Devanagari aliases and spelled-out numbers (6 rows, currently AGREEING and therefore asserted,
but on unstated grounds).** `blind-neg-devanagari-01..06` expect needs-review for "मुझे कनाडा जाना है
पढ़ाई के लिए।" and "मेरा बजट बीस लाख रुपये है।". The engine agrees, so they are asserted — but for reasons
B2 does not state. Two questions the contract should answer outright: (a) does the fixed country/alias
vocabulary include Devanagari-script aliases (कनाडा, जर्मनी)? The engine HAS Devanagari sentence templates
but the alias check is what fails here. (b) Does "typed numbers" exclude numbers spelled out in
Hindi/Hinglish words ("बीस लाख", "saade saat", "sattasi")? Until B2 says, these six rows are passing for
an unwritten reason.
**FOLDED: 2026-09-27 (checker Mode B sweep consolidation)** — recorded as Latin-script-only today,
widening deferred; folded into contract B2 · ISS-083

**Q7 — 36 of 102 blind rows agree with the engine on reasoning the contract does not state.** The blind
author flagged them AMBIGUOUS itself: hedges (6, "shayad ... sure nahi hai"), in-turn negation (6),
third-party attribution inside a student turn (6, "My father wants me to consider Germany" — D-026's four
clauses are about the turn's SPEAKER, not about whose fact it is), within-turn conditionals (6),
same-turn compound/corrected values (6, "Pehle maine socha Canada, but ab I'm leaning towards Germany" —
D-026 carves out only CROSS-turn retraction), and the Devanagari six of Q6. They are asserted in the test
because they agree with the engine, but the agreement is corroboration, not contract backing: if B2 were
read strictly, several of them could equally be argued the other way. Each of these six behaviours should
be either written into B2 or explicitly declared out of scope.
**FOLDED: 2026-09-27 (checker Mode B sweep consolidation)** — all six declared explicitly out of scope
for auto-verify; folded into contract B2 · ISS-083

**Q8 — the key vocabulary and the budget period binding are not in the contract.** The engine binds facts
to `targetCountry`, `budget_inr_per_year` / `budget_inr_total`, `ielts_overall`, `class10_percentage`,
`class12_percentage`, `toefl_total`, `pte_overall`, `gre_total`, `gmat_total`, `sat_total`,
`duolingo_score`, and it decides per-year vs total from the clause's own wording. D-026's "for this key"
clause is unusable by an independent reviewer who cannot see that list — the blind author invented plain
names (`budget`, `ieltsScore`, `boardPercentage`) and the test now carries a documented
concept-preserving alias map to bridge the gap. Should B2 (or a contract appendix) name the key
vocabulary and the period-binding rule?
**FOLDED: 2026-09-27 (checker Mode B sweep consolidation)** — the 11-key vocabulary and the per-year/
total binding rule are now named in contract B2 · ISS-083

**Standing note for future oracle work:** the blind fixture is one-sided after quarantine (1 asserted
verify row, 77 asserted review rows), so on its own it would also be satisfied by an engine that
auto-verifies almost nothing. Answering Q1 is what would let the verify direction be asserted
independently.

## 2026-09-27T00:00:00+05:30 — T-039 B18 suppression blind fixture, stage 1 — open contract questions (FOR /checker)

SOURCE: T-039 stage 1 (build agent, blind fixture authoring). `packages/engine/tests/fixtures/b18-suppression-blind.jsonl`
(55 rows) and `...-unsettled.jsonl` (11 rows) were authored in an isolated agent context forbidden from opening
`packages/engine/src/scribe/**`, `packages/engine/src/cards/**`, any existing test, or any existing fixture — from the
prose of criterion B18 (plus B1, B2, B3, B4/D-027, B9, B16, B20, B21 where a row needed a cross-clause reason) alone.
Stage 2 (a separate agent, not yet run) wires these rows to the engine and will report where the engine's actual
behaviour disagrees. The 11 quarantined rows below are genuine textual gaps in B18, not fixture author error, and the
maker does not edit qa/contracts/** — these are for /checker to settle and fold in.

**Q1 (`b18-u-01`) — does topic-suppression (bullet 2) require an APPROVED fact, or does a needs-review one suffice?**
Bullet 2 ("a topic the student's own facts make irrelevant is suppressed") never says "approved". Bullet 3
("an approved fact is never asked again") explicitly does. If a pending, later-rejected "India-only" extraction can
pre-emptively hide the whole visa topic before the counsellor confirms it, an application draft could miss a needed
visa step. Should bullet 2 require the same approval gate bullet 3 states explicitly, or is "the student's own facts"
deliberately broader (any extraction, approved or not)?

**Q2 (`b18-u-02`) — is an approved fact permanently un-askable, or does it go stale?** Bullet 3 states no expiry.
D-013 gives facts a validFrom/validTo history, but nothing ties that history to when a re-ask becomes legitimate
(e.g. a career-goal fact approved 8 months ago, before a school change). Should B18 name a staleness window, or state
explicitly that approval is permanent until superseded by a new approved value for the same key?

**Q3 (`b18-u-03`) — what is a do-not-ask entry's granularity?** F7 assumes both key-level (an entry for
`family_income` does not also cover `scholarship_need_based_eligibility`) and topic-level (an entry for
`visa_topic` covers every country's visa card) matching, with no contract text choosing between the two, or saying
who sets the granularity per entry.

**Q4 (`b18-u-04`) — can a do-not-ask entry be revoked, and by whom?** Bullet 4 only says a listed item is never
raised. It has no B15-style confirm/audit machinery for adding, editing or revoking an entry. Is the list mutable
after it's set, and if so what records a revocation (student says "actually you can ask that now")?

**Q5 (`b18-u-05`) — same-turn race: does suppression see the fact state before or after that turn's own update?**
B18's proof language ("produces zero visa items") is an outcome statement with no evaluation-timing boundary. When
a destination-changing fact lands in the SAME turn/processing step that also generates an item, which fact state
governs that item?

**Q6 (`b18-u-06`) — is "topic" matched by a fixed category, or by keyword/lexical overlap?** Bullet 2 gives one
worked example (visa items, India-only) and no taxonomy or matching mechanism. A paraphrase that never says
"visa" (e.g. "entry permit") would behave completely differently under a keyword-matching implementation vs a
fixed-category one, and the contract does not say which is intended.

**Q7 (`b18-u-07`) — what governs an explicitly undecided / deferred-intent signal (a gap year, "maybe abroad")?**
The suppress/surface model is binary. A fact that is neither a settled India-only reading nor a settled abroad
destination sits outside both headline cases, and B18 has no concept of partial or lower-priority relevance for it.

**Q8 (`b18-u-08`) — is "already known" scoped to the current session, or the whole longitudinal Student Knowledge
Graph?** B18's worked example reads within one scribe run, but ARCHITECTURE H3 describes a cross-session KG. Must a
fact approved months ago in an earlier session still block a re-ask in a brand-new session?

**Q9 (`b18-u-09`) — does bullet 3 cover a comparison card that functionally reopens an already-decided choice?**
Bullet 3's text restricts "a card or question asking for that fact" — literally an ask. B1 gives card TYPES
(question/comparison/evidence). A comparison card that invites reconsidering an already-approved choice (e.g.
"IELTS vs TOEFL, in case you want to switch," when the exam choice is already approved) does not literally ask, but
functionally does the same thing bullet 3 forbids. Which reading governs?

**Q10 (`b18-u-10`) — does a parent/guardian-voiced fact or do-not-ask instruction in a joint session carry the same
weight as the student's own?** B18 says only "the student's own facts" / "the student's do-not-ask list". D-026
ties a DIFFERENT property (auto-verify, B2) specifically to the turn's speaker being the student; B18 does not
say whether it means the same thing for a joint counselling session.

**Q11 (`b18-u-11`) — must an already-displayed item be retracted when the fact that justified it later changes?**
B18's proof language is about what the scribe "produces" going forward, not about items already shown before an
approved fact changed (e.g. a Canada visa card shown, then the Canada application is withdrawn). Does B18 require
retroactive retraction of prior output, or only that new output stop being produced?

**Standing note:** all 55 asserted rows are derived purely from contract prose (B18 plus the cross-referenced
clauses named per row); none were checked against the engine before assertion. The 11 quarantined rows above are
not guesses — each names the exact sentence-level gap in B18 that leaves its expected answer undetermined.
