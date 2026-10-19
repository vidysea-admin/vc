set -e
S=/d/vc/.worktrees/p1-u6w-Bfals; E=/d/vc/.worktrees/p1-u6w/qa/evidence/p1-u6w-B
cd $S/apps/api
DIFF_OUT=$E/diff-candidate.json node node_modules/tsx/dist/cli.mjs --test tests/chat-diff-B.test.ts | grep -E "ℹ (pass|fail)"
git -C /d/vc show 7d2840e:apps/api/src/chat.ts > $S/apps/api/src/chat.ts
DIFF_OUT=$E/diff-base.json node node_modules/tsx/dist/cli.mjs --test tests/chat-diff-B.test.ts | grep -E "ℹ (pass|fail)"
cp /d/vc/.worktrees/p1-u6w/apps/api/src/chat.ts $S/apps/api/src/chat.ts
diff $E/diff-base.json $E/diff-candidate.json && echo IDENTICAL; wc -c $E/diff-base.json $E/diff-candidate.json
