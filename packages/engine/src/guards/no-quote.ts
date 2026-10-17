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

function normaliseForMatch(text: string): string {
  return text.normalize("NFC").replace(INVISIBLE, "").replace(ODD_SPACE, " ");
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
  let out = normaliseForMatch(text);
  const removed = new Map<string, true>();
  const targets: { speakerId: string; alias: string }[] = [];
  for (const s of speakers.speakers) {
    if (s.permission) continue;
    for (const alias of s.aliases) targets.push({ speakerId: s.id, alias });
  }
  for (const name of extraNames) if (name.trim()) targets.push({ speakerId: "extra", alias: name });
  targets.sort((a, b) => b.alias.length - a.alias.length);
  for (const { speakerId, alias } of targets) {
    const re = namePattern(alias);
    if (re.test(out)) {
      re.lastIndex = 0;
      out = out.replace(re, SPEAKER_PLACEHOLDER);
      removed.set(speakerId, true);
    }
  }
  return { text: out, removed: [...removed.keys()].map((speakerId) => ({ speakerId })) };
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
    if (label.trim() && namePattern(label).test(t)) found.push({ kind: "speaker-label", match: label });
  }
  return found;
}

/**
 * Removes personal identifiers from restricted (WhatsApp/unknown) text: phone numbers, every listed
 * speaker name (permission records do not apply to restricted material) and the given speakerLabels.
 */
export function redactPersonalIdentifiers(text: string, speakers: SpeakersFile, speakerLabels: readonly string[]): string {
  let out = normaliseForMatch(text).replace(PHONE, PHONE_PLACEHOLDER);
  const names = [...speakers.speakers.flatMap((s) => s.aliases), ...speakerLabels.filter((l) => l.trim())].sort((a, b) => b.length - a.length);
  for (const name of names) out = out.replace(namePattern(name), SPEAKER_PLACEHOLDER);
  return out;
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
