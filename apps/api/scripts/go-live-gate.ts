/**
 * A20 go-live gate CLI. Usage: tsx scripts/go-live-gate.ts [student-routes|anonymous|voice|publish] [--gates-dir <dir>]
 * Exit 0 = allowed, 1 = refused (names each missing record), 2 = bad usage. Read-only.
 */
import { fileURLToPath } from "node:url";
import { GO_LIVE_TARGETS, evaluateGoLive, formatGoLiveReport, type GoLiveTarget } from "../src/go-live-gate.js";

const args = process.argv.slice(2);
let gatesDir = fileURLToPath(new URL("../../../qa/gates", import.meta.url));
let target: GoLiveTarget = "student-routes";
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--gates-dir" && i + 1 < args.length) gatesDir = args[++i];
  else if ((GO_LIVE_TARGETS as readonly string[]).includes(a)) target = a as GoLiveTarget;
  else {
    console.error(`usage: go-live-gate [${GO_LIVE_TARGETS.join("|")}] [--gates-dir <dir>]`);
    process.exit(2);
  }
}
const result = evaluateGoLive(gatesDir, target);
console.log(formatGoLiveReport(result));
process.exit(result.allowed ? 0 : 1);
