/**
 * P1 U5a, criterion A20 (G-PROD): the go-live gate. Nothing student-facing may be switched on (authenticated
 * chat routes, the public anonymous route, the voice flag) and the contract may not be published to partners
 * unless qa/gates holds, as human-written records in the formats U0 created (qa/gates/g-prod.md etc.):
 *
 *   - `B13-signed: SIGNED <ISO instant> by <approver>` in p1-u0-amendment-signatures.md (PENDING or anything else refuses;
 *     the approver must be a capitalised personal name, never a role word, and must equal `approver` / VC_GATE_APPROVER when set),
 *   - an `Answered: <ISO> - <option> - ...` line in g-publish.md and g-prod.md (the LAST such line counts; a
 *     "hold" option refuses; g-prod's option also scopes what may go live: a = authenticated text, b = plus the
 *     anonymous route, c = plus voice, d = hold),
 *   - `Nights-mode: funded | tele-manas-disclosed` in nights.md (the interim mode counts, spec A20),
 *   - and, for voice only, a passing A10 report record (a10-voice-gate.md, pointing at an existing qa/evidence file), or, in its place,
 *     the owner's recorded risk acceptance `Owner-override: <ISO instant> - <owner> - D-111` (pc-voice V1); the gate output then says
 *     "A10 OVERRIDDEN by owner (D-111)". Without that line a record that is not `Result: PASS` still refuses.
 *     The override is fail closed: it applies only when the repo approver is configured (`approver` / VC_GATE_APPROVER) and the signer equals
 *     it exactly; with none configured it is refused ("Owner-override needs VC_GATE_APPROVER (the repo approver) to be set"), so A10 stays FAIL.
 *
 * Targets: student-routes, anonymous, voice need B13, g-publish, g-prod and Nights (g-prod.md precondition 3);
 * anonymous additionally needs g-prod option b or c, voice needs option c and A10. publish needs B13, an
 * answered g-publish (option a or b) and Nights (g-publish.md preconditions). Today B13 is PENDING and both
 * gates are unanswered, so every target is refused.
 *
 * This module only READS gate files. A file check cannot prove a human wrote a line (the maker could type it),
 * so the files stay under the checker/Approver process; this script is the executable refusal, not an identity proof.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const GO_LIVE_TARGETS = ["student-routes", "anonymous", "voice", "publish"] as const;
export type GoLiveTarget = (typeof GO_LIVE_TARGETS)[number];

/** Gate record file names, relative to qa/gates. */
export const GATE_FILES = {
  b13: "p1-u0-amendment-signatures.md",
  gPublish: "g-publish.md",
  gProd: "g-prod.md",
  nights: "nights.md",
  a10: "a10-voice-gate.md",
} as const;

/** Environment variable naming the repo Approver; when set, the B13 signer must equal it (no name is hard-coded here). */
export const GATE_APPROVER_ENV = "VC_GATE_APPROVER";
const ROLE_WORDS = /^(the |a |an )?(maker|checker|claude|agent|bot|assistant|ai|system|pending|unknown|none|todo)(?![a-z])/i;
export const NIGHTS_MODES = ["funded", "tele-manas-disclosed"] as const;

const MAX_GATE_FILE_BYTES = 64 * 1024;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface GoLiveResult {
  target: GoLiveTarget;
  allowed: boolean;
  /** One line per unmet record, naming the file and why. */
  failures: string[];
  /** Records that were satisfied. */
  satisfied: string[];
  /** pc-voice V1: records satisfied by a recorded owner override instead of a pass, as `<file>: <note>` (empty unless an override was used). */
  overridden: string[];
}

export class GoLiveRefusedError extends Error {
  constructor(readonly result: GoLiveResult) {
    super(`go-live refused for ${result.target}: ${result.failures.join("; ")}`);
    this.name = "GoLiveRefusedError";
  }
}

/** Lines outside fenced blocks. Quoted (`>`), indented and mid-line text never matches a key-at-line-start pattern. */
function liveLines(text: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) out.push(line);
  }
  return out;
}

/** The values of every `Key: value` line that starts at column 0 (the whole line may be wrapped in one pair of backticks, as U0 wrote B13-signed). */
function keyValues(lines: string[], key: string): string[] {
  const re = new RegExp("^`?" + key + ": ([^`]*[^\\s`])`?\\s*$");
  const out: string[] = [];
  for (const line of lines) {
    const m = re.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** The single value of a key, or null when the key is absent or repeated. */
function onlyValue(lines: string[], key: string): string | null {
  const v = keyValues(lines, key);
  return v.length === 1 ? v[0] : null;
}

const ISO_INSTANT = "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2})";

/** A full ISO 8601 instant with an explicit zone, not in the future. */
function validInstant(value: string | null | undefined, now: Date): boolean {
  if (value === null || value === undefined || !new RegExp(`^${ISO_INSTANT}$`).test(value)) return false;
  const t = Date.parse(value);
  return Number.isFinite(t) && t <= now.getTime() + FUTURE_SKEW_MS;
}

interface Ctx {
  now: Date;
  gatesDir: string;
  approver: string | undefined;
}
/** null = satisfied; a string = the reason it is not; `{ note }` = satisfied by a recorded owner override (the note is shown in the gate output). */
type Checker = (lines: string[], ctx: Ctx) => string | null | { note: string };

const b13Signed: Checker = (lines, { now, approver }) => {
  const v = onlyValue(lines, "B13-signed");
  if (v === null) return "B13-signed line missing or repeated";
  const m = new RegExp(`^SIGNED (${ISO_INSTANT}) by (\\p{Lu}[\\p{L} .'-]{1,40})$`, "u").exec(v);
  if (!m) return `B13-signed is not "SIGNED <ISO instant> by <approver name>" (found "${v.slice(0, 40)}")`;
  if (ROLE_WORDS.test(m[2])) return "B13-signed signer is a role, not a person";
  if (approver !== undefined && approver !== "" && m[2] !== approver) return "B13-signed signer is not the repo approver";
  return validInstant(m[1], now) ? null : "B13-signed instant is in the future";
};

/** `Answered: <ISO> - <option letter> ...`: the separator may be a hyphen, en dash, em dash or two hyphens. */
const ANSWER = new RegExp(`^(${ISO_INSTANT}) (?:\\u2014|\\u2013|--|-) \\(?([A-Za-z])\\)?(?:[ :.,)\\u2014-]|$)`);

/** Which option letters of a gate mean "go". The LAST Answered line counts (the file is append-only). */
function answered(go: readonly string[]): Checker {
  return (lines, { now }) => {
    const all = keyValues(lines, "Answered");
    if (all.length === 0) return "no Answered line (gate still open)";
    const last = all[all.length - 1];
    const m = ANSWER.exec(last);
    if (!m) return `last Answered line is not "<ISO instant> - <option letter> ..." (found "${last.slice(0, 50)}")`;
    if (!validInstant(m[1], now)) return "Answered instant is in the future or invalid";
    const option = m[2].toLowerCase();
    return go.includes(option) ? null : `Answered option "${option}" is not a go (accepted: ${go.join(", ")})`;
  };
}

const nights: Checker = (lines) => {
  const v = onlyValue(lines, "Nights-mode");
  if (v === null) return "Nights-mode line missing or repeated";
  return (NIGHTS_MODES as readonly string[]).includes(v) ? null : `Nights-mode is not one of ${NIGHTS_MODES.join(" | ")}`;
};

/** pc-voice V1 (D-111): the decision an A10 owner override must cite, and the words the gate output carries when it is used. */
export const A10_OVERRIDE_DECISION = "D-111";
export const A10_OVERRIDE_NOTE = `A10 OVERRIDDEN by owner (${A10_OVERRIDE_DECISION})`;
const OVERRIDE_RE = new RegExp(`^(${ISO_INSTANT}) (?:\\u2014|\\u2013|--|-) (\\p{Lu}[\\p{L} .'-]{1,40}?) (?:\\u2014|\\u2013|--|-) ${A10_OVERRIDE_DECISION}$`, "u");

/**
 * `Owner-override: <ISO instant> - <owner name> - D-111` (em dash in the record). Valid when it appears exactly once at the start of a live line, the
 * instant is a real past instant, the signer is a personal name (never a role) equal to the configured repo approver, and the decision is D-111.
 * Fail closed: with no approver configured (VC_GATE_APPROVER unset or empty, none passed) the override is refused, never "any personal name" and
 * never a name hard-coded here (the B21 scanner in auth.test.ts forbids one).
 * Like B13-signed this is an executable refusal, not an identity proof: the file stays under the Approver's process.
 */
function ownerOverrideProblem(lines: string[], { now, approver }: Ctx): string | null {
  const v = onlyValue(lines, "Owner-override");
  if (v === null) return "no single Owner-override line";
  if (approver === undefined || approver === "") return "Owner-override needs VC_GATE_APPROVER (the repo approver) to be set";
  const m = OVERRIDE_RE.exec(v);
  if (!m) return `Owner-override is not "<ISO instant> - <owner name> - ${A10_OVERRIDE_DECISION}" (found "${v.slice(0, 50)}")`;
  if (ROLE_WORDS.test(m[2]!)) return "Owner-override signer is a role, not a person";
  if (m[2] !== approver) return "Owner-override signer is not the repo approver";
  return validInstant(m[1]!, now) ? null : "Owner-override instant is in the future";
}

const a10: Checker = (lines, ctx) => {
  const { now, gatesDir } = ctx;
  if (onlyValue(lines, "Result") !== "PASS") {
    // D-111: the owner accepted the A10 risk; a valid owner-override line stands in for `Result: PASS` (and its Run-at / Evidence lines).
    const override = ownerOverrideProblem(lines, ctx);
    if (override === null) return { note: A10_OVERRIDE_NOTE };
    return keyValues(lines, "Owner-override").length > 0 ? `Result is not PASS, and ${override}` : "Result is not PASS";
  }
  if (!validInstant(onlyValue(lines, "Run-at"), now)) return "Run-at is not a valid past ISO 8601 instant with a zone";
  const evidence = onlyValue(lines, "Evidence");
  if (evidence === null || !/^qa\/evidence\/[^\s.]\S*$/.test(evidence) || evidence.includes("..")) {
    return "Evidence does not point at a qa/evidence/ report";
  }
  const file = join(dirname(dirname(gatesDir)), evidence);
  return existsSync(file) && statSync(file).isFile() ? null : `Evidence file ${evidence} does not exist`;
};

type Req = readonly [string, Checker];

/** Per-target requirements (see the file header). */
function requirements(target: GoLiveTarget): readonly Req[] {
  const b13: Req = [GATE_FILES.b13, b13Signed];
  const night: Req = [GATE_FILES.nights, nights];
  const publish = (go: readonly string[]): Req => [GATE_FILES.gPublish, answered(go)];
  const prod = (go: readonly string[]): Req => [GATE_FILES.gProd, answered(go)];
  switch (target) {
    case "student-routes":
      return [b13, publish(["a", "b"]), prod(["a", "b", "c"]), night];
    case "anonymous":
      return [b13, publish(["a", "b"]), prod(["b", "c"]), night];
    case "voice":
      return [b13, publish(["a", "b"]), prod(["c"]), night, [GATE_FILES.a10, a10]];
    case "publish":
      return [b13, publish(["a", "b"]), night];
    default:
      throw new Error(`unknown go-live target: ${String(target)}`);
  }
}

export function evaluateGoLive(
  gatesDir: string,
  target: GoLiveTarget,
  now: Date = new Date(),
  approver: string | undefined = process.env[GATE_APPROVER_ENV],
): GoLiveResult {
  const failures: string[] = [];
  const satisfied: string[] = [];
  const overridden: string[] = [];
  for (const [file, check] of requirements(target)) {
    const path = join(gatesDir, file);
    let problem: string | null;
    let note: string | undefined;
    try {
      if (!existsSync(path)) problem = "missing";
      else if (!statSync(path).isFile()) problem = "not a regular file";
      else if (statSync(path).size > MAX_GATE_FILE_BYTES) problem = `larger than ${MAX_GATE_FILE_BYTES} bytes`;
      else {
        const out = check(liveLines(readFileSync(path, "utf8")), { now, gatesDir, approver });
        if (out !== null && typeof out === "object") {
          problem = null;
          note = out.note;
        } else problem = out;
      }
    } catch (error) {
      problem = `unreadable (${error instanceof Error ? error.name : "error"})`;
    }
    if (problem === null) {
      satisfied.push(file);
      if (note !== undefined) overridden.push(`${file}: ${note}`);
    } else failures.push(`${file}: ${problem}`);
  }
  return { target, allowed: failures.length === 0, failures, satisfied, overridden };
}

/** Throws GoLiveRefusedError unless every record for `target` is present and valid. Call before enabling a route. */
export function assertGoLive(
  gatesDir: string,
  target: GoLiveTarget,
  now: Date = new Date(),
  approver: string | undefined = process.env[GATE_APPROVER_ENV],
): GoLiveResult {
  const result = evaluateGoLive(gatesDir, target, now, approver);
  if (!result.allowed) throw new GoLiveRefusedError(result);
  return result;
}

export function formatGoLiveReport(result: GoLiveResult): string {
  const lines = [`go-live gate (A20) target=${result.target}: ${result.allowed ? "ALLOWED" : "REFUSED"}`];
  for (const f of result.satisfied) lines.push(`  ok       ${f}`);
  for (const o of result.overridden) lines.push(`  NOTE     ${o}`);
  for (const f of result.failures) lines.push(`  MISSING  ${f}`);
  return lines.join("\n");
}
