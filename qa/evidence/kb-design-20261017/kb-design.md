# kb-design: vectorless curated KB for the student Virtual Counsellor (D-083)

Proposal for the maker PLAN gate. No code written. Evidence: `source-register.md` (same folder).

## 1. Shape

Copy the operating brain's method, not its paths. Curated markdown **pages** with citations; a small **ROUTER card** picks the territory; a **BM25 text search** (no embeddings) returns 1 to 3 pages; the model **reads them in full and answers citing them**. The brain measured 95% right-page hits this way versus 42% from a big index; we re-measure on our own golden set. Order: (1) curated pages, (2) sibling KnowledgeBase `POST /ask` for gaps, (3) otherwise "no sourced answer yet" plus a logged gap. No web, no training-data, no uncited answers (contracts B2/B21 already enforce the last).

## 2. Page format (`kb/pages/<territory>/<slug>.md`, 300 to 900 words)

```
---
id: nl-scholarships-overview     # stable, never reused
topic: scholarships              # a ROUTER territory
country: NLD                     # ISO-3 or ALL
audience: [ug, pg]
sources:                         # every sentence cites a key
  - {key: s1, tier: T1, label: "Study in NL scholarships", url: "...", fetched: 2026-10-20}
  - {key: s2, tier: T3, label: "TOC seminar, 21 Apr 2026", ref: "drive:<id>", speaker_claim: true, quote_permission: none}
last-verified: 2026-10-20        # REQUIRED, set by a human reviewer
review-by: 2027-01-20            # TTL: visa and scholarships 90 days, rankings 365
status: live | draft | stale | retired
pii-checked: true
---
## Answer in brief   (3 to 6 lines, each ending in [s1])
## Details   ## What varies (check the official site)   ## Not covered
```
Lint rules: a sentence with no source key fails; T3 claims read "a seminar speaker reported..."; amounts and deadlines carry a year; counsellors are paraphrased, never named, unless `quote_permission: granted`.

## 3. ROUTER card (about 2,000 tokens, always in the prompt)

Brain `ROUTER.md` shape: `last_verified`, a table "question about -> territory -> start at", a cluster map with page counts, honesty rules. Territories: country admissions (one per country), visa, scholarships and funding, exams and test prep, boards (IB, CBSE), UK/UCAS, US process, careers and pathways, application steps, living costs, Vidysea products. Tiebreak: country beats topic ("NL visa" starts at `visa/nld`). Rule: empty search means "not covered", log a gap, never blend training data. The card never lists files; search does.

## 4. Search tool

`search_kb({query, country?, topic?, k=3})` returns `{id, title, country, topic, last-verified, status, score}` with no bodies; `read_kb_page({id})` returns body, front matter and resolved sources. BM25 (k1 1.5, b 0.75, stop-words) over title, headings, body; the **server caches the index** (the brain script rebuilt per call and took 53 s cold here). Filters narrow before scoring; a score below a floor returns `[]`; `retired` pages are never indexed; `stale` pages are returned flagged. The model passes 2 to 4 English keywords; the engine already translates to English.

## 5. How the engine calls it

`packages/engine` stays thin LangGraph.js. One node `answer_from_kb`: the model sees the card, calls `search_kb` then `read_kb_page` (max 3 pages, 2 rounds); if nothing fits it calls `ask_knowledge_base`; if that is `unavailable` or uncited, the reply is the fixed "no sourced answer" text and a gap row is written. A deterministic guard, not a prompt, then checks every factual sentence maps to a source key from a page read this turn, else blocks (reuse the `citation-required` guard and `verifier` skill). Soft rules go in a new `skills/kb-answer/SKILL.md` (H5). Tool boundary is MCP per H5. The engine does not import `university-kb` today (register B6), so wiring is part of the P1 plan.

## 6. Reuse, not duplication

- **`mcp/university-kb`** (it is `D:/vc/mcp/university-kb`; there is no `packages/university-kb`): add `search_kb` and `read_kb_page` as two tools in the same server, one new module in that package, beside `search_courses`, `get_course`, `ask_knowledge_base`. Same drop rule: a page whose sources lack `url|ref` plus a date is dropped and counted. No second server, no second citation shape.
- **KnowledgeBase repo** is the raw layer (transcription, diarisation, claims with `evidence[]`, `/ask` over its vectorless tree). Our pages are the curated layer distilled from verified claims; a `kb:` source stores `claimId` and `sessionId` so a reviewer walks page, claim, turn, timestamp. We do not re-ingest transcripts.
- **Courses and universities** stay in Mongo behind `search_courses`; pages link, never copy tables.
- **Brain**: reuse its consult log with outcome marks (helped, irrelevant, wrong) as the page-quality signal.
- Decision for Umesh: content home. Recommended `D:/vc/kb/pages/` (versioned, ships with the service); alternative is the KB repo so TOC-derived text stays out of the VC repo.

## 7. Citation shown to the student, and PII

```
Answer text.[1][2]
Sources
[1] Study in NL, "Scholarships" (official site), checked 20 Oct 2026
[2] Vidysea education seminar, 21 Apr 2026 (speaker-reported; confirm on the official site)
Last reviewed by Vidysea: 20 Oct 2026
```
Show label, tier wording (official, Vidysea data, speaker-reported), date, public link if any. No Drive ids, no speaker names. The trace keeps page id, source keys, claim ids. A stale page adds "may be out of date; check the official site."

Student PII never enters: ingest refuses source types `student-transcript` and anything from student collections; CI lint rejects emails, phone numbers and "my daughter / I am" name patterns; WhatsApp only expert-sender messages, redacted, from a hand-approved list; reviewer ticks `pii-checked`.

## 8. Freshness and correction loop

1. Past `review-by` a page flips to `stale` (still served, flagged); a weekly list ranks stale pages by traffic.
2. Thumbs-down, counsellor flag, or a verifier citation failure opens a correction item (page id, question, trace id). Feedback persistence is VC T-050 and still open, so v1 appends to `qa/kb-corrections.jsonl`.
3. Owner edits from the official source, bumps `last-verified`, adds a line to `kb/CHANGELOG.md`. No silent edits.
4. Empty searches feed a gaps list; top gaps decide what to write next.
5. Gate: 60-question golden set scored hit@3 by script (target 0.95), 100% of answers cited, plus the head-to-head against expert answers from D-083.

## 9. Build order and risks

Order: licence call on TOC material; 10 pilot T1 pages for 3 countries (T3-only pages cannot answer alone); card, tools, guard, golden set; transcribe the scholarship audio and write NL and JP pages from official sources (no text guide exists today); count `courses` and KB claims.

Risks: no Netherlands or Japan scholarship text in Drive; TOC redistribution rights unknown; Pathlynks WhatsApp export not located; BM25 misses synonyms and Hinglish (English rewrite, an alias line per page, golden set will show it). Crisis handling is out of scope; current notify-counsellor behaviour stays.
