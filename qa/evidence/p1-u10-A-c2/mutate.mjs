// Checker A (cycle 2) single-edit falsification runner. Mutates ONLY D:/vc/.worktrees/p1-u10-A-fals/apps/api/src/voice.ts; restores after every run.
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
const S = "D:/vc/.worktrees/p1-u10-A-fals";
const FILE = `${S}/apps/api/src/voice.ts`;
const OUT = process.argv[2];
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const defs = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const pristine = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(`${OUT}/voice.ts.pristine`, pristine);
const FILES = "tests/voice.test.ts tests/voice-limits.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/zz-a-probe.test.ts";
function run(id) {
  return new Promise((resolve) => {
    const log = `${OUT}/${id}.log`;
    const out = fs.openSync(log, "w");
    const p = spawn("bash", ["D:/vc/scripts/vc-testlock.sh", "pnpm", "-C", `${S}/apps/api`, "exec", "tsx", "--test", ...FILES.split(" ")], { stdio: ["ignore", out, out], env: { ...process.env, VC_TESTLOCK_TIMEOUT_SECS: "7200" } });
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"]); }, 200_000);
    p.on("exit", () => { clearTimeout(t); fs.closeSync(out); resolve(timedOut); });
  });
}
const summary = [];
for (const d of defs) {
  if (only && !only.has(d.id)) continue;
  let text = pristine;
  let n;
  if (d.re) { const re = new RegExp(d.re, "g"); n = (text.match(re) || []).length; if (n === 1) text = text.replace(new RegExp(d.re), () => d.replace); }
  else { n = text.split(d.find).length - 1; if (n === 1) text = text.replace(d.find, () => d.replace); }
  if (n !== 1) { summary.push({ id: d.id, what: d.what, result: `NOMATCH(${n})` }); console.log(d.id, "NOMATCH", n); continue; }
  fs.writeFileSync(FILE, text);
  const timedOut = await run(d.id);
  fs.writeFileSync(FILE, pristine);
  const log = fs.readFileSync(`${OUT}/${d.id}.log`, "utf8");
  const fail = Number((log.match(/ℹ fail (\d+)/) || [])[1] ?? NaN);
  const pass = Number((log.match(/ℹ pass (\d+)/) || [])[1] ?? NaN);
  const failing = [...new Set([...log.matchAll(/^\s*✖ ([^\n(]+)/gm)].map((m) => m[1].trim().slice(0, 90)))];
  const res = timedOut ? "RED(hang/timeout)" : fail > 0 ? `RED(${fail} fail)` : Number.isNaN(fail) ? "RED(no summary)" : "SURVIVES";
  summary.push({ id: d.id, what: d.what, result: res, pass, fail, failing: failing.slice(0, 6) });
  console.log(d.id, res, failing.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
}
fs.writeFileSync(FILE, pristine);
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
fs.writeFileSync(`${OUT}/done`, "done");
