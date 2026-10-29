# t057-tool-first-inventory

READ-ONLY audit for D-128 "tool-first guidance" (see docs/DECISIONS.md D-128). Never edit product code, never restart services, never write to any DB. Only Vidysea for now (Pathlynks is deferred).
Goal: for each Vidysea expert tool a student can use, find (a) what it does, (b) its in-product route, and the step-by-step UI path to use it, (c) which backend tables/collections it writes when the student uses it, (d) whether VC can already read that data today.
Sources:
- Vidysea frontend D:/vc/.worktrees/vc-vidysea-frontend (git branch prod: use 'git -C ... ls-tree -r --name-only origin/prod' and 'git show origin/prod:<path>'); student routes under src/app/student/**, public tools, src/messages/en.json labels.
- Vidysea backend D:/vc/.worktrees/vc-vidysea-backend: routers and models/migrations for each tool (university/program search, shortlist/favourites/wishlist, journey map/roadmap/timeline, applications, compare, scholarship finder, loan/visa enquiries, test prep, counselling bookings, Pathlynks assessments link).
- VC side: what VC reads today. That covers apps/api (the student context), mcp/pathlynks/src/port.ts (the Vidysea read executor and allowed SELECTs), and ai_counsellor_router.py vc_student_proxy, plus the native shortlist port mentioned in earlier evidence.
Optionally run READ-ONLY metadata queries via the existing read-only path (information_schema table and column names, row COUNTs only for the TEST student id named by env key VC_TEST_VIDYSEA_USER_ID; never print row content or secrets).
Deliver qa/evidence/t057/tool-first-inventory.md:
1. A table with one row per tool: name | purpose | route | steps to use (3-6 short steps) | tables written (file:line) | VC reads it today? (file:line or NO) | owner-bound SELECT needed.
2. Specific findings for "best universities in Canada" (which search tool, with which filters) and "make my full journey" (does a journey map exist? route and tables).
3. Gap list and the smallest design to make VC (i) route such requests to the tool with steps plus a relative link, using the existing navigate_steps catalogue path (now labelled), and (ii) on later turns read the student's resulting rows and summarise them. Name the existing files to extend, editing in place.
4. Open questions for Umesh.
