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
 *    what it already spent). A corrupt ledger line, or a charge whose usd is not a finite number
 *    >= 0, fails closed: undercounting spend would defeat the cap.
 *  - The read-check-append of every charge/start is serialised across processes by an exclusive
 *    lock file next to the ledger, so concurrent runners cannot jointly overshoot a cap.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export const PER_RUN_CAP_USD = 50;
export const PER_MONTH_CAP_USD = 200;
export const G_REAL_ENV = "VC_G_REAL";
/** The G-REAL gate file (contract B24.9): REAL runs need it to exist with an `Answered:` line. */
export const G_REAL_GATE_FILE = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "qa", "gates", "g-real.md");

export class GRealRefusedError extends Error {
  constructor(detail?: string) {
    super(
      `REAL mode refused: ${detail ?? `set ${G_REAL_ENV}=1 only after Umesh's per-use G-REAL approval`} (plan gate G-REAL, ` +
        "contract B13/B24.9). Mock mode needs no flag.",
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

export function assertGReal(env: Record<string, string | undefined> = process.env, gateFile: string = G_REAL_GATE_FILE): void {
  if (env[G_REAL_ENV] !== "1") throw new GRealRefusedError();
  // Contract B24.9: every REAL-model runner needs the per-use approval recorded in qa/gates/g-real.md.
  let text: string;
  try {
    text = readFileSync(gateFile, "utf-8");
  } catch {
    throw new GRealRefusedError(`${G_REAL_ENV}=1 is set but the gate file qa/gates/g-real.md (${gateFile}) is missing`);
  }
  // The label must start the line: plain `Answered:` or the markdown-bold forms `**Answered:**` / `**Answered**:`, then non-empty content on the same line.
  if (!/^(?:Answered:|\*\*Answered:\*\*|\*\*Answered\*\*:)[ \t]*\S/m.test(text)) {
    throw new GRealRefusedError(`${G_REAL_ENV}=1 is set but qa/gates/g-real.md has no "Answered:" line (the G-REAL question is unanswered)`);
  }
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
      if (parsed.kind === "charge" && (typeof parsed.usd !== "number" || !Number.isFinite(parsed.usd) || parsed.usd < 0)) {
        throw new Error("charge entry without a finite usd >= 0");
      }
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
  /** How long a charge/start waits for the ledger lock before failing closed (default 30 s). */
  lockWaitMs?: number;
  /** A lock file older than this is treated as left by a dead process and broken (default 15 s). */
  lockStaleMs?: number;
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Cross-process exclusive section around a ledger read-check-append. The lock is a `wx`-created
 * file next to the ledger; waiters retry with a bounded, jittered sleep, break a lock older than
 * `staleMs`, and fail closed (throw) after `waitMs` rather than writing unlocked.
 */
function withLedgerLock<T>(ledgerPath: string, waitMs: number, staleMs: number, fn: () => T): T {
  const lockPath = `${ledgerPath}.lock`;
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const deadline = Date.now() + waitMs;
  let fd: number;
  for (;;) {
    try {
      fd = openSync(lockPath, "wx");
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw err;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) unlinkSync(lockPath); // dead owner
      } catch {
        // the holder released it between our open and stat: just retry
      }
      if (Date.now() >= deadline) throw new Error(`budget ledger lock ${lockPath} not acquired within ${waitMs} ms; refusing to write the ledger unlocked`);
      sleepMs(5 + Math.floor(Math.random() * 20));
    }
  }
  try {
    writeSync(fd, String(process.pid));
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      // already gone (stale-broken by a waiter): nothing to release
    }
  }
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
  private readonly lockWaitMs: number;
  private readonly lockStaleMs: number;

  constructor(options: BudgetGuardOptions) {
    this.ledgerPath = options.ledgerPath;
    this.now = options.now ?? (() => new Date());
    this.perRunCapUsd = checkCap("perRunCapUsd", options.perRunCapUsd ?? PER_RUN_CAP_USD);
    this.perMonthCapUsd = checkCap("perMonthCapUsd", options.perMonthCapUsd ?? PER_MONTH_CAP_USD);
    this.lockWaitMs = checkCap("lockWaitMs", options.lockWaitMs ?? 30_000);
    this.lockStaleMs = checkCap("lockStaleMs", options.lockStaleMs ?? 15_000);
  }

  private locked<T>(fn: () => T): T {
    return withLedgerLock(this.ledgerPath, this.lockWaitMs, this.lockStaleMs, fn);
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
    const est = opts.estimateUsd ?? 0;
    if (!Number.isFinite(est) || est < 0) throw new RangeError(`estimateUsd must be a finite number >= 0, got ${est}`);
    return this.locked(() => this.startRunLocked(opts.runner, est));
  }

  private startRunLocked(runner: string, est: number): BudgetRun {
    const month = this.monthSpend(); // also fails closed on a corrupt ledger
    const runId = randomUUID();
    if (est > this.perRunCapUsd) {
      this.append({ runId, runner: runner, kind: "abort", cap: "per-run" });
      throw new BudgetExceededError("per-run", this.perRunCapUsd, est);
    }
    if (month + est > this.perMonthCapUsd) {
      this.append({ runId, runner: runner, kind: "abort", cap: "per-month" });
      throw new BudgetExceededError("per-month", this.perMonthCapUsd, month + est);
    }
    this.append({ runId, runner: runner, kind: "start" });
    return new BudgetRun(runId, runner, this);
  }

  /** @internal called by BudgetRun.charge */
  charge(run: BudgetRun, usd: number): void {
    this.locked(() => this.chargeLocked(run, usd));
  }

  private chargeLocked(run: BudgetRun, usd: number): void {
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
  /** Override of qa/gates/g-real.md (tests only). */
  gateFile?: string;
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
  assertGReal(options.env ?? process.env, options.gateFile);
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
    try {
      guard.end(run, "error");
    } catch {
      // the end marker is best-effort here: never let a ledger failure mask the body's own error
    }
    throw err;
  }
}
