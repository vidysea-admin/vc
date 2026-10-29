/**
 * Static Sequelize-migration parser (spec S4, VA10).
 *
 * parseSequelizeMigrations(files) replays createTable / addColumn / removeColumn / renameColumn /
 * dropTable from each migration's up() in filename order and returns the resulting schema map.
 *
 * SAFETY: migration source is untrusted text. It is tokenized and pattern-matched, never run:
 * nothing here evaluates, loads or dynamically imports repo content. All scanning is iterative
 * (no recursion on repo-controlled depth) and linear in the input size, so a hostile or 1 MB file
 * is bounded work. Anything the scanner cannot read is reported in `diagnostics`, never dropped
 * silently and never thrown.
 */
import type { ApiWriter, BackendKg, IngestDiagnostic, KgColumn, KgSource, MigrationParseResult, ModelTable, RepoFile, SchemaColumn, ToolTableEdge, VcReadEdge } from "./types.js";

/** Hard cap per file; larger content is skipped with a diagnostic (a 1 MB file is well inside it). */
export const MAX_MIGRATION_BYTES = 5_000_000;
const MAX_TEMPLATE_DEPTH = 32;
const MAX_TYPE_TEXT = 200;
const MAX_NAME_LEN = 200;

const HANDLED = new Set(["createTable", "addColumn", "removeColumn", "renameColumn", "dropTable"]);
const REGEX_PREV_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "delete",
  "void",
  "throw",
  "new",
  "else",
  "do",
  "yield",
  "await",
]);

class ParseError extends Error {}

type TokKind = "id" | "str" | "tmpl" | "tmplx" | "num" | "regex" | "p";
interface Tok {
  k: TokKind;
  /** id name, decoded string value, or the punctuation text. */
  v: string;
  /** Original source text (used to render type expressions). */
  raw: string;
}

const OPEN = new Set(["(", "[", "{"]);
const CLOSE_OF: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function isIdStart(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c > 127;
}
function isIdPart(c: number): boolean {
  return isIdStart(c) || (c >= 48 && c <= 57);
}
function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

/** Index just past the closing quote of a ' or " string starting at i; decodes simple escapes. */
function scanString(src: string, i: number): { end: number; value: string } {
  const q = src.charCodeAt(i);
  let j = i + 1;
  let out = "";
  const n = src.length;
  while (j < n) {
    const c = src.charCodeAt(j);
    if (c === q) return { end: j + 1, value: out };
    if (c === 10 || c === 13) throw new ParseError("unterminated string");
    if (c === 92) {
      const nx = src[j + 1];
      if (nx === undefined) break;
      if (nx === "n") out += "\n";
      else if (nx === "t") out += "\t";
      else if (nx === "\n") {
        /* line continuation */
      } else out += nx;
      j += 2;
      continue;
    }
    out += src[j];
    j++;
  }
  throw new ParseError("unterminated string");
}

/** Skip a template literal starting at the backtick at i. Returns end index and whether it has ${}. */
function scanTemplate(src: string, i: number, depth: number): { end: number; value: string; interp: boolean } {
  if (depth > MAX_TEMPLATE_DEPTH) throw new ParseError("template nesting too deep");
  const n = src.length;
  let j = i + 1;
  let out = "";
  let interp = false;
  while (j < n) {
    const c = src.charCodeAt(j);
    if (c === 96) return { end: j + 1, value: out, interp };
    if (c === 92) {
      const nx = src[j + 1];
      if (nx === undefined) break;
      out += nx;
      j += 2;
      continue;
    }
    if (c === 36 && src.charCodeAt(j + 1) === 123) {
      interp = true;
      j = skipTemplateExpr(src, j + 2, depth);
      continue;
    }
    out += src[j];
    j++;
  }
  throw new ParseError("unterminated template literal");
}

/** From just after "${": return the index just past the matching "}". */
function skipTemplateExpr(src: string, start: number, depth: number): number {
  const n = src.length;
  let j = start;
  let braces = 1;
  while (j < n) {
    const c = src.charCodeAt(j);
    if (c === 123) braces++;
    else if (c === 125) {
      braces--;
      if (braces === 0) return j + 1;
    } else if (c === 39 || c === 34) j = scanString(src, j).end - 1;
    else if (c === 96) j = scanTemplate(src, j, depth + 1).end - 1;
    else if (c === 47 && src.charCodeAt(j + 1) === 47) {
      while (j < n && src.charCodeAt(j) !== 10) j++;
      continue;
    } else if (c === 47 && src.charCodeAt(j + 1) === 42) {
      const e = src.indexOf("*/", j + 2);
      if (e < 0) throw new ParseError("unterminated comment");
      j = e + 1;
    }
    j++;
  }
  throw new ParseError("unterminated template expression");
}

/** Try to read a regex literal at i ("/" already known to be in expression-start position). */
function scanRegex(src: string, i: number): number {
  const n = src.length;
  let j = i + 1;
  let inClass = false;
  while (j < n) {
    const c = src.charCodeAt(j);
    if (c === 10 || c === 13) return -1;
    if (c === 92) {
      j += 2;
      continue;
    }
    if (inClass) {
      if (c === 93) inClass = false;
    } else if (c === 91) inClass = true;
    else if (c === 47) {
      j++;
      while (j < n && isIdPart(src.charCodeAt(j))) j++;
      return j;
    }
    j++;
  }
  return -1;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff || c === 0xa0) {
      i++;
      continue;
    }
    if (c === 47) {
      const nx = src.charCodeAt(i + 1);
      if (nx === 47) {
        while (i < n && src.charCodeAt(i) !== 10) i++;
        continue;
      }
      if (nx === 42) {
        const e = src.indexOf("*/", i + 2);
        if (e < 0) throw new ParseError("unterminated comment");
        i = e + 2;
        continue;
      }
      const prev = toks[toks.length - 1];
      const regexOk =
        prev === undefined ||
        (prev.k === "p" && prev.v !== ")" && prev.v !== "]" && prev.v !== "}") ||
        (prev.k === "id" && REGEX_PREV_KEYWORDS.has(prev.v));
      if (regexOk) {
        const e = scanRegex(src, i);
        if (e > 0) {
          toks.push({ k: "regex", v: "", raw: src.slice(i, e) });
          i = e;
          continue;
        }
      }
      toks.push({ k: "p", v: "/", raw: "/" });
      i++;
      continue;
    }
    if (c === 39 || c === 34) {
      const s = scanString(src, i);
      toks.push({ k: "str", v: s.value, raw: src.slice(i, s.end) });
      i = s.end;
      continue;
    }
    if (c === 96) {
      const s = scanTemplate(src, i, 0);
      toks.push({ k: s.interp ? "tmplx" : "tmpl", v: s.value, raw: src.slice(i, s.end) });
      i = s.end;
      continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(src.charCodeAt(j))) j++;
      const w = src.slice(i, j);
      toks.push({ k: "id", v: w, raw: w });
      i = j;
      continue;
    }
    if (isDigit(c)) {
      let j = i + 1;
      while (j < n && (isIdPart(src.charCodeAt(j)) || src.charCodeAt(j) === 46)) j++;
      const w = src.slice(i, j);
      toks.push({ k: "num", v: w, raw: w });
      i = j;
      continue;
    }
    if (c === 61 && src.charCodeAt(i + 1) === 62) {
      toks.push({ k: "p", v: "=>", raw: "=>" });
      i += 2;
      continue;
    }
    if (c === 46 && src.charCodeAt(i + 1) === 46 && src.charCodeAt(i + 2) === 46) {
      toks.push({ k: "p", v: "...", raw: "..." });
      i += 3;
      continue;
    }
    const ch = src[i]!;
    toks.push({ k: "p", v: ch, raw: ch });
    i++;
  }
  return toks;
}

/** match[i] = index of the closer for the opener at i (and vice versa). Unbalanced input is a ParseError. */
function matchBrackets(toks: Tok[]): Int32Array {
  const match = new Int32Array(toks.length).fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.k !== "p") continue;
    if (OPEN.has(t.v)) stack.push(i);
    else if (t.v in CLOSE_OF) {
      const o = stack.pop();
      if (o === undefined || toks[o]!.v !== CLOSE_OF[t.v]) throw new ParseError("unbalanced brackets");
      match[o] = i;
      match[i] = o;
    }
  }
  if (stack.length > 0) throw new ParseError("unclosed bracket");
  return match;
}

interface Ctx {
  toks: Tok[];
  match: Int32Array;
}

function isP(t: Tok | undefined, v: string): boolean {
  return t !== undefined && t.k === "p" && t.v === v;
}

/** End (exclusive) of the expression starting at i: stops at a top-level "," ";" or closer, or at limit. */
function skipExpr(cx: Ctx, i: number, limit: number): number {
  let j = i;
  while (j < limit) {
    const t = cx.toks[j]!;
    if (t.k === "p") {
      if (OPEN.has(t.v)) {
        j = cx.match[j]! + 1;
        continue;
      }
      if (t.v === "," || t.v === ";" || t.v in CLOSE_OF) break;
    }
    j++;
  }
  return Math.min(j, limit);
}

/** Split the argument list of the call whose "(" is at p into [start,end) ranges. */
function callArgs(cx: Ctx, p: number): [number, number][] {
  const close = cx.match[p]!;
  const out: [number, number][] = [];
  let j = p + 1;
  while (j < close) {
    const e = skipExpr(cx, j, close);
    if (e > j) out.push([j, e]);
    j = e < close && isP(cx.toks[e], ",") ? e + 1 : Math.max(e, j + 1);
  }
  return out;
}

interface ObjEntry {
  key: string;
  /** [start,end) of the value tokens, or null for a shorthand/method entry. */
  value: [number, number] | null;
}

/** Entries of the object literal whose "{" is at o. Spread / computed keys are skipped and counted. */
function objectEntries(cx: Ctx, o: number): { entries: ObjEntry[]; skipped: number } {
  const close = cx.match[o]!;
  const entries: ObjEntry[] = [];
  let skipped = 0;
  let j = o + 1;
  while (j < close) {
    const t = cx.toks[j]!;
    if (isP(t, ",")) {
      j++;
      continue;
    }
    if (isP(t, "...") || isP(t, "[")) {
      skipped++;
      j = Math.max(skipExpr(cx, j, close), j + 1);
      continue;
    }
    if (t.k === "id" || t.k === "str" || t.k === "num" || t.k === "tmpl") {
      const nx = cx.toks[j + 1];
      if (isP(nx, ":")) {
        const e = skipExpr(cx, j + 2, close);
        entries.push({ key: t.v, value: [j + 2, e] });
        j = Math.max(e, j + 2);
        continue;
      }
      if (isP(nx, "(")) {
        // method shorthand: key(...) { ... }
        let e = cx.match[j + 1]! + 1;
        if (isP(cx.toks[e], "{")) e = cx.match[e]! + 1;
        entries.push({ key: t.v, value: null });
        j = e;
        continue;
      }
      if (nx === undefined || isP(nx, ",") || j + 1 >= close) {
        entries.push({ key: t.v, value: null });
        j++;
        continue;
      }
    }
    skipped++;
    j = Math.max(skipExpr(cx, j, close), j + 1);
  }
  return { entries, skipped };
}

/** Render the tokens of a type expression, e.g. "Sequelize.STRING(100)" -> "STRING(100)". */
function typeText(cx: Ctx, s: number, e: number): string | null {
  const first = cx.toks[s];
  if (first === undefined || first.k !== "id") return null;
  let start = s;
  const second = cx.toks[s + 1];
  const third = cx.toks[s + 2];
  if (isP(second, ".") && third?.k === "id" && /^[A-Z][A-Z0-9_]*$/.test(third.v)) start = s + 2;
  let out = "";
  for (let j = start; j < e && out.length <= MAX_TYPE_TEXT; j++) {
    const t = cx.toks[j]!;
    out += t.raw;
    if (isP(t, ",")) out += " ";
  }
  return out.length > MAX_TYPE_TEXT ? out.slice(0, MAX_TYPE_TEXT) + "..." : out;
}

function singleString(cx: Ctx, r: [number, number]): string | null {
  if (r[1] - r[0] !== 1) return null;
  const t = cx.toks[r[0]]!;
  return t.k === "str" || t.k === "tmpl" ? t.v : null;
}

/** Table name: a string literal, or an object literal carrying tableName: '...'. */
function tableName(cx: Ctx, r: [number, number] | undefined): string | null {
  if (r === undefined) return null;
  const s = singleString(cx, r);
  if (s !== null) return s;
  if (isP(cx.toks[r[0]], "{") && cx.match[r[0]] === r[1] - 1) {
    const hit = objectEntries(cx, r[0]).entries.find((en) => en.key === "tableName" && en.value !== null);
    if (hit?.value) return singleString(cx, hit.value);
  }
  return null;
}

type ColumnParse = { ok: true; col: SchemaColumn; note?: string } | { ok: false };

function columnDef(cx: Ctx, r: [number, number]): ColumnParse {
  const [s, e] = r;
  if (isP(cx.toks[s], "{") && cx.match[s] === e - 1) {
    const { entries } = objectEntries(cx, s);
    const typeEntry = entries.find((en) => en.key === "type" && en.value !== null);
    const type = typeEntry?.value ? typeText(cx, typeEntry.value[0], typeEntry.value[1]) : null;
    const col: SchemaColumn = { type: type ?? "unknown" };
    const nullEntry = entries.find((en) => en.key === "allowNull" && en.value !== null);
    if (nullEntry?.value && nullEntry.value[1] - nullEntry.value[0] === 1) {
      const v = cx.toks[nullEntry.value[0]]!;
      if (v.k === "id" && (v.v === "true" || v.v === "false")) col.allowNull = v.v === "true";
    }
    return type === null ? { ok: true, col, note: "column has no readable type" } : { ok: true, col };
  }
  const type = typeText(cx, s, e);
  return type === null ? { ok: false } : { ok: true, col: { type } };
}

type Op =
  | { m: "createTable"; table: string; columns: Map<string, SchemaColumn> }
  | { m: "addColumn"; table: string; column: string; def: SchemaColumn }
  | { m: "removeColumn"; table: string; column: string }
  | { m: "renameColumn"; table: string; from: string; to: string }
  | { m: "dropTable"; table: string };

interface FileParse {
  ops: Op[];
  diags: Omit<IngestDiagnostic, "file">[];
}

/** Locate up()'s body: returns [start,end) of the tokens inside it and the receiver (queryInterface) name. */
function findUp(cx: Ctx): { s: number; e: number; recv: string } | null {
  const { toks, match } = cx;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.k !== "id" || t.v !== "up") continue;
    const prev = toks[i - 1];
    const next = toks[i + 1];
    if (prev !== undefined && isP(prev, ".")) {
      // exports.up = ... / module.exports.up = ...
      if (!isP(next, "=")) continue;
    } else if (prev !== undefined && prev.k === "p" && ![",", "{", ";", "}"].includes(prev.v)) {
      continue;
    } else if (prev !== undefined && prev.k === "id" && !["async", "function", "const", "let", "var"].includes(prev.v)) {
      continue;
    }
    let j: number;
    if (isP(next, ":") || isP(next, "=")) j = i + 2;
    else if (isP(next, "(")) j = i + 1;
    else continue;
    if (toks[j]?.k === "id" && toks[j]!.v === "async") j++;
    if (toks[j]?.k === "id" && toks[j]!.v === "function") {
      j++;
      if (isP(toks[j], "*")) j++;
      if (toks[j]?.k === "id") j++;
    }
    let recv = "queryInterface";
    if (isP(toks[j], "(")) {
      const first = toks[j + 1];
      if (first?.k === "id") recv = first.v;
      j = match[j]! + 1;
      // optional return type annotation: ": Promise<void>"
      if (isP(toks[j], ":")) {
        while (j < toks.length && !isP(toks[j], "{") && !isP(toks[j], "=>")) j++;
      }
    } else if (toks[j]?.k === "id" && isP(toks[j + 1], "=>")) {
      recv = toks[j]!.v;
      j++;
    } else continue;
    if (isP(toks[j], "=>")) j++;
    if (isP(toks[j], "{")) return { s: j + 1, e: match[j]!, recv };
    // expression body: up: (qi) => qi.createTable(...)
    return { s: j, e: skipExpr(cx, j, toks.length), recv };
  }
  return null;
}

const short = (s: string) => (s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN) + "..." : s);

function parseOne(src: string): FileParse {
  if (src.length > MAX_MIGRATION_BYTES) {
    return { ops: [], diags: [{ code: "too_large", message: `file is ${src.length} chars, over the ${MAX_MIGRATION_BYTES} cap` }] };
  }
  let cx: Ctx;
  try {
    const toks = tokenize(src);
    cx = { toks, match: matchBrackets(toks) };
  } catch (err) {
    if (err instanceof ParseError) return { ops: [], diags: [{ code: "parse_error", message: err.message }] };
    throw err;
  }
  const up = findUp(cx);
  if (up === null) return { ops: [], diags: [{ code: "no_up", message: "no up() found; nothing applied" }] };
  const ops: Op[] = [];
  const diags: FileParse["diags"] = [];
  const { toks } = cx;
  for (let i = up.s; i < up.e; i++) {
    const t = toks[i]!;
    if (t.k !== "id" || t.v !== up.recv) continue;
    if (isP(toks[i - 1], ".")) continue;
    if (!isP(toks[i + 1], ".")) {
      // E1: queryInterface passed to a helper, aliased or otherwise used as a value: whatever it does is not read.
      diags.push({ code: "unknown_method", message: `ignored use of ${up.recv} as a value (helper call or alias); its effect on the schema is not applied` });
      continue;
    }
    const mt = toks[i + 2];
    if (mt === undefined || mt.k !== "id") continue;
    // The transaction wrapper is benign: its callback body is scanned like the rest of up().
    if (mt.v === "sequelize" && isP(toks[i + 3], ".") && toks[i + 4]?.k === "id" && toks[i + 4]!.v === "transaction") continue;
    if (!isP(toks[i + 3], "(")) {
      // E1: queryInterface.sequelize.query(...) and any other member chain that is not a direct method call.
      diags.push({ code: "unknown_method", message: `ignored ${up.recv}.${short(mt.v)}... (not a direct call); its effect on the schema is not applied` });
      continue;
    }
    const method = mt.v;
    if (!HANDLED.has(method)) {
      diags.push({ code: "unknown_method", message: `ignored unsupported call ${up.recv}.${short(method)}()` });
      continue;
    }
    const args = callArgs(cx, i + 3);
    const unresolved = () => diags.push({ code: "unresolved_args", message: `${method}() skipped: arguments are not string/object literals` });
    const table = tableName(cx, args[0]);
    if (table === null) {
      unresolved();
      continue;
    }
    if (method === "dropTable") {
      ops.push({ m: "dropTable", table });
    } else if (method === "createTable") {
      const a = args[1];
      if (!a || !isP(toks[a[0]], "{") || cx.match[a[0]] !== a[1] - 1) {
        unresolved();
        continue;
      }
      const { entries, skipped } = objectEntries(cx, a[0]);
      const columns = new Map<string, SchemaColumn>();
      let bad = false;
      // E1: never drop a column silently. Report what cannot be read; never invent columns.
      if (skipped > 0) diags.push({ code: "skipped_columns", message: `${short(table)}: ${skipped} entries (spread or computed) in createTable were not parsed; the column list is incomplete` });
      for (const en of entries) {
        if (en.value === null) {
          diags.push({ code: "dropped_column", message: `${short(table)}.${short(en.key)}: shorthand or method property has no readable definition; column not recorded` });
          continue;
        }
        const d = columnDef(cx, en.value);
        if (!d.ok) {
          bad = true;
          break;
        }
        if (d.note) diags.push({ code: "unknown_type", message: `${short(table)}.${short(en.key)}: ${d.note}` });
        columns.set(en.key, d.col);
      }
      if (bad) {
        unresolved();
        continue;
      }
      ops.push({ m: "createTable", table, columns });
    } else if (method === "addColumn") {
      const column = args[1] ? singleString(cx, args[1]) : null;
      const d = args[2] ? columnDef(cx, args[2]) : ({ ok: false } as ColumnParse);
      if (column === null || !d.ok) {
        unresolved();
        continue;
      }
      if (d.note) diags.push({ code: "unknown_type", message: `${short(table)}.${short(column)}: ${d.note}` });
      ops.push({ m: "addColumn", table, column, def: d.col });
    } else if (method === "removeColumn") {
      const column = args[1] ? singleString(cx, args[1]) : null;
      if (column === null) {
        unresolved();
        continue;
      }
      ops.push({ m: "removeColumn", table, column });
    } else {
      const from = args[1] ? singleString(cx, args[1]) : null;
      const to = args[2] ? singleString(cx, args[2]) : null;
      if (from === null || to === null) {
        unresolved();
        continue;
      }
      ops.push({ m: "renameColumn", table, from, to });
    }
  }
  return { ops, diags };
}

/** Filename order: compare basenames by code unit (timestamp-prefixed names sort chronologically), then full path. */
function byFilename(a: RepoFile, b: RepoFile): number {
  const ba = a.path.slice(a.path.lastIndexOf("/") + 1);
  const bb = b.path.slice(b.path.lastIndexOf("/") + 1);
  if (ba !== bb) return ba < bb ? -1 : 1;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function setOwn<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

export function parseSequelizeMigrations(files: RepoFile[]): MigrationParseResult {
  const diagnostics: IngestDiagnostic[] = [];
  const valid: RepoFile[] = [];
  const input: unknown[] = Array.isArray(files) ? files : [];
  input.forEach((f, idx) => {
    const r = f as Partial<RepoFile> | null;
    if (r === null || typeof r !== "object" || typeof r.path !== "string" || typeof r.content !== "string") {
      diagnostics.push({
        code: "bad_input",
        file: typeof r?.path === "string" ? r.path : `#${idx}`,
        message: "entry is not {path: string, content: string}; skipped",
      });
      return;
    }
    valid.push({ path: r.path, content: r.content });
  });
  valid.sort(byFilename);

  const tables = new Map<string, Map<string, SchemaColumn>>();
  const touched = new Map<string, string[]>();
  const touch = (table: string, file: string) => {
    const list = touched.get(table) ?? [];
    if (list[list.length - 1] !== file) list.push(file);
    touched.set(table, list);
  };

  for (const f of valid) {
    const parsed = parseOne(f.content);
    for (const d of parsed.diags) diagnostics.push({ ...d, file: f.path });
    const miss = (m: string, table: string) =>
      diagnostics.push({ code: "missing_table", file: f.path, message: `${m}() on unknown table ${short(table)}; ignored` });
    for (const op of parsed.ops) {
      if (op.m === "createTable") {
        tables.set(op.table, op.columns);
        touch(op.table, f.path);
        continue;
      }
      const cols = tables.get(op.table);
      if (cols === undefined) {
        miss(op.m, op.table);
        continue;
      }
      touch(op.table, f.path);
      if (op.m === "dropTable") tables.delete(op.table);
      else if (op.m === "addColumn") cols.set(op.column, op.def);
      else if (op.m === "removeColumn") cols.delete(op.column);
      else {
        const def = cols.get(op.from);
        if (def === undefined) {
          diagnostics.push({
            code: "missing_column",
            file: f.path,
            message: `renameColumn() on unknown column ${short(op.table)}.${short(op.from)}; ignored`,
          });
          continue;
        }
        const rebuilt = new Map<string, SchemaColumn>();
        for (const [k, v] of cols) rebuilt.set(k === op.from ? op.to : k, v);
        tables.set(op.table, rebuilt);
      }
    }
  }

  const out: MigrationParseResult = { tables: {}, diagnostics };
  for (const [name, cols] of tables) {
    const columns: Record<string, SchemaColumn> = {};
    for (const [c, def] of cols) setOwn(columns, c, { ...def });
    setOwn(out.tables, name, { columns, sourceFiles: [...(touched.get(name) ?? [])] });
  }
  return out;
}


// ---------------------------------------------------------------------------------------------------------------------------------
// T8 (tf-t8-product-db-kg): the BACKEND half of the product + DB knowledge graph. The Vidysea backend is Python (SQLAlchemy models, FastAPI routers),
// not Sequelize, so the parsers below read `class X(Base)` + `Column(...)` and `@router.<verb>("/path")` handlers. Same safety rules as the migration
// parser: the source is untrusted text, scanned line by line with bounded work, never run, never imported; anything unreadable is a diagnostic.
// ---------------------------------------------------------------------------------------------------------------------------------

const MAX_PY_BYTES = 2_000_000;
const MAX_CALL_LINES = 60;
const MAX_CALL_DEPTH = 64;
const MAX_TYPE_CHARS = 120;
const OWNER_KEYS = ["student_id", "user_id", "recipient_id", "owner_id"] as const;
const NON_TYPE_ARG = /^(?:ForeignKey|Sequence|Computed|Identity|Index|CheckConstraint|UniqueConstraint|FetchedValue)\s*\(/;
/** Longest source line the Python scanners will look at; a longer one is skipped (columns) with a diagnostic, or ignored (call scans). */
const MAX_PY_LINE = 2000;
const COLUMN_HEAD = /^(\s+)([A-Za-z_]\w*)/;
const COLUMN_TAIL = /^\s*=\s*(?:[A-Za-z_][\w.]*\.)?(Column|mapped_column)\s*\(/;

/**
 * `    name[: annotation] = [mod.]Column(` / `mapped_column(` at the start of a class-body line. Linear on purpose: the first version was one regex with a
 * lazy `[^=]+?` annotation followed by `\s*=`, which is cubic on whitespace (a 5000-space line took 57 s inside the API process). Here the annotation
 * is whatever sits between the first ":" and the first "=", found with indexOf, and each remaining regex is anchored with no nested quantifier.
 * Returns the name, the annotation, the constructor kind and the index just past the "(".
 */
function matchColumnStmt(s: string): { name: string; annotation: string | undefined; kind: string; end: number } | null {
  const head = COLUMN_HEAD.exec(s);
  if (head === null) return null;
  let p = head[0].length;
  while (p < s.length && (s[p] === " " || s[p] === "\t")) p++;
  let annotation: string | undefined;
  if (s[p] === ":") {
    const eq = s.indexOf("=", p + 1);
    if (eq < 0) return null;
    annotation = s.slice(p + 1, eq).trim();
    if (annotation === "") return null;
    p = eq;
  }
  const tail = COLUMN_TAIL.exec(s.slice(p));
  if (tail === null) return null;
  return { name: head[2]!, annotation, kind: tail[1]!, end: p + tail[0].length };
}
const PY_CLASS = /^class\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/;
const TABLENAME = /^\s+__tablename__\s*=\s*(["'])([A-Za-z_][\w.]*)\1\s*(?:#.*)?$/;

/** From the "(" at (line, col): the text up to its matching ")" and the line it ended on; null when it never closes within the caps. Strings and # comments are skipped. */
function readPyCall(lines: string[], line: number, col: number): { text: string; endLine: number } | null {
  let depth = 0;
  let out = "";
  for (let i = line; i < lines.length && i < line + MAX_CALL_LINES; i++) {
    const s = lines[i]!;
    let quote = "";
    for (let j = i === line ? col : 0; j < s.length; j++) {
      const c = s[j]!;
      if (quote !== "") {
        out += c;
        if (c === "\\") {
          j++;
          if (j < s.length) out += s[j]!;
        } else if (c === quote) quote = "";
        continue;
      }
      if (c === "#") break;
      if (c === '"' || c === "'") {
        quote = c;
        out += c;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") {
        depth++;
        if (depth > MAX_CALL_DEPTH) return null;
        if (!(depth === 1 && i === line && j === col)) out += c;
        continue;
      }
      if (c === ")" || c === "]" || c === "}") {
        depth--;
        if (depth === 0) return { text: out, endLine: i };
        out += c;
        continue;
      }
      out += c;
    }
    out += "\n";
  }
  return null;
}

/** Split call arguments at top-level commas (brackets and strings respected). */
function splitPyArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (let j = 0; j < text.length; j++) {
    const c = text[j]!;
    if (quote !== "") {
      cur += c;
      if (c === "\\") {
        j++;
        if (j < text.length) cur += text[j]!;
      } else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== "") args.push(cur.trim());
  return args;
}

const KWARG = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*)$/;

function columnFrom(kind: string, annotation: string | undefined, argText: string, line: number): { name?: string; col: KgColumn } {
  const args = splitPyArgs(argText);
  const kw = new Map<string, string>();
  const positional: string[] = [];
  for (const a of args) {
    const m = KWARG.exec(a);
    if (m !== null) kw.set(m[1]!, m[2]!.trim());
    else positional.push(a);
  }
  let name: string | undefined;
  if (positional[0] !== undefined && /^(["'])[\s\S]*\1$/.test(positional[0])) name = positional.shift()!.slice(1, -1);
  const fk = /ForeignKey\(\s*(["'])([^"']+)\1/.exec(argText)?.[2];
  const typeArg = positional.find((a) => !NON_TYPE_ARG.test(a));
  const rawType = typeArg ?? (kind === "mapped_column" && annotation !== undefined ? annotation : "unknown");
  const type = rawType.replace(/\s+/g, " ").trim().slice(0, MAX_TYPE_CHARS) || "unknown";
  const col: KgColumn = { type, line };
  if (kw.get("primary_key") === "True") col.pk = true;
  const nullable = kw.get("nullable");
  if (nullable === "False") col.allowNull = false;
  else if (nullable === "True") col.allowNull = true;
  if (fk !== undefined) col.fk = fk;
  return { ...(name === undefined ? {} : { name }), col };
}

/** Insertion that cannot trip over `__proto__` / `constructor` keys. */
function setOwnKey<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

export interface ModelParseResult {
  tables: Record<string, ModelTable>;
  diagnostics: IngestDiagnostic[];
}

/**
 * SQLAlchemy model files -> tables. A table is a `class X(<bases>)` with a literal `__tablename__`; its columns are the `name = Column(...)` /
 * `name: Mapped[T] = mapped_column(...)` statements directly in the class body (relationships, properties and nested code are not columns).
 * `ownerKey` is the first of student_id / user_id / recipient_id / owner_id the table has ("id" for `users`).
 */
export function parseSqlalchemyModels(files: RepoFile[]): ModelParseResult {
  const diagnostics: IngestDiagnostic[] = [];
  const tables: Record<string, ModelTable> = {};
  const valid: RepoFile[] = [];
  (Array.isArray(files) ? (files as unknown[]) : []).forEach((f, idx) => {
    const r = f as Partial<RepoFile> | null;
    if (r === null || typeof r !== "object" || typeof r.path !== "string" || typeof r.content !== "string") {
      diagnostics.push({ code: "bad_input", file: typeof r?.path === "string" ? r.path : `#${idx}`, message: "entry is not {path: string, content: string}; skipped" });
      return;
    }
    if (r.content.length > MAX_PY_BYTES) {
      diagnostics.push({ code: "oversize", file: r.path, message: "file is over the size cap; skipped" });
      return;
    }
    valid.push({ path: r.path, content: r.content });
  });
  valid.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const f of valid) {
    const lines = f.content.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const cls = PY_CLASS.exec(lines[i]!);
      if (cls === null || cls[2]!.trim() === "") {
        i++;
        continue;
      }
      const classLine = i;
      let end = i + 1;
      while (end < lines.length && (lines[end]!.trim() === "" || /^\s/.test(lines[end]!) || lines[end]!.startsWith("#"))) end++;
      let table: string | undefined;
      let tableLine = classLine;
      const columns: Record<string, KgColumn> = {};
      let k = classLine + 1;
      while (k < end) {
        const s = lines[k]!;
        const tn = TABLENAME.exec(s);
        if (tn !== null && table === undefined) {
          table = tn[2]!;
          tableLine = k;
          k++;
          continue;
        }
        if (s.length > MAX_PY_LINE) {
          diagnostics.push({ code: "line_too_long", file: f.path, message: `line ${k + 1} is over ${MAX_PY_LINE} characters; not scanned for a column` });
          k++;
          continue;
        }
        const m = matchColumnStmt(s);
        if (m === null) {
          k++;
          continue;
        }
        const call = readPyCall(lines, k, m.end - 1);
        if (call === null) {
          diagnostics.push({ code: "unclosed_call", file: f.path, message: `column ${m.name.slice(0, 80)} at line ${k + 1} could not be read; skipped` });
          k++;
          continue;
        }
        const { name, col } = columnFrom(m.kind, m.annotation, call.text, k + 1);
        setOwnKey(columns, (name ?? m.name).slice(0, 200), col);
        k = call.endLine + 1;
      }
      if (table !== undefined) {
        if (Object.prototype.hasOwnProperty.call(tables, table)) diagnostics.push({ code: "duplicate_table", file: f.path, message: `table ${table.slice(0, 80)} is defined twice; the later definition wins` });
        const owner = table === "users" ? "id" : OWNER_KEYS.find((o) => Object.prototype.hasOwnProperty.call(columns, o));
        setOwnKey(tables, table, { className: cls[1]!, file: f.path, line: tableLine + 1, columns, ...(owner === undefined ? {} : { ownerKey: owner }) });
      }
      i = Math.max(end, i + 1);
    }
  }
  return { tables, diagnostics };
}

const ROUTE_DECORATOR = /^@\w+\.(get|post|put|patch|delete)\(\s*(?:path\s*=\s*)?(["'])([^"']*)\2/;
const ROUTER_PREFIX_TAIL = /^[^)]{0,400}?prefix\s{0,40}=\s{0,40}(["'])([^"']{0,300})\1/;
const MAX_ROUTER_STARTS = 50;
const ROUTER_WINDOW = 600;
/**
 * The `prefix="..."` of the first `APIRouter(...)` that has one. Bounded: at most 50 "APIRouter(" starts, each looked at through a 600-char window
 * (the old whole-file regex was quadratic on a file full of "APIRouter(" and slow on long whitespace runs).
 */
function routerPrefix(content: string): string {
  let from = 0;
  for (let n = 0; n < MAX_ROUTER_STARTS; n++) {
    const at = content.indexOf("APIRouter(", from);
    if (at < 0) return "";
    const body = at + "APIRouter(".length;
    const m = ROUTER_PREFIX_TAIL.exec(content.slice(body, body + ROUTER_WINDOW));
    if (m !== null) return m[2]!;
    from = at + 1;
  }
  return "";
}
const FN_DEF = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/;
const SPAN_END = /^(?:@|def\s|async\s+def\s|class\s)/;

/**
 * FastAPI router files -> the handlers that construct (`Model(`), insert/update/delete (`insert(Model)`, `.query(Model)...delete()`) a known model.
 * Informational: an over-approximation of "this endpoint writes that table". Handlers that only read give no entry.
 */
export function parseRouterWrites(files: RepoFile[], tables: Record<string, ModelTable>): ApiWriter[] {
  const classToTable = new Map<string, string>();
  for (const [t, v] of Object.entries(tables)) classToTable.set(v.className, t);
  const out: ApiWriter[] = [];
  const valid = (Array.isArray(files) ? (files as unknown[]) : [])
    .filter((f): f is RepoFile => typeof (f as RepoFile)?.path === "string" && typeof (f as RepoFile)?.content === "string" && (f as RepoFile).content.length <= MAX_PY_BYTES)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const f of valid) {
    const lines = f.content.split(/\r?\n/);
    const prefix = routerPrefix(f.content);
    const aliasTable = new Map<string, string>();
    for (const line of lines) {
      if (line.length > MAX_PY_LINE || !line.includes(" as ")) continue;
      for (const a of line.matchAll(/\b([A-Z]\w*)\s+as\s+([A-Za-z_]\w*)/g)) {
        const t = classToTable.get(a[1]!);
        if (t !== undefined) aliasTable.set(a[2]!, t);
      }
    }
    const tableOf = (name: string): string | undefined => classToTable.get(name) ?? aliasTable.get(name);
    // tf-fix-2: the first non-blank, non-decorator, non-comment line at or after each index is computed once, backwards (a stacked-decorator run was quadratic: 100k lines took
    // 89.6 s), and a handler's touched-table set is computed once per `def`, however many decorators are stacked on it.
    const nextDef: number[] = new Array<number>(lines.length + 1);
    nextDef[lines.length] = lines.length;
    for (let k = lines.length - 1; k >= 0; k--) {
      const l = lines[k]!;
      nextDef[k] = l.trim() === "" || l.startsWith("@") || l.startsWith("#") ? nextDef[k + 1]! : k;
    }
    const touchedByDef = new Map<number, Set<string>>();
    for (let i = 0; i < lines.length; i++) {
      const dec = ROUTE_DECORATOR.exec(lines[i]!);
      if (dec === null) continue;
      const d = nextDef[i + 1]!;
      const fn = d < lines.length ? FN_DEF.exec(lines[d]!) : null;
      if (fn === null) continue;
      let touched = touchedByDef.get(d);
      if (touched === undefined) {
        touched = new Set<string>();
        touchedByDef.set(d, touched);
        let e = d + 1;
        while (e < lines.length && !SPAN_END.test(lines[e]!)) e++;
        for (let k = d + 1; k < e; k++) {
          const s = lines[k]!;
          if (s.length > MAX_PY_LINE) continue;
          for (const m of s.matchAll(/\b([A-Z_]\w*)\s*\(/g)) {
            const t = tableOf(m[1]!);
            if (t !== undefined) touched.add(t);
          }
          for (const m of s.matchAll(/\b(?:insert|update|delete)\(\s*([A-Z_]\w*)/g)) {
            const t = tableOf(m[1]!);
            if (t !== undefined) touched.add(t);
          }
          for (const m of s.matchAll(/\bquery\(\s*([A-Z_]\w*)\s*\)[^\n]*\.(?:update|delete)\(/g)) {
            const t = tableOf(m[1]!);
            if (t !== undefined) touched.add(t);
          }
        }
      }
      if (touched.size > 0) {
        out.push({ file: f.path, line: i + 1, method: dec[1]!.toUpperCase(), path: (prefix + dec[3]!).slice(0, 300), fn: fn[1]!, tables: [...touched].sort() });
      }
    }
  }
  return out;
}

/**
 * Reviewed tool -writes-> table seeds, from `qa/evidence/t057/tool-first-inventory.md` section 1 (the "Tables written" column; the file:line is the
 * BE citation of that row). The parser cross-checks each one on every sync (table exists; a handler in the cited router file touches it) and the join
 * reports drift. VC never writes these tables (D-123): the edges say where a student's activity lands, so VC knows where to read it.
 */
export interface ToolTableSeed {
  tool: string;
  table: string;
  seed: string;
}
const S = (tool: string, table: string, seed: string): ToolTableSeed => ({ tool, table, seed });
export const TOOL_TABLE_SEEDS: readonly ToolTableSeed[] = [
  S("section:market", "open_search_history", "app/api/v1/exploration/router.py:1083"),
  S("route:/search", "open_search_history", "app/api/v1/exploration/router.py:1083"),
  S("route:/ai-university-finder-study-abroad", "student_preference_snapshots", "app/api/v1/auth/legacy_router.py:360"),
  S("route:/student/recommendation", "student_preference_snapshots", "app/models/preference_snapshot.py:32"),
  S("route:/student/recommendation", "user_preferences", "app/models/user.py:241"),
  S("route:/student/recommendation", "recommendation_feedback", "app/models/discovery.py:34"),
  S("route:/student/recommendation", "recommendation_ratings", "app/models/discovery.py:50"),
  S("section:favourites", "user_favourites", "app/api/v1/student/favourite_router.py:16"),
  S("section:shortlisted", "student_shortlisted_courses", "app/api/v1/student/shortlist_router.py:50"),
  S("section:shortlisted", "student_shortlist_versions", "app/api/v1/student/shortlist_router.py:50"),
  S("section:shortlisted", "audit_logs", "app/api/v1/student/shortlist_router.py:50"),
  S("section:shortlisted", "wallet_ledger", "app/services/wallet_service.py:673"),
  S("section:compare", "student_compare_snapshot", "app/api/v1/student/router.py:2732"),
  S("section:comparisons", "student_compare_snapshot", "app/api/v1/student/router.py:2732"),
  S("section:testreq", "student_test_scores", "app/api/v1/users/user_router.py:44"),
  S("section:testreq", "student_test_attempts", "app/models/student_test_attempt.py:7"),
  S("section:testreq", "milestone_test_details", "app/api/v1/journey_map/models.py:134"),
  S("section:journey", "user_course_journey_map", "app/api/v1/journey_map/router.py:379"),
  S("section:journey", "journey_phases", "app/api/v1/journey_map/router.py:379"),
  S("section:journey", "milestones", "app/api/v1/journey_map/router.py:379"),
  S("section:journey", "milestone_updates", "app/api/v1/journey_map/models.py:93"),
  S("section:journey", "milestone_date_changes", "app/api/v1/journey_map/models.py:118"),
  S("section:journey", "student_journey_buffer", "app/api/v1/journey_map/models.py:176"),
  S("section:journey", "applications", "app/api/v1/journey_map/router.py:1638"),
  S("section:journey", "application_timeline", "app/api/v1/journey_map/router.py:1638"),
  S("section:applications", "applications", "app/api/v1/applications/router.py:142"),
  S("section:applications", "application_timeline", "app/api/v1/applications/router.py:142"),
  S("section:applications", "student_shortlisted_courses", "app/api/v1/applications/router.py:142"),
  S("section:applications", "wallet_ledger", "app/services/wallet_service.py:673"),
  S("section:visa", "visa_applications", "app/api/v1/student/router.py:1348"),
  S("section:scholarships", "saved_scholarships", "app/api/v1/scholarships/router.py:126"),
  S("section:schpipeline", "saved_scholarships", "app/api/v1/student/router.py:2324"),
  S("section:tools", "student_tool_results", "app/api/v1/tools/router.py:577"),
  S("section:documents", "student_documents", "app/models/student.py:272"),
  S("section:documents", "document_requests", "app/models/student.py:336"),
  S("section:docchecklist", "student_doc_checklist_progress", "app/api/v1/student/router.py:1992"),
  S("section:profile", "students", "app/models/student.py:22"),
  S("section:profile", "student_academic_history", "app/models/student.py:393"),
  S("section:profile", "student_work_experience", "app/models/student.py:218"),
  S("section:profile-building", "further_profile_assessments", "app/api/v1/further_profile.py:1"),
  S("section:profile-building", "further_profile_actions", "app/api/v1/further_profile.py:1"),
  S("section:source-of-fund", "fund_sources", "app/models/fund_source.py:9"),
  S("section:goals", "student_goal", "app/api/v1/student/router.py:2140"),
  S("section:finance", "student_budget_plan", "app/api/v1/student/router.py:2140"),
  S("section:finance", "student_savings_entry", "app/api/v1/student/router.py:2140"),
  S("section:testprep", "student_test_prep", "app/api/v1/student/router.py:2140"),
  S("section:testprep", "student_study_log", "app/api/v1/student/router.py:2140"),
  S("section:reportcard", "student_report_snapshot", "app/api/v1/student/router.py:2140"),
  S("section:lorsop", "student_recommender", "app/api/v1/student/router.py:2140"),
  S("section:lorsop", "student_doc_draft", "app/api/v1/student/router.py:2140"),
  S("section:predeparture", "pre_departure_checklists", "app/api/v1/pre_departure/router.py:1"),
  S("section:counselor", "expert_requests", "app/api/v1/student/router.py:1638"),
  S("section:mail", "notifications", "app/models/notification.py:9"),
  S("section:rewards", "wallet_ledger", "app/services/wallet_service.py:673"),
  S("route:/services/study-abroad-student-loan-assistance", "service_enquiries", "app/api/v1/services/router.py:169"),
  S("route:/services/study-visa-assistance", "service_enquiries", "app/api/v1/services/router.py:232"),
  S("route:/services/test-preparation-to-study-abroad", "service_enquiries", "app/api/v1/services/router.py:348"),
  S("route:/services/counselling-for-study-abroad", "service_enquiries", "app/api/v1/services/router.py:406"),
  S("route:/services/scholarship-assistance-for-students-studying-abroad", "service_enquiries", "app/api/v1/services/router.py:466"),
];

export interface BuildBackendKgOptions {
  /** Tables the VC read port may select (the stored Postgres source's table list). */
  vcReadTables: readonly string[];
  source: KgSource;
  /** Defaults to TOOL_TABLE_SEEDS. */
  seeds?: readonly ToolTableSeed[];
  /**
   * Python service files (`app/services/*.py`) the caller read. They let a seed that cites a service file, or a router that delegates to an imported
   * service, be verified by a bounded scan. Without them those edges stay "none" with reason service_not_read / seed_file_not_read.
   */
  serviceFiles?: RepoFile[];
}

// kg-fix-1: edge verification. Every seeded tool -> table edge is checked against the code on each sync and records HOW (verifiedBy) or WHY NOT (reason).
const MAX_FOLLOWED_MODULES = 40;
const MAX_IMPORT_NAMES = 20;
const PY_FROM_IMPORT = /^\s*from\s+([\w.]+)\s+import\b(.*)$/;
const PY_IMPORT = /^\s*import\s+([\w.]+)/;
const MODEL_PATH = /^app\/models\/[^/]+\.py$|^app\/api\/v1\/[^/]+\/models\.py$/;

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Bounded text scan: does this file write the table? True on `Model(`, `insert|update|delete(Model`, `query(Model)....update|delete(` or raw SQL
 * (`INSERT INTO|UPDATE|DELETE FROM <table>`). Line by line, lines over MAX_PY_LINE ignored, no nested quantifiers: linear in the file size.
 */
function writesTable(content: string, className: string, table: string): boolean {
  // `from app.models.x import Model as _M`: the file may write the model through its alias.
  const names = [escapeRe(className)];
  const aliasRe = new RegExp(`\\b${escapeRe(className)}\\s+as\\s+([A-Za-z_]\\w*)`, "g");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.length > MAX_PY_LINE || !line.includes(" as ")) continue;
    for (const a of line.matchAll(aliasRe)) names.push(escapeRe(a[1]!));
    if (names.length > 10) break;
  }
  const c = names.length === 1 ? names[0]! : `(?:${names.join("|")})`;
  const construct = new RegExp(`\\b${c}\\s*\\(`);
  const mutate = new RegExp(`\\b(?:insert|update|delete)\\(\\s*${c}\\b`);
  const queried = new RegExp(`\\bquery\\(\\s*${c}\\s*\\)`);
  const sql = new RegExp(`\\b(?:insert\\s+into|update|delete\\s+from)\\s+(?:\\w+\\.)?${escapeRe(table)}\\b`, "i");
  for (const line of lines) {
    if (line.length > MAX_PY_LINE) continue;
    if (construct.test(line) || mutate.test(line) || sql.test(line)) return true;
    if (queried.test(line) && (line.includes(".update(") || line.includes(".delete("))) return true;
  }
  return false;
}

/** The `app.services.*` modules a Python file imports, as candidate file paths per module (capped). */
function serviceImports(content: string): string[][] {
  const out: string[][] = [];
  const add = (mod: string): void => {
    const base = mod.replace(/\./g, "/");
    out.push([`${base}.py`, `${base}/__init__.py`]);
  };
  for (const line of content.split(/\r?\n/)) {
    if (out.length >= MAX_FOLLOWED_MODULES) break;
    if (line.length > MAX_PY_LINE) continue;
    const from = PY_FROM_IMPORT.exec(line);
    if (from !== null) {
      const mod = from[1]!;
      if (mod === "app.services") {
        for (const raw of from[2]!.replace(/[()]/g, " ").split(",").slice(0, MAX_IMPORT_NAMES)) {
          const name = raw.trim().split(/\s+/)[0] ?? "";
          if (/^[A-Za-z_]\w*$/.test(name)) add(`app.services.${name}`);
        }
      } else if (mod.startsWith("app.services.")) add(mod);
      continue;
    }
    const imp = PY_IMPORT.exec(line);
    if (imp !== null && imp[1]!.startsWith("app.services.")) add(imp[1]!);
  }
  return out;
}

type EdgeCheck = Pick<ToolTableEdge, "verifiedBy" | "reason" | "via">;

function verifyEdge(seed: ToolTableSeed, tables: Record<string, ModelTable>, writers: ApiWriter[], files: Map<string, string>, routerPaths: Set<string>, modelPaths: Set<string>): EdgeCheck {
  const file = seed.seed.replace(/:\d+$/, "");
  const model = Object.prototype.hasOwnProperty.call(tables, seed.table) ? tables[seed.table]! : undefined;
  if (model === undefined) return { verifiedBy: "none", reason: "table_not_in_models" };
  if (writers.some((w) => w.file === file && w.tables.includes(seed.table))) return { verifiedBy: "router" };
  if (model.file === file) return { verifiedBy: "model" };
  if (modelPaths.has(file) || MODEL_PATH.test(file)) return { verifiedBy: "none", reason: "table_defined_elsewhere" };
  const content = files.get(file);
  if (content === undefined) return { verifiedBy: "none", reason: "seed_file_not_read" };
  if (writesTable(content, model.className, seed.table)) return { verifiedBy: routerPaths.has(file) ? "router" : "service" };
  let unread = false;
  for (const candidates of serviceImports(content)) {
    const path = candidates.find((c) => c !== file && files.has(c));
    if (path === undefined) {
      unread = true;
      continue;
    }
    if (writesTable(files.get(path)!, model.className, seed.table)) return { verifiedBy: "service", via: path };
  }
  return { verifiedBy: "none", reason: unread ? "service_not_read" : "no_write_in_seed_file" };
}

/** The backend half: parsed tables, writer endpoints, verified tool->table edges and VC read edges. Pure; the caller decides what an empty result means. */
export function buildBackendKg(modelFiles: RepoFile[], routerFiles: RepoFile[], opts: BuildBackendKgOptions): BackendKg {
  const models = parseSqlalchemyModels(modelFiles);
  const writers = parseRouterWrites(routerFiles, models.tables);
  const has = (t: string): boolean => Object.prototype.hasOwnProperty.call(models.tables, t);
  const seeds = opts.seeds ?? TOOL_TABLE_SEEDS;
  const text = (list: readonly RepoFile[] | undefined): RepoFile[] => (Array.isArray(list) ? list : []).filter((f) => typeof f?.path === "string" && typeof f?.content === "string" && f.content.length <= MAX_PY_BYTES);
  const files = new Map<string, string>();
  for (const f of [...text(opts.serviceFiles), ...text(routerFiles)]) files.set(f.path, f.content);
  const routerPaths = new Set(text(routerFiles).map((f) => f.path));
  const modelPaths = new Set(text(modelFiles).map((f) => f.path));
  const toolEdges: ToolTableEdge[] = seeds.map((s) => {
    const check = verifyEdge(s, models.tables, writers, files, routerPaths, modelPaths);
    return {
      tool: s.tool,
      table: s.table,
      rel: "writes",
      seed: s.seed,
      tableFound: has(s.table),
      writerFound: check.verifiedBy === "router" || check.verifiedBy === "service", // tf-fix-2: "model" only proves the table is defined there, not that anything writes it
      definedInModel: check.verifiedBy === "model",
      verifiedBy: check.verifiedBy,
      ...(check.reason === undefined ? {} : { reason: check.reason }),
      ...(check.via === undefined ? {} : { via: check.via }),
    };
  });
  const readEdges: VcReadEdge[] = [...new Set(opts.vcReadTables)].sort().map((t) => ({ table: t, rel: "vc-reads", tableFound: has(t) }));
  return { version: 1, tables: models.tables, writers, toolEdges, readEdges, diagnostics: models.diagnostics, source: opts.source };
}
