/**
 * Hard-rule code guard for the P1 student surface's no-quote rule (contract B24.3, spec A3; D-088 Q8)
 * and the A22 personal-identifier / verbatim detector (contract B24.4). Deterministic, no LLM (B6).
 *
 * DEFAULT-DENY: a speaker listed in `speakers.json` is named in an answer ONLY when that speaker has a
 * written-permission record. Every other listed name or alias (Latin, transliterated, Devanagari) is
 * replaced by a neutral placeholder. External seminar speakers follow the same rule. `speakers.json`
 * holds aliases and permission records only, never KB content.
 *
 * Honest scope: names that are not in the alias list (and not passed as `extraNames`, e.g. the
 * speakerLabels of this turn's WhatsApp hits) are not detected; Hindi/transliterated names are covered
 * only by the alias list (spec A22). The verbatim check is a weak proxy for "anonymised paraphrase".
 *
 * U6h P5: a speakerLabel / extra name is expanded to the forms the evidence may carry - first name alone,
 * last name alone, reversed order ("Kulkarni, Sanjay"), initials ("S. Kulkarni", "Sanjay K.", "S. K.") - and
 * matching folds Latin diacritics ("Sanjáy" ~ "Sanjay"), on both the name and the text.
 */
import { z } from "zod";

const PermissionSchema = z
  .object({
    grantedBy: z.string().min(1),
    grantedAt: z.string().min(1),
    documentRef: z.string().min(1),
    scope: z.string().min(1),
  })
  .strict();

const SpeakerSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    external: z.boolean().optional(),
    permission: PermissionSchema.optional(),
  })
  .strict();

export const SpeakersFileSchema = z
  .object({
    _fixture: z.string().optional(),
    speakers: z.array(SpeakerSchema),
  })
  .strict();
export type SpeakersFile = z.infer<typeof SpeakersFileSchema>;
export type Speaker = z.infer<typeof SpeakerSchema>;

/** What a removed name is replaced with. Contains no alias of any fixture speaker. */
export const SPEAKER_PLACEHOLDER = "a speaker";
export const PHONE_PLACEHOLDER = "[number removed]";

// Invisible format characters (ZWSP, ZWNJ, ZWJ, word joiner, BOM, soft hyphen) are deleted and NBSP-like
// spaces become plain spaces before matching, so "Arjun<ZWSP>Mehrotra" cannot slip through.
const INVISIBLE = /[­​-‏⁠﻿]/g;
const ODD_SPACE = /[   -   　]/g;

/** Latin letter with its diacritics removed ("á" -> "a"); one UTF-16 unit in, one out, so match maps stay valid. */
function foldChar(ch: string): string {
  if (ch < "\u00c0" || !/\p{Script=Latin}/u.test(ch)) return ch;
  const base = ch.normalize("NFD")[0];
  return base && base.length === 1 ? base : ch;
}

function normaliseForMatch(text: string): string {
  return Array.from(text.normalize("NFC").replace(INVISIBLE, "").replace(ODD_SPACE, " "), foldChar).join("");
}

const IS_INVISIBLE = new RegExp(INVISIBLE.source);
const IS_ODD_SPACE = new RegExp(ODD_SPACE.source);

/**
 * Normalised text for MATCHING ONLY, plus a map from each normalised UTF-16 index to its index in the
 * NFC original. Replacements are applied to the original, so zero-width joiners that carry meaning in
 * Hindi (U+200C/U+200D) survive in output that has no name in it (repair R8).
 */
interface MatchView {
  orig: string;
  text: string;
  map: number[];
}
function matchView(text: string): MatchView {
  const orig = text.normalize("NFC");
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < orig.length; i++) {
    const ch = orig[i]!;
    if (IS_INVISIBLE.test(ch)) continue;
    out += IS_ODD_SPACE.test(ch) ? " " : foldChar(ch);
    map.push(i);
  }
  return { orig, text: out, map };
}

interface Span {
  start: number;
  end: number;
  replacement: string;
}

// A title or honorific directly before a removed name goes with it ("Dr. Kavya" -> "a speaker").
const TITLE_BEFORE = /(?<![\p{L}\p{M}\p{N}])(?:dr|mr|mrs|ms|miss|prof|professor|sir|shri|sri|smt|mx)\.?\s*$/iu;

function claim(spans: Span[], start: number, end: number, replacement: string): boolean {
  if (spans.some((s) => start < s.end && s.start < end)) return false;
  spans.push({ start, end, replacement });
  return true;
}

/** Claims every match of `re` in the view (longest-first callers pass longer names first). */
function claimMatches(view: MatchView, spans: Span[], re: RegExp, replacement: string, withTitle: boolean): boolean {
  let any = false;
  re.lastIndex = 0;
  for (const m of view.text.matchAll(re)) {
    let start = m.index!;
    if (withTitle) {
      const t = TITLE_BEFORE.exec(view.text.slice(Math.max(0, start - 12), start));
      if (t) start -= t[0].length;
    }
    if (claim(spans, start, m.index! + m[0].length, replacement)) any = true;
  }
  return any;
}

/** Rebuilds the ORIGINAL text with each claimed (normalised-coordinate) span replaced. */
function applySpans(view: MatchView, spans: Span[]): string {
  if (spans.length === 0) return view.orig;
  let out = "";
  let cursor = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const from = view.map[s.start]!;
    const to = view.map[s.end - 1]! + 1;
    out += view.orig.slice(cursor, from) + s.replacement;
    cursor = to;
  }
  return out + view.orig.slice(cursor);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A name pattern bounded by non-letters on both sides (works for Devanagari, where \b does not). */
function namePattern(alias: string): RegExp {
  const body = normaliseForMatch(alias)
    .trim()
    .split(/\s+/)
    .map(escapeRegex)
    // \s* not \s+: a deleted zero-width joiner ("Arjun<ZWSP>Mehrotra") must still match the full name.
    .join("\\s*");
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${body}(?![\\p{L}\\p{M}\\p{N}])`, "giu");
}

const BOUND_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}])";
const BOUND_AFTER = "(?![\\p{L}\\p{M}\\p{N}])";
const NAME_TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "professor", "sir", "shri", "sri", "smt", "mx"]);
// Name tokens that are also ordinary English words: alone they match only when capitalised, so "will" in a
// sentence is not blanked because a speaker is called Will. The full name still matches in any case.
const COMMON_WORD_NAMES = new Set([
  "will", "may", "mark", "rose", "grace", "hope", "bill", "dean", "chase", "joy", "faith", "dawn", "rich", "king", "young", "long",
  "brown", "white", "black", "green", "gold", "stone", "hall", "wood", "hill", "lake", "bank", "case", "page", "bond",
]);

interface NamePattern {
  /** Longest-first claiming: a longer form is claimed before the shorter forms it contains. */
  len: number;
  re: RegExp;
}

/**
 * A name/label and the other forms it appears in (U6h P5): first name, last name, reversed, initials. A label
 * of one token has only itself. Only labels and extra names are expanded; speakers.json aliases are already
 * enumerated by hand and stay exact.
 */
function labelPatterns(label: string): NamePattern[] {
  const full: NamePattern = { len: label.length, re: namePattern(label) };
  const parts = normaliseForMatch(label)
    .split(/[\s,]+/)
    .filter(Boolean)
    .filter((p, i) => !(i === 0 && NAME_TITLES.has(p.replace(/\.$/, "").toLowerCase())));
  if (parts.length < 2) return [full];
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const fi = Array.from(first)[0]!;
  const li = Array.from(last)[0]!;
  const q = escapeRegex;
  const wrap = (body: string, flags: string): RegExp => new RegExp(`${BOUND_BEFORE}(?:${body})${BOUND_AFTER}`, flags);
  const out: NamePattern[] = [
    full,
    { len: label.length + 1, re: wrap(`${q(last)}\\s*,?\\s*${q(first)}`, "giu") },
    { len: label.length, re: wrap(`${q(fi)}\\.?\\s*${q(last)}`, "giu") },
    { len: label.length, re: wrap(`${q(first)}\\s+${q(li)}\\.?`, "giu") },
    { len: 4, re: wrap(`${q(fi)}\\.\\s*${q(li)}\\.?`, "gu") },
  ];
  for (const part of new Set(parts)) {
    if (Array.from(part).length < 3 || /^\p{Lu}\.?$/u.test(part)) continue;
    if (COMMON_WORD_NAMES.has(part.toLowerCase())) {
      const cap = part[0]!.toUpperCase() + part.slice(1).toLowerCase();
      out.push({ len: part.length, re: wrap(`${q(cap)}|${q(part.toUpperCase())}`, "gu") });
    } else {
      out.push({ len: part.length, re: namePattern(part) });
    }
  }
  return out;
}

export interface NoQuoteResult {
  text: string;
  removed: { speakerId: string }[];
}

/**
 * Removes every name/alias of a listed speaker without a written-permission record, plus any
 * `extraNames` (always removed: they carry no permission record). Longest aliases first, so
 * "Arjun Mehrotra" is removed whole rather than leaving "Mehrotra".
 */
export function noQuoteGuard(text: string, speakers: SpeakersFile, extraNames: readonly string[] = []): NoQuoteResult {
  const view = matchView(text);
  const spans: Span[] = [];
  const removed = new Map<string, true>();
  const targets: { speakerId: string; len: number; re: RegExp }[] = [];
  for (const s of speakers.speakers) {
    if (s.permission) continue;
    for (const alias of s.aliases) targets.push({ speakerId: s.id, len: alias.length, re: namePattern(alias) });
  }
  for (const name of extraNames) if (name.trim()) for (const p of labelPatterns(name)) targets.push({ speakerId: "extra", ...p });
  targets.sort((a, b) => b.len - a.len);
  for (const { speakerId, re } of targets) {
    if (claimMatches(view, spans, re, SPEAKER_PLACEHOLDER, true)) removed.set(speakerId, true);
  }
  return { text: applySpans(view, spans), removed: [...removed.keys()].map((speakerId) => ({ speakerId })) };
}

// Indian/international phone shapes: an optional +CC, then >= 10 digits allowing single spaces/dashes.
// Dates (2026-03-04) and amounts (11,000) are too short or comma-separated to match.
const PHONE = /(?<![\p{N}])(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,13}\d(?![\p{N}])/gu;

export interface IdentifierFinding {
  kind: "phone" | "speaker" | "speaker-label";
  match: string;
}

/** The A22 detector: phone regex, every speakers.json name/alias (permitted or not), and speakerLabels. */
export function findPersonalIdentifiers(text: string, speakers: SpeakersFile, speakerLabels: readonly string[]): IdentifierFinding[] {
  const t = normaliseForMatch(text);
  const found: IdentifierFinding[] = [];
  for (const m of t.matchAll(PHONE)) found.push({ kind: "phone", match: m[0] });
  for (const s of speakers.speakers) {
    const hit = s.aliases.find((a) => namePattern(a).test(t));
    if (hit) found.push({ kind: "speaker", match: hit });
  }
  for (const label of speakerLabels) {
    if (label.trim() && labelPatterns(label).some((p) => p.re.test(t))) found.push({ kind: "speaker-label", match: label });
  }
  return found;
}

/**
 * Removes personal identifiers from restricted (WhatsApp/unknown) text: phone numbers, every listed
 * speaker name (permission records do not apply to restricted material) and the given speakerLabels.
 */
export function redactPersonalIdentifiers(text: string, speakers: SpeakersFile, speakerLabels: readonly string[]): string {
  const view = matchView(text);
  const spans: Span[] = [];
  claimMatches(view, spans, PHONE, PHONE_PLACEHOLDER, false);
  const names: NamePattern[] = [
    ...speakers.speakers.flatMap((s) => s.aliases).map((alias) => ({ len: alias.length, re: namePattern(alias) })),
    ...speakerLabels.filter((l) => l.trim()).flatMap((l) => labelPatterns(l)),
  ].sort((a, b) => b.len - a.len);
  for (const { re } of names) claimMatches(view, spans, re, SPEAKER_PLACEHOLDER, true);
  return applySpans(view, spans);
}

/** spec A22 [ASSUMPTION]: the verbatim bar. */
export const VERBATIM_RUN_WORDS = 8;

function words(text: string): string[] {
  return normaliseForMatch(text)
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

/** True when `answer` contains a run of >= `n` consecutive words that also appears consecutively in `source`. */
export function hasVerbatimRun(answer: string, source: string, n: number = VERBATIM_RUN_WORDS): boolean {
  const a = words(answer);
  const s = words(source);
  if (a.length < n || s.length < n) return false;
  const grams = new Set<string>();
  for (let i = 0; i + n <= s.length; i++) grams.add(s.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= a.length; i++) if (grams.has(a.slice(i, i + n).join(" "))) return true;
  return false;
}
