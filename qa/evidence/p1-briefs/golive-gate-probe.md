# Brief: go-live gate probe (read-only)
You are a read-only probe agent bound to D:/vc. Do NOT edit any file. Never print API keys or .env values.
Purpose: tell the maker exactly which go-live records are missing for a TEXT-ONLY launch (authenticated student chat + anonymous route; voice stays OFF).
Steps:
1. Run (from D:/vc): `pnpm -C apps/api exec tsx scripts/go-live-gate.ts student-routes`, then `... anonymous`, then `... publish`. Record exit code + the missing-record lines of each.
2. Read docs/go-live-checklist.md and qa/gates/ files it names (g-prod.md, p1-u0-amendment-signatures.md, g-publish.md, nights.md, a10-voice-gate.md) plus the latest entries of docs/DECISIONS.md (D-100 onward, esp. D-108).
3. For each missing record, say whether Umesh ALREADY answered it in D-108 or another decision (then the record just needs writing to disk, with the exact line format the gate script expects, quoting scripts/go-live-gate.ts file:line) or whether it is a genuinely open human decision.
4. Also confirm voice gate does NOT block student-routes/anonymous.
Return <= 30 lines: per gate command exit code; table: record | file | expected line format | already-answered-where or OPEN.
