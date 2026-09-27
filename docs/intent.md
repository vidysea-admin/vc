# Intent — Vidysea AI Counselling Engine (Virtual Counsellor)

<!-- Backfilled 2026-09-26 (ISS-059): this project predates the intent → grill → spec → plan gate.
     Drafted from what the originators already approved: goal.md, the CEO transcript, the Google Doc
     "Virtual Counsellor", D-002..D-021 and qa/contracts/counselling-engine.md. Nothing new is decided
     here; this file only gathers it. -->

**Originator:** CEO (north star) + Umesh (founding operator) · **Date:** 2026-09-26 · **Status:** draft (backfill, awaiting one approval)

## Problem
Counselling knowledge lives in one expert's head and one conversation at a time. Each session is lost as
soon as it ends, a novice counsellor cannot reach an expert's quality, and application forms get retyped by
hand. The CEO is clear that the tool must not become a crib sheet: "sounding board, not a cheating platform".

## Proposed outcome
- **O1: Explore → Conclude → Execute, with the human deciding.** The counsellor explores and challenges the
  student's thinking with AI help (questions, comparisons, evidence), never with a script (B1).
- **O2: nothing said is lost.** Every conversation is kept verbatim ("puri chat bhi save rehegi") and turned
  into a cited, longitudinal Student Knowledge Graph that holds numbers *and* reasoning. The counsellor approves
  every fact (B2, B3, D-020).
- **O3: novice + VC ≈ expert.** A person with no counselling background, working with VC, reaches at least 90 %
  of Sapna ma'am's benchmark on the same case (B22).
- **O4: the application is drafted in 15 minutes and submitted by the student** (P2, draft-only).
- **O5: safe by default.** Crisis signals are never missed or hidden (B9, B16). Concerns are flagged and the
  session continues (B20). Student data follows DPDP: consent, export, and erasure with read-back zero (B12, B15).
- **O6: it keeps working when a model fails.** A 3-model failover shows an apology plus Retry, and the user
  never retypes (B6).
- **O7: API-first.** VC is a headless intelligence service, and Pathlynks is its first client. The client
  builds the production UI (B21).
- **O8: personalised, never repetitive.** VC never re-asks what is already known about the student, and
  its questions change with the child. It skips what is irrelevant (an India-only student gets no visa
  items), per the CEO north star and B18.

## Affected users and systems

### User types (B17 persona ladder, Umesh 2026-09-26)
| id | who | goal | blocks on | confirmed |
|---|---|---|---|---|
| sapna-expert | top counsellor (Mayo College, Ajmer) | the benchmark, and the reviewer of VC's suggestions | anything script-like; shallow advice | Umesh, 2026-09-26 |
| gaurav-pm | IIT product manager, no counselling background | run a good session with VC as sounding board | jargon; no "why" behind a suggestion | Umesh, 2026-09-26 |
| gaurav-bhaiya | office staff, ~12th pass, Hindi-speaking, cannot read English or write | finish every flow in Hindi, by voice | any typing; English-only screens | Umesh, 2026-09-26 |
| jaipur-counsellor | tier-2-city counsellor, 1–2 years | approve the scribe's facts after a session quickly | unclear labels; long review lists | Umesh, 2026-09-26 |
| school-counsellor | school counsellor | a student's profile across sessions | missing history; nothing to cite | Umesh, 2026-09-26 |
| govt-teacher | first-time laptop user, Hindi-first (Haryana pilot) | use it unaided | any hidden step | Umesh, 2026-09-26 |
| uk-counsellor / us-counselor / au-agent / ca-consultant | policy-compliance personas (GDPR/UCAS/UKVI · FERPA/NACAC · ESOS/PIER · licensed-only visa advice) | VC never breaches their market's rule | a suggestion that breaks the rule | Umesh, 2026-09-26 |

### Systems
- **This repo:** a pnpm TS monorepo (apps/api, apps/web reference UI, packages/{engine,db,providers,schemas,observability}, mcp/*).
- **Runtime:** LangGraph.js; Mongo database `virtual_counsellor` (full CRUD; D-009, B12); Langfuse; a LiteLLM gateway (Gemini) and a no-AI rules provider (D-019).
- **External:** the Pathlynks backend (JWT issuer, the webhook consumer), and the KnowledgeBase `POST /ask` (B21).

## Constraints
- Synthetic or anonymised data only (B13). Real student data never goes to an external service without per-use approval.
- Production Mongo is read-only except `virtual_counsellor`, and dropping that DB is gated.
- AI-vendor independence (D-019). Hindi, Hinglish and Devanagari are first-class inputs.
- Outward-facing actions (the release video to Sapna ma'am and Gaurav bhaiya, any Pathlynks connection) are Umesh's.

## Non-goals
- Bulk student import (it belongs to the counsellor portal; D-021).
- A production UI or a login screen of VC's own. The client builds the production UI, and apps/web stays
  the reference and test UI (B21, D-021).
- Submitting applications for the student. VC drafts them, and the student submits (P2).

## Open questions
- [x] failover-scope: answered 2026-09-26: 10 attempts in total across the 3 models, and wrong-shape output counts as failed (qa/gates/failover-scope.md; built in T-021)
- [ ] JWT issuer and key rotation from the Pathlynks backend team (D-021 §6)
- [ ] B22 reference: Sapna ma'am's rubric is not yet recorded. PARKED: B22 is reported NOT-YET-MEASURABLE until then.
- [ ] Response-time SLA for crisis escalation (B16). PARKED: not yet set.
