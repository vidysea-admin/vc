/**
 * P1 U8 (D-093 6A, contract B24.5 as amended): redacted persistence. Names, phone numbers and email addresses are replaced
 * by fixed placeholders BEFORE a student's text is stored. The live turn may still go to the model with the original text;
 * only what VC writes to its own database is redacted.
 *
 * New file, on purpose: packages/schemas had no PII helper, and U10 (voice transcripts) must reuse the same function so text
 * and voice history are redacted by one rule.
 *
 * Honest limits (stated, not hidden):
 *  - Emails and phone numbers are matched by shape, so they are reliable. A phone number is any 10-15 digit run (separators
 *    and Devanagari digits allowed); that also covers 12-digit national ids.
 *  - Names have no shape. Only a name the student states about themselves is caught: "my name is X", "I am X", "this is X",
 *    "mera naam X hai", Devanagari "मेरा नाम X है", plus any `knownNames` the caller supplies (for example the supplied
 *    profile name). A name mentioned in some other way ("my sister Anita") is NOT redacted. This is a weak proxy, not
 *    named-entity recognition, and the manifest reports it as an open risk.
 *  - Over-redaction is the accepted failure direction ("this is Germany" becomes "this is [NAME]"): stored history may be less
 *    readable, never more revealing.
 */

export const PII_PLACEHOLDERS = { email: "[EMAIL]", phone: "[PHONE]", name: "[NAME]" } as const;

export interface RedactOptions {
  /** Names to replace wherever they appear (whole word, any case), for example from the Pathlynks-supplied profile. */
  knownNames?: readonly string[];
}

export interface RedactResult {
  text: string;
  counts: { email: number; phone: number; name: number };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const DEVANAGARI_ZERO = 0x0966;
function digitCount(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x30 && c <= 0x39) || (c >= DEVANAGARI_ZERO && c <= DEVANAGARI_ZERO + 9)) n++;
  }
  return n;
}
// A digit run with common separators, not glued to a word or another number. Leading "+" / "(" allowed.
const PHONE_CANDIDATE = /(?<![\p{L}\p{M}\p{N}_])[+(]{0,2}[\d०-९][\d०-९\s().-]{6,}[\d०-९](?![\p{L}\p{M}\p{N}_])/gu;

const NAME_TOKEN = String.raw`\p{L}[\p{L}\p{M}'.-]*`;
const EN_LEAD = String.raw`(?:my\s+name\s+is|my\s+name's|name\s+is|i\s+am|i'm|this\s+is|call\s+me|myself)`;
const EN_NAME = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}])(${EN_LEAD})\s+(${NAME_TOKEN}(?:\s+${NAME_TOKEN}){0,3})`, "giu");
const HI_STOP = String.raw`(?:hai|he|h|hu|hun|hoon|aur|and|ki|ka|ke|main|mai|mujhe|mein|me|from|se)`;
const HINGLISH_NAME = new RegExp(
  String.raw`(?<![\p{L}\p{M}\p{N}])((?:mera|meri)\s+(?:naam|nam|name)(?:\s+hai)?)\s+((?!${HI_STOP}(?![\p{L}\p{M}]))${NAME_TOKEN}(?:\s+(?!${HI_STOP}(?![\p{L}\p{M}]))${NAME_TOKEN}){0,2})`,
  "giu",
);
const DEVA_TOKEN = String.raw`[\p{L}\p{M}]+`;
const DEVA_STOP = String.raw`(?:है|और|मुझे|में|से|का|की|के)`;
const DEVANAGARI_NAME = new RegExp(
  String.raw`(?<![\p{L}\p{M}])((?:मेरा|मेरी)\s+नाम(?:\s+है)?)\s+((?!${DEVA_STOP}(?![\p{L}\p{M}]))${DEVA_TOKEN}(?:\s+(?!${DEVA_STOP}(?![\p{L}\p{M}]))${DEVA_TOKEN}){0,2})`,
  "gu",
);

const isUpper = (token: string) => {
  const first = [...token][0]!;
  return first !== first.toLowerCase() && first === first.toUpperCase();
};
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function replaceKnownName(text: string, name: string, counts: RedactResult["counts"]): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return text;
  const phrase = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}])${parts.map(escapeRegex).join(String.raw`\s+`)}(?![\p{L}\p{M}\p{N}])`, "giu");
  return text.replace(phrase, () => {
    counts.name++;
    return PII_PLACEHOLDERS.name;
  });
}

export function redactPii(input: string, options: RedactOptions = {}): RedactResult {
  const counts = { email: 0, phone: 0, name: 0 };
  let text = input.replace(EMAIL, () => {
    counts.email++;
    return PII_PLACEHOLDERS.email;
  });
  text = text.replace(PHONE_CANDIDATE, (m) => {
    const n = digitCount(m);
    if (n < 10 || n > 15) return m;
    counts.phone++;
    return PII_PLACEHOLDERS.phone;
  });
  // English: only the leading run of capitalised tokens is the name ("Priya from Pune" -> "Priya").
  text = text.replace(EN_NAME, (whole, lead: string, tail: string) => {
    const tokens = tail.split(/(\s+)/);
    let used = "";
    let consumed = 0;
    for (let i = 0; i < tokens.length; i += 2) {
      const tok = tokens[i]!;
      if (!isUpper(tok)) break;
      used += (i > 0 ? tokens[i - 1]! : "") + tok;
      consumed = i + 1;
    }
    if (used === "") return whole;
    counts.name++;
    const rest = tokens.slice(consumed).join("");
    return `${lead} ${PII_PLACEHOLDERS.name}${rest}`;
  });
  for (const re of [HINGLISH_NAME, DEVANAGARI_NAME]) {
    text = text.replace(re, (_whole, lead: string) => {
      counts.name++;
      return `${lead} ${PII_PLACEHOLDERS.name}`;
    });
  }
  const known = [...(options.knownNames ?? [])].map((n) => n.trim()).filter((n) => n.length > 0);
  // Whole names first, then each token of 3+ letters, so "Riya Sharma" is one [NAME] and a lone "Riya" is another.
  const phrases = [...new Set(known)].sort((a, b) => b.length - a.length);
  for (const n of phrases) text = replaceKnownName(text, n, counts);
  const tokens = [...new Set(known.flatMap((n) => n.split(/\s+/)).filter((t) => [...t].length >= 3))].sort((a, b) => b.length - a.length);
  for (const t of tokens) text = replaceKnownName(text, t, counts);
  return { text, counts };
}
