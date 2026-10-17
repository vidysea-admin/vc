/**
 * P1 U6, spec A21(c) / contract B1(d): skills/vc-capabilities/SKILL.md is the single list of tools and
 * features given to the model; every tool registered in the student graph appears in it and vice versa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSkills } from "../src/index.js";
import { STUDENT_TOOLS, buildStudentGraph, parseCapabilityManifest } from "../src/student/graph.js";
import { NOW, NO_PRIOR_FLAG, SKILLS_DIR, SPEAKERS, fakeKb, studentProvider } from "./student-fixtures.js";

test("A21(c): manifest tools == registered student-graph tools (drift check, both directions)", () => {
  const body = readFileSync(join(SKILLS_DIR, "vc-capabilities", "SKILL.md"), "utf8");
  const manifest = parseCapabilityManifest(body);
  const registered = STUDENT_TOOLS.map((t) => t.name).sort();
  assert.deepEqual([...manifest].sort(), registered);
});

test("A21(c): both new skills load through the existing skill loader", () => {
  const names = listSkills(SKILLS_DIR).map((s) => s.name);
  assert.ok(names.includes("vc-capabilities"));
  assert.ok(names.includes("kb-answer"));
});

test("A21(c): building the graph against a drifted manifest fails loudly (a missing or an extra tool)", () => {
  const original = readFileSync(join(SKILLS_DIR, "vc-capabilities", "SKILL.md"), "utf8");
  const mk = (mutate: (s: string) => string) => {
    const dir = mkdtempSync(join(tmpdir(), "vc-manifest-"));
    cpSync(join(SKILLS_DIR, "vc-capabilities"), join(dir, "vc-capabilities"), { recursive: true });
    cpSync(join(SKILLS_DIR, "kb-answer"), join(dir, "kb-answer"), { recursive: true });
    writeFileSync(join(dir, "vc-capabilities", "SKILL.md"), mutate(original));
    return dir;
  };
  const deps = (skillsDir: string) => ({ kb: fakeKb(), provider: studentProvider(), skillsDir, speakers: SPEAKERS, now: () => NOW, hasPriorFlag: NO_PRIOR_FLAG });
  const missing = mk((s) => s.replace(/^\| `data_export` .*$/m, ""));
  assert.throws(() => buildStudentGraph(deps(missing)), /capability manifest/i);
  const extra = mk((s) => s.replace(/^\| `coverage` (.*)$/m, "| `coverage` $1\n| `send_whatsapp` | invented | nope |"));
  assert.throws(() => buildStudentGraph(deps(extra)), /capability manifest/i);
  assert.doesNotThrow(() => buildStudentGraph(deps(SKILLS_DIR)));
});
