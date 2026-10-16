/**
 * T-008 / contract B1 (no-script): every word the approval UI writes itself is here, as a LABEL.
 * The UI never composes a sentence for the counsellor to read aloud; every sentence on screen is
 * data (a fact value, a transcript quote, a drop reason, the draft summary). tests/ui.test.tsx
 * checks that each label is short, not script-like, and that no other text reaches the screen.
 */
export type UiLocale = "en" | "hi";
export const UI_LOCALE_COOKIE = "vc-ui-locale";

export const LABELS = {
  language: "Language",
  languageEnglish: "English",
  languageHindi: "हिन्दी",
  stateSessionProcessing: "Session processing",
  title: "Session approval",
  thread: "Thread",
  session: "Session",
  student: "Student",
  sectionFacts: "Proposed profile changes",
  sectionDropped: "Dropped facts",
  sectionSummary: "Draft session summary",
  sectionWritten: "Written facts",
  colFact: "Fact",
  colChange: "Change",
  colValue: "Proposed value",
  colBefore: "Current value",
  colEvidence: "Evidence",
  colTurn: "Turn",
  colConfidence: "Confidence",
  colSensitivity: "Sensitivity",
  colDecision: "Decision",
  colReason: "Reason",
  approve: "Approve",
  edit: "Edit",
  reject: "Reject",
  withhold: "Withhold",
  editedValue: "Edited value",
  rejectReason: "Reason (optional)",
  needsReview: "Needs review",
  summaryWithheldBefore: "Withheld before review",
  summaryApproved: "Summary approved",
  summaryWithheld: "Summary withheld",
  none: "None",
  decided: "Decided",
  submit: "Submit decisions",
  submitting: "Submitting",
  outcome: "Outcome",
  issues: "Issues",
  invalidNumber: "Not a number",
  stateLoading: "Loading",
  stateFenced: "Erasure in progress",
  stateInProgress: "Decision recorded, write pending",
  stateNotFound: "Thread not found",
  stateDone: "Resolved",
  stateAlreadyResolved: "Already resolved",
  stateInvalid: "Request refused",
  stateError: "Server error",
  sameDecision: "Same decision",
  otherDecision: "Other decision applied",
  reload: "Reload",
  // T-021 (D-020, contract B6 "runtime failover"): the "start a new session" demo flow and the
  // apologetic AI-unavailable error state + Retry.
  newSessionTitle: "New session",
  newSessionLinkHome: "Start a new session",
  sectionTranscript: "Session transcript",
  // T-021 fix cycle 1 (ISS-t-021-c0-1, B17): the transcript table used to reuse colValue ("Proposed
  // value") for plain conversation text — a label that means an AI-proposed fact everywhere else in
  // the product (the approval screen). This is its own, correctly-scoped label instead.
  colTranscriptText: "What was said",
  submitSession: "Submit for scribe review",
  stateAiUnavailable: "AI is unavailable right now",
  aiUnavailableApology: "Sorry for the trouble",
  aiUnavailableHint: "Nothing you typed is lost",
  retry: "Retry",
  stateSessionStarted: "Session submitted",
  openApprovalScreen: "Open the approval screen",
  // T-023 (ISS-t-020-c0-1, B17 persona walk): the reject-reason box silently stopped accepting
  // keystrokes at the character cap with no counter or message. These two labels back a live,
  // accessible counter (aria-live/aria-describedby) so a counsellor never loses typed text without
  // knowing why. Plain language, translatable (jaipur-counsellor / gaurav-bhaiya personas).
  rejectReasonRemaining: "Characters left",
  rejectReasonLimitReached: "Limit reached",
} as const;

/** UI-only dictionaries: student values, evidence and protocol enums are never rewritten. */
const HINDI_LABELS = {
  "language": "भाषा",
  "languageEnglish": "English",
  "languageHindi": "हिन्दी",
  "stateSessionProcessing": "सत्र पर कार्य जारी",
  "title": "सत्र स्वीकृति",
  "thread": "वार्ता",
  "session": "सत्र",
  "student": "विद्यार्थी",
  "sectionFacts": "प्रस्तावित प्रोफ़ाइल बदलाव",
  "sectionDropped": "हटाए गए तथ्य",
  "sectionSummary": "सत्र सारांश का मसौदा",
  "sectionWritten": "दर्ज तथ्य",
  "colFact": "तथ्य",
  "colChange": "बदलाव",
  "colValue": "प्रस्तावित मान",
  "colBefore": "मौजूदा मान",
  "colEvidence": "प्रमाण",
  "colTurn": "बारी",
  "colConfidence": "विश्वास स्तर",
  "colSensitivity": "संवेदनशीलता",
  "colDecision": "निर्णय",
  "colReason": "कारण",
  "approve": "स्वीकार करें",
  "edit": "बदलें",
  "reject": "अस्वीकार करें",
  "withhold": "रोकें",
  "editedValue": "बदला हुआ मान",
  "rejectReason": "कारण (वैकल्पिक)",
  "needsReview": "समीक्षा आवश्यक",
  "summaryWithheldBefore": "समीक्षा से पहले रोका गया",
  "summaryApproved": "सारांश स्वीकृत",
  "summaryWithheld": "सारांश रोका गया",
  "none": "कोई नहीं",
  "decided": "निर्णय लिए",
  "submit": "निर्णय भेजें",
  "submitting": "भेजा जा रहा है",
  "outcome": "परिणाम",
  "issues": "समस्याएँ",
  "invalidNumber": "मान्य संख्या नहीं",
  "stateLoading": "लोड हो रहा है",
  "stateFenced": "डेटा मिटाया जा रहा है",
  "stateInProgress": "निर्णय दर्ज, लेखन लंबित",
  "stateNotFound": "वार्ता नहीं मिली",
  "stateDone": "पूर्ण",
  "stateAlreadyResolved": "पहले ही पूर्ण",
  "stateInvalid": "अनुरोध अस्वीकृत",
  "stateError": "सर्वर त्रुटि",
  "sameDecision": "वही निर्णय",
  "otherDecision": "दूसरा निर्णय लागू",
  "reload": "फिर लोड करें",
  "newSessionTitle": "नया सत्र",
  "newSessionLinkHome": "नया सत्र शुरू करें",
  "sectionTranscript": "सत्र की बातचीत",
  "colTranscriptText": "क्या कहा गया",
  "submitSession": "समीक्षा के लिए भेजें",
  "stateAiUnavailable": "अभी एआई उपलब्ध नहीं",
  "aiUnavailableApology": "असुविधा के लिए क्षमा",
  "aiUnavailableHint": "लिखा हुआ सुरक्षित है",
  "retry": "फिर कोशिश करें",
  "stateSessionStarted": "सत्र भेजा गया",
  "openApprovalScreen": "स्वीकृति स्क्रीन खोलें",
  "rejectReasonRemaining": "शेष अक्षर",
  "rejectReasonLimitReached": "सीमा पूरी"
} satisfies Record<keyof typeof LABELS, string>;

const EN_ENUMS = {
  outcome: { written: "Written", refused: "Request refused", rejected: "Rejected", escalated: "Escalated", conflict: "Conflict", partial_conflict: "Partial conflict", extraction_failed: "Extraction failed", summary_failed: "Summary failed" },
  change: { add: "add", update: "update", remove: "remove" },
  sensitivity: { low: "low", medium: "medium", high: "high" },
  source: { kb: "kb", profile: "profile", "student-direct": "student-direct", "counsellor-edit": "counsellor-edit" },
  speaker: { student: "student", counsellor: "counsellor" },
} as const;
const HI_ENUMS = {
  outcome: { written: "दर्ज", refused: "अनुरोध अस्वीकृत", rejected: "अस्वीकृत", escalated: "सहायता को भेजा गया", conflict: "विरोध", partial_conflict: "आंशिक विरोध", extraction_failed: "तथ्य निकालने में त्रुटि", summary_failed: "सारांश में त्रुटि" },
  change: { add: "जोड़ें", update: "बदलें", remove: "हटाएँ" },
  sensitivity: { low: "कम", medium: "मध्यम", high: "अधिक" },
  source: { kb: "ज्ञान भंडार", profile: "प्रोफ़ाइल", "student-direct": "विद्यार्थी से", "counsellor-edit": "परामर्शदाता का बदलाव" },
  speaker: { student: "विद्यार्थी", counsellor: "परामर्शदाता" },
} satisfies { [G in keyof typeof EN_ENUMS]: Record<keyof typeof EN_ENUMS[G], string> };
const DICTIONARIES = {
  en: { labels: LABELS, enums: EN_ENUMS, metadata: { title: "Counsellor approval", description: "Vidysea counselling engine: scribe diff approval (T-008)" } },
  hi: { labels: HINDI_LABELS, enums: HI_ENUMS, metadata: { title: "परामर्श स्वीकृति", description: "विद्यार्थी परामर्श और सत्र समीक्षा" } },
};

export function normalizeUiLocale(input: unknown): UiLocale {
  return input === "hi" ? "hi" : "en";
}

export function getDictionary(locale: UiLocale) {
  return DICTIONARIES[normalizeUiLocale(locale)];
}
