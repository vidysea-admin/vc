# Checkpoint: p1-u11-coverage-report (cycle 0, checked 2026-10-19, head 9509c35, code 13ad807)
Verdict PASS. Evidence identity (command + scope, code blob = commit 13ad807 under packages/engine/evals, fixture coverage-probes.sample.json, pnpm-lock unchanged vs base 82db70f, node v24.13.1, win32, mock only):
- tsx --test evals/coverage.test.ts -> 22/22 (checker run, 2026-10-19T00:24 +05:30)
- coverage CLI x2 -> byte-identical json (9db34a70...) and md (9350dc79...)
- hostile PII fixture -> report byte-identical to clean, 0 PII markers
- `--real` -> exit 1, refused
- pnpm -r typecheck -> exit 0
- falsification C1..C6 in copies -> each 1 named red, control 22/22
Original checker: p1-u11-check (this verdict file).
