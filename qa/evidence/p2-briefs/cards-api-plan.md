# Plan brief: t-010 slice (a) cards-api (/maker planner, read-only toward code)
Goal: an implementation plan for porting the /v1 cards API (getPreBrief, liveCards, cardFeedback routes + OpenAPI + LiveCardsWiring) from branch wave/t-010-live-cards (tip fb5959c; read it with `git show wave/t-010-live-cards:<path>` only) onto main (a2eed3c or later).
Sources: contract B21 (and B1/B2/B5/B18 where cards touch them) in qa/contracts/; qa/gates/plan-approved.md:14-16; qa/QUEUE.md row 84 (T-010 split, Umesh 2026-09-27); D-029, D-030 (delegated independent plan approval); qa/evidence/w1-cards-b1-t010-vs-main.md (K1 table).

## Constraints
- Main's T-049 cards engine code (fe0937e, D-079) is the base, never replaced.
- Edit in place: target existing files apps/api/src/{server,openapi,index}.ts and existing tests. A genuinely new file must be named and justified.
- The card-feedback WRITER is out of scope (T-050: recordLiveCardFeedback stays CardFeedbackUnavailableError; the route returns that typed error). The web panel and the B19 runner are later slices.

## Write ONLY qa/evidence/p2-cards-api/plan.md, containing
- the criteria in scope, verbatim, with ids;
- a per-file hunk list: main file:line anchor, what comes from which branch file:line, and the conflicts w1-cards-b1 saw in index/server/tests;
- tenancy/JWT checks per route, with the dual-trigger file:line;
- tests to add in TDD order, including cross-tenant and no-consent negatives;
- one falsification per criterion; the Tests[] affected set; risks; tier L, dual required.

Read-only otherwise: no code edits, no test runs needed, no python, no live calls, no Mongo, never edit .claude/**, qa/contracts, qa/gates. Commit only that file on main by pathspec, message ending Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Return `PLAN cards-api <sha>` + 5 lines (files, criteria count, open questions).
