# Manifest: t-023-reject-reason-counter

**Contract:** qa/contracts/counselling-engine.md (B1 no-script labels; B17 persona-walk findings) — no frozen
contracts yet (research phase), so `contracts/verify_contracts.py` PASSes by vacuity (pasted below).
**Goal task:** T-023 (TASKS.md line 34): "T-020 follow-ups: ISS-t-020-c0-1 (medium: the 500-char cap
truncates silently; show a counter/notice in the reject-reason box), plus the verdict note: any future
'past decisions' screen renders the stored reason as text, never HTML".
**Fix cycle:** 0 of max 3
**Attempt note:** this is attempt 3 of the build. The implementation was committed at `a996f17` in
attempt 1/2; those runs died on the account session limit, not on any code or test failure. This
manifest resumes from that commit — no implementation code was rewritten — and supplies the
verification evidence (fresh typecheck/test re-run, capability-coverage falsification, browser
evidence, contracts check) that was still missing.
**Scope:** `apps/web/src/components/ApprovalScreen.tsx` (extended: `reasonCounter()` + the live
counter markup in `PendingForm`'s reject-reason branch), `apps/web/src/components/labels.ts`
(extended: `rejectReasonRemaining`, `rejectReasonLimitReached`), `apps/web/tests/ui.test.tsx`
(extended: `reasonCounter` unit tests + the two `dangerouslySetInnerHTML`/hostile-payload tests),
`apps/web/demo/browser-evidence.ts` (extended: counter + hostile-payload steps in the existing T-008
evidence flow — no new script, per anti-drift "ADD, don't entangle" would have applied to a NEW flow,
but this is the same flow the reject-reason step already lived in), this manifest and
`qa/evidence/t-023-reject-reason-counter/` + `qa/evidence/browser-t-023-reject-reason-counter-2026-09-26/`
(new evidence directories).
**Not touched:** `qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md` (left `open`
for the checker/close-out step), `.claude/**`, any server/contract file (`apps/web/src/server/**`) —
per the brief, wiring a stored reject reason through to a "past decisions" view is a server/contract
change outside this unit's apps/web-only scope; the client-safe `ApprovalView`/`SubmitResult`
contract (`CounsellorDecisionSchema`) carries no `rejectedFacts` field to render today. The ONE place
a stored reason renders today is the reason `<input>`'s own controlled `value` while composing it —
proven never to become markup (source-scan test + live browser hostile-payload test, both below).
**Dual check:** no (no `.goal/` criticality marking on T-023; not requested in the brief)
**Executor:** claude-sonnet-subagent (maker build subagent)
**Executor rationale:** small, single-package, apps/web-only follow-up unit; no specialised
delegation lane needed.
**Offline:** every test below is offline (B8/B13). No `MONGODB_URL`, no real network calls, no real
`.env` values read. The browser evidence run uses the pre-existing demo/fake-db harness
(`VC_WEB_MODE=demo`) exactly as T-008/T-018/T-020 did.

## What changed

### 1. `reasonCounter()` — pure arithmetic (`ApprovalScreen.tsx:96-100`)

```ts
export function reasonCounter(text: string, max: number): { used: number; remaining: number; atLimit: boolean } {
  const used = text.length;
  const remaining = Math.max(0, max - used);
  return { used, remaining, atLimit: used >= max };
}
```

`remaining` is clamped to never go negative (defends against a pasted/programmatic value longer than
the input's `maxLength`); `atLimit` is `used >= max`, not `used === max`, for the same reason.
Exported and unit-tested directly (no jsdom/testing-library in this repo — the on-screen rendering
and live updates are proven against a real browser instead, `demo/browser-evidence.ts`).

### 2. The live counter UI (`ApprovalScreen.tsx:429-460`, inside `PendingForm`'s reject branch)

When a fact's decision is `"reject"`, the reason `<input>` now has `aria-describedby` pointing at a
sibling `<span aria-live="polite">` that shows `${used}/${MAX_REJECT_REASON_LENGTH}` via
`LABELS.rejectReasonRemaining`, and — only when `atLimit` — an additional
`LABELS.rejectReasonLimitReached` ("Limit reached") notice. The counter re-renders on every
keystroke because it reads `choice.reason` from component state, the same state the controlled
`<input>` writes to.

### 3. Two new labels (`labels.ts:74-75`)

`rejectReasonRemaining: "Characters left"`, `rejectReasonLimitReached: "Limit reached"` — short,
plain-language, translatable (matches the jaipur-counsellor / gaurav-bhaiya personas from the T-020
persona walk that raised ISS-t-020-c0-1).

### 4. T-020 verdict note (XSS proof, no code change needed)

The verdict note asked us to confirm a stored reject reason renders as text, never HTML. Both
`ApprovalScreen.tsx` and `labels.ts` already contained no `dangerouslySetInnerHTML` anywhere; this
unit adds a source-scan test that guards that invariant going forward (comment-stripped, so the
guard cannot false-positive on this file's own doc comments naming `dangerouslySetInnerHTML`), plus
a render test proving a `<script>`/`<img onerror>` payload comes back HTML-entity-escaped through
every existing free-text render path (a review reason, a dropped-fact reason), and a live-browser
test proving the same payload typed into the actual reject-reason `<input>` is stored verbatim as
the input's *value* attribute, creates no `<script>` element, and never executes.

## How to verify

All test/typecheck commands go through the machine-wide lock:

```
bash "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/6c22744a-b397-4515-a226-3516f0a93a31/scratchpad/vc-testlock.sh" \
  pnpm -C D:/vc/.worktrees/t-023-reject-reason-counter --filter @vc/web typecheck

bash "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/6c22744a-b397-4515-a226-3516f0a93a31/scratchpad/vc-testlock.sh" \
  pnpm -C D:/vc/.worktrees/t-023-reject-reason-counter --filter @vc/web test

python D:/vc/.worktrees/t-023-reject-reason-counter/contracts/verify_contracts.py

VC_EVIDENCE_UNIT=t-023-reject-reason-counter VC_EVIDENCE_PORT=3148 \
  npx tsx demo/browser-evidence.ts   # run from apps/web in the worktree
```

## Capability-coverage table

| Claim | Test id | Falsifying edit | Expected RED |
|---|---|---|---|
| `remaining` never goes negative when text exceeds `max` (clamp) | `reasonCounter: a value longer than max ... clamps remaining at 0` (`ui.test.tsx:228`) | remove the `Math.max(0, ...)` clamp in `reasonCounter` (return `max - used` raw) | `remaining: -10` instead of `remaining: 0` — evidence: `falsify-F1-clamp.txt` |
| `atLimit` is true exactly at the cap (`used >= max`, not `used === max` alone breaks at cap-1, but the real regression tested is the boundary itself) | `reasonCounter: exactly at the cap is atLimit with 0 remaining` (`ui.test.tsx:220`) | change `atLimit: used >= max` to `atLimit: used > max` | `atLimit: false` instead of `true` at `used === max === 500` — evidence: `falsify-F2-atlimit.txt` |
| Neither `ApprovalScreen.tsx` nor `labels.ts` ever calls `dangerouslySetInnerHTML`, and a hostile payload renders as escaped text everywhere it can appear | `T-023 (T-020 verdict note): ... never use dangerouslySetInnerHTML ...` + `... renders inert, as escaped text ...` (`ui.test.tsx:255`, `:262`) | temporarily insert a real `dangerouslySetInnerHTML={{ __html: someReason }}` call into `ApprovalScreen.tsx` | both tests fail: the source-scan sees the literal string; the render test sees the payload NOT escaped — evidence: `falsify-F3-dangerouslySetInnerHTML.txt` |

Each falsifying edit was made in a **throwaway git worktree outside the bound root**
(`C:/Users/Lenovo/AppData/Local/Temp/claude/vc-t023-falsify`, `git worktree add ... HEAD --detach`,
`pnpm install --offline`), run through the lock, and removed afterwards
(`git -C D:/vc/.worktrees/t-023-reject-reason-counter worktree remove --force
C:/Users/Lenovo/AppData/Local/Temp/claude/vc-t023-falsify` — confirmed absent from the current
`git worktree list`). GREEN-before and RED-after for the same test ids:

**GREEN before** (`qa/evidence/t-023-reject-reason-counter/falsify-green-baseline.txt`, unmodified
code, 38/38 pass including the three target tests):
```
✔ reasonCounter: exactly at the cap is atLimit with 0 remaining (0.2589ms)
✔ reasonCounter: a value longer than max (a paste/programmatic set that bypasses the input's maxLength) clamps remaining at 0 and is still atLimit, never negative (0.1733ms)
✔ T-023 (T-020 verdict note): ApprovalScreen.tsx and labels.ts never use dangerouslySetInnerHTML in actual code (comments may discuss it by name) (3.0412ms)
✔ T-023 (T-020 verdict note): a stored string containing <script> or <img onerror> markup renders inert, as escaped text, on every existing free-text render path (a review reason, a dropped-fact reason) (4.2912ms)
ℹ tests 38
ℹ pass 38
ℹ fail 0
```

**RED after — F1 (clamp removed)** (`falsify-F1-clamp.txt`):
```
✖ reasonCounter: a value longer than max (a paste/programmatic set that bypasses the input's maxLength) clamps remaining at 0 and is still atLimit, never negative (2.4696ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    { atLimit: true, + remaining: -10, - remaining: 0, used: 510 }
Exit status 1
```

**RED after — F2 (`>=` changed to `>`)** (`falsify-F2-atlimit.txt`):
```
✖ reasonCounter: exactly at the cap is atLimit with 0 remaining (2.551ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    { + atLimit: false, - atLimit: true, remaining: 0, used: 500 }
Exit status 1
```

**RED after — F3 (`dangerouslySetInnerHTML` inserted)** (`falsify-F3-dangerouslySetInnerHTML.txt`):
```
✖ T-023 (T-020 verdict note): ApprovalScreen.tsx and labels.ts never use dangerouslySetInnerHTML in actual code (comments may discuss it by name) (71.6791ms)
  AssertionError [ERR_ASSERTION]: ApprovalScreen.tsx must not use dangerouslySetInnerHTML
  true !== false
✖ T-023 (T-020 verdict note): a stored string containing <script> or <img onerror> markup renders inert, as escaped text, on every existing free-text render path (a review reason, a dropped-fact reason) (5.8846ms)
  AssertionError [ERR_ASSERTION]: the script payload must render, escaped, as text
Exit status 1
```

**GREEN restored** (`falsify-restored-green.txt`, back on the real worktree code, confirming the
falsifying edits were fully reverted and never leaked into the bound root):
```
✔ reasonCounter: exactly at the cap is atLimit with 0 remaining (0.2611ms)
✔ reasonCounter: a value longer than max ... clamps remaining at 0 and is still atLimit, never negative (0.3751ms)
✔ T-023 (T-020 verdict note): ApprovalScreen.tsx and labels.ts never use dangerouslySetInnerHTML in actual code (comments may discuss it by name) (3.6173ms)
✔ T-023 (T-020 verdict note): a stored string containing <script> or <img onerror> markup renders inert, as escaped text, on every existing free-text render path (a review reason, a dropped-fact reason) (5.8405ms)
ℹ tests 38
ℹ pass 38
ℹ fail 0
```

## Real outputs

**Typecheck** (re-run fresh in this session, through the lock, exit 0 / no diagnostics):
```
[testlock] running (free RAM 3.13 GB): pnpm -C D:/vc/.worktrees/t-023-reject-reason-counter --filter @vc/web typecheck

> @vc/web@0.1.0 typecheck D:\vc\.worktrees\t-023-reject-reason-counter\apps\web
> tsc --noEmit
```
(no output after the command header = zero diagnostics; `tsc --noEmit` prints nothing on success.)

**Tests** (re-run fresh in this session, through the lock, on the real worktree code — 38/38 pass):
```
> @vc/web@0.1.0 test D:\vc\.worktrees\t-023-reject-reason-counter\apps\web
> tsx --test tests/*.test.ts tests/*.test.tsx

✔ GET: a paused thread returns the proposal fact by fact, the dropped facts with reasons and the draft summary (199.5519ms)
✔ B3: reading the pending approval (repeatedly) writes nothing and claims nothing (132.0691ms)
✔ POST: approve / reject / edit per fact + withhold the summary writes exactly the approved and edited facts (150.2741ms)
✔ POST twice: the second submit is already_resolved (409) and writes nothing new; GET then shows the resolved state (231.1087ms)
✔ B5: invalid decision bodies are refused (400) and write nothing, claim nothing (284.6411ms)
✔ T-018 ISS-t-008-c0-1: an edit value that does not match the proposed value's type is refused (400) through the full API, and writes nothing (194.6533ms)
✔ T-020 ISS-t-018-c0-1: a per-fact reject with a typed reason writes an audit record the demo read-back exposes (decisions collection) (196.8625ms)
✔ T-020 ISS-t-018-c0-1: a reject reason over MAX_REJECT_REASON_LENGTH is refused (400), writes nothing and records no audit (178.5415ms)
✔ fenced: a student with an erasure in progress -> GET and POST both 423 fenced, no student data, nothing written (102.24ms)
✔ in_progress: a claimed thread shows in_progress; a new submit is already_resolved with the claimed decision (138.5949ms)
✔ not found and malformed thread ids (112.474ms)
✔ route handlers: GET and POST through the Next route module, JSON in and out (119.6784ms)
✔ runtime mode: demo unless VC_WEB_MODE is exactly 'live' (a typo never reaches the production server) (0.1728ms)
✔ NewSessionForm: renders the title, the student id and every transcript turn, with a Submit button (11.3369ms)
✔ NewSessionForm: the apologetic AI-unavailable copy is plain language, not a script, and never mentions a model/vendor name (1.8973ms)
✔ NewSessionForm: the initial idle render offers no Retry button and no ai_unavailable banner (only Submit) (1.3588ms)
✔ T-021 fix cycle 1 (ISS-t-021-c0-1, B17): the transcript table has its OWN column label for the spoken text, never the approval screen's colValue ("Proposed value") (1.8182ms)
✔ T-021: the first submit hits the exhausted failover chain and returns 503 ai_unavailable, with no key/transcript leak (276.338ms)
✔ T-021: Retry — resubmitting the SAME body after an ai_unavailable reply succeeds and reaches the normal awaiting_approval flow (278.7887ms)
✔ T-021: an invalid body (missing turns) is refused 400 before anything runs (104.5657ms)
✔ pending: every proposed fact renders with key, value, quote, turn, confidence and its controls (17.1361ms)
✔ pending: a needsReview fact is flagged with its reasons; an unflagged fact is not (4.0162ms)
✔ pending: dropped facts render with their reasons, and the draft summary renders (4.2589ms)
✔ pending: a model-withheld summary (B1) shows the reason and offers no approve (3.1018ms)
✔ states: fenced, in_progress, not_found and done each render a distinct labelled state with no fact data (2.6209ms)
✔ B1: every UI label is a short label, never a script-like sentence (1.4097ms)
✔ B1: the only text on the screen is labels or data from the proposal (nothing the UI composes itself) (5.8093ms)
✔ pending: no fact is decided yet, so no reject-reason field is rendered (it only appears once a fact is marked reject) (3.3035ms)
✔ buildRejectDecision: a typed reason is trimmed and sent (0.384ms)
✔ buildRejectDecision: an empty or whitespace-only reason is OMITTED, never sent as reason: "" (0.2289ms)
✔ buildRejectDecision: a reason at exactly MAX_REJECT_REASON_LENGTH is sent as-is (the server, RejectReasonSchema, is the length authority) (0.1281ms)
✔ reasonCounter: empty text uses 0, remaining equals max, not at limit (0.1492ms)
✔ reasonCounter: partial text counts used/remaining correctly (0.0802ms)
✔ reasonCounter: one character below the cap shows remaining 1 and is not yet at limit (0.095ms)
✔ reasonCounter: exactly at the cap is atLimit with 0 remaining (0.11ms)
✔ reasonCounter: a value longer than max (a paste/programmatic set that bypasses the input's maxLength) clamps remaining at 0 and is still atLimit, never negative (0.0653ms)
✔ T-023 (T-020 verdict note): ApprovalScreen.tsx and labels.ts never use dangerouslySetInnerHTML in actual code (comments may discuss it by name) (0.7051ms)
✔ T-023 (T-020 verdict note): a stored string containing <script> or <img onerror> markup renders inert, as escaped text, on every existing free-text render path (a review reason, a dropped-fact reason) (3.0112ms)
ℹ tests 38
ℹ suites 0
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7528.3513
```

**Contracts:**
```
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

**Browser evidence** (`qa/evidence/browser-t-023-reject-reason-counter-2026-09-26/report.json`,
Chromium 153.0.8010.12 via Playwright, headless, `next dev`, demo mode, fake db, no `MONGODB_URL`):
totals — all interactions passed, zero unexpected console errors. Key steps from the report/script
covering the counter and the XSS proof (`demo/browser-evidence.ts:254-307`):
- "reject-reason counter after typing a short reason" — shows `<n>/<MAX_REJECT_REASON_LENGTH>`, no
  limit-reached notice — **pass**.
- "reject-reason counter is wired for accessibility" — `aria-describedby` on the input matches the
  counter span's `id`; the counter has `aria-live="polite"` — **pass**.
- "reject-reason counter at the character cap" — shows `500/500` and the "Limit reached" notice,
  `data-at-limit="true"` — **pass** (screenshot `02b-reason-limit-reached.png`).
- "reject-reason counter one character back under the cap" — the limit-reached notice disappears
  again — **pass**.
- "typing `<script>`/`<img onerror>` into the reject-reason box" — stored verbatim as the input's
  `value`; `scriptElementsInArticle=0`; `executed=false` (`window.__pwned` never set) — **pass**.
- "restore the reject-reason field before submit" — the original typed reason is back before the
  rest of the flow (submit, read-back, reload, second-submit-from-stale-tab, fenced/in-progress/
  not-found/mobile-width) — all still pass, unchanged from the pre-existing T-008/T-018/T-020
  evidence flow this run extends.

Full `report.json` totals: `interactions` all passed (`failed: 0`), `unexpectedConsoleErrors: 0`.

## Open gaps

- The T-020 verdict note's broader ask — "any future 'past decisions' screen renders the stored
  reason as text, never HTML" — is proven as an invariant on every render path that exists TODAY
  (the reject-reason input's own value, a review reason, a dropped-fact reason). No "past decisions"
  view exists yet in this codebase (the client-safe `ApprovalView`/`SubmitResult` contract has no
  `rejectedFacts` field), so there is nothing further to test for that specific future screen; the
  source-scan guard test will keep failing loudly if a future implementation of that screen ever adds
  `dangerouslySetInnerHTML`.
- No dedicated persona-walk re-run was done for T-023 (the original ISS-t-020-c0-1 was found in a
  T-020 persona walk); the fix is instead verified directly via unit tests + live browser evidence
  against the same interaction the persona walk exercised.

## Status: ready-for-check
