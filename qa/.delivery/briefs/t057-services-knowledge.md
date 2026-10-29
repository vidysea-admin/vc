# t057-services-knowledge

Umesh asks: does the VC chatbot know the platform's own SERVICES and how a student uses them (Vidysea: Loan Assistance, Visa Assistance, Test Prep, Counselling, Scholarship Assistance, Board Recommender, Overseas Consultant, PathLynks Assessments, Packages, Country Guides, university/program search, journey/roadmap features; and Pathlynks equivalents)? Was a knowledge graph built from the GitHub repos of those products?
Investigate read-only in D:/vc/.worktrees/vc-completion (ARCHITECTURE.md, docs/, config/sources.json, packages/engine, any kg package, mcp/*, apps/api/src/chat.ts and the prompts), the sibling KnowledgeBase repo used by the KB /search client (find its path; env key NAMES only), and the local Mongo virtual_counsellor collection names + counts only (never print student document content).
Report:
1. What knowledge sources the answer path actually uses today (KB /search index contents by source, Mongo KG collections, platform DB reads, static prompts), with file:line.
2. Whether any of them contain a service catalogue (names, what each does, product route/URL, how to start it). Show evidence (grep hits, counts).
3. Whether the system prompt and the no-script rule let the bot recommend and deep-link the platform's own services, and how (tools? cards?).
4. The gap, and the smallest plan to add a services catalogue (source: the product frontends' routes/pages in D:/vc/.worktrees/vc-vidysea-frontend and the Pathlynks frontend, read-only) into the EXISTING KB/KG ingestion path, naming the existing file to extend (edit in place, no new module unless unavoidable).
Write your report to qa/evidence/t057/services-knowledge-audit.md and return it.
