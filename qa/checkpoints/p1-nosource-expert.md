# Checkpoint: p1-nosource-expert (checker, cycle 0)

Evidence identity (HEAD 8353602, code 0cdbb07, base 03f475a; node via npx tsx; deps = worktree pnpm install; policy .17; TMP/TEMP on D:; vc-testlock slot):
- engine `npx tsx --test tests/<f>.test.ts`: student-graph 75/0, lk5 65/0, crisis-defaults 19/0, lang 36/0 (inputs: packages/engine/src/student/graph.ts and lang.ts, tests at 0cdbb07)
- api `npx tsx --test tests/<f>.test.ts`: anonymous-zero-persistence 33/0, acceptance-student-journey 3/0, student-openapi 10/0, chat-privacy 39/0, chat 32/1 (baseline red), anonymous-route 21/2 (baseline), chat-profile 44/1 (baseline)
- `npx tsc --noEmit` engine exit 0, api exit 0
- Baseline reds on a 03f475a git archive: chat 31/1, anonymous-route 21/2, chat-profile 44/1, same test names
- Outcome proof: qa/evidence/p1-nosource-expert-check/outcome.test.ts.txt run from an engine copy: 9 pass / 0 fail
- Falsification C1-C4 in a copy outside the worktree (green 20/20; red 15/5, 14/6, 17/3, 15/5; restored 20/20; copy equals bound graph.ts)
Attribution: claude-sonnet-subagent checker p1-nosource-expert-check, verdict qa/verdicts/p1-nosource-expert.md
Result: PASS
