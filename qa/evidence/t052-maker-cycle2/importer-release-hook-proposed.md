# D054 importer first release hook — bounded maker proposal

Status: PROPOSED QA prose only. No test/source edit, runtime, acceptance review or PASS. Current six-file runtime owns the lane; implementation must wait for terminal outcome and mutex release, plus root's plan clarification/authorization.

## Exact existing target and frozen evidence

Only packages/engine/tests/b18-suppression-outcome.test.ts existing `T-045 abort during empty-context release authority read cannot release a summary` callback, currently612–648; its selector at628 requires `/summarizeSession.*nodes\.ts:1242:/`.

Frozen test SHA25616A45C691F2BCFDF179683B91F2825D448A699DF1B3677D3469AF31CDAA14AD0. Current nodes SHA256ED46B42A36463EFF0DE435EA952D8996EFC8CE8668E1AB5644D53488A5942E2E. D055 imports moved `summarizeSession` to1221, first `await deps.authorizeRelease?.();` to1244, final release to1271. No source semantics changed in those sites; the stale1242 selector cannot match the intended first-release frame. Existing Promise.race(ready,observed) prevents assuming timeout is required: completed start makes the reached assertion fail. Preserve any actual reached failure from the active run; this static diagnosis is not a runtime result.

## Why a generic semantic frame is insufficient

The actual source caller is `summarizeSession`, which calls the same `deps.authorizeRelease` closure twice. graph.ts125–160 returns an anonymous async authorization closure; graph.ts132 delegates to `owner.authorize`, whose grant read is graph.ts737–739 and is registered before awaiting. Provider generation and verification receive the same authorization closure through preflight at nodes.ts1230 and1251. Function-name text such as `authorizeSnapshot`, `owner.authorize`, or `summarizeSession` alone therefore cannot uniquely select the first post-generation release read.

The expected async stack ancestry for that read includes the named `summarizeSession` caller at its first release await. Exact V8 emitted frame spelling has not been re-observed during this read-only task; do not claim a captured runtime stack. Keep the current function-frame form with an exact independently derived first source site. Do not broaden to any consent read, any `summarizeSession` frame, or whichever read happens after two provider calls.

`generated===true` is set only after the actual task=generate provider response returns. That excludes generation's own preflight. `!entered` permits only one hold. Exact first-release-site ancestry excludes owner-only checkpoint/outcome authorization and the second release. The first release must precede the verifier conditional and verifier provider dispatch; in this existing empty-context positive, context length0 means the verifier is not dispatched at all. Keep exactly2 executed calls (extraction plus generation) and no subsequent execution after cancellation. These independent phase/count checks do not replace the exact first-site selector.

## Minimal in-place proposal

Within this existing callback, using its file's already imported `readFileSync` and existing `here`/`join`:

1. Read actual `../src/scribe/nodes.ts` as UTF-8. Locate the unique `export async function summarizeSession(` start and its exact following section boundary before `(e) profile diff`. Assert the start/boundary exist and no second same function declaration occurs. This is source-site instrumentation only, not product execution or a new helper/module.
2. In that bounded function slice independently assert exactly two literal `await deps.authorizeRelease?.();` sites. Locate generation marker `const output = generated.output;`, the first release, the actual `if (output.summary.length > 0 && input.approvedContext.length > 0)` verifier branch, actual `verification = await deps.provider.generate`, `task: "verify-approved-history"`, second release and final summary-return statement. Require their strict source order. Require the first release sits immediately before that verifier conditional, separated only by whitespace. If first release is removed, deriving the new first occurrence must not silently choose the second: count/order/immediate-neighbor checks fail.
3. Derive the actual whole-source line of this verified first site by counting preceding newline separators; current result must be1244 on the frozen source. Use a local `RegExp` matching `summarizeSession.*nodes\\.ts:<derived-line>:`. Keep the current `generated && !entered` conjunction and actual consent-driver intercept unchanged otherwise. No hardcoded old1242 or guessed consent ordinal.
4. Keep all actual authorized start/private-owner/merged-cancellation forwarding, observed Promise.race, entered+generated requirement, exact provider count2, typed AbortError, post-release no additional provider calls, zero facts and finally restoration/release. Keep all original caller/runner budgets, including200ms/120000ms where selected elsewhere, unchanged. No skips, clock advancement, generic rejection or weakened acceptance.

This fallback is exact site selection with an independent current-function-site check. It is intentionally narrower than a generic semantic selector because the current source has no distinct first-release function name. No product seam is added.

## Independent failure checks and handoff

After the active run is terminal and root has granted the lane, required focused verification is this existing reached callback on the newly frozen identity, then the already required affected importer scope under the existing feature plan. No test process is launched by this proposal.

In an isolated copy, removal of the first release must make the source count/order/neighborhood guard fail rather than hold the final release; removal of authorizeRelease altogether must fail before start. Shifting imports alone must derive the new real line and still reach the actual first-release authority read. Removing cancellation delivery must make the existing typed-abort/no-late-execution outcome fail. Do not count a source-only guard as provider/cancellation runtime acceptance.

Scope stays D054's existing callback only. No new helper/file/test module/product source, approval guard weakening, fabricated authority, deadline extension or acceptance substitution. This new file is the explicitly requested QA proposal, not a runtime helper.
