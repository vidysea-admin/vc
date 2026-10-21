# Build brief: p1-nosource-expert (D-110)
You are a /maker build subagent. Read the maker protocol: C:/Users/Lenovo/.claude/skills/maker/SKILL.md (sections "Evidence manifest template" and "Test selector prompt"). Work ONLY inside D:/vc/.worktrees/p1-nosource-expert (branch wave/p1-nosource-expert, base 03f475a). Never edit qa/contracts, .claude/**, docs/DECISIONS.md. Never git add -A. Never kill a process by image name.
Policy-Version: proportional-verification/2026-10-19.17. Tier M (multi-file behaviour plus prompt text); the ai-engineer review runs alongside the checker. Budget: about 45 min of building.

## Source of the change
docs/DECISIONS.md D-110 and qa/feedback-inbox.md, latest entry (Umesh, 2026-10-21): "agar source answer nhi hai tho ai should really give well like an expert insted of saying just a no". He chose a full expert answer with numbers, plus a disclaimer. The helpline sentence goes only on distress replies; the footer stays.

## Acceptance criteria
- C1 No-source expert answer. Anonymous and authenticated student chat: when the KB gives no servable source, the reply is a short disclaimer followed by an expert counsellor answer from the text chain (VC_TEXT_CHAIN, the existing provider seam). Numbers are allowed.
  - Disclaimer wording: "General guidance — I couldn't find this in Vidysea's verified sources, so please confirm fees, deadlines and amounts on the official website." Translate it in the reply language the same way existing strings are.
  - The state stays "no_sourced_answer". claims [] and sources [] are unchanged, so the schema does not change. The gap is still recorded.
  - If the chain fails or times out, return the current refusal text, so the turn never errors.
  - The answer runs through the same output safety and redaction steps as sourced answers.
- C2 Helpline only on distress. The Tele-MANAS 14416 sentence is no longer appended to non-distress replies: sourced answers, no-source answers, and a sign_in_required reply that has no distress or concern signal. Replies flagged as concern or distress keep it.
- C3 Distress order. In a non-crisis concern or distress reply, the empathy line comes first, then the sign-in or help sentence, then the helpline. Example from the demo: "Mujhe bahut stress hai, kuch accha nahi lag raha" came out sign-in, then helpline, then "That sounds like a lot of pressure...".
  - Do NOT change the LK10 crisis/escalated wording. Umesh signed it off (D-108 item 1).
- C4 Unchanged:
  - the safety screen, crisis and escalated routing;
  - the anonymous route's sign-in redirect for personal questions;
  - the A20 go-live gate;
  - the spend cap.
  Update the openapi summary at apps/api/src/openapi.ts:571 to match.

## Where to start (verify each yourself)
packages/engine/src/student/graph.ts:710 (emptyResponse no_sourced_answer), packages/engine/src/student/lang.ts:27 (NO_SOURCED_ANSWER_TEXT, ANONYMOUS_NO_ANSWER_TEXT and helpline strings), apps/api/src/chat.ts:494 (gap record), apps/api/src/openapi.ts:571.

## Test discipline
- TDD: write a failing test first for each criterion, using the fake/mock provider and fake KB. That is deterministic evidence (policy .15-1).
- Run only the affected test files, never a whole package suite. Run: `git grep -l` for every changed string (old refusal text, helpline sentence) under tests/ and evals/, and update the hits. Paste the grep lines in the manifest.
- Live check after the deterministic tests are green:
  - one `probe: ollama ok|fail` call;
  - at most 3 live no-source questions against DeepSeek, using env from D:/vc/.env;
  - record them as `live:` lines.
  - Never print key values.

## Deliverables
Commit the code plus qa/manifests/p1-nosource-expert.md, using the template fields: Pre-check[C1..C4], Tests[C1..C4], Falsification per criterion, Round, Metrics, and Status: ready-for-check. Run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/p1-nosource-expert.md` until it exits 0. Do not dispatch a checker.
Return ONE line: `p1-nosource-expert <sha> ready`, or `p1-nosource-expert BLOCKED <reason>`.
