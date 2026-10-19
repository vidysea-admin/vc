#!/usr/bin/env bash
# W5 falsification (floor, .8-4): green before, red after (trim re-added), restored. Isolated copy only.
set -u
COPY=D:/vc/.worktrees/p1-u10w-A-c2-fals
OUT=D:/vc/.worktrees/p1-u10w/qa/evidence/p1-u10w-A-c2/fals
cd "$COPY/apps/api" || exit 9
git -C "$COPY" status --short > "$OUT/copy-status-before.txt"
run() { pnpm exec tsx --test --test-reporter=tap --test-name-pattern "W5|W6" tests/voice-wiring.test.ts tests/voice.test.ts; }
date -Iseconds > "$OUT/green.start"; run > "$OUT/green.txt" 2>&1; echo "EXIT=$?" >> "$OUT/green.txt"
# mutation: re-add the trim
sed -i 's|const raw = env\[VOICE_FLAG_ENV\];|const raw = env[VOICE_FLAG_ENV]?.trim();|' src/voice.ts
git -C "$COPY" diff -- apps/api/src/voice.ts > "$OUT/mutant.diff"
run > "$OUT/red.txt" 2>&1; echo "EXIT=$?" >> "$OUT/red.txt"
git -C "$COPY" checkout -- apps/api/src/voice.ts
git -C "$COPY" status --short > "$OUT/copy-status-after-restore.txt"
run > "$OUT/restored.txt" 2>&1; echo "EXIT=$?" >> "$OUT/restored.txt"
# probe: hostile variants, against fixed code then against the trim mutant
cp "$OUT/../probes/chkA2-w5.test.ts" tests/zz-chkA2-w5.test.ts
pnpm exec tsx --test --test-reporter=tap tests/zz-chkA2-w5.test.ts > "$OUT/probe-fixed.txt" 2>&1; echo "EXIT=$?" >> "$OUT/probe-fixed.txt"
sed -i 's|const raw = env\[VOICE_FLAG_ENV\];|const raw = env[VOICE_FLAG_ENV]?.trim();|' src/voice.ts
pnpm exec tsx --test --test-reporter=tap tests/zz-chkA2-w5.test.ts > "$OUT/probe-mutant.txt" 2>&1; echo "EXIT=$?" >> "$OUT/probe-mutant.txt"
git -C "$COPY" checkout -- apps/api/src/voice.ts; rm -f tests/zz-chkA2-w5.test.ts
git -C "$COPY" status --short > "$OUT/copy-status-final.txt"
date -Iseconds > "$OUT/fals.done"
