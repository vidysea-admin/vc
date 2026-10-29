# t057-scripted-checks

Run the T-057 scripted checks against the LIVE local stack and record evidence. The stack is: VC API http://localhost:8787 (just restarted with the Gemini provider), Pathlynks backend 5001, Vidysea backend 8000, mongod 27019. Do not restart any service. Do not edit product source; you may only write evidence files under qa/evidence/t057/. The headed browser walks are being run separately by the main session, so do NOT run walk.mjs and do not open browsers.

Criteria (frozen contract = source 2):
- C1: run `pnpm demo:preflight` if it exists (check the package.json scripts at the repo root and in apps/api). If it does not exist, report that it is MISSING, and do the equivalent read-only reachability checks with existing scripts or code.
- C2 and C3: `pnpm demo:context pathlynks` / `pnpm demo:context vidysea`, under the same rule.
- C8 isolation: using the existing API tests, or a small script under qa/evidence/t057/ that calls the live API, show these four things:
  1. A token for student A cannot list or read student B's threads.
  2. No token gets 401.
  3. A malformed or wrong token gets 401/403.
  4. No platform DB query runs for a rejected request (check the API log at C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs/vc-api.log).
  Mint tokens only the way the existing tests or demo scripts do. Never print secrets.
- C9: run the existing crisis tests (grep apps/api/tests and packages/engine for crisis). Show the safe reply and zero LLM calls.

Write qa/evidence/t057/scripted-checks.md with a table per criterion: command, PASS/FAIL/MISSING, and an output excerpt (no real student rows, no secrets).
