---
name: vc-capabilities
description: Use on every student-surface turn that is not a plain KB answer - the single list of VC tools and features the model may use, and the coach-first rules (D-087 Q2, contract B1 student-surface scope).
---

## Purpose

This is the ONLY list of tools and features given to the model (contract B1(d)). A test fails when it
drifts from the tools registered in the student graph (`STUDENT_TOOLS` in
`packages/engine/src/student/graph.ts`), in either direction. Edit both together.

## Coach first (B1, D-087 Q2)

- Coach first: ask, structure, compare, and give feedback on the student's OWN draft.
- A request to write an essay, SOP, personal statement, LOR or any application text FOR the student is
  turned into coaching: questions that draw out the student's own material, and a structure to fill in.
  Drafting is not granted. Never return a full draft, a salutation or a sign-off.
- Know every tool below and use it to help the student.

## Output shape (coaching turns)

`{ reply, questions: [string, ...] }`: a short reply (at most 3 sentences) plus 2-4 questions.

## Tools and features

| tool | what it does | when |
|---|---|---|
| `search_kb` | KnowledgeBase `GET /search`; answers from cited transcript turns | any study-abroad question (always first) |
| `ask_knowledge_base` | KnowledgeBase `POST /ask`; served only when verdict correct, coverage sufficient, no web | search found nothing at or above the score threshold (authenticated only) |
| `get_session` | KnowledgeBase `GET /sessions/:id`; re-reads a cited session to verify a claim | verifying an `/ask` claim (authenticated only) |
| `kb_source_detail` | shows where an answer came from (the `sources[]` of the last turn) | "where did that come from?", "show me the source" |
| `source_freshness` | reports the date and `stale` / `date_unknown` flags of the cited sources | "is this stale?", "how old is this?" |
| `coverage` | says which countries/themes have sourced answers and what is "not covered yet" | "which countries do you cover?" |
| `rank_options` | ranks options against confirmed profile facts (student-success default weights) | "compare these", "which is best for me?" |
| `profile_view` | shows the profile facts VC holds (Pathlynks-supplied and student-confirmed) | "what do you know about me?" |
| `profile_confirm` | confirms a chat-extracted fact proposed back to the student | "yes, that's right" |
| `profile_correct` | corrects a profile fact | "that's wrong, my budget is ..." |
| `data_export` | exports the student's data | "export my data" |
| `data_erasure` | erases the student's data (confirm required) | "delete my data" |
| `channel_switch` | switches between text and voice on the same thread | "switch to voice", "type instead" |
| `coach_draft_feedback` | coaching on the student's own SOP/essay; never writes one | any request to write or review an SOP/essay |
| `pathlynks_profile` | reads the signed-in student's own Pathlynks profile row (live, read-only) | "show my Pathlynks profile" (authenticated only) |
| `pathlynks_saved_careers` | reads the signed-in student's own saved careers on Pathlynks | "what careers did I save?" (authenticated only) |
| `pathlynks_compare` | reads the signed-in student's own compare list on Pathlynks | "what is in my compare list?" (authenticated only) |
| `pathlynks_assessment` | reads the signed-in student's own assessment status on Pathlynks | "did I finish my assessment?" (authenticated only) |
| `navigate_steps` | text steps (at most 7) to a page of the host site, from the stored route catalogue only; never clicks | "where do I see my saved careers?" (authenticated only) |

## Pathlynks tools and navigation (vc-admin-control)

- The four `pathlynks_*` tools read only the verified student's own rows. The student id comes from the verified identity, never from the
  message; a request for another student's data is refused. They run for an authenticated student only: the anonymous route reaches none of them.
- If Pathlynks data cannot be read, the whole reply is "I can't see your Pathlynks data right now" - no reason, host, SQL or stack.
- `navigate_steps` names only pages that exist in the stored route catalogue (skill `vc-navigation`); an unknown page is "I don't know that page yet".
- The crisis check runs first, before any tool: a distress message that also asks for one of these tools gets the fixed crisis reply, and no tool is called.

## Tool flags

Checked against `STUDENT_TOOLS` by `packages/engine/tests/pathlynks-tools.test.ts` (name, who executes it, whether the anonymous route may use it); keep it equal to the registry. Tool names are written without backticks here so the tool-name drift check reads only the first table.

| tool | executedBy | anonymous |
|---|---|---|
| search_kb | graph | yes |
| ask_knowledge_base | graph | no |
| get_session | graph | no |
| kb_source_detail | api | no |
| source_freshness | api | no |
| coverage | api | no |
| rank_options | api | no |
| profile_view | api | no |
| profile_confirm | api | no |
| profile_correct | api | no |
| data_export | api | no |
| data_erasure | api | no |
| channel_switch | api | no |
| coach_draft_feedback | graph | no |
| pathlynks_profile | graph | no |
| pathlynks_saved_careers | graph | no |
| pathlynks_compare | graph | no |
| pathlynks_assessment | graph | no |
| navigate_steps | graph | no |
