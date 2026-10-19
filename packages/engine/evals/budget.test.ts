/** P1 U4 / A24: the shared budget guard. Every REAL runner hard-stops at USD 50 per run and USD 200
 *  per month and records spend; REAL mode refuses without the explicit G-REAL env flag. Tests use a
 *  temp ledger only (never the repo's real spend ledger). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, appendFileSync, writeFileSync, rmSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BudgetGuard,
  BudgetExceededError,
  GRealRefusedError,
  assertGReal,
  executeReal,
  readLedger,
  monthSpendUsd,
  PER_RUN_CAP_USD,
  PER_MONTH_CAP_USD,
} from "./budget.js";

function tmpLedger(): string {
  return join(mkdtempSync(join(tmpdir(), "vc-budget-")), "ledger.jsonl");
}
/** A temp stand-in for qa/gates/g-real.md; tests never read the repo's real gate file. */
function tmpGate(content: string | null = "# G-REAL\n\nAnswered: 2026-10-17T00:00:00+05:30 - A - Umesh in chat\n"): string {
  const path = join(mkdtempSync(join(tmpdir(), "vc-gate-")), "g-real.md");
  if (content !== null) writeFileSync(path, content, "utf-8");
  return path;
}
const GATE_OK = tmpGate();
const JULY = () => new Date("2026-07-15T10:00:00Z");
const AUG = () => new Date("2026-08-02T10:00:00Z");

test("default caps are USD 50 per run and USD 200 per month (spec A24)", () => {
  assert.equal(PER_RUN_CAP_USD, 50);
  assert.equal(PER_MONTH_CAP_USD, 200);
});

test("assertGReal refuses without the explicit VC_G_REAL flag, in every non-approved shape", () => {
  for (const env of [{}, { VC_G_REAL: "" }, { VC_G_REAL: "0" }, { VC_G_REAL: "true" }, { VC_G_REAL: "yes" }]) {
    assert.throws(() => assertGReal(env), GRealRefusedError);
  }
  assert.doesNotThrow(() => assertGReal({ VC_G_REAL: "1" }, GATE_OK));
});

test("a charge under both caps is recorded to the ledger before it returns", () => {
  const ledgerPath = tmpLedger();
  const guard = new BudgetGuard({ ledgerPath, now: JULY });
  const run = guard.startRun({ runner: "run-h2h" });
  run.charge(12.5);
  run.charge(7.5);
  assert.equal(run.spentUsd, 20);
  const entries = readLedger(ledgerPath);
  assert.equal(entries.filter((e) => e.kind === "charge").length, 2);
  assert.equal(monthSpendUsd(entries, JULY()), 20);
});

test("a charge that would pass USD 50 in one run aborts, is NOT recorded as spent, and logs the abort", () => {
  const ledgerPath = tmpLedger();
  const guard = new BudgetGuard({ ledgerPath, now: JULY });
  const run = guard.startRun({ runner: "run-probes" });
  run.charge(40);
  assert.throws(() => run.charge(10.01), (e: unknown) => e instanceof BudgetExceededError && e.cap === "per-run");
  assert.equal(run.spentUsd, 40);
  assert.equal(run.aborted, true);
  const entries = readLedger(ledgerPath);
  assert.equal(monthSpendUsd(entries, JULY()), 40, "the refused charge is not counted as spend");
  assert.ok(entries.some((e) => e.kind === "abort" && e.cap === "per-run"));
  assert.throws(() => run.charge(0.01), BudgetExceededError, "an aborted run stays aborted");
});

test("exactly USD 50 in a run is allowed; the next cent is not (boundary)", () => {
  const guard = new BudgetGuard({ ledgerPath: tmpLedger(), now: JULY });
  const run = guard.startRun({ runner: "run-latency" });
  run.charge(50);
  assert.throws(() => run.charge(0.01), BudgetExceededError);
});

test("month cap USD 200 counts spend across separate runs and aborts the run that would pass it", () => {
  const ledgerPath = tmpLedger();
  const guard = new BudgetGuard({ ledgerPath, now: JULY });
  for (const name of ["a", "b", "c", "d"]) {
    guard.startRun({ runner: name }).charge(50);
  }
  assert.equal(monthSpendUsd(readLedger(ledgerPath), JULY()), 200);
  const fifth = guard.startRun({ runner: "e" });
  assert.throws(() => fifth.charge(0.01), (e: unknown) => e instanceof BudgetExceededError && e.cap === "per-month");
  // a brand-new guard instance (a different process) reads the same ledger and refuses too
  const other = new BudgetGuard({ ledgerPath, now: JULY });
  assert.throws(() => other.startRun({ runner: "f", estimateUsd: 1 }), BudgetExceededError);
});

test("the month cap rolls over: July spend does not block August", () => {
  const ledgerPath = tmpLedger();
  const july = new BudgetGuard({ ledgerPath, now: JULY });
  for (let i = 0; i < 4; i++) july.startRun({ runner: `j${i}` }).charge(50);
  const aug = new BudgetGuard({ ledgerPath, now: AUG });
  aug.startRun({ runner: "aug" }).charge(10);
  assert.equal(monthSpendUsd(readLedger(ledgerPath), AUG()), 10);
  assert.equal(monthSpendUsd(readLedger(ledgerPath), JULY()), 200);
});

test("an up-front estimate over a cap refuses before any run starts", () => {
  const guard = new BudgetGuard({ ledgerPath: tmpLedger(), now: JULY });
  assert.throws(() => guard.startRun({ runner: "x", estimateUsd: 50.01 }), (e: unknown) => e instanceof BudgetExceededError && e.cap === "per-run");
});

test("negative, NaN and infinite charges are rejected, never silently absorbed", () => {
  const run = new BudgetGuard({ ledgerPath: tmpLedger(), now: JULY }).startRun({ runner: "x" });
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => run.charge(bad), RangeError);
  assert.equal(run.spentUsd, 0);
});

test("caps are adjustable per guard (spec: USD 50 / 200 are ASSUMPTION, adjustable) but never silently unlimited", () => {
  const guard = new BudgetGuard({ ledgerPath: tmpLedger(), now: JULY, perRunCapUsd: 5, perMonthCapUsd: 8 });
  const r1 = guard.startRun({ runner: "x" });
  r1.charge(5);
  assert.throws(() => r1.charge(0.01), BudgetExceededError);
  const r2 = guard.startRun({ runner: "y" });
  assert.throws(() => r2.charge(3.01), (e: unknown) => e instanceof BudgetExceededError && e.cap === "per-month");
  assert.throws(() => new BudgetGuard({ ledgerPath: tmpLedger(), perRunCapUsd: Infinity }), RangeError);
  assert.throws(() => new BudgetGuard({ ledgerPath: tmpLedger(), perMonthCapUsd: 0 }), RangeError);
});

test("executeReal refuses without G-REAL: body never runs and no ledger file is created", async () => {
  const ledgerPath = tmpLedger();
  let ran = false;
  await assert.rejects(
    executeReal({ runner: "run-h2h", ledgerPath, env: {}, now: JULY }, async () => {
      ran = true;
      return "x";
    }),
    GRealRefusedError,
  );
  assert.equal(ran, false);
  assert.equal(existsSync(ledgerPath), false);
});

test("executeReal returns an aborted-budget result (not a throw) when the body overspends, and keeps the recorded spend", async () => {
  const ledgerPath = tmpLedger();
  const result = await executeReal({ runner: "run-live", ledgerPath, env: { VC_G_REAL: "1" }, gateFile: GATE_OK, now: JULY }, async (run) => {
    run.charge(30);
    run.charge(30);
    return "never";
  });
  assert.equal(result.status, "aborted-budget");
  assert.equal(result.spentUsd, 30);
  assert.equal(result.cap, "per-run");
  assert.equal(result.value, undefined);
  assert.equal(monthSpendUsd(readLedger(ledgerPath), JULY()), 30);
});

test("executeReal completes, records an end entry and returns the body value", async () => {
  const ledgerPath = tmpLedger();
  const result = await executeReal({ runner: "run-probes", ledgerPath, env: { VC_G_REAL: "1" }, gateFile: GATE_OK, now: JULY }, async (run) => {
    run.charge(1.25);
    return 42;
  });
  assert.equal(result.status, "completed");
  assert.equal(result.value, 42);
  assert.equal(result.spentUsd, 1.25);
  assert.deepEqual(
    readLedger(ledgerPath).map((e) => e.kind),
    ["start", "charge", "end"],
  );
});

test("a body that throws a non-budget error still records an end entry and rethrows", async () => {
  const ledgerPath = tmpLedger();
  await assert.rejects(
    executeReal({ runner: "run-probes", ledgerPath, env: { VC_G_REAL: "1" }, gateFile: GATE_OK, now: JULY }, async (run) => {
      run.charge(2);
      throw new Error("provider exploded");
    }),
    /provider exploded/,
  );
  const entries = readLedger(ledgerPath);
  assert.equal(entries.at(-1)?.kind, "end");
  assert.equal(entries.at(-1)?.status, "error");
  assert.equal(monthSpendUsd(entries, JULY()), 2);
});

test("a corrupt ledger line fails closed (refuses to run) rather than undercounting spend", () => {
  const ledgerPath = tmpLedger();
  new BudgetGuard({ ledgerPath, now: JULY }).startRun({ runner: "x" }).charge(1);
  appendFileSync(ledgerPath, "{not json\n", "utf-8");
  assert.throws(() => new BudgetGuard({ ledgerPath, now: JULY }).startRun({ runner: "y" }), /ledger/i);
});

// ---------------------------------------------------------------------------
// p1-u4b hardening (senior review of U4)
// ---------------------------------------------------------------------------

test("fix1: a charge entry with a non-numeric, null, missing or negative usd fails closed", () => {
  for (const bad of ['"abc"', "null", "-500", "{}", "1e999"]) {
    const ledgerPath = tmpLedger();
    mkdirSync(dirname(ledgerPath), { recursive: true });
    const usdPart = bad === "{}" ? "" : `,"usd":${bad}`;
    appendFileSync(ledgerPath, `{"ts":"2026-07-15T10:00:00.000Z","runId":"r","runner":"x","kind":"charge"${usdPart}}\n`, "utf-8");
    assert.throws(() => readLedger(ledgerPath), /ledger/i, `usd=${bad} must fail closed`);
    assert.throws(() => new BudgetGuard({ ledgerPath, now: JULY }).startRun({ runner: "y" }), /ledger/i, `guard must refuse on usd=${bad}`);
  }
  // a valid zero and a positive charge still read fine
  const ok = tmpLedger();
  appendFileSync(
    ok,
    '{"ts":"2026-07-15T10:00:00.000Z","runId":"r","runner":"x","kind":"charge","usd":0}\n{"ts":"2026-07-15T10:00:00.000Z","runId":"r","runner":"x","kind":"charge","usd":2.5}\n',
    "utf-8",
  );
  assert.equal(monthSpendUsd(readLedger(ok), JULY()), 2.5);
});

const here = fileURLToPath(new URL(".", import.meta.url));

function runWorker(ledgerPath: string, attempts: number, capUsd: number, startAtMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", join(here, "budget-worker.ts"), ledgerPath, String(attempts), String(capUsd), String(startAtMs)], {
      cwd: join(here, ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out }));
  });
}

test("fix2: 6 concurrent processes each charging USD 1 against a shared month cap record at most the cap (400 here; 900 attempts)", { timeout: 180_000 }, async () => {
  const ledgerPath = tmpLedger();
  const startAt = Date.now() + 5_000; // all six release together after their (slow) tsx start-up
  const results = await Promise.all(Array.from({ length: 6 }, () => runWorker(ledgerPath, 150, 400, startAt)));
  for (const r of results) assert.equal(r.code, 0, `worker failed: ${r.out}`);
  const charges = readLedger(ledgerPath).filter((e) => e.kind === "charge");
  assert.ok(charges.length <= 400, `cap breached across processes: ${charges.length} charges recorded`);
  assert.equal(charges.length, 400, "900 attempts against a 400 cap must fill the cap exactly");
  assert.equal(existsSync(`${ledgerPath}.lock`), false, "the lock is released");
});

test("fix2: a stale lock file (dead owner) is broken after the stale timeout instead of starving the run", () => {
  const ledgerPath = tmpLedger();
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const lock = `${ledgerPath}.lock`;
  writeFileSync(lock, "99999999", "utf-8");
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(lock, old, old);
  const guard = new BudgetGuard({ ledgerPath, now: JULY });
  guard.startRun({ runner: "x" }).charge(1);
  assert.equal(monthSpendUsd(readLedger(ledgerPath), JULY()), 1);
  assert.equal(existsSync(lock), false);
});

test("fix2: a live lock that never frees fails closed after the bounded wait (no unlocked write)", () => {
  const ledgerPath = tmpLedger();
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const lock = `${ledgerPath}.lock`;
  writeFileSync(lock, String(process.pid), "utf-8"); // fresh mtime: not stale
  const guard = new BudgetGuard({ ledgerPath, now: JULY, lockWaitMs: 200, lockStaleMs: 60_000 });
  assert.throws(() => guard.startRun({ runner: "x" }), /lock/i);
  assert.equal(existsSync(ledgerPath), false, "nothing was appended without the lock");
  rmSync(lock);
});

test("fix4: assertGReal also needs qa/gates/g-real.md with an Answered: line; refuses when absent or unanswered", () => {
  const env = { VC_G_REAL: "1" };
  assert.throws(() => assertGReal(env, tmpGate(null)), (e: unknown) => e instanceof GRealRefusedError && /g-real\.md/.test((e as Error).message));
  assert.throws(() => assertGReal(env, tmpGate("# G-REAL\n\nAnswer format: `Answered: <ISO>` (pending)\n")), GRealRefusedError);
  assert.throws(() => assertGReal(env, tmpGate("# G-REAL\n\nAnswered:\n")), GRealRefusedError);
  assert.doesNotThrow(() => assertGReal(env, tmpGate("# G-REAL\n\nAnswered: 2026-10-17T10:00:00+05:30 - A - Umesh\n")));
  // the env flag alone is not enough, and the gate file alone is not enough
  assert.throws(() => assertGReal({}, GATE_OK), GRealRefusedError);
});

/** A verbatim copy of qa/gates/g-real.md as it stood on 2026-10-19 (the approval is the bold `**Answered:**` line). */
const G_REAL_FILE_COPY = "# HUMAN_GATE: G-REAL (paid, real-model evaluation runs, with a budget cap)\n**Opened:** 2026-10-17T14:05:14+05:30 (checker, P1 unit U0; plan v8 U0/U4/U13b, spec A24, D-088 Q18, contract B24.9)\n**Status:** OPEN\n\n**Question:** may P1 spend money on real-model and real-audio evaluation runs, and under what cap? The runs are\n`run-h2h` (A14, with the REAL parts of A1/A3), `run-probes` (A4), `run-latency` (A8), `run-live` (A10 voice) and\n`eval:kb --real` (A2b). They use synthetic or anonymised inputs only (B13); no production student text is involved.\n\n**Proposed cap (D-088 Q18, [ASSUMPTION, adjustable]):** USD 50 per run and USD 200 per month. Every REAL runner\nhard-stops and reports when a run would pass USD 50, or when the month's recorded spend would pass USD 200. Spend is\nrecorded per run (spec A24, mock-tested in `tests/budget-cap.test.ts`).\n\n**Options:**\n- **(a) Approve the caps as proposed (USD 50 per run, USD 200 per month),** with a per-run go from Umesh before each\n  paid run starts.\n- **(b) Approve different caps** (name them).\n- **(c) Per-use approval only,** no standing cap; each run asks first.\n- **(d) No paid runs yet.** REAL criteria stay NOT PROVEN, and text P1 cannot be called done (contract B24.9).\n\n**Blocks:** every REAL run and therefore unit U13b (A2b, A4 probes, A8, A10, A14). It does not block U0-U13a (mock and\nfrozen-fixture work).\n**Per-use rule:** an approval here is a cap, not a blank cheque: each paid run is still started only on a go from Umesh.\n**Answer format:** chat reply. The maker appends `Answered: <ISO> - <option> - <caps>` here.\n\n**Answered:** 2026-10-19T10:41:00+05:30 - (a) approved - Umesh (chat, 2026-10-19): paid real-model eval runs approved via API keys: Ollama-hosted GLM 5.3 Flash and DeepSeek 4.1 Flash now, Gemini models later. Caps [ASSUMPTION, not named by Umesh]: the proposed USD 50 per run / USD 200 per month. Inputs synthetic or anonymised only (B13). Recorded in D-100.\n";

test("p1-greal-bold: a verbatim copy of the real g-real.md (bold **Answered:** line only) is accepted", () => {
  const env = { VC_G_REAL: "1" };
  // the copy has no bare `Answered:` line: its only approval is the bold form, and the quoted `Answered: <ISO>` on the Answer format line must not be what passes
  assert.equal(/^Answered:/m.test(G_REAL_FILE_COPY), false);
  assert.doesNotThrow(() => assertGReal(env, tmpGate(G_REAL_FILE_COPY)));
  assert.doesNotThrow(() => assertGReal(env, tmpGate(G_REAL_FILE_COPY.replace(/\n/g, "\r\n"))));
  // the same file with the approval line removed is still refused (the quoted Answer format line does not count)
  const unanswered = G_REAL_FILE_COPY.split("\n").filter((l) => !l.startsWith("**Answered:**")).join("\n");
  assert.notEqual(unanswered, G_REAL_FILE_COPY);
  assert.throws(() => assertGReal(env, tmpGate(unanswered)), GRealRefusedError);
});

test("p1-greal-bold: assertGReal accepts Answered: and the bold wrapper forms, each with content; refuses empty, mid-line, quoted and negated forms", () => {
  const env = { VC_G_REAL: "1" };
  const gate = (line: string, crlf = false) => tmpGate(("# G-REAL\n\n" + line + "\n").replace(/\n/g, crlf ? "\r\n" : "\n"));
  for (const ok of [
    "Answered: 2026-10-19T10:41:00+05:30 - (a) approved",
    "**Answered:** 2026-10-19T10:41:00+05:30 - (a) approved",
    "**Answered**: 2026-10-19T10:41:00+05:30 - (a) approved",
    "**Answered:**2026-10-19T10:41:00+05:30 - (a) approved",
    "**Answered:**\t2026-10-19T10:41:00+05:30",
  ]) {
    assert.doesNotThrow(() => assertGReal(env, gate(ok)), ok);
    assert.doesNotThrow(() => assertGReal(env, gate(ok, true)), `${ok} (CRLF)`);
  }
  for (const bad of [
    "Answered:",
    "Answered:   ",
    "**Answered:**",
    "**Answered:**   ",
    "**Answered**:",
    "**Answered**:  ",
    "Answer format: `Answered: <ISO>` (pending)",
    "**Answer format:** chat reply. The maker appends `Answered: <ISO> - <option>` here.",
    "Not Answered: yes",
    "**Not Answered:** yes",
    "> Answered: 2026-10-19 - a",
    "> **Answered:** 2026-10-19 - a",
    "  Answered: 2026-10-19 - a",
    "x **Answered:** 2026-10-19 - a",
    "**Answered:",
    "Answered** : 2026-10-19",
  ]) {
    assert.throws(() => assertGReal(env, gate(bad)), GRealRefusedError, bad);
    assert.throws(() => assertGReal(env, gate(bad, true)), GRealRefusedError, `${bad} (CRLF)`);
  }
  // a bold label with nothing after it must not borrow content from the NEXT line
  assert.throws(() => assertGReal(env, tmpGate("# G-REAL\n\n**Answered:**\n2026-10-19 - a\n")), GRealRefusedError);
});

test("fix4: executeReal refuses with the env flag but no gate file; the body never runs and no ledger is created", async () => {
  const ledgerPath = tmpLedger();
  let ran = false;
  await assert.rejects(
    executeReal({ runner: "run-h2h", ledgerPath, env: { VC_G_REAL: "1" }, gateFile: tmpGate(null), now: JULY }, async () => {
      ran = true;
      return 1;
    }),
    GRealRefusedError,
  );
  assert.equal(ran, false);
  assert.equal(existsSync(ledgerPath), false);
});

test("fix8: if guard.end throws after the body threw, the original body error is kept", async () => {
  const ledgerPath = tmpLedger();
  await assert.rejects(
    executeReal({ runner: "run-probes", ledgerPath, env: { VC_G_REAL: "1" }, gateFile: GATE_OK, now: JULY }, async (run) => {
      run.charge(1);
      // make the end() append fail: replace the ledger file with a directory
      rmSync(ledgerPath);
      mkdirSync(ledgerPath);
      throw new Error("body boom");
    }),
    /body boom/,
  );
});

// ---------------------------------------------------------------------------
// p1-ollama-actual-tokens (D-103): actual-token lines next to the pre-request reservation.
// ---------------------------------------------------------------------------
test("p1-ollama-actual-tokens: recordActual appends an 'actual' line with the counts and USD, after the charge, and does not change spend", () => {
  const ledgerPath = tmpLedger();
  const guard = new BudgetGuard({ ledgerPath, now: JULY });
  const run = guard.startRun({ runner: "run-kb" });
  run.charge(0.25);
  run.recordActual({ reservedUsd: 0.25, inputTokens: 1200, outputTokens: 300, usd: 0.0024 });
  const entries = readLedger(ledgerPath);
  assert.deepEqual(entries.map((e) => e.kind), ["start", "charge", "actual"]);
  const a = entries[2]!;
  assert.equal(a.actual, "reported");
  assert.equal(a.actualInTokens, 1200);
  assert.equal(a.actualOutTokens, 300);
  assert.equal(a.actualUsd, 0.0024);
  assert.equal(a.reservedUsd, 0.25);
  assert.equal(a.runId, run.runId);
  assert.equal(run.spentUsd, 0.25, "the reservation stays the spend / cap figure");
  assert.equal(monthSpendUsd(entries, JULY()), 0.25, "an actual line is never added to month spend");
  assert.equal(guard.monthSpend(), 0.25);
});

test("p1-ollama-actual-tokens: missing / negative / fractional / non-finite / string figures are recorded as 'unreported' with the reservation, never zero", () => {
  const bad: Record<string, unknown>[] = [
    {},
    { inputTokens: 10 },
    { inputTokens: 10, outputTokens: 5 },
    { inputTokens: -1, outputTokens: 5, usd: 0.1 },
    { inputTokens: 10, outputTokens: -5, usd: 0.1 },
    { inputTokens: 1.5, outputTokens: 5, usd: 0.1 },
    { inputTokens: "10", outputTokens: 5, usd: 0.1 },
    { inputTokens: 10, outputTokens: 5, usd: -0.1 },
    { inputTokens: 10, outputTokens: 5, usd: Number.NaN },
    { inputTokens: 10, outputTokens: Number.POSITIVE_INFINITY, usd: 0.1 },
  ];
  for (const figures of bad) {
    const ledgerPath = tmpLedger();
    const run = new BudgetGuard({ ledgerPath, now: JULY }).startRun({ runner: "run-probes" });
    run.charge(0.5);
    run.recordActual({ reservedUsd: 0.5, ...figures } as never);
    const a = readLedger(ledgerPath).find((e) => e.kind === "actual")!;
    assert.equal(a.actual, "unreported", JSON.stringify(figures));
    assert.equal(a.actualInTokens, undefined, JSON.stringify(figures));
    assert.equal(a.actualOutTokens, undefined, JSON.stringify(figures));
    assert.equal(a.actualUsd, undefined, JSON.stringify(figures));
    assert.equal(a.reservedUsd, 0.5, "the reservation figure is kept");
    assert.deepEqual(run.usageSummary(), {
      reportedCalls: 0,
      unreportedCalls: 1,
      actualInTokens: 0,
      actualOutTokens: 0,
      actualUsd: 0,
      unreportedReservedUsd: 0.5,
    });
  }
});

test("p1-ollama-actual-tokens: usageSummary sums reported calls and keeps unreported reservations separate", () => {
  const run = new BudgetGuard({ ledgerPath: tmpLedger(), now: JULY }).startRun({ runner: "run-latency" });
  run.charge(1);
  run.recordActual({ reservedUsd: 1, inputTokens: 100, outputTokens: 40, usd: 0.01 });
  run.charge(1);
  run.recordActual({ reservedUsd: 1, inputTokens: 50, outputTokens: 10, usd: 0.005 });
  run.charge(2);
  run.recordActual({ reservedUsd: 2 });
  assert.deepEqual(run.usageSummary(), {
    reportedCalls: 2,
    unreportedCalls: 1,
    actualInTokens: 150,
    actualOutTokens: 50,
    actualUsd: 0.015,
    unreportedReservedUsd: 2,
  });
});

test("p1-ollama-actual-tokens: a corrupt actual line (bad figures, unknown actual flag, no reservation) fails closed like a corrupt charge", () => {
  const base = { ts: "2026-07-15T10:00:00Z", runId: "r", runner: "x", kind: "actual" };
  for (const line of [
    { ...base, actual: "reported", actualInTokens: -1, actualOutTokens: 1, actualUsd: 0, reservedUsd: 1 },
    { ...base, actual: "reported", actualInTokens: 1, actualOutTokens: 1.5, actualUsd: 0, reservedUsd: 1 },
    { ...base, actual: "reported", actualInTokens: 1, actualOutTokens: 1, reservedUsd: 1 },
    { ...base, actual: "maybe", reservedUsd: 1 },
    { ...base, actual: "unreported" },
  ]) {
    const ledgerPath = tmpLedger();
    writeFileSync(ledgerPath, `${JSON.stringify(line)}\n`, "utf-8");
    assert.throws(() => readLedger(ledgerPath), /ledger/i, JSON.stringify(line));
  }
  const ok = tmpLedger();
  writeFileSync(ok, `${JSON.stringify({ ...base, actual: "unreported", reservedUsd: 1 })}\n`, "utf-8");
  assert.equal(readLedger(ok).length, 1);
});

test("p1-ollama-actual-tokens: a tiny recorded actual does not free headroom under the reservation cap", () => {
  const ledgerPath = tmpLedger();
  const guard = new BudgetGuard({ ledgerPath, now: JULY });
  const run = guard.startRun({ runner: "run-h2h" });
  run.charge(40);
  run.recordActual({ reservedUsd: 40, inputTokens: 1, outputTokens: 1, usd: 0.000005 });
  assert.throws(() => run.charge(10.01), BudgetExceededError);
});

test("p1-ollama-actual-tokens: if the actual line cannot be appended, recordActual rethrows but the run still tallies the call as unreported with its reservation (never lost, never zero, never re-charged)", () => {
  const ledgerPath = tmpLedger();
  const guard = new BudgetGuard({ ledgerPath, now: JULY });
  const run = guard.startRun({ runner: "run-kb" });
  run.charge(0.5);
  const real = guard.recordActual.bind(guard);
  (guard as unknown as { recordActual: () => void }).recordActual = () => {
    throw new Error("EIO");
  };
  assert.throws(() => run.recordActual({ reservedUsd: 0.5, inputTokens: 10, outputTokens: 2, usd: 0.001 }), /EIO/);
  (guard as unknown as { recordActual: typeof real }).recordActual = real;
  assert.deepEqual(run.usageSummary(), { reportedCalls: 0, unreportedCalls: 1, actualInTokens: 0, actualOutTokens: 0, actualUsd: 0, unreportedReservedUsd: 0.5 });
  assert.equal(readLedger(ledgerPath).filter((e) => e.kind === "charge").length, 1, "exactly one charge line, no re-charge");
  assert.equal(run.spentUsd, 0.5);
});

test("p1-ollama-actual-tokens: a torn trailing actual line (process killed mid-append) makes readLedger fail closed, like any corrupt line; the operator repairs the file before the next run", () => {
  const ledgerPath = tmpLedger();
  const run = new BudgetGuard({ ledgerPath, now: JULY }).startRun({ runner: "run-kb" });
  run.charge(1);
  assert.equal(readLedger(ledgerPath).length, 2);
  appendFileSync(ledgerPath, '{"ts":"2026-07-15T10:00:00.000Z","runId":"r","runner":"run-kb","kind":"actual","actual":"repor', "utf-8");
  assert.throws(() => readLedger(ledgerPath), /ledger .*is corrupt/);
  assert.throws(() => new BudgetGuard({ ledgerPath, now: JULY }).startRun({ runner: "run-kb" }), /is corrupt/, "the next run refuses rather than undercount");
});
