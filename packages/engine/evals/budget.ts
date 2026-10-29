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
 *  - D-103: after a response that reports its token counts, `BudgetRun.recordActual` appends an `actual`
 *    line (actualInTokens / actualOutTokens / actualUsd next to the reservation it was made under). It is
 *    informational: month/run spend and the cap check keep using the pre-request reservation (`charge`),
 *    so actuals can never loosen a cap. Counts that are missing or invalid are recorded `actual:
 *    "unreported"` with the reservation figure, never as zero. A failed append of an `actual` line is tallied in memory as
 *    unreported (the response was already paid for) and never re-charged; a TORN trailing line (process killed
 *    mid-append) fails `readLedger` closed like any corrupt line, so the next run refuses until it is repaired.
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
  kind: "start" | "charge" | "abort" | "end" | "actual";
  /** Only meaningful for `charge`. */
  usd?: number;
  /** `actual` lines only (D-103): "reported" = both token counts were valid; "unreported" = reservation kept, no figures. */
  actual?: "reported" | "unreported";
  actualInTokens?: number;
  actualOutTokens?: number;
  /** Actual tokens x the table/override price; notional for a hosted-key model. */
  actualUsd?: number;
  /** The pre-request reservation (the `charge` usd) this `actual` line belongs to. */
  reservedUsd?: number;
  cap?: BudgetCap;
  status?: "completed" | "aborted-budget" | "error";
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isUsd = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function validateActualEntry(e: LedgerEntry): void {
  if (!isUsd(e.reservedUsd)) throw new Error("actual entry without a finite reservedUsd >= 0");
  if (e.actual === "reported") {
    if (!isCount(e.actualInTokens) || !isCount(e.actualOutTokens) || !isUsd(e.actualUsd)) {
      throw new Error("reported actual entry without integer token counts >= 0 and a finite actualUsd >= 0");
    }
  } else if (e.actual !== "unreported") {
    throw new Error(`actual entry with unknown actual flag ${JSON.stringify(e.actual)}`);
  }
}

export function readLedger(path: string): LedgerEntry[] {
  if (!existsSync(path)) return [];
  const entries: LedgerEntry[] = [];
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line) as LedgerEntry;
      if (typeof parsed.ts !== "string" || !Number.isFinite(Date.parse(parsed.ts))) throw new Error("invalid timestamp");
      if (typeof parsed.kind !== "string") throw new Error("missing kind");
      if (parsed.kind === "charge" && (typeof parsed.usd !== "number" || !Number.isFinite(parsed.usd) || parsed.usd < 0)) {
        throw new Error("charge entry without a finite usd >= 0");
      }
      if (parsed.kind === "actual") validateActualEntry(parsed);
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
    const instant = typeof e.ts === "string" ? Date.parse(e.ts) : NaN;
    if (!Number.isFinite(instant)) throw new Error("budget ledger contains an invalid timestamp; refusing to undercount spend");
    if (e.kind === "charge" && monthKey(new Date(instant)) === key) total += e.usd ?? 0;
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

/** D-103: what one response reported, next to the reservation it was made under. Valid figures or "unreported" (never zero). */
export interface ActualUsage {
  /** The pre-request reservation (the amount passed to `charge`) for this request. */
  reservedUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Actual tokens x price. */
  usd?: number;
}

/** Per-run sums of recorded actuals; unreported calls are counted and keep their reservation, never zero. */
export interface UsageSummary {
  reportedCalls: number;
  unreportedCalls: number;
  actualInTokens: number;
  actualOutTokens: number;
  actualUsd: number;
  unreportedReservedUsd: number;
}

export class BudgetRun {
  spentUsd = 0;
  aborted = false;
  private readonly usage: UsageSummary = { reportedCalls: 0, unreportedCalls: 0, actualInTokens: 0, actualOutTokens: 0, actualUsd: 0, unreportedReservedUsd: 0 };
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

  /**
   * D-103: record what a response actually reported, AFTER its `charge`. Never changes `spentUsd`, the
   * month spend or any cap check. Missing / non-integer / negative / non-finite figures are recorded as
   * "unreported" (reservation kept), never as zero.
   */
  recordActual(usage: ActualUsage): void {
    if (!isUsd(usage.reservedUsd)) throw new RangeError(`reservedUsd must be a finite number >= 0, got ${usage.reservedUsd}`);
    const reported = isCount(usage.inputTokens) && isCount(usage.outputTokens) && isUsd(usage.usd);
    // A failed append must not lose the call: it is still tallied (as unreported, keeping its reservation) and the
    // error is rethrown after the tally. The reservation was already charged, so nothing is ever re-charged.
    let appendError: unknown;
    let appended = true;
    try {
      this.guard.recordActual(this, usage, reported);
    } catch (err) {
      appended = false;
      appendError = err;
    }
    const u = this.usage;
    if (reported && appended) {
      u.reportedCalls += 1;
      u.actualInTokens += usage.inputTokens!;
      u.actualOutTokens += usage.outputTokens!;
      u.actualUsd = Math.round((u.actualUsd + usage.usd!) * 1e9) / 1e9;
    } else {
      u.unreportedCalls += 1;
      u.unreportedReservedUsd = Math.round((u.unreportedReservedUsd + usage.reservedUsd) * 1e6) / 1e6;
    }
    if (!appended) throw appendError;
  }

  usageSummary(): UsageSummary {
    return { ...this.usage };
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

  /** @internal called by BudgetRun.recordActual; locked so a concurrent reader never sees a half-written line. */
  recordActual(run: BudgetRun, usage: ActualUsage, reported: boolean): void {
    this.locked(() =>
      this.append({
        runId: run.runId,
        runner: run.runner,
        kind: "actual",
        reservedUsd: usage.reservedUsd,
        ...(reported
          ? { actual: "reported" as const, actualInTokens: usage.inputTokens!, actualOutTokens: usage.outputTokens!, actualUsd: usage.usd! }
          : { actual: "unreported" as const }),
      }),
    );
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
  /** D-103: sums of the actual-token lines recorded during the run (absent when the run never started). */
  usage?: UsageSummary;
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
    return { status: "completed", value, spentUsd: run.spentUsd, runner: options.runner, usage: run.usageSummary() };
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      guard.end(run, "aborted-budget");
      return { status: "aborted-budget", spentUsd: run.spentUsd, cap: err.cap, limitUsd: err.limitUsd, runner: options.runner, usage: run.usageSummary() };
    }
    try {
      guard.end(run, "error");
    } catch {
      // the end marker is best-effort here: never let a ledger failure mask the body's own error
    }
    throw err;
  }
}
