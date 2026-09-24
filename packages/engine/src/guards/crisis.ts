/**
 * Hard-rule code guard for contract B9 (crisis) — a distress or self-harm signal must route to an
 * escalation card before any generative call, deterministically, so a real signal can never be
 * missed because a model chose not to flag it (H5/D-005). Regex-only by design (ARCHITECTURE.md H5,
 * same honest-scope tradeoff as the ported source): false positives are the safe failure mode here.
 *
 * `crisisGuard`'s CRISIS_PATTERNS + REDIRECT_MESSAGE are ported as-is from
 * `D:/vidysea/ikigai-counsellor/src/services/crisis-guard.ts` (H6, reuse not rebuild) — English,
 * romanised Hindi/Hinglish, and abuse-signal patterns. CONCERN_PATTERNS is new here: ikigai's guard
 * only had a single crisis/no-crisis boolean; this engine adds a softer "concern" tier (academic
 * stress / hopelessness language that is not itself a self-harm or abuse signal) so the counsellor
 * gets a gentler nudge rather than either silence or the full crisis redirect.
 */

export type CrisisLevel = "none" | "concern" | "crisis";

export interface CrisisCheckResult {
  level: CrisisLevel;
  matched: string[];
}

export interface EscalationCard {
  type: "escalation";
  level: "concern" | "crisis";
  message: string;
  matched: string[];
}

export type RouteResult = { route: "escalate"; card: EscalationCard } | { route: "continue" };

// Ported verbatim from ikigai-counsellor's crisis-guard.ts (H6).
const CRISIS_PATTERNS: readonly RegExp[] = [
  // English — suicidal ideation / self-harm
  /\b(want|going|gonna|trying|wanna)\s+to\s+(die|kill myself|end (it|my life))\b/i,
  /\bkill\s+myself\b/i,
  /\bsuicid(e|al)\b/i,
  /\bno\s+(point|reason)\s+(in\s+)?(living|being alive)\b/i,
  /\bcan'?t\s+(go on|keep going|do this any ?more)\b/i,
  /\bend\s+(it\s+all|my\s+life)\b/i,
  /\b(cut|cutting|hurt|hurting|harm|harming)\s+myself\b/i,
  // Romanised Hindi (Hinglish) — common patterns
  /\b(marna|maut)\s+(chah|chahta|chahti|chahiye)\b/i,
  /\bjeene?\s+ka\s+(mann|man|dil|fayda)\s+(nahi|nahin|na|nai)\b/i,
  /\bkhud\s+ko\s+(khatam|maar|marne|mara|maarn)\w*\b/i,
  /\bzindagi\s+(khatam|bekaar|bekar|bekār)\b/i,
  /\bsab\s+kuch\s+khatam\b/i,
  // Abuse signals (more conservative — single keyword w/ context)
  /\b(beats|beating|hits|hitting)\s+me\b/i,
  /\bbeing\s+abused\b/i,
  /\b(mujhe|mere\s+saath)\s+(maarta|maarti|peetata|peet)\w*\b/i,
];

// New in this engine (not in ikigai's source) — softer distress language: stressed/hopeless/
// overwhelmed, but not itself a self-harm, suicide, or abuse signal. Deliberately narrower than the
// crisis list so ordinary frustration ("I'm dying to go to LSE") never lands here either.
const CONCERN_PATTERNS: readonly RegExp[] = [
  /\bi\s+feel\s+(so\s+)?(hopeless|worthless|empty)\b/i,
  /\bi\s+feel\s+like\s+giving\s+up\b/i,
  /\bnobody\s+(cares|understands|listens\s+to\s+me)\b/i,
  /\bi\s+can'?t\s+(take|handle)\s+(this|it)\s+anymore\b/i,
  /\bso\s+much\s+(pressure|stress)\s+i\s+can'?t\s+(cope|breathe)\b/i,
  /\bbahut\s+tension\s+(hai|ho\s+rahi\s+hai)\b/i,
  /\bmann\s+nahi\s+lag\s+raha\b/i,
];

const CRISIS_MESSAGE = [
  "Hey — what you just shared matters more than this session.",
  "I'd really like you to talk to someone who can help right now.",
  "iCALL is free, confidential, and trained for exactly this — you can call them at 9152987821 anytime.",
  "If you're in immediate danger, please call 112.",
  "Want to pause our session and pick it up another day? You're not alone.",
].join(" ");

const CONCERN_MESSAGE = [
  "This turn matched a distress signal — it's not an emergency-level flag, but worth a direct check-in.",
  "Ask the student how they're really doing before moving on to the next topic.",
  "iCALL (9152987821) is free and confidential if they want to talk to someone outside this session.",
].join(" ");

function matchAll(text: string, patterns: readonly RegExp[]): string[] {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

/**
 * Deterministic sweep over a single turn's text. Crisis-level patterns take priority over
 * concern-level ones — a turn that matches both is reported as "crisis" only, since that is the
 * severity the counsellor needs to act on.
 */
export function crisisGuard(text: string): CrisisCheckResult {
  if (!text || text.trim().length === 0) {
    return { level: "none", matched: [] };
  }

  const crisisMatches = matchAll(text, CRISIS_PATTERNS);
  if (crisisMatches.length > 0) {
    return { level: "crisis", matched: crisisMatches };
  }

  const concernMatches = matchAll(text, CONCERN_PATTERNS);
  if (concernMatches.length > 0) {
    return { level: "concern", matched: concernMatches };
  }

  return { level: "none", matched: [] };
}

/**
 * The hard-rule routing decision (contract B9): run this before any generative call. A distress or
 * self-harm signal short-circuits straight to an `EscalationCard` — the graph must not proceed with
 * the normal widen/challenge/compare/evidence flow in the same turn (see skills/safety-escalation).
 */
export function routeBeforeGeneration(text: string): RouteResult {
  const result = crisisGuard(text);
  if (result.level === "none") {
    return { route: "continue" };
  }

  const message = result.level === "crisis" ? CRISIS_MESSAGE : CONCERN_MESSAGE;
  return {
    route: "escalate",
    card: {
      type: "escalation",
      level: result.level,
      message,
      matched: result.matched,
    },
  };
}
