import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u6b-chk";
const base = join(root, "copy");
const M = [
  ["C1 fit constant", "rank.ts", "if (norm(attr.value) === norm(f.value)) matched++;", "matched++;"],
  ["C2 no source ids", "rank.ts", "const sourceIds = uniqSorted(cited);", "const sourceIds: string[] = [];"],
  ["C2 facts not reported", "rank.ts", "if (weights.fit > 0) factsUsed = fit.used;", "factsUsed = [];"],
  ["C3 default vector", "rank-weights.ts", "cost: 0.25, scholarshipChance: 0.2", "cost: 0.3, scholarshipChance: 0.2"],
  ["C3 default name", "rank-weights.ts", 'export const DEFAULT_RANKING_PROFILE = "student-success";', 'export const DEFAULT_RANKING_PROFILE = "default";'],
  ["C4 name always default", "rank-weights.ts", "if (RANK_COMPONENTS.every(", "if (true || RANK_COMPONENTS.every("],
  ["C4 weights ignored", "rank.ts", "input.weights === undefined ? { ...DEFAULT_RANK_WEIGHTS } : input.weights", "{ ...DEFAULT_RANK_WEIGHTS }"],
  ["C5 no sign-in check", "rank.ts", 'typeof input.studentId !== "string" || input.studentId.trim().length === 0', "false"],
  ["C6 proposed accepted", "rank.ts", 'f.status === undefined || f.status === "confirmed"', "true"],
  ["C6 any source accepted", "rank.ts", "(PROFILE_FACT_SOURCES as readonly string[]).includes(f.source)", "true"],
  ["C6 pathlynks beats student", "rank.ts", 'prior.source === "pathlynks" && fact.source === "student-confirmed"', "false"],
  ["C7 NaN accepted", "rank.ts", "!Number.isFinite(m.value) || m.value < 0", "m.value < 0"],
  ["C7 out of range accepted", "rank.ts", "m.value < 0 || m.value > 1", "false"],
  ["C7 unsourced accepted", "rank.ts", "|| !known.has(m.sourceId)", ""],
  ["C7 insufficient scored 0", "rank.ts", "const ranked = missing.every((k) => weights[k] === 0);", "const ranked = true;"],
  ["C8 negative accepted", "rank-weights.ts", "if (v < 0) return", "if (false) return"],
  ["C8 unknown key accepted", "rank-weights.ts", "if (unknownKeys.length > 0) return", "if (false) return"],
  ["C8 zero vector accepted", "rank-weights.ts", "sum <= 0", "sum < 0"],
  ["C8 non-finite accepted", "rank-weights.ts", "typeof v !== \"number\" || !Number.isFinite(v)", 'typeof v !== "number"'],
  ["C8 no normalise", "rank-weights.ts", "normalised ? raw[i]! / sum : raw[i]!", "raw[i]!"],
];
const which = process.argv[2];
let i = 0;
for (const [name, file, from, to] of M) {
  i++;
  if (which && !name.startsWith(which)) continue;
  const dir = join(root, "mut");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(base, "src"), join(dir, "src"), { recursive: true });
  cpSync(join(base, "tests"), join(dir, "tests"), { recursive: true });
  copyFileSync(join(base, "package.json"), join(dir, "package.json"));
  copyFileSync(join(base, "tsconfig.json"), join(dir, "tsconfig.json"));
  spawnSync("cmd", ["/c", "mklink", "/J", join(dir, "node_modules").replace(/\//g, "\\"), join(base, "node_modules").replace(/\//g, "\\")]);
  const p = join(dir, "src/student", file);
  const t = readFileSync(p, "utf8");
  if (!t.includes(from)) { console.log(`${name}: PATTERN NOT FOUND`); continue; }
  writeFileSync(p, t.replace(from, to));
  const r = spawnSync(join(dir, "node_modules/.bin/tsx.cmd"), ["--test", "tests/rank.test.ts", "tests/hostile.test.ts"], { cwd: dir, encoding: "utf8", shell: true });
  const out = r.stdout + r.stderr;
  const fail = (out.match(/ℹ fail (\d+)/) || [])[1];
  const pass = (out.match(/ℹ pass (\d+)/) || [])[1];
  const firstFail = (out.match(/✖ ([^\n(]+)/) || [])[1];
  console.log(`${name}: pass=${pass} fail=${fail} ${fail === "0" ? "SURVIVED" : "killed"} first=${(firstFail || "").slice(0, 110)}`);
}
