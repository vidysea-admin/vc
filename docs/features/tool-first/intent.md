# Intent — tool-first (DRAFT for Umesh, 2026-10-29)

Status: DRAFT. Not approved. `qa/gates/plan-approved.md` is not written; only Umesh approves.
Sources: D-122..D-129 (`docs/DECISIONS.md`), `docs/demo-contract.md`, `qa/evidence/t057/tool-first-inventory.md`,
`qa/evidence/t057/services-knowledge-audit.md`, `ARCHITECTURE.md`. Order: the T-057 demo finishes first (D-129 Result).

## Problem
Vidysea has already built expert tools: University Explorer and Search, AI University Finder, Shortlist, Compare, Journey Map,
Applications, Visa, Scholarships, Documents, Tools Library. When a student asks for something one of these does, VC today
either gives a generic expert answer or "no sourced answer yet" (inventory 2a, 2b). It does not name the tool, give the
steps, or deep-link to it, and it cannot see what the student did afterwards. In Umesh's words (D-128): "hum already expert
tool bana chuke hain ... user se hamare tool use karwane ... dobara reinvent wheel nahi karna".

Measured causes (inventory section 3):
- G1: `SAFE_ROUTE` in `packages/engine/src/tools/navigate.ts:56` refuses `?section=`, and almost every logged-in tool is
  `/student/journey-details?section=<key>`. No hub tool can be named with a link today.
- G2/G3: `TASK_RECIPES` (`navigate.ts:38`) hold two Pathlynks recipes only; `classify.ts` has no Vidysea tool intents.
- G4: the Vidysea port reads four tables only (`mcp/pathlynks/src/port.ts:363-370`); journey maps, applications, visa,
  favourites and scholarships are not readable, and `vidysea-db` is `enabled:false` in the dev `config/sources.json`.
- G6: the test student has no rows to summarise (0 shortlist, journey, application rows).

## Proposed outcome
1. When a student's need matches a Vidysea tool, VC names the tool, gives 3-6 fixed, reviewed steps and a relative in-product
   link (`/student/journey-details?section=<key>` from a closed list). VC does not write the answer a tool already produces.
2. A widget checkbox, "Let VC open screens and run searches for me" (consent, per page load). Ticked: VC opens the right
   screen and runs the read-only search (for example "best universities in Canada"). Unticked: steps only.
3. On later turns VC reads the student's own resulting records (journey maps, applications, visa, favourites, saved
   scholarships), owner-bound and read-only, and writes a short progress summary with next steps. Every number and status in
   the summary is checked in code against the rows.
4. VC knows the product and the database as a graph (which tool serves which need, which table holds what), so it can pick
   the right tool from the need. The model that writes and the model that answers are configurable, with a fast default.
5. VC still answers directly what no tool covers: general guidance and KB facts, under today's grounding and safety rules.

## Affected users and systems
- Student types (to confirm in `/grill` user-type mode, see spec): anonymous visitor, new explorer, shortlister,
  applicant, visa-stage student, Pathlynks-linked career-undecided student.
- Vidysea ops/Umesh: model-per-role config, tool catalogue review.
- Systems: `packages/engine` (navigate, classify, graph, ingest), `mcp/pathlynks` (Vidysea port), `apps/api` (chat response,
  config), `apps/widget`, `packages/providers`, `skills/vc-navigation`, `skills/vc-capabilities`, `config/sources.json`, and
  the Vidysea frontend checkout for host navigation (phase 2 only).

## Constraints (all inherited, none relaxed)
- VC never writes to platform DBs (D-123, Tier A). Act-on-behalf is navigation plus read-only search only: VC never submits a
  form, never pays, never presses a button that writes (Generate Journey Map, Add to shortlist, Start application).
- Platform DB reads are owner-bound, SELECT-only, read-only transaction, column allow-lists, no free-text columns.
- Deep-link section keys come only from a fixed reviewed list, never from free text (D-129 item 1). Steps are constants.
- Crisis path stays deterministic with zero LLM calls; the no-script rule stays ("never a cheating platform").
- Student data goes to an LLM only under D-122 and only allow-listed columns. Web grounding never receives student data.
- Edit existing files in place; no new modules, no `_v2` files.

## Non-goals
Pathlynks tool-first (deferred, inventory open question 10); the unused `/roadmap` API; counselling-session reads (held by an
external session service); any write to a platform DB; auto-clicking Generate, Shortlist or Apply; deployment (D-122/D-124).

## Open questions
Listed in `plan.md`, section "Open questions for Umesh".
