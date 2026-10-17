/**
 * P1 U6 rule-based classifiers for the student turn graph. No LLM sees the text to classify (spec
 * A15b, contract B24.6); every function here is a pure regex/keyword decision.
 *
 *  - `classifyQuestion`: personal vs generic, FAIL-CLOSED. A question is `generic` only when it has a
 *    recognised question/topic shape AND carries no personal marker (first-person words in English,
 *    Hinglish or Devanagari; advice verbs; a phone number; a self-description). Everything else,
 *    including empty, very long or unrecognised text, is `personal` (anonymous mode answers it with
 *    `sign_in_required`).
 *  - `classifyIntent`: picks the student-graph tool/feature for a turn (spec A21(b)); the names are
 *    the tools in the capability manifest (skills/vc-capabilities/SKILL.md).
 *  - `isDraftingRequest`: "write my SOP/essay for me" (spec A21(a)); turned into coaching, never a draft.
 *
 * Tested for English and Hindi/Hinglish only (spec scope item 13).
 */

export type QuestionClass = "personal" | "generic";

export interface QuestionClassification {
  class: QuestionClass;
  reasons: string[];
}

const MAX_GENERIC_LENGTH = 500;

// First-person / possessive markers. "main"/"mai" (Hinglish "I") is listed knowingly: English "main
// campus" then reads as personal, which is the safe direction.
const PERSONAL_EN = /\b(i|i'm|im|i've|i'd|i'll|me|my|mine|myself|we|we're|our|ours|us)\b/i;
const PERSONAL_HINGLISH = /\b(main|mai|mera|meri|mere|mujhe|mujhko|maine|hum|humein|hamara|hamari|hamare|humara|humari|humare|apna|apni|apne|mko|mjhe)\b/i;
const PERSONAL_DEVANAGARI = /(?<![ऀ-ॿ])(मैं|मै|मेरा|मेरी|मेरे|मुझे|मुझको|मैंने|हम|हमें|हमारा|हमारी|हमारे|अपना|अपनी|अपने)(?![ऀ-ॿ])/;
// Advice / evaluation verbs that only make sense about a person's own case.
const ADVICE = /\b(should|recommend|suggest|advise|chances?|eligible|eligibility|suits?|suitable for|better for|best for|someone like|in my case|review|evaluate|assess|help me|choose|decide|pick)\b/i;
const ADVICE_HINGLISH = /\b(chahiye|batao|bataiye|suggest karo|sahi rahega|milegi|milega|mil jayega|mil jaegi|kahan jaun|kya karu|kya karun)\b/i;
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,13}\d/;
// U7 repair F: an email address is personal data exactly like a phone number.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

// Generic question / topic shape. A bare noun ("Germany", "UK?") has neither and stays personal.
const QUESTION_EN = /^\s*(what|how|which|when|where|who|why|is|are|do|does|can|could|will|would|list|explain|tell)\b/i;
const QUESTION_HINGLISH = /\b(kya|kaise|kitna|kitni|kitne|kab|kahan|kaun|kaunsa|kaunsi|kyun|kyon)\b/i;
const QUESTION_DEVANAGARI = /(क्या|कैसे|कितना|कितनी|कितने|कब|कहाँ|कहां|कौन|क्यों)/;

export function classifyQuestion(text: string): QuestionClassification {
  const t = (text ?? "").normalize("NFC").trim();
  const reasons: string[] = [];
  if (t.length === 0) return { class: "personal", reasons: ["empty"] };
  if (t.length > MAX_GENERIC_LENGTH) return { class: "personal", reasons: ["too_long"] };
  if (PERSONAL_EN.test(t)) reasons.push("first_person_en");
  if (PERSONAL_HINGLISH.test(t)) reasons.push("first_person_hinglish");
  if (PERSONAL_DEVANAGARI.test(t)) reasons.push("first_person_devanagari");
  if (ADVICE.test(t) || ADVICE_HINGLISH.test(t)) reasons.push("advice_request");
  if (PHONE.test(t)) reasons.push("phone_number");
  if (EMAIL.test(t)) reasons.push("email_address");
  if (reasons.length > 0) return { class: "personal", reasons };
  const looksLikeQuestion = QUESTION_EN.test(t) || QUESTION_HINGLISH.test(t) || QUESTION_DEVANAGARI.test(t);
  const words = t.split(/\s+/).filter(Boolean).length;
  if (!looksLikeQuestion || words < 3) return { class: "personal", reasons: ["ambiguous"] };
  return { class: "generic", reasons: ["generic_question"] };
}

// ---------------------------------------------------------------------------
// Drafting requests (A21(a))
// ---------------------------------------------------------------------------
const DOC_EN = /\b(sop|sops|statement of purpose|personal statement|essays?|motivation letter|cover letter|lor|letter of recommendation|recommendation letter|supplementals?|why[- ]this[- ]university)\b/i;
const DOC_HI = /(निबंध|एसओपी|SOP)/;
const WRITE_EN = /\b(write|writes|draft|generate|compose|make me|rewrite|give me a full|create|prepare)\b/i;
const WRITE_HINGLISH = /\b(likh|likho|likhdo|likh do|likhke|likh ke|bana do|banado|bana ke|banake|taiyar kar)\b/i;
const WRITE_HI = /(लिख|बना दो|तैयार कर)/;
const FEEDBACK = /\b(feedback|review|check|improve|comments?|look at)\b.*\b(my|this)\b|\bhere is my\b|\bmy (sop|essay|draft)\b.*\b(feedback|review|check)/i;

// "How do I prepare for the LOR requirements?" asks about requirements, not for a draft (repair R6).
const REQUIREMENTS_Q = /\b(requirements?|required|needed|how many|eligib\w*|accepted|deadlines?|format|word limit)\b/i;
const WRITE_EN_STRONG = /\b(write|writes|draft|generate|compose|make me|rewrite|give me a full)\b/i;
const FOR_ME = /\b(my|me|mine|for me)\b/i;

export function isDraftingRequest(text: string): boolean {
  const t = (text ?? "").normalize("NFC");
  const doc = DOC_EN.test(t) || DOC_HI.test(t);
  const write = WRITE_EN.test(t) || WRITE_HINGLISH.test(t) || WRITE_HI.test(t);
  if (!doc || !write) return false;
  const strong = WRITE_EN_STRONG.test(t) || WRITE_HINGLISH.test(t) || WRITE_HI.test(t);
  // Only the weak verbs (prepare/create) plus a requirements question, with no "my/me": a KB question.
  if (!strong && REQUIREMENTS_Q.test(t) && !(FOR_ME.test(t) && !/\bhow\b/i.test(t))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Intent -> tool/feature (A21(b)). Order matters: the first matching rule wins.
// ---------------------------------------------------------------------------
export type StudentIntentTool =
  | "coach_draft_feedback"
  | "data_erasure"
  | "data_export"
  | "profile_correct"
  | "profile_confirm"
  | "profile_view"
  | "rank_options"
  | "source_freshness"
  | "kb_source_detail"
  | "coverage"
  | "channel_switch"
  | "search_kb";

// Repair R6: each rule needs the student's own reference ("my" data, "this/that" answer, "these"
// options) or a short confirmation utterance; a KB question that merely contains a trigger word
// ("latest", "compare", "remove", "yes ... correct", "rank") goes to search_kb.
const PREVIOUS = String.raw`(this|that|it|these|those|your|the) (answer|info|information|sources?|data|reply)|\b(this|that|it|these|those)`;
const INTENT_RULES: [StudentIntentTool, RegExp][] = [
  ["data_erasure", /\b(delete|erase|remove|forget|wipe)\b.*\bmy\b.*\b(data|information|account|history|details|profile|everything)\b|\b(delete|erase|remove|wipe)\b\s+my\b|\b(mera|meri|mere)\b.*\b(data|account|jankari)\b.*\b(delete|hata|mita)|(मेरा|मेरी|मेरे).*(डेटा|जानकारी).*(हटा|डिलीट|मिटा)/i],
  ["data_export", /\b(export|download|copy of)\b.*\bmy\b.*\b(data|information|history)\b|\bexport my\b/i],
  ["profile_correct", /\b(that'?s|this is|it'?s)\s+(wrong|incorrect|not right)\b|\bcorrect (it|that|my)\b|\bnot \d+\b.*\b(budget|score|percentage|marks)\b|\b(budget|score|percentage|marks) is\b.*\bnot\b/i],
  ["profile_view", /\bwhat do you know about me\b|\b(show|see|view)\b.*\bmy (profile|details|facts)\b|\bmy profile\b\s*\??$|मेरे बारे में क्या/i],
  ["rank_options", new RegExp(String.raw`\bcompare\b.*\b(these|those|them|both|the two|my (options|choices|shortlist|universities)|the options|options)\b|\b(vs\.?|versus)\b|\bwhich of (these|those|them)\b|\brank (these|them|those|my)\b|\bbest (one|option) for me\b|\bmy shortlist\b|\bshortlist (these|them|those)\b`, "i")],
  ["source_freshness", new RegExp(String.raw`\b(is|are|was|were)\s+(${PREVIOUS})\b.*\b(stale|outdated|out of date|up to date|old|recent|latest|current)\b|\bhow (old|recent|current) (is|are) (${PREVIOUS})\b|\b(${PREVIOUS})\b.*\b(stale|outdated|out of date)\b`, "i")],
  ["kb_source_detail", /\bwhere did (that|this) come from\b|\b(show|see)\b.*\bsources?\b|\bwhat is your source\b|\bsource\b\?/i],
  ["coverage", /\bwhich countries\b.*\bcover\b|\bwhat (do|can) you cover\b|\bcoverage\b|\bnot covered\b/i],
  ["channel_switch", /\b(switch|change|move)\b.*\b(voice|text|call|typing|chat)\b|\btype instead\b|\btalk instead\b|\binstead of (talking|typing)\b|\bvoice (mode|chat)\b/i],
];

// profile_confirm only for a short confirmation utterance (<= 6 words, no question mark).
const CONFIRM = /\b(yes|haan|ha|yep|yeah)\b.*\b(right|correct|sahi|confirm)\b|\bconfirm (it|that|this)\b|^\s*(yes|haan|ha)\s*[,.!]?\s*(that'?s|it'?s|thats)?\s*(right|correct|sahi)\b/i;
function isConfirmation(t: string): boolean {
  if (t.includes("?")) return false;
  if (t.split(/\s+/).filter(Boolean).length > 6) return false;
  return CONFIRM.test(t);
}

export function classifyIntent(text: string): StudentIntentTool {
  const t = (text ?? "").normalize("NFC");
  if (isDraftingRequest(t) || FEEDBACK.test(t) && (DOC_EN.test(t) || /\bdraft\b/i.test(t))) return "coach_draft_feedback";
  for (const [tool, re] of INTENT_RULES) {
    if (tool === "profile_view" && isConfirmation(t)) return "profile_confirm";
    if (re.test(t)) return tool;
  }
  return "search_kb";
}
