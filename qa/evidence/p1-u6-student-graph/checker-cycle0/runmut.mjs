import { readFileSync, writeFileSync, copyFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root = process.argv[2]; // .../copy/packages/engine
const muts = JSON.parse(readFileSync(process.argv[3], "utf8"));
const only = process.argv[4];
const bak = root + "/.srcbak";
rmSync(bak, { recursive: true, force: true });
cpSync(join(root, "src"), bak, { recursive: true });
const restore = () => { rmSync(join(root, "src"), { recursive: true, force: true }); cpSync(bak, join(root, "src"), { recursive: true }); };
for (const m of muts) {
  if (only && m.id !== only) continue;
  let applied = true;
  for (const [file, find, rep] of m.edits) {
    const p = join(root, file);
    const s = readFileSync(p, "utf8");
    if (!s.includes(find)) { applied = false; console.log(`${m.id} NOT-APPLIED (${file}: ${find.slice(0, 50)})`); break; }
    writeFileSync(p, s.replace(find, rep));
  }
  if (applied) {
    const r = spawnSync("bash", ["D:/vc/scripts/vc-testlock.sh", "pnpm", "exec", "tsx", "--test", process.env.TESTF ?? "tests/chk-u6.test.ts"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
    const out = r.stdout + r.stderr;
    const fail = /ℹ fail (\d+)/.exec(out)?.[1] ?? "?";
    const pass = /ℹ pass (\d+)/.exec(out)?.[1] ?? "?";
    const first = (out.match(/^\s*✖ (.+?) \(/m) ?? [])[1] ?? "";
    console.log(`${m.id} [${m.crit}] ${Number(fail) > 0 || fail === "?" ? "KILLED" : "SURVIVED"} fail=${fail} pass=${pass} first="${first.slice(0, 90)}"`);
  }
  restore();
}
