/**
 * `@vc/db/testing`: the test-only entry point (T-007 cycle 1, low review item). Other packages'
 * tests import the driver-faithful fake (11000 on unique violations, pre-image findOneAndUpdate,
 * partial-filter validation) and the production INDEX_PLAN from here, instead of reaching into
 * packages/db/tests or packages/db/scripts by relative path.
 *
 * Production code must never import this subpath: the main entry (`@vc/db`, src/index.ts) does not
 * re-export it. Importing db-init.ts has no side effects (its main() only runs when executed directly).
 */
export * from "../tests/fakes.js";
export { INDEX_PLAN, type IndexSpec } from "../scripts/db-init.js";
