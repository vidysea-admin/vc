/**
 * P1 U6 rule-based classifiers for the student turn graph. No LLM sees the text to classify (spec
 * A15b, contract B24.6); every function here is a pure regex/keyword decision.
 *
 *  - `classifyQuestion`: personal vs generic, FAIL-CLOSED. A question is `generic` only when it has a
 *    recognised public small-talk or question/topic shape AND carries no personal marker (first-person words in English,
 *    Hinglish or Devanagari; advice verbs; a phone number; a self-description). Everything else,
 *    including empty, very long or unrecognised text, is `personal` (anonymous mode answers it with
 *    `sign_in_required`).
 *  - `classifyIntent`: picks the student-graph tool/feature for a turn (spec A21(b)); the names are
 *    the tools in the capability manifest (skills/vc-capabilities/SKILL.md).
 *  - `isDraftingRequest`: "write my SOP/essay for me" (spec A21(a)); turned into coaching, never a draft.
 *
 * Tested for English and Hindi/Hinglish only (spec scope item 13).
 */

import { QUEST_TASK_PATTERNS, VIDYSEA_RECIPES } from "../tools/navigate.js";

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
const QUESTION_EN = /^\s*(?:please\s+)?(what|how|which|when|where|who|why|is|are|do|does|can|could|will|would|list|explain|tell)\b/i;
const QUESTION_HINGLISH = /\b(kya|kaise|kitna|kitni|kitne|kab|kahan|kaun|kaunsa|kaunsi|kyun|kyon)\b/i;
const QUESTION_DEVANAGARI = /(क्या|कैसे|कितना|कितनी|कितने|कब|कहाँ|कहां|कौन|क्यों)/;

/** Exact public small-talk only. Caller must retain crisis/consent/privacy guards before using the reply. */
export function publicSmallTalkReply(text: string): string | undefined {
  const t = (text ?? "").normalize("NFKC").trim().toLowerCase();
  if (!t || t.length > MAX_GENERIC_LENGTH) return undefined;
  const exact = t.replace(/[!?.।]+$/u, "").trim();
  if (/^(?:hi|hi there|hello|hello there|hey|namaste|namaskar|good morning|good afternoon|good evening|नमस्ते|नमस्कार|हाय|हेलो)$/.test(exact)) {
    return "Hello! I can help you explore careers, courses and study options. What would you like to explore?";
  }
  if (/^(?:thanks|thank you|thank you very much|धन्यवाद|शुक्रिया)$/.test(exact)) return "You're welcome! What would you like to explore next?";
  if (/^(?:help|help please|please help|what can you do|how can you help|how can you help me|what do you do|who are you|can you help(?: me)?|what can you help me with|what can i ask|आप क्या कर सकते हैं)$/.test(exact)) {
    return "I can help you explore careers, courses and study options, and explain how to use Pathlynks. General questions do not need sign-in. Sign in to view your saved careers or account details.";
  }
  return undefined;
}

export function classifyQuestion(text: string): QuestionClassification {
  const t = (text ?? "").normalize("NFC").trim();
  const reasons: string[] = [];
  if (t.length === 0) return { class: "personal", reasons: ["empty"] };
  if (t.length > MAX_GENERIC_LENGTH) return { class: "personal", reasons: ["too_long"] };
  if (publicSmallTalkReply(t) !== undefined) return { class: "generic", reasons: ["public_small_talk"] };
  // Remove only the leading service-directed "me"; all remaining personal markers/PII still fail closed.
  const subject = t.replace(/^(?:please\s+)?(?:(?:what\s+(?:can|could)\s+you\s+)?(?:tell me|show me|explain to me))\b/i, (prefix) => prefix.replace(/\bme\b/i, ""));
  if (PERSONAL_EN.test(subject)) reasons.push("first_person_en");
  if (/\b(?:saved|shortlisted|bookmarked)\s+careers?\s*[?.!]*$|\b(?:account\s+(?:password|details|data)|assessment\s+(?:status|results?|scores?)|profile\s+(?:details|data))\b/i.test(t)) reasons.push("private_account_data");
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
  // vc-admin-control S6: the live Pathlynks reads (own rows only) and the text-only navigation steps.
  | "vidysea_profile"
   | "vidysea_shortlisted_programmes"
   | "vidysea_profile_assessment"
   | "vidysea_pathlynks_snapshot"
   // tool-first T4 (S8): the student's own journey / application / visa / favourite / scholarship rows and the progress summary.
   | "vidysea_journey_maps"
   | "vidysea_applications"
   | "vidysea_visa"
   | "vidysea_favourites"
   | "vidysea_saved_scholarships"
   | "vidysea_progress"
   // D-134: Career Quest (Mongo `pathlynks_journey`) own-progress reads on a Pathlynks site.
   | "pathlynks_quest_progress"
   | "pathlynks_goals"
   | "pathlynks_year_plan"
   | "pathlynks_profile"
  | "pathlynks_saved_careers"
  | "pathlynks_compare"
  | "pathlynks_assessment"
  | "pathlynks_career_fit"
  | "pathlynks_report"
  | "navigate_steps"
  | "search_kb";

// Repair R6: each rule needs the student's own reference ("my" data, "this/that" answer, "these"
// options) or a short confirmation utterance; a KB question that merely contains a trigger word
// ("latest", "compare", "remove", "yes ... correct", "rank") goes to search_kb.
const PREVIOUS = String.raw`(this|that|it|these|those|your|the) (answer|info|information|sources?|data|reply)|\b(this|that|it|these|those)`;
// T-057 R2 service routing. Each piece is a fragment of one anchored regex; see the comment at the rule list.
const SVC_NOUN = String.raw`(?:(?:student|education(?:al)?|study(?:ing)?|abroad|overseas|international|bank|higher[- ]education)(?:\s+|-))*(?:loans?|visas?|scholarships?|counsell?ing|counsell?ors?|test[- ]prep(?:aration)?|(?:ielts|gre|gmat|toefl|pte|sat|duolingo)(?:\s+(?:coaching|prep(?:aration)?|classes|training|test))?|board\s+recommender|journey\s+map|consult(?:ants?|ancy|ancies))`;
const SVC_SUFFIX = String.raw`(?:\s+(?:assistance|help|support|services?|guidance|application|process|counsell?ing))?`;
const SVC_DET = String.raw`(?:(?:my|a|an|the|any|some|our)\s+)?`;
const SVC_TAIL = String.raw`(?:\s+(?:for|to|in)\s+(?:(?:my|the)\s+)?(?:study(?:ing)?\s+(?:abroad|overseas)|abroad|overseas|higher\s+(?:studies|education)|studies))?(?:\s+(?:also|too|as\s+well))?(?:(?:\s*,\s*|\s+)(?:please|pls|plz|kindly|sir|mam|madam|ma'am|bhai|yaar|thanks|thank\s+you))?[\s?.!,]*$`;
const SVC_LEAD = String.raw`^\s*(?:(?:hi|hello|hey|ok|okay|so|also|and|btw)[,!.\s]+)*`;
const SVC_SUBJECT = String.raw`(?:(?:can|could|will|would|do|does|did)\s+)?(?:you|u|vidysea|pathlynks|(?:your|the\s+vidysea|vidysea)\s+team)(?:\s+guys)?\s+(?:also\s+)?(?:actually\s+)?`;
const HINGLISH_ASK = String.raw`(?:madad|sahayata|sahayta|help|assistance|guidance)`;
const HINGLISH_END = String.raw`(?:\s+(?:chahiye|chahie|milegi|milega|milti\s+hai|milta\s+hai|mil\s+sakti\s+hai|mil\s+sakta\s+hai|kar\s+do|karo|hai|hoga|hogi|kar(?:te|ta|ti|oge|ogi)(?:\s+(?:ho|hain|hai|hoon))?))?`;
const SERVICE_ASK_RULES: RegExp[] = [
  // "do you help with education loans", "can vidysea help me with my visa", "does vidysea provide scholarship assistance"
  new RegExp(String.raw`${SVC_LEAD}${SVC_SUBJECT}(?:help|assist|offer|provide|do|have)\s+(?:(?:me|us)\s+)?(?:(?:with|for|in|on)\s+)?${SVC_DET}${SVC_NOUN}${SVC_SUFFIX}${SVC_TAIL}`, "i"),
  // "help me with visa for study abroad", "I need help with my student loan", "I need a loan"
  new RegExp(String.raw`${SVC_LEAD}(?:please\s+)?(?:(?:i|we)\s+)?(?:(?:need|want|require)\s+(?:some\s+)?(?:help|assistance|support|guidance)\s+(?:with|for|in|on)|help\s+me\s+(?:with|for|in)|assist\s+me\s+(?:with|for|in)|(?:need|want|require|looking\s+for)\s+(?:a\s+|an\s+|some\s+)?)\s*${SVC_DET}${SVC_NOUN}${SVC_SUFFIX}${SVC_TAIL}`, "i"),
  // "visa help", "visa help please", "I need visa help"
  new RegExp(String.raw`${SVC_LEAD}(?:please\s+)?(?:(?:i|we)\s+)?(?:(?:need|want|require)\s+)?(?:some\s+)?${SVC_NOUN}\s+(?:help|assistance|assist|support|services?)${SVC_TAIL}`, "i"),
  // "what services do you offer", "what are your services", "what services does vidysea provide"
  new RegExp(String.raw`${SVC_LEAD}(?:(?:what|which)\s+(?:all\s+)?(?:services|products)\s+(?:(?:do|does|can)\s+(?:you|u|vidysea|pathlynks|your\s+team)\s+(?:offer|provide|have)|(?:are|is)\s+(?:available|offered|provided)(?:\s+(?:here|with\s+you|with\s+vidysea|on\s+vidysea|at\s+vidysea|on\s+(?:this|the)\s+(?:platform|site|website|portal)))?)|(?:what\s+(?:are|is)\s+)?(?:your|vidysea'?s?)\s+services|(?:tell\s+me\s+about\s+)?(?:your|vidysea'?s?)\s+services)${SVC_TAIL}`, "i"),
  // "where is the journey map", "show me the journey map"
  new RegExp(String.raw`${SVC_LEAD}(?:where\s+(?:is|can\s+i\s+(?:find|see)|do\s+i\s+(?:find|see))|show\s+me|open)\s+(?:the\s+|my\s+)?journey\s+map\s*[?.!]*\s*$`, "i"),
  // Hinglish: "loan madad milegi?", "visa me madad chahiye", "kya aap scholarship mein help karte ho"
  new RegExp(String.raw`${SVC_LEAD}(?:kya\s+)?(?:(?:aap|aap\s+log|tum|vidysea|aapki\s+team)\s+)?(?:(?:mujhe|mere\s+liye|meri|mera)\s+)?${SVC_NOUN}\s+(?:(?:me|mein|mai|ke\s+liye|ki|ka|ke)\s+)?${HINGLISH_ASK}${HINGLISH_END}\s*[?.!]*\s*$`, "i"),
];

// tool-first T4 (S8): the student's OWN tracking asks ("what is my application status", "what next"). Each pattern is anchored at both ends and needs "my"
// (or a first-person phrase), so a KB question that shares words ("what is the visa processing time", "what should I do next if my visa is rejected") and an ask
// about someone else stay unmatched. Free-word slots are fixed alternations; no unbounded nested quantifier. They sit after the T1 recipes, which win a collision.
const T_LEAD = String.raw`^\s*(?:(?:hi|hello|hey|ok|okay|so|also|and|btw)[,!.\s]+)*(?:(?:please|pls|plz|kindly)\s+)?(?:(?:can|could|will|would)\s+you\s+(?:please\s+)?)?`;
const T_TAIL = String.raw`(?:(?:\s*,\s*|\s+)(?:please|pls|plz|kindly|sir|mam|madam|bhai|yaar|thanks|thank\s+you))?[\s?.!,]*$`;
const T_VIEW = String.raw`(?:(?:show|list|check|view|see|tell|track)\s+(?:me\s+)?|what(?:'s|\s+is|\s+are)\s+|how(?:'s|\s+is|\s+are)\s+)`;
const T_STATE = String.raw`(?:status|progress|summary|update|details|overview|list|so\s+far)`;
const T_TOPICS: [StudentIntentTool, { one: string; many: string; hinglish: string }][] = [
  ["vidysea_journey_maps", { one: String.raw`(?:study[- ]abroad\s+)?(?:journey(?:\s+maps?)?|journeys|roadmaps?)`, many: String.raw`(?:journey\s+maps|journeys|roadmaps)`, hinglish: String.raw`(?:journey(?:\s+map)?|roadmap)` }],
  ["vidysea_applications", { one: String.raw`(?:(?:university|college)\s+)?applications?`, many: String.raw`applications`, hinglish: String.raw`applications?` }],
  ["vidysea_visa", { one: String.raw`visa(?:\s+applications?)?`, many: String.raw`visa\s+applications`, hinglish: String.raw`visa` }],
  ["vidysea_favourites", { one: String.raw`favou?rite(?:s|d)?(?:\s+(?:universities|colleges?|courses?|programmes?|programs?|list))?`, many: String.raw`favou?rites`, hinglish: String.raw`favou?rites?` }],
  ["vidysea_saved_scholarships", { one: String.raw`(?:saved\s+)?scholarships?`, many: String.raw`scholarships`, hinglish: String.raw`scholarships?` }],
  // D-134: Career Quest on a Pathlynks site. "my" is still required by every shape; a KB question ("what is career quest", "how do I set a goal") has no "my".
  ["pathlynks_quest_progress", { one: String.raw`(?:career\s+quest(?:\s+(?:islands?|level|xp))?|quest\s+(?:islands?|level|xp)|islands?|target\s+universit(?:y|ies)|career\s+picks)`, many: String.raw`(?:career\s+picks|islands)`, hinglish: String.raw`(?:career\s+quest|quest)` }],
  ["pathlynks_goals", { one: String.raw`goals?`, many: String.raw`goals`, hinglish: String.raw`goals?` }],
  ["pathlynks_year_plan", { one: String.raw`(?:year(?:ly)?\s+plan|activities)`, many: String.raw`activities`, hinglish: String.raw`(?:year\s+plan|activities)` }],
];
const OWN_PROGRESS_RULES: [StudentIntentTool, RegExp][] = [
  ...T_TOPICS.flatMap(([tool, t]): [StudentIntentTool, RegExp][] => [
    [tool, new RegExp(`${T_LEAD}${T_VIEW}my\\s+${t.one}(?:\\s+${T_STATE})?(?:\\s+(?:going|looking))?${T_TAIL}`, "i")],
    [tool, new RegExp(`${T_LEAD}my\\s+${t.one}\\s+${T_STATE}${T_TAIL}`, "i")],
    [tool, new RegExp(`${T_LEAD}(?:status|progress|summary)\\s+of\\s+my\\s+${t.one}${T_TAIL}`, "i")],
    [tool, new RegExp(`${T_LEAD}(?:how\\s+many|which|what)\\s+${t.many}\\s+(?:do\\s+i\\s+have|have\\s+i\\s+(?:saved|started|made|created|submitted|added)|did\\s+i\\s+(?:save|start|make|create|submit|add))(?:\\s+so\\s+far)?${T_TAIL}`, "i")],
    [tool, new RegExp(`${T_LEAD}(?:mer[ei]|mera)\\s+${t.hinglish}\\s+(?:ka\\s+|ki\\s+|ke\\s+)?(?:status|progress)(?:\\s+(?:dikhao|dikhaiye|batao|bataiye|kya\\s+hai))?${T_TAIL}`, "i")],
    // route-fix-1: "mera visa kahan tak pahuncha", "mere scholarships dikhao". "mera/meri/mere" is still required, so a KB-shaped worry stays with the KB.
    [tool, new RegExp(`${T_LEAD}(?:mer[ei]|mera)\\s+${t.hinglish}\\s+(?:kahan|kaha)\\s+tak\\s+(?:pahunch(?:a|i|e)?|pahuch(?:a|i|e)?|gaya|gayi)${T_TAIL}`, "i")],
    [tool, new RegExp(`${T_LEAD}(?:mer[ei]|mera)\\s+${t.hinglish}\\s+(?:dikhao|dikhaiye|batao|bataiye)${T_TAIL}`, "i")],
  ]),
  ["vidysea_applications", new RegExp(`${T_LEAD}(?:did|have)\\s+i\\s+(?:apply|applied|submit|submitted)\\s+(?:to\\s+|for\\s+)?(?:any|anything|anywhere)(?:\\s+(?:yet|so\\s+far))?${T_TAIL}`, "i")],
  // D-134 Hinglish / Devanagari without "status": "mere goals dikhao", "mere activities batao", "meri target university kya hai".
  ["pathlynks_goals", new RegExp(`${T_LEAD}(?:mer[ei]|mera)\\s+goals?\\s+(?:dikhao|dikhaiye|batao|bataiye|kya\\s+hain?)${T_TAIL}`, "i")],
  ["pathlynks_goals", /^\s*(?:मेरे|मेरा|मेरी)\s+(?:गोल्स?|लक्ष्य)(?:\s+(?:दिखाओ|बताओ|क्या\s+(?:है|हैं)))?[\s?.!।]*$/],
  ["pathlynks_year_plan", new RegExp(`${T_LEAD}(?:mer[ei]|mera)\\s+(?:year\\s+plan|activities)\\s+(?:dikhao|dikhaiye|batao|bataiye|kya\\s+hain?)${T_TAIL}`, "i")],
  ["pathlynks_quest_progress", new RegExp(`${T_LEAD}(?:mer[ei]|mera)\\s+(?:target\\s+universit(?:y|ies)|career\\s+picks|career\\s+quest)\\s+(?:dikhao|dikhaiye|batao|bataiye|kya\\s+hain?)${T_TAIL}`, "i")],
  ["vidysea_progress", new RegExp(`${T_LEAD}(?:${T_VIEW})?my\\s+(?:overall\\s+)?(?:progress|status)(?:\\s+(?:so\\s+far|overall|update))?${T_TAIL}`, "i")],
  ["vidysea_progress", new RegExp(`${T_LEAD}how\\s+(?:am\\s+i\\s+doing|far\\s+(?:have\\s+i\\s+come|along\\s+am\\s+i))(?:\\s+so\\s+far)?${T_TAIL}`, "i")],
  ["vidysea_progress", new RegExp(`${T_LEAD}where\\s+do\\s+i\\s+stand(?:\\s+(?:now|right\\s+now|so\\s+far))?${T_TAIL}`, "i")],
  ["vidysea_progress", new RegExp(`${T_LEAD}(?:so\\s+)?what(?:'s|\\s+is|\\s+should\\s+i\\s+do|\\s+do\\s+i\\s+do)?\\s+(?:my\\s+)?next(?:\\s+steps?)?(?:\\s+for\\s+me)?${T_TAIL}`, "i")],
  ["vidysea_progress", new RegExp(`${T_LEAD}(?:my\\s+)?next\\s+steps?${T_TAIL}`, "i")],
  ["vidysea_progress", new RegExp(`${T_LEAD}(?:ab\\s+)?aage\\s+kya\\s+(?:karu|karun|karoon|karna\\s+hai)${T_TAIL}`, "i")],
  ["vidysea_progress", new RegExp(`${T_LEAD}(?:mera|meri)\\s+(?:progress|status)\\s+(?:dikhao|dikhaiye|batao|bataiye|kya\\s+hai)${T_TAIL}`, "i")],
  ["vidysea_progress", /^\s*(?:मेरी|मेरा)\s+(?:प्रगति|प्रोग्रेस)(?:\s+(?:दिखाओ|बताओ|क्या\s+है))?[\s?.!।]*$/],
];

const INTENT_RULES: [StudentIntentTool, RegExp][] = [
  ["data_erasure", /\b(delete|erase|remove|forget|wipe)\b.*\bmy\b.*\b(data|information|account|history|details|profile|everything)\b|\b(delete|erase|remove|wipe)\b\s+my\b|\b(mera|meri|mere)\b.*\b(data|account|jankari)\b.*\b(delete|hata|mita)|(मेरा|मेरी|मेरे).*(डेटा|जानकारी).*(हटा|डिलीट|मिटा)/i],
  ["data_export", /\b(export|download|copy of)\b.*\bmy\b.*\b(data|information|history)\b|\bexport my\b/i],
  ["profile_correct", /\b(that'?s|this is|it'?s)\s+(wrong|incorrect|not right)\b|\bcorrect (it|that|my)\b|\bnot \d+\b.*\b(budget|score|percentage|marks)\b|\b(budget|score|percentage|marks) is\b.*\bnot\b/i],
  // vc-admin-control S6. navigate_steps first: "where do I see my saved careers" asks for a PAGE, not for the rows. Each rule needs a
  // site-shaped cue (a page word, "my saved/compare/assessment ...") so a KB question ("how can I find universities in Germany") stays search_kb.
  ["navigate_steps", QUEST_TASK_PATTERNS.selection],
  ["navigate_steps", QUEST_TASK_PATTERNS.compare],
  // tool-first T1 (S3): the Vidysea tool recipes ("best universities in Canada", "make my full journey", "how do I shortlist ..."). Each pattern is anchored at
  // both ends and shared with navigateSteps, so a message with any extra qualifier stays unmatched and reaches search_kb. Same tool name: no new tool.
  ...VIDYSEA_RECIPES.map((r): [StudentIntentTool, RegExp] => ["navigate_steps", r.pattern]),
  // T-057 R2: the platform's own services (loan, visa, test prep, scholarship, counselling, board recommender, consultant, journey map) are served by
  // navigate_steps from the stored catalogue. Two-stage tight match: SERVICE_ASK_RULES need an explicit ask aimed at Vidysea (or an imperative "help me with"),
  // a service noun, and then the END of the message (apart from punctuation, "please" and a generic "for study abroad"). Any other qualifier (for <country>,
  // requirements, fee, how long, between X and Y) leaves the message unmatched so it goes to the KB. No bare noun, subjectless or board/test-prep-only rule.
  ...SERVICE_ASK_RULES.map((re): [StudentIntentTool, RegExp] => ["navigate_steps", re]),
  ["navigate_steps", /\btake me to\b|\bnavigate (me )?to\b|\b(which|what) (page|screen|section|menu)\b|\b(where|how)\b.{0,30}\b(i|we)\b.{0,20}\b(find|see|get to|go to|open|view|access|reach)\b.{0,60}\b(page|section|menu|tab|screen|button|dashboard|settings|link|site|website|app|portal|pathlynks)\b|\bwhere (do|can|would) i (see|find|view|check|access) my (saved|compare|compared|assessment|profile|results?|shortlist|reports?)\b|\bwhere is the (\w+ ){0,2}(page|section|tab|menu|screen|button)\b/i],
  ["vidysea_profile_assessment", /\b(?:vidysea\b.{0,25}\b(?:profile )?assessment|(?:my|saved)\s+(?:ai )?profile\s+(?:assessment|classification))\b/i],
  ["vidysea_shortlisted_programmes", /\b(?:saved|shortlisted|bookmarked)\s+(?:programmes?|programs?|courses?|universities)\b/i],
  ...OWN_PROGRESS_RULES,
  ["vidysea_profile", /\bvidysea\b.{0,20}\b(profile|details|account|info)\b/i],
  ["pathlynks_saved_careers", /\b(saved|shortlisted|bookmarked|favou?rited?)\s+(careers?|pathways?)\b|\bcareers?\b.{0,30}\b(i|we|he|she|they|student\s+[\w-]+)\b.{0,15}\b(sav(e|ed)|shortlist(ed)?|bookmark(ed)?|favou?rite[d]?)\b|\b(i|we)\b.{0,15}\b(saved|shortlisted|bookmarked)\b.{0,20}\bcareers?\b/i],
  ["pathlynks_compare", /\b(my|the)\s+compar(e|ison)\s+(list|basket|tray)\b|\bcompar(e|ison) list\b|\bcareers?\b.{0,30}\b(i|we)\b.{0,15}\b(am|was|were)?\s*compar(ing|ed)\b/i],
  // T-057 (D-124 C4/C2): the student's own fit results and Combined Report. Each rule needs "me/my/I" (or Hinglish mere/mujhe) so a general
  // KB question ("which careers suit commerce students?") stays search_kb. On a Vidysea site the tool node answers from the synced snapshot.
  ["pathlynks_career_fit", /\b(which|what)\s+(careers?|fields?|streams?|jobs?|professions?|career (paths?|options?))\b.{0,40}\b(suits?|fits?|match(es)?|right for|good for|best for|suitable for)\b\s+(me|my (personality|traits|profile|results|strengths|interests))\b|\b(careers?|fields?|jobs?)\s+(that\s+)?(suits?|fits?|match(es)?)\s+me\b|\bmy\s+(career\s+)?(fit\s*scores?|career fit|career matches|top careers|top career areas|traits|personality traits|recommended careers|career recommendations)\b|\b(mere|mujhe)\b.{0,30}\b(careers?|field)\b.{0,30}\b(sahi|suit|fit|accha|best)\b|\b(careers?|field)\b.{0,30}\b(mere liye|mujhe)\b.{0,20}\b(sahi|suit|fit|accha|best)\b/i],
  ["pathlynks_report", /\bmy\s+(pathlynks|combined|assessment|career)\s+(combined\s+)?report\b(?!\s*(status|available|card))|\bmy\s+(strengths|areas? to (grow|improve)|weak(nesses|\s+areas))\b.{0,30}\b(report|pathlynks|assessment)\b|\b(report|pathlynks|assessment)\b.{0,30}\bmy\s+(strengths|areas? to (grow|improve)|weak(nesses|\s+areas))\b|\b(summari[sz]e|summary of|explain)\b.{0,20}\bmy\b.{0,20}\b(pathlynks|combined|assessment)\b.{0,15}\breport\b/i],
  ["pathlynks_assessment", /\bassessments?\b.{0,40}\b(status|done|complete[d]?|finish(ed)?|pending|results?|score|progress|taken|submitted)\b|\b(did|have)\s+i\b.{0,25}\b(complete[d]?|finish(ed)?|take|taken|do|done|submit(ted)?)\b.{0,25}\b(assessment|test|quiz)\b/i],
  ["pathlynks_profile", /\bpathlynks\b.{0,20}\b(profile|details|account|info)\b|\bmy\b.{0,10}\bpathlynks\b/i],
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
