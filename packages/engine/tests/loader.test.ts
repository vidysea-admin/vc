import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { listSkills, loadSkill } from "../src/skills/loader.js";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
// packages/engine/tests -> packages/engine -> packages -> repo root -> skills
const REAL_SKILLS_DIR = join(TESTS_DIR, "..", "..", "..", "skills");
const MALFORMED_DIR = join(TESTS_DIR, "fixtures", "skills-malformed");

const EXPECTED_SKILL_NAMES = [
  "widen-card",
  "challenge-card",
  "compare-card",
  "evidence-card",
  "clarify-card",
  "fact-extraction",
  "session-summary",
  "profile-diff",
  "verifier",
  "safety-escalation",
].sort();

test("listSkills finds all 10 real skills", () => {
  const skills = listSkills(REAL_SKILLS_DIR);
  const names = skills.map((s) => s.name).sort();
  assert.deepEqual(names, EXPECTED_SKILL_NAMES);
});

test("listSkills: every skill's frontmatter name matches its folder name", () => {
  const skills = listSkills(REAL_SKILLS_DIR);
  for (const skill of skills) {
    assert.match(skill.path, new RegExp(`${skill.name}[\\\\/]SKILL\\.md$`));
  }
});

test("listSkills: every skill has a non-empty description", () => {
  const skills = listSkills(REAL_SKILLS_DIR);
  for (const skill of skills) {
    assert.ok(skill.description.length > 0, `${skill.name} has an empty description`);
  }
});

test("loadSkill returns the body (progressive disclosure) for every real skill", () => {
  for (const name of EXPECTED_SKILL_NAMES) {
    const body = loadSkill(REAL_SKILLS_DIR, name);
    assert.ok(body.length > 0);
    assert.ok(!body.startsWith("---"), `${name} body should not include the frontmatter block`);
  }
});

test("loadSkill throws when SKILL.md has no frontmatter", () => {
  assert.throws(() => loadSkill(MALFORMED_DIR, "no-frontmatter"));
});

test("loadSkill throws when the frontmatter name does not match the folder name", () => {
  assert.throws(() => loadSkill(MALFORMED_DIR, "name-mismatch"));
});

test("loadSkill succeeds for a well-formed fixture skill", () => {
  const body = loadSkill(MALFORMED_DIR, "valid-one");
  assert.match(body, /Purpose/);
});

test("listSkills throws when the directory contains a malformed skill", () => {
  assert.throws(() => listSkills(MALFORMED_DIR));
});
