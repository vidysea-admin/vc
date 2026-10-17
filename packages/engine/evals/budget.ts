/**
 * P1 U4 / A24: the shared budget guard for every REAL eval runner (run-h2h, run-probes,
 * run-latency, run-live, eval:kb --real).
 *
 *  - REAL mode refuses unless the explicit G-REAL env flag `VC_G_REAL=1` is set (plan gate G-REAL:
 *    per-use approval). Mock mode never touches this module's ledger.
 *  - Hard stop: a charge that would take one run past USD 50, or the calendar month (UTC) past
 *    USD 200, throws BEFORE the spend is recorded (the caller must call `charge(cost)` before it
 *    incurs the cost). Both figures are [ASSUMPTION, adjustable] per the spec; they are options with
 *    these defaults, but never "unlimited" (non-finite / non-positive caps are rejected).
 *  - Spend is recorded per charge, append-only, to a JSONL ledger (crash-safe: a killed run keeps
 *    what it already spent). A corrupt ledger line fails closed: undercounting spend would defeat
 *    the cap.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const PER_RUN_CAP_USD = 50;
export const PER_MONTH_CAP_USD = 200;
export const G_REAL_ENV = "VC_G_REAL";

export class GRealRefusedError extends Error {
  constructor() {
    super(
      `REAL mode refused: set ${G_REAL_ENV}=1 only after Umesh's per-use G-REAL approval (plan gate G-REAL, ` +
        "contract B13). Mock mode needs no flag.",
    );
    this.name = "GRealRefusedError";
  }
}

export type BudgetCap = "per-run" | "per-month";

export class BudgetExceededError extends Error {
  constructor(
    readonly cap: BudgetCap,
    readonly limitUsd: number,
    readonly wouldBeUsd: number,
  ) {
    super(`Budget hard stop (${cap}): this charge would bring spend to USD ${wouldBeUsd.toFixed(2)}, over the USD ${limitUsd} cap.`);
    this.name = "BudgetExceededError";
  }
}

export function assertGReal(env: Record<string, string | undefined> = process.env): void {
  if (env[G_REAL_ENV] !== "1") throw new GRealRefusedError();
}

export interface LedgerEntry {
  ts: string;
  runId: string;
  runner: string;
  kind: "start" | "charge" | "abort" | "end";
  /** Only meaningful for `charge`. */
  usd?: number;
  cap?: BudgetCap;
  status?: "completed" | "aborted-budget" | "error";
}

export function readLedger(path: string): LedgerEntry[] {
  if (!existsSync(path)) return [];
  const entries: LedgerEntry[] = [];
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line) as LedgerEntry;
      if (typeof parsed.ts !== "string" || typeof parsed.kind !== "string") throw new Error("missing ts/kind");
      entries.push(parsed);
    } catch (err) {
      throw new Error(`budget ledger ${path}:${i + 1} is corrupt (${(err as Error).message}); refusing to run rather than undercount spend`);
    }
  }
  return entries;
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function monthSpendUsd(entries: readonly LedgerEntry[], at: Date): number {
  const key = monthKey(at);
  let total = 0;
  for (const e of entries) {
    if (e.kind === "charge" && e.ts.slice(0, 7) === key) total += e.usd ?? 0;
  }
  return Math.round(total * 1e6) / 1e6;
}

export interface BudgetGuardOptions {
  ledgerPath: string;
  now?: () => Date;
  perRunCapUsd?: number;
  perMonthCapUsd?: number;
}

function checkCap(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number, got ${value}`);
  return value;
}

export class BudgetRun {
  spentUsd = 0;
  aborted = false;
  constructor(
    readonly runId: string,
    readonly runner: string,
    private readonly guard: BudgetGuard,
  ) {}

  /** Call BEFORE incurring `usd`. Throws BudgetExceededError (and records an abort) instead of overspending. */
  charge(usd: number): void {
    if (!Number.isFinite(usd) || usd < 0) throw new RangeError(`charge must be a finite number >= 0, got ${usd}`);
    this.guard.charge(this, usd);
  }
}

export class BudgetGuard {
  readonly ledgerPath: string;
  readonly perRunCapUsd: number;
  readonly perMonthCapUsd: number;
  private readonly now: () => Date;

  constructor(options: BudgetGuardOptions) {
    this.ledgerPath = options.ledgerPath;
    this.now = options.now ?? (() => new Date());
    this.perRunCapUsd = checkCap("perRunCapUsd", options.perRunCapUsd ?? PER_RUN_CAP_USD);
    this.perMonthCapUsd = checkCap("perMonthCapUsd", options.perMonthCapUsd ?? PER_MONTH_CAP_USD);
  }

  private append(entry: Omit<LedgerEntry, "ts">): void {
    mkdirSync(dirname(this.ledgerPath), { recursive: true });
    const full: LedgerEntry = { ts: this.now().toISOString(), ...entry };
    appendFileSync(this.ledgerPath, `${JSON.stringify(full)}\n`, "utf-8");
  }

  monthSpend(): number {
    return monthSpendUsd(readLedger(this.ledgerPath), this.now());
  }

  startRun(opts: { runner: string; estimateUsd?: number }): BudgetRun {
    const month = this.monthSpend(); // also fails closed on a corrupt ledger
    const est = opts.estimateUsd ?? 0;
    if (!Number.isFinite(est) || est < 0) throw new RangeError(`estimateUsd must be a finite number >= 0, got ${est}`);
    const runId = randomUUID();
    if (est > this.perRunCapUsd) {
      this.append({ runId, runner: opts.runner, kind: "abort", cap: "per-run" });
      throw new BudgetExceededError("per-run", this.perRunCapUsd, est);
    }
    if (month + est > this.perMonthCapUsd) {
      this.append({ runId, runner: opts.runner, kind: "abort", cap: "per-month" });
      throw new BudgetExceededError("per-month", this.perMonthCapUsd, month + est);
    }
    this.append({ runId, runner: opts.runner, kind: "start" });
    return new BudgetRun(runId, opts.runner, this);
  }

  /** @internal called by BudgetRun.charge */
  charge(run: BudgetRun, usd: number): void {
    const abort = (cap: BudgetCap, limit: number, would: number): never => {
      run.aborted = true;
      this.append({ runId: run.runId, runner: run.runner, kind: "abort", cap });
      throw new BudgetExceededError(cap, limit, would);
    };
    if (run.aborted) {
      throw new BudgetExceededError("per-run", this.perRunCapUsd, run.spentUsd + usd);
    }
    const runWould = Math.round((run.spentUsd + usd) * 1e6) / 1e6;
    if (runWould > this.perRunCapUsd) abort("per-run", this.perRunCapUsd, runWould);
    const monthWould = Math.round((this.monthSpend() + usd) * 1e6) / 1e6;
    if (monthWould > this.perMonthCapUsd) abort("per-month", this.perMonthCapUsd, monthWould);
    this.append({ runId: run.runId, runner: run.runner, kind: "charge", usd });
    run.spentUsd = runWould;
  }

  /** @internal */
  end(run: BudgetRun, status: "completed" | "aborted-budget" | "error"): void {
    this.append({ runId: run.runId, runner: run.runner, kind: "end", status });
  }
}

export interface ExecuteRealOptions {
  runner: string;
  ledgerPath: string;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  estimateUsd?: number;
  perRunCapUsd?: number;
  perMonthCapUsd?: number;
}

export interface RealResult<T> {
  status: "completed" | "aborted-budget";
  value?: T;
  spentUsd: number;
  cap?: BudgetCap;
  limitUsd?: number;
  runner: string;
}

/**
 * The one entry every REAL runner goes through: G-REAL gate -> budget guard -> body. A budget
 * overrun returns `aborted-budget` (reported, spend kept in the ledger) instead of throwing, so the
 * runner can write its abort report; any other error is recorded and rethrown.
 */
export async function executeReal<T>(options: ExecuteRealOptions, body: (run: BudgetRun) => Promise<T>): Promise<RealResult<T>> {
  assertGReal(options.env ?? process.env);
  const guard = new BudgetGuard({
    ledgerPath: options.ledgerPath,
    ...(options.now ? { now: options.now } : {}),
    ...(options.perRunCapUsd !== undefined ? { perRunCapUsd: options.perRunCapUsd } : {}),
    ...(options.perMonthCapUsd !== undefined ? { perMonthCapUsd: options.perMonthCapUsd } : {}),
  });
  let run: BudgetRun;
  try {
    run = guard.startRun({ runner: options.runner, ...(options.estimateUsd !== undefined ? { estimateUsd: options.estimateUsd } : {}) });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return { status: "aborted-budget", spentUsd: 0, cap: err.cap, limitUsd: err.limitUsd, runner: options.runner };
    }
    throw err;
  }
  try {
    const value = await body(run);
    guard.end(run, "completed");
    return { status: "completed", value, spentUsd: run.spentUsd, runner: options.runner };
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      guard.end(run, "aborted-budget");
      return { status: "aborted-budget", spentUsd: run.spentUsd, cap: err.cap, limitUsd: err.limitUsd, runner: options.runner };
    }
    guard.end(run, "error");
    throw err;
  }
}
