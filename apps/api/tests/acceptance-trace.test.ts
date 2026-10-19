/**
 * P1 U12 acceptance (spec v8): the traceability matrix `qa/evidence/p1-u12/trace.md` must name only things that exist.
 * Re-runnable: fails if a row names a test file that is missing, a `pnpm --filter` script that is missing, an unknown status, or if a
 * spec criterion is absent from the table. Rows marked PENDING-INTEGRATION are exempt from the file check ONLY if their note names the branch.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TRACE = join(ROOT, "qa/evidence/p1-u12/trace.md");
const REQUIRED = [
  "A1", "A2a", "A2b", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A9b", "A10", "A11", "A11b", "A12", "A13", "A14",
  "A15a", "A15b", "A15c", "A16", "A16b", "A17", "A18", "A19", "A20", "A21", "A22", "A23", "A24",
];
const STATUSES = new Set(["PASS", "NOT PROVEN", "PENDING-INTEGRATION", "OUT-OF-SCOPE-REAL"]);

interface Row { id: string; cls: string; command: string; files: string[]; status: string; note: string }

export function parseTrace(md: string): Row[] {
  const rows: Row[] = [];
  for (const line of md.split(/\r?\n/)) {
    if (!/^\|\s*A\d/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 6, `trace row must have 6 columns: ${line.slice(0, 60)}`);
    const [id, cls, command, files, status, note] = cells as [string, string, string, string, string, string];
    rows.push({
      id,
      cls,
      command: command.replace(/`/g, ""),
      files: [...files.matchAll(/`([^`]+)`/g)].map((m) => m[1]!),
      status,
      note,
    });
  }
  return rows;
}

function packageIndex(): Map<string, { dir: string; scripts: Record<string, string> }> {
  const index = new Map<string, { dir: string; scripts: Record<string, string> }>();
  for (const group of ["apps", "packages", "mcp"]) {
    for (const entry of readdirSync(join(ROOT, group), { withFileTypes: true })) {
      const pkg = join(ROOT, group, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(pkg)) continue;
      const json = JSON.parse(readFileSync(pkg, "utf8")) as { name: string; scripts?: Record<string, string> };
      index.set(json.name, { dir: join(group, entry.name), scripts: json.scripts ?? {} });
    }
  }
  return index;
}

const rows = parseTrace(readFileSync(TRACE, "utf8"));
const packages = packageIndex();

test("trace covers every criterion of the spec exactly once, with a known status", () => {
  assert.deepEqual(rows.map((r) => r.id).sort(), [...REQUIRED].sort());
  for (const r of rows) assert.ok(STATUSES.has(r.status), `${r.id}: unknown status ${JSON.stringify(r.status)}`);
});

test("every test file a trace row names exists in the repo, and a PASS row names at least one", () => {
  for (const r of rows) {
    if (r.status === "PENDING-INTEGRATION") continue;
    if (r.status === "PASS") assert.ok(r.files.length >= 1, `${r.id}: PASS with no test file`);
    for (const f of r.files) assert.ok(existsSync(join(ROOT, f)), `${r.id}: missing test file ${f}`);
  }
});

test("every `pnpm --filter <pkg> <script>` command names a real package and a real script", () => {
  for (const r of rows) {
    if (r.status === "PENDING-INTEGRATION") continue;
    const m = /^pnpm --filter (\S+) (\S+)$/.exec(r.command);
    assert.ok(m, `${r.id}: command is not a pnpm --filter command: ${r.command}`);
    const pkg = packages.get(m![1]!);
    assert.ok(pkg, `${r.id}: unknown package ${m![1]}`);
    assert.ok(pkg!.scripts[m![2]!], `${r.id}: package ${m![1]} has no script ${m![2]}`);
  }
});

test("a PENDING-INTEGRATION row must name the branch that carries the proof; a NOT PROVEN or REAL row never claims files as proof", () => {
  for (const r of rows) {
    if (r.status === "PENDING-INTEGRATION") assert.match(r.note, /branch `p1\/u\d+b?`/, `${r.id}: note must name the branch`);
    if (r.status === "OUT-OF-SCOPE-REAL") assert.equal(r.cls, "REAL", `${r.id}: only REAL criteria may be out of scope`);
  }
});
