# Brief: You are /checker running a Mode A feature check. Read your full protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
Check with NO other context:
  Manifest: D:/vc/.worktrees/golive-a20/qa/manifests/golive-a20.md
  Project: D:/vc/.worktrees/golive-a20 (bound). Verdict path: D:/vc/.worktrees/golive-a20/qa/verdicts/golive-a20.md. Checkpoint: D:/vc/.worktrees/golive-a20/qa/checkpoints/golive-a20.md
  Tier: L (protected test change). Policy: proportional-verification/2026-10-19.17. Budget: wall 15 min. Base: fac81b6. Cycle: 0.
Judge whether the weakened real-repo A20 assertion is justified:
- Real qa/gates state: is B13 truly the only unmet record? Read qa/gates/g-publish.md, g-prod.md, nights.md and p1-u0-amendment-signatures.md, and run evaluateGoLive against them.
- Does the new test still guarantee that the live repo refuses go-live while B13 is PENDING?
- Is the skip condition safe? A regex that never matches would silently skip the test. Prove the regex matches the current line, and that a SIGNED line flips it.
- Do the fixture tests still cover the evaluator's multi-failure behaviour?
Run ✔ A20: the real repo qa/gates refuses every target while B13 is not signed (10.9444ms)
✔ A20: today's U0 gate files (B13-signed: PENDING, gates open, interim Nights mode) are refused, with Nights the only satisfied record (32.1147ms)
✔ A20: with every record (g-prod option c, A10 pass) every target is allowed (45.9471ms)
✔ A20: B13, g-publish and Nights are each required by every target; g-prod by the three student targets, not by publish (92.0506ms)
✔ A20: g-prod option scopes what may go live (a: auth text, b: + anonymous, c: + voice, d: hold) (77.1575ms)
✔ A20: g-publish option c (hold) refuses; a (publish) and b (text only) allow; '(a)' and en/em dash separators parse (86.6548ms)
✔ A20: the LAST Answered line counts (an append-only later hold withdraws an earlier go) (10.2855ms)
✔ A20: voice alone needs the passing A10 record and its evidence file; the text targets do not (71.2483ms)
✔ A20 hostile: placeholders, wrong signer, bad or future dates, wrong mode, duplicates and fenced or quoted text do not count (240.448ms)
✔ A20: both Nights modes are accepted, and a backtick-wrapped B13 line is read (31.0825ms)
✔ A20: the B13 signer must be a personal name (never a role) and, when an approver is configured, exactly that name (160.0749ms)
✔ A20: a gate path that is a directory, or a missing gates dir, refuses instead of throwing (9.7249ms)
✔ A20: an unknown target is refused, never treated as allowed (6.7559ms)
✔ A20 CLI: exits 1 naming each missing record against the real qa/gates; 0 on a complete directory; 2 on bad usage (1132.9494ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2203.4548 under  (lock waits up to 40 min are normal; another run holds it until about 17:05). One falsification, in a copy outside the worktree: make evaluateGoLive drop the B13 failure, and the real-repo test must go red. No full suite. Kill only your own PIDs; never PID 36944. No pushes.
Write the verdict (Cycle checked: 0, Metrics line) and commit it on wave/golive-a20 with a narrow pathspec. Return the verdict word plus at most 8 lines.
