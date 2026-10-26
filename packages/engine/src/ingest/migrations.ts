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
import type { IngestDiagnostic, MigrationParseResult, RepoFile, SchemaColumn } from "./types.js";

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
