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
