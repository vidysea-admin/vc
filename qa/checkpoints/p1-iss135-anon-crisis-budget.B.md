# Checkpoint - p1-iss135-anon-crisis-budget (cycle 0, checker B, completed checks)
Base 8efd936, code 6f025b6, head 6539cc8. Env: win32, node via tsx, mock provider and fake Mongo only, TMP/TEMP on D:.
- testlock: `pnpm -C apps/api test` -> tests 338 pass 338 fail 0. `pnpm -C apps/api typecheck` -> exit 0.
- probe (copy p1-iss135-chkB-fals, zz-chkB-probe.test.ts) baseline -> 8/8 pass.
- falsification (copy, restored by git checkout, tree clean): B1 char-count gate 2 red (P2,P3); B2 limiter-before-crisis 1 red (P6); B3 cap-1 2 red (P0,P4); B4 413-no-helpline 4 red.
- chat.ts untouched; OpenAPI 413 text 64 KiB. Result: PASS. Attribution: checker p1-iss135-check-B (this file).
