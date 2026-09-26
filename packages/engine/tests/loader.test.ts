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

// ISS-022 — loadSkill must refuse any name that is not /^[a-z0-9][a-z0-9-]*$/, and must verify the
// resolved skill path stays inside resolve(dir), path.sep-aware.
test("ISS-022: loadSkill throws on a '../' path-traversal name", () => {
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, "../x"));
});

test("ISS-022: loadSkill throws on a '..\\\\' (backslash) path-traversal name", () => {
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, "..\\x"));
});

test("ISS-022: loadSkill throws on a nested traversal name 'a/../../b'", () => {
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, "a/../../b"));
});

test("ISS-022: loadSkill throws on an absolute path name", () => {
  const absoluteName = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc/passwd";
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, absoluteName));
});

test("ISS-022: loadSkill throws on an empty name", () => {
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, ""));
});

test("ISS-022: loadSkill throws on an uppercase name", () => {
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, "SKILL"));
});

test("ISS-022: loadSkill throws on a name containing NUL", () => {
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, "a\0b"));
});

test("ISS-022: loadSkill throws on a name containing a space", () => {
  assert.throws(() => loadSkill(REAL_SKILLS_DIR, "widen card"));
});

// ISS-022 isolating case: a traversal name that points at a REAL SKILL.md outside the skills dir
// (the loader's own test fixtures). `assert.throws()` alone is not discriminating here — even
// with the containment guard fully removed, `readFileSync` on the (still slash-containing, still
// nonexistent-as-a-direct-child) joined path would throw ENOENT for most hostile names anyway, so
// a bare "did it throw" assertion passes for the wrong reason and proves nothing. This asserts the
// specific rejection message the guard produces (before any filesystem access), which changes to
// a different message entirely if the guard is bypassed and the read is allowed to proceed.
test("ISS-022: rejection is the name-allowlist guard itself, not an incidental ENOENT", () => {
  assert.throws(
    () => loadSkill(REAL_SKILLS_DIR, "../packages/engine/tests/fixtures/skills-malformed/valid-one"),
    /Invalid skill name/,
  );
});

test("ISS-022: loadSkill still loads a valid name", () => {
  const body = loadSkill(REAL_SKILLS_DIR, "widen-card");
  assert.ok(body.length > 0);
});

// ISS-024 — the loader must throw a clear error on a YAML block-scalar value ('>' or '|') for
// name/description rather than silently storing the literal chomping character as the value.
test("ISS-024: loadSkill throws on a YAML block-scalar description ('description: >')", () => {
  assert.throws(() => loadSkill(MALFORMED_DIR, "block-scalar"));
});

test("ISS-024: loadSkill throws on a YAML block-scalar description ('description: |')", () => {
  assert.throws(() => loadSkill(MALFORMED_DIR, "block-scalar-pipe"));
});
