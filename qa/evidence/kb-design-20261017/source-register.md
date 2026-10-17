# Source register: student-facing Virtual Counsellor knowledge base

Taken 2026-10-16T19:48+05:30. Task `plan` (owner kb-vectorless-design), for D-083. Read-only survey: no repo edits, no downloads, no document bodies read from Drive (titles, ids, dates, sizes only).

## Tier key

| Tier | Meaning | May answer a student alone? |
|---|---|---|
| T1 | Official primary source (university, government, visa authority page or PDF) | Yes, with the page's own fetch date |
| T2 | Vidysea-verified structured data (country lock, programs, courses with sourceUrl+fetchedAt) | Yes, for facts it carries |
| T3 | Third-party expert seminar or transcript, dated; speaker claims, not verified | Only after a curator distils it into a page and marks the claim "speaker-reported" |
| T4 | Internal informal audio or chat, unprocessed | No. Raw material for curators only |
| X | Excluded | Never enters the KB |

Licence and consent columns say what is **known**. "Unknown" means nobody has recorded it, so the source ships HELD until someone does (lifecycle rule `collect`).

## A. Reference implementation (how the KB should work)

| # | Source | Location | Type | Owner | Freshness | Notes |
|---|---|---|---|---|---|---|
| A1 | Operating brain router card | `D:/ai_os/umesh/operating-brain/wiki/ROUTER.md` | 80-line territory table + cluster map, budget 5,000 tokens | Umesh (AIOS) | last_verified 2026-10-04 | Measured 2026-09-14 on 60 golden questions: reading INDEX found the right page 42%; searching page text 95%. |
| A2 | `brain_search.py` | `D:/ai_os/umesh/operating-brain/tools/brain_search.py` (imports `eval/run_eval.py`) | Stdlib BM25 (k1 1.5, b 0.75), lowercase `[a-z0-9]+` tokens, stop-word list, returns ranked page paths | Umesh | current | Executed 2026-10-16: query "vectorless RAG tree index no embeddings" returned `krishnaik/vectorless-rag.md`, `langgraph/rag-basic.md`, `patterns/pageindex-multi-source-merge-pattern.md`. Wall time 53 s on this machine (cold start, rebuilds the index each call), so a server must cache the index. |
| A3 | Cluster catalogue | `D:/ai_os/references/aios/brain-clusters.md` | Read-on-demand catalogue, moved out of CLAUDE.md for token cost | Umesh | 2026-09-17 | Pattern: small router in context, long catalogue on demand. |
| A4 | `/brain` skill | `D:/ai_os/.claude/skills/brain/SKILL.md` | Procedure: router, search, recall lessons, read at most 3 pages, log the consult, mark the outcome (helped, irrelevant, wrong) | Umesh | current | The consult log and outcome marks are the learning loop. Copy the idea, not the AIOS paths. |
| A5 | Page format | `wiki/concepts/krishnaik/vectorless-rag.md` | Frontmatter `title, cluster, quality_tier, source, related, tags, last_verified`; body TL;DR, why, components, gotchas, sources | Umesh | n/a | `last_verified` is empty on this page, so the field exists but is not enforced. Make it required. |

## B. Already in this repo (D:\vc)

| # | Source | Location | Type | Owner | Freshness | Notes |
|---|---|---|---|---|---|---|
| B1 | `@vc/mcp-university-kb` | `D:/vc/mcp/university-kb/` (it is **not** under `packages/`; there is no `packages/university-kb` and no `packages/mcp-*`) | MCP stdio server. Tools: `search_courses`, `get_course`, optional `ask_knowledge_base`. | VC repo | files dated within the T-026 work | Substring search over the `courses` collection. Records without `sourceUrl`+`fetchedAt` are dropped and counted (contract B2). `kb-client.ts` wraps the sibling KB's `POST /ask` and turns outage, 401/403 and zero-citation answers into `unavailable`, never an uncited answer (B21). ARCHITECTURE §6 Q1 (seed the KB from where?) is still open. |
| B2 | `mcp/student-profile` | `D:/vc/mcp/student-profile/` | MCP server over student facts | VC repo | current | **Student PII lives here. The curated KB must never be built from it** (B13 gate). |
| B3 | `skills/*/SKILL.md` | `D:/vc/skills/` | 11 skills (cards, verifier, safety-escalation, and others) | VC repo | current | Portable-core layer (H5). The KB answer skill goes here. |
| B4 | `universities` / `courses` collections | `virtual_counsellor` DB (accessors deliberately absent in `packages/db`) | Structured course records | VC repo | unknown count | Not counted here (production Mongo, read-only survey rule). Count before design freeze. |
| B5 | D-083 and TASKS | `D:/vc/docs/DECISIONS.md` line 780 | Decision | Umesh | 2026-10-16 | Names the three sources to register: KnowledgeBase repo, Drive seminar/scholarship material, Pathlynks WhatsApp exports. |
| B6 | Engine integration | `D:/vc/packages/engine` | Grep found no import of `university-kb`; only `packages/db/src/collections.ts` names the collections | VC repo | n/a | The tool boundary exists but the engine does not call it yet. |

Naming trap: memory notes cite "T-013/T-050". In **D:\vc** those are scribe citation robustness (done) and feedback persistence (open). In **D:\KnowledgeBase** they are "Avatar/voice counsellor client" (open) and "pipeline as a LangGraph workflow" (open). Treat any T-number as repo-scoped.

## C. Sibling KnowledgeBase project (D:\KnowledgeBase, also D:\KnowledgeBase-lanes worktrees)

Its own ARCHITECTURE (2026-09-03) already says it is "the same router shape as Vidysea's `/brain`, moved into MongoDB with an API". Hypotheses: H1 vectorless LLM tree index (PageIndex) for sessions plus a vector index for chat; H2 CRAG-style internal-first `/ask` with web fallback and sources kept separate; H3 no fact without provenance (`evidence[]` to speaker, timestamp, session).

| # | Source | Location | Type | Owner | Freshness | Reliability / licence / consent |
|---|---|---|---|---|---|---|
| C1 | KB service | `D:/KnowledgeBase/{apps/api,packages/ask,packages/index,packages/ingest}` | `POST /ask` (bearer key, `ask` scope), `packages/ask/src/router.ts` CRAG verdict, tree index, claims, turns, session_pages, sources, gaps collections (26 schemas) | Umesh / KB repo | commits up to 2026-10-09 | Code, not content. This is the retrieval engine for transcripts. |
| C2 | TOC knowledge bank | `D:/KnowledgeBase/raw/TOC/TOC-Materials/KNOWLEDGE-BANK.md` (22.9 KB) and `_all_summaries.txt` (124 KB) | Synthesis of 23 TOC recordings, April to August 2026 | Vidysea (compiled 2026-08-31) | 2026-08-31 | T3. Written "for Vidysea's internal reference". Third-party speakers; **redistribution to students is not cleared**. |
| C3 | TOC transcripts | `.../TOC-Materials/Transcripts` (26 files), `Transcripts-v2` (5) | Diarised session transcripts | Vidysea from TOC recordings | 2026-08 | T3. Same licence gap. Speaker names are personal data of third parties; D-083 says never quote a counsellor without permission. |
| C4 | TOC audio and recordings | `.../Audio` (30), `.../Recordings/{April..September}` | Source audio | TOC | 2026-04 to 2026-09 | T3. Raw; media purge rules in KB D-008. |
| C5 | TOC learning resources | `.../Learning-Resources` (5: Anatomy_TOC_2026-27.pdf, Events-List.xlsx, Pre-College-Programs.xlsx, mental-models guide, a WhatsApp-sourced PDF); `Collaterals-August2026` (2 brochures); `Calendar-Programming-Details` (4) | PDFs and sheets pulled from TOC's shared Drive | TOC | 2026 | T3. TOC IP (44 Mental Models guide, Adult Learning framework). Licence unknown. |
| C6 | Webinar captures | `D:/KnowledgeBase/raw/webinars/` | 2026-09-24 Zoho "next European study destinations" (m4a, mp4, slides); 2026-09-27 Ashoka; `synthetic-*` test files | Vidysea captured | 2026-09 | T3. Consent state per KB H8 (provided-first, silent capture last). **`synthetic-*` and `ui-capability-*` are test fixtures: exclude.** |
| C7 | WhatsApp archiver | `D:/KnowledgeBase/sources/whatsapp_msg/` (Baileys, read-only, MongoDB) | Tool plus captured groups | KB repo | 2026-09 | Tool only. The actual Pathlynks group exports named in D-083 were **not located** on disk; confirm location with Umesh. Group chat contains member PII and student messages: T4, and only expert-sender messages after redaction. |
| C8 | KB Mongo data | KB's own MongoDB (port 27018) | Sessions, claims, turns | KB repo | live | Not queried here. Claim count and `verified` share are the first numbers to take before choosing what to distil. |

## D. Google Drive (Vidysea account `umeshsugara@vidysea.com`; search_files, metadata only)

Searches run: title and full-text for scholarship, seminar, Netherlands, Japan, Orange Knowledge, MEXT, Holland Scholarship, Erasmus Mundus; visa, blueprint, guide, admission, webinar, session; audio and video; folders named Visa, Scholar, Webinar, Counsel, Knowledge. **Result: no Netherlands-specific or Japan-specific scholarship guide exists as a document in the Drive.** The full-text hits for those terms were competitor matrices and JSON/CSV dumps (not opened). The scholarship material that does exist is below, mostly as unprocessed audio.

### D1. TOC Session Transcripts (folder `1fksJWoTFDIFitKSl0iy7GlgD8JXp8H3K`, created 2026-08-31, 23 Google Docs)

All T3, owner umeshsugara@vidysea.com, all created and modified 2026-08-31. Same licence gap as C2.

| Date in title | Title | Doc id |
|---|---|---|
| 21 Apr | 21st-April-Visa-Blueprint-Part2-Italy-France-NZ | 1o5lpRXPUipEU7z2dvjjEWmwzg7fySfUjnN7zTK5TkYE |
| 8 May | 8th-May-Funding-Dreams-Loans-Forex | 1vmhxGyS1xFuEbue1gKvHVm47L4MtR42tSqER01hcAsI |
| 20 May | 20th-May-Telling-Your-Brand-Story-Better | 1KLPKkZHdGzhDyNvL1luPGCbIFH9wruSdoErpnpbUNPI |
| 22 May | 22nd-May-UniAccess-Xavier-University | 1IJQQMgL_a0obrz6nPAqKAJ5Vws0gA-JlLYd4EvNzcPY |
| 23 May | 23rd-May-UniAccess-ATLAS-Skilltech | 1RZtoGWzRuf39EnFbmqllt2pmFv3Nr1rf3ldGbbI8KE8 |
| 28 May | 28th-May-In-Focus | 1pC66oXeW1S9Gyfai29JTor-WwBkxVqXy57-MzCDz84o |
| 29 May | 29th-May-Decoding-Ever-Expanding-Cast | 16xVSA83K2bRNLNluVm3NdmFxxcpROeWQNzAlsbL-9n4 |
| 3 Jun | 3rd-June-Dual-Enrollment-Pathway | 1IivMKyBXw_oMFEh1Y5n6MJ1gzR2884yFbucBAVeEQs8 |
| 19 Jun | 19th-June-Entrance-Exams-Pathways-India-Part1 | 1S2z-MENkfHRQjNQHfFyWJytGyJZ9LZwy8KzYufFfY_4 |
| 25 Jun | 25th-June-Infocus | 1P42Jf1qvXSjnrO-6-EPURrTOte37UN6795yW0KP57rM |
| 30 Jun | 30th-June-Exploring-Identity-Success-Counseling | 1yJqRbVRbrhsEBPdFeIxVyzVVGcJ_z4aywZX6--mgLv0 |
| 3 Jul | 3rd-July-Inside-the-UC-Session | 1cCQLrp8dcHoWN9Xa6yZ8ZqFJ_mHV6tntBExOya3ff7o |
| 8 Jul | 8th-July-Beyond-Black-Robes-Law-Careers | 18MoPl3eT9Msiw-frj4IwGb_om-JFUq3hjrYzRXwSyXo |
| 15 Jul | 15th-July-Creative-Futures | 1bTcCxD_vyiUMkDfummbA8lwhXc3l4iBuvJRfHIcnJWQ |
| 22 Jul | 22nd-July-UniAccess-CEPT-University | 19QbLVegxbkSvqSrxBbzz4soqKRR3HpIS_T1u49-_BoM |
| 28 Jul | 28th-July-Metrics-and-Mingling | 1X9NIhvVEtaJA8X5PV8miJWxwleYoHHj0ETDCB2F2vy0 |
| 30 Jul | 30th-July-In-Focus | 1xuxKjqitPW4QNpWhvzQx1FmVbBiVMei0fn28_9WUFHk |
| 3 Aug | 03rd-August-UK-Beyond-Offer-Letters | 1e-a3B7G1Q58XpVxwTl6u6x4MCI5Tgk20_p4iZR368R4 |
| 3 Aug | UK-Beyond-Offer-Letters (duplicate title) | 1p8QmRY0F_0Fu7n9UHzIhLXDyqglKGgp84Gguq2wDWPo |
| 10 Aug | 10th-August-What-Changed-What-Matters-Inside-the-New-UCAS-Application | 1vGIW0qGa-YJbv09knfGCQkYuH4HQwSKpDttyFl9bRAE |
| 12 Aug | 12th-August-UniAccess-Live-Meet-Ashoka-University | 1my9E0tEgZbDZBzaYvI4FBFh8bKS75sTesnFd3AHfUBM |
| 24 Aug | 24th-August-UniAccess-Live-Meet-Leeds-Art-University | 18DJTaeTX-upMbdGiLxD06u7BV3zgk29VYkpmmYPUxLg |
| 27 Aug | 27th-August-In-Focus | 1DQ4S1ZtEkAI3SE7ooxuxva5wToYOqg2U74BDSJV3fNM |

All 23 entries the folder listing returned are shown (no next-page token), matching the "23 transcribed sessions" in C2. Sibling index: sheet "TOC Session Knowledge — By Month" `1ZDhOBEpWZeWyymJnt8IAqvcSCBaUcxAqx4iYD0ZNj1c` (2026-08-31).

### D2. Scholarship material (the Netherlands/Japan gap)

| Title | Id | Type | Created | Tier | Notes |
|---|---|---|---|---|---|
| 1000 Cr Scholarship - Mission | 14P6rRXbr0P9TSGCwvXkiZ8ZAHLyhb1l1ZwYz1uNLiF8 | Google Doc, 77 KB | 2026-10-09 (modified 2026-10-16) | T4 until read | Vidysea's own scholarship initiative, likely a plan, not a guide. Content not opened. |
| karunn sir Scholarship 1.mp3 | 1a-tCbuRa_mczlQTIYpN2MUbnCQxvZAaI | audio, 50 MB | 2026-10-09 | T4 | Internal discussion with Karunn. Needs transcription (`/transcribe`) and curation. |
| karunn sir Scholarship 2.mp3 | 1lXNEeWXmevUBig0n5DRn7ecdPecXAzFT | audio, 4.5 MB | 2026-10-09 | T4 | As above. |
| scholarship 2.mp3 | 1LzqyuMWtVuTMau0xtb19Dve386Clea3U | audio, 97 MB | 2026-10-10 | T4 | As above. |
| scholarship.zip | 1HNYSeGuvnD3j_4Hkh6CiERjoSnttci3S | zip, 178 bytes | 2026-05-27 | X | Empty. |

### D3. Country, visa and admission guides

| Title | Id | Type | Modified | Tier |
|---|---|---|---|---|
| Visa_Rejection_Crisis | 1W-0w460rEU6FG6FeYm7nWbDONKwAdVD8zga3S597-OQ | Doc | 2026-04-16 | T4 until read |
| VisaXpert Globally | 150qe_OSCVdvBvBtCt9_-aIp1YB1XmGpxvwnlZgAWGS8 | Doc | 2026-01-14 | T4 (looks like a competitor/product note) |
| VisaPro Globally.pdf | 1YWPKz-DzOaRUKnUHysEBFMQvXUxqO5if | PDF | 2026-01-14 | T4 |
| Vidysea_Visa_Tool_1Week_Build_Plan.docx | 12EWIleA_NxsvHlKVTnTsjjS_NSRUox8N | docx | 2026-03-05 | X (build plan, not student knowledge) |
| visa_new | 1oDKzda5ygpMjBA0V8h6PHxH_ZE0rWR2UxILa9DgOizc | Sheet | 2026-06-30 | T2 candidate, structure unknown |
| Country Checklist; full_country_status; Country wise Data | 1lK425rB86jxt1xfrorOLtrdvkp_fdCFLhXuCkQ6vo3M; 148SBW37N3o6w6XMVN1eGzLFSzNBF9o8l8nEzaA7fUvs; 1XMsXFOjxhbCHTvi9qzdDfgRDP1EXdW82os4KO_RAYOY | Sheets | 2026-03 to 2026-04 | T4 (internal build trackers, not guides) |
| Australia Country Lock V10 Final (507 campus rows) | 16oAk5RDldY1SRnIzslZxUwriEPqjHswdI3DhVxYwdRw | Sheet | 2026-06-02 | T2 (locked institution data) |
| Global higher education data infrastructure: a country-by-country map | 1i3qecm-XbanxGA_NgVB0hTrhNnvvCkArqC7ldLcf9eE | Doc | 2026-03-06 | T3 (research report on data sources, not student guidance) |
| All World University Database Country Wise Production Plan / Updated / Execution Plan | 15kFMCuQsHBkS7fkCGq6mNRtDAYJlmgAfRbwNLxvlkTY; 1EKVvSN4QIANsYe-WEYxX08jI7RSED6xFsRH_Fm8NgLA; 1wkcnQ_dJUJQK6H02_6zZ2HmXT2MoF0024smQZ_ZYeEA | Docs | 2026-09-10 | X for answers (internal plans); useful as the **coverage anchor** for the country list |
| Before_You_Begin_Your_PathLynks_Guide.pdf | 1EuRXc5YK7AdYaaQUYHfnUr7GapNroiv0 | PDF, 5.5 MB, owner pushpendra@vidysea.com | 2026-08-09 | T2 (Vidysea's own product guide) |

### D4. Counsellor knowledge recordings (T4, audio only, internal)

Owner umeshsugara@vidysea.com, all in My Drive root unless noted. Counsellor "mamta mam" content is the closest thing to expert Q&A on boards and pathways; D-083 forbids quoting her without permission.

| Title | Id | Created |
|---|---|---|
| mamta mam IB rules.mp3 | 1Nio9GNo7CZLmZ3RPwVZYqC9oMnXr55HA | 2026-09-30 |
| mamta mam IB board rules 11 12.mp3 | 1kB0A-rwDFevJQXJCefrpU0vIKdqDHpoK | 2026-09-30 |
| mamta mam UG and career switches CR.mp3 | 1Ahu3hwBdSxVmC7_sZxUguJrj23dgQq5J | 2026-09-26 |
| mamta mam Resources.mp3 | 1yXSDGnWN2s3yYz50LqStB4Yy02An7Tdq | 2026-10-12 |
| mamta mam resources 15 oct.mp3 | 1SlXCYEB4IbDXC9xk08b6SXgIRSzNe2yB | 2026-10-15 |
| North Star Counselling.mp3 (folder `1hoUJQX5XGDy5xvCLCHb2slFGvo4RiFJS`) | 1nADXdLJuJc_yLN9_8cLDRnx8fxtkldOv | 2026-09-23 |

About 40 other mp3/aac files in the same root are product, ERP, demo and meeting recordings ("karunn sir dashboard", "Maker Checker demo", "shiv erp batch", "15 meet 1-3", "Papa-...") and are **excluded**: they hold company decisions and some private audio, not student-facing knowledge.

## E. Excluded outright (X)

| Source | Why |
|---|---|
| `D:/ikigai_counsellor/transcripts/` and any counselling-session transcript | Student PII. Repo rule: never into a KB, only anonymised fixtures for tests. |
| `mcp/student-profile` data, `virtual_counsellor` student collections, checkpoints, `export` output | Student PII, governed by erasure (B15). |
| Pathlynks quiz/report data (`D:/UmeshCombinedReport`, `pathlynks-*`) | Student results. |
| `Papa-2610122017.mp3`, "harshita Virtual ceo.aac", ERP/dashboard/demo audio, Gmail | Private or internal-decision content. |
| `synthetic-*` and `ui-capability-*` files in KB `raw/webinars` | Test fixtures. |
| Compass research report and `goal.md` in D:\vc root | Project inputs, not student knowledge. |

## F. Gaps to close before launch

1. Netherlands and Japan scholarship guides: none exist as text. Options: transcribe D2 audio; collect official pages (Studyinnl/Nuffic, JASSO/MEXT) as T1 under `/discovering-sources` (anchor to the source register, tier and licence each, run the coverage check); neither is done yet.
2. TOC and speaker licence: write to TOC for redistribution consent, or restrict TOC-derived pages to paraphrase with org-level attribution.
3. Pathlynks WhatsApp exports: locate and decide expert-only redaction.
4. Count courses/universities in `virtual_counsellor` and claims in KB Mongo.
5. Two D1 docs share the title "UK-Beyond-Offer-Letters" (3 Aug): dedupe before ingest.
