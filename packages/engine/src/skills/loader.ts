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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, "SKILL.md");
    try {
      if (!statSync(skillPath).isFile()) continue;
    } catch {
      continue; // no SKILL.md in this subfolder — not a skill
    }

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
  const skillPath = join(dir, name, "SKILL.md");
  const { body } = readAndValidate(skillPath, name);
  return body;
}
