/**
 * `@vc/db/testing`: the test-only entry point (T-007 cycle 1, low review item). Other packages'
 * tests import the driver-faithful fake (11000 on unique violations, pre-image findOneAndUpdate,
 * partial-filter validation) and the production INDEX_PLAN from here, instead of reaching into
 * packages/db/tests or packages/db/scripts by relative path.
 *
 * Production code must never import this subpath: the main entry (`@vc/db`, src/index.ts) does not
 * re-export it. Importing db-init.ts has no side effects (its main() only runs when executed directly).
 */
import {
  approveErasure,
  confirmErasure,
  reconfirmErasure,
  type ErasureWorkflowConfig,
} from "./erasure.js";
import type { Db } from "mongodb";

export * from "../tests/fakes.js";
export { INDEX_PLAN, type IndexSpec } from "../scripts/db-init.js";


/**
 * T-029: a SYNTHETIC erasure workflow config for tests (never a real key or address). The key is 40
 * characters, above MIN_AUDIT_HMAC_KEY_LENGTH.
 */
export const TEST_ERASURE_CONFIG: ErasureWorkflowConfig = Object.freeze({
  auditHmacKey: "synthetic-test-audit-hmac-key-0123456789",
  autoDelete: false,
  approverEmail: "approver@synthetic.test",
});

/**
 * T-029: drives a pending request through the full gate (first confirmation, second confirmation
 * with the token, approver approval) so a test can then call executeErasure. `approvedBy` defaults
 * to "approver-1" (must differ from the requester and the confirmer).
 */
export async function confirmTwiceAndApprove(
  db: Db,
  input: { requestId: string; confirmedBy: string; approvedBy?: string; config?: ErasureWorkflowConfig },
): Promise<void> {
  const config = input.config ?? TEST_ERASURE_CONFIG;
  const { confirmToken } = await confirmErasure(db, { requestId: input.requestId, confirmedBy: input.confirmedBy });
  const res = await reconfirmErasure(db, { requestId: input.requestId, confirmedBy: input.confirmedBy, confirmToken }, config);
  if (res.status === "awaiting_approval") {
    await approveErasure(db, { requestId: input.requestId, approvedBy: input.approvedBy ?? "approver-1" });
  }
}
