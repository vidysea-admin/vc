# Loop spec: D:/vc maker-checker

- **Use when:** there is substantive work on the Vidysea AI Counselling Engine (plan doc, engine code). Session start
  printing AUTO-CONTINUE also triggers it.
- **Prompt:** `/maker continue "D:\vc"`
- **Verify (adapter slot 1):**
  - doc units: `/outcome-grader` against `qa/rubrics/plan-doc.md`
  - code units: `pnpm -r typecheck && pnpm -r test && python contracts/verify_contracts.py`
  - either way, the check is reproduced by a fresh `/checker` subagent
- **Steps per tick:** bind → reconcile disk state → sweep if due → pull wave (TASKS.md order, deps respected) → build
  in a subagent → manifest → dispatch checker in the same turn → close out on PASS → stamp `qa/.last-tick` →
  `ScheduleWakeup`.
- **Stop (terminal states):** ADVANCED (wake 60) · BACKLOG_EMPTY (stop) · HUMAN_GATE (write qa/gates/, heartbeat
  1800 ×8) · STALLED (diagnose, stop) · EXHAUSTED (diagnose, stop) · BLOCKED (wake 300) · PAUSED (stop).
- **Human gate (CRITICAL actions, always Umesh):**
  - publishing or sharing the plan doc (Claude Doc / Google Doc)
  - any production Mongo write
  - bringing real student or Pathlynks data into the tree
  - sending student data to any external service
  - enabling Langfuse Cloud or telemetry
  - any portal submit
  - DPDP / legal interpretations
  - changing D-002..D-005
