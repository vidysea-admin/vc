/**
 * T-008 / contract B1 (no-script): every word the approval UI writes itself is here, as a LABEL.
 * The UI never composes a sentence for the counsellor to read aloud; every sentence on screen is
 * data (a fact value, a transcript quote, a drop reason, the draft summary). tests/ui.test.tsx
 * checks that each label is short, not script-like, and that no other text reaches the screen.
 */
export const LABELS = {
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
