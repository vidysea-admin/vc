/**
 * B4 (contract): a session cannot be processed without a recorded consent row
 * covering the purpose in question, and a minor's consent needs
 * guardianConsent. ConsentSchema (packages/schemas) already refuses to store
 * a minor consent row with guardianConsent: false at write time — this
 * read-time check is a second, independent gate for callers about to process
 * a session, and it also defends against a consent row that reached the
 * collection some other way (e.g. a migration) without going through
 * validateConsentForWrite.
 */
import type { Db } from "mongodb";
import { consentsCollection } from "./collections.js";

/**
 * ISS-043: ONE generic message for every refusal. The three causes (no row, purpose not
 * covered, minor without guardianConsent) used to produce three distinct messages, and the
 * guardianConsent one told an unconsented caller that the student is a minor. The message also
 * names neither the student nor the purpose, so it is safe to surface through an MCP tool error.
 * The cause is kept off the error object entirely; callers only ever need "refused".
 */
export const CONSENT_REQUIRED_MESSAGE =
  "ConsentRequiredError: no valid recorded consent covers this request (contract B4); it was not processed.";

export class ConsentRequiredError extends Error {
  constructor() {
    super(CONSENT_REQUIRED_MESSAGE);
    this.name = "ConsentRequiredError";
  }
}

/**
 * Throws ConsentRequiredError unless a consent row exists for `studentId`
 * that (a) lists `purpose` in its `purposes` array, and (b) if the student is
 * a minor, has `guardianConsent: true`. Resolves with no value otherwise.
 */
export async function requireConsent(db: Db, studentId: string, purpose: string): Promise<void> {
  const consent = await consentsCollection(db).findOne({ studentId });
  if (!consent) {
    throw new ConsentRequiredError();
  }
  if (!consent.purposes.includes(purpose)) {
    throw new ConsentRequiredError();
  }
  if (consent.minor && !consent.guardianConsent) {
    throw new ConsentRequiredError();
  }
}
