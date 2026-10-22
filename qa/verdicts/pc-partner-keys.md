# Verdict: pc-partner-keys, coordinator A (dual check, blind), cycle 1

Cycle checked: 1
Policy-Version: proportional-verification/2026-10-19.17
Bound to: D:/vc/.worktrees/pc-partner-keys, branch wave/pc-partner-keys, HEAD 0345551 (code commit 4ac5b36), repair base 56069f6. Cycle-0 verdict kept at qa/verdicts/pc-partner-keys.r0-1.md.
Contract: D:/vc/qa/contracts/partner-chatbot.md [K1]-[K5], [I1]-[I4]; gate defaults 1-4.

## CHECK PLAN (built from `git diff 56069f6 4ac5b36` before running anything)
The diff touches exactly three files: apps/api/src/partners.ts (rotate write, PartnerPatch type, registry load, RESERVED_PARTNER_IDS, header comment), apps/api/tests/partners.test.ts (+117 lines), packages/db/tests/fakes.ts (+14/-1). anonymous.ts, chat.ts, index.ts, openapi.ts and nginx-vc.conf have no diff, so K3, K4, K5 and I1-I4 inputs are unchanged and cycle-0 PASS evidence is reused for them (re-run below as regression anyway). K2 is touched only through the registry load; I re-proved its cache bound. Instruments: (1) re-run the builder's tests; (2) checker-authored hostile tests in a copy outside the tree (scratchpad copyA, node_modules junctioned); (3) one K1 falsification in the copy (green before, red after, restored byte-identical); (4) protected-test review of fakes.ts; (5) regression of the named files; (6) a tsc type probe. SERIAL: every run waits on the shared vc-testlock (it was held by another agent for about 30 min; long waits are normal).

VERDICT: PASS
SCOREBOARD: 5/5 criteria met (K1 now met; K2, K3, K4, K5 unchanged and still met), 4/4 invariants hold (I1, I2, I3, I4)
TIER: L (auth, tenant derivation); dual-trigger line still present (partners.ts authenticate, manifest `dual-trigger: auth apps/api/src/partners.ts:472`).

FAILURES: none.

## Evidence (commands, counts; logs in qa/evidence/pc-partner-keys-c1-check-A/, *.log.txt because *.log is gitignored)
- Builder suite, my own run, HEAD 0345551: `tests/partners.test.ts` 48 pass / 0 fail (was 42 at cycle 0; +6 c1 tests). partners.log.txt.
- Hostile suite (checker-authored, not builder tests; hostile-A1.test.ts.txt), copy of HEAD, 9 tests: 9 pass / 0 fail. hostile-A1.log.txt.
  - H1 overlapping rotates of DIFFERENT scopes, 60 pseudo-random read and write delays (0-11 ms each) and both launch orders: in all 60 iterations both printed keys work and both old keys are dead.
  - H2 three same-scope rotates plus one other-scope rotate, all overlapping: old keys dead, exactly one printed key per scope works (the last writer), the other printed keys are dead.
  - H3 rotate overlapping revoke, 12 interleavings (revoke first or rotate first, both scopes, gaps 0/3/12 ms): the stored status is always `revoked`, and after the 60 s window no key works (old, new, either scope). A revoked partner never ends with a working key. Reason: revoke writes only `status`, rotate writes only `keys.<scope>`, so the two writes are disjoint.
  - H4 a store write that rejects after the read: nothing printed, the old pub and srv keys still work, `rotatedAt` stays null; `update` resolving false gives partner_not_found, old keys intact. H4b two concurrent rotates where the srv write fails: the pub rotate is whole (new pub works, old pub dead) and srv keeps its old key.
  - H5 reserved ids: every name in RESERVED_PARTNER_IDS is refused through `addPartner` and the CLI (`add X --id <name>`), nothing written; "Sandbox", "SANDBOX", " sandbox", "sandbox ", "sandbox\n", "\nsandbox", NUL, zero-width space, Cyrillic "ѕandbox", tab variants are refused by the id pattern; names whose slug is a reserved id ("Sandbox", " SANDBOX ", "System", "Root!!", "Default") are refused; a caller-supplied `reservedIds` entry is refused. Observation (below): "sandbox-1" is accepted.
  - H6 registry load: 20 concurrent callers during a SYNCHRONOUS store.list() throw all get PartnerRegistryUnavailableError from ONE read; an async rejection also recovers; after recovery the next call authenticates; a sync throw on a reload after the 60 s window (stale snapshot present) fails closed (503 path), not stale-served, then recovers.
  - H7 K2 cache bound under the new load code: a rotated-away key still works at +59 999 ms and is refused at +60 000 ms; a revoked partner's old and new keys are both refused at +60 000; 100 random-id lookups inside the window cost 0 extra reads; 100 concurrent callers after expiry cost exactly 1 read. K2 behaviour is unchanged by the registry-load rewrite.
  - H8 fake Db dotted `$set`: a dotted key sets one nested field and keeps siblings and top-level fields; `status` plus `keys.srv.hash` in one `$set` both apply; a deep path creates nested objects; plain keys still assign top-level.
- K1 falsification (one, in the copy, mutation file qa/evidence/.../fals-K1.diff.txt): rotate reverted to the cycle-0 behaviour (write the whole `keys` object). Green before in the pristine copy: `--test-name-pattern="K1 \(c1\)"` 4 pass / 0 fail (fals-K1-green.log.txt). Red after: same pattern 2 pass / 2 FAIL (the concurrent different-scope rotate test and the dotted-path-only test), hostile suite 6 pass / 3 FAIL (H1, H2, H4b) (fals-K1-red.log.txt, fals-K1-red-hostile.log.txt). Restored: copy `partners.ts` is byte-identical to the worktree file (cmp). The builder's same-scope test survives this mutant (it is order-independent by design); the different-scope test and the patch-shape test kill it.
- Type probe (copy, tsc --noEmit exit 0, tsc-probe.ts.txt): `{ "keys.pub": rec }` and `{ status }` are legal PartnerPatch; `{ keys: {...} }` and `{ partnerId }` are compile errors (both `@ts-expect-error` lines were consumed). So a future caller cannot reintroduce the whole-`keys` write without a type error.
- Regression, HEAD, my own runs: chat-privacy 39/0; anonymous-route "H2|H6|G5" 9/0; chat-profile "H2|LK7 C1-fix" 6/0; packages/db all 12 test files (`tsx --test tests/*.test.ts` listed explicitly) 289 pass / 0 fail; `tsc --noEmit` in apps/api exit 0, no output. All equal or better than cycle 0 (39, 9, 6, tsc 0).
- Protected-test rule, packages/db/tests/fakes.ts: the hunk replaces `Object.assign(doc, toStored($set))` with a per-key loop; a key with no dot assigns the same top-level value as before. No existing test in the repo uses a dotted `$set` key (grep of packages, apps, mcp), so no existing assertion changes meaning, and all 289 db tests pass. The change is additive and weakens no test. The upsert path (fakes.ts:417) shares applyUpdate and is unaffected for undotted keys.
- Extra repair items: registry inflight fix verified (H6, plus builder test 1). RESERVED_PARTNER_IDS in addPartner verified (H5). Lookalike-Origin test (builder, partners.test.ts K4 c1) passes in the 48; it checks the REAL anonymous handler wrapped by withPartnerRoutes with `vidysea.com.evil.io`, `evil-vidysea.com`, trailing dot, subdomain: 401, no CORS header at all, route never reached. That closes cycle-0 P2 for the actual-request path (I did not re-run my cycle-0 startsWith mutant against it; not needed for this PASS).
- K3, K4, K5, I1-I4: no input of theirs changed (stat above); cycle-0 evidence stands and the regression runs above are green. Header comment fix (voice no longer CORS-eligible) is comment-only.

## Not verified / flagged, none blocks PASS
- Real Mongo dotted `$set`: unexercised (fake Db only). The store passes `{ $set: patch }` straight to `updateOne`, and `$set` with `"keys.pub"` is the standard per-field form, so the risk is low, but no run touched a real server. Flag, not a FAIL (per brief).
- Reserved ids are a name list, not a tenant lookup. `scripts/partner.ts` and runPartnerCli pass no `reservedIds`, and `sandboxTenantId` has no default in main/index wiring (the caller supplies it, tests use "sandbox"), so a deployment whose sandbox or real JWT tenant id is anything outside the six names (for example "sandbox-1", "pathlynks-prod") is NOT blocked from being registered as a partner id. The builder states this limit in the manifest and the code comment.
- Under concurrent rotates the row/summary a CLI prints is built from that call's own stale read, so the OTHER scope's prefix shown may be one rotation old. The stored data and the printed key are correct; cosmetic.
- Full suite not run (brief); 6c trigger recorded in cycle 0 (`full-suite trigger: tier L security/auth (.13-2a)`) stands. chat.test.ts A20 stale test (cycle-0 P4) is untouched by this unit.

## Process notes
- First falsification attempt hung on a Windows `python3` stub (a heredoc into python3); stopped, re-run with a node script file. No effect on results; the copy was verified pristine before the mutation.
- Hostile and falsification runs were in scratchpad copyA; the bound tree received only this verdict, the renamed cycle-0 verdict and the evidence directory.

PROPOSED-ISSUE: {"id":"P1","sev":"low","type":"design-gap","criterion":"K3","title":"Reserved partner ids are a fixed name list; CLI/env pass no reservedIds and sandboxTenantId/JWT tenant ids are not consulted, so a partner id equal to a real tenant id outside the list can still be registered (the srv key then writes that tenant's records)","where":"apps/api/src/partners.ts:50,282; apps/api/scripts/partner.ts","repro":"qa/evidence/pc-partner-keys-c1-check-A/hostile-A1.test.ts.txt H5 (sandbox-1 accepted)"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","type":"unverified-env","criterion":"K1","title":"Dotted $set rotate is proven only against the fake Db; add one integration check against a real Mongo when a test instance is approved","where":"apps/api/src/partners.ts:154,316"}

ISSUES-WRITTEN: none (dual coordinator: findings are PROPOSED-ISSUE lines only)
CAPABILITY-COVERAGE: K1 repaired criterion reproduced and falsified in an isolated copy (green before, red after, restored); K2-K5 and I1-I4 unchanged inputs, regression green

Metrics: start=2026-10-22T08:37:00+05:30 end=2026-10-22T09:21:00+05:30 checker_min=44 wall_min=44 blocked_min=30 suite_runs=0 repeat_runs=0 mutations=1 cycle=1 policy=proportional-verification/2026-10-19.17 tokens=unavailable
