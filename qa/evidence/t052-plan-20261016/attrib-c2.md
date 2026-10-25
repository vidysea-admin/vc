# T-052 cycle 2: attribution of every still-RED row (addendum 5)

Maker: T-052 c2 maker subagent. Tree under test: wave/t052-c2 **ad60624** (P1a + P1c + nodes writeApproved + H-D03
line-neutral), in the throwaway copy `fz` (scratchpad). The frozen baseline is `fr` = `git archive 28bb3bc`.
Source and test files were not edited in the worktree or on main. All probes ran in copies under vc-testlock. Logs,
scripts and SHA256SUMS are in `qa/evidence/t052-c2-p0/attrib/`. Probe window: 2026-10-25T12:00:52+05:30 to
12:14:46+05:30 (read from `date -Iseconds`). Free RAM was 6.7-7.2 GB in every testlock header, and there are no OOM
markers.

Base 128-control run on ad60624 (`o1-base-128-1.log`, sha 99c20ff6): **108/128**. RED rows: 5 6 7 43 45 47 49 64 65
66 104-109 116 119 120 127. In the 12-test pin selection (`o1-base-pins-1.log`, 514d4ca6), rows 5-12 are RED.

## Classes

- (i) Expected under the approved plan. It turns green after a later approved packet, which is named in each row.
- (ii) Caused by plan-v2 3.9's op-vs-timer identity.
- (iii) Another plan conflict.
- (iv) Environmental.

## Table

"128 #" is the row number in the 128 controls. "pin #" is the row number in the 12-test pin selection (`pinpat.txt`).
Decisions rows 5-7 are the same three tests as 128 rows 5-7 (decisions.test.ts:702, D068 recordRejectReasons
direct-op receipt).

| Row | Mechanism (measured) | Source file:line | Plan hunk | Class | Option 1 (1b) effect |
|---|---|---|---|---|---|
| 128 #5 / dec 5: precheck observer S | `primary instanceof AggregateError` is false (decisions.test.ts:702/740-742). The op-thrown E **is** the originalExpiry rejection, so `[failure.err !== expiryError ? err : -, expiryError]` dedups to `[E]`. | erasure.ts:903-907 (op: `clearTimeout; throw this.#expire()`); decisions.ts:264 (dedup, kept verbatim by H-093) | plan-v2 3.9 (P1a); H-093 | **ii** | GREEN (`o1-opt1b-128-1.log` 12c708d8) |
| 128 #6 / dec 6: insert observer S | as #5 | as #5 | 3.9; H-093 | **ii** | GREEN |
| 128 #7 / dec 7: duplicate-winner observer S | as #5 | as #5 | 3.9; H-093 | **ii** | GREEN |
| 128 #43: resume checkpoint primary reject | Got the underLease envelope "Scribe original settlement and owned cleanup failed." (graph.ts:2155), not the admission collector's "Scribe admission original settlement failed." (graph.ts:3196). DIAGX (`diag1-1.log`): 4 roots. The receipted, accepted FWD is **forced** by the drained-settlement rule (graph.ts:1104-1107, 1126-1128); the adapter primary marker is un-receipted. No P1b collector is among the members. Restoring the literal H-117 adapter inserts, with the oracle string aligned in a copy, leaves #43/45/47/49 RED with the same message (`g5o-adp-1.log` b92ddaef: 12/16, the 4 resume-reject rows fail). So the accepted G5 deviation is **not** the cause. | graph.ts:2155 / 3196 / 1104-1128 | plan-v2 3.1 (A-c resume, G1-G6) claims GREEN. That is not met on the complete G layer. | **iii** | no change (RED) |
| 128 #45: resume checkpoint recheck reject | as #43 | as #43 | 3.1 | **iii** | RED |
| 128 #47: resume pending-write primary reject | as #43 | as #43 | 3.1 | **iii** | RED |
| 128 #49: resume pending-write recheck reject | as #43 | as #43 | 3.1 | **iii** | RED |
| 128 #64: local aggregate receipt rejects replacement | Reachability gate (per-fact:1037): "no actual source-emitted all-positive native primary [W,E]". Under 3.9 the op E equals the timer E, so a distinct W/E pair is never emitted. Isolated 5/5: base 0/5 pass (`rep-base-1..5`); opt1b 2/5 pass (`rep-opt1b-1..5`). The remainder is the N-b 1 ms race. | erasure.ts:903-907; nodes.ts writeApproved native primary (nodes.ts:1880 collector) | 3.9; H-D05 (P2) for the race | **ii** (residual race is i, H-D05/P2) | RED 3/5 (flaky) |
| 128 #65: reordered member identities | as #64. opt1b: GREEN 5/5 isolated and in the 128 run. | as #64 | 3.9 | **ii** | GREEN |
| 128 #66: foreign member replacement or append | as #65 | as #64 | 3.9 | **ii** | GREEN |
| 128 #104: preowner session, late successful read | "exact initial session read not reached" (persistence:645). The selector at persistence:648-652 is a stale stack-shape predicate, the proven HARNESS defect. | test persistence:652 (selector) | plan-v2 3.4: P2 repin of persistence:652 (M34), approved | **i** (P2) | RED |
| 128 #105: preowner session, late unexpected read | as #104 | as #104 | 3.4 (P2) | **i** | RED |
| 128 #106: preowner grant, late successful | as #104 (grant) | as #104 | 3.4 (P2) | **i** | RED |
| 128 #107: preowner grant, late unexpected | as #104 | as #104 | 3.4 (P2) | **i** | RED |
| 128 #108: preowner fence, late successful | as #104 (fence) | as #104 | 3.4 (P2) | **i** | RED |
| 128 #109: preowner fence, late unexpected | as #104 | as #104 | 3.4 (P2) | **i** | RED |
| 128 #119: reject-audit producer, clean own expiry | underLease envelope. DIAGX: 6 roots, including the **un-receipted** `AggregateError "recordRejectReasons: timed-out writer settlement failed"` (decisions.ts:337). That drained failure forces the receipted FWDs (graph.ts:1104-1107). | decisions.ts:337; graph.ts:1104-1107 | P1b decisions R6/R7 (H-095, H-101..104 typed closure of that collector). Not yet applied. | **i** (P1b decisions), **provisional**: unproven until P1b lands | RED |
| 128 #120: reject-audit producer, unexpected receipt | as #119, plus the un-receipted test receipt marker | decisions.ts:337; graph.ts:1104-1107 | P1b decisions (H-095, H-101..104); 3.2 G5 owner entries already applied | **i** provisional | RED |
| 128 #127: own helper FWD, clean original fact expiry | underLease envelope. DIAGX: 7 roots, including the un-receipted `"applyApprovedDiff: timed-out writer settlement failed"` (facts.ts:501/1000) and `"writeApproved: owned cleanup failed"` (nodes.ts:1880). | facts.ts:501/1000; nodes.ts:1880; graph.ts:1104-1128 | P1b facts F1 (H-082..; H-025..041). Not yet applied. | **i** provisional (P1b facts) | RED |
| pin #5: T046 private invocation metadata | `error instanceof ProviderAuthorizationRefusedError` is false (per-fact:758). This **fails on genuinely frozen bytes**: fr in isolation 3/3 RED (`fr-t046p-1..3`) and in the 12-selection (`fr-pins-1` eccd62c1), with the same assert. The pin at :761 is never reached. Deterministic, at 7.2 GB free. | per-fact:758 (pre-existing on 28bb3bc) | none: E1/E8 assume it turns green after repin | **iii** (pre-existing, not hunk-attributable) | RED |
| pin #6: T046 serialized configurable actor fields | `match(error.stack, /graph\.ts:255:/)`; the statement moved to graph.ts:344 (+89 from the P1c module block). Copy repin 255→344: GREEN (`repin-pins-1/2`). | graph.ts:344 (was 255) | E2 repin set (P2) | **i** (P2 repin) | RED (no effect) |
| pin #7: D055 ordinary early fence false | 8 s timeout. The gate `nodes\.ts:1592` (persistence:2522) never matches; the statement is now at nodes.ts:1691. Copy repin 1592→1691: GREEN, no timeout. | nodes.ts:1691 (was 1592) | E2 repin (P2) | **i** | RED |
| pin #8: D055 ordinary early fence true | as #7 | as #7 | E2 (P2) | **i** | RED |
| pin #9: D055 prompt early guard holds | "actual node-catch guard not issued" (stage other-fence-read). Gate pins nodes.ts:1592 and erasure.ts:676/711 (now 976/1011). Copy repin: GREEN. | nodes.ts:1691; erasure.ts:976/1011 (were 676/711) | E2 (P2) | **i** | RED |
| pin #10: D055 prompt early guard rejects | as #9 | as #9 | E2 (P2) | **i** | RED |
| pin #11: D055 prompt early rollback holds | as #9 | as #9 | E2 (P2) | **i** | RED |
| pin #12: D055 prompt early rollback rejects | On fr: RED 3/3 isolated (`fr-d055rr-1..3`) and in the selection, with the sentinel "D055 actual rollback cleanup rejection sentinel" (persistence:2597). After the copy repin on ad60624 it fails with the **identical** sentinel (`repin-pins-1/2`). | persistence:2589/2597 (pre-existing on 28bb3bc) | none: E8 requires GREEN after repin | **iii** (pre-existing) | RED |

### Counts

27 rows in total: the 19 128-control rows (decisions rows 5-7 are counted once, since they are 128 #5-7) plus the 8 pin rows.

| Class | Count | Rows |
|---|---|---|
| (i) | **15** | 104-109 (3.4 / P2); pins 6-11 (E2 repin, proven by copy repin); 119, 120, 127 (P1b; provisional) |
| (ii) | **6** | 5, 6, 7, 64, 65, 66 (64 also carries the H-D05 race) |
| (iii) | **6** | 43, 45, 47, 49 (3.1 claim not met); pins 5 and 12 (pre-existing on frozen bytes) |
| (iv) | **0** | none |

- **Not in the brief's list:** row 116 (nested summary settlement) is RED 5/5 isolated on base and opt1b (`rep-*`), and RED in all three 128 runs. Its message is the same underLease envelope, consistent with 119/127 (forced by drained settlement). It is not diagnosed with DIAGX here.
- **E1 frozen baseline (done):** fr file hashes are in the `fr.out` header (facts 03f20061, decisions 0a725c96, erasure 33b6b594, graph e6062e1c, nodes 046acd07; LF sha256, first 16 hex).
  - The 12-selection on fr: 10/12, with T046 private and D055 rollback-rejects RED.
  - The db-side pins (facts.test 1882/3068, decisions.test 578, per-fact 1289/1298/1376) sit inside tests that are GREEN in the ad60624 128 run and the pin run: D059 rows 1-4, and D068 writeApproved rows 50-61.
- **Repin probe (copy only):** pins graph 255→344, nodes 1592→1691, erasure 676→976 and 711→1011 give **10/12, identical to frozen** in 2/2 runs. This was done by substitution, not stack capture, so it does not satisfy E3. It is an attribution probe only. The real repin stays at P2 on final bytes.
- **Line endings:** the sed pass normalised the test copies to LF, so `repin.diff` shows whole-file changes. The copies were restored from backup afterwards.

## Option-1 probe (copy-only, erasure.ts only)

`opt1.out`; erasure variants in `attrib/erasure-opt1a.ts` and `attrib/erasure-opt1b.ts`.

| Variant | erasure LF sha | 128 | RED rows | 12 pins | AR-4 (D-016 post-check test) |
|---|---|---|---|---|---|
| base (P1a) | e1efe6f1 | 108/128 | 5 6 7 43 45 47 49 64 65 66 104-109 116 119 120 127 | 4/12 | GREEN |
| 1a: op aborts with the timer E, then throws a fresh born E | 94134d71 | 109/128 | as base, without 116 (116 is flaky, so no real change) | 4/12 | **RED** "signal.reason is the E op() threw" |
| 1b: op-side abort block removed; the timer keeps its own E and op throws a fresh born E | d3898e13 | **113/128** | 43 45 47 49 64 104-109 116 119 120 127 | 4/12 | **RED** "op-declared expiry aborts the signal" false |

- **1b fixes:** 5, 6, 7, 65, 66. Row 64 improves to 2/5.
- **1b breaks:** AR-4. 1b is the M39 mutant itself (dropping the op-path clearTimeout and #expire), so M39 can no longer serve as a falsifier. It also reopens the 3.9/3.3 root cause: op-declared expiry leaves the run signal live, which is A-c(start), the late provider call (M33).
- **A-b rows 34-41:** GREEN under 1b in the 128 run, so the H-043 receipt carries them without 3.9.
- **1a** fixes nothing and breaks AR-4.

## Options

1. **Revise 3.9 to option 1b** (op throws a fresh E; the timer keeps its own).
   - Fixes: 5 of the 6 class (ii) rows.
   - Breaks: AR-4, and with it the M39 falsifier, and the 3.9 abort-on-op guarantee that closes A-c(start) (3.3, M33).
   - Needs: a fresh plan review of P1a, and a replacement mechanism that aborts the signal without identity sharing. One example: abort with a distinct reason object while op throws a fresh E. That is untested; 1a shows that aborting with the timer E and throwing a fresh one still fails AR-4's identity assertion.
2. **Keep 3.9 and approve an oracle change** for rows 5-7 (and 64-66, which share the [W,E] reachability premise).
   - Needs: a protected-test edit under D-082/D10, so it goes to the Approver (Umesh). Under 3.9 there is no second distinct FWD to assert.
3. **Treat it as wider than rows 5-7.**
   - The identity premise reaches 6 rows (5-7, 64-66). It is not the cause of 43/45/47/49 (unchanged under 1a/1b and under the literal H-117 inserts), nor of 119/120/127 (P1b collectors, un-receipted).
   - The class (iii) rows need their own review item:
     - 43/45/47/49: the resume admission collector is pre-empted by the underLease drained-settlement forcing.
     - T046 private and D055 rollback-rejects: these fail on frozen 28bb3bc, so E8's "all green after repin" cannot be met as written.
