# t057-pathlynks-walk-2

Pathlynks walk run 2. Run 1 was blocked because no Pathlynks frontend was running (see walk-pathlynks-run1.md).
You MAY start the local Pathlynks Next frontend: next dev in D:/vc/.worktrees/quest-pathlynks-frontend, on port 3000, detached, logging to the scratchpad. Wait for it to compile /signin. When you are done you MUST stop exactly that process (by its pid/port 3000) to free RAM. Do not touch any other service (VC API 8787, widget 8790, Vidysea 3001/8000, backends 5000/5001).
Check which backend the frontend env points to (key names only). If it needs a backend on a port that is down, report it rather than starting other things.
Run: VC_WALK_PATHLYNKS_BASE=http://localhost:3000 node qa/.delivery/requests/t057-walk.mjs pathlynks > qa/evidence/t057/walk-pathlynks-run2.log 2>&1 in the background and poll; long waits are normal. The career-quest step now throws on HTTP >= 400.
After the scripted steps, add an optional step to the script, enabled by env VC_WALK_EXTRA_ASKS=1, that sends "how far am I in Career Quest", "mere goals dikhao" and "what should I do next" in the open widget and records the reply kind and length. Report kinds and lengths only, no student text.
D-133: no rows on production Pathlynks other than the VC thread and turn writes. Close the browser. Write qa/evidence/t057/walk-pathlynks-run2.md with a step table and a diagnosis for each failure (file:line, proposed fix). Do not edit product code.
