import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const [eng, list] = process.argv.slice(2);
const muts = JSON.parse(readFileSync(list, "utf8"));
const tsx = join(eng, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
for (const [id, file, find, repl, test] of muts) {
  const p = join(eng, file); const orig = readFileSync(p, "utf8");
  if (!orig.includes(find)) { console.log(`${id}\tNOT-APPLIED\t${file}`); continue; }
  writeFileSync(p, orig.split(find).join(repl));
  const r = spawnSync(tsx, ["--test", test], { cwd: eng, encoding: "utf8", shell: true });
  writeFileSync(p, orig);
  const out = (r.stdout || "") + (r.stderr || "");
  const fail = (out.match(/^ℹ fail (\d+)/m) || [])[1]; const pass = (out.match(/^ℹ pass (\d+)/m) || [])[1];
  const first = (out.match(/^✖ (?!failing)(.+?) \(\d/m) || [])[1] || (out.match(/Error[^\n]*/) || [""])[0];
  console.log(`${id}\t${Number(fail) > 0 ? "KILLED" : "SURVIVED"}\tpass=${pass} fail=${fail}\t${test}\tfirst=${first.slice(0, 140)}`);
}
