/**
 * Skill loader (contract B6 / D-005 / ARCHITECTURE.md H5).
 *
 * Prompts and soft rules live as `SKILL.md` files under `skills/<name>/`, loaded on demand rather than
 * hardcoded into TypeScript — this keeps them portable and swappable across model providers, and lets a
 * graph node read only the metadata it needs to pick a skill (`listSkills`) before paying the cost of
 * loading its full body (`loadSkill`) — progressive disclosure, not "load everything up front".
 *
 * The frontmatter parser here is hand-written on purpose: this package adds no npm dependency (parallel
 * work units are touching pnpm-lock.yaml). It supports exactly what these skill files use — a `---`
 * delimited block of single-line `key: value` pairs, optionally quoted — not the full YAML spec.
 */
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

interface ParsedSkill {
  frontmatter: Record<string, string>;
  body: string;
}

const FRONTMATTER_DELIM = "---";

// ISS-022: loadSkill's `name` comes from a caller-chosen value (a graph node's own picks, not a
// fixed enum), so it must be treated as untrusted input. A name outside this shape can never
// resolve to anything but a single subfolder of `dir`.
const SAFE_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

// ISS-024: a bare YAML block-scalar indicator (optionally followed by a chomping/indentation
// modifier — "-", "+", or a digit) as the entire value of a `key: value` line. This hand-written
// parser only understands single-line values, so `description: >` would otherwise silently store
// the literal ">" instead of the multi-line body that follows it.
const BLOCK_SCALAR_VALUE = /^[|>][+-]?\d*$/;
const BLOCK_SCALAR_KEYS = new Set(["name", "description"]);

/**
 * Resolves `name` to a subfolder of `dir`, refusing anything that is not a bare, lowercase,
 * hyphenated skill-folder name (ISS-022). Two independent checks, deliberately redundant: the
 * regex allowlist rejects every hostile shape outright (no `/`, `\`, `..`, empty string, NUL,
 * whitespace, uppercase), and the resolved-path containment check is a second, path.sep-aware
 * line of defence against any future loosening of that regex.
 */
function resolveSkillDir(dir: string, name: string): string {
  if (!SAFE_SKILL_NAME.test(name)) {
    throw new Error(`Invalid skill name "${name}" — must match ${SAFE_SKILL_NAME}`);
  }

  const base = resolve(dir);
  const skillDir = resolve(dir, name);
  if (skillDir !== base && !skillDir.startsWith(base + sep)) {
    throw new Error(`Skill name "${name}" resolves outside the skills directory "${dir}"`);
  }

  assertRealPathContained(dir, join(skillDir, "SKILL.md"));
  return skillDir;
}

/**
 * ISS-t-005c-c0-4: the lexical resolve()/startsWith() check above cannot see a symlink (or a
 * Windows junction) — a skill folder named "escape-hatch" that is really a link to a directory
 * outside the skills root passes it, and readFileSync then follows the link. This resolves BOTH
 * the skills root and the target file through realpathSync (following every link on the way) and
 * refuses the target unless its real path is still inside the real root. Checking the SKILL.md
 * file itself, not only its folder, also catches a SKILL.md that is a file symlink to elsewhere.
 * A missing file surfaces as the usual ENOENT from realpathSync.
 */
function assertRealPathContained(dir: string, target: string): void {
  const realBase = realpathSync(resolve(dir));
  const realTarget = realpathSync(target);
  if (!realTarget.startsWith(realBase + sep)) {
    throw new Error(`Skill path "${target}" resolves (via a link) outside the skills directory "${dir}"`);
  }
}

function parseFrontmatter(raw: string, skillPath: string): ParsedSkill {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== FRONTMATTER_DELIM) {
    throw new Error(`${skillPath}: missing YAML frontmatter (file must start with a '---' line)`);
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_DELIM) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    throw new Error(`${skillPath}: frontmatter block is never closed (no second '---' line)`);
  }

  const frontmatter: Record<string, string> = {};
  for (const line of lines.slice(1, endIndex)) {
    if (!line.trim()) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue; // not a key: value line — ignore rather than fail on a stray line
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (BLOCK_SCALAR_KEYS.has(key) && BLOCK_SCALAR_VALUE.test(value)) {
      throw new Error(
        `${skillPath}: "${key}" uses a YAML block scalar ("${value}") — this hand-written ` +
          "frontmatter parser only supports single-line \"key: value\" pairs (see the module " +
          `header comment); rewrite "${key}" as a single-line, optionally quoted string.`,
      );
    }
    frontmatter[key] = value;
  }

  const body = lines.slice(endIndex + 1).join("\n").trim();
  return { frontmatter, body };
}

function readAndValidate(skillPath: string, expectedName: string): ParsedSkill {
  const raw = readFileSync(skillPath, "utf-8");
  const parsed = parseFrontmatter(raw, skillPath);
  if (!parsed.frontmatter.name) {
    throw new Error(`${skillPath}: frontmatter is missing required key "name"`);
  }
  if (parsed.frontmatter.name !== expectedName) {
    throw new Error(
      `${skillPath}: frontmatter name "${parsed.frontmatter.name}" does not match its folder name "${expectedName}"`,
    );
  }
  return parsed;
}

/**
 * Lists every skill in `dir` (one subfolder per skill, each containing a SKILL.md) by parsing only the
 * frontmatter — never the body. Throws if any skill's SKILL.md is malformed (missing/unclosed
 * frontmatter, missing `name`, or a `name` that does not match its folder).
 */
export function listSkills(dir: string): SkillMeta[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const skills: SkillMeta[] = [];

  for (const entry of entries) {
    // A symlinked/junctioned subfolder is not skipped silently here: it is checked below and,
    // if it escapes the skills root, listSkills throws (ISS-t-005c-c0-4) rather than listing it.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillPath = join(dir, entry.name, "SKILL.md");
    try {
      if (!statSync(skillPath).isFile()) continue;
    } catch {
      continue; // no SKILL.md in this subfolder — not a skill
    }
    assertRealPathContained(dir, skillPath);

    const { frontmatter } = readAndValidate(skillPath, entry.name);
    skills.push({
      name: frontmatter.name,
      description: frontmatter.description ?? "",
      path: skillPath,
    });
  }

  return skills;
}

/**
 * Loads one skill's body on demand (progressive disclosure — call this only once a node has decided,
 * from `listSkills` metadata, that it needs this particular skill's full prompt/soft rules).
 */
export function loadSkill(dir: string, name: string): string {
  const skillDir = resolveSkillDir(dir, name);
  const skillPath = join(skillDir, "SKILL.md");
  const { body } = readAndValidate(skillPath, name);
  return body;
}
