# Tool-first senior-software-engineer review (2026-10-29)

Fresh read-only review, saved by the main session.

**Verdict: Warning**

## Findings
1. **[medium] migrations.ts:681 (used at :840): ReDoS in COLUMN_STMT.**
   - `(?::\s*([^=]+?))?\s*=` is cubic. A 5000-space line takes 57 s, and the sync runs in the API process.
   - Fix: skip lines over ~400 chars; add a hostile-length test.
2. **[medium] classify OWN_PROGRESS_RULES + graph.ts:1164/1238.**
   - "what next", "how am I doing" and "my status" go to vidysea_* even on a tenant with no Vidysea port, which answers "can't see your Vidysea data".
   - Fix: route those six tools to answerFromKb when deps.vidysea is undefined; add a test.
3. **[low] student-classify.test.ts:209.** The absolute 100 ms timing assertion is flaky under parallel load.
4. **[low] navigate.ts:59.** SECTION_KEYS is still tagged [ASSUMPTION]. Add a test against the synced STUDENT_SECTIONS.

## Open
- The concurrent pl-mongo save_type edit broke two tests:
  - port.test VA12 method list
  - chat-pathlynks.test.ts:237 (Q1/Q7: the fixtures lack save_type)
  
  Both must be green before merge.
- vidysea_progress opens 6 connections per turn (not measured).
- The new tools are not exposed to voice.

## Clean
- All new SQL is owner-bound, SELECT-only, read-only, and selects no free text.
- TF-10 states are distinct.
- Links come from the closed lists only.
- The KG artifact size is within the cap.

## Re-runs
| Suite | Result |
|---|---|
| engine | 290/291 (flaky timing test; it passes alone) |
| university-kb | 111/111 |
| api admin-sync | 40/40 |
| providers | 42/42 |

tsc is clean for all 5 packages.
