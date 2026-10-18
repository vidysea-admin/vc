// Checker B falsification runner: one isolated copy per mutant, never the bound tree.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BOUND = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8";
const OUT = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8b-out";
const COPIES = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8b-copies";
const only = process.argv[2] ? new Set(process.argv[2].split(",")) : undefined;

const M = [
  { id: "B1", crit: "C1", pkg: "apps/api", file: "apps/api/src/chat.ts",
    find: `assertGoLive(route.gatesDir, "student-routes", route.now, route.approver);`, repl: ``,
    note: "A20 gate no longer asked", tests: ["tests/chat.test.ts", "tests/chat-profile.test.ts"] },
  { id: "B2", crit: "C2", pkg: "apps/api", file: "apps/api/src/auth.ts",
    find: `if (role !== STUDENT_ROLE) throw new AuthError("role");`, repl: ``,
    note: "role gate removed (any validly signed role accepted by student verifier)", tests: ["tests/student-auth.test.ts", "tests/chat.test.ts"] },
  { id: "B3", crit: "C3", pkg: "packages/db", file: "packages/db/src/chat-threads.ts",
    find: `if (existing === null || existing.requestHash !== input.requestHash) throw new ChatTurnConflictError();`,
    repl: `if (existing === null) throw new ChatTurnConflictError();`,
    note: "same turn id with other text no longer conflicts", tests: ["tests/chat-threads.test.ts"] },
  { id: "B4", crit: "C4", pkg: "apps/api", file: "apps/api/src/chat.ts",
    find: `turnId, text: redacted, requestHash: sha256(redacted), channel: "text" }`,
    repl: `turnId, text, requestHash: sha256(redacted), channel: "text" }`,
    note: "user turn stored unredacted", tests: ["tests/chat-privacy.test.ts"] },
  { id: "B5", crit: "C5", pkg: "apps/api", file: "apps/api/src/auth.ts",
    find: `const minor = p[names.isMinor] === true || underAge || !statedAdult;`,
    repl: `const minor = p[names.isMinor] === true || underAge;`,
    note: "unknown age treated as adult (fail open)", tests: ["tests/student-auth.test.ts", "tests/chat-privacy.test.ts", "tests/chat-profile.test.ts"] },
  { id: "B6", crit: "C6", pkg: "apps/api", file: "apps/api/src/chat.ts",
    find: `const confirmed = stored.filter((f) => f.status === "confirmed");`,
    repl: `const confirmed = stored;`,
    note: "proposed facts shown as in use", tests: ["tests/chat-profile.test.ts"] },
  { id: "B7", crit: "C7", pkg: "apps/api", file: "apps/api/src/chat.ts",
    find: String.raw`.check(` + "`${ctx.tenantId}\\u0000${ctx.studentId}`" + `)`,
    repl: String.raw`.check(` + "`${ctx.tenantId}`" + `)`,
    note: "limiter key is tenant only (students share a counter)", tests: ["tests/chat.test.ts"] },
  { id: "B8", crit: "C8", pkg: "apps/api", file: "apps/api/src/chat.ts",
    find: `if (matched.params.studentId !== ctx.studentId) return NOT_FOUND();`, repl: ``,
    note: "token student vs path student check removed", tests: ["tests/chat-privacy.test.ts", "tests/chat.test.ts"] },
  { id: "B9", crit: "C9", pkg: "apps/api", file: "apps/api/src/chat.ts",
    find: `hasPriorFlag: async (t) => (await listStudentFlags(db, { studentId: t.studentId, threadId: t.threadId })).length > 0,`,
    repl: `hasPriorFlag: async () => false,`,
    note: "prior-flag memory not read from the log", tests: ["tests/chat-privacy.test.ts", "tests/chat.test.ts"] },
  { id: "B10", crit: "C10", pkg: "packages/db", file: "packages/db/src/erasure.ts",
    find: `{ collection: COLLECTION_NAMES.student_flags, phase: 1, filter: byStudent, residue: byStudent },`, repl: ``,
    note: "erasure plan omits the flag log", tests: ["tests/student-store.test.ts", "tests/erasure.test.ts"] },
];

function stats(out) {
  const g = (k) => { const m = out.match(new RegExp(`^ℹ ${k} (\\d+)`, "m")); return m ? Number(m[1]) : null; };
  const failing = [...out.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]);
  return { tests: g("tests"), pass: g("pass"), fail: g("fail"), failing };
}
function run(copy, mu, label) {
  const tsx = `${BOUND}/${mu.pkg}/node_modules/tsx/dist/cli.mjs`;
  const r = spawnSync("node", [tsx, "--test", ...mu.tests], { cwd: `${copy}/${mu.pkg}`, encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  fs.writeFileSync(`${OUT}/falsify-${mu.id}-${label}.log`, out);
  return { exit: r.status, ...stats(out) };
}

fs.mkdirSync(COPIES, { recursive: true });
const results = [];
for (const mu of M) {
  if (only && !only.has(mu.id)) continue;
  const copy = `${COPIES}/${mu.id}`;
  fs.rmSync(copy, { recursive: true, force: true });
  fs.mkdirSync(copy, { recursive: true });
  execFileSync("bash", ["-c", `git -C "${BOUND}" archive HEAD | tar -x -C "${copy}"`]);
  // dependencies: the bound tree's node_modules via junctions (never written)
  fs.symlinkSync(`${BOUND}/node_modules`, `${copy}/node_modules`, "junction");
  for (const p of ["apps/api", "packages/db", "packages/schemas", "packages/engine", "packages/providers", "packages/observability"]) {
    if (fs.existsSync(`${BOUND}/${p}/node_modules`) && fs.existsSync(`${copy}/${p}`)) fs.symlinkSync(`${BOUND}/${p}/node_modules`, `${copy}/${p}/node_modules`, "junction");
  }
  const before = run(copy, mu, "green-before");
  const src = fs.readFileSync(`${copy}/${mu.file}`, "utf8");
  const n = src.split(mu.find).length - 1;
  if (n !== 1) { results.push({ id: mu.id, crit: mu.crit, error: `find matched ${n} times` }); continue; }
  fs.writeFileSync(`${copy}/${mu.file}`, src.replace(mu.find, () => mu.repl));
  const after = run(copy, mu, "red-after");
  // restore proof: re-write the original and confirm byte-identity with the bound tree
  fs.writeFileSync(`${copy}/${mu.file}`, src);
  const norm = (p) => fs.readFileSync(p, "utf8").replace(/\r/g, "");
  const restored = norm(`${copy}/${mu.file}`) === norm(`${BOUND}/${mu.file}`);
  results.push({ id: mu.id, crit: mu.crit, note: mu.note, file: mu.file, before, after, restored });
  console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync(`${OUT}/falsify-summary${only ? "-" + [...only].join("_") : ""}.json`, JSON.stringify(results, null, 2));
