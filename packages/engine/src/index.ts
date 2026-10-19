/**
 * Placeholder for the LangGraph.js StateGraph (ARCHITECTURE.md H1/H2, D-002).
 * No graph or LLM calls live here yet — this package exists so the
 * workspace shape (pnpm-workspace.yaml) is real ahead of the unit that builds
 * SignalExtractor / ExplorationPlanner / Verifier / ProfileSynthesizer.
 *
 * T-005 adds the two pieces of the "portable core" (H5/D-005) that don't need
 * a graph to exist: the skill loader (`skills/*.ts`) and the hard-rule code
 * guards (`guards/*.ts`) those future nodes will call.
 */
export function engineStatus(): string {
  return "@vc/engine: not yet implemented (scaffold only, see T-002)";
}

export * from "./skills/loader.js";
export * from "./guards/index.js";
export * from "./scribe/index.js";
export * from "./webhooks/index.js";

export * from "./cards/index.js";

// P1 U6 student turn graph (repair R9: re-exported for the API layer, U8).
export * from "./student/graph.js";
export * from "./student/claims.js";
export * from "./student/classify.js";
export * from "./student/rank.js";
// LK4 (D-105): language detection, allow-list and catalogs. The fixed texts moved to lang.ts and are re-exported by graph.js above.
export {
  CRISIS_MESSAGES,
  DEFAULT_REPLY_LANGS,
  FIXED_TEXTS,
  LANG_DETECT_SKILL,
  LANG_DETECT_TIMEOUT_MS,
  crisisMessageFor,
  createModelLanguageDetector,
  detectLanguageOffline,
  detectScript,
  fixedText,
  parseReplyLangs,
  resolveReplyLang,
  type CrisisCatalog,
  type CrisisEntry,
  type DetectedLanguage,
  type FixedTextKey,
  type FixedTexts,
  type LanguageDetector,
  type ModelLanguageDetectorOptions,
  type ReplyLang,
  type Script,
} from "./student/lang.js";
