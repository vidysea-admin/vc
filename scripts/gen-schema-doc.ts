/**
 * Generates docs/schema.md from the code, so the data-model doc can never drift (D-122).
 *
 * Sources of truth, read directly:
 *   - collection names    packages/db/src/collections.ts  COLLECTION_NAMES
 *   - indexes             packages/db/scripts/db-init.ts  INDEX_PLAN
 *   - document shapes     `interface XDoc` declarations bound via `collection<XDoc>(COLLECTION_NAMES.y)`
 *   - API/data contracts  every exported zod object schema in packages/schemas/src
 *   - writers/readers     every *.ts under apps|packages|mcp/<pkg>/src that names the collection
 *
 * Usage:  pnpm tsx scripts/gen-schema-doc.ts          (writes docs/schema.md)
 *         pnpm tsx scripts/gen-schema-doc.ts --check  (exit 1 if docs/schema.md is stale)
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { COLLECTION_NAMES } from "../packages/db/src/collections.js";
import { INDEX_PLAN } from "../packages/db/scripts/db-init.js";
import * as schemas from "../packages/schemas/src/index.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const OUT = join(root, "docs", "schema.md");
const SCAN_TOPS = ["apps", "packages", "mcp"];

function listTs(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listTs(p, out);
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
}
const srcFiles: string[] = [];
for (const top of SCAN_TOPS) {
  if (!existsSync(join(root, top))) continue;
  for (const pkg of readdirSync(join(root, top))) {
    const src = join(root, top, pkg, "src");
    if (existsSync(src) && statSync(src).isDirectory()) listTs(src, srcFiles);
  }
}
srcFiles.sort();
const rel = (f: string) => relative(root, f).split(sep).join("/");
const sources = new Map(srcFiles.map((f) => [f, readFileSync(f, "utf8")]));

// --- collection -> doc interface, and collection -> files that touch it ---
const keyToName = COLLECTION_NAMES as Record<string, string>;
const docTypes = new Map<string, Set<string>>(); // collection name -> interface names
const touchedBy = new Map<string, Set<string>>();
for (const [file, text] of sources) {
  for (const m of text.matchAll(/collection<\s*([A-Za-z0-9_]+)\s*>\(\s*COLLECTION_NAMES\.([a-z_]+)\s*\)/g)) {
    const coll = keyToName[m[2]!];
    if (coll) (docTypes.get(coll) ?? docTypes.set(coll, new Set()).get(coll)!).add(m[1]!);
  }
  for (const m of text.matchAll(/COLLECTION_NAMES\.([a-z_]+)/g)) {
    const coll = keyToName[m[1]!];
    if (coll) (touchedBy.get(coll) ?? touchedBy.set(coll, new Set()).get(coll)!).add(rel(file));
  }
}

// --- interface declarations (TypeScript compiler API, no type-checking needed) ---
interface Field { name: string; optional: boolean; type: string }
const interfaces = new Map<string, { file: string; fields: Field[]; extendsText: string }>();
for (const [file, text] of sources) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  sf.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node)) return;
    const fields: Field[] = [];
    for (const m of node.members) {
      if (!ts.isPropertySignature(m) || !m.name) continue;
      fields.push({ name: m.name.getText(sf), optional: !!m.questionToken, type: (m.type?.getText(sf) ?? "unknown").replace(/\s+/g, " ") });
    }
    const extendsText = (node.heritageClauses ?? []).map((h) => h.types.map((t) => t.getText(sf)).join(", ")).join(", ");
    if (!interfaces.has(node.name.text)) interfaces.set(node.name.text, { file: rel(file), fields, extendsText });
  });
}

// --- zod object schemas ---
type AnyDef = { typeName?: string; schema?: unknown; innerType?: unknown; shape?: () => Record<string, unknown>; options?: unknown[] };
const defOf = (s: unknown): AnyDef | undefined => (s as { _def?: AnyDef } | null)?._def;
function unwrapObject(s: unknown): Record<string, unknown> | undefined {
  for (let cur = s, i = 0; cur && i < 8; i++) {
    const d = defOf(cur);
    if (!d) return undefined;
    if (d.typeName === "ZodObject" && typeof d.shape === "function") return d.shape();
    cur = d.schema ?? d.innerType;
  }
  return undefined;
}
function zodTypeText(s: unknown, depth = 0): string {
  const d = defOf(s);
  if (!d?.typeName) return "unknown";
  const t = d.typeName.replace(/^Zod/, "").toLowerCase();
  if (depth > 2) return t;
  if (t === "optional" || t === "nullable" || t === "default" || t === "effects" || t === "readonly")
    return zodTypeText(d.innerType ?? d.schema, depth + 1) + (t === "optional" || t === "default" ? "?" : t === "nullable" ? " | null" : "");
  if (t === "enum") return ((d as { values?: string[] }).values ?? []).map((v) => JSON.stringify(v)).join(" | ");
  if (t === "literal") return JSON.stringify((d as { value?: unknown }).value);
  if (t === "array") return zodTypeText((d as { type?: unknown }).type, depth + 1) + "[]";
  return t;
}
const zodObjects: { name: string; fields: [string, string][] }[] = [];
for (const [name, value] of Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))) {
  if (!name.endsWith("Schema")) continue;
  const shape = unwrapObject(value);
  if (!shape) continue;
  zodObjects.push({ name, fields: Object.entries(shape).map(([k, v]) => [k, zodTypeText(v)]) });
}

// Fields of an interface including what it extends (other interfaces, or a zod-inferred base like `Fact` -> FactSchema).
function allFieldNames(typeName: string, seen = new Set<string>()): string[] {
  if (seen.has(typeName)) return [];
  seen.add(typeName);
  const i = interfaces.get(typeName);
  const zod = zodObjects.find((z) => z.name === typeName + "Schema");
  const own = i ? i.fields.map((f) => f.name) : zod ? zod.fields.map(([k]) => k) : [];
  const bases = i ? i.extendsText.split(",").map((b) => b.trim().replace(/<.*$/, "")).filter(Boolean) : [];
  return [...own, ...bases.flatMap((b) => allFieldNames(b, seen))];
}

// Collections reached by a raw string name instead of COLLECTION_NAMES (not in the registry).
const registered = new Set(Object.values(keyToName));
const unregistered = new Map<string, Set<string>>();
for (const [file, text] of sources) {
  for (const m of text.matchAll(/\.collection(?:<[^>]*>)?\(\s*["']([a-z_]+)["']\s*\)/g)) {
    if (!registered.has(m[1]!)) (unregistered.get(m[1]!) ?? unregistered.set(m[1]!, new Set()).get(m[1]!)!).add(rel(file));
  }
}

// --- render ---
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const collections = Object.values(keyToName).filter((v, i, a) => a.indexOf(v) === i).sort();
const lines: string[] = [];
const push = (...l: string[]) => lines.push(...l);
push(
  "# VC data schema (GENERATED, do not edit)",
  "",
  "Generated by `scripts/gen-schema-doc.ts` from `COLLECTION_NAMES`, `INDEX_PLAN`, the `*Doc` interfaces and the zod",
  "schemas in `packages/schemas`. Regenerate after any data-model change; `--check` fails when this file is stale.",
  "All collections live in the single `virtual_counsellor` database (D-008/D-009). External read-only sources",
  "(Pathlynks / Vidysea Postgres) are documented in `docs/data-sources.md`.",
  "",
  `Collections: ${collections.length} · document interfaces bound: ${[...docTypes.values()].reduce((n, s) => n + s.size, 0)} · indexes: ${INDEX_PLAN.length} · zod object schemas: ${zodObjects.length}`,
  "",
  "## Collection index",
  "",
  "| Collection | Document type | Indexes | Touched by (src files) |",
  "|---|---|---|---|",
);
for (const c of collections) {
  const types = [...(docTypes.get(c) ?? [])].sort().join(", ") || "-";
  const idx = INDEX_PLAN.filter((i) => i.collection === c).length;
  const files = (touchedBy.get(c)?.size ?? 0);
  push(`| \`${c}\` | ${types} | ${idx} | ${files} |`);
}

// ER diagram: reference fields that point at another collection's key.
// threadId means a CHAT thread only in chat-side collections (scribe decisions/resolutions use the scribe graph's
// thread id); profile_facts.factId is its own id, not a pointer into `facts`.
const REFS: [string, string, (c: string) => boolean][] = [
  ["studentId", "students", () => true],
  ["sessionId", "sessions", () => true],
  ["threadId", "chat_threads", (c) => c.startsWith("chat_") || c === "profile_facts" || c === "student_flags"],
];
const er: string[] = [];
for (const c of collections) {
  const fields = [...(docTypes.get(c) ?? [])].flatMap((t) => allFieldNames(t));
  for (const [field, target, applies] of REFS) {
    if (target !== c && applies(c) && collections.includes(target) && fields.includes(field)) er.push(`    ${target} ||--o{ ${c} : ${field}`);
  }
}
push("", "## Relationships (reference fields)", "", "Derived from typed fields only; untyped collections (no `*Doc` bound) cannot show edges.", "", "```mermaid", "erDiagram", ...[...new Set(er)].sort(), "```");
if (unregistered.size) {
  push("", "## Unregistered collections", "", "Reached by a raw string, not `COLLECTION_NAMES` (so erasure/export/index tooling may not know them):", "");
  for (const [name, files] of [...unregistered].sort(([a], [b]) => a.localeCompare(b))) push(`- \`${name}\`: ${[...files].sort().map((f) => "`" + f + "`").join(", ")}`);
}

push("", "## Collections in detail");
for (const c of collections) {
  push("", `### \`${c}\``);
  const types = [...(docTypes.get(c) ?? [])].sort();
  if (types.length === 0) push("", "_No typed document interface bound via `collection<XDoc>()`; see the touching files below._");
  for (const t of types) {
    const i = interfaces.get(t);
    if (!i) { push("", `\`${t}\`: declaration not found under */src.`); continue; }
    push("", `**${t}** (\`${i.file}\`)${i.extendsText ? ` extends ${esc(i.extendsText)}` : ""}`, "", "| Field | Type | Required |", "|---|---|---|");
    for (const f of i.fields) push(`| \`${f.name}\` | ${esc(f.type)} | ${f.optional ? "" : "yes"} |`);
  }
  const idx = INDEX_PLAN.filter((x) => x.collection === c);
  if (idx.length) {
    push("", "Indexes:", "");
    for (const x of idx) push(`- \`${x.name}\`: ${esc(JSON.stringify(x.keys))}${x.unique ? " unique" : ""}${x.partialFilterExpression ? ` partial ${esc(JSON.stringify(x.partialFilterExpression))}` : ""}`);
  }
  const files = [...(touchedBy.get(c) ?? [])].sort();
  if (files.length) push("", `Touched by: ${files.map((f) => "`" + f + "`").join(", ")}`);
}

push("", "## Zod contracts (`packages/schemas/src`)", "", "Validated shapes at module and API boundaries. `?` = optional.");
for (const z of zodObjects) {
  push("", `### ${z.name}`, "", "| Field | Type |", "|---|---|");
  for (const [k, t] of z.fields) push(`| \`${k}\` | ${esc(t)} |`);
}
const doc = lines.join("\n") + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== doc) {
    console.error("docs/schema.md is stale: run `pnpm tsx scripts/gen-schema-doc.ts`");
    process.exit(1);
  }
  console.log(`docs/schema.md up to date (${collections.length} collections, ${zodObjects.length} zod schemas)`);
} else {
  writeFileSync(OUT, doc);
  console.log(`wrote docs/schema.md (${collections.length} collections, ${INDEX_PLAN.length} indexes, ${zodObjects.length} zod schemas)`);
}
