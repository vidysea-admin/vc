/** Test helper for budget.test.ts (fix2): one OS process that opens its own run on a shared ledger and
 *  charges USD 1 per attempt until `attempts` are used or the cap refuses. Not a test file. */
import { BudgetExceededError, BudgetGuard, type BudgetRun } from "./budget.js";

const [ledgerPath, attemptsArg, capArg, startAtArg] = process.argv.slice(2);
if (!ledgerPath || !attemptsArg || !capArg) throw new Error("usage: budget-worker <ledger> <attempts> <monthCapUsd>");
const guard = new BudgetGuard({ ledgerPath, perRunCapUsd: Number(attemptsArg), perMonthCapUsd: Number(capArg), lockWaitMs: 120_000 });
// start barrier: every worker begins charging at the same wall-clock instant so they truly contend
const startAt = Number(startAtArg ?? 0);
while (Date.now() < startAt) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
try {
  const run: BudgetRun = guard.startRun({ runner: `worker-${process.pid}` });
  for (let i = 0; i < Number(attemptsArg); i++) run.charge(1);
} catch (err) {
  // the cap refused: that is the expected end state for most workers
  if (!(err instanceof BudgetExceededError)) throw err;
}
