# tool-first-plan-draft

Draft the PLAN-gate documents for the D-128 / D-129 tool-first feature. Read docs/DECISIONS.md D-122..D-129, docs/demo-contract.md, qa/evidence/t057/tool-first-inventory.md, qa/evidence/t057/services-knowledge-audit.md and ARCHITECTURE.md.
Write three DRAFT files under docs/features/tool-first/: intent.md, spec.md and plan.md. Do not write qa/gates/plan-approved.md; only Umesh approves. These are drafts for Umesh.
The spec must cover:
(a) Routing student asks to Vidysea tools using fixed ?section= deep links and step-by-step recipes. Examples: 'best universities in Canada' goes to /search with a country from a fixed list; 'full journey' goes to shortlist, then Generate Journey Map.
(b) An 'act on my behalf' consent checkbox in the widget. When ticked, VC opens the relevant screen and runs the read-only search, through host navigation or postMessage. When not ticked, it gives steps only. VC never writes to platform DBs (D-123), never submits forms and never pays.
(c) Owner-bound read-only tracking of journey maps, applications, visa tables, favourites and scholarships through mcp/pathlynks/src/port.ts createVidyseaPort, with column allow-lists and no free-text columns.
(d) A product + DB knowledge graph: the existing ingest of routes, the labelled catalogue and the schema map from the github/postgres sources, extended so VC knows which tool and table serve which need.
(e) AI-written progress summaries from the student's rows plus KG, with a configurable model and a deterministic fact-check so every number and status in the summary matches the rows. Optional Gemini google_search grounding for general facts only, never for student data. Explain the difference between data grounding and web grounding plainly.
(f) A configurable fast model per role.
(g) Five or six student user types, with the navigation per type (grill user-type mode).
(h) Acceptance criteria, each with a test, and the phases: P1 = deep links + steps + reads + summaries; P2 = act-on-behalf; P3 = full KG.
In plan.md, name the existing files to edit in place and the order of work units, with the 6c checks. List open questions for Umesh.
Write only those three files.
