# pc-reserved-ids-2 — coordinator B verdict (cycle 0)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
Checker: /checker coordinator B (blind; the other coordinator's verdict and checkpoint were not read).
CHECKED-STATE: worktree D:/vc/.worktrees/pc-reserved-ids-2, branch wave/pc-reserved-ids-2, head 360ff8c; code eaeab58 (HEAD differs from eaeab58 only by the manifest, verified with git diff --quiet on apps/ and packages/); base eb2c132 = merge-base.

CHECK-PLAN: scope claim traced and executed; S1-S5 each with hostile variants executed in a scratch copy; docs read against the code; regression set; one mutation per criterion plus a scope mutant.

SCOPE CLAIM (holds): a vck_srv_ key sets tenantId = partner.partnerId (chat.ts:855, voice.ts:1712). Every chat route (thread create/get, turn, profile, fact decision) and the voice session route then use dbForTenant(ctx.tenantId); the voice stream uses the minted claims; vck_pub_ anonymous text/voice gets NO_DB (voice.ts:1517) and reads no tenant. Executed: with the real chat handler, partner acme's srv key plus forged x-vc-tenant / x-tenant-id headers on a tenant-a student's thread: GET and POST turn return 404; its own thread lands under tenant acme only (tenants in chat_threads = [acme, tenant-a]); a different student id also 404. Mutant (tenant read from the x-vc-tenant header) turns that test red.

PER CRITERION (all executed):
- S1 PASS: startApi with pepper set and the list unset, "", blank, ",", ", ," or newline logs exactly one JSON line, event reserved_tenant_ids_empty, naming VC_RESERVED_TENANT_IDS and "unprotected", and the server starts. None when the list is set (also with VC_PARTNER_OWN_TENANTS set) or when partners are off. CLI add/list warn through deps.warn, and scripts/partner.ts passes console.error (source). Mutants: warn line removed in runPartnerCli -> S1 CLI test red; startApi note removed -> S1 startApi test and my matrix red.
- S2 PASS: pathlynks listed and bound adds and authenticates through the real chat route (201). Another listed tenant (acme-tenant) and a listed pathlynks-2 that is not bound get a 401 byte-identical (status, headers, body) to a bad-token 401. A registry built without the binding (a restart without it) blocks pathlynks again on srv, pub and the origin check. 17 malformed or forbidden VC_PARTNER_OWN_TENANTS values (sandbox, SANDBOX, admin, admin-2, root.x, vc-synthetic-demo, scribe-evaluation, a:b, pathlynks alone, extra colons, full-width, wildcard, NUL, ...) all throw naming the variable. Programmatic bindings with a different case, a full-width look-alike or another id exempt nothing; a padded binding trims. sandbox, vc-synthetic-demo and scribe-evaluation are never exempt even if listed and bound. startApi refuses to bind the sandbox tenant (builder's test plus code read index.ts:550-556). Mutants: binding ignored -> 3 red; binding matched case-folded -> 2 red.
- S3 PASS: pepper unset, whitespace or "" with malformed VC_RESERVED_TENANT_IDS and VC_PARTNER_OWN_TENANTS: launch succeeds, exactly one note, value not echoed. Pepper set: fatal naming VC_RESERVED_TENANT_IDS, and separately fatal naming VC_PARTNER_OWN_TENANTS (a:b, and sandbox:sandbox). scripts/partner.ts spawned with a malformed own list or reserved list exits 1 naming the variable before connecting. Mutant (parse regardless of pepper) -> 2 red.
- S4 PASS: programmatic entries "ACME", "  acme  ", tab/newline padded, full-width and padded full-width all reserve "acme"; blank entries reserve nothing; array and function forms and addPartner ctx covered by the builder's test. Mutant (no trim) -> 2 red.
- S5 PASS: rotate on sandbox-9 (both scopes) and on a configured id given as "  LATER-T " refuses with invalid_partner_id and "reserved", the message carries no key, the stored document is byte-identical. Unknown id is still partner_not_found; revoke works; an ordinary partner still rotates. Mutant (refusal off) -> 2 red.
- Docs PASS: go-live-checklist env rows, runbook-golive "Before deploy" section, partner-integration section 4 and .env.example state what to list, that empty = built-ins plus repo tenants only (and the startup/CLI warning, event reserved_tenant_ids_empty), the VC_PARTNER_OWN_TENANTS binding, the rotate refusal, the pepper gating (reserved_tenant_ids_ignored) and running `pnpm -C apps/api partner list` before deploy. Checked against index.ts, partners.ts and apps/api/package.json (the "partner" script exists). No inaccuracy found.

COMMANDS (all through VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test ..., apps/api of the worktree):
- tests/partners.test.ts -> exit 0, 63 tests, 63 pass, 0 fail
- tests/partner-voice.test.ts -> exit 0, 32/32; tests/partner-openapi.test.ts -> exit 0, 15/15; tests/auth.test.ts -> exit 0, 15/15
- tests/server.test.ts -> exit 0, 34/34; tests/index.test.ts -> exit 0, 8/8; tests/main.test.ts -> exit 0, 10/10
- tests/chat.test.ts -> exit 1, 35 tests, 34 pass, 1 fail = the known A20 baseline red only ("A20 flag on but gate closed ...")
- --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts -> exit 0, 9/9
- pnpm exec tsc --noEmit (apps/api, worktree) -> exit 0, no output
- scratch copy (git archive eaeab58, pnpm install --offline --store-dir D:\.pnpm-store\v10): tests/zz-checkerB-hostile.test.ts -> 5 tests, 5 pass. The first two runs had failures that were my own test mistakes (a strict-body 400, and a full-width id the env parser rightly rejects); the test was corrected, no product change.
- mutation run: baseline 13 pass 0 fail; 8 mutants (S1 x2, S2 x2, S3, S4, S5, scope), each red (1 to 3 failing); sources restored and byte-compared (cmp) to the originals.

OBSERVATIONS (not failures):
- The brief expects "pathlynks-2" to stay refused. With pathlynks listed and bound, pathlynks-2 is refused only if it is itself listed: the list match is exact and only the built-in names get a separator+suffix family. Unchanged from the base eb2c132, and not a leak: a partner reaches only the tenant named by its own id, so pathlynks-2 reaches tenant pathlynks-2, a different tenant (the tenant filter is an exact match). PATHLYNKS_x cannot be a partner id (PARTNER_ID_PATTERN is lower-case, no underscore). Operators must list every JWT tenant, and the docs say so.
- The registry alone cannot tell which listed entry is the sandbox tenant; the sandbox-binding refusal lives in startApi, and the CLI has no sandbox notion. Consistent: the server never serves a partner bound to the sandbox tenant.
- Not verified: the real student-JWT tenants, a real Mongo, the CLI binary against a database (stderr text checked via the warn dep and source), the full suite.

PROPOSED-ISSUE (low, non-blocking): `partner list` could mark partners whose id is reserved under the current VC_RESERVED_TENANT_IDS / VC_PARTNER_OWN_TENANTS, so the pre-deploy check in the runbook is not a manual comparison. Today the operator compares by eye (documented accurately).

ISSUES-WRITTEN: none (parent owns qa/issues.jsonl).
REMAINING: nothing blocking for this unit; the dual check needs the other coordinator.
Metrics: start=2026-10-22T14:53:20+05:30 end=2026-10-22T15:02:28+05:30 blocked_min=0 suite_runs=0 repeat_runs=14 mutations=8 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
