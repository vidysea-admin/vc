# Gate: U10 `ws` dependency (Q-U10-1)

Question: approve adding the `ws` package (server-side WebSocket) to apps/api, pinned to one exact version, plus `@types/ws` in devDependencies?

Answered: YES (Umesh, AskUserQuestion 2026-10-18 ~23:50 +05:30, "Approve ws (Recommended)"). Recorded as D-097 item 1. Exact version pin, no range. Install with `pnpm --filter @vc/api add -E ws` and `pnpm --filter @vc/api add -D -E @types/ws` (network fetch from the npm registry is allowed for these two packages only).

Also: Q-U10 silence timeout is not in D-088; use 60 s, configurable, marked [ASSUMPTION] in the manifest.
