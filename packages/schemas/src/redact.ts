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
 *  - Lower-case introductions are caught too (p1-u8r A1: "my name is devika nair", "i am kabir"): after "my name is", "name is",
 *    "i am", "i'm" and "call me", a lower-case word is taken as a name unless it is a common word (LOWER_NOT_NAME: "tired", "from",
 *    "a", "student", ...) or ends in "-ing". "this is" and "myself" still need a capital letter, because lower-case they are
 *    ordinary English ("this is hard"). A rare real name that is also an ordinary word ("i am will") is not caught.
 *  - Over-redaction is the accepted failure direction ("this is Germany" becomes "this is [NAME]"): stored history may be less
 *    readable, never more revealing.
 */

export const PII_PLACEHOLDERS = { email: "[EMAIL]", phone: "[PHONE]", name: "[NAME]" } as const;

export interface RedactOptions {
  /** Names to replace wherever they appear (whole word, any case), for example from the Pathlynks-supplied profile. */
  knownNames?: readonly string[];
  /**
   * Default true. False skips the self-introduction heuristics ("my name is X", "i am X", Hinglish, Devanagari) and keeps email, phone
   * and `knownNames` only. For a caller that must not change what a safety guard reads: a heuristic can turn "i am suicidal" into
   * "i am [NAME]" (p1-u8r), and an escalation must still see the crisis wording.
   */
  introductions?: boolean;
}

export interface RedactResult {
  text: string;
  counts: { email: number; phone: number; name: number };
  /**
   * The names the student stated about themselves in this input ("devika nair"), as typed. Not the knownNames the caller supplied.
   * A caller redacting a related text (the model's reply to this turn) passes these as `knownNames` so an echoed name is caught
   * (p1-u8r A2). Never store this list: it is the raw name.
   */
  names: string[];
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
const EN_LEAD = String.raw`(?:my\s+name\s+is|my\s+name['’]s|name\s+is|i\s+am|i['’]m|this\s+is|call\s+me|myself)`;
// Leads after which a lower-case word may be a name. "this is" and "myself" are ordinary English in lower case, so they need a capital.
const LOWER_OK_LEAD = /^(?:my\s+name\s+is|my\s+name['’]s|name\s+is|i\s+am|i['’]m|call\s+me)$/i;
const MAX_LOWER_NAME_TOKENS = 3;
// Words that follow these leads and are NOT names: function words, feelings, roles, places-prepositions, adverbs, time words.
const LOWER_NOT_NAME = new Set(
  (
    "a an the and or but so if then than that this these those there here where when while why how what which who whom whose because as at by for from in into of on onto off out over to up with without about above after again against all also am any are be been being before below between both can cannot could did do does doing done down during each either even ever every few had has have having he her hers him his i is it its just let me more most much my myself no nor not now only other our ours own same she should some such their them they too under until upon us very was we were will would you your yours yet " +
    "tired happy sad fine good great okay ok well bad confused worried stressed anxious nervous scared afraid excited interested curious ready sure unsure certain lost stuck alone lonely sick ill unwell bored angry upset sorry glad grateful thankful proud free busy late early new old young depressed hopeless overwhelmed undecided confident comfortable available eligible able unable " +
    "student students fresher graduate undergraduate postgraduate engineer engineering doctor medical commerce science arts class grade year years first second third final school college university " +
    "currently really actually still always never usually mostly recently probably definitely totally quite completely extremely absolutely pretty rather kind sort based living located indian international foreign male female single married " +
    "better worse best want wanna gonna suicidal worthless dead useless pointless broken empty numb trapped exhausted drained failure helpless unwanted unloved hurt cursed doomed gone finished " +
    "tomorrow today tonight later back please maybe anytime soon whenever once twice again " +
    "hai he h hu hun hoon aur ki ka ke main mai mujhe mein me se bhi ko nahi na abhi bahut kaafi ek"
  ).split(/\s+/),
);
const trimTail = (token: string): string => token.replace(/['.-]+$/u, "");
const isLowerNameToken = (raw: string): boolean => {
  const token = trimTail(raw);
  return [...token].length >= 2 && !LOWER_NOT_NAME.has(token.toLowerCase()) && !/ing$/i.test(token);
};
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
  const names: string[] = [];
  const introductions = options.introductions !== false;
  // English: the leading run of capitalised tokens is the name ("Priya from Pune" -> "Priya"). After a lead that allows it, a lower-case
  // token continues (or starts) the run unless it is a common word (p1-u8r A1).
  if (introductions) text = text.replace(EN_NAME, (whole, lead: string, tail: string) => {
    const lowerOk = LOWER_OK_LEAD.test(lead);
    const tokens = tail.split(/(\s+)/);
    let used = "";
    let consumed = 0;
    let lowerRun = 0;
    for (let i = 0; i < tokens.length; i += 2) {
      const tok = tokens[i]!;
      if (isUpper(tok)) {
        // a capitalised token always counts
      } else if (lowerOk && lowerRun < MAX_LOWER_NAME_TOKENS && isLowerNameToken(tok)) {
        lowerRun++;
      } else break;
      used += (i > 0 ? tokens[i - 1]! : "") + tok;
      consumed = i + 1;
      // A word that ends in a full stop closes the sentence, so the next capitalised word ("My name is Anita Verma. What ...") is not part of the name.
      // A one-letter initial ("A. Verma") does not.
      if (/\.$/.test(tok) && [...trimTail(tok)].length > 1) break;
    }
    if (used === "") return whole;
    counts.name++;
    names.push(used.split(/\s+/).map(trimTail).join(" "));
    const last = tokens[consumed - 1]!;
    const rest = tokens.slice(consumed).join("");
    return `${lead} ${PII_PLACEHOLDERS.name}${last.slice(trimTail(last).length)}${rest}`;
  });
  for (const re of introductions ? [HINGLISH_NAME, DEVANAGARI_NAME] : []) {
    text = text.replace(re, (_whole, lead: string, name: string) => {
      counts.name++;
      names.push(trimTail(name));
      return `${lead} ${PII_PLACEHOLDERS.name}`;
    });
  }
  const known = [...(options.knownNames ?? [])].map((n) => n.trim()).filter((n) => n.length > 0);
  // Whole names first, then each token of 3+ letters, so "Riya Sharma" is one [NAME] and a lone "Riya" is another.
  const phrases = [...new Set(known)].sort((a, b) => b.length - a.length);
  for (const n of phrases) text = replaceKnownName(text, n, counts);
  const tokens = [...new Set(known.flatMap((n) => n.split(/\s+/)).filter((t) => [...t].length >= 3))].sort((a, b) => b.length - a.length);
  for (const t of tokens) text = replaceKnownName(text, t, counts);
  return { text, counts, names: [...new Set(names)] };
}
