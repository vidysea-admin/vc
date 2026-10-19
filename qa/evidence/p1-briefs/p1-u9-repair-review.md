# Read-only senior review: U9 repair cycle 1
Review `git -C C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9 diff a4864f8..ebbb41f -- packages/` (packages/providers/src/live.ts and its tests). Read only: never edit, commit or run network calls.
Focus: crisis-mute state machine (crisisMute flag, turnComplete clear, next non-crisis speech clear), ordering of flushAssistant(true) vs mute, pre-attach queue replay (ordering, unbounded growth, double replay), sendText scan after spoken crisis, LiveConfigError audio validation (even length, empty), any path where a crisis message could be silenced or the model's reply heard during crisis.
Return Approve / Warning / Block with file:line evidence, at most 25 lines.
