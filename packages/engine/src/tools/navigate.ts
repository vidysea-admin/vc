/**
 * vc-admin-control VA14 (spec S6): the `navigate_steps` tool. Given the navigation catalogue (spec S4: the routes of the host site's app,
 * built at sync time, never read at chat time) and a free-text intent, it returns ordered TEXT steps and the routes they name.
 *
 *  - Every returned route is a path that is present in the supplied catalogue (and shaped like a same-site path). The intent text is only
 *    ever used to SCORE catalogue routes; no part of it is copied into an output step, so a hostile intent (an absolute URL, `../`,
 *    `javascript:`) can not make a step name anything outside the catalogue.
 *  - At most NAVIGATE_MAX_STEPS steps. An unknown intent, or an empty / missing / malformed catalogue, is the fixed
 *    NAVIGATE_UNKNOWN_TEXT with no routes, never an invented route.
 *  - Output is text only: this tool does not click or drive the host site.
 *  - T-057: a catalogue route may carry a `label` and `summary` (the platform's services, read at sync time). Those words add to the
 *    score, and a labelled target answers one line "name: purpose (path)". The copy is stored data, cleaned again here (no URL, tag or
 *    control character, e-mail address or bare domain), and only ever printed next to a path that is in the catalogue.
 *  - T-057 R2: a service intent needs a non-generic path or label hit ("study", "abroad", "student", ... never decide a page); otherwise the
 *    answer is the unknown text and the caller falls through to the KB. "What services do you offer" lists every labelled service.
 */

import type { NavCatalogue } from "../ingest/types.js";
import { hasExplicitLink } from "../student/lang.js";
// NavRoute / NavCatalogue live in ../ingest/types.ts (one definition; the package root exports them from there).
export type { NavRoute, NavCatalogue } from "../ingest/types.js";

export interface NavigateResult {
  steps: string[];
  routes: string[];
}

export const NAVIGATE_UNKNOWN_TEXT = "I don't know that page yet";
export const NAVIGATE_MAX_STEPS = 7;

// Observed task recipes, pinned to the 2026-10-27 successor plan. Update with new UI evidence.
export const NAV_TASK_RECIPE_VERSION = "pathlynks-quest/2026-10-27.1";
// Shared with classifyIntent so multilingual task requests reach this tool, not the KB.
export const QUEST_TASK_PATTERNS = {
  selection: /\bcareer[- ]selection\b|\bselect(?:ing)?\s+(?:my\s+)?careers?\b|\bcareers?\b.{0,35}\b(?:select|selection|chun(?:na|ne|u|o)?|chayan)\b|\b(?:select|chun(?:na|ne|u|o)?|chayan)\b.{0,25}\bcareers?\b|(?:करियर|कैरियर).{0,35}(?:चुन|चयन)|(?:चुन|चयन).{0,25}(?:करियर|कैरियर)/i,
  compare: /\bcareer[- ]compar(?:e|ison)\b|\bcompar(?:e|ing)\s+(?:(?:my|two|these|the)\s+)*careers?\b|\bcareers?\b.{0,25}\bcompar(?:e|ison)\b|(?:करियर|कैरियर).{0,25}(?:तुलना|कम्पेयर|कंपेयर)|(?:तुलना|कम्पेयर|कंपेयर).{0,25}(?:करियर|कैरियर)/i,
} as const;
const TASK_RECIPES = [
  { pattern: QUEST_TASK_PATTERNS.selection, path: "/career-quest/career-selection", steps: [
    "Open the Career Selection page (/career-quest/career-selection).",
    "In Top Picks For You, preview a career before deciding.",
    "Use Add to picks for the careers you choose, up to a maximum 5 picks.",
    "Rank your chosen picks in your preferred order.",
  ] },
  { pattern: QUEST_TASK_PATTERNS.compare, path: "/career-compare", steps: [
    "Open the Career Compare page (/career-compare).",
    "Choose a Category, then a Subcategory, then a Career.",
    "Repeat to include at least 2 careers, then use Compare.",
  ] },
  // D-134: guidance for a student with no Career Quest rows yet (steps from the pathlynks-inventory rows 6 and 8). Anchored/narrow so only an explicit
  // "career quest profile building" / "open career quest" ask resolves here; the pathlynks_goals / pathlynks_year_plan / pathlynks_quest_progress tools ask with a fixed string.
  { pattern: /\bcareer[- ]quest\b.{0,20}\bprofile[- ]building\b|\bprofile[- ]building\s+island\b/i, path: "/career-quest/profile-building", steps: [
    "Open the Profile Building page (/career-quest/profile-building).",
    "Add a goal.",
    "Log an activity, or tick a step in your year plan.",
  ] },
  { pattern: /^\s*(?:open\s+|go\s+to\s+|show\s+me\s+)?(?:the\s+)?career[- ]quest(?:\s+(?:hub|page|home))?[\s?.!]*$/i, path: "/career-quest", steps: [
    "Open Career Quest (/career-quest).",
    "Pick an unlocked island to start.",
  ] },
] as const;
export const NAVIGATE_LOCKED_TEXT = "That task is locked. Complete the required steps on the host site first.";

// ---------------------------------------------------------------------------
// tool-first T1 (spec S1-S4): Vidysea tool recipes. Label, purpose and steps are reviewed constants taken from the T-057 tool-first inventory
// (section 1); the student's text only SELECTS a recipe through its anchored pattern and is never copied into the output. A deep link is
// the recipe's base path plus `?section=<key>` where the key comes from the closed SECTION_KEYS list, never from the intent.
// ---------------------------------------------------------------------------
export const VIDYSEA_RECIPE_VERSION = "vidysea-tool-first/2026-10-29.1";
/** The `?section=` keys of the Vidysea student hub (`/student/journey-details`). Verified against the synced FE `STUDENT_SECTIONS` (tests/fixtures/student-sections.json, 2026-10-29): all 15 keys exist. */
export const SECTION_KEYS = [
  "dashboard", "market", "journey", "shortlisted", "compare", "comparisons", "favourites", "scholarships", "schpipeline", "applications", "visa",
  "tools", "documents", "docchecklist", "testreq",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface ToolRecipe {
  readonly id: string;
  readonly pattern: RegExp;
  readonly label: string;
  readonly purpose: string;
  /** Base route; must be in the synced catalogue for the recipe to fire. */
  readonly path: string;
  readonly section?: SectionKey;
  readonly auth: "public" | "student";
  /** 3-6 reviewed constants. */
  readonly steps: readonly string[];
  /** Replaces step `step` (0-based) with a reviewed template over a country NAME from the closed list below, when the student named exactly one. */
  readonly echoCountry?: { readonly step: number; readonly text: (country: string) => string };
}

// Pattern fragments. Every pattern is anchored at both ends (V_LEAD ... V_TAIL), so a message with any other qualifier stays unmatched and goes to the KB.
// No unbounded nested quantifier: repeated groups start with a literal word, and free-word slots are capped at two words.
const V_LEAD = String.raw`^\s*(?:(?:hi|hello|hey|ok|okay|so|also|and|btw)[,!.\s]+)*(?:(?:please|pls|plz|kindly)\s+)?`;
const V_TAIL = String.raw`(?:(?:\s*,\s*|\s+)(?:please|pls|plz|kindly|sir|mam|madam|bhai|yaar|thanks|thank\s+you))?[\s?.!,]*$`;
const V_CAN = String.raw`(?:(?:can|could|will|would)\s+you\s+(?:please\s+)?)?`;
const V_HELP = String.raw`(?:(?:help|assist)\s+me\s+(?:to\s+|in\s+)?)?`;
const V_WANT = String.raw`(?:(?:i\s+)?(?:want|need|wish|would\s+like)\s+to\s+)?`;
const V_HOW = String.raw`how\s+(?:(?:do|can|should|would)\s+i|to)\s+`;
const V_W = String.raw`[a-z][a-z'-]*`;
// route-fix-1: up to two place/subject slots ("for MBA in Germany"), each starting with a literal preposition and capped at two words, then one optional bounded budget
// slot ("with|under|within|in 20 lakh budget"): at most 3 digits and a closed unit list. The budget is matched, never captured, so it cannot reach a link or a reply.
const V_SLOT = String.raw`\s+(?:in|for|of|from|at)\s+(?:the\s+)?${V_W}(?:\s+${V_W})?`;
const V_BUDGET = String.raw`(?:\s+(?:with|under|within|in|below|upto|up\s+to)\s+(?:a\s+|an\s+)?(?:rs\.?\s?|inr\s?)?\d{1,3}(?:\.\d{1,2})?\s?(?:lakhs?|lacs?|crores?|cr|k)(?:\s+budget)?)?`;
const V_PLACE = String.raw`(?:${V_SLOT}){0,2}${V_BUDGET}`;
const V_ON = String.raw`(?:\s+(?:on|in|at|to)\s+(?:the\s+)?(?:vidysea|portal|platform|site|website|vault))?`;
const V_UNI = String.raw`(?:universit(?:y|ies)|colleges?)`;
const V_PROG = String.raw`(?:universit(?:y|ies)|colleges?|courses?|programmes?|programs?)`;
const V_DOCS = String.raw`(?:documents?|docs|certificates|transcripts|marksheets?)`;
const V_DEV = String.raw`[ऀ-ॿ]`;
const V_DEV_END = String.raw`[\s?.!।]*$`;
const anyOf = (...parts: string[]): RegExp => new RegExp(parts.map((p) => `(?:${p})`).join("|"), "i");

export const VIDYSEA_RECIPES: readonly ToolRecipe[] = [
  {
    id: "ai_finder",
    pattern: anyOf(
      String.raw`${V_LEAD}${V_CAN}${V_HELP}(?:choose|pick|select|decide|find|shortlist)\s+(?:a|the|my|which)\s+(?:(?:right|best|good|ideal|perfect)\s+)?(?:country|countries|university|universities|college|colleges)(?:\s+(?:for|that|which)\s+(?:me|suits?\s+me|fits?\s+me|matches?\s+me|my\s+(?:profile|budget|score|marks|preferences?|interests?)))?${V_TAIL}`,
      String.raw`${V_LEAD}(?:what|which)\s+country\s+(?:should\s+i\s+(?:choose|pick|select|go\s+to|apply\s+to|study\s+in)|is\s+(?:the\s+)?(?:best|right|good|better)\s+for\s+me|(?:would\s+)?suits?\s+me(?:\s+(?:the\s+)?best)?)${V_TAIL}`,
      String.raw`${V_LEAD}${V_CAN}(?:suggest|recommend|show|find|list|give)\s+(?:me\s+)?(?:some\s+|the\s+|best\s+)?${V_PROG}\s+(?:for|as\s+per|within|according\s+to|based\s+on|matching)\s+(?:me|my\s+(?:budget|profile|preferences?|score|marks|percentage|grades?|gpa|interests?))${V_TAIL}`,
      String.raw`${V_LEAD}${V_CAN}(?:(?:suggest|recommend|show|find|list|give)\s+(?:me\s+)?(?:some\s+|the\s+)?)?${V_UNI}\s+(?:in|within|under|as\s+per|for|according\s+to)\s+my\s+budget${V_TAIL}`,
      String.raw`${V_LEAD}(?:i\s+)?(?:want|wish|plan|would\s+like)\s+to\s+study\s+(?:(?:abroad|overseas)|(?:(?:abroad\s+)?(?:in|to)\s+(?:the\s+)?${V_W}(?:\s+${V_W})?))${V_TAIL}`,
      String.raw`${V_LEAD}(?:mere|meri|mera)\s+budget\s+(?:me|mein|ke\s+andar|ke\s+hisab\s+se|ke\s+hisaab\s+se)\s+${V_UNI}(?:\s+(?:batao|bataiye|dikhao|dikhaiye|chahiye|suggest\s+karo|dhundo))?${V_TAIL}`,
      String.raw`${V_LEAD}(?:mujhe\s+)?(?:kaun\s?si|kaunsi|konsi|kon\s?si)\s+country\s+(?:sahi|best|achi|acchi|theek)\s+(?:rahegi|hai|hogi|rahega)${V_TAIL}`,
      String.raw`^\s*(?:मुझे\s+)?(?:कौन\s*सा|कौनसा)\s+देश\s+(?:चुनना\s+चाहिए|सही\s+रहेगा|सही\s+है|बेहतर\s+है)${V_DEV_END}`,
    ),
    label: "AI University Finder",
    purpose: "Answer a few questions about your country, budget and subject to get ranked programmes that fit you.",
    path: "/ai-university-finder-study-abroad",
    auth: "public",
    steps: [
      "Open AI University Finder.",
      "Answer the preference questions about your country, budget and subject.",
      "Save your preferences.",
      "Open Recommendations to see the ranked programmes.",
      "Shortlist the programmes you like.",
    ],
  },
  {
    id: "university_search",
    pattern: anyOf(
      String.raw`${V_LEAD}${V_CAN}(?:(?:what|which)\s+(?:are|is)\s+(?:the\s+)?|(?:tell|show|give|suggest|recommend|list|find)\s+(?:me\s+)?(?:the\s+|some\s+)?)?(?:best|top|good|top[- ]ranked)\s+${V_UNI}${V_PLACE}${V_TAIL}`,
      String.raw`${V_LEAD}${V_CAN}${V_HELP}(?:find|search\s+for|look\s+for|shortlist|explore|show\s+me|suggest|recommend|list)\s+(?:me\s+)?(?:some\s+|the\s+|a\s+few\s+)?${V_PROG}${V_PLACE}${V_TAIL}`,
      String.raw`${V_LEAD}(?:mujhe\s+)?(?:(?:the\s+)?${V_W}(?:\s+${V_W})?\s+(?:ki|ke|mein|me)\s+)?(?:best|top|achi|acchi|achhi|badhiya)\s+${V_UNI}(?:\s+${V_W}(?:\s+${V_W})?\s+(?:mein|me))?(?:\s+(?:dikhao|dikhaiye|batao|bataiye|chahiye|suggest\s+karo|dhundo|dhoondo|find\s+karo|list\s+karo))?${V_TAIL}`,
      String.raw`${V_LEAD}(?:mujhe\s+)?(?:(?:the\s+)?${V_W}(?:\s+${V_W})?\s+(?:ki|ke|mein|me)\s+)?${V_UNI}\s+(?:dhundo|dhoondo|dhundna|dhundhna|find\s+karo|shortlist\s+karo|dikhao|dikhaiye|batao|bataiye|chahiye|suggest\s+karo)${V_TAIL}`,
      String.raw`^\s*(?:${V_DEV}+\s+){0,3}(?:सबसे\s+)?(?:अच्छी|अच्छे|बेस्ट|टॉप)\s+(?:यूनिवर्सिटी|यूनिवर्सिटीज|कॉलेज|कॉलेजेस|विश्वविद्यालय)(?:\s+${V_DEV}+){0,3}${V_DEV_END}`,
      String.raw`^\s*(?:${V_DEV}+\s+){0,2}(?:यूनिवर्सिटी|यूनिवर्सिटीज|कॉलेज)\s+(?:खोजो|ढूंढो|ढूँढो|खोजें|ढूंढें|दिखाओ|बताओ|चाहिए)${V_DEV_END}`,
    ),
    label: "University Explorer",
    purpose: "Search universities and programmes by country, subject and budget in plain words, then open a card for fees and details.",
    path: "/student/journey-details",
    section: "market",
    auth: "student",
    steps: [
      "Sign in and open University Explorer from the sidebar.",
      "Type your question in plain words, with the country and subject you care about.",
      "Open a university card to see its programmes, fees and intakes.",
      "Tick Compare, or use the star to shortlist the ones you like.",
    ],
    echoCountry: { step: 1, text: (country) => `Type your question in plain words, for example: best universities in ${country}.` },
  },
  {
    id: "shortlist",
    pattern: anyOf(
      String.raw`${V_LEAD}${V_HOW}shortlist\s+(?:a\s+|an\s+|the\s+|my\s+)?${V_PROG}${V_ON}${V_TAIL}`,
      String.raw`${V_LEAD}where\s+(?:(?:do|can|will|would)\s+i\s+(?:see|find|view|check|open)|(?:are|is))\s+my\s+shortlist(?:ed)?(?:\s+(?:programmes?|programs?|courses?|universities|colleges?))?${V_TAIL}`,
      String.raw`${V_LEAD}(?:open|take\s+me\s+to)\s+my\s+shortlist(?:ed)?(?:\s+(?:programmes?|programs?|courses?|universities|colleges?))?${V_TAIL}`,
    ),
    label: "Shortlisted",
    purpose: "Your saved programmes, with counsellor verification and priority.",
    path: "/student/journey-details",
    section: "shortlisted",
    auth: "student",
    steps: [
      "Find a programme in University Explorer or AI University Finder.",
      "Shortlist it from the programme card.",
      "Open Shortlisted from the sidebar.",
      "Send programmes for counsellor verification and set your priority.",
      "When a programme is verified you can generate its Journey Map.",
    ],
  },
  {
    id: "compare",
    pattern: anyOf(
      String.raw`${V_LEAD}${V_CAN}${V_HELP}${V_WANT}compare\s+(?:two\s+|2\s+|multiple\s+|different\s+|some\s+|a\s+few\s+)?${V_PROG}${V_TAIL}`,
      String.raw`${V_LEAD}${V_HOW}compare\s+(?:two\s+|2\s+|multiple\s+|different\s+|some\s+)?${V_PROG}${V_ON}${V_TAIL}`,
      String.raw`${V_LEAD}(?:(?:do|teen|2)\s+)?${V_PROG}\s+(?:ko\s+)?compare\s+(?:karna\s+hai|karo|karna|kaise\s+kare|kaise\s+karu|kaise\s+karein|karne\s+hain)${V_TAIL}`,
    ),
    label: "Compare",
    purpose: "Side-by-side comparison of programmes or colleges, with an AI summary.",
    path: "/student/journey-details",
    section: "compare",
    auth: "student",
    steps: [
      "Tick Compare on up to 6 cards in University Explorer.",
      "Open Compare from the sidebar.",
      "Review the table and the AI summary.",
      "Save the comparison to find it later under Saved Comparisons.",
    ],
  },
  {
    id: "journey_map",
    pattern: anyOf(
      String.raw`${V_LEAD}${V_CAN}${V_HELP}${V_WANT}(?:make|create|generate|build|prepare|start|get)\s+(?:me\s+)?(?:a\s+|an\s+|my\s+|the\s+|our\s+)?(?:(?:full|complete|whole|entire|detailed|personali[sz]ed|step[- ]by[- ]step)\s+)*(?:(?:study[- ]abroad|application|admission)\s+)?(?:journey(?:\s+map|\s+plan)?|roadmap|road\s+map|plan|timeline)(?:\s+for\s+(?:me|my\s+(?:studies|admission|application|study\s+abroad)))?${V_TAIL}`,
      String.raw`${V_LEAD}${V_HOW}(?:make|create|generate|build|get)\s+(?:a\s+|an\s+|my\s+|the\s+)?(?:(?:full|complete)\s+)*journey(?:\s+map)?${V_ON}${V_TAIL}`,
      String.raw`${V_LEAD}(?:mujhe\s+|mere\s+liye\s+)?(?:(?:mera|meri|mere|apna|apni)\s+)?(?:(?:full|poori|puri|pura|complete)\s+)?(?:journey(?:\s+map)?|roadmap|plan)\s+(?:bana\s+do|bana\s+dijiye|bana\s+dena|banao|banana\s+hai|banani\s+hai|generate\s+karo|create\s+karo|chahiye)${V_TAIL}`,
      String.raw`^\s*(?:(?:मेरी|मेरा|मेरे)\s+)?(?:पूरी\s+)?(?:जर्नी|रोडमैप|यात्रा)(?:\s+मैप)?\s+(?:बना\s+दो|बनाओ|बनाइए|बना\s+दीजिए)${V_DEV_END}`,
    ),
    label: "Journey Map",
    purpose: "A step-by-step plan from research to arrival for one programme, in five phases.",
    path: "/student/journey-details",
    section: "journey",
    auth: "student",
    steps: [
      "Shortlist the programme you want a journey for. A journey map is built per programme, and there is no single full journey for all of them.",
      "On the programme card press Generate Journey Map, then confirm your nationality and tests.",
      "Wait 60-120 seconds while the map is generated.",
      "Open Journey Map from the sidebar and pick a phase to see its milestones and dates.",
      "The Generate button on the Shortlisted page covers only counsellor-verified programmes, so ask for counsellor verification first.",
    ],
  },
  {
    id: "applications",
    pattern: anyOf(
      String.raw`${V_LEAD}${V_HOW}(?:start|begin|track|check|follow)\s+(?:an?\s+|my\s+|the\s+)?(?:(?:university|college)\s+)?applications?(?:\s+status)?${V_ON}${V_TAIL}`,
      String.raw`${V_LEAD}where\s+(?:do|can)\s+i\s+(?:track|see|check|find|view)\s+(?:my\s+)?(?:application\s+status|applications?(?:\s+status)?)${V_ON}${V_TAIL}`,
      String.raw`${V_LEAD}(?:open|take\s+me\s+to)\s+(?:the\s+|my\s+)?application\s+(?:status|tracker)${V_TAIL}`,
    ),
    label: "Application Status",
    purpose: "Start and track an application for each shortlisted programme.",
    path: "/student/journey-details",
    section: "applications",
    auth: "student",
    steps: [
      "Shortlist a programme and get it verified.",
      "Open Application Status from the sidebar.",
      "Press Start application on the programme.",
      "Use the Track status tab to follow it.",
    ],
  },
  {
    id: "visa",
    pattern: anyOf(
      String.raw`${V_LEAD}(?:where|how)\s+(?:do|can)\s+i\s+(?:track|manage|see|check|start|create|follow)\s+(?:my\s+)?visa(?:\s+(?:application|checklist|status|progress|process))?${V_ON}${V_TAIL}`,
      String.raw`${V_LEAD}(?:open\s+|show\s+me\s+|take\s+me\s+to\s+)?(?:my\s+|the\s+)?visa\s+(?:checklist|tracker|management|dashboard)${V_TAIL}`,
    ),
    label: "Visa",
    purpose: "A visa checklist and status for each application.",
    path: "/student/journey-details",
    section: "visa",
    auth: "student",
    steps: [
      "Start an application first.",
      "Open Visa from the sidebar.",
      "Create the visa application.",
      "Tick the checklist and record your biometrics and interview dates.",
    ],
  },
  {
    id: "favourites",
    pattern: anyOf(
      String.raw`${V_LEAD}where\s+(?:do|can)\s+i\s+(?:see|find|view|check|open)\s+(?:my\s+)?(?:favou?rites?|(?:favou?rite|hearted)\s+(?:universities|colleges?|courses?|programmes?|programs?))${V_TAIL}`,
      String.raw`${V_LEAD}where\s+(?:are|is)\s+my\s+(?:favou?rites?|favou?rite\s+(?:universities|colleges?|courses?|programmes?|programs?))${V_TAIL}`,
      String.raw`${V_LEAD}${V_HOW}(?:add|save|mark|heart)\s+(?:an?\s+|the\s+|this\s+)?(?:${V_PROG}\s+)?(?:to|as|in)\s+(?:my\s+)?favou?rites?${V_TAIL}`,
      String.raw`${V_LEAD}(?:open\s+|show\s+me\s+)?my\s+favou?rites?${V_TAIL}`,
    ),
    label: "Favourites",
    purpose: "The universities and courses you have hearted.",
    path: "/student/journey-details",
    section: "favourites",
    auth: "student",
    steps: [
      "Heart a university or course on its card.",
      "Open Favourites from the sidebar.",
      "Use Move to shortlist on any item you want to pursue.",
    ],
  },
  {
    id: "scholarships",
    pattern: anyOf(
      String.raw`${V_LEAD}(?:open\s+|show\s+me\s+|see\s+)?my\s+scholarships?(?:\s+(?:pipeline|list|tracker|status))?${V_TAIL}`,
      String.raw`${V_LEAD}${V_CAN}(?:find|suggest|recommend|show|give)\s+(?:me\s+)?(?:some\s+|the\s+|best\s+)?scholarships?\s+(?:for\s+me|as\s+per\s+my\s+profile|based\s+on\s+my\s+profile|matching\s+my\s+profile|for\s+my\s+profile)${V_TAIL}`,
      String.raw`${V_LEAD}(?:where|how)\s+(?:do|can)\s+i\s+(?:track|save|see)\s+(?:my\s+)?(?:saved\s+)?scholarships?(?:\s+(?:pipeline|status|suggestions))?${V_ON}${V_TAIL}`,
    ),
    label: "Scholarships",
    purpose: "AI scholarship suggestions that you can save and track.",
    path: "/student/journey-details",
    section: "scholarships",
    auth: "student",
    steps: [
      "Complete your profile and shortlist a programme.",
      "Open Scholarships from the sidebar and run the suggestions.",
      "Heart a scholarship to save it.",
      "Track its status in Scholarship Pipeline.",
    ],
  },
  {
    id: "documents",
    pattern: anyOf(
      String.raw`${V_LEAD}(?:(?:how|where)\s+(?:do|can)\s+i|how\s+to)\s+upload\s+(?:my\s+|the\s+|all\s+my\s+)?${V_DOCS}${V_ON}${V_TAIL}`,
      String.raw`${V_LEAD}${V_CAN}${V_HELP}${V_WANT}upload\s+(?:my\s+|the\s+|all\s+my\s+)?${V_DOCS}${V_TAIL}`,
      String.raw`${V_LEAD}(?:open\s+|show\s+me\s+|take\s+me\s+to\s+|where\s+is\s+)?(?:my\s+|the\s+)?document\s+(?:vault|checklist)${V_TAIL}`,
      String.raw`${V_LEAD}(?:mere\s+|apne\s+|meri\s+)?(?:documents?|docs)\s+upload\s+(?:kaise\s+(?:karu|karun|kare|karein)|karna\s+hai|karo)${V_TAIL}`,
    ),
    label: "Document Vault",
    purpose: "Upload your documents, answer counsellor requests and follow the checklist.",
    path: "/student/journey-details",
    section: "documents",
    auth: "student",
    steps: [
      "Open Document Vault from the sidebar.",
      "Upload each required document.",
      "Answer any counsellor document requests.",
      "Tick items off in the Document Checklist.",
    ],
  },
  {
    id: "test_requirements",
    pattern: anyOf(
      String.raw`${V_LEAD}(?:which|what)\s+tests?\s+(?:do\s+i\s+need|are\s+(?:needed|required)|should\s+i\s+take)\s+for\s+(?:my\s+)?(?:shortlisted|saved)\s+(?:programmes?|programs?|courses?|universities|colleges?)${V_TAIL}`,
      String.raw`${V_LEAD}(?:(?:where|how)\s+(?:do|can)\s+i\s+(?:see|find|check|view|open)|open|show\s+me|take\s+me\s+to)\s+(?:my\s+|the\s+)?test\s+(?:requirements|planner)${V_TAIL}`,
    ),
    label: "Test Requirements",
    purpose: "The tests each shortlisted programme needs, with your dates and scores.",
    path: "/student/journey-details",
    section: "testreq",
    auth: "student",
    steps: [
      "Shortlist your programmes first.",
      "Open Test Requirements from the sidebar.",
      "Choose the tests for each programme.",
      "Enter your test dates and scores.",
    ],
  },
  {
    id: "tools_library",
    pattern: anyOf(
      String.raw`${V_LEAD}(?:(?:open|show\s+me|take\s+me\s+to|where\s+is|where\s+are|where\s+can\s+i\s+find)\s+)?(?:the\s+|my\s+)?(?:tools?\s+library|student\s+tools)${V_TAIL}`,
      String.raw`${V_LEAD}(?:how\s+do\s+i\s+use|open|use|where\s+is|where\s+can\s+i\s+find|take\s+me\s+to|i\s+want\s+to\s+use|is\s+there)\s+(?:the\s+|a\s+|an\s+)?(?:sop\s+checker|gpa\s+calculator|cost\s+calculator|loan\s+estimator|visa\s+readiness(?:\s+checker)?|profile\s+strength(?:\s+checker)?|offer\s+comparison(?:\s+tool)?|pre-?departure\s+checklist|scholarship\s+finder|document\s+quality\s+checker)${V_TAIL}`,
    ),
    label: "Tools Library",
    purpose: "AI helpers such as the SOP checker, GPA calculator, cost calculator and loan estimator.",
    path: "/student/journey-details",
    section: "tools",
    auth: "student",
    steps: [
      "Open Tools Library from the sidebar.",
      "Pick a tool.",
      "Fill the form, which is prefilled from your profile where it can be.",
      "Run it, and the result is saved to your history.",
    ],
  },
];

/** Reviewed display names for the closed country list (spec S2). A name is echoed only when exactly one is named AND its `/country/<slug>` page is in the catalogue. */
const COUNTRIES: readonly { name: string; re: RegExp; slugs: readonly string[] }[] = [
  { name: "Canada", re: /\bcanada\b/i, slugs: ["canada"] },
  { name: "Australia", re: /\baustralia\b/i, slugs: ["australia"] },
  { name: "Germany", re: /\bgermany\b/i, slugs: ["germany"] },
  { name: "Ireland", re: /\bireland\b/i, slugs: ["ireland"] },
  { name: "France", re: /\bfrance\b/i, slugs: ["france"] },
  { name: "the Netherlands", re: /\b(?:netherlands|holland)\b/i, slugs: ["netherlands"] },
  { name: "New Zealand", re: /\bnew zealand\b/i, slugs: ["new-zealand"] },
  { name: "Singapore", re: /\bsingapore\b/i, slugs: ["singapore"] },
  { name: "the UK", re: /\b(?:uk|united kingdom|britain|england)\b/i, slugs: ["uk", "united-kingdom"] },
  { name: "the USA", re: /\b(?:usa|united states|america)\b/i, slugs: ["usa", "united-states"] },
];

function namedCountry(intent: string, paths: readonly string[]): string | undefined {
  const hits = COUNTRIES.filter((c) => c.re.test(intent));
  if (hits.length !== 1) return undefined;
  const c = hits[0]!;
  return c.slugs.some((s) => paths.includes(`/country/${s}`)) ? c.name : undefined;
}

/** Base path, plus `?section=<key>` only for a key of the closed list. Undefined (fail closed) for an unsafe path or an unknown key. */
function recipeLink(r: ToolRecipe): string | undefined {
  if (!isSafeRoute(r.path)) return undefined;
  if (r.section === undefined) return r.path;
  return (SECTION_KEYS as readonly string[]).includes(r.section) ? `${r.path}?section=${r.section}` : undefined;
}

/** "label: purpose (link)" then the numbered steps. All text is the recipe's constants (plus a closed-list country name). */
function recipeSteps(r: ToolRecipe, link: string, country: string | undefined): string[] {
  const steps = r.steps.map((s, i) => (r.echoCountry && country !== undefined && i === r.echoCountry.step ? r.echoCountry.text(country) : s));
  return [`${r.label}: ${r.purpose} (${link})`, ...steps.map((s, i) => `${i + 1}. ${s}`)];
}

const INTENT_MAX_CHARS = 500;
const ROUTE_MAX_CHARS = 200;
/** A same-site path: leading "/", segments of URL-safe characters only. No scheme, host, "//", "..", "%", "\" or ":". */
const SAFE_ROUTE = /^\/(?:[A-Za-z0-9._~@()[\]-]+(?:\/[A-Za-z0-9._~@()[\]-]+)*)?$/;

const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "for", "and", "or", "is", "are", "am", "i", "me", "my", "mine", "we", "our", "you", "your",
  "do", "does", "can", "could", "would", "should", "how", "where", "what", "which", "when", "show", "see", "view", "open", "go", "get", "take",
  "find", "want", "need", "like", "please", "page", "pages", "screen", "section", "tab", "menu", "link", "site", "website", "app", "portal",
  "navigate", "navigation", "steps", "way", "there", "here", "it", "this", "that", "with", "from", "by", "be", "so", "pathlynks", "vidysea",
]);

function isSafeRoute(path: unknown): path is string {
  return typeof path === "string" && path.length <= ROUTE_MAX_CHARS && SAFE_ROUTE.test(path) && !path.includes("..");
}

const stem = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

function intentTokens(intent: unknown): Set<string> {
  if (typeof intent !== "string") return new Set();
  const words = intent.slice(0, INTENT_MAX_CHARS).normalize("NFKC").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u);
  return new Set(words.filter((w) => w.length >= 2 && !STOPWORDS.has(w)).map(stem));
}

const isDynamic = (segment: string) => segment.startsWith("[");
const segmentsOf = (path: string) => path.split("/").filter(Boolean);

/** Match words of a route: its static segments, split on punctuation. The root route answers to "home". */
function routeTokens(path: string): Set<string> {
  const tokens = new Set<string>();
  const segs = segmentsOf(path);
  if (segs.length === 0) tokens.add("home");
  for (const seg of segs) {
    if (isDynamic(seg)) continue;
    for (const w of seg.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 2) tokens.add(stem(w));
  }
  return tokens;
}

function labelOf(path: string): string {
  const segs = segmentsOf(path);
  const last = segs.at(-1);
  if (last === undefined) return "Home";
  if (isDynamic(last)) return "Details";
  const words = last.replace(/[^A-Za-z0-9]+/g, " ").trim().toLowerCase();
  return words ? words.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : "Next";
}

/** Validated, de-duplicated catalogue paths in catalogue order. Anything that is not a safe same-site path is dropped. */
function usableRoutes(catalogue: unknown): string[] {
  const routes = (catalogue as { routes?: unknown } | null | undefined)?.routes;
  if (!Array.isArray(routes)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of routes) {
    const path = (r as { path?: unknown } | null | undefined)?.path;
    if (isSafeRoute(path) && !seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/** Words that ask for a service without naming one (after stemming); they only score when no topic word matches. */
const ASK_WORDS = new Set(["help", "assist", "assistance", "offer", "provide", "support", "service", "product", "have", "available"]);
/** Words that ask for the whole list of services ("what services do you offer"). */
const LIST_WORDS = new Set(["service", "offer", "provide", "product"]);
/** Words that appear in many service slugs and labels ("study-abroad", "students-studying-abroad"), so they never decide which service. */
const GENERIC_WORDS = new Set(["study", "studying", "abroad", "student", "overseas", "international", "education", "educational", "higher", "further", "global"]);
/** Topic words the stored copy spells differently: a test name is the test-preparation service, "counseling" is "counselling", and so on. */
const TOPIC_ALIASES: Record<string, readonly string[]> = {
  ielt: ["test", "preparation"], gre: ["test", "preparation"], gmat: ["test", "preparation"], toefl: ["test", "preparation"], pte: ["test", "preparation"],
  sat: ["test", "preparation"], duolingo: ["test", "preparation"], coaching: ["test", "preparation"], prep: ["preparation"],
  counseling: ["counselling"], counsellor: ["counselling"], counselor: ["counselling"],
  consultancy: ["consultant"], consultancie: ["consultant"],
};
const COPY_LABEL_MAX = 80;
const COPY_SUMMARY_MAX = 300;

const EMAIL = /[^\s@<>()"',;]+@[^\s@<>()"',;]+/g;

/**
 * T-057 R2: no link of any kind survives in stored copy. E-mail addresses go first; then every whitespace token that is a link by the
 * chat's own `hasExplicitLink` test (scheme, www., "daad.de", "ucas.com/apply", "daad[.]de") is dropped; and if the joined text still reads as
 * a link the whole copy is dropped (fail closed). Shared with the sync step (`applyServiceCopy`), so the same rule runs at sync and at print time.
 */
export function stripExplicitLinks(text: string): string {
  const kept = text
    .replace(EMAIL, " ")
    .split(/\s+/)
    .filter((tok) => tok !== "" && !tok.startsWith("/") && !tok.includes(":") && !hasExplicitLink(tok))
    .join(" ");
  return hasExplicitLink(kept) ? "" : kept;
}

/** Stored copy cleaned once more before it is shown or scored: tags, links, e-mail and control characters out, one line, capped. */
function cleanCopy(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return stripExplicitLinks(
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, max)
    .trim();
}

/** Label / summary of the catalogue routes (first entry per path wins), keyed by path. Routes without usable copy are absent. */
function routeCopy(catalogue: unknown): Map<string, { label: string; summary: string }> {
  const out = new Map<string, { label: string; summary: string }>();
  const routes = (catalogue as { routes?: unknown } | null | undefined)?.routes;
  if (!Array.isArray(routes)) return out;
  for (const r of routes) {
    const { path, label, summary } = (r ?? {}) as { path?: unknown; label?: unknown; summary?: unknown };
    if (!isSafeRoute(path) || out.has(path)) continue;
    const l = cleanCopy(label, COPY_LABEL_MAX);
    const s = cleanCopy(summary, COPY_SUMMARY_MAX);
    if (l !== "" || s !== "") out.set(path, { label: l, summary: s });
  }
  return out;
}

/** "name: purpose (path)": parentheses in the copy are dropped so the path stays the only bracket. */
function serviceLine(path: string, c: { label: string; summary: string }): string {
  const name = (c.label !== "" ? c.label : labelOf(path)).replace(/[()]/g, "");
  const purpose = c.summary.replace(/[()]/g, "");
  return purpose === "" ? `${name} (${path})` : `${name}: ${purpose} (${path})`;
}

const unknown = (): NavigateResult => ({ steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] });

/** route-fix-1: true when `text` is an ask for a recipe whose `auth` is "public" (answerable without a sign-in). Pure pattern test; the patterns are anchored and linear. */
export function isPublicRecipeAsk(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const bounded = text.slice(0, INTENT_MAX_CHARS).normalize("NFKC");
  return VIDYSEA_RECIPES.some((r) => r.auth === "public" && r.pattern.test(bounded));
}

/**
 * `opts.publicOnly` (route-fix-1, anonymous visitors): only recipes with `auth: "public"` can answer, from the same catalogue rules (base path must be synced,
 * not locked). The Pathlynks task recipes, every student-auth recipe and the free-text catalogue scoring are skipped, so an anonymous turn can never be handed a
 * signed-in page; anything else is the unknown result.
 */
export function navigateSteps(catalogue: NavCatalogue | null | undefined, intent: string, opts?: { readonly publicOnly?: boolean }): NavigateResult {
  const paths = usableRoutes(catalogue);
  if (paths.length === 0) return unknown();
  // A duplicate locked entry or a locked ancestor denies the target; never claim current UI state.
  const lockedPaths = new Set(catalogue?.routes.filter((r) => r?.locked === true && isSafeRoute(r.path)).map((r) => r.path));
  const isLocked = (path: string) => [...lockedPaths].some((p) => path === p || path.startsWith(p === "/" ? "/" : p + "/"));
  const boundedIntent = typeof intent === "string" ? intent.slice(0, INTENT_MAX_CHARS).normalize("NFKC") : "";
  const publicOnly = opts?.publicOnly === true;
  for (const recipe of publicOnly ? [] : TASK_RECIPES) {
    if (!recipe.pattern.test(boundedIntent)) continue;
    if (!paths.includes(recipe.path)) return unknown();
    if (isLocked(recipe.path)) return { steps: [NAVIGATE_LOCKED_TEXT], routes: [] };
    return { steps: [...recipe.steps], routes: [recipe.path] };
  }
  // tool-first T1: Vidysea tool recipes. The base path must be in the synced catalogue (otherwise unknown, never a guessed link).
  for (const recipe of VIDYSEA_RECIPES) {
    if (publicOnly && recipe.auth !== "public") continue;
    if (!recipe.pattern.test(boundedIntent)) continue;
    const link = recipeLink(recipe);
    if (link === undefined || !paths.includes(recipe.path)) return unknown();
    if (isLocked(recipe.path)) return { steps: [NAVIGATE_LOCKED_TEXT], routes: [] };
    return { steps: recipeSteps(recipe, link, recipe.echoCountry ? namedCountry(boundedIntent, paths) : undefined), routes: [link] };
  }
  if (publicOnly) return unknown();
  const want = intentTokens(intent);
  if (want.size === 0) return unknown();

  // A word in the path counts 3, in the label 2, in the summary 1, so a service's own words win over a passing mention.
  const copy = routeCopy(catalogue);
  const pick = (words: Set<string>, pathAndLabelOnly = false) => {
    let found: { path: string; score: number; depth: number } | undefined;
    for (const path of paths) {
      const have = routeTokens(path);
      const c = copy.get(path);
      const inLabel = c ? intentTokens(c.label) : new Set<string>();
      const inSummary = c ? intentTokens(c.summary) : new Set<string>();
      let score = 0;
      for (const w of words) score += have.has(w) ? 3 : inLabel.has(w) ? 2 : !pathAndLabelOnly && inSummary.has(w) ? 1 : 0;
      if (score === 0) continue;
      const depth = segmentsOf(path).length;
      if (!found || score > found.score || (score === found.score && depth < found.depth)) found = { path, score, depth };
    }
    return found;
  };
  // "do you help with loans": once the catalogue carries services, the ask words ("help", "offer", ...) and the generic words ("study", "abroad",
  // "student", ...) do not pick a page; the topic words do, and only through the page path or the label (a summary mention is not enough). A topic
  // that names no service is unknown (the caller goes to the KB), never the Help page. With no topic word left, "what services do you offer" lists
  // every labelled service, and anything else ("I need help") scores the whole intent as before.
  let best: { path: string; score: number; depth: number } | undefined;
  const topic = new Set([...want].filter((w) => !ASK_WORDS.has(w) && !GENERIC_WORDS.has(w)));
  if (topic.size > 0) {
    // Ask and generic words are stripped whenever a topic word exists, synced copy or not: an unsynced catalogue must not send "do you help with visa" to /help.
    const aliased = new Set(topic);
    for (const w of topic) for (const a of TOPIC_ALIASES[w] ?? []) aliased.add(a);
    best = pick(aliased, true);
    if (!best) return unknown();
  } else if (copy.size > 0 && [...want].some((w) => LIST_WORDS.has(w))) {
    const listed = paths.filter((path) => (copy.get(path)?.label ?? "") !== "" && !isLocked(path)).slice(0, NAVIGATE_MAX_STEPS);
    if (listed.length === 0) return unknown();
    return { steps: listed.map((path) => serviceLine(path, copy.get(path)!)), routes: listed };
  }
  best ??= pick(want);
  if (!best) return unknown();
  if (isLocked(best.path)) return { steps: [NAVIGATE_LOCKED_TEXT], routes: [] };

  // A target with catalogue copy (a platform service) is one line: "name: purpose (path)". Parentheses in the copy are dropped so the path stays the only bracket.
  const target = copy.get(best.path);
  if (target) return { steps: [serviceLine(best.path, target)], routes: [best.path] };

  // The chain: every catalogue route that is a path prefix of the target (the root is only the target itself), then the target.
  const inCatalogue = new Set(paths);
  const segs = segmentsOf(best.path);
  const chain: string[] = [];
  for (let i = 1; i < segs.length; i++) {
    const prefix = `/${segs.slice(0, i).join("/")}`;
    if (inCatalogue.has(prefix)) chain.push(prefix);
  }
  chain.push(best.path);
  const routes = chain.slice(-NAVIGATE_MAX_STEPS);

  const steps = routes.map((path, i) => {
    const page = `the ${labelOf(path)} page (${path})`;
    if (routes.length === 1) return `Open ${page}.`;
    if (i === 0) return `Open ${page}.`;
    return i === routes.length - 1 ? `Finally, open ${page}.` : `Then open ${page}.`;
  });
  return { steps, routes };
}
