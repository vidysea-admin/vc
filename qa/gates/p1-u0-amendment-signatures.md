# HUMAN_GATE: P1 contract amendments awaiting Umesh's signature (unit U0)
**Opened:** 2026-10-17T14:05:14+05:30 (checker; contract `qa/contracts/counselling-engine.md`, Amendment log entry "P1 Student Virtual Counsellor, unit U0")
**Status:** OPEN. Plan approval: D-089. Direction approved earlier: D-086, D-087, D-088.
**Blocks:** go-live only (the go-live script, spec A20, and `g-prod.md`/`g-publish.md` read the `B13-signed:` line).
Build and tests are not blocked: the amended text governs them now.

Why a signature at all: the checker's rule is that removing or weakening a safety or data invariant, or enabling an
outward-facing action, is a critical amendment that a human signs. Umesh approved each direction in the decisions above;
this sheet is where the written text is signed off, so that "approved in chat" and "what the contract now says" are the
same thing. Reply `sign all`, or name the items to change.

## A. Required before any production exposure
`B13-signed: PENDING`

| Item | Contract | What the text now says | Basis |
|---|---|---|---|
| U0-5 | B13 production exception | Pathlynks-authenticated students, who may be minors, may have text and voice processed in production by Gemini, the KB's LLM provider and Tavily (authenticated `/ask` only) and any failover-chain provider, **only** with a signed processor register; tests/evals stay synthetic | D-086 Q16 ("Umesh signs") |

**Processor register (Umesh fills at signature; nothing is asserted by the checker):**

| Processor | Data it sees | Terms / retention / training use | Region / cross-border basis | DPDP basis |
|---|---|---|---|---|
| Gemini (text + Live) | PENDING | PENDING | PENDING | PENDING |
| KnowledgeBase LLM provider (name PENDING) | PENDING | PENDING | PENDING | PENDING |
| Tavily | PENDING | PENDING | PENDING | PENDING |
| Other failover-chain providers (LiteLLM gateway classes) | PENDING | PENDING | PENDING | PENDING |

## B. Critical amendments, direction already approved (signature recommended, not read by the go-live script)
| Item | Contract | What the text now says | Basis |
|---|---|---|---|
| U0-2 | B2 `claims[]` | sourceId = `/ask` `node_id` or `/search` `turnId`; status verified/attributed/unverified; an `unverified` claim is shown flagged (the one exception to "every fact sourced"); no "every sentence cited" claim | D-087 Q17, spec scope item 4 |
| U0-3 | B4 consent | Pathlynks-authenticated = consented on student routes; no consent-claim verification; B23 untouched | D-086 Q1 |
| U0-4 | B6 voice | hard rules cannot run before live voice is spoken; monitored not enforced; four compensating controls; voice off until A10 + go-live gate | D-085, D-086 Q4 |
| U0-6 | B21 anonymous | closed list of text-only anonymous routes may skip the JWT; everything else 401 | D-085, D-088 Q7 |
| U0-10 | B24.6, B24.7, B24.9 | anonymous text-free counter; crisis defaults (Tele-MANAS 14416, keep talking, no secrecy promise, log every flag, human alert off until Nights); go-live gate and budget cap | D-087 Q11, D-088 Q5/Q7/Q18 |

## C. PROPOSED: beyond D-086..D-089, not in force until signed
| Item | Where | Proposal | Alternative |
|---|---|---|---|
| P-1 | B21 student identity | claim names `sub` = student id, `tenant`, `role` = `student`; the client backend mints (Pathlynks) with the same configured issuer and key as counsellor tokens, placeholder issuer `umesh` until theirs; `aud` check; a short-lived VC-minted WebSocket token for voice | different claim names or minting |
| P-2 | B4 | student routes use no consent row at all | write an audit row derived from the JWT |
| P-3 | B24.6 | the anonymous counter carries a text-free `kind` field (answered / no_answer / sign_in_required / crisis); D-088 Q7 says only "count, date" | count and date only |
| P-4 | B24.7 | after the fixed crisis message, later turns may be generated under a crisis-safe skill with the forbidden-phrase list enforced as a guard | templated replies only |
| P-5 | B24.8 | student-surface profile facts live in their own `profile-facts` collection and never enter the counsellor-approved graph (B3) | reuse `packages/db/src/facts.ts` with a source field |
| P-6 | non-goals | a Pathlynks-supplied profile reaches VC only after the signed B13 line and the go-live gate; whether the Q3 DPDP legal review must also finish first is for Umesh | state it in `g-prod.md` |
| P-7 | B24.2 default | staleness threshold: 24 months (a starting number, not sourced) | any other value |
| P-8 | B24.8 default | ranking weight vector over fit / cost / scholarship chance / visa ease: 0.40 / 0.25 / 0.20 / 0.15, reported as `rankingProfile: student-success` (a starting vector, not sourced) | any other vector |

**Answer format:** chat reply. The maker appends `Answered: <ISO> - <A|B|C items> - <where>` below; for item A the checker
then flips `B13-signed:` to `SIGNED <ISO> by Umesh` and fills in the register as given. Nothing in C takes effect without it.

Answered: 2026-10-17T14:11:30+05:30 — P-1..P-8 — accepted as defaults (P-7 staleness 24 months and P-8 weights 0.40/0.25/0.20/0.15 are configurable placeholders; P-1 token format is a draft until Pathlynks confirms) — Umesh in chat ("Accept all as defaults")
Answered: 2026-10-17T14:11:30+05:30 — Tavily — REMOVED from the B13 processor list. Umesh asked why Tavily is needed when Gemini is already used; VC drops every web_used answer (B24.1 serve rule), so Tavily adds no value and only exposes query text. Operating rule: the KnowledgeBase TAVILY_API_KEY stays unset for any deployment that VC calls (ask-web-fallback.ts:57-60: no key = no web call). B13 processors: Gemini (VC) + the KB's LLM provider (to be named in the register). B13-signed stays PENDING until go-live.
