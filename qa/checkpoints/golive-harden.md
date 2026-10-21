# Checkpoint - golive-harden (checker, cycle 0) - evidence identity
Checked state: wave/golive-harden b589c11 (code 08b249b). Environment: Windows 11, node via pnpm, tsx; no nginx binary.
- `pnpm -C apps/api exec tsx --test tests/main.test.ts` (via vc-testlock.sh) -> 10 pass / 0 fail; inputs apps/api/src/main.ts, apps/api/tests/main.test.ts at 08b249b; checker-run, 2026-10-21T16:17.
- `pnpm -C apps/api typecheck` -> exit 0; same inputs.
- `node qa/evidence/golive-harden/nginxcheck.mjs` -> exit 0 (3 live locations); input infra/ubuntu/nginx-vc.conf at 08b249b.
- Falsifications in a copy outside the tree: C2 raw message in main() -> 1 red of 10; C1 prefix location / no limit_req -> nginxcheck exit 1.
Result: PASS. Original checker attribution: chk-golive-harden (claude-sonnet-subagent), verdict qa/verdicts/golive-harden.md.
