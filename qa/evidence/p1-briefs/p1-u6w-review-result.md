# Senior review result: U6w rank wiring (7d2840e..fe47e01), 2026-10-19

VERDICT: Warning. Correct and tenant-safe on every point of the brief. The api suite passes 212/212, api tsc is clean, and the NOT PROVEN label survives redactPii (probe D:/vc/.worktrees/p1-u6w-review-probe/probe.ts).

- Medium (D-097 item 3), chat.ts:521 `withRanking`: ranked number claims skip the claims.ts guard and keep `status: "attributed"` (rank.ts:258). The schema defines that status as "source present" (student-api.ts:19), so a client that shows a sourced badge from `status` would present invented fixture numbers as sourced. Fix: in the same map, set `status: "unverified"` on number claims, and accept that chat.ts:707 then counts `unverified_claim` on ranked turns. Add a test.
- Low: chat.ts:494-536, `OptionDataPort.get(optionId)` takes no tenant argument. A real adapter must not hold per-tenant data without a tenant wrapper.
- Low: index.ts:324, `createChatApi` is called without `ranking`, and no owner is named for wiring it.
- Test gaps: no test of the invalid_weights refusal, no test of a ranked turn that also carries the stress/helpline suffix, no test of a replayed ranked clientTurnId, and no test pinning the 8000-character cap.

## Disposition (maker, 2026-10-19)
The medium is a D-097 truthfulness defect. It is fixed in U6w fix cycle 1, together with any blind checker findings, after both checkers return (one repair, not two). The lows and the test gaps go into that same repair where they are cheap; the rest become ledger rows.
