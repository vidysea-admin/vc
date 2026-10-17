# Read-only: ai_os hooks vs D:\vc hooks (D-093 item 15)
S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.

**Compare** D:/ai_os/.claude/hooks/* and the hook entries in D:/ai_os/.claude/settings.json with D:/vc/.claude/hooks/* and D:/vc/.claude/settings.json.

**Read only.** Never edit anything under .claude/**.

Also read D:/vc/HANDOFF.md, and D:/vc/qa/issues.jsonl for ISS-084, ISS-056, ISS-054 and ISS-095 (the pending hook fixes).

**Write S/hooks-diff-20261017.md.** For each hook give:
- where it exists: in both, only in ai_os, or in both but different (summarise the difference);
- what it enforces;
- whether it works for any project or depends on ai_os-specific paths;
- whether you recommend copying it (yes/no);
- the exact settings.json hook entries to merge.

**Return**, in under 20 lines, the recommended file list.
