# T-052 cycle2 delta-c2: P0 follow-up hunks (maker build subagent, 2026-10-25). PROPOSED, NOT APPROVED

Authority: D-082; plan-v2.md (LF sha d272a10e) + hunks-v2.md (LF sha 0cf8ef38), approved with C1-C6 in review-approve-2.md.
This delta answers the P0 outcomes that review-approve-2 C4 and §E route to a fresh plan reviewer: an "outcome that adds a PRODUCT root-cause hunk, or any change outside the listed hunks".
It does not edit plan-v2, hunks-v2 or any review file. Every new hunk id is marked **NEW (H-Dnn)**.
No source or test file was edited in the worktree; all probes below ran only in the throwaway copy `scratchpad/t052c2/p0cap` (`git archive 28bb3bc`, junction node_modules).
Anchors are `file:line` at **28bb3bc** (worktree D:/vc/.worktrees/t052-c2, clean).

## 0. Inputs

- **P0 evidence:** committed 3cae385, qa/evidence/t052-c2-p0/ (SHA256SUMS); manifest section "Cycle2 attempt 2 — P0".
  - Valid quiet P0: 128 tests, 99 pass, 29 fail, 0 cancelled, 38.2 s, C: 59 GB, 0 OOM markers.
  - Capture pass: 29/29 fail, same assertions.
- **Probe logs** (scratchpad/t052c2, sha256 prefixes; all in the copy, all under vc-testlock):

| Probe | What | Result | Logs |
|---|---|---|---|
| X1 | 128 controls with H-D01 alone (`durability: "sync"`) | 128 tests, 99 pass, 29 fail; 0 post-hold provider calls | m40fix.log 4163869a |
| X2 | N-b rows 64-66 ×3, measuring budget excess and child-deadline minus E | fails 3/3, 1/3, 2/3 per run; excess always exactly +1 ms | nb3-1/2/3 fce88f1e/6eb6764e/0fe1c9ea |
| X3 | rows 127/128 ×5 with a reasoned timer abort (minimal H-005 core) | 128 GREEN 5/5, 127 RED 5/5 | r128fix-1..5 7057ae62/54b6a1e0/16d356f7/113673e1/68dfe6fc |
| X4 | rows 127/128 ×5 on frozen worktree bytes | 128 RED 5/5, 127 RED 5/5 | r128base-1..5 3d59ff98/7dc76428/c076bd11/b8b9dc20/e5b72093 |

## 1. C4: A-c start, late provider calls

### 1.1 Facts

- **P0:** all 8 adapter start rows (TAP 34-41) fail at scribe-checkpointer.test.ts:308 (`deps.provider.calls.length` 4 !== providerAtHold 2).
- **Capture:** in every one of the 8 rows, exactly two post-hold calls were dispatched: `fact-extraction` n=2 (nodes.ts:1168 ← extract node) and `session-summary` n=3.
  - All 16 calls had `msPastExpiry` between -104 and -154 ms.
  - The original deadline signal was live (`aborted:false`), and the hold itself was at -102..-159 ms.
  - So both calls were dispatched while the original deadline was still running, **before** any expiry existed.

### 1.2 Why 3.9 alone does not close it (C4, W1)

- 3.9 changes only what happens when `op()` *declares* expiry (`left <= 0`). In these rows no expiry has happened yet when the calls are made, so neither the 3.9 op path nor the H-005 timer path is reached before the calls.
- The real root cause is LangGraph's default checkpoint durability:
  - `runnableConfig` (graph.ts:647-658) sets no `durability`. LangGraph 1.4.17 then defaults to `"async"` (pregel/index.js:892 `?? "async"`).
  - In async mode, `loop.js:392` only *tracks* `checkpointer.putWrites(...)`, and `loop.js:477-478` awaits `_awaitCheckpointerPromises()` **only when `durability === "sync"`**.
  - So the held adapter read inside `adapter.put` (graph.ts:409) / `adapter.putWrites` (graph.ts:460) does not block the next superstep. The extract and summary nodes run and call the provider while the read is still held.
- **Correction to plan-v2 §3.3 / C4 wording:** the read wrapper is not in checkpointer.ts. checkpointer.ts (58 lines) is only the `MongoDBSaver` factory. The wrapper is the `adapter.put` / `adapter.putWrites` override in `compileScribeGraph` (graph.ts:409-508). So the C4 delta lands in graph.ts, which is in the 28-file inventory. checkpointer.ts stays unedited.

### 1.3 NEW (H-D01): graph.ts:656, same line, no line shift

```ts
    signal: deadline.signal, durability: "sync" as const,
```

- This replaces exactly `    signal: deadline.signal,` at graph.ts:656, inside `runnableConfig`.
- All four compiled invokes use `runnableConfig`: graph.ts:1334, 2385, 2547 (`{ ...opts, checkpointId: undefined }`) and 2550.
- It is not a budget, deadline or signal exemption. It makes every superstep wait for its own checkpoint reads and writes, which are already bounded by `owner.deadline.op()`.
- No other file changes for this item.

### 1.4 Falsifier and expected outcome

- **RED-before:** rows 34-41 RED at :308 on frozen bytes (P0 and capture, 8/8 each).
- **X1 (H-D01 alone):**
  - Rows 34-41 pass :308; there are 0 DIAG-PROV calls with n ≥ 2 (only n=0/n=1 from the pre-hold start).
  - They now fail later, the same way the resume rows already do:
    - resolve rows at :309 (+2 copy offset): `AggregateError "Scribe original settlement and owned compensation failed."`, wrapping `"Scribe owned compensation failed."`;
    - reject rows at the leaf count (:326 copy): `exact identity-distinct unexpected physical leaf count 2 !== 1`.
  - That is the 3.1 own-FWD-without-receipt class. **Expected GREEN only after P1c G1-G6; not proven.**
- **NEW mutant M40:** delete `durability: "sync" as const,` → rows 34-41 RED at :308 again (4 !== 2). This is the P0 state itself, so it is reproducible on demand.
- **Side effects:** X1 kept the other 99 controls at PASS. P3 must still re-run the full modules, because sync durability changes timing for every graph path. Watch especially erasure-fence, rules-e2e and persistence (W3).

## 2. Rule (c): N-b rows 64/65, the per-fact:1237 1 ms clock race

### 2.1 Facts

- **P0:** 64 and 65 fail at per-fact:1562 (postcheck reachability).
- **Capture:** the root is `PartialApplyError`, caused by an `AssertionError` raised in the fixture `FakeCollection.findOne` (per-fact:1237): "actual child read remaining budget belongs to the one original30ms invocation". It is called from facts.ts:655 `writeAll`.
- **X2:** every failure is an excess of exactly +1 ms (`Date.now() + timeoutMS - deadlineExpiresAt`).
- **Rows 64/65/66 are flaky on frozen bytes:** of the 3 rows, 0, 2 and 1 passed in X2 runs 1, 2 and 3. Row 66 passed in P0 by chance.

### 2.2 Root cause: two independent 1 ms drifts

- **(a) Product.** The absolute deadline E is converted to a relative one and back again:
  - nodes.ts:1525 and :1537 pass `deadlineMs: boundedDeadlineMs(expiresAt)` (= `E - Date.now()` at t_a, nodes.ts:1459-1462);
  - facts.ts:412 (applyApprovedDiff) and :1786 (recordApprovedSessionSummary) then run `new WriterDeadline(ms)`, whose `expiresAt = Date.now() + ms` (erasure.ts:595) at t_b;
  - so the child expiry is `E + (t_b - t_a)` and exceeds E whenever a millisecond tick falls between the two reads. X2 observed `childMinusE = 1` on some child deadlines.
  - This contradicts B23 / D-016 "one original invocation budget".
- **(b) Fixture.**
  - per-fact:1234-1237 rebuilds the child expiry as `Date.now() + args[1].timeoutMS`, a second wall-clock read at t2.
  - `timeoutMS` itself was computed in `op()` at t1 (erasure.ts:614).
  - So even an exact child deadline fails whenever t2 > t1. X2 shows failures with `childMinusE` all 0.

### 2.3 NEW (H-D02): erasure.ts, product, P1a; extends the C1 literal text

The constructor (erasure.ts:589-603, merged with H-005) gains an optional absolute cap. It uses one clock read.

```ts
  constructor(ms: number = FENCED_WRITER_DEADLINE_MS, expiresAtCap?: number) {
    // ...existing RangeError guard unchanged...
    const now = Date.now();
    this.expiresAt = expiresAtCap === undefined ? now + ms : Math.min(now + ms, expiresAtCap);
    // ...expiry/fire unchanged; the timer (H-005 body) is armed with Math.max(0, this.expiresAt - now) instead of ms
```

- **New public surface:** one optional constructor parameter. This is **outside plan-v2 §3.8 / §7 "exact new public surface"** and needs explicit approval.
- **AR-5 (NEW row):** in the existing erasure.test.ts deadline callback, assert:
  - `new WriterDeadline(30, cap).expiresAt <= cap` holds for any cap;
  - `ms` alone is unchanged.
- **RED-before:** the frozen bytes don't compile with the second argument. The row is therefore written as runtime `Reflect.construct` and must FAIL on frozen bytes (the cap is ignored).

### 2.4 NEW (H-D03): facts.ts:341 and :1708 options, plus :412 and :1786, P1b

- Add `deadlineExpiresAt?: number` to `ApplyApprovedDiffOptions` (facts.ts:341) and to `RecordApprovedSessionSummaryOptions` (facts.ts:1708).
- At facts.ts:412 and :1786, construct with `new WriterDeadline(options.deadlineMs, options.deadlineExpiresAt)`.
- Additive public option fields. **Also needs explicit approval.**

### 2.5 NEW (H-D04): nodes.ts:1525 and :1537, P1b

Add `deadlineExpiresAt: expiresAt,` next to each `deadlineMs: boundedDeadlineMs(expiresAt),`. Nothing else changes.

### 2.6 NEW (H-D05): per-fact:1233-1237, fixture. **PROTECTED oracle change: needs explicit reviewer approval, same class as persistence:652**

- **Change:** replace the wall-clock reconstruction with the production receipt itself.
  - Install a test-local `WriterDeadline.prototype.op` wrap in this callback. Mutating a prototype in a test file is the established pattern in scribe-checkpointer.test.ts:172-210.
  - The wrap records `WeakMap<returnedBudgetObject, { expiresAt: receiver.expiresAt, at: Date.now() }>` before it returns.
- **New assertions:**

```ts
          const receipt = opReceipts.get(args[1] as object);
          assert.ok(receipt, "SETUP/REACHABILITY: child read budget is an actual WriterDeadline.op receipt");
          assert.equal(args[1]!.timeoutMS, receipt.expiresAt - receipt.at, "budget is exactly the receipt's remaining time");
          assert.ok(receipt.expiresAt <= deadlineExpiresAt, "actual child read remaining budget belongs to the one original30ms invocation");
          secondReadExpiresAt = receipt.expiresAt;
```

- **Not a weakening.** The original intent, "the child budget ends no later than E", is kept with the same message. Two exact checks are added (the receipt identity, and the budget-derivation equality). What goes away is only the incidental requirement t2 == t1 (no millisecond passes between op() and the hook), which is not a product property.
- **Budgets and deadlines unchanged:** 30/200 ms, 5/8 s.

### 2.7 Falsifiers and expected outcome

- **RED-before:** 64/65 RED in P0 and capture. In X2, 64-66 failed 3/3, 1/3 and 2/3 per run.
- **After H-D02..D05:** 64/65/66 GREEN deterministically. P3 runs the three rows 10× and requires 10/10 (NEW stability gate).
- **NEW M41:** in facts.ts:412, drop the cap (`new WriterDeadline(options.deadlineMs)`) and add `+ 1` to the ms → 64/65/66 RED 10/10 at the new receipt assertion. This proves H-D05 sees product drift deterministically.
- **NEW M41b:** H-D05 reverted to the original two-clock form → flaky again. It is shown as a non-zero fail count over 10 runs, not as RED.

## 3. Rule (c): row 128, the DOMException AbortError from the erasure.ts:600 timer

### 3.1 Facts

- **P0:** row 128 fails at persistence:933 (`produced instanceof FencedWriterDeadlineError` false).
- **Capture:** `produced` is `DOMException` / `AbortError` / "This operation was aborted", with an own `pregelTaskId`; its only src frame is `Timeout.<anonymous> erasure.ts:600:23`.
- **X4:** 128 RED 5/5 on frozen bytes in isolation. It passed in R1 only under heavy load, so the plan's "guard GREEN" label was a load artefact.

### 3.2 Link to 3.8 / H-005

- erasure.ts:600 is `this.controller.abort()` without a reason.
- LangGraph's runner aborts the next tick (runner.js:128) and surfaces `signal.reason`, the DOMException, decorated with `pregelTaskId` (retry.js:52). That is exactly the 3.8 defect.
- **H-005 already covers it:** it replaces timer body 600-601 with `controller.abort(expired); fire(expired)`.
- **X3** (a minimal reason-carrying abort in the copy): 128 GREEN 5/5, and `produced` is a `FencedWriterDeadlineError`. 127 stays RED 5/5, as expected, until 3.1.
- **No new hunk.** Register changes:
  - 128 moves from "guard, GREEN on frozen" to "RED-before on frozen, GREEN after P1a";
  - M38 (abort without a reason) gains 128 as a target and must turn 128 RED;
  - the 3.7 pregelTaskId row covers the decoration.
- **C2:** P1a's freeze evidence adds 128 GREEN.

## 4. The six inventory files whose pin matches no commit

- None of these was found in any commit on any branch (pinsearch.js over `git log --all`), or in planner copies iso/iso2.
- The D072 pins were taken from mixed-line-ending working-tree bytes on 2026-10-14. The tree has since moved, and the bytes are unrecoverable.
- 28bb3bc is the approved base for this unit (brief t052-c2.md). No plan-v2 or delta hunk touches these files: H-D01 lands in graph.ts, not checkpointer.ts.
- **Proposal:** re-pin them to the 28bb3bc LF-normalised blob content (`git show 28bb3bc:<path> | sha256sum`):

| File | New pin (LF content at 28bb3bc) |
|---|---|
| apps/api/src/openapi.ts | E3D387F7CD802B6B9E130B8BBEA33159AF128A73B65DE9E1EB2E4CA67EF5A538 |
| apps/api/src/server.ts | BA4F1A022E4DB913B33956B76BB1558DC9B3230F3B5FE33A84E24DA1B98AB15E |
| apps/api/tests/server.test.ts | E8A92591EC4ABDEBF88401636E7542127668F8F58EA15095357B125EABE321D9 |
| packages/db/tests/consent.test.ts | 36B74D33242958E952A4E58648412A94FDEE346BAD12B0372B074900F3391E2E |
| packages/db/tests/db-init.test.ts | 800943DD8A0C088C81D77E6973A3764948B002EB116B5AF48DEA1E61190857A6 |
| packages/engine/src/scribe/checkpointer.ts | 30DD44C4AFBE06FCBF16A23602F485D634D934716FD639CB46B30014AAE961D2 |

- **Recommendation:** record all 28 future pins in this single LF-normalised form. The other 22 match their old pins in content (verified byte-equal in iso2 or after EOL normalisation), so only the form changes. Freezes then stop depending on autocrlf.

## 5. Updated P1 freeze list (the order of plan-v2 §6 is kept; C2/C5/C6 apply)

| Stage | File | Hunks |
|---|---|---|
| P1a (serial; C1 literal text in the manifest first) | packages/db/src/erasure.ts | H-001..H-010 + 3.9 (merged H-005/H-006 per C1) + **H-D02**. Freeze evidence: db typecheck, erasure.test.ts full, AR-1, AR-4, **AR-5**, M38 (now also 128), M39, and row 128 GREEN. |
| P1b | packages/db/src/facts.ts | H-025..H-041, F1-F6, seal + **H-D03** |
| P1b | packages/db/src/decisions.ts | H-016..H-024, R1-R5, R6 strict |
| P1b | packages/engine/src/scribe/nodes.ts | H-011..H-015, H-056, N + **H-D04** |
| P1c | packages/engine/src/scribe/graph.ts | H-042..H-055, G1-G6, H-111/112 + **H-D01** (same line 656; every G coordinate is still re-measured per C6) |
| P2 tests | persistence:652 repin (3.4, L re-measured after P1c, M34) | AR-1..AR-5, pregelTaskId, ISS-120/121 rows, L, S, D (H-113), summary (H-114/115), Part5a/b, + **H-D05** (protected; per-fact:1233-1237) |
| Unchanged | checkpointer.ts and the other 21 inventory files | re-pinned per §4 |

**C5 still applies:** H-058, H-099 and H-109 are test code, despite their erasure.ts labels.

## 6. Expected outcomes per row group

Rows are numbered as in the P0 TAP (128 controls).

| Rows | P0 (frozen, quiet) | Expected P3 (all of P1+P2) | Proof |
|---|---|---|---|
| decisions 1-7, facts 8-33 (F-a/F-b) | PASS | PASS | ENVIRONMENTAL per rule (a); oracle unchanged |
| adapter start 34-41 | RED :308 (late provider calls) | GREEN | H-D01 (X1 proves :308) + 3.1 (unproven); M40 |
| adapter resume 42-49 | RED :309/:314 (graph.ts:1674 owned-cleanup aggregate) | GREEN | 3.1 G1-G6; M31 |
| nodes 50-63, 66, 67 (N-a, N-c, N-d 58, N-e) | PASS | PASS | rule (a). 58's RED-before was not reproduced, so 58 is a regression guard, not RED→GREEN evidence |
| nodes 64/65 (N-b) | RED :1562 (1 ms race) | GREEN 10/10 | H-D02..D05; M41 |
| persistence 104-109 (P-a) | RED :662 | GREEN | 3.4 repin; M34 |
| persistence 116/119/127 (P-b) | RED (graph.ts:1674) | GREEN | 3.1; M31 |
| persistence 120 (P-c) | RED :789 | GREEN | 3.2; M32 |
| persistence 128 | RED :933 (DOMException reason) | GREEN | H-005 / 3.8 (X3); M38 |
| other persistence (68-103, 110-115, 117, 118, 121-126) | PASS | PASS | guards (115 is named in 3.1) |
| ISS controls (R2 set) + ISS-120/121 rows | 14/14 (R5) | GREEN; new rows RED under M120/M121 | 3.10 |

## 7. Boundaries and open items

- **No new file or module.** The new public surface beyond plan-v2 §3.8 is H-D02 (one optional constructor parameter) and H-D03 (two optional option fields). Both need explicit approval.
- **One more protected-oracle change:** H-D05. Everything else in §7 of plan-v2 stands.
- **Not proven:**
  - that 3.1 closes adapter start rows 34-41 after H-D01;
  - that sync durability causes no timing regression elsewhere. The P3 full modules decide that, and any regression is a PRODUCT re-review, never an oracle edit.
- **Q:** Q must hold again for P3. Two attempts today: attempt 1 failed, attempt 2 held.
